"use client";
// 剪辑工作台：方案（片段线）编辑 + 实时预览 + 素材 AI 分析 + 对话式修改 + 浏览器内渲染导出
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Download, Eye, Loader2, RefreshCw, Sparkles, Square, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PillSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ModelPicker } from "@/components/ui/model-picker";
import { defaultVisionModel } from "@/lib/llm";
import { useCatalog } from "@/lib/queries";
import { cn, fmtCny } from "@/lib/utils";
import { analyzable, analyzeAsset, estimateCost, frameCount, sampleFrames } from "./analyze";
import { AssetThumb } from "./asset-list";
import { blobStore } from "./blob-store";
import { canRender, downloadBlob, extOf, renderTimeline, type RenderSegment } from "./engine";
import { FX_LABEL, type FxKind } from "./fx";
import { generatePlan, planDuration, revisePlan } from "./plan";
import { ClipPreview, ratioBox } from "./preview";
import { findTemplate, FITS, fmtDur, fmtSize, now, RATIOS, type AssetAnalysis, type AssetKind, type ClipAsset, type ClipProject, type EditPlan, type FitMode, type RatioKey } from "./types";

const STATUS_LABEL: Record<AssetAnalysis["status"], string> = { pending: "排队", running: "分析中", ready: "已就绪", failed: "失败" };
const STATUS_CLS: Record<AssetAnalysis["status"], string> = { pending: "bg-black/55 text-white", running: "bg-primary text-primary-foreground", ready: "bg-emerald-600 text-white", failed: "bg-danger text-white" };
const KIND_FILTERS: { value: AssetKind | "all"; label: string }[] = [{ value: "all", label: "全部" }, { value: "video", label: "视频" }, { value: "image", label: "照片" }, { value: "audio", label: "音频" }];
/** 打开项目时读出已存的分析结果；上次分析到一半被关掉的（running）退回排队 */
const loadAnalysis = (p: ClipProject) => Object.fromEntries(p.assets.filter((a) => a.analysis).map((a) => [a.id, a.analysis!.status === "running" ? { status: "pending" as const } : a.analysis!]));

export function ClipWorkbench({ project, assets, onBack, onUpdate, initialRender }: { project: ClipProject; assets: ClipAsset[]; onBack: () => void; onUpdate: (p: ClipProject) => void; initialRender?: Blob | null }) {
  const [plan, setPlan] = useState<EditPlan | undefined>(project.plan);
  const [model, setModel] = useState(project.model);
  const [ratio, setRatio] = useState<RatioKey>(project.ratio || "9:16");
  const [keepAudio, setKeepAudio] = useState(true);
  const [request, setRequest] = useState(""); const [thinking, setThinking] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [rendering, setRendering] = useState(false); const [progress, setProgress] = useState({ ratio: 0, phase: "" });
  const [tab, setTab] = useState<"preview" | "result">("preview");
  // 素材分析：结果按素材 id 存一份在本地状态里（assets 是带 blob URL 的运行时对象，父组件不跟着更新），同时写回项目持久化
  const [analysis, setAnalysis] = useState<Record<string, AssetAnalysis>>(() => loadAnalysis(project));
  const [analyzing, setAnalyzing] = useState<{ done: number; total: number } | null>(null); const [confirmAnalyze, setConfirmAnalyze] = useState(false);
  const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all"); const [catFilter, setCatFilter] = useState("");
  const analyzeAbort = useRef<AbortController | null>(null); const alive = useRef(true);
  const { data: catalog } = useCatalog();
  const visionModel = useMemo(() => defaultVisionModel(catalog?.models), [catalog?.models]);
  const liveAssets = useMemo(() => assets.map((a) => (analysis[a.id] ? { ...a, analysis: analysis[a.id] } : a)), [assets, analysis]);
  // 惰性初始化：直接写表达式的话每次重渲染都会 createObjectURL 一次并泄漏
  const [result, setResult] = useState<{ url: string; blob: Blob; mime: string; took: number } | null>(() => (initialRender ? { url: URL.createObjectURL(initialRender), blob: initialRender, mime: initialRender.type, took: 0 } : null));
  const abort = useRef<AbortController | null>(null);
  const resultUrl = useRef(result?.url);
  // 渲染要跑成片那么久，期间可能改了字幕（commit 会更新 project）；导出结束写回时用最新的 project，别拿开始时的旧快照覆盖
  const latest = useRef(project);
  useEffect(() => { resultUrl.current = result?.url; latest.current = project; });
  // 返回「我的项目」时：停掉进行中的渲染 / 规划（否则后台继续录制、结束后还会写回存储），回收成片 URL
  useEffect(() => () => { abort.current?.abort(); if (resultUrl.current) URL.revokeObjectURL(resultUrl.current); }, []);
  // 关掉项目时停掉分析队列：正在分析的那条早就按「排队」存过，下次打开接着排
  useEffect(() => { alive.current = true; return () => { alive.current = false; analyzeAbort.current?.abort(); }; }, []);
  const supported = useMemo(() => canRender(), []);

  // 写回项目一律基于 latest 并立刻更新它：分析队列和规划都是异步的，拿闭包里的旧 project 会互相覆盖（分析结果被一次改字幕冲掉）
  const save = (patch: (cur: ClipProject) => ClipProject) => { const next = patch(latest.current); latest.current = next; onUpdate(next); };
  const commit = (next: EditPlan, bump = true) => { setPlan(next); save((cur) => ({ ...cur, plan: next, title: next.title || cur.title, model, ratio, version: bump ? cur.version + 1 : cur.version })); };
  const fitMode: FitMode = plan?.fit ?? "letterbox";
  const total = plan ? planDuration(plan) : 0;
  const missing = assets.some((a) => a.missing);
  // 只有方案里真正用到的素材丢了才挡导出；丢的是没用上的素材 / BGM，照常导（BGM 缺就不带）
  const missingUsed = !!plan?.segments.some((s) => assets[s.source]?.missing);

  const replan = async (req?: string) => {
    if (!model) return toast.error("请选择文本模型");
    setPlanning(true); const ac = new AbortController(); abort.current = ac;
    try {
      const next = req && plan ? await revisePlan(model, liveAssets, plan, req, { signal: ac.signal }) : await generatePlan(model, liveAssets, project.prompt, project.template, { referenceNames: project.referenceNames, reasoning: thinking, signal: ac.signal });
      // 适配方式是用户在工具栏选的，模型不管这个：重新规划沿用当前设置
      commit({ ...next, fit: next.fit ?? plan?.fit }); setRequest(""); toast.success(`AI 剪辑师写入了 v${latest.current.version}`);
    } catch (e) { const err = e as Error; if (err.name !== "AbortError") toast.error(err.message); }
    finally { setPlanning(false); abort.current = null; }
  };

  const render = async () => {
    if (!plan?.segments.length) return toast.error("先加一段素材再导出");
    if (missingUsed) return toast.error("方案里用到的素材文件不在浏览器里，删掉标着「文件丢失」的片段，或回到首页重新上传后再导出");
    const r = RATIOS.find((x) => x.value === ratio)!;
    const segs: RenderSegment[] = plan.segments.map((s) => ({ asset: assets[s.source], start: s.start, end: s.end, caption: s.caption, fx: s.fx, fit: s.fit })).filter((s) => s.asset && !s.asset.missing);
    setRendering(true); setProgress({ ratio: 0, phase: "探测浏览器能力" }); const ac = new AbortController(); abort.current = ac;
    try {
      const bgm = plan.bgm !== undefined && assets[plan.bgm]?.kind === "audio" ? { asset: assets[plan.bgm], volume: 0.35 } : undefined;
      const out = await renderTimeline(segs, { width: r.w, height: r.h, transition: "fade", fit: fitMode, keepAudio, bgm, title: plan.title, signal: ac.signal, onProgress: (ratio, phase) => setProgress({ ratio, phase }) });
      if (result) URL.revokeObjectURL(result.url);
      setResult({ url: out.url, blob: out.blob, mime: out.mime, took: out.duration }); setTab("result");
      await blobStore.put(`render-${project.id}`, out.blob);
      save((cur) => ({ ...cur, ratio, model, rendered: { duration: total, size: out.blob.size, mime: out.mime, at: now() } }));
      toast.success("导出完成");
    } catch (e) { const err = e as Error; if (!ac.signal.aborted) toast.error(err.message || "导出失败"); else toast.info("已取消导出"); }
    finally { setRendering(false); abort.current = null; }
  };

  const updateSeg = (i: number, patch: Partial<EditPlan["segments"][number]>) => { if (!plan) return; const segments = plan.segments.map((s, k) => (k === i ? { ...s, ...patch } : s)); commit({ ...plan, segments }); };
  const move = (i: number, d: -1 | 1) => { if (!plan) return; const j = i + d; if (j < 0 || j >= plan.segments.length) return; const segments = [...plan.segments]; [segments[i], segments[j]] = [segments[j], segments[i]]; commit({ ...plan, segments }); };
  const del = (i: number) => { if (!plan) return; if (plan.segments.length <= 1) return toast.error("至少保留一段"); commit({ ...plan, segments: plan.segments.filter((_, k) => k !== i) }); };
  const addAsset = (idx: number) => { if (!plan) return; const a = assets[idx]; commit({ ...plan, segments: [...plan.segments, { source: idx, start: 0, end: a.kind === "image" ? 3 : Math.min(a.duration || 3, 3), caption: "" }] }); };
  const tpl = findTemplate(project.template)?.label ?? project.template;

  // ---- 素材 AI 分析 ----
  const writeAnalysis = (entries: [string, AssetAnalysis][]) => {
    setAnalysis((cur) => ({ ...cur, ...Object.fromEntries(entries) }));
    // running 只放内存：存成 pending，页面中途关掉下次打开就是「排队」；项目关掉以后不再写存储
    const stored = entries.filter(([, a]) => a.status !== "running"); if (!stored.length || !alive.current) return;
    const by = new Map(stored); save((cur) => ({ ...cur, assets: cur.assets.map((a) => (by.has(a.id) ? { ...a, analysis: by.get(a.id) } : a)) }));
  };
  const toAnalyze = liveAssets.filter((a) => analyzable(a) && a.analysis?.status !== "ready");
  const analyzeFrames = toAnalyze.map(frameCount);
  const analyzeCost = estimateCost(visionModel, analyzeFrames);
  const runAnalysis = async () => {
    if (!visionModel || !toAnalyze.length || analyzeAbort.current) return;
    const list = toAnalyze; setConfirmAnalyze(false);
    writeAnalysis(list.map((a) => [a.id, { status: "pending" }]));
    const ac = new AbortController(); analyzeAbort.current = ac; let ok = 0, failed = 0, stopped = "";
    for (let k = 0; k < list.length && !ac.signal.aborted; k++) {
      const a = list[k]; setAnalyzing({ done: k, total: list.length }); writeAnalysis([[a.id, { status: "running" }]]);
      try { const frames = await sampleFrames(a, ac.signal); writeAnalysis([[a.id, await analyzeAsset(visionModel.id, a, frames, ac.signal)]]); ok++; }
      catch (e) {
        if (ac.signal.aborted) { writeAnalysis([[a.id, { status: "pending" }]]); break; }
        const err = e as Error & { status?: number }; writeAnalysis([[a.id, { status: "failed", error: err.message || "分析失败" }]]); failed++;
        // 余额 / 登录 / 权限问题后面每条都会一样失败：停下队列，剩下的留在排队里
        if (err.status === 401 || err.status === 402 || err.status === 403 || /余额|额度|登录/.test(err.message)) { stopped = err.message; break; }
      }
    }
    analyzeAbort.current = null; if (!alive.current) return; setAnalyzing(null);
    if (ac.signal.aborted) toast.info("已停止分析，没分析的素材留在排队里");
    else if (stopped) toast.error(`分析已暂停：${stopped}`);
    else toast.success(`素材分析完成：${ok} 条已就绪${failed ? `，${failed} 条失败` : ""}`);
  };
  const categories = [...new Set(liveAssets.map((a) => (a.analysis?.status === "ready" ? a.analysis.category : undefined)).filter((c): c is string => !!c))];
  const shownAssets = liveAssets.map((a, i) => ({ a, i })).filter(({ a }) => (kindFilter === "all" || a.kind === kindFilter) && (!catFilter || a.analysis?.category === catFilter));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-tile border bg-card px-3 py-2 shadow-soft">
        <button onClick={onBack} className="chip h-9 hover:bg-muted"><ArrowLeft size={15} />我的项目</button>
        <input value={plan?.title ?? project.title} onChange={(e) => plan && setPlan({ ...plan, title: e.target.value })} onBlur={() => plan && commit(plan, false)} className="h-9 min-w-[180px] flex-1 rounded-xl border bg-card px-3 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-ring/40 sm:flex-none" placeholder="未命名剪辑" />
        <span className="chip h-9 text-xs text-muted-foreground">模板 · {tpl}</span>
        <span className="chip h-9 text-xs text-muted-foreground" title="版本线：每次改动一版">v{project.version}</span>
        <span className="chip h-9 text-xs text-muted-foreground">{plan?.segments.length ?? 0} 段 · {fmtDur(total)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PillSelect label="画幅" value={ratio} options={RATIOS.map((r) => ({ value: r.value, label: r.label, description: `${r.w}×${r.h}` }))} onChange={(v) => { setRatio(v as RatioKey); save((cur) => ({ ...cur, ratio: v as RatioKey })); }} className="h-9" />
          <PillSelect label="适配" value={fitMode} options={FITS} onChange={(v) => plan && commit({ ...plan, fit: v as FitMode })} className="h-9" />
          <label className="chip h-9 gap-2 text-xs"><Switch checked={keepAudio} onCheckedChange={setKeepAudio} />保留原声</label>
          {rendering ? <Button variant="secondary" onClick={() => abort.current?.abort()}><Square size={14} />取消</Button> : <Button onClick={render} disabled={!plan?.segments.length || !supported}><Download size={14} />导出成片</Button>}
        </div>
      </div>
      {!supported && <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">这个浏览器导不了片：导出在你的电脑上完成，需要浏览器支持视频编码。预览、编辑、对话都不受影响，请用最新版 Chrome 或 Edge 导出。</div>}
      {missing && <div className="rounded-2xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm">部分素材文件已不在浏览器里（清理过站点数据或换了浏览器）。方案仍可查看与修改，导出前请回到首页新建项目重新上传。</div>}
      {total > 180 && <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">超过 3 分钟上限，导出前先缩短</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <section className="pane p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">成片片段线</h2><span className="text-xs text-muted-foreground">改动、预览、导出免费 · AI 写方案和分析素材按模型计费</span></div>
          {plan?.summary && <p className="mt-1 text-sm text-muted-foreground">{plan.summary}</p>}
          <div className="mt-3 space-y-2">
            {!plan?.segments.length && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">还没有片段 — 在下面说说要剪成什么样，或从素材库把片段加进来</div>}
            {plan?.segments.map((s, i) => { const a = assets[s.source]; return (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-background/60 p-2">
                <span className="w-10 text-center text-xs font-medium text-muted-foreground">第 {i + 1} 段</span>
                {a ? <AssetThumb a={a} className="h-12 w-16" /> : <span className="h-12 w-16 rounded-xl bg-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-muted-foreground">{a?.name ?? "（素材缺失）"}</div>
                  <input value={s.caption ?? ""} onChange={(e) => updateSeg(i, { caption: e.target.value })} placeholder="这段的字幕…" className="mt-1 h-8 w-full rounded-lg border bg-card px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40" />
                  <div className="mt-1 flex items-center gap-1.5">
                    <select aria-label="动效组件" value={s.fx?.kind ?? ""} onChange={(e) => { const k = e.target.value as FxKind | ""; updateSeg(i, { fx: k ? { kind: k, text: s.fx?.text || (k === "number" ? "100+" : k === "sticker" ? "点赞关注" : "标题") } : undefined }); }} className="h-7 rounded-lg border bg-card px-1.5 text-xs outline-none">
                      <option value="">无动效</option>{(Object.keys(FX_LABEL) as FxKind[]).map((k) => <option key={k} value={k}>{FX_LABEL[k]}</option>)}
                    </select>
                    {s.fx && <input value={s.fx.text} maxLength={20} onChange={(e) => updateSeg(i, { fx: { ...s.fx!, text: e.target.value } })} placeholder={s.fx.kind === "number" ? "要含数字，如 3000+ 人打卡" : "动效文字"} aria-label="动效文字" className="h-7 min-w-0 flex-1 rounded-lg border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-ring/40" />}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {a?.kind === "video" ? <>
                    <span className="text-muted-foreground">入点</span><input type="number" step="0.1" min={0} max={a.duration} value={s.start} onChange={(e) => updateSeg(i, { start: Math.max(0, Math.min(+e.target.value, s.end - 0.5)) })} className="h-8 w-16 rounded-lg border bg-card px-1.5 outline-none" />
                    <span className="text-muted-foreground">出点</span><input type="number" step="0.1" min={0} max={a.duration} value={s.end} onChange={(e) => updateSeg(i, { end: Math.min(a.duration || 1e9, Math.max(+e.target.value, s.start + 0.5)) })} className="h-8 w-16 rounded-lg border bg-card px-1.5 outline-none" />
                  </> : <><span className="text-muted-foreground">展示</span><input type="number" step="0.5" min={1} max={8} value={s.end} onChange={(e) => updateSeg(i, { end: Math.max(1, Math.min(8, +e.target.value)) })} className="h-8 w-16 rounded-lg border bg-card px-1.5 outline-none" /><span className="text-muted-foreground">秒</span></>}
                </div>
                <div className="flex items-center">
                  <button onClick={() => move(i, -1)} className="icon-btn h-8 w-8 hover:bg-muted" aria-label="上移"><ArrowUp size={14} /></button>
                  <button onClick={() => move(i, 1)} className="icon-btn h-8 w-8 hover:bg-muted" aria-label="下移"><ArrowDown size={14} /></button>
                  <button onClick={() => del(i)} className="icon-btn h-8 w-8 text-danger hover:bg-danger/10" aria-label="删除"><Trash2 size={14} /></button>
                </div>
              </div>); })}
          </div>
          <div className="mt-4 rounded-2xl border bg-muted/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Wand2 size={15} className="text-primary" />AI 剪辑师</div>
            <textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={3} placeholder="告诉 AI 剪辑师怎么改，比如：节奏再快一点，多用日落的镜头，字幕改成第一人称…" className="w-full rounded-xl border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ModelPicker category="chat" value={model} onChange={setModel} />
              <button onClick={() => setThinking(!thinking)} className={cn("chip h-10 rounded-2xl text-sm hover:bg-muted", thinking && "chip-active")}>深度思考</button>
              {planning ? <Button variant="secondary" onClick={() => abort.current?.abort()}><Square size={14} />停止</Button> : <>
                <Button onClick={() => replan(request.trim())} disabled={!request.trim()}><Sparkles size={14} />按要求修改</Button>
                <Button variant="secondary" onClick={() => replan()}><RefreshCw size={14} />重新规划</Button>
              </>}
              {planning && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" />AI 剪辑师正在写方案…</span>}
            </div>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">素材库（{assets.length} 个） · 点一张加到成片末尾</summary>
            {visionModel && (
              <div className="mt-2 rounded-2xl border bg-muted/40 p-3 text-xs">
                {analyzing ? <div className="flex flex-wrap items-center gap-2"><Loader2 size={13} className="animate-spin text-primary" /><span className="font-medium">正在分析 {analyzing.done + 1}/{analyzing.total} 条</span><span className="text-muted-foreground">分析在后台跑，已分析好的可以先用</span><Button variant="secondary" size="sm" className="ml-auto" onClick={() => analyzeAbort.current?.abort()}><Square size={12} />停止</Button></div>
                  : confirmAnalyze ? <div className="space-y-2">
                    <div>用 <b>{visionModel.name}</b> 看 {toAnalyze.length} 条素材（约 {analyzeFrames.reduce((x, y) => x + y, 0)} 帧缩略画面），按内容归类并标出高光片段。</div>
                    {analyzeCost === null && <div className="text-danger">这个模型暂时没有可用的标价，没法先给你估价，所以先不开放分析。</div>}
                    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={analyzeCost === null} onClick={runAnalysis}><Eye size={13} />{analyzeCost === null ? "价格未知" : `预计${analyzeCost < 0.01 ? "不到 ¥0.01" : ` ${fmtCny(analyzeCost)}`} · 开始分析`}</Button><Button size="sm" variant="secondary" onClick={() => setConfirmAnalyze(false)}>取消</Button></div>
                    <div className="text-muted-foreground">按实际用量扣费，估价只是粗算；失败不收费。</div>
                  </div>
                  : toAnalyze.length ? <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">让 AI 看一遍素材画面：按内容归类、标出高光，剪辑方案会优先用高光片段。</span><Button size="sm" className="ml-auto" onClick={() => setConfirmAnalyze(true)}><Eye size={13} />AI 分析素材（{toAnalyze.length} 条）</Button></div>
                  : <span className="text-muted-foreground">{liveAssets.some((a) => a.analysis?.status === "ready") ? "素材都分析好了 · 重新规划时 AI 会按画面内容和高光挑片段" : "没有可分析的视频或照片"}</span>}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {KIND_FILTERS.map((f) => <button key={f.value} onClick={() => setKindFilter(f.value)} className={cn("chip h-7 text-xs hover:bg-muted", kindFilter === f.value && "chip-active")}>{f.label}</button>)}
              {categories.length > 0 && <select aria-label="内容类别" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-7 rounded-lg border bg-card px-1.5 text-xs outline-none"><option value="">全部类别</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {shownAssets.map(({ a, i }) => { const an = a.analysis; const hl = an?.status === "ready" && a.kind === "video" ? an.highlights?.length ?? 0 : 0; return (
                <button key={a.id} disabled={a.kind === "audio" || a.missing} onClick={() => addAsset(i)} title={an?.status === "failed" ? an.error : an?.summary} className="flex flex-col items-start gap-1 rounded-xl border p-1.5 text-left hover:bg-muted disabled:opacity-50">
                  <span className="relative w-full"><AssetThumb a={a} className="h-14 w-full" />{an && <span className={cn("absolute left-1 top-1 rounded px-1 text-[10px] leading-4", STATUS_CLS[an.status])}>{STATUS_LABEL[an.status]}</span>}</span>
                  <span className="w-full truncate text-[11px] text-muted-foreground">{a.kind === "audio" ? "🎵 " : ""}{a.name}</span>
                  {an?.status === "ready" && <span className="flex w-full items-center gap-1 truncate text-[10px] text-muted-foreground"><span className="rounded bg-primary-tint px-1 text-accent-foreground">{an.category}</span>{hl > 0 && <span>{hl} 段可用</span>}</span>}
                </button>); })}
              {!shownAssets.length && <div className="col-span-full py-4 text-center text-xs text-muted-foreground">没有符合筛选的素材</div>}
            </div>
          </details>
        </section>

        {/* 预览栏跟着页面滚动停在顶栏下方：片段线很长时，改字幕、调入出点也能一直看着预览 */}
        <aside className="space-y-3 lg:sticky lg:top-[72px] lg:self-start">
          <div className="pane overflow-hidden p-0">
            <div className="flex items-center gap-1 border-b px-2 py-1.5" role="tablist" aria-label="预览与成片">
              {(["preview", "result"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("chip h-8 text-xs hover:bg-muted", tab === k && "chip-active")}>{k === "preview" ? "预览" : "成片"}</button>)}
              <span className="ml-auto pr-1 text-[11px] text-muted-foreground">{tab === "preview" ? "改即所见 · 预览不出声" : result ? "上次导出的成片" : "还没导出"}</span>
            </div>
            {/* 预览切走时只隐藏不卸载：卸载会释放所有解码中的视频，切回来要重新加载 */}
            <ClipPreview className={cn(tab !== "preview" && "hidden")} plan={plan} assets={assets} ratio={ratio} suspended={rendering || tab !== "preview"} suspendedText={rendering ? "渲染中，预览已暂停" : undefined} />
            {tab === "result" && <div className={cn("relative grid place-items-center bg-black", ratioBox(ratio))}>
              {result ? <video src={result.url} controls playsInline className="h-full w-full object-contain" /> : <div className="p-6 text-center text-sm text-white/70">{rendering ? "渲染中…" : "点「导出成片」在你的浏览器里渲染，成片会显示在这里"}</div>}
            </div>}
            {rendering && (
              <div className="p-4">
                <div className="flex items-center justify-between text-sm"><span className="font-medium">正在导出 · 在你的浏览器里渲染</span><span className="text-muted-foreground">{Math.round(progress.ratio * 100)}%</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress.ratio * 100}%` }} /></div>
                <div className="mt-2 text-xs text-muted-foreground">{progress.phase} · 预计 {Math.max(1, Math.round(total * (1 - progress.ratio)))}s</div>
                <div className="mt-2 text-xs text-muted-foreground">请保持这个标签页在前台，切到后台浏览器会限速甚至暂停渲染。</div>
              </div>
            )}
            {tab === "result" && result && !rendering && (
              <div className="p-4">
                <div className="text-sm font-medium">导出完成</div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <dt>时长</dt><dd className="text-foreground">{fmtDur(total)}</dd>
                  <dt>大小</dt><dd className="text-foreground">{fmtSize(result.blob.size)}</dd>
                  <dt>规格</dt><dd className="text-foreground">{RATIOS.find((r) => r.value === ratio)?.w} × {RATIOS.find((r) => r.value === ratio)?.h} · 30fps · {result.mime.includes("mp4") ? "H.264" : "WebM"}</dd>
                  <dt>渲染耗时</dt><dd className="text-foreground">{result.took ? `${result.took.toFixed(0)}s · 本机` : "已保存"}</dd>
                </dl>
                <div className="mt-3 flex gap-2"><Button className="flex-1" onClick={() => downloadBlob(result.blob, `${plan?.title || project.title || "成片"}.${extOf(result.mime)}`)}><Download size={14} />下载 {extOf(result.mime)}</Button><Button variant="secondary" onClick={render}>再导一版</Button></div>
                <p className="mt-2 text-xs text-muted-foreground">抖音 / 小红书 / 视频号：下载后从平台上传。渲染在你的浏览器里完成，不收费。</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
