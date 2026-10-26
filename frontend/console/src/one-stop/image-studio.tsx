// 生图工作台：造物 /image 工作台的皮 + 本站 /api/canvas-image-tasks 的里子。
// 模式 tab（文生图 / 图编辑 / 多图融合）与参数胶囊（比例 / 分辨率 / 数量 / 质量 / MJ 全套）
// 由模型 param_schema 驱动；提交即预扣积分、失败退还、产物落 /oss。
import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Info, Layers, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { CatalogModel } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { accountKey } from "./adapters/request";
import { MediaPage, type MediaMode, type MediaRefs, type RefTile } from "./studio/media-page";
import { ParamSelect, ParamPills, PILL, countOptions, optionsOf, pickOf, bodyParams, type Field, type Schema, type Values } from "./studio/param-form";
import { useStudio } from "./studio/store";
import { notifyWork } from "./studio/inbox";

type BillingPreview = { label: string; model: string; modelId?: string; free?: boolean; quote?: { yuan: number } | null; basis?: string; budget: { defaultPoints: number; maxPoints: number; maxCalls: number; minutes: number } };
const HELP_PROMPT = "你是 AI 绘图提示词专家。把用户的简短描述扩写成一条高质量中文生图提示词：主体、构图/镜头、场景、光线、风格、材质、画质，60~120 字，不要解释，只输出提示词。";
const SAMPLES = ["一只橘猫坐在木桌上，缓慢转头看向窗外，阳光洒进来", "赛博朋克城市街道，雨夜霓虹反射在湿润地面，电影感广角", "白色陶瓷马克杯放在纯白背景，柔和顶光，商业摄影"];
/** 上面单独渲染的 schema 字段；其余（质量 / 输出格式 / 种子 / MJ 全套…）交给 ParamPills */
const HANDLED = ["mode", "size", "aspect_ratio", "resolution", "count", "images"];
/** 模型没有 param_schema 时的兜底（造物 image 页同款：比例 + 1K/2K/4K） */
const RATIOS = [
  { value: "1:1", label: "1:1 正方形", description: "1024x1024 / 2048x2048" },
  { value: "auto", label: "自适应", description: "由模型按画面内容自动选择比例" },
  { value: "3:2", label: "3:2 横版", description: "1536x1024 / 3072x2048" },
  { value: "2:3", label: "2:3 竖版", description: "1024x1536 / 2048x3072" },
  { value: "4:3", label: "4:3 横版", description: "1280x960 / 2560x1920" },
  { value: "3:4", label: "3:4 竖版", description: "960x1280 / 1920x2560" },
  { value: "16:9", label: "16:9 横屏", description: "1920x1088 / 2048x1152" },
  { value: "9:16", label: "9:16 竖屏", description: "1088x1920 / 1152x2048" },
  { value: "21:9", label: "21:9 超宽", description: "2016x864 / 2688x1152" },
];
const QUALITY = [{ value: "1K", label: "1K 标清", description: "约1024像素，生成速度快" }, { value: "2K", label: "2K 高清", description: "约2048像素，画质清晰" }, { value: "4K", label: "4K 超清", description: "约2880-3840像素，超高清" }];
const MODE_META: Record<string, { label: string; icon: MediaMode["icon"]; desc: string }> = {
  t2i: { label: "文生图", icon: Sparkles, desc: "纯文本描述，AI 从零生成图片" },
  edit: { label: "图编辑", icon: Brush, desc: "上传待编辑图（张数随模型），AI 按提示词改写" },
  fusion: { label: "多图融合", icon: Layers, desc: "上传多张参考图，AI 融合主体/风格生成" },
};
/** 上游 mode 值 → 我们的模式键（造物 MODE_KEY 同款） */
const MODE_KEY: Record<string, string> = { "text-to-image": "t2i", "image-edit": "edit", "multi-reference": "fusion" };

async function imgFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accountKey();
  if (!token) throw new Error("请先登录");
  const res = await fetch(path, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: token, "Content-Type": "application/json" }, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) throw new Error(body?.message || body?.error || `请求失败（${res.status}）`);
  if (body && typeof body === "object" && "data" in body && typeof body.data === "object" && body.data !== null && !("status" in body)) return body.data as T;
  return body as T;
}

/** 分辨率档位 → 长边像素（发给后端 width/height，供计费与出图尺寸用） */
const TIER_EDGE: Record<string, number> = { "1k": 1024, "1K": 1024, "2k": 2048, "2K": 2048, "4k": 4096, "4K": 4096 };
function sizeOf(ratio: string, resolution?: string): { width: number; height: number } {
  const [a, b] = ratio === "auto" || !/^\d+:\d+$/.test(ratio) ? [1, 1] : ratio.split(":").map(Number);
  const long = TIER_EDGE[resolution ?? ""] ?? 1024;
  const scale = long / Math.max(a, b);
  return { width: Math.round(a * scale), height: Math.round(b * scale) };
}

/** 当前参数实际会发的请求体（估价与提交共用） */
function imageBody(m: CatalogModel, prompt: string, v: Values, mode: string, media: MediaRefs, schemaMode?: string) {
  const sc = (m.paramSchema ?? {}) as Schema;
  const ratioKey = sc.size ? "size" : "aspect_ratio";
  const ratioOpts = optionsOf(sc, ratioKey, v, mode);
  const ratio = (ratioOpts.some((o) => o.value === v.ratio) ? v.ratio : pickOf(sc, ratioKey, v, mode)) ?? "1:1";
  const resOpts = optionsOf(sc, "resolution", v, mode);
  const resolution = resOpts.some((o) => o.value === v.res) ? v.res : pickOf(sc, "resolution", v, mode);
  const { width, height } = sizeOf(ratio, resolution);
  const n = Math.max(1, Number(v.n ?? pickOf(sc, "count", v, mode) ?? 1) || 1);
  const body: Record<string, unknown> = {
    prompt, model: m.id,
    size: `${width}x${height}`, width, height,
    resolution: resolution || undefined,
    reference_images: media.images.map((url) => ({ type: "image", base64: url })),
    ...bodyParams(sc, v, schemaMode, HANDLED),
  };
  if (schemaMode) body.mode = schemaMode;
  if (v.negative) body.negative_prompt = v.negative;
  return { body, ratio, resolution, n, width, height };
}

export function ImageStudio() {
  const addWork = useStudio((s) => s.addWork);
  const updateWork = useStudio((s) => s.updateWork);
  const works = useStudio((s) => s.works);
  const [bill, setBill] = useState<{ preview: BillingPreview; points: number; resolve: (v: number | null) => void } | null>(null);
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const previewKey = useRef("");
  const confirm = useCallback((p: BillingPreview) => new Promise<number | null>((resolve) => setBill({ preview: p, points: p.budget.defaultPoints, resolve })), []);

  const estimate = useCallback((m: CatalogModel, v: Values, mode: string, media: { images: number }) => {
    const { body, n } = imageBody(m, "", v, mode, { images: [], videos: [], audios: [] });
    const key = JSON.stringify(body) + n;
    if (key !== previewKey.current) {
      previewKey.current = key;
      void imgFetch<BillingPreview>("/api/billing/preview", { method: "POST", body: JSON.stringify({ path: "/api/canvas-image-tasks", body: { ...body, prompt: "", inputLength: 20, hasReferenceImage: media.images > 0 } }) }).then(setPreview).catch(() => setPreview(null));
    }
    const quoteYuan = preview?.quote?.yuan;
    if (!Number.isFinite(quoteYuan as number)) return null;
    return {
      total: quoteYuan != null && quoteYuan > 0 ? `${(quoteYuan * 10 * n).toFixed(2)} 积分（¥${(quoteYuan * n).toFixed(2)}）` : "免费",
      rows: [["模型", m.name], ["尺寸", `${body.width}x${body.height}${body.resolution ? ` · ${String(body.resolution).toUpperCase()}` : ""}`], ["生成数量", `${n} 张`], ["参考图", media.images ? `${media.images} 张` : "无"]] as [string, string][],
      cost: quoteYuan != null ? quoteYuan * n : undefined,
    };
  }, [preview]);

  const poll = useCallback((id: string, taskId: string) => {
    const settle = (patch: Parameters<typeof updateWork>[1]) => {
      updateWork(id, patch);
      const w = useStudio.getState().works.find((x) => x.id === id);
      if (w) notifyWork(w);
    };
    const timer = setInterval(async () => {
      try {
        const t = await imgFetch<any>(`/api/canvas-image-tasks/${taskId}`);
        const status = t?.status;
        if (status === "succeeded") {
          const url = t?.result?.url || t?.result?.images?.[0]?.url;
          if (typeof url === "string") { settle({ status: "done", url, urls: t?.result?.images?.map((x: any) => x.url).filter(Boolean) }); clearInterval(timer); }
        } else if (status === "failed") { settle({ status: "failed", error: t?.error || "生成失败，可重试" }); clearInterval(timer); }
        // unknown：上游超时但可能已出片；保持 running 让用户稍后看
      } catch (e) { settle({ status: "failed", error: (e as Error).message }); clearInterval(timer); }
    }, 4000);
  }, [updateWork]);

  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return; resumed.current = true;
    for (const w of works) {
      if (w.kind !== "image" || !w.taskId) continue;
      if (w.status === "running" || w.status === "pending") poll(w.id, w.taskId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(async (m: CatalogModel, prompt: string, v: Values, mode: string, media: MediaRefs) => {
    if (!prompt) { toast.error("先写一句画面描述"); return false; }
    const schemaMode = Object.entries(MODE_KEY).find(([, ours]) => ours === mode)?.[0];
    const { body, n, ratio } = imageBody(m, prompt, v, mode, media, schemaMode);
    const p = await imgFetch<BillingPreview>("/api/billing/preview", { method: "POST", body: JSON.stringify({ path: "/api/canvas-image-tasks", body: { ...body, inputLength: prompt.length, hasReferenceImage: media.images.length > 0 } }) });
    if (!p?.budget) throw new Error("计费信息暂不可用，本次未提交，请稍后重试");
    const freeOnly = p.free === true && p.quote?.yuan === 0 && !!p.modelId;
    const points = freeOnly ? 0.001 : await confirm(p);
    if (points === null || !Number.isFinite(points) || points <= 0) { toast.error("已取消，未提交模型请求"); return false; }
    for (let i = 0; i < n; i++) {
      const authorized = await imgFetch<{ id: string }>("/api/billing/authorize", { method: "POST", body: JSON.stringify({ path: "/api/canvas-image-tasks", points, model: p.modelId, freeOnly, automatic: freeOnly }) });
      if (!/^[0-9a-f-]{36}$/.test(authorized?.id || "")) { toast.error("预算授权失败，未提交模型请求"); if (!i) return false; break; }
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      addWork({ id, kind: "image", model: m.id, prompt, createdAt: Date.now(), status: "running", meta: { size: `${body.width}x${body.height}`, mode: MODE_META[mode]?.label ?? "文生图", modeKey: mode, params: v, ratio, refs: media.images.length ? media.images : undefined } });
      try {
        const resp = await imgFetch<any>("/api/canvas-image-tasks", {
          method: "POST",
          headers: { "X-Xoi-Billing-Id": authorized.id },
          body: JSON.stringify(body),
        });
        const taskId = resp?.task_id || resp?.id;
        if (!taskId) throw new Error(resp?.error || "任务提交失败");
        if (typeof resp?.pointsDeducted === "number" && resp.pointsDeducted > 0) toast.success(`已提交，预扣 ${resp.pointsDeducted} 积分`);
        updateWork(id, { taskId });
        poll(id, taskId);
      } catch (e) {
        updateWork(id, { status: "failed", error: (e as Error).message });
        notifyWork({ id, kind: "image", prompt, status: "failed", error: (e as Error).message });
        toast.error((e as Error).message);
      }
    }
  }, [addWork, updateWork, poll, confirm]);

  /** 从 param_schema 推导模式 tab（文生图 / 图编辑 / 多图融合，参考图张数按 images.max_items[_by_mode]） */
  const modesFor = useCallback((m: CatalogModel): MediaMode[] | undefined => {
    const sc = (m.paramSchema ?? {}) as Schema;
    if (!Object.keys(sc).length) return undefined;
    const f = sc.mode as (Field & { options?: { value: string; is_default?: boolean; ref_max?: number }[] }) | undefined;
    const up = sc.images as (Field & { max_items_by_mode?: Record<string, number>; max_items?: number; label?: { zh?: string } }) | undefined;
    const tile = (max: number, label: string, required: boolean): RefTile => ({ kind: "image", max, label, aria: `上传${label}`, required });
    if (!f) {
      if (!up) return [{ key: "t2i", ...MODE_META.t2i }];
      const cap = up.max_items ?? 16;
      return [
        ...(up.required ? [] : [{ key: "t2i", ...MODE_META.t2i } as MediaMode]),
        { key: "edit", ...MODE_META.edit, tiles: [tile(1, up.label?.zh ?? "待编辑图", true)] },
        ...(cap > 1 ? [{ key: "fusion", ...MODE_META.fusion, tiles: [tile(cap, "参考图", false)] } as MediaMode] : []),
      ];
    }
    const keys = (f.enum ?? f.options?.map((o) => String(o.value)) ?? []).map(String);
    if (!keys.length) return undefined;
    const multi = keys.includes("multi-reference");
    const optMax = (k: string) => (f?.options?.find((o) => String(o.value) === k) as { ref_max?: number } | undefined)?.ref_max;
    const capOf = (k: string) => up?.max_items_by_mode ? (up.max_items_by_mode[k] ?? 0) : optMax(k) ?? (k === "text-to-image" ? 0 : k === "image-edit" && !multi ? 1 : (up?.max_items ?? 16));
    return keys.map((k) => {
      const key = MODE_KEY[k] ?? k; const meta = MODE_META[key];
      const opt = f?.options?.find((o) => String(o.value) === k);
      const refs = key === "edit" && multi ? Math.max(capOf(k), capOf("multi-reference")) : capOf(k);
      const tiles: RefTile[] = refs > 0 ? [tile(refs, key === "edit" ? "待编辑图" : key === "t2i" ? "垫图" : "参考图", key !== "t2i")] : [];
      return { key, label: meta?.label ?? opt?.label ?? k, icon: meta?.icon ?? Layers, desc: opt?.description ?? meta?.desc, tiles, default: opt?.is_default || f?.default === k };
    }).filter((x) => MODE_META[x.key] || x.tiles.length > 0);
  }, []);

  const renderParams = useCallback((m: CatalogModel, v: Values, set: (k: string, s: string) => void, mode: string) => {
    const sc = (m.paramSchema ?? {}) as Schema;
    const hasSchema = Object.keys(sc).length > 0;
    const ratioKey = sc.size ? "size" : "aspect_ratio";
    const ratioOpts = hasSchema && sc[ratioKey] ? optionsOf(sc, ratioKey, v, mode) : RATIOS;
    const curRatio = ratioOpts.some((o) => o.value === v.ratio) ? v.ratio : (hasSchema && sc[ratioKey] ? pickOf(sc, ratioKey, v, mode) : undefined) ?? ratioOpts[0]?.value;
    const resOpts = hasSchema && sc.resolution ? optionsOf(sc, "resolution", v, mode).map((o) => ({ ...o, label: o.label.toUpperCase() })) : QUALITY;
    const curRes = resOpts.some((o) => o.value === v.res) ? v.res : (hasSchema && sc.resolution ? pickOf(sc, "resolution", v, mode) : undefined) ?? resOpts[0]?.value;
    const countMax = (sc.count as Field | undefined)?.max ?? 10;
    return (
      <>
        <ParamSelect label="比例" value={curRatio ?? ""} options={ratioOpts} onChange={(x) => set("ratio", x)} className={PILL} active accent />
        <ParamSelect label="分辨率" value={curRes ?? ""} options={resOpts} onChange={(x) => set("res", x)} className={PILL} active />
        <ParamSelect label="生成数量" value={v.n ?? "1"} options={countOptions(countMax)} onChange={(x) => set("n", x)} className={PILL} grid />
        {/* 其余 schema 参数（质量 / 输出格式 / 种子 / MJ 全套…）；MJ 的模型引擎与版本优先留在工具条上 */}
        {hasSchema && <ParamPills schema={sc} values={v} onChange={set} mode={Object.entries(MODE_KEY).find(([, ours]) => ours === mode)?.[0]} exclude={HANDLED} prefer={["bot_type", "version", "quality"]} />}
      </>
    );
  }, []);

  return (
    <>
      <MediaPage
        modality="image" label="图片"
        placeholder="描述想要的画面：主体 + 构图 + 场景 + 光线 + 风格，例如：云海山巅的日出，国风插画"
        modes={[{ key: "t2i", ...MODE_META.t2i }]}
        modesFor={modesFor}
        renderParams={renderParams}
        estimate={estimate}
        submit={submit}
        helpPrompt={HELP_PROMPT}
        samples={SAMPLES}
        playbook={<ImagePlaybook />}
        subtitleFor={() => "文生图 · 提交后可关闭页面"}
      />
      {bill && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[radial-gradient(48%_42%_at_50%_0,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_72%)] bg-background/60 p-4 backdrop-blur-[18px] animate-in fade-in-0" role="dialog" aria-modal="true" aria-label="生成图片费用确认">
          <div className="w-[min(92vw,440px)] overflow-hidden rounded-shell border border-foreground/10 bg-card shadow-pop animate-in fade-in-0 zoom-in-95">
            <div className="flex flex-col gap-2 border-b border-border/60 px-4 pb-3 pt-5 sm:px-6">
              <div className="flex items-center gap-2 text-[15px] font-semibold"><Info size={16} className="text-primary" />生成图片 · 费用确认</div>
              <p className="text-[12px] leading-[1.6] text-muted-foreground">这是安全上限，不是预扣款；仅按实际用量扣积分</p>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <p className="text-sm"><strong>{bill.preview.label}</strong> · {bill.preview.model}</p>
              <p className="mt-1 text-sm text-primary-strong">{typeof bill.preview.quote?.yuan === "number" && bill.preview.quote.yuan > 0 ? `单张约 ${(bill.preview.quote.yuan * 10).toFixed(2)} 积分（¥${bill.preview.quote.yuan.toFixed(2)}）` : "暂无完整预估，不代表免费"}</p>
              <label className="mt-4 flex items-center justify-between gap-3 text-sm font-medium">
                本轮预算上限（积分）
                <input type="number" min={0.001} max={bill.preview.budget.maxPoints} step={0.001} defaultValue={bill.points}
                  onChange={(e) => setBill({ ...bill, points: Number(e.target.value) })}
                  className="w-32 rounded-xl border border-border px-3 py-2 text-right font-mono text-sm outline-none focus:border-primary/40" />
              </label>
              <p className="mt-3 text-[12px] leading-5 text-muted-foreground">最多 {bill.preview.budget.maxCalls} 次调用 · {bill.preview.budget.minutes} 分钟内有效 · 1 元 = 10 积分 · 失败自动退回</p>
            </div>
            <div className="flex justify-end gap-2 px-4 pb-4 sm:px-6">
              <Button variant="secondary" onClick={() => { bill.resolve(null); setBill(null); }}>取消</Button>
              <Button disabled={!Number.isFinite(bill.points) || bill.points < 0.001 || bill.points > bill.preview.budget.maxPoints} onClick={() => { const v = bill.points; bill.resolve(v); setBill(null); }}>确认并生成</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ImagePlaybook() {
  return (
    <div className="space-y-4 text-sm leading-6">
      <section><h3 className="font-semibold text-foreground">生成方式</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          <li><b className="text-foreground">文生图</b>：直接写画面描述，主体 + 构图 + 场景 + 光线 + 风格。</li>
          <li><b className="text-foreground">图编辑</b>：上传待编辑图，AI 按你的提示词改写画面。</li>
          <li><b className="text-foreground">多图融合</b>：上传多张参考图（上限随模型），融合主体与风格重新创作。</li>
        </ul>
      </section>
      <section><h3 className="font-semibold text-foreground">比例 / 分辨率 / 数量</h3>
        <p className="mt-1 text-muted-foreground">先选比例与分辨率再写提示词；一次可生成多张，按实际张数计费。参数多的模型（如 MJ）还有质量、种子、风格化等「更多参数」。</p>
      </section>
      <section><h3 className="font-semibold text-foreground">计费方式</h3>
        <p className="mt-1 text-muted-foreground">提交前确认预算上限，只按实际用量扣积分，失败自动退回。图片约 1–2 分钟出片，可关闭页面稍后回来查看。</p>
      </section>
    </div>
  );
}
