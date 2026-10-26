"use client";
// AI 漫剧工作台：左侧创作路径（9 阶段）+ 当前阶段面板；自动托管模式一键连跑
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, History, ImagePlus, Loader2, Play, Settings2, Square, TerminalSquare, X } from "lucide-react";
import { toast } from "sonner";
import { GenerationPanel, runProjectGeneration } from "../adapters/generation";
import {useActionConfirmation} from '../adapters/action-confirmation';
import {HistoryDialog} from './history-dialog';
import {videoInputPolicy} from '../../../../../shared/oneStopMedia';
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ModelPicker } from "@/components/ui/model-picker";
import { PillSelect } from "@/components/ui/select";
import { useCollection } from "@/lib/store-local";
import { useCatalog } from "@/lib/queries";
import { defaultChatModel, defaultImageModel, defaultSpeechModel, defaultVideoModel, isSpeechModel } from "@/lib/llm";
import { cn } from "@/lib/utils";
import { validOf, voiceLibraryOf, voicesOf } from "@/lib/voices";
import { mfVideoCaps } from "../multiframe/video-caps";
import { durationsOf, imageRefCap, resolutionOf, shotSeconds, specOfResolution, videoBillParams } from "./caps";
import { defaultVideoPrompt, extractAssets, extractIntent, generateAssetImage, generateBible, generateOutline, generateSceneVideo, generateScript, generateStoryboard, proposeDirections, sceneCountFor, writeNovelChapter, writeShotPrompts } from "./pipeline";
import { shrinkImage } from "./video-kit";
import { AssetsStep, ScriptStep, StoryboardStep, VideoStage } from "./steps";
import { BibleStage, DirectionStage, InputStage, IntentStage, NovelStage, OutlineStage } from "./stages-text";
import type { Save, StepProps } from "./stage-kit";
import { SegButtons } from "./ui";
import { RatioPicker, RegionPicker, StrategyPicker, StylePicker } from "./pickers";
import { COMIC_SCHEDULES, COMIC_SPECS, STAGE_DEFS, VOICES, allScenes, episodeTargetSec, fmtDuration, hasStageData, invalidateAfter, laterStagesWithData, migrateProject, normalizeAfterReload, patchScene, projectProgress, stagePath, type ComicProject, type ComicSchedule, type ComicSpec, type StageKey } from "./types";

const PANELS: Record<StageKey, (props: StepProps) => React.ReactElement> = { bible: BibleStage, input: InputStage, intent: IntentStage, direction: DirectionStage, outline: OutlineStage, novel: NovelStage, script: ScriptStep, assets: AssetsStep, storyboard: StoryboardStep, video: VideoStage };

export function ComicWorkspace({ id }: { id: string }) {
  const ask=useActionConfirmation();
  const [viewStage,setViewStage]=useState<StageKey|null>(()=>{
    const key=new URLSearchParams(window.location.hash.split('?')[1]||'').get('stage');
    return key&&key in STAGE_DEFS?key as StageKey:null;
  });
  const col = useCollection<ComicProject>("comic");
  const { data } = useCatalog();
  const [p, setP] = useState<ComicProject | null>(null);
  const ref = useRef<ComicProject | null>(null);
  // Do not write defaults before the server has reported whether an old task owns this project.
  const generationLocked=useRef(true);
  const [generationKnown,setGenerationKnown]=useState(false);
  const [localBusy, setBusy] = useState(false);
  const [generationBusy, setGenerationBusy] = useState(true);
  const busy=localBusy||generationBusy;
  const [settings, setSettings] = useState(false); const [logOpen, setLogOpen] = useState(false);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [batch, setBatch] = useState<string | null>(null); const batchCtl = useRef<AbortController | null>(null);
  const warnedAt = useRef(0);
  const modelOf = useCallback((id?: string) => (id ? data?.models.find((m) => m.id === id) : undefined), [data]);
  // 当前视频线路的能力：时长档、清晰度、首帧还是参考图（目录没加载时为空，按老逻辑走）
  const vm = modelOf(p?.models.video);
  const vcaps = useMemo(() => (vm ? mfVideoCaps(vm) : undefined), [vm]);
  const im = modelOf(p?.models.image);
  // 配音模型与它认的音色：海螺等线路只认自己的音色 id，项目里存的 alloy 发过去会「音色不存在」
  const speechModel = useMemo(() => { const ms = (data?.models ?? []).filter(isSpeechModel); return ms.find((m) => m.id === p?.models.audio) ?? ms[0]; }, [data, p?.models.audio]);

  /** Queue an acknowledged cloud write; shell reports pending/error separately. */
  const persist = useCallback((next: ComicProject) => { col.upsert(next); }, [col]);
  const save = useCallback<Save>((fn) => { const cur = ref.current; if (!cur) throw new Error("项目未加载"); if(generationLocked.current)return cur; const next = fn(cur); ref.current = next; setP(next); persist(next); return next; }, [persist]);
  const get = useCallback(() => { if (!ref.current) throw new Error("项目未加载"); return ref.current; }, []);
  // Local helpers stop on unmount. Authorized durable jobs continue on the server within their budget.
  useEffect(() => () => { batchCtl.current?.abort(); }, []);

  const runBatch = async <T,>(label: string, items: T[], fn: (item: T, signal: AbortSignal) => Promise<boolean>) => {
    if (batchCtl.current || generationLocked.current) { toast.info("已有任务在运行"); return; }
    const ctl = new AbortController(); batchCtl.current = ctl; setBusy(true);
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < items.length && !ctl.signal.aborted; i++) {
        setBatch(`${label} ${i + 1}/${items.length}`);
        try { if (await fn(items[i], ctl.signal)) ok++; else fail++; } catch { fail++; }
      }
    } finally { batchCtl.current = null; setBatch(null); setBusy(false); }
    if (ctl.signal.aborted) toast.info(`已停止${label}：完成 ${ok} 项${fail ? `，失败 ${fail} 项` : ""}`);
    else if (fail) toast.error(`${label}结束：成功 ${ok} 项，失败 ${fail} 项（失败的可单独重试）`);
    else toast.success(`${label}完成，共 ${ok} 项`);
  };

  useEffect(() => {
    if (ref.current) return;
    const raw = col.get(id); if (!raw) return;
    let n = normalizeAfterReload(migrateProject(raw));
    // 迁移 / 异常后当前阶段不可达时，退回到最后一个可达阶段
    const path = stagePath(n.kind);
    const reach = (i: number) => i === 0 || !!n.done[path[i - 1]] || hasStageData(n, path[i]);
    if (!path.includes(n.stage) || !reach(path.indexOf(n.stage))) { let i = 0; while (i + 1 < path.length && reach(i + 1)) i++; n = { ...n, stage: path[i] }; }
    ref.current = n; setP(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, col.items.length]);
  // 默认模型补齐
  useEffect(() => {
    if (!p || !data?.models || !generationKnown || generationBusy) return;
    const m = p.models; const next = { chat: m.chat ?? defaultChatModel(data.models)?.id, image: m.image ?? defaultImageModel(data.models)?.id, video: m.video ?? defaultVideoModel(data.models)?.id, audio: m.audio && data.models.some((x) => x.id === m.audio && isSpeechModel(x)) ? m.audio : defaultSpeechModel(data.models)?.id };
    if (next.chat !== m.chat || next.image !== m.image || next.video !== m.video || next.audio !== m.audio) save((c) => ({ ...c, models: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, data,generationKnown,generationBusy]);

  // 换了配音模型（或老项目的音色这个模型不认）时，把默认音色换成该模型的第一个合法音色并存下来
  useEffect(() => {
    if (!p || !speechModel || !generationKnown || generationBusy) return;
    const v = validOf(voicesOf(speechModel), p.voice, undefined);
    if (v && v !== p.voice) save((c) => ({ ...c, voice: v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechModel, p?.voice,generationKnown,generationBusy]);

  const path = useMemo(() => stagePath(p?.kind), [p?.kind]);
  const viewIndex=viewStage?path.indexOf(viewStage):-1;
  const activeStage=viewStage && viewIndex>=0 && p && (viewIndex===0||p.done[path[viewIndex-1]]||hasStageData(p,viewStage)) ? viewStage : p?.stage ?? path[0];
  const idx = path.indexOf(activeStage);
  const reachable = useMemo(() => path.map((k, i) => !!p && (i === 0 || !!p.done[path[i - 1]] || hasStageData(p, k))), [p, path]);
  // Browsing never changes the durable generation cursor or writes a cloud document.
  const goto = (key: StageKey) => {
    const i=path.indexOf(key);
    if(i<0)return;
    if(!reachable[i]){toast.info(`请先完成并确认「${STAGE_DEFS[path[i-1]].label}」，再进入${STAGE_DEFS[key].label}`);return;}
    setViewStage(key);
  };
  const log = (line: string) => save((c) => ({ ...c, log: [...c.log.slice(-199), `${new Date().toLocaleTimeString("zh-CN")} ${line}`] }));

  /** 确认当前阶段，进入下一阶段；最后一阶段则标记项目完成 */
  const confirmStage = () => {
    if(busy)return;
    const next=path[path.indexOf(activeStage)+1];
    save(c=>({...c,done:{...c.done,[activeStage]:true},stage:next??activeStage,status:next?c.status:'已完成'}));
    setViewStage(next??activeStage);
  };
  /** No destructive invalidation before generation has a verified server adapter. */
  const redo = async (key: StageKey) => !hasStageData(get(), key) || await ask({title:`重新生成${STAGE_DEFS[key].label}？`,description:'成功后更新本阶段，失败保留原内容。已有后续图片、视频不会被清空，完成后请核对与新内容是否一致。生成按当前模型实际用量结算。',confirm:'重新生成'});

  /** The browser submits one bounded durable job. No local multi-model loop. */
  const runAutopilot = async () => {
    try { await runProjectGeneration(get(), "autopilot"); }
    catch(e) { toast.error((e as Error).message); }
  };

  if (!p) return <AppShell sidebar={false}><div className="pane p-16 text-center text-muted-foreground">{col.items.length ? "未找到该项目" : <Loader2 className="mx-auto animate-spin" />}<div className="mt-4"><Link href="/comic" className="chip h-10"><ArrowLeft size={14} />返回项目列表</Link></div></div></AppShell>;

  const stepProps: StepProps = { p, save, busy, setBusy, confirmStage, redo, navigate:goto, autopilot: runAutopilot, get, runBatch, vcaps, catalog: data?.models, openSettings: () => setSettings(true) };
  const Panel = PANELS[activeStage] ?? InputStage;
  const progress = projectProgress(p);
  const speechOpts = (data?.models ?? []).filter(isSpeechModel).map((m) => ({ value: m.id, label: m.name, description: m.price }));
  const voiceOpts = speechModel ? voiceLibraryOf(speechModel).map((v) => ({ value: v.id, label: v.name })) : VOICES;
  const durations = durationsOf(vcaps); const resolution = resolutionOf(p, vcaps); const styleCap = imageRefCap(im);
  const addStyleRefs = async (files?: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, 3 - (p.styleRefs?.length ?? 0)); if (!list.length) { if (files?.length) toast.error("最多 3 张风格参考图"); return; }
    try { const urls = await Promise.all(list.map((f) => shrinkImage(f, 768))); save((c) => ({ ...c, styleRefs: [...(c.styleRefs ?? []), ...urls].slice(0, 3) })); }
    catch { toast.error("图片读取失败，请换一张"); }
  };

  return (
    <AppShell sidebar={false}>
      <div className="comic-ws-frame">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/comic" className="chip h-10 hover:bg-muted"><ArrowLeft size={16} />项目列表</Link>
        <div className="min-w-0"><div className="truncate text-lg font-semibold">{p.script?.title || p.outline?.title || p.name}</div><div className="text-xs text-muted-foreground">{p.kind === "batch" ? "批量剧" : "精品剧"} · {p.style} · {p.ratio} · {p.region} · {resolution ?? p.spec} · {p.schedule}{p.strategy ? ` · ${p.strategy}` : ""} · {p.episodeCount} 集{episodeTargetSec(p) ? ` · 每集 ${fmtDuration(episodeTargetSec(p))}` : ""}</div></div>
        <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
          <span className="chip h-10 gap-2 text-xs text-muted-foreground"><span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: `${progress}%` }} /></span>{progress}%</span>
          <button className="chip h-10 hover:bg-muted" onClick={() => setLogOpen(true)}><TerminalSquare size={16} />日志{p.log.length ? ` ${p.log.length}` : ""}</button>
          <button className="chip h-10 hover:bg-muted" onClick={()=>setHistoryOpen(true)}><History size={16}/>历史版本</button>
          <button className="chip h-10 hover:bg-muted" onClick={() => setSettings(true)}><Settings2 size={16} />项目设定</button>
          {batch && <Button variant="danger" onClick={() => batchCtl.current?.abort()}><Square size={14} />停止 · {batch}</Button>}
          <Button variant={p.schedule === "自动托管" ? "default" : "soft"} disabled={busy} onClick={runAutopilot}><Play size={14} />{p.schedule === "自动托管" ? "自动托管 · 一键成片" : "后台连续制作"}</Button>
        </div>
      </div>

      <GenerationPanel key={id} projectId={id} onProject={next=>{if(next.id===id){ref.current=next;setP(next);}}} onBusy={locked=>{generationLocked.current=locked;setGenerationBusy(locked);setGenerationKnown(true);}}/>
      <div className="mt-4 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="pane h-fit p-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between px-2 pb-2 text-xs font-medium text-muted-foreground"><span>创作路径{p.kind === "batch" ? " · 设定直达剧本" : ""}</span><span>{path.filter((k) => p.done[k]).length}/{path.length}</span></div>
          <ol className="space-y-1">{path.map((k, i) => { const d = STAGE_DEFS[k]; const on = i === idx; const ok = reachable[i]; const done = !!p.done[k]; return (
            <li key={k}><button aria-current={on?'step':undefined} data-stage={k} onClick={() => goto(k)} title={ok?d.desc:`请先确认${STAGE_DEFS[path[i-1]].label}`} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors", on ? "bg-primary-tint font-medium text-accent-foreground" : ok ? "hover:bg-muted" : "text-muted-foreground/60")}>
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[11px]", done ? "border-success bg-success text-white" : on ? "border-primary text-primary" : "")}>{done ? <Check size={12} /> : d.no}</span>
              <span className="flex-1">{d.label}</span>
              <span className={cn("text-[10px]", done ? "text-success" : on ? "text-accent-foreground" : "text-muted-foreground/70")}>{done ? "已完成" : on ? "进行中" : hasStageData(p, k) ? "待确认" : "待处理"}</span>
            </button></li>
          ); })}</ol>
          <div className="mt-3 border-t px-2 pt-3 text-[11px] leading-5 text-muted-foreground">可逐阶段制作，或在后台连续生成，按实际用量结算。成功步骤自动保存；重新生成不清空后续内容，请自行核对一致性。镜头齐备后，在视频阶段预览与导出。</div>
        </aside>
        <section className="pane p-5 md:p-6">{busy&&<p role="status" className="os-readonly-note">当前项目有执行中或待核对的任务，编辑与再次生成暂时锁定。可切换阶段查看已有内容；若上方「后台制作」显示<span>「结果待核对」</span>，按提示查询原视频或点「已核对，结束本轮」即可解锁继续制作。</p>}<fieldset disabled={busy} className="min-w-0 border-0 p-0 m-0"><Panel key={activeStage} {...stepProps} /></fieldset></section>
      </div>

      <Drawer open={settings} onOpenChange={setSettings} title="项目设定" description="修改自动保存，只影响后续制作；不会自动重生成已有图片、视频。" className="os-project-settings">
        {busy&&<p className="os-readonly-note">任务执行或结果待核对时仅供查看，完成或核对后可修改。</p>}
        <fieldset disabled={busy} className="os-settings-fields space-y-4">
          <h3 className="os-settings-heading">故事与美术方向</h3>
          <label className="block text-sm"><span className="mb-1 block font-medium">项目名称</span><input value={p.name} onChange={(e) => save((c) => ({ ...c, name: e.target.value }))} className="h-10 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary/50" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">项目描述</span><textarea value={p.description} rows={3} onChange={(e) => save((c) => ({ ...c, description: e.target.value }))} className="w-full rounded-xl border bg-background px-3 py-2 outline-none focus:border-primary/50" /></label>
          <Row label="画面风格"><StylePicker hideLabel value={p.style} onChange={(v) => save((c) => ({ ...c, style: v }))} /></Row>
          {/* 风格参考图（垫图）：只参考画风，压到 768 存进项目，最多 3 张控制本地存储占用 */}
          <div className="text-sm">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2"><span className="font-medium">风格参考图</span><span className="text-xs text-muted-foreground">{p.styleRefs?.length ?? 0}/3 · 只参考画风、配色与笔触</span></div>
            <div className="flex flex-wrap gap-2">
              {(p.styleRefs ?? []).map((u, i) => <div key={i} className="relative h-16 w-16"><img src={u} alt={`风格参考图 ${i + 1}`} className="h-full w-full rounded-lg border object-cover" /><button type="button" onClick={() => save((c) => ({ ...c, styleRefs: (c.styleRefs ?? []).filter((_, j) => j !== i) }))} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background" aria-label="删除这张风格参考图"><X size={11} /></button></div>)}
              {(p.styleRefs?.length ?? 0) < 3 && <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border border-dashed text-muted-foreground hover:border-primary/50 hover:text-primary" title="上传风格参考图"><ImagePlus size={18} /><input type="file" accept="image/*" multiple hidden onChange={(e) => { void addStyleRefs(e.target.files); e.target.value = ""; }} /></label>}
            </div>
            {styleCap === 0 && <div className={cn("mt-1.5 text-xs", p.styleRefs?.length ? "text-warning" : "text-muted-foreground")}>当前图片模型不会发送风格参考图</div>}
          </div>
          <h3 className="os-settings-heading">制作规格</h3>
          <Row label="画面比例"><RatioPicker value={p.ratio} onChange={(v) => save((c) => ({ ...c, ratio: v }))} /></Row>
          <Row label="剧集地区"><RegionPicker hideLabel value={p.region} onChange={(v) => save((c) => ({ ...c, region: v }))} /></Row>
          {/* 调度策略暂收起：后端执行链路尚未消费该字段，展示纯装饰会误导用户（接通 generationPolicy 后恢复） */}
          {/* <Row label="调度"><StrategyPicker value={p.strategy} onChange={(v) => save((c) => ({ ...c, strategy: v }))} /></Row> */}
          {/* 线路列了清晰度就只给它做得到的档位（参考站 09-19「清晰度只列做得到的」）；没列的老线路仍是 默认 / 高清 */}
          <Row label="制作规格">{resolution && vcaps ? <SegButtons size="sm" value={resolution} options={vcaps.resolutions} onChange={(v: string) => save((c) => ({ ...c, resolution: v, spec: specOfResolution(v) }))} /> : <SegButtons size="sm" value={p.spec} options={COMIC_SPECS} onChange={(v: ComicSpec) => save((c) => ({ ...c, spec: v }))} />}</Row>
          <Row label="每镜固定时长"><PillSelect ariaLabel="每镜固定时长" value={p.fixedShotSec ? String(shotSeconds(p, {}, vcaps)) : "off"} options={[{ value: "off", label: "关" }, ...durations.map((d) => ({ value: String(d), label: `${d} 秒` }))]} onChange={(v) => save((c) => ({ ...c, fixedShotSec: v === "off" ? undefined : Number(v) }))} className="h-9 text-xs" /></Row>
          <Row label="托管"><SegButtons size="sm" value={p.schedule} options={COMIC_SCHEDULES} onChange={(v: ComicSchedule) => save((c) => ({ ...c, schedule: v }))} /></Row>
          <h3 className="os-settings-heading">创作模型</h3>
          <p className="text-xs text-muted-foreground">文案负责故事与分镜设计，图片负责资产与关键帧，视频负责动态镜头。选择模型不扣积分。</p>
          <ModelPicker category="chat" label="文案 · 故事与分镜设计" showPrice value={p.models.chat ?? ""} onChange={(v) => save((c) => ({ ...c, models: { ...c.models, chat: v } }))} />
          <ModelPicker category="image" label="图片 · 资产与关键帧" showPrice value={p.models.image ?? ""} onChange={(v) => save((c) => ({ ...c, models: { ...c.models, image: v } }))} />
          <ModelPicker category="video" label="视频 · 动态镜头" showPrice value={p.models.video ?? ""} onChange={(v) => save((c) => ({ ...c, models: { ...c.models, video: v } }))} />
          <h3 className="os-settings-heading">镜头与衔接</h3>
          <PillSelect label="镜头制作" value={p.videoProduction||'ai'} options={[{value:'ai',label:'AI 视频模型 · 按模型用量计费'},{value:'image-motion',label:'图片运镜 · 不调用视频模型'}]} onChange={v=>save(c=>({...c,videoProduction:v as 'ai'|'image-motion',...(v==='image-motion'?{videoInput:'reference' as const}:{})}))} className="h-10 w-full rounded-2xl" />
          {p.videoProduction!=='image-motion' && <PillSelect label="视频输入" value={p.videoInput||'reference'} options={[{value:'reference',label:'关键帧与角色参考 · 外观更稳定'},{value:'text',label:'纯提示词 · 无需关键帧与公网图片'}]} onChange={v=>save(c=>({...c,videoInput:v as 'reference'|'text',...(v==='text'?{videoChain:'parallel' as const}:{})}))} className="h-10 w-full rounded-2xl"/>}
          {p.videoInput!=='text' && <PillSelect label="镜头衔接" value={p.videoChain||'parallel'} options={[{value:'parallel',label:'独立镜头 · 适合场景切换'},{value:'serial',label:'尾帧续接 · 适合连续动作'}]} onChange={v=>{if(v==='serial'&&!videoInputPolicy(vm).first){toast.info('当前模型不支持首帧续接，请先切换视频模型');return;}save(c=>({...c,videoChain:v as 'parallel'|'serial'}));}} className="h-10 w-full rounded-2xl"/>}
          {vcaps?.frame === "none" && <div className="flex items-center gap-1.5 text-xs text-warning"><AlertTriangle size={13} className="shrink-0" />该线路不支持首帧，镜头会和分镜图不一致，建议换线路</div>}
          {/* 配音走 /v1/audio/speech：音乐（Suno）/ 音色设计 / 克隆模型调不通，只列语音合成模型 */}
          <h3 className="os-settings-heading">声音与配音</h3>
          {speechOpts.length ? <PillSelect label="配音模型" value={speechOpts.some((o) => o.value === p.models.audio) ? p.models.audio! : speechOpts[0].value} options={speechOpts} onChange={(v) => save((c) => ({ ...c, models: { ...c.models, audio: v } }))} className="h-10 w-full rounded-2xl" /> : <span className="chip h-10 text-xs text-muted-foreground">配音模型：暂无可用语音合成模型</span>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!p.autoVoice} disabled={!p.models.audio} onChange={e=>save(c=>({...c,autoVoice:e.target.checked}))}/>连续制作时生成台词配音（按所选语音模型计费）</label>
          <PillSelect label="默认音色" value={voiceOpts.some((o) => o.value === p.voice) ? p.voice : voiceOpts[0]?.value ?? p.voice} options={voiceOpts} onChange={(v) => save((c) => ({ ...c, voice: v }))} className="h-10 w-full rounded-2xl" />
          <div className="-mt-2 text-xs text-muted-foreground">旁白和没设音色的角色用它；角色可在 07 资产里单独选音色并试听。</div>
          {p.cover && <div><div className="mb-1 text-sm font-medium">封面图</div><img src={p.cover} alt="封面" className="h-32 rounded-xl object-cover" /></div>}
        </fieldset>
        <div className="os-settings-footer"><span>保存状态见页面顶部「服务器存储」</span><Button variant="secondary" onClick={()=>setSettings(false)}>完成</Button></div>
      </Drawer>
      {historyOpen&&<HistoryDialog p={p} busy={busy} onClose={()=>setHistoryOpen(false)} onRestored={next=>{ref.current=next;setP(next);setViewStage(null);}}/>}
      <Drawer open={logOpen} onOpenChange={setLogOpen} title="运行日志" description="自动托管与各阶段的执行记录">
        {p.log.length ? <pre className="whitespace-pre-wrap rounded-xl bg-muted p-3 font-mono text-xs leading-5">{p.log.join("\n")}</pre> : <div className="text-sm text-muted-foreground">暂无日志</div>}
        {p.log.length > 0 && <Button variant="ghost" size="sm" className="mt-3" onClick={() => save((c) => ({ ...c, log: [] }))}>清空日志</Button>}
      </Drawer>
      </div>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{label}</span>{children}</div>; }
