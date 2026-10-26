// 生视频对话台：造物 /video 工作台的皮 + 本站 /api/canvas-video 的里子。
// 模式 tab 与参数胶囊全部由模型 param_schema 驱动（造物 schemaModes / renderParams 同款）：
// 文生视频 / 首帧 / 首尾帧 / 全能参考 / 视频编辑 / 视频延长，画质档（std/pro）这类非输入模式渲染成参数胶囊。
// 计费链路保留：平台预算单（preview 估价 → 用户确认上限 → authorize）→ 提交即预扣、失败退还、服务端持久任务。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FastForward, Film, Gauge, Hand, Image as ImageIcon, ImagePlus, Info, Layers, Route, Scissors, ShieldCheck, Wallet } from "lucide-react";
import * as Pop from "@radix-ui/react-popover";
import { toast } from "sonner";
import type { CatalogModel } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { mfVideoCaps } from "./multiframe/video-caps";
import { accountKey } from "./adapters/request";
import { MediaPage, type MediaMode, type MediaRefs, type RefTile } from "./studio/media-page";
import { ParamSelect, ParamPills, PILL, countOptions, optionsOf, pickOf, bodyParams, type Field, type Schema, type Values } from "./studio/param-form";
import { useStudio } from "./studio/store";
import { useCatalog } from "./adapters/queries";
import { notifyWork } from "./studio/inbox";
import { benchChip, FLOAT_PANEL } from "./studio/ui";

/** 渠道策略（造物 StrategyDialog 同款）：稳定 / 价格 / 速度优先自动匹配，列表勾选 = 锁定线路。
 *  数据全部来自站内真实任务记录（/api/model-health）与目录价，没有数据就如实显示「暂无数据」。 */
type Strategy = "stable" | "price" | "speed" | "manual";
const STRATEGY_META: { key: Strategy; label: string; icon: typeof ShieldCheck; desc: string }[] = [
  { key: "stable", label: "稳定优先", icon: ShieldCheck, desc: "优先挑成功率高的线路，自动避开故障线路" },
  { key: "price", label: "价格优先", icon: Wallet, desc: "在成功率不低于 60% 的线路里挑最便宜的" },
  { key: "speed", label: "速度优先", icon: Gauge, desc: "优先挑近 2 小时平均耗时最短且成功过的线路" },
  { key: "manual", label: "手动选线", icon: Hand, desc: "在列表里点一条，固定用这条" },
];

function ChannelStrategy({ current, className, onPick }: { current: CatalogModel; className?: string; onPick: (m: CatalogModel) => void }) {
  const { data: catalog } = useCatalog();
  const models = catalog?.models ?? [];
  const siblings = useMemo(() => models.filter((m) => m.category === "video" && m.series === current.series), [models, current.series]);
  const [strategy, setStrategy] = useState<Strategy>("stable");
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const priceNum = (m: CatalogModel) => Number(m.priceUsd) || NaN;
  const rows = useMemo(() => {
    type Row = { m: CatalogModel; health: number | null; total2: number; avgSec: number | null };
    const list: Row[] = siblings.map((m) => {
      const d = (m as { healthDetail?: { health: number; total24: number; total2: number; avgSec2: number | null } }).healthDetail;
      return { m, health: d && d.total24 > 0 ? d.health : null, total2: d?.total2 ?? 0, avgSec: d?.avgSec2 ?? null };
    });
    const by = {
      stable: (a: Row, b: Row) => (b.health ?? -1) - (a.health ?? -1) || priceNum(a.m) - priceNum(b.m),
      price: (a: Row, b: Row) => priceNum(a.m) - priceNum(b.m) || (b.health ?? -1) - (a.health ?? -1),
      speed: (a: Row, b: Row) => (a.avgSec ?? 1e9) - (b.avgSec ?? 1e9) || (b.health ?? -1) - (a.health ?? -1),
      manual: (a: Row, b: Row) => Number(b.m.id === current.id) - Number(a.m.id === current.id),
    }[strategy];
    const pool = locked.size ? list.filter((r) => locked.has(r.m.id)) : list;
    return [...(pool.length ? pool : list)].sort(by);
  }, [siblings, strategy, locked, current.id]);
  const best = rows[0];
  return (
    <Pop.Root>
      <Pop.Trigger aria-label="选择渠道策略" title="选择渠道策略" className={cn(className, "gap-1.5")}>
        <Route size={14} className="shrink-0" />
        <span>{strategy === "manual" ? `手动 · ${current.name}` : STRATEGY_META.find((x) => x.key === strategy)!.label}</span>
      </Pop.Trigger>
      <Pop.Portal>
        <Pop.Content side="top" align="end" sideOffset={8} collisionPadding={12} className={cn("z-50 w-[min(94vw,640px)] animate-in fade-in-0 zoom-in-95", FLOAT_PANEL, "p-0")}>
          <div className="border-b border-border/60 px-4 pb-3 pt-4">
            <div className="text-[15px] font-semibold text-foreground">选择渠道策略</div>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{current.name} 所在系列（{current.series}）共 {siblings.length} 条线路：按你选的策略自动匹配最优；在列表勾选 = 只在勾选的线路里择优。</p>
          </div>
          <div className="grid grid-cols-4 gap-1 px-3 py-2">
            {STRATEGY_META.map((x) => (
              <button key={x.key} type="button" onClick={() => setStrategy(x.key)} title={x.desc}
                className={cn("flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors", strategy === x.key ? "bg-primary/10 text-primary-strong shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_35%,transparent)]" : "text-muted-foreground hover:bg-muted/60")}>
                <x.icon size={15} />{x.label}
              </button>
            ))}
          </div>
          <p className="px-4 pb-1 text-[11px] text-muted-foreground">{STRATEGY_META.find((x) => x.key === strategy)!.desc}</p>
          <div className="max-h-[40vh] overflow-y-auto px-3 pb-2">
            <table className="w-full text-left text-[12px]">
              <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground"><th className="py-1.5 font-medium">线路</th><th className="py-1.5 font-medium">成功率</th><th className="py-1.5 font-medium">耗时</th><th className="py-1.5 font-medium">本次价格</th><th className="py-1.5 text-right font-medium">选定</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const on = r.m.id === current.id;
                  return (
                    <tr key={r.m.id} className={cn("border-t border-border/50", on && "bg-primary/[0.05]")}>
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-1.5 font-semibold text-foreground">{r.m.name}{on && <span className="rounded-full bg-muted px-1.5 py-px text-[9px] font-medium text-muted-foreground">当前所选</span>}</span>
                        {r.m.featured && <span className="mt-0.5 inline-block rounded-sm border border-[#e9b10c]/60 bg-[#e9b10c]/12 px-1 py-px text-[9px] font-semibold text-[#b8860b]">重点推荐</span>}
                      </td>
                      <td className="py-2 pr-2 font-mono tabular-nums">{r.health != null ? <span className={r.health >= 95 ? "text-success" : r.health >= 60 ? "text-warning" : "text-danger"}>{r.health}%</span> : <span className="text-muted-foreground/60">暂无数据</span>}</td>
                      <td className="py-2 pr-2 font-mono tabular-nums">{r.avgSec != null ? `${Math.round(r.avgSec / 6) / 10} 分` : "—"}</td>
                      <td className="py-2 pr-2 font-mono tabular-nums">{Number.isFinite(priceNum(r.m)) ? `¥${priceNum(r.m).toFixed(2)}` : r.m.price?.split(" · ")[0] ?? "—"}</td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center gap-2">
                          <button type="button" aria-label={`锁定 ${r.m.name}`} aria-pressed={locked.has(r.m.id)} onClick={() => setLocked((c) => { const n = new Set(c); if (n.has(r.m.id)) n.delete(r.m.id); else n.add(r.m.id); return n; })}
                            className={cn("grid h-4 w-4 place-items-center rounded border transition-colors", locked.has(r.m.id) ? "border-primary bg-primary text-primary-foreground" : "border-border/70")}>{locked.has(r.m.id) ? "✓" : ""}</button>
                          <button type="button" aria-label={`改用 ${r.m.name}`} onClick={() => { onPick(r.m); }} className={cn("text-xs font-medium", on ? "text-primary" : "text-muted-foreground hover:text-primary")}>{on ? "✓" : "改用"}</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border/60 bg-muted/40 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
            {best ? <>将使用：<b className="text-foreground">{best.m.name}</b>{best.health != null ? ` · 近 24h 成功率 ${best.health}%` : " · 暂无成功率数据，按价格排序"}；锁定后只在勾选的线路里择优，失败不会自动换线重试（避免重复扣费）。</> : "该系列暂无其他线路。"}
          </div>
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}

type BillingPreview = { label: string; model: string; modelId?: string; free?: boolean; count?: number; quote?: { yuan: number } | null; basis?: string; budget: { defaultPoints: number; maxPoints: number; maxCalls: number; minutes: number } };
/** 智能帮写的扩写提示（造物同款） */
const HELP_PROMPT = "你是 AI 视频提示词专家。把用户的描述改写成一条高质量视频提示词：主体 + 动作 + 场景 + 运镜 + 光线 + 画质，一个镜头一句话，60~120 字，不要解释，只输出提示词。";
const SAMPLES = ["云海山巅，青衣少年迎着晨光缓缓抬头，镜头缓推", "雨夜霓虹街头，行人匆匆，镜头横移跟拍一辆出租车", "宫灯长廊，烛火摇曳，镜头缓慢前进，古装悬疑氛围"];
/** 上面单独渲染的 schema 字段；其余字段（画质档、生成音频、版本档位…）交给 ParamPills */
const HANDLED = ["mode", "duration", "aspect_ratio", "resolution", "count", "images", "videos", "audios"];

/** 原站的模式文案（tab 标签 + title 提示，造物 MODE_META 同款） */
const MODE_META: Record<string, { label: string; icon: MediaMode["icon"]; desc: string }> = {
  "text-to-video": { label: "文生视频", icon: Film, desc: "纯文本描述生成视频" },
  "first-frame": { label: "首帧", icon: ImageIcon, desc: "上传一张图片作为起始画面" },
  "first-last": { label: "首尾帧", icon: ImagePlus, desc: "上传首帧 + 尾帧，AI 补间" },
  reference: { label: "全能参考", icon: Layers, desc: "上传多张参考图（上限随模型），主体风格迁移" },
  edit: { label: "视频编辑", icon: Scissors, desc: "上传一段视频，用文字说要改什么（换颜色 / 换元素 / 改风格），时长跟随原视频" },
  extend: { label: "视频延长", icon: FastForward, desc: "上传一段视频，让画面继续往后演进；选的时长是成片总长，不是延长多少秒" },
  continuation: { label: "接续", icon: FastForward, desc: "上传末帧继续往下拍" },
};
const MODE_ORDER = Object.keys(MODE_META);

/** canvas-video 族接口有的包 {success,data}、有的裸返 {data:...}（billing），这里统一解开 */
async function cvFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accountKey();
  if (!token) throw new Error("请先登录");
  const res = await fetch(path, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: token, "Content-Type": "application/json" }, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) throw new Error(body?.message || body?.error || `请求失败（${res.status}）`);
  if (body && typeof body === "object" && "data" in body && typeof body.data === "object" && body.data !== null && !("status" in body)) return body.data as T;
  return body as T;
}

/** 走平台预算单：preview 估价（免费自动放行）→ 用户确认上限 → authorize 拿预算号 */
async function authorizeBudget(preview: BillingPreview, points: number | null): Promise<string> {
  const freeOnly = preview.free === true && preview.quote?.yuan === 0 && !!preview.modelId;
  const usePoints = freeOnly ? 0.001 : points;
  if (usePoints === null || !Number.isFinite(usePoints) || usePoints <= 0) throw new Error("已取消，未提交模型请求");
  const authorized = await cvFetch<{ id: string }>("/api/billing/authorize", {
    method: "POST",
    body: JSON.stringify({ path: "/api/canvas-video", points: usePoints, model: preview.modelId, freeOnly, automatic: freeOnly }),
  });
  if (!/^[0-9a-f-]{36}$/.test(authorized?.id || "")) throw new Error("预算授权失败，未提交模型请求");
  return authorized.id;
}

/** 当前参数实际会发的请求体（估价与提交共用同一口径）；用户选的值优先，没选回退 schema 默认 */
function videoBody(m: CatalogModel, prompt: string, v: Values, mode: string, media: MediaRefs, inputMode?: string) {
  const sc = (m.paramSchema ?? {}) as Schema;
  const eff = (opts: string[], chosen?: string, schemaPick?: string) => (chosen != null && opts.includes(String(chosen)) ? String(chosen) : schemaPick);
  const durEnum = (sc.duration as Field | undefined)?.enum?.map(String) ?? (sc.duration as Field | undefined)?.options?.map((o) => String(o.value)) ?? [];
  const resEnum = (sc.resolution as Field | undefined)?.enum?.map(String) ?? (sc.resolution as Field | undefined)?.options?.map((o) => String(o.value)) ?? [];
  const ratioEnum = (sc.aspect_ratio as Field | undefined)?.enum?.map(String) ?? (sc.aspect_ratio as Field | undefined)?.options?.map((o) => String(o.value)) ?? [];
  const seconds = Math.max(1, Math.min(60, Math.floor(Number(eff(durEnum, v.seconds, pickOf(sc, "duration", v, mode)) ?? 5) || 5)));
  const resolution = eff(resEnum, v.res, pickOf(sc, "resolution", v, mode));
  const ratio = eff(ratioEnum, v.ratio, pickOf(sc, "aspect_ratio", v, mode)) ?? (mfVideoCaps(m).ratios[0] ?? "16:9");
  const body: Record<string, unknown> = {
    prompt, model: m.id, duration: seconds,
    resolution: resolution || undefined, aspect_ratio: ratio,
    images: media.images, videos: media.videos, audios: media.audios,
    ...bodyParams(sc, v, inputMode, HANDLED),
  };
  if (inputMode) body.mode = inputMode;
  else if (v.modeVal) body.mode = v.modeVal;   // std/pro 这类「画质档」模式字段
  return { body, seconds, resolution: resolution || undefined, ratio };
}

export function VideoStudio() {
  const addWork = useStudio((s) => s.addWork);
  const updateWork = useStudio((s) => s.updateWork);
  const works = useStudio((s) => s.works);
  const select = useStudio((s) => s.select);
  /** 预算确认弹窗：submit 流程里以 Promise 等用户给上限 */
  const [bill, setBill] = useState<{ preview: BillingPreview; points: number; resolve: (v: number | null) => void } | null>(null);
  const confirm = useCallback((p: BillingPreview) => new Promise<number | null>((resolve) => setBill({ preview: p, points: p.budget.defaultPoints, resolve })), []);
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const previewKey = useRef("");

  /** 估价：预计 = 单条报价 × 数量；最高按按秒线路的最长可选时长折算（造物同款口径） */
  const estimate = useCallback((m: CatalogModel, v: Values, mode: string, media: { images: number; videos: number; audios: number }) => {
    const sc = (m.paramSchema ?? {}) as Schema;
    const n = Math.max(1, Number(v.n ?? pickOf(sc, "count", v, mode) ?? 1) || 1);
    const { body } = videoBody(m, "", v, mode, { images: [], videos: [], audios: [] }, MODE_ORDER.includes(mode) ? mode : undefined);
    const key = JSON.stringify(body) + n;
    if (key !== previewKey.current) {
      previewKey.current = key;
      void cvFetch<BillingPreview>("/api/billing/preview", { method: "POST", body: JSON.stringify({ path: "/api/canvas-video", body: { ...body, inputLength: 20, hasReferenceImage: media.images > 0 || media.videos > 0 } }) }).then((p) => setPreview(p ?? null)).catch(() => setPreview(null));
    }
    const quoteYuan = preview?.quote?.yuan;
    if (!Number.isFinite(quoteYuan as number)) return null;
    const seconds = Number(body.duration) || 5;
    const durations = (sc.duration as Field | undefined)?.enum?.map(Number).filter((x) => x > 0) ?? mfVideoCaps(m).durations;
    const longest = durations.length ? Math.max(...durations) : seconds;
    const maxYuan = m.billingUnit === "per_second" && quoteYuan != null ? quoteYuan * (longest / Math.max(1, seconds)) : quoteYuan ?? 0;
    const n2 = media.videos + media.audios;
    return {
      total: quoteYuan != null && quoteYuan > 0 ? `${(quoteYuan * 10 * n).toFixed(2)} 积分（¥${(quoteYuan * n).toFixed(2)}）` : "免费",
      max: maxYuan > (quoteYuan ?? 0) + 1e-9 ? `${(maxYuan * 10 * n).toFixed(2)} 积分` : undefined,
      rows: [
        ["模型", m.name],
        ["时长 / 清晰度 / 比例", `${seconds}s${body.resolution ? ` · ${String(body.resolution)}` : ""} · ${String(body.aspect_ratio)}`],
        ["生成数量", `${n} 条`],
        ["参考素材", media.images ? `${media.images} 张图` : "", ...(n2 ? [`${n2} 段音视频`] : [])].filter(Boolean),
      ].filter((r) => r[1]) as [string, string][],
      cost: quoteYuan != null ? quoteYuan * n : undefined,
    };
  }, [preview]);

  /** 单条任务的轮询（canvas-video 是服务端持久任务，5 秒一拍直到终态）；终态写一条站内信 */
  const poll = useCallback((id: string, taskId: string) => {
    const settle = (patch: Parameters<typeof updateWork>[1]) => {
      updateWork(id, patch);
      const w = useStudio.getState().works.find((x) => x.id === id);
      if (w) notifyWork(w);
    };
    const timer = setInterval(async () => {
      try {
        const t = await cvFetch<any>(`/api/canvas-video/${taskId}`);
        const status = t?.status;
        if (status === "succeeded") {
          const url = t?.result?.url || t?.result;
          if (typeof url === "string") { settle({ status: "done", url, urls: [url] }); clearInterval(timer); }
        } else if (status === "failed" || status === "cancelled") {
          settle({ status: "failed", error: t?.error || "生成失败，可重试" });
          clearInterval(timer);
        }
      } catch (e) { settle({ status: "failed", error: (e as Error).message }); clearInterval(timer); }
    }, 5000);
  }, [updateWork]);

  // 刷新页面后接着轮询未完成任务
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return; resumed.current = true;
    for (const w of works) {
      if (w.kind !== "video" || !w.taskId) continue;
      if (w.status === "running" || w.status === "pending") poll(w.id, w.taskId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(async (m: CatalogModel, prompt: string, v: Values, mode: string, media: MediaRefs) => {
    const sc = (m.paramSchema ?? {}) as Schema;
    const isInputMode = MODE_ORDER.includes(mode);
    // 前置校验：各模式必需的素材（造物同款话术）
    if (mode === "first-frame" && !media.images.length) { toast.error("请上传一张首帧图"); return false; }
    if (mode === "first-last" && !media.images.some(Boolean)) { toast.error("请先上传首帧"); return false; }
    if (mode === "reference" && !media.images.length) { toast.error("请上传参考图"); return false; }
    if ((mode === "edit" || mode === "extend") && !media.videos.length) { toast.error("编辑或延长模式需要参考视频。"); return false; }
    const n = Math.max(1, Math.min(10, Number(v.n ?? pickOf(sc, "count", v, mode) ?? 1) || 1));
    const { body, seconds, ratio } = videoBody(m, prompt, v, mode, media, isInputMode ? mode : undefined);
    // 预算：第一条弹确认框拿上限；其余条目用同一上限静默授权（整批的钱在估价里已说明）
    const p = await cvFetch<BillingPreview>("/api/billing/preview", { method: "POST", body: JSON.stringify({ path: "/api/canvas-video", body: { ...body, inputLength: prompt.length, hasReferenceImage: media.images.length > 0 } }) });
    if (!p?.budget) throw new Error("计费信息暂不可用，本次未提交，请稍后重试");
    const points = await confirm(p);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      try { ids.push(await authorizeBudget(p, points)); } catch (e) { if (!ids.length) throw e; toast.error(`第 ${i + 1} 条预算授权失败：${(e as Error).message}`); break; }
    }
    if (!ids.length) { toast.error("已取消，未提交模型请求"); return false; }
    for (const billingId of ids) {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      addWork({ id, kind: "video", model: m.id, prompt, createdAt: Date.now(), status: "running", meta: { seconds, size: body.resolution ? String(body.resolution) : undefined, resolution: body.resolution ? String(body.resolution) : undefined, ratio, mode: MODE_META[mode]?.label ?? (v.modeVal ? `画质 ${v.modeVal}` : "文生视频"), modeKey: mode, params: v, refs: media.images.length ? media.images : undefined } });
      try {
        const resp = await cvFetch<any>("/api/canvas-video", {
          method: "POST",
          headers: { "X-Xoi-Billing-Id": billingId },
          body: JSON.stringify(body),
        });
        const taskId = resp?.task_id || resp?.id;
        if (!taskId) throw new Error(resp?.error || resp?.message || "任务提交失败");
        if (typeof resp?.pointsDeducted === "number" && resp.pointsDeducted > 0) toast.success(`已提交，预扣 ${resp.pointsDeducted} 积分`);
        updateWork(id, { taskId });
        poll(id, taskId);
      } catch (e) {
        updateWork(id, { status: "failed", error: (e as Error).message });
        notifyWork({ id, kind: "video", prompt, status: "failed", error: (e as Error).message });
        toast.error((e as Error).message);
      }
    }
  }, [addWork, updateWork, poll, confirm]);

  /** 从 param_schema 推导模式 tab 与每个模式下的参考素材上传格（造物 schemaModes 同款） */
  const modesFor = useCallback((m: CatalogModel): MediaMode[] | undefined => {
    const sc = (m.paramSchema ?? {}) as Schema;
    const f = sc.mode as (Field & { options?: { value: string; is_default?: boolean }[] }) | undefined;
    const keys = (f?.enum ?? f?.options?.map((o) => String(o.value)) ?? []).map(String);
    const inputKeys = keys.filter((k) => MODE_ORDER.includes(k));
    // mode 是画质档（std/pro）而不是输入方式：不产生 tab，渲染成参数胶囊（renderParams）
    if (!inputKeys.length) {
      if (!keys.length) return undefined;
      // 无 schema 的老线路：按 mfVideoCaps 兜底
      return undefined;
    }
    const up = (k: "images" | "videos" | "audios") => sc[k] as (Field & { max_items_by_mode?: Record<string, number>; label?: { zh?: string } }) | undefined;
    const cap = (field: { max_items_by_mode?: Record<string, number>; max_items?: number } | undefined, k: string, dflt: number) =>
      field?.max_items_by_mode ? (field.max_items_by_mode[k] ?? 0) : k === "text-to-video" ? 0 : (field?.max_items ?? dflt);
    const tile = (kind: "image" | "video" | "audio", max: number, label: string, required: boolean): RefTile => ({ kind, max, label, aria: `上传${label}`, required });
    const idx = (k: string) => { const i = MODE_ORDER.indexOf(k); return i < 0 ? 100 + keys.indexOf(k) : i; };
    return [...inputKeys].sort((a, b) => idx(a) - idx(b)).map((k) => {
      const meta = MODE_META[k];
      const tiles: RefTile[] = [];
      const imgCap = cap(up("images"), k, k === "reference" ? 9 : 3);
      if (imgCap > 0) tiles.push(tile("image", imgCap, k === "first-frame" || k === "first-last" ? (k === "first-last" ? "首尾帧" : "首帧") : up("images")?.label?.zh ?? "参考图片", k !== "text-to-video"));
      const vidCap = cap(up("videos"), k, 0);
      if (vidCap > 0) tiles.push(tile("video", vidCap, up("videos")?.label?.zh ?? "参考视频", true));
      const audCap = cap(up("audios"), k, 0);
      if (audCap > 0) tiles.push(tile("audio", audCap, up("audios")?.label?.zh ?? "参考音频", false));
      const opt = f?.options?.find((o) => String(o.value) === k);
      return { key: k, label: meta?.label ?? opt?.label ?? k, icon: meta?.icon ?? Layers, desc: meta?.desc, tiles, default: opt?.is_default || f?.default === k };
    });
  }, []);

  /** 无 schema 线路的兜底模式（老 mfVideoCaps 逻辑） */
  const fallbackModes = useCallback((m: CatalogModel): MediaMode[] => {
    const caps = mfVideoCaps(m);
    const list: MediaMode[] = [{ key: "text-to-video", label: MODE_META["text-to-video"].label, icon: Film, desc: MODE_META["text-to-video"].desc }];
    if (caps.frame === "first-frame") list.push({ key: "first-frame", label: MODE_META["first-frame"].label, icon: ImageIcon, desc: MODE_META["first-frame"].desc, refs: 1, refLabel: "上传首帧" });
    if (caps.frame === "reference" || caps.frame === "first-frame") list.push({ key: "reference", label: MODE_META.reference.label, icon: Layers, desc: MODE_META.reference.desc, refs: 3, refLabel: "上传参考图片" });
    return list;
  }, []);

  /** 参数胶囊（造物 video renderParams 同款：清晰度置前高亮、时长、比例、数量，其余进 ParamPills） */
  const renderParams = useCallback((m: CatalogModel, v: Values, set: (k: string, s: string) => void, mode: string) => {
    const sc = (m.paramSchema ?? {}) as Schema;
    const hasSchema = Object.keys(sc).length > 0;
    // 清晰度放第一个、始终高亮（它决定画质也决定价格）
    const resOpts = hasSchema ? optionsOf(sc, "resolution", v, mode).map((o) => ({ ...o, label: o.label.toUpperCase() })) : [];
    const durEnum = (sc.duration as Field | undefined)?.enum?.map(String) ?? (sc.duration as Field | undefined)?.options?.map((o) => String(o.value)) ?? [];
    const durOpts = (durEnum.length ? durEnum : (mfVideoCaps(m).durations.length ? mfVideoCaps(m).durations.map(String) : ["5", "10"])).map((d) => ({ value: d, label: `${d}s` }));
    const curDur = durOpts.some((o) => o.value === String(v.seconds)) ? String(v.seconds) : (pickOf(sc, "duration", v, mode) ?? durOpts[0]?.value);
    const ratioOpts = hasSchema && sc.aspect_ratio ? optionsOf(sc, "aspect_ratio", v, mode) : (mfVideoCaps(m).ratios.length ? mfVideoCaps(m).ratios.map((r) => ({ value: r, label: r })) : [{ value: "16:9", label: "横屏 16:9" }, { value: "9:16", label: "竖屏 9:16" }, { value: "1:1", label: "方形 1:1" }]);
    const curRatio = ratioOpts.some((o) => o.value === v.ratio) ? v.ratio : (pickOf(sc, "aspect_ratio", v, mode) ?? ratioOpts[0]?.value);
    const countMax = (sc.count as Field | undefined)?.max ?? 10;
    const modeField = sc.mode as (Field & { label?: { zh?: string } }) | undefined;
    const modeIsQuality = modeField && !(modeField.enum ?? modeField.options?.map((o) => String(o.value)) ?? []).some((k) => MODE_ORDER.includes(String(k)));
    return (
      <>
        {resOpts.length === 1 ? (
          <span data-param-fixed="true" className="inline-flex h-8 max-w-full shrink-0 cursor-default select-none items-center gap-1.5 rounded-full border border-border bg-transparent px-3 text-[12px] font-medium text-foreground sm:h-9" title={`清晰度: ${resOpts[0].label} · 固定值 · 该线路只出这一种清晰度`}><span className="text-muted-foreground">清晰度</span><b className="font-semibold">{resOpts[0].label}</b></span>
        ) : resOpts.length > 1 && (
          <ParamSelect label="清晰度" value={(resOpts.some((o) => o.value === v.res) ? v.res : (pickOf(sc, "resolution", v, mode) ?? resOpts[0].value)) ?? ""} options={resOpts} onChange={(x) => set("res", x)} className={PILL} active accent />
        )}
        {modeIsQuality && modeField && (
          <ParamSelect label={modeField.label?.zh ?? "画质档"} value={v.modeVal ?? String(modeField.default ?? (modeField.enum ?? modeField.options?.map((o) => String(o.value)) ?? [])[0])}
            options={optionsOf(sc, "mode", v, mode)} onChange={(x) => set("modeVal", x)} className={PILL} active />
        )}
        {durOpts.length === 1 ? (
          <span data-param-fixed="true" className="inline-flex h-8 max-w-full shrink-0 cursor-default select-none items-center gap-1.5 rounded-full border border-border bg-transparent px-3 text-[12px] font-medium text-foreground sm:h-9" title={`时长: ${durOpts[0].label} · 固定值 · 该模型仅支持此选项`}><span className="text-muted-foreground">时长</span><b className="font-semibold">{durOpts[0].label}</b></span>
        ) : (
          <ParamSelect label="时长" value={curDur ?? ""} options={durOpts} onChange={(x) => set("seconds", x)} className={PILL} active />
        )}
        <ParamSelect label="比例" value={curRatio ?? ""} options={ratioOpts} onChange={(x) => set("ratio", x)} className={PILL} active />
        <ParamSelect label="生成数量" value={v.n ?? "1"} options={countOptions(countMax)} onChange={(x) => set("n", x)} className={PILL} grid />
        {/* 其余 schema 参数（生成音频 / 档位 / 种子…）按类型渲染，可用性跟随模式 */}
        {hasSchema && <ParamPills schema={sc} values={v} onChange={set} mode={mode} exclude={HANDLED} />}
      </>
    );
  }, []);

  return (
    <>
      <MediaPage
        modality="video" label="视频"
        placeholder="描述镜头画面、人物动作与运镜，例如：云海山巅，青衣少年迎着晨光缓缓抬头，镜头缓推"
        modes={[]} modesFor={(m) => modesFor(m) ?? fallbackModes(m)}
        renderParams={renderParams}
        estimate={estimate}
        submit={submit}
        helpPrompt={HELP_PROMPT}
        samples={SAMPLES}
        playbook={<VideoPlaybook />}
        subtitleFor={() => "SEEDANCE 等模型直连生成 · 提交后可关闭页面"}
        chipsExtra={(m) => <ChannelStrategy current={m} className={benchChip()} onPick={(next) => select(next)} />}
      />
      {bill && (
        <BillingConfirm
          bill={bill}
          onCancel={() => { bill.resolve(null); setBill(null); }}
          onOk={(points) => { bill.resolve(points); setBill(null); }}
        />
      )}
    </>
  );
}

function BillingConfirm({ bill, onCancel, onOk }: { bill: { preview: BillingPreview; points: number; resolve: (v: number | null) => void }; onCancel: () => void; onOk: (v: number) => void }) {
  const [points, setPoints] = useState(bill.points);
  const p = bill.preview;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[radial-gradient(48%_42%_at_50%_0,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_72%)] bg-background/60 p-4 backdrop-blur-[18px] animate-in fade-in-0" role="dialog" aria-modal="true" aria-label="生成视频费用确认">
      <div className="w-[min(92vw,440px)] overflow-hidden rounded-shell border border-foreground/10 bg-card shadow-pop animate-in fade-in-0 zoom-in-95">
        <div className="flex flex-col gap-2 border-b border-border/60 px-4 pb-3 pt-5 sm:px-6">
          <div className="flex items-center gap-2 text-[15px] font-semibold"><Info size={16} className="text-primary" />生成视频 · 费用确认</div>
          <p className="text-[12px] leading-[1.6] text-muted-foreground">这是安全上限，不是预扣款；仅按实际用量扣积分</p>
        </div>
        <div className="px-4 py-4 sm:px-6">
          <p className="text-sm"><strong>{p.label}</strong> · {p.model}</p>
          <p className="mt-1 text-sm text-primary-strong">{typeof p.quote?.yuan === "number" && p.quote.yuan > 0 ? `单次参考约 ${(p.quote.yuan * 10).toFixed(2)} 积分（¥${p.quote.yuan.toFixed(2)}）` : "暂无完整预估，不代表免费"}</p>
          <label className="mt-4 flex items-center justify-between gap-3 text-sm font-medium">
            本轮预算上限（积分）
            <input type="number" min={0.001} max={p.budget.maxPoints} step={0.001} value={points} onChange={(e) => setPoints(Number(e.target.value))}
              className="w-32 rounded-xl border border-border px-3 py-2 text-right font-mono text-sm outline-none focus:border-primary/40" />
          </label>
          <p className="mt-3 text-[12px] leading-5 text-muted-foreground">最多 {p.budget.maxCalls} 次调用 · {p.budget.minutes} 分钟内有效 · 1 元 = 10 积分 · 停止只拦截后续调用</p>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4 sm:px-6">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button disabled={!Number.isFinite(points) || points < 0.001 || points > p.budget.maxPoints} onClick={() => onOk(points)}>确认并生成</Button>
        </div>
      </div>
    </div>
  );
}

function VideoPlaybook() {
  return (
    <div className="space-y-4 text-sm leading-6">
      <section><h3 className="font-semibold text-foreground">生成模式</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          <li><b className="text-foreground">文生视频</b>：直接写镜头描述，主体 + 动作 + 场景 + 运镜。</li>
          <li><b className="text-foreground">首帧</b>：上传一张图作为视频起始画面，AI 接着往下拍。</li>
          <li><b className="text-foreground">首尾帧</b>：首帧 + 尾帧都给，AI 补中间的运镜。</li>
          <li><b className="text-foreground">全能参考</b>：上传多张参考图（上限随线路），让人物 / 画风保持一致。</li>
          <li><b className="text-foreground">视频编辑 / 延长</b>：上传一段视频，用文字说改什么或让它继续往后演进（随线路开放）。</li>
        </ul>
      </section>
      <section><h3 className="font-semibold text-foreground">清晰度与时长</h3>
        <p className="mt-1 text-muted-foreground">清晰度决定画质也决定价格；时长按所选线路的档位提供，只出一档的线路显示为固定值。</p>
      </section>
      <section><h3 className="font-semibold text-foreground">计费方式</h3>
        <p className="mt-1 text-muted-foreground">提交前确认本轮预算上限；只按实际用量扣积分，失败自动退回。提交后可以关闭页面，任务在服务器继续跑。</p>
      </section>
      <section><h3 className="font-semibold text-foreground">接镜技巧</h3>
        <p className="mt-1 text-muted-foreground">想续拍：在作品卡点「重新编辑」，换到首帧模式；多镜头保持人物一致：同一批参考图走全能参考。</p>
      </section>
    </div>
  );
}
