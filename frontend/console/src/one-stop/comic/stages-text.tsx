"use client";
// 文本阶段：00 圣经 / 01 输入 / 02 意图 / 03 方向 / 04 大纲 / 05 小说
import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ImagePlus, Loader2, Pencil, Plus, RefreshCw, Sparkles, Square, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PillSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { extractIntent, generateBible, generateOutline, proposeDirections, writeNovelChapter } from "./pipeline";
import { shrinkImage } from "./video-kit";
import { DurationInput, Field, SegButtons, inputCls, textareaCls } from "./ui";
import { ConfirmBar, Empty, StageHeader, err, type StepProps } from "./stage-kit";
import { COMIC_SCHEDULES, COMIC_SPECS, DURATION_PRESETS, episodeTargetSec, fmtDuration, shotsFor, type ComicBible, type ComicDirection, type ComicIntent, type ComicSchedule, type ComicSpec } from "./types";
import { RatioPicker, RegionPicker, StrategyPicker, StylePicker } from "./pickers";

const IDEAS = ["末世废土里最后一间便利店", "民国探案，主角是个瞎子", "校园日常但每个人都会读心", "被 AI 接管的城市里唯一不用手机的人"];
const EPISODE_OPTS = ["1", "2", "3", "4", "6", "8", "10", "12", "16"].map((v) => ({ value: v, label: `${v} 集` }));
const SCENE_OPTS = ["3", "4", "6", "8", "10"].map((v) => ({ value: v, label: `每集 ${v} 场` }));

/** 制作参数（输入 / 圣经阶段共用） */
function ParamsGrid({ p, save }: Pick<StepProps, "p" | "save">) {
  return (
    <div className="grid gap-3 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-2">
      <Row label="画面风格"><StylePicker value={p.style} onChange={(v) => save((c) => ({ ...c, style: v }))} /></Row>
      <Row label="屏幕方向"><RatioPicker value={p.ratio} onChange={(v) => save((c) => ({ ...c, ratio: v }))} /></Row>
      <Row label="剧集地区"><RegionPicker value={p.region} onChange={(v) => save((c) => ({ ...c, region: v }))} /></Row>
      {/* 调度策略暂收起：后端执行链路尚未消费该字段（接通 generationPolicy 后恢复） */}
      {/* <Row label="调度"><StrategyPicker value={p.strategy} onChange={(v) => save((c) => ({ ...c, strategy: v }))} /></Row> */}
      <Row label="制作规格"><SegButtons size="sm" value={p.spec} options={COMIC_SPECS} onChange={(v: ComicSpec) => save((c) => ({ ...c, spec: v }))} /></Row>
      <Row label="托管"><SegButtons size="sm" value={p.schedule} options={COMIC_SCHEDULES} onChange={(v: ComicSchedule) => save((c) => ({ ...c, schedule: v }))} /></Row>
      <Row label="体量"><span className="flex gap-2"><PillSelect value={String(p.episodeCount)} options={EPISODE_OPTS} onChange={(v) => save((c) => ({ ...c, episodeCount: Number(v) }))} className="h-8 text-xs" /><PillSelect value={String(p.sceneCount)} options={SCENE_OPTS} onChange={(v) => save((c) => ({ ...c, sceneCount: Number(v) }))} className="h-8 text-xs" /></span></Row>
      <Row label="每集时长"><DurationInput size="sm" value={p.episodeSeconds} placeholder="自动" ariaLabel="每集时长" onChange={(sec) => save((c) => ({ ...c, episodeSeconds: sec }))} /></Row>
    </div>
  );
}

/** 每集时长：预设（短 / 中 / 长）+ 自定义「分 + 秒」；空 = 自动（按内容） */
function EpisodeDurationPicker({ value, onChange }: { value?: number; onChange: (sec?: number) => void }) {
  const [custom, setCustom] = useState(false);
  const preset = custom ? "custom" : value == null ? "auto" : DURATION_PRESETS.some((d) => d.value === value) ? String(value) : "custom";
  const opts = [{ value: "auto", label: "自动(按内容)", description: "片长跟着剧本内容走 —— 内容少就出短片,不硬凑时长(避免重复镜头)。" }, ...DURATION_PRESETS.map((d) => ({ value: String(d.value), label: d.label })), { value: "custom", label: "自定义", description: "按「分 + 秒」精确到秒" }];
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <PillSelect label="每集时长" value={preset} options={opts} onChange={(v) => { if (v === "custom") { setCustom(true); return; } setCustom(false); onChange(v === "auto" ? undefined : Number(v)); }} />
      {preset === "custom" && <DurationInput value={value} placeholder="自动" ariaLabel="每集时长" onChange={onChange} />}
    </span>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{label}</span>{children}</div>; }

/* ---------- 01 输入 ---------- */
export function InputStage({ p, save, busy, confirmStage, autopilot }: StepProps) {
  const onCover = async (f?: File) => { if (!f) return; save((c) => ({ ...c, cover: undefined })); const url = await shrinkImage(f, 640); save((c) => ({ ...c, cover: url })); };
  const confirm = () => { if (!p.idea.trim()) { toast.error("先写下你的故事创意"); return; } confirmStage(); if (p.schedule === "自动托管" && !p.done.input) autopilot(); };
  return (
    <div className="space-y-5">
      <StageHeader p={p} stage="input" />
      <div className="grid gap-4 md:grid-cols-[112px_1fr]">
        <label className="relative grid aspect-[3/4] cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-card text-muted-foreground hover:bg-muted" title="封面图">
          {p.cover ? <img src={p.cover} alt="封面图" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus size={18} />封面图<span className="text-[10px]">0/1</span></span>}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
          {p.cover && <button type="button" onClick={(e) => { e.preventDefault(); save((c) => ({ ...c, cover: undefined })); }} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-foreground text-white"><X size={11} /></button>}
        </label>
        <div className="space-y-3">
          <Field label="剧名" hint={`${p.name.length}/100`}><input value={p.name} maxLength={100} onChange={(e) => save((c) => ({ ...c, name: e.target.value }))} placeholder="给这部剧起个名字" className={inputCls} /></Field>
          <Field label="故事创意"><textarea value={p.idea} onChange={(e) => save((c) => ({ ...c, idea: e.target.value, description: e.target.value }))} rows={6} placeholder="想做一部什么漫剧？把故事讲出来 —— 世界观、主角、想要的调性，AI 从大纲一路推到成片" className={textareaCls} /></Field>
          <div className="flex flex-wrap gap-2">{IDEAS.map((i) => <button key={i} onClick={() => save((c) => ({ ...c, idea: i, description: i }))} className="chip h-8 text-xs hover:bg-muted"><Plus size={12} />{i}</button>)}</div>
        </div>
      </div>
      <ParamsGrid p={p} save={save} />
      <ConfirmBar p={p} stage="input" busy={busy} can={!!p.idea.trim()} onConfirm={confirm} hint="可逐步制作，或在后台连续生成并合成 MP4；费用按所选模型实际用量结算，今日消费提醒不打断任务。" />
    </div>
  );
}

/* ---------- 00 圣经（批量剧） ---------- */
export function BibleStage({ p, save, busy, setBusy, confirmStage, redo, autopilot }: StepProps) {
  const b: ComicBible = p.bible ?? { world: "", protagonists: "", style: "", template: "" };
  const set = (patch: Partial<ComicBible>) => save((c) => ({ ...c, bible: { ...(c.bible ?? b), ...patch } }));
  const gen = async () => {
    if (!p.idea.trim()) { toast.error("先在下方写下这个系列的创意"); return; }
    if (!await redo("bible")) return;
    setBusy(true);
    try { const bible = await generateBible(p); save((c) => ({ ...c, bible })); toast.success("系列圣经已生成"); } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  const filled = Object.values(b).some((v) => v.trim());
  const confirm = () => { if (!filled) { toast.error("请先生成或填写系列圣经"); return; } confirmStage(); if (p.schedule === "自动托管" && !p.done.bible) autopilot(); };
  return (
    <div className="space-y-5">
      <StageHeader p={p} stage="bible"><Button variant="secondary" disabled={busy} onClick={gen}>{busy ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />}{filled ? "重新生成圣经" : "AI 生成圣经"}</Button></StageHeader>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <Field label="剧名" hint={`${p.name.length}/100`}><input value={p.name} maxLength={100} onChange={(e) => save((c) => ({ ...c, name: e.target.value }))} placeholder="给这部剧起个名字" className={inputCls} /></Field>
        <Field label="系列创意"><input value={p.idea} onChange={(e) => save((c) => ({ ...c, idea: e.target.value, description: e.target.value }))} placeholder="一句话说明这个系列讲什么" className={inputCls} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {([["world", "世界观", "时代、地点、规则、核心冲突来源"], ["protagonists", "主角设定", "固定角色的姓名、身份、外貌、性格与关系"], ["style", "固定风格", "画面风格、色调、节奏、叙事口吻"], ["template", "每集模板", "每集固定结构与钩子，如 开场悬念 → 冲突升级 → 反转 → 下集预告"]] as const).map(([k, label, ph]) => (
          <Field key={k} label={label}><textarea value={b[k]} rows={5} onChange={(e) => set({ [k]: e.target.value })} placeholder={ph} className={textareaCls} /></Field>
        ))}
      </div>
      <ParamsGrid p={p} save={save} />
      <ConfirmBar p={p} stage="bible" busy={busy} can={filled} onConfirm={confirm} hint="批量剧从系列设定直达剧本；沿用当前项目的模型与制作规格。自动托管会继续制作到成片，按实际用量结算。" />
    </div>
  );
}

/* ---------- 02 意图 ---------- */
const INTENT_FIELDS: { key: keyof ComicIntent; label: string }[] = [{ key: "audience", label: "目标受众" }, { key: "genre", label: "类型" }, { key: "tone", label: "情绪基调" }, { key: "duration", label: "时长目标" }, { key: "sellingPoints", label: "卖点" }];
export function IntentStage({ p, save, busy, setBusy, confirmStage, redo }: StepProps) {
  const fired = useRef(false);
  const run = async (auto = false) => {
    if (!auto && !await redo("intent")) return;
    setBusy(true);
    try { const intent = await extractIntent(p); save((c) => ({ ...c, intent })); if (!auto) toast.success("已重新分析意图"); } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  // XOi 试运行不在切换阶段时自动启动模型；正式生成须由后端预算和任务编排接管。
  const set = (k: keyof ComicIntent, v: string) => save((c) => ({ ...c, intent: { ...(c.intent ?? { audience: "", genre: "", tone: "", duration: "", sellingPoints: "" }), [k]: v } }));
  return (
    <div className="space-y-5">
      <StageHeader p={p} stage="intent"><Button variant="secondary" disabled={busy} onClick={() => run()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}{p.intent ? "重新分析" : "AI 分析意图"}</Button></StageHeader>
      {!p.intent && busy ? <div className="flex items-center gap-2 rounded-2xl border border-dashed py-16 justify-center text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin text-primary" />正在从创意中提炼意图…</div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {INTENT_FIELDS.map((f) => <Field key={f.key} label={f.label} className={f.key === "sellingPoints" ? "md:col-span-2" : ""}>{f.key === "sellingPoints" ? <textarea value={p.intent?.[f.key] ?? ""} rows={3} onChange={(e) => set(f.key, e.target.value)} className={textareaCls} /> : <input value={p.intent?.[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className={inputCls} />}</Field>)}
        </div>
      )}
      <ConfirmBar p={p} stage="intent" busy={busy} can={!!p.intent} onConfirm={confirmStage} />
    </div>
  );
}

/* ---------- 03 方向 ---------- */
export function DirectionStage({ p, save, busy, setBusy, confirmStage, redo }: StepProps) {
  const fired = useRef(false);
  const [custom, setCustom] = useState<ComicDirection>(() => (p.direction?.id === "custom" ? p.direction : { id: "custom", title: "", logline: "", keywords: [] }));
  const run = async (auto = false) => {
    if (!auto && !await redo("direction")) return;
    setBusy(true);
    try { const directions = await proposeDirections(p); save((c) => ({ ...c, directions, direction: c.direction?.id === "custom" ? c.direction : undefined })); if (!auto) toast.success("已重新提出 3 个方向"); } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  // Entering a stage only displays it; generation requires an explicit user action.
  const pick = (d: ComicDirection) => save((c) => ({ ...c, direction: d }));
  const isCustom = p.direction?.id === "custom";
  const setCustomField = (patch: Partial<ComicDirection>) => { const n = { ...custom, ...patch }; setCustom(n); if (isCustom) save((c) => ({ ...c, direction: n })); };
  return (
    <div className="space-y-5">
      <StageHeader p={p} stage="direction"><Button variant="secondary" disabled={busy} onClick={() => run()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{p.directions?.length ? "换一批方向" : "AI 提出方向"}</Button></StageHeader>
      {!p.directions?.length && busy && <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed py-12 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin text-primary" />正在构思 3 个创作方向…</div>}
      <div className="grid gap-3 md:grid-cols-3">
        {(p.directions ?? []).map((d, i) => { const on = p.direction?.id === d.id; return (
          <button key={d.id} onClick={() => pick(d)} className={cn("rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-pop", on ? "border-primary bg-primary-tint/60 ring-2 ring-primary/30" : "bg-card")}>
            <div className="flex items-center gap-2"><span className="rounded-md bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">方向 {i + 1}</span><span className="font-semibold">{d.title}</span>{on && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] text-white"><Check size={11} />已选</span>}</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{d.logline}</p>
            <div className="mt-3 flex flex-wrap gap-1">{d.keywords.map((k) => <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{k}</span>)}</div>
          </button>
        ); })}
      </div>
      <div className={cn("rounded-2xl border p-4", isCustom ? "border-primary bg-primary-tint/40 ring-2 ring-primary/30" : "bg-muted/30")}>
        <div className="flex items-center gap-2"><Pencil size={14} /><span className="font-medium">自己写一个方向</span>{!isCustom && <Button size="sm" variant="soft" className="ml-auto" onClick={() => { if (!custom.title.trim()) { toast.error("先填写方向标题"); return; } pick(custom); }}>使用我的方向</Button>}{isCustom && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] text-white"><Check size={11} />已选</span>}</div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr_1fr]">
          <Field label="标题"><input value={custom.title} onChange={(e) => setCustomField({ title: e.target.value })} className={inputCls} placeholder="方向标题" /></Field>
          <Field label="一句话故事 (logline)"><input value={custom.logline} onChange={(e) => setCustomField({ logline: e.target.value })} className={inputCls} placeholder="主角 + 目标 + 阻碍 + 钩子" /></Field>
          <Field label="风格关键词" hint="顿号分隔"><input value={custom.keywords.join("、")} onChange={(e) => setCustomField({ keywords: e.target.value.split(/[、,，\s]+/).filter(Boolean) })} className={inputCls} placeholder="黑色幽默、雨夜、霓虹" /></Field>
        </div>
      </div>
      <ConfirmBar p={p} stage="direction" busy={busy} can={!!p.direction} onConfirm={confirmStage} hint="选定一个方向后确认，AI 将据此生成分集大纲。" />
    </div>
  );
}

/* ---------- 04 大纲 ---------- */
export function OutlineStage({ p, save, busy, setBusy, confirmStage, redo }: StepProps) {
  const fired = useRef(false);
  const run = async (auto = false) => {
    if (!auto && !await redo("outline")) return;
    setBusy(true);
    try { const outline = await generateOutline(p, p.episodeCount); save((c) => ({ ...c, outline })); if (!auto) toast.success(`已生成 ${outline.episodes.length} 集大纲`); } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  // Do not auto-submit a model request on stage navigation.
  const o = p.outline;
  const setEp = (i: number, patch: Partial<{ title: string; synopsis: string; durationSec?: number }>) => save((c) => ({ ...c, outline: { ...c.outline!, episodes: c.outline!.episodes.map((e, k) => (k === i ? { ...e, ...patch } : e)) } }));
  return (
    <div className="space-y-5">
      <StageHeader p={p} stage="outline">
        <PillSelect label="集数" value={String(p.episodeCount)} options={EPISODE_OPTS} onChange={(v) => save((c) => ({ ...c, episodeCount: Number(v) }))} />
        <EpisodeDurationPicker value={p.episodeSeconds} onChange={(sec) => save((c) => ({ ...c, episodeSeconds: sec }))} />
        <Button variant="secondary" disabled={busy} onClick={() => run()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}{o ? "重新生成大纲" : "AI 生成大纲"}</Button>
      </StageHeader>
      {!o ? (busy ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed py-12 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin text-primary" />正在编排 {p.episodeCount} 集大纲…</div> : <Empty text="点击「AI 生成大纲」按选定方向编排分集。" />) : (
        <div className="space-y-3">
          <Field label="剧名"><input value={o.title} onChange={(e) => save((c) => ({ ...c, outline: { ...c.outline!, title: e.target.value } }))} className={inputCls} /></Field>
          {o.episodes.map((e, i) => (
            <div key={i} className="grid gap-2 rounded-2xl border bg-card p-4 md:grid-cols-[72px_1fr]">
              <div className="font-mono text-sm text-muted-foreground">第 {i + 1} 集</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><input value={e.title} onChange={(ev) => setEp(i, { title: ev.target.value })} className={cn(inputCls, "font-medium")} placeholder="本集标题" /><button onClick={() => save((c) => ({ ...c, outline: { ...c.outline!, episodes: c.outline!.episodes.filter((_, k) => k !== i) } }))} className="icon-btn h-9 w-9 shrink-0 hover:bg-muted hover:text-danger" title="删除本集"><Trash2 size={14} /></button></div>
                <textarea value={e.synopsis} rows={3} onChange={(ev) => setEp(i, { synopsis: ev.target.value })} className={textareaCls} placeholder="本集梗概" />
                {(() => { const target = episodeTargetSec(p, e); return (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-medium">本集总时长</span>
                    <DurationInput size="sm" value={e.durationSec} placeholder={p.episodeSeconds ? String(Math.floor(p.episodeSeconds / 60)) : "跟随"} ariaLabel={`第 ${i + 1} 集总时长`} onChange={(sec) => setEp(i, { durationSec: sec })} />
                    <span className="text-muted-foreground">{e.durationSec ? `约 ${shotsFor(e.durationSec)} 个镜头 · 预计 ${fmtDuration(e.durationSec)}` : target ? `跟随项目大纲 · ${fmtDuration(target)} · 约 ${shotsFor(target)} 个镜头` : "跟随项目大纲 · 自动（按内容）"}</span>
                  </div>
                ); })()}
              </div>
            </div>
          ))}
          <button onClick={() => save((c) => ({ ...c, outline: { ...c.outline!, episodes: [...c.outline!.episodes, { title: `第 ${c.outline!.episodes.length + 1} 集`, synopsis: "" }] } }))} className="chip h-9 hover:bg-muted"><Plus size={14} />添加一集</button>
        </div>
      )}
      <ConfirmBar p={p} stage="outline" busy={busy} can={!!o?.episodes.length} onConfirm={confirmStage} />
    </div>
  );
}

/* ---------- 05 小说 ---------- */
export function NovelStage({ p, save, busy, setBusy, confirmStage, redo, get }: StepProps) {
  const eps = p.outline?.episodes ?? [];
  const chapters = eps.map((e, i) => p.novel?.chapters[i] ?? { title: e.title, text: "" });
  const [live, setLive] = useState<Record<number, string>>({});
  const [writing, setWriting] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null); const stopped = useRef(false);
  useEffect(() => () => { stopped.current = true; abort.current?.abort(); }, []);
  const setChapter = (i: number, text: string) => save((c) => { const arr = (c.outline?.episodes ?? []).map((e, k) => c.novel?.chapters[k] ?? { title: e.title, text: "" }); arr[i] = { ...arr[i], text }; return { ...c, novel: { chapters: arr } }; });
  /** 返回是否写成；用 get() 取最新项目，这样「前情」能带上本轮刚写完的前几集 */
  const writeOne = async (i: number, quiet = false): Promise<boolean> => {
    setWriting(i); setLive((l) => ({ ...l, [i]: "" }));
    abort.current = new AbortController();
    let last = 0;
    try {
      const text = await writeNovelChapter(get(), i, (t) => { setLive((l) => ({ ...l, [i]: t })); const now = Date.now(); if (now - last > 1500) { last = now; setChapter(i, t); } }, abort.current.signal);
      setChapter(i, text); if (!quiet) toast.success(`第 ${i + 1} 集小说已完成`); return true;
    } catch (e) { if (!stopped.current && !/取消|abort/i.test(err(e))) toast.error(`第 ${i + 1} 集：${err(e)}`); return false; }
    finally { setWriting(null); setLive((l) => { const n = { ...l }; delete n[i]; return n; }); }
  };
  // 旧实现用渲染时的 writing（恒为 null）判断停止，点「停止」只掐掉当前集，循环接着写下一集；失败了也照样提示「全部完成」
  const writeAll = async () => {
    if(busy)return;
    const missing=chapters.map((c,i)=>c.text.trim()?-1:i).filter(i=>i>=0);
    if(!missing.length&&!await redo('novel'))return;
    const targets=missing.length?missing:eps.map((_,i)=>i);
    setBusy(true); stopped.current = false; let fail = 0;
    // A failed/cancelled durable task must never start the next paid chapter.
    try { for (const i of targets) {if(stopped.current)break;if(!(await writeOne(i,true))){fail++;break;}} }
    finally { setBusy(false); }
    if (stopped.current) toast.info("已停止后续写作，已提交的本集任务请在上方核对"); else if (fail) toast.error('本集未完成，已停止后续写作；成功正文保留，可核对任务后再补齐。'); else toast.success("全部小说已完成");
  };
  const redoOne = async (i: number) => { if (busy || (chapters[i].text && !await redo("novel"))) return; setBusy(true); stopped.current = false; try { await writeOne(i); } finally { setBusy(false); } };
  if (!eps.length) return <div className="space-y-5"><StageHeader p={p} stage="novel" /><Empty text="还没有大纲，请先回到 04 大纲。" /></div>;
  const allDone = chapters.every((c) => c.text.trim());
  return (
    <div className="space-y-5">
      <StageHeader p={p} stage="novel">
        {writing !== null ? <span className="text-xs text-muted-foreground">正在后台写作 · 如需停止，请使用上方任务中的「停止后续生成」</span> : <Button variant="secondary" disabled={busy} onClick={writeAll}><Sparkles size={16} />{allDone ? "全部重写" : "补齐未完成正文"}</Button>}
      </StageHeader>
      <div className="space-y-4">
        {chapters.map((c, i) => { const text = live[i] ?? c.text; const on = writing === i; return (
          <div key={i} className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center gap-2 bg-muted/60 px-4 py-2 text-sm"><span className="font-mono text-muted-foreground">第 {i + 1} 集</span><span className="font-medium">{eps[i].title}</span><span className="text-xs text-muted-foreground">{text.length} 字</span>{on && <span className="inline-flex items-center gap-1 text-xs text-accent-foreground"><Loader2 size={12} className="animate-spin" />写作中…</span>}
              <button disabled={busy} onClick={() => redoOne(i)} className="chip ml-auto h-8 text-xs hover:bg-muted disabled:opacity-50">{c.text ? <><RefreshCw size={12} />重写本集</> : <><Wand2 size={12} />生成本集</>}</button></div>
            <textarea value={text} readOnly={on} rows={on ? Math.max(8, Math.min(24, text.split("\n").length + 2)) : 8} onChange={(e) => setChapter(i, e.target.value)} placeholder="点击「生成本集」由 AI 按大纲写成小说体正文，也可以直接手写。" className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-7 outline-none" />
          </div>
        ); })}
      </div>
      <ConfirmBar p={p} stage="novel" busy={busy || writing !== null} can={allDone} onConfirm={confirmStage} hint={allDone ? undefined : "每一集都有正文后才能确认。"} />
    </div>
  );
}
