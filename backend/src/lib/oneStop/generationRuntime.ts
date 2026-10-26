import crypto from "node:crypto";
import { db } from "@/utils/db";
import { requireDb } from "@/lib/agent/db";
import {
  getUserCatalog,
  quoteModel,
  selectCatalogModel,
  type CatalogModel,
  type ModelKind,
} from "@/lib/model-catalog";
import { getUserGatewayCredentials } from "@/lib/gateway/newapi";
import {
  trackedGatewayFetch,
  readBillingReceipt,
} from "@/lib/gateway/receipts";
import { getGatewayRequestContext } from "@/lib/gateway/context";
import {
  assertCurrentBudgetOpen,
  createModelBudget,
  claimModelBudget,
  stopModelBudget,
  readModelBudget,
} from "@/lib/gateway/budgets";
import {
  mediaQueue,
  registerMediaHandler,
} from "@/lib/workspace/mediaQueueRuntime";
import { DurableTasks } from "@/lib/workspace/tasks";
import type { MediaJob } from "@/lib/workspace/mediaQueue";
import Ai from "@/utils/ai";
import { BillingBudgetError } from "@/utils/billingBudgetPolicy";
import { quotaToPoints } from "@/utils/creditUnits";
import { withSecuritySchemaLock } from "@/utils/securitySchema";
import oss from "@/utils/oss";
import getPath from '@/utils/getPath';
import { renderMovie, tailFrame, motionClip,joinSpeech } from './mediaProduction';
import {speechPlan,nextSpeechStep} from './speechPlan';
import {assetImageGuidance,defaultShotVideoPrompt,imageStylePrompt} from '../../../../shared/oneStopPrompts';
import {sceneSpeechSource,voiceIds} from '../../../../shared/oneStopSpeech';
import { videoReferences, videoInputPolicy, imageReferenceLimit, storyboardInputs } from '../../../../shared/oneStopMedia';
import { readTextStream } from './textStream';
import {
  OneStopDocuments,
  OneStopError,
  encodeOneStopPayload,
} from "./documents";
import {
  GENERATION_PATH,
  generationRequest,
  generationSubmission,
  generationRejection,
  videoParameters,
  generationLabels,
  categories,
  modelKey,
  context,
  textInstruction,
  parseTextResult,
  applyResult,
  nextStep,
  shotTextProject,
  scenes,
  validateProject,
  type Project,
  type GenerationRequest,
} from "./generationPolicy";
const tasks = new DurableTasks<any>(db, "one-stop");
const documents = () => new OneStopDocuments(requireDb());
export const generationCapabilities = () => ({
  enabled: process.env.XOI_ONE_STOP_GENERATION_DISABLED !== "1",
  durableTasks: true,
  budgetHardLimit: false,
  serverComposition:true,
});
const ownerKey = (userId: number, id: string) => ({
  user_id: userId,
  collection: "comic",
  document_id: id,
});
let admissionsSchema: Promise<unknown> | undefined;
function ensureAdmissions() {
  return (admissionsSchema ??= withSecuritySchemaLock(db, async (trx) => {
    await trx.raw(
      `CREATE TABLE IF NOT EXISTS xoi_one_stop_admissions(user_id bigint NOT NULL,project_id varchar(160) NOT NULL,lease_token uuid NOT NULL,expires_at bigint NOT NULL,PRIMARY KEY(user_id,project_id))`,
    );
    await trx.raw(
      `CREATE TABLE IF NOT EXISTS xoi_one_stop_generation_history(user_id bigint NOT NULL,project_id varchar(160) NOT NULL,revision integer NOT NULL,task_id varchar(160) NOT NULL,operation varchar(32) NOT NULL,before_payload jsonb NOT NULL,created_at bigint NOT NULL,PRIMARY KEY(user_id,project_id,revision))`,
    );
  }).catch((e) => {
    admissionsSchema = undefined;
    throw e;
  }));
}
export async function initializeOneStopGenerationStore() {
  await ensureAdmissions();
}
const safeError = (e: unknown) =>
  e instanceof OneStopError || e instanceof BillingBudgetError
    ? e.message
    : "本步骤未完成，已停止后续调用；请查看原任务及积分回执，不要重复提交";
export async function activeProjectJob(userId: number, id: string) {
  const row = await db("xoi_generation_tasks")
    .where({ user_id: userId, kind: "one-stop" })
    .whereIn("status", ["queued", "running", "unknown"])
    .whereRaw("payload::jsonb->>'projectId' = ?", [id])
    .orderBy("updated_at", "desc")
    .first();
  return row ? { id: row.task_id, ...JSON.parse(row.payload) } : null;
}
async function catalogFor(
  userId: number,
  p: Project,
  request: GenerationRequest,
) {
  if(!categories(request.operation,p).length)return {catalog:{factor:1},models:[] as CatalogModel[]};
  const catalog = await getUserCatalog(userId),
    models = categories(request.operation,p).map((type) => {
      const name = p.models?.[modelKey(type)],
        model = name
          ? selectCatalogModel(catalog.models, name, type as ModelKind)
          : undefined;
      if (!model)
        throw new OneStopError(
          `请先选择当前账号可用的${type === "text" ? "文字" : type === "image" ? "图片" : type === "video" ? "视频" : "配音"}模型`,
        );
      return model;
    });
  return { catalog, models };
}
export async function generationQuote(userId: number, input: unknown) {
  if (!generationCapabilities().enabled)
    throw new OneStopError(
      "管理员暂时关闭了新生成请求，已有项目可继续读取与编辑",
      503,
    );
  const parsed = generationRequest.safeParse(input);
  if (!parsed.success) throw new OneStopError("生成参数无效");
  const request = parsed.data;
  if(['speech-part','speech-join'].includes(request.operation)||request.take!==undefined)throw new OneStopError('配音片段只能由服务器内部任务执行');
  const row = await documents().get(userId, "comic", request.projectId),
    p = row.payload as Project;
  validateProject(p);
  if(request.operation==='shots')shotTextProject(p,request);
  if(request.index!==undefined){
    const limit=request.operation==='shots'?Math.ceil(scenes(p).length/8):Number(p.outline?.episodes?.length||p.episodeCount);
    if(request.index>=limit)throw new OneStopError('本次集号或分镜批次超出项目范围，未提交模型请求');
  }
  const { catalog, models } = await catalogFor(userId, p, request);
  const videoModel=models.find(m=>m.type==='video');
  if(videoModel && p.videoChain==='serial' && !videoInputPolicy(videoModel).first)throw new OneStopError('当前视频模型不支持尾帧续接，请在项目设置切换模型或选择独立镜头；未提交模型请求');
  if(videoModel && p.videoInput==='text' && (p.videoChain==='serial'||!videoModel.mode.includes('text')))throw new OneStopError('纯提示词生成需要支持文字输入的模型和独立镜头模式，未提交请求');
  if(videoModel && p.videoInput!=='text' && /^seedance2\.[05]-(line1(?:-fast)?|full(?:-fast)?)(?:-xoi)?$/.test(videoModel.modelName))await publicMediaUrl('/oss/');
  const quotes = models.map((m) => {
    const video =
      m.type === "video" ? videoParameters(p, m, request) : undefined;
    const seconds = video?.duration || 5;
    const speech=request.operation==='speech'&&m.type==='audio'?speechPlan(p,request.target||'',m):undefined;
    const speechInputs=speech?speech.parts.filter(part=>request.replace||!speech.scene.speechParts?.some((x:any)=>x.key===part.key&&x.url)).map(x=>x.text):null;
    const quote = quoteModel(
      m,
      {
        seconds,
        resolution: video?.resolution || m.defaults.resolution,
        inputLength: context(p).length,
        outputTokens: 8192,
        n: 1,
        input: request.operation==='voice-sample'?request.prompt||'':scenes(p).find((s) => s.id === request.target)?.dialogue || "",
      },
      catalog.factor,
    );
    if(speechInputs){const segmentQuotes=speechInputs.map(input=>quoteModel(m,{input},catalog.factor));quote.points=segmentQuotes.reduce((sum,q)=>sum+q.points,0);quote.yuan=segmentQuotes.reduce((sum,q)=>sum+q.yuan,0);}
    if (!Number.isFinite(quote.points) || quote.points < 0)
      throw new OneStopError("没有可靠报价，本次不提交模型");
    return {
      model: m.modelName,
      name: m.name,
      kind: m.type,
      points: quote.points,
      yuan: quote.yuan,
    };
  });
  const free = models.every(
    (m) =>
      m.pricing.quota_type === 1 &&
      m.pricing.model_price === 0 &&
      !m.pricing.billing_expr,
  );
  return {
    request,
    automatic: true,
    revision: row.revision,
    label: generationLabels[request.operation],
    quotes,
    free,
    defaultPoints: free
      ? 0.001
      : Math.min(
          1000,
          Math.max(
            10,
            Math.ceil(
              quotes.reduce((s, q) => s + q.points, 0) *
                (request.operation === "autopilot" ? 20 : 2),
            ),
          ),
        ),
    maxCalls: 1000,
    minutes: 120,
    note: "按当前账号实际模型用量结算。今日消费提醒仅通知，不暂停任务；后台保留异常批量保护，已提交结果不会自动重发。",
  };
}
export async function submitGeneration(userId: number, input: any) {
  const parsed = generationSubmission.safeParse(input);
  if (!parsed.success)
    throw new OneStopError(
      "请提供有效的任务编号、项目版本与预算，不允许附加身份或模型字段",
    );
  input = parsed.data;
  const { request, clientId } = parsed.data;
  await mediaQueue.ensure();
  await ensureAdmissions();
  // Never keep a pooled transaction open across pricing network I/O or nested budget transactions.
  const leaseToken = crypto.randomUUID(),
    now = Date.now();
  const admitted = await db.raw(
    `INSERT INTO xoi_one_stop_admissions(user_id,project_id,lease_token,expires_at) VALUES (?,?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET lease_token=excluded.lease_token,expires_at=excluded.expires_at WHERE xoi_one_stop_admissions.expires_at<? RETURNING lease_token`,
    [userId, request.projectId, leaseToken, now + 10 * 60_000, now],
  );
  if (!admitted.rows.length)
    throw new OneStopError(
      "此项目正在确认或提交，请稍候并查看任务列表，不要重复点击",
      409,
    );
  try {
    const previous = await db("xoi_media_queue")
      .where({ kind: "one-stop", user_id: userId })
      .where('client_id','like',clientId + '#%')
      .first();
    if (previous) {
      const savedTask = await tasks.getForUser(previous.task_id,userId);
      const old = JSON.parse(previous.request || "{}");
      old.request ||= savedTask?.request;
      if (
        old.request &&
        JSON.stringify(old.request) !== JSON.stringify(request)
      )
        throw new OneStopError("任务编号已被其他操作使用", 409);
      return { id: previous.task_id, reused: true };
    }
    if (await activeProjectJob(userId, request.projectId))
      throw new OneStopError(
        "此项目已有运行中或待核对的任务，请先查看原任务，不能重复生成",
        409,
      );
    const quote = await generationQuote(userId, request);
    if (quote.revision !== input.revision)
      throw new OneStopError("项目或模型设置已变化，请重新查看费用", 409);
    if (quote.free && input.points !== 0.001)
      throw new OneStopError("免费任务只使用系统最小预算，无需填写收费额度");
    const budget = await createModelBudget(
      userId,
      GENERATION_PATH,
      input.points,
      quote.quotes.length === 1 ? quote.quotes[0].model : undefined,
      quote.free,
      quote.quotes.map((q) => q.model),
      input.automatic === true || quote.quotes.length===0,
      quote.quotes.length===0,
    );
    try {
      await claimModelBudget(userId, budget.id, GENERATION_PATH);
      const id = crypto.randomUUID();
      const task = await mediaQueue.enqueue(
        "one-stop",
        id,
        userId,
        budget.id,
        {
          request,
          revision: quote.revision,
          models: quote.quotes.map((q) => q.model),
          automatic: input.automatic === true,
          deadlineAt:Date.now()+12*60*60_000,
        },
        {
          projectId: request.projectId,
          operation: request.operation,
          request,
          label: quote.label,
          modelFree:quote.quotes.length===0,
          steps: [],
          progress: 0,
          limitPoints: input.automatic ? undefined : input.points,
        },
        clientId,
      );
      return { ...task, billingId: budget.id };
    } catch (e) {
      await stopModelBudget(userId, budget.id).catch(() => {});
      throw e;
    }
  } finally {
    await db("xoi_one_stop_admissions")
      .where({
        user_id: userId,
        project_id: request.projectId,
        lease_token: leaseToken,
      })
      .delete()
      .catch(() => {});
  }
}
async function references(userId: number, values: string[], requireUrl = false) {
  const out: { type: "image"; base64: string; url?:string }[] = [];
  for (const value of values.slice(0, 16)) {
    if (
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) &&
      value.length < 8 * 1024 * 1024
    ) {
      if(requireUrl) {
        const relative=`/one-stop/${userId}/${crypto.randomUUID()}.png`;
        // Verify and normalize browser uploads before exposing them to URL-only providers.
        const sharp=(await import('sharp')).default;
        await oss.writeFile(relative,await sharp(Buffer.from(value.split(',')[1],'base64'),{limitInputPixels:25_000_000}).resize(1600,1600,{fit:'inside',withoutEnlargement:true}).png().toBuffer());
        out.push({type:'image',base64:await oss.getImageBase64(relative),url:await publicMediaUrl('/oss'+relative)});
      } else out.push({ type: "image", base64: value });
      continue;
    }
    if (
      !new RegExp(
        `^/oss/(?:one-stop/${userId}/[a-f0-9-]+|canvas-files/${userId}/[a-f0-9]+|canvas/(?:image|video)/${userId}/[a-f0-9-]+)\\.(?:png|jpg|jpeg|webp)$`,
      ).test(value)
    )
      throw new OneStopError("参考图片不属于当前账号或已失效，请重新上传");
    out.push({
      type: "image",
      base64: await oss.getImageBase64(value.slice(5)),
      ...(requireUrl ? {url:await publicMediaUrl(value)} : {}),
    });
  }
  return out;
}
async function publicMediaUrl(value:string) {
  const base=process.env.XOI_PUBLIC_BASE_URL || process.env.ossURL;
  if(!base)throw new OneStopError('当前视频线路需要公网参考图；请管理员设置 XOI_PUBLIC_BASE_URL（网站 HTTPS 域名），未提交收费请求');
  const url=new URL(base);
  if(url.protocol!=='https:' || /^(localhost|127\.|0\.|10\.|192\.168\.|\[?::1\]?)/i.test(url.hostname) || url.username || url.password)throw new OneStopError('公网素材地址必须是可供上游访问的 HTTPS 域名');
  if(value==='/oss/')return url.origin+value; // Configuration preflight only, not a directory grant.
  return url.origin+await (await import('@/utils/privateMediaRuntime')).signedProviderMedia(value);
}
async function perform(
  userId: number,
  p: Project,
  r: GenerationRequest,
  models: CatalogModel[],
  onSubmitted: (id: string) => Promise<void>,
  onPartial?: (text:string)=>Promise<void>,
  onProgress?: (done:number,total:number)=>Promise<void>,
) {
  if (!generationCapabilities().enabled)
    throw new OneStopError("管理员已暂停后续生成，已成功的步骤保留", 503);
  const signal = getGatewayRequestContext()?.mediaQueue?.signal;
  signal?.throwIfAborted();
  if(r.operation==='speech-join'){
    const model=models.find(m=>m.type==='audio');if(!model)throw new OneStopError('配音模型未获授权');
    const plan=speechPlan(p,r.target!,model,r.take),urls=plan.parts.map(part=>plan.scene.speechParts?.find((x:any)=>x.key===part.key)?.url);
    if(urls.some(url=>!url))throw new OneStopError('尚有配音片段未完成，已生成部分保留');
    try{return {...await joinSpeech(getPath('oss'),userId,urls,signal),source:sceneSpeechSource(p,plan.scene)};}catch(e){throw new OneStopError((e as Error).message);}
  }
  if(r.operation==='motion-video'){
    const scene=scenes(p).find(s=>s.id===r.target);if(!scene?.imageUrl)throw new OneStopError('请先生成本镜分镜图');
    try{return await motionClip(getPath('oss'),userId,scene.imageUrl,p.ratio,Number(r.seconds??p.fixedShotSec??scene.videoSeconds??5),signal);}catch(e){throw new OneStopError((e as Error).message);}
  }
  if(r.operation==='render') {
    try{return await renderMovie(getPath('oss'),userId,p,signal,onProgress);}
    catch(e){throw new OneStopError((e as Error).message);}
  }
  const kind = categories(r.operation,p)[0],
    model = models.find(
      (m) => m.type === kind && m.modelName === p.models[modelKey(kind)],
    );
  if (!model) throw new OneStopError("本次模型未获授权");
  const credential = await getUserGatewayCredentials(userId);
  signal?.throwIfAborted();
  await assertCurrentBudgetOpen();
  // A custom style is private account data; never resolve another user's style by name.
  const styleRow=await db('xoi_one_stop_documents').where({user_id:userId,collection:'comic-styles'}).whereNull('deleted_at').whereRaw("payload->>'name' = ?",[p.style]).first('payload');
  const stylePayload=styleRow?.payload;
  const styleText=typeof stylePayload?.prompt==='string'&&stylePayload.prompt.trim()?`${p.style}（${stylePayload.prompt.trim().slice(0,4000)}）`:p.style;
  if (kind === "text") {
    // A whole season / hundreds of shots cannot safely fit in one output window.
    const textProject = r.operation==='script' && r.index!==undefined
      ? {...p,episodeCount:1,outline:p.outline?{...p.outline,episodes:[p.outline.episodes[r.index]]}:undefined,novel:p.novel?{chapters:[p.novel.chapters[r.index]]}:undefined,script:undefined}
      : r.operation==='shots' ? shotTextProject(p,r) : p;
    const response = await trackedGatewayFetch(
      `${credential.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.modelName,
          messages: [
            {
              role: "system",
              content: textInstruction(r.operation, textProject, r.index) + (r.operation==='script'&&r.index!==undefined?` 本次只生成全集第${r.index+1}集，不是整个系列。`:''),
            },
            { role: "user", content: context({...textProject,style:styleText}) },
          ],
          max_tokens: 8192,
          stream: r.operation==='novel',
        }),
        signal,
      },
    );
    if (!response.ok)
      throw new OneStopError(
        "模型服务未成功返回，本轮已停止，请查看积分回执",
        502,
      );
    if(r.operation==='novel' && response.headers.get('content-type')?.includes('text/event-stream')){
      try{return parseTextResult('novel',await readTextStream(response,onPartial || (async()=>{}),signal),p,r.index);}
      catch(e){throw new OneStopError((e as Error).message);}
    }
    const body: any = await response.json();
    if (
      body.choices?.[0]?.finish_reason &&
      body.choices[0].finish_reason !== "stop"
    )
      throw new OneStopError(
        "模型输出未完整结束，原内容已保留；请缩小集数或内容后再确认费用",
      );
    return parseTextResult(
      r.operation,
      String(body.choices?.[0]?.message?.content || ""),
      textProject,
      r.index,
    );
  }
  const scene = scenes(p).find((s) => s.id === r.target),
    asset = p.assets.find((a: any) => a.id === r.target);
  const name = `/one-stop/${userId}/${crypto.randomUUID()}`;
  if (kind === "image") {
    if (
      (r.operation === "asset-image" && !asset) ||
      (r.operation === "storyboard-image" && !scene)
    )
      throw new OneStopError("目标素材或镜头不存在");
    let prompt =
      r.prompt ||
      (asset
        ? `${asset.name}。${asset.description}`
        : `${scene.shotPrompt || scene.action}`);
    prompt+=`\n统一美术方向：${imageStylePrompt(p.style,stylePayload?.prompt?.slice(0,4000))}，无文字、无水印。`;
    if(asset)prompt+='\n'+assetImageGuidance(asset.kind);
    else prompt+=`\n${scene.shotSize||''}，${scene.camera||'固定机位'}，单幅电影分镜构图，画幅${p.ratio}。`;
    if(p.styleRefs?.length)prompt+='\n风格参考仅用于画风、配色与笔触，不复制其中的具体人物或物体；角色图用于身份服装，场景图用于空间布局。';
    const inputs=scene?storyboardInputs(p,scene.id,model):{images:[],description:''};
    if(inputs.description)prompt+='\n保持资产设定一致：\n'+inputs.description;
    // Asset images also use style references where the chosen model supports them.
    const refs=scene?inputs.images:(Array.isArray(p.styleRefs)?p.styleRefs:[]).slice(0,imageReferenceLimit(model));
    const result = await Ai.Image(`newapi:${model.modelName}`).run({
      prompt,
      size: "1K",
      aspectRatio: asset ? "1:1" : p.ratio,
      referenceList: await references(userId, refs),
    } as any);
    signal?.throwIfAborted();
    await result.save(name + ".png");
    return { url: "/oss" + name + ".png" };
  }
  if (!scene && r.operation !== "voice-sample")
    throw new OneStopError("目标镜头不存在");
  if (kind === "video") {
    let refs:ReturnType<typeof videoReferences>;
    try{refs=videoReferences(p,scene.id,model);}catch(e){throw new OneStopError((e as Error).message);}
    let values=refs.images;
    if(refs.previous){try{values=[await tailFrame(getPath('oss'),userId,refs.previous,signal)];}catch(e){throw new OneStopError((e as Error).message);}}
    const { duration, resolution } = videoParameters(p, model, r);
    let upstreamId: string | undefined;
    const result = await Ai.Video(`newapi:${model.modelName}`).run({
      prompt: (r.prompt || scene.videoPrompt || defaultShotVideoPrompt(p,scene,styleText)) + `\n统一美术方向：${styleText}。` + (refs.from ? '\n从输入首帧继续动作，保持人物、服装、光线与环境连续。' : refs.images.length>1 ? '\n第一张参考图为本镜构图，其余为出场角色定妆图，保持外观服装一致。' : ''),
      duration,
      resolution,
      aspectRatio: p.ratio,
      mode: model.mode,
      audio: model.audio,
      frameMode:videoInputPolicy(model).first?'first-frame':'reference',
      sendInputMode:!!model.paramSchema.mode?.enum?.includes('first-frame'),
      referenceList: await references(userId, values, /^seedance2\.[05]-(line1(?:-fast)?|full(?:-fast)?)(?:-xoi)?$/.test(model.modelName)),
      onSubmitted: async (id: string) => {
        upstreamId = id;
        await onSubmitted(id);
      },
    } as any);
    signal?.throwIfAborted();
    await result.save(name + ".mp4");
    return { url: "/oss" + name + ".mp4", upstreamId,chainFrom:refs.from };
  }
  const plan=r.operation==='speech-part'?speechPlan(p,r.target!,model,r.take):undefined;
  const part=plan?.parts[r.index??-1];if(plan&&!part)throw new OneStopError('配音片段编号无效');
  const allowed=voiceIds(model),picked=r.voice||p.voice,voice=part?.voice||(allowed.includes(picked)?picked:allowed[0]);
  if(!voice)throw new OneStopError('没有可用配音音色，未提交语音模型');
  const response = await trackedGatewayFetch(
    `${credential.baseUrl}/audio/speech`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.modelName,
        input: part?.text || (r.operation === "voice-sample" ? r.prompt : scene.dialogue),
        voice,
        response_format: "mp3",
      }),
      signal,
    },
  );
  if (!response.ok)
    throw new OneStopError("配音服务未成功返回，请核对费用", 502);
  const bytes = await readMediaBody(response, 32 * 1024 * 1024);
  await oss.writeFile(name + ".mp3", bytes.toString("base64"));
  return { url: "/oss" + name + ".mp3",...(part&&plan?{key:part.key,voice:part.voice,model:model.modelName,take:plan.take,planKeys:plan.parts.map(x=>x.key)}:{}) };
}
async function readMediaBody(response: Response, limit: number) {
  if (!response.body) throw new OneStopError("媒体文件为空");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit)
        throw new OneStopError("媒体文件超过本轮归档限制，请联系管理员");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!size) throw new OneStopError("媒体文件为空");
  return Buffer.concat(chunks);
}
async function commit(
  job: MediaJob,
  revision: number,
  p: Project,
  step: GenerationRequest,
  result: any,
) {
  const next = applyResult(p, step, result, crypto.randomUUID);
  next.log=[...(Array.isArray(p.log)?p.log:[]).slice(-199),`${new Date().toISOString()} ${generationLabels[step.operation]}${step.target?' · '+step.target:step.index!==undefined?' · 第 '+(step.index+1)+' 项':''} · 结果已保存`];
  if (job.body.request.operation === "autopilot" && step.operation!=='render') {
    const stage =
      step.operation === "shots" || step.operation === "storyboard-image"
        ? "storyboard"
        : step.operation === "asset-image"
          ? "assets"
          : step.operation === "scene-video" || step.operation==='motion-video' || step.operation==='speech'||step.operation==='speech-part'||step.operation==='speech-join'
            ? "video"
            : step.operation;
    next.stage = stage;
    next.status = "进行中";
    if (
      ["bible", "intent", "direction", "outline", "novel", "script"].includes(
        stage,
      )
    )
      next.done[stage] = true;
  }
  validateProject(next);
  const json = encodeOneStopPayload(p.id, next);
  await db.transaction(async (trx) => {
    const lease = await trx("xoi_media_queue")
      .where({
        kind: job.kind,
        task_id: job.taskId,
        user_id: job.userId,
        lease_token: job.leaseToken,
        worker_id: job.workerId,
        state: "running",
      })
      .forUpdate()
      .first();
    if (!lease || Number(lease.lease_until) <= Date.now())
      throw new OneStopError("执行租约已失效，结果待核对", 409);
    const updated = await trx("xoi_one_stop_documents")
      .where({ ...ownerKey(job.userId, p.id), revision })
      .whereNull("deleted_at")
      .update({
        payload: trx.raw("?::jsonb", [json]),
        revision: revision + 1,
        updated_at: Date.now(),
      });
    if (!updated)
      throw new OneStopError(
        "项目已被修改，生成结果未覆盖原项目，请查看任务结果",
        409,
      );
    // An explicit regeneration can replace a stage, but never destroys its recoverable prior version.
    const oldValue =
      step.operation === "asset-image"
        ? p.assets
        : step.operation === "shots" ||
            ["storyboard-image", "scene-video", "motion-video", "speech","speech-part","speech-join"].includes(
              step.operation,
            )
          ? p.script
          : step.operation === "direction"
            ? { direction: p.direction, directions: p.directions }
          : step.operation==='render' ? p.finalMovie : p[step.operation];
    await trx("xoi_one_stop_generation_history")
      .insert({
        user_id: job.userId,
        project_id: p.id,
        revision,
        task_id: job.taskId,
        operation: step.operation,
        before_payload: JSON.stringify({
          stage: p.stage,
          value: oldValue ?? null,
        }),
        created_at: Date.now(),
      })
      .returning("revision"); // Explicit key: this table has no legacy auto-increment id.
    const row = await trx("xoi_generation_tasks")
      .where({ kind: job.kind, task_id: job.taskId, user_id: job.userId })
      .forUpdate()
      .first();
    const task = JSON.parse(row.payload);
    const steps = [
      ...(task.steps || []),
      {
        operation: step.operation,
        target: step.target,
        index: step.index,
        at: Date.now(),
      },
    ];
    await trx("xoi_generation_tasks")
      .where({ id: row.id })
      .update({
        payload: JSON.stringify({
          ...task,
          steps,
          result,
          partialText: null,
          pendingStep: null,
          upstreamId: null,
          progress:
            job.body.request.operation === "autopilot"
              ? Math.min(95, steps.length * 4)
              : 95,
        }),
        updated_at: Date.now(),
      });
    // Only a fully committed artifact makes the next step safe to restart.
    // A crash during an upstream POST remains unknown and is never replayed.
    await trx('xoi_media_queue').where({id:lease.id}).update({
      dispatch_started_at:null,
      request:JSON.stringify({...job.body,revision:revision+1,completedSteps:Number(job.body.completedSteps||0)+1}),
      expires_at:Date.now()+10*60_000,
    });
    // Refresh only a still-open automatic workflow after a committed checkpoint.
    // User stops are never undone. A 12h overall/call-count fence still applies.
    if(job.body.automatic)await trx('xoi_model_budgets').where({user_id:job.userId,billing_id:job.billingId,automatic:true,state:'active',operation_path:GENERATION_PATH})
      .where('expires_at','>',new Date()).where('claimed_at','>',new Date(Date.now()-12*60*60_000)).update({expires_at:new Date(Math.min(Date.now()+2*60*60_000,job.body.deadlineAt||Infinity))});
  });
  return next;
}
registerMediaHandler("one-stop", async (job) => {
  const request = generationRequest.parse(job.body.request);
  let row = await documents().get(job.userId, "comic", request.projectId),
    p = row.payload as Project,
    revision = row.revision;
  if (revision !== job.body.revision)
    throw new OneStopError("排队期间项目版本已变化，本次未提交模型");
  const { models } = await catalogFor(job.userId, p, request);
  if (models.some((m) => !job.body.models.includes(m.modelName)))
    throw new OneStopError("模型设置变化，请重新确认预算");
  const completed=Number(job.body.completedSteps||0);
  let count = completed,
    submittedId: string | undefined;
  try {
    while (true) {
      let step: GenerationRequest | null =
        request.operation === "autopilot" ? nextStep(p) : request;
      if(request.operation==='script' && request.index===undefined)step=count<(p.outline?.episodes?.length||p.episodeCount)?{...request,index:count}:null;
      if(request.operation==='shots' && request.index===undefined && !request.target)step=count<Math.ceil(scenes(p).length/8)?{...request,index:count}:null;
      if (request.operation === "asset-images") {
        const a = p.assets.find((x: any) => !x.imageUrl);
        step = a
          ? { ...request, operation: "asset-image", target: a.id }
          : null;
      }
      if (request.operation === "storyboard-images") {
        const s = scenes(p).find((x) => !x.imageUrl);
        step = s
          ? { ...request, operation: "storyboard-image", target: s.id }
          : null;
      }
      if (request.operation === "scene-videos") {
        const s = scenes(p).find((x) => (x.imageUrl || (p.videoInput==='text'&&p.videoProduction!=='image-motion')) && (!x.videoUrl || x.videoStatus==='stale'));
        step = s
          ? { ...request, operation: p.videoProduction==='image-motion'?'motion-video':"scene-video", target: s.id }
          : null;
      }
      if(step?.operation==='speech'){
        const model=models.find(m=>m.type==='audio');if(!model)throw new OneStopError('配音模型未获授权');
        step=nextSpeechStep(p,step.target!,model,request.replace?job.taskId:undefined);
      }
      if (!step) break;
      if (count >= (job.body.automatic ? 1000 : request.operation==='speech'?65:20))
        throw new OneStopError(
          "本轮已达到调用次数保护，进度已保存；可以从已完成位置继续制作",
        );
      await tasks.set(job.taskId, {
        status: "running",
        current: generationLabels[step.operation],
        pendingStep: step,
        baseRevision: revision,
        upstreamId: null,
        partialText:null,
        error:null,
        recoveryRequired:false,
      });
      submittedId = undefined;
      let lastPartial=0;
      const result = await perform(
        job.userId,
        p,
        step,
        models,
        async (upstreamId) => {
          submittedId = upstreamId;
          await tasks.set(job.taskId, { status: "running", upstreamId });
        },
        async text=>{if(Date.now()-lastPartial<500)return;lastPartial=Date.now();await tasks.set(job.taskId,{status:'running',partialText:text});},
        async(done,total)=>{await tasks.set(job.taskId,{status:'running',current:`合成成片 ${done}/${total}`,progress:Math.round(done/total*95)});},
      );
      // Keep recoverable result even if the document CAS fails.
      await tasks.set(job.taskId, { status: "running", result });
      p = await commit(job, revision++, p, step, result);
      count++;
      job.body.completedSteps=count;
      if(request.operation==='speech'&&step.operation==='speech-join')break;
      if (
        ![
          "autopilot",
          "asset-images",
          "storyboard-images",
          "scene-videos",
          'speech',
          ...(request.index===undefined&&!request.target?['script','shots']:[]),
        ].includes(request.operation)
      )
        break;
    }
    await tasks.set(job.taskId, {
      status: "succeeded",
      progress: 100,
      current: "本轮制作完成",
      completedAt: Date.now(),
    });
  } catch (e) {
    const rejection = generationRejection(e, !!submittedId);
    if(!rejection)console.warn('[one-stop] 生成未完成',{taskId:job.taskId,operation:request.operation,httpStatus:(e as any)?.response?.status,method:(e as any)?.config?.method,code:(e as any)?.response?.data?.error?.code,hasUpstreamId:!!submittedId});
    const uncertain =
      (!rejection &&
        !(e instanceof OneStopError || e instanceof BillingBudgetError)) ||
      (e instanceof OneStopError && e.status === 409);
    const message = rejection || safeError(e);
    await tasks
      .set(job.taskId, {
        status: uncertain ? "unknown" : "failed",
        error: message,
        recoveryRequired: uncertain,
      })
      .catch(() => {});
    // Queue finalization must not replace the sanitized task error with raw provider details.
    throw new Error(message);
  }
});
export async function getGeneration(userId: number, id: string) {
  const task = await tasks.getForUser(id, userId);
  if (!task) throw new OneStopError("任务不存在", 404);
  return { id, ...task };
}
export async function listGenerations(userId: number, projectId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(projectId))
    throw new OneStopError("项目编号无效");
  const rows = await db("xoi_generation_tasks")
    .where({ kind: "one-stop", user_id: userId })
    .whereRaw("payload::jsonb->>'projectId' = ?", [projectId])
    .orderBy("updated_at", "desc")
    .limit(20);
  // 与 workspace/tasks.ts 的判定同源：queued/running 的队列租约已丢、或 unknown，
  // 视为「执行器已失联」——前端据此把无限转圈改成可操作的提示（停止/核对），而不是静默锁死。
  const leases = await db("xoi_media_queue")
    .where({ kind: "one-stop", user_id: userId })
    .whereIn(
      "task_id",
      rows.map((row) => row.task_id),
    )
    .select("task_id", "state", "lease_until");
  const leaseOf = new Map(leases.map((l) => [l.task_id, l]));
  return rows.map((row) => {
    const payload = JSON.parse(row.payload);
    const lease = leaseOf.get(row.task_id);
    const lost = payload.queueManaged
      ? row.status === "unknown" ||
        (row.status === "running" &&
          lease &&
          lease.state !== "queued" &&
          Number(lease.lease_until) <= Date.now())
      : ["running", "unknown"].includes(row.status) &&
        Date.now() - Number(row.updated_at) > 30 * 60 * 1000;
    return { id: row.task_id, ...payload, recoveryRequired: !!payload.recoveryRequired || lost };
  });
}
export async function stopGeneration(userId: number, id: string) {
  const task = await getGeneration(userId, id);
  await stopModelBudget(userId, task.billingId);
  return {
    message: "已停止后续调用；已提交的请求仍以原任务和积分回执为准，不自动退款",
  };
}
export async function generationReceipt(userId: number, id: string) {
  const task = await getGeneration(userId, id);
  if(task.modelFree || (task.status==='succeeded' && task.steps?.length && task.steps.every((step:any)=>['render','motion-video','speech-join'].includes(step.operation))))return {receipt:{billingId:task.billingId,status:'not_billable',quota:0,points:0,entries:[]},budget:await readModelBudget(userId,task.billingId)};
  const receipt = await readBillingReceipt(userId, task.billingId);
  return {
    receipt: { ...receipt, points: quotaToPoints(receipt.quota) },
    budget: await readModelBudget(userId, task.billingId),
  };
}

export async function acknowledgeGeneration(
  userId: number,
  id: string,
  confirmed: boolean,
) {
  if (!confirmed)
    throw new OneStopError("请先核对原任务与费用，再确认结束待核对状态");
  const task = await getGeneration(userId, id);
  if (task.status !== "unknown")
    throw new OneStopError("只有待核对任务可以人工确认结束");
  await stopModelBudget(userId, task.billingId);
  await db.transaction(async (trx) => {
    const q = await trx("xoi_media_queue")
      .where({ kind: "one-stop", task_id: id, user_id: userId })
      .forUpdate()
      .first();
    // 执行器只可能还在跑 = 队列行仍在排队/执行且租约未过期。一次不确定失败（上游 503/超时）后，
    // 队列行可能已被清扫成 failed 而任务停在 unknown；此时若仍要求队列必须是 unknown，
    // 用户会永远 409，工作区无法解锁（金钱语义由「不退款、以积分明细为准」保证，与队列行状态无关）。
    if (
      q &&
      ["queued", "running"].includes(q.state) &&
      Number(q.lease_until) > Date.now()
    )
      throw new OneStopError("原执行器尚未退出，请稍后再核对", 409);
    if (q && q.state !== "failed")
      await trx("xoi_media_queue")
        .where({ id: q.id })
        .update({ state: "failed", lease_until: null, request: "{}" });
    const row = await trx("xoi_generation_tasks")
      .where({
        kind: "one-stop",
        task_id: id,
        user_id: userId,
        status: "unknown",
      })
      .forUpdate()
      .first();
    if (!row) throw new OneStopError("任务状态已变化，请刷新", 409);
    await trx("xoi_generation_tasks")
      .where({ id: row.id })
      .update({
        status: "failed",
        updated_at: Date.now(),
        payload: JSON.stringify({
          ...JSON.parse(row.payload),
          status: "failed",
          acknowledgedAt: Date.now(),
          error: "已人工核对结束，不是退款；原任务费用仍以积分明细为准",
        }),
      });
  });
  return { acknowledged: true };
}

/** Read/retrieve an existing video only. Never sends a billable POST or retries creation. */
export async function recoverGeneration(userId: number, id: string) {
  const task = await getGeneration(userId, id);
  if (task.status === "succeeded") return task.result;
  if (
    task.status !== "unknown" ||
    !task.upstreamId ||
    task.pendingStep?.operation !== "scene-video"
  )
    throw new OneStopError("本任务没有可查询的视频上游编号；不会重新生成");
  const queue = await db("xoi_media_queue")
    .where({ kind: "one-stop", task_id: id, user_id: userId })
    .first();
  // 与 acknowledge 同理：队列行可能已被清扫成 failed 而任务仍是 unknown，只拦「执行器还活着」的情况。
  if (
    queue &&
    ["queued", "running"].includes(queue.state) &&
    Number(queue.lease_until) > Date.now()
  )
    throw new OneStopError("原执行器尚未退出，请稍后再查询", 409);
  const credential = await getUserGatewayCredentials(userId),
    url = `${credential.baseUrl}/videos/${encodeURIComponent(String(task.upstreamId))}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${credential.apiKey}` },
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok)
    throw new OneStopError(
      "原任务暂时无法查询，请稍后再试；没有重发生成请求",
      502,
    );
  const raw: any = await response.json(),
    status = raw.status || raw.data?.status;
  if (!["completed", "succeeded", "success"].includes(status))
    return {
      pending: true,
      message: "原视频尚未完成或需人工核对；没有重发生成请求",
    };
  const content = await fetch(url + "/content", {
    headers: { Authorization: `Bearer ${credential.apiKey}` },
    signal: AbortSignal.timeout(120000),
    redirect: "error",
  });
  if (!content.ok || !content.body)
    throw new OneStopError(
      "视频已完成但文件暂未取回，请稍后再查；不会重新生成",
      502,
    );
  const reader = content.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 256 * 1024 * 1024)
        throw new OneStopError("视频超过256MB，需管理员协助归档");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const relative = `/one-stop/${userId}/${crypto.randomUUID()}.mp4`;
  await oss.writeFile(relative, Buffer.concat(chunks));
  const result = { url: "/oss" + relative, upstreamId: task.upstreamId };
  await db.transaction(async (trx) => {
    const q = await trx("xoi_media_queue")
      .where({
        kind: "one-stop",
        task_id: id,
        user_id: userId,
      })
      .whereIn("state", ["unknown", "failed"])
      .forUpdate()
      .first();
    if (!q) throw new OneStopError("任务状态已变化，请刷新", 409);
    const row = await trx("xoi_one_stop_documents")
      .where(ownerKey(userId, task.projectId))
      .whereNull("deleted_at")
      .forUpdate()
      .first();
    if (!row || row.revision !== task.baseRevision)
      throw new OneStopError(
        "项目版本已变化，视频已归档但未覆盖项目，请联系管理员核对",
        409,
      );
    const p = applyResult(
        row.payload,
        task.pendingStep,
        result,
        crypto.randomUUID,
      ),
      json = encodeOneStopPayload(task.projectId, p);
    await trx("xoi_one_stop_documents")
      .where(ownerKey(userId, task.projectId))
      .update({
        payload: trx.raw("?::jsonb", [json]),
        revision: row.revision + 1,
        updated_at: Date.now(),
      });
    await trx("xoi_generation_tasks")
      .where({ kind: "one-stop", task_id: id, user_id: userId })
      .update({
        status: "succeeded",
        updated_at: Date.now(),
        payload: JSON.stringify({
          ...task,
          status: "succeeded",
          result,
          progress: 100,
          recoveredAt: Date.now(),
        }),
      });
    await trx("xoi_media_queue")
      .where({ id: q.id })
      .update({ state: "succeeded" });
  });
  return result;
}
