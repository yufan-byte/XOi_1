"use client";
import { useMemo, useRef, useState } from "react";
import "./clip-home.css";
import { Brain, Check, ChevronDown, Clapperboard, Loader2, Mic, Music, Plus, Search, ShoppingBag, Sparkles, Square, Trash2, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell/app-shell";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCatalog } from "@/lib/queries";
import { defaultChatModel } from "@/lib/llm";
import { useCollection } from "@/lib/store-local";
import { cn, dateLabel, timeHM, uid } from "@/lib/utils";
import { AssetList } from "./asset-list";
import { assetSummary, probeFile } from "./assets";
import { blobStore } from "./blob-store";
import { generatePlan } from "./plan";
import { ClipWorkbench } from "./workbench";
import { findTemplate, fmtSize, MODES, SUGGESTIONS, TEMPLATES, type ClipAsset, type ClipProject } from "./types";

const MODE_ICON = { mixcut: Clapperboard, talking: Mic, commerce: ShoppingBag } as const;

export function ClipPage() {
  const { data } = useCatalog();
  const col = useCollection<ClipProject>("clip");
  const [modelSel, setModel] = useState("");
  const model = modelSel || defaultChatModel(data?.models)?.id || "";
  const [prompt, setPrompt] = useState(""); const [thinking, setThinking] = useState(false); const [template, setTemplate] = useState(TEMPLATES[0].value);
  const [tplOpen, setTplOpen] = useState(false); const [modelOpen, setModelOpen] = useState(false); const [modelQ, setModelQ] = useState("");
  const chatModels = useMemo(() => (data?.models ?? []).filter((m) => m.category === "chat" && !m.needsGroup), [data?.models]);
  const modelName = chatModels.find((m) => m.id === model)?.name ?? (model || "选择对话模型");
  const [assets, setAssets] = useState<ClipAsset[]>([]); const [refs, setRefs] = useState<ClipAsset[]>([]);
  const files = useRef(new Map<string, File>());
  const [probing, setProbing] = useState(0); const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null); const refRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [active, setActive] = useState<{ project: ClipProject; assets: ClipAsset[]; render: Blob | null } | null>(null);
  const [opening, setOpening] = useState<string | null>(null); const [drag, setDrag] = useState(false);
  const summary = useMemo(() => assetSummary(assets), [assets]);
  const visual = assets.filter((a) => a.kind !== "audio").length;

  const addFiles = async (list: FileList | File[], to: "assets" | "refs") => {
    const arr = Array.from(list); if (!arr.length) return; setProbing((n) => n + arr.length);
    for (const f of arr) {
      try { const a = await probeFile(f); files.current.set(a.id, f); (to === "assets" ? setAssets : setRefs)((cur) => [...cur, a]); }
      catch (e) { toast.error((e as Error).message); }
      finally { setProbing((n) => n - 1); }
    }
  };
  const removeAsset = (id: string) => { const url = assets.find((a) => a.id === id)?.url; if (url) URL.revokeObjectURL(url); setAssets((c) => c.filter((a) => a.id !== id)); files.current.delete(id); };
  // localStorage 写满时 store-local 会静默吞掉写入：项目看着保存了，刷新就没了。写完回读核对，
  // 失败先去掉缩略图（占大头）再试一次，还不行就明确告诉用户
  const persist = (p: ClipProject) => {
    const saved = (x: ClipProject) => col.upsert(x).updatedAt === col.get(x.id)?.updatedAt;
    if (saved(p) || saved({ ...p, assets: p.assets.map((a) => ({ ...a, thumb: undefined })) })) return;
    toast.error("浏览器本地存储已满，这个项目没能保存（刷新后会丢）。请删掉几个旧项目再试。", { id: "clip-quota" });
  };

  const generate = async () => {
    if (!visual) return toast.error("先上传至少一个视频或照片素材");
    if (!model) return toast.error("暂无可用文本模型");
    setBusy(true); const ac = new AbortController(); abort.current = ac;
    try {
      const plan = await generatePlan(model, assets, prompt.trim(), template, { referenceNames: refs.map((r) => r.name), reasoning: thinking, signal: ac.signal });
      const id = uid();
      const stored = await Promise.all(assets.map((a) => { const f = files.current.get(a.id); return f ? blobStore.put(a.id, f) : Promise.resolve(true); }));
      if (stored.includes(false)) toast.warning("部分素材没能存进浏览器（空间不足或隐私模式），本次可以正常剪辑导出，但关掉页面后需要重新上传", { duration: 8000 });
      const project: ClipProject = { id, title: plan.title || prompt.slice(0, 20) || "未命名剪辑", prompt: prompt.trim(), template, mode: "mixcut", model, assets: assets.map((a) => ({ ...a, url: undefined })), referenceNames: refs.map((r) => r.name), plan: { ...plan, fit: "smart_crop" }, version: 1, createdAt: Date.now(), ratio: findTemplate(template)?.ratio ?? "9:16" };
      persist(project);
      setActive({ project, assets, render: null }); setPrompt(""); setAssets([]); setRefs([]);
      toast.success(`AI 剪辑师写入了 v1 · ${plan.segments.length} 段`);
    } catch (e) { const err = e as Error; if (err.name !== "AbortError") toast.error(err.message); }
    finally { setBusy(false); abort.current = null; }
  };

  const reopen = async (p: ClipProject) => {
    setOpening(p.id);
    try {
      const loaded: ClipAsset[] = await Promise.all(p.assets.map(async (a) => { const b = await blobStore.get(a.id); return b ? { ...a, url: URL.createObjectURL(b) } : { ...a, missing: true }; }));
      const render = (await blobStore.get(`render-${p.id}`)) ?? null;
      setActive({ project: p, assets: loaded, render });
      if (loaded.some((a) => a.missing)) toast.warning("部分素材文件已不在浏览器里，方案可看，导出前需重新上传");
    } catch (e) { toast.error(`打开项目失败：${(e as Error).message || "读取浏览器存储出错"}`); }
    finally { setOpening(null); }
  };
  const delProject = (p: ClipProject) => { if (!confirm("删除这个项目？素材登记、版本线一起删，不可恢复。")) return; col.remove(p.id); p.assets.forEach((a) => blobStore.del(a.id)); blobStore.del(`render-${p.id}`); toast.success("已删除"); };

  if (active) return <AppShell sidebar={false}><ClipWorkbench key={active.project.id} project={active.project} assets={active.assets} initialRender={active.render} onBack={() => { active.assets.forEach((a) => a.url && URL.revokeObjectURL(a.url)); setActive(null); }} onUpdate={(p) => { persist(p); setActive((c) => (c ? { ...c, project: p } : c)); }} /></AppShell>;

  return (
    <AppShell>
      {/* 灰底 12px + 白底细边框主区，主区内部滚动（与 /agents/chat 一致）；以前 100vh-92px 的滚动区直接铺在灰底上，底部还空出一截 */}
      <div className="h-[calc(100dvh-3.5rem-13px)] p-[12px]"><div className="clip-root h-full overflow-y-auto rounded-pane border border-foreground/10 bg-card">
        <div className="clip-home">
          <section className="clip-hero">
            <h1>把一堆素材，剪成<em>一条好片</em></h1>
            <p>一句话说需求，素材全丢进来 — AI 自动分析、整理、归类，然后替你剪好。</p>
            <div className="clip-hero-composer">
              <input ref={fileRef} type="file" multiple hidden accept="video/*,image/*,audio/*" onChange={(e) => { if (e.target.files) addFiles(e.target.files, "assets"); e.target.value = ""; }} />
              <input ref={refRef} type="file" hidden accept="video/*" onChange={(e) => { if (e.target.files) addFiles(e.target.files, "refs"); e.target.value = ""; }} />
              <div className="va-composer-flow" data-drop-zone="素材" data-drag={drag ? "1" : undefined} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files, "assets"); }}>
                <div className="va-ga-composer">
                  <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="描述你想剪成什么样，比如：把这次云南旅行的素材剪成 60 秒抖音风格混剪，节奏快一点 —" aria-label="描述你想剪成什么样，比如：把这次云南旅行的素材剪成 60 秒抖音风格混剪，节奏快一点 —" />
                  {(assets.length > 0 || refs.length > 0) && (
                    <div className="clip-assets space-y-2">
                      {assets.length > 0 && <><div className="text-xs text-muted-foreground">视频 {summary.video} · 照片 {summary.photo} · 音频 {summary.audio} · 约 {summary.minutes} 分钟 · {fmtSize(summary.bytes)}</div><AssetList assets={assets} onRemove={removeAsset} /></>}
                      {refs.length > 0 && <><div className="text-xs text-muted-foreground">参考视频 {refs.length} 条（学它的节奏与转场，不会剪进成片）</div><AssetList assets={refs} onRemove={(id) => setRefs((c) => c.filter((a) => a.id !== id))} /></>}
                    </div>
                  )}
                  <div className="va-ga-bar">
                    <div className="va-ga-left">
                      <button type="button" className="va-ga-iconbtn" title="附件" aria-label="附件" onClick={() => fileRef.current?.click()}><Plus /></button>
                      <button type="button" className="va-ga-pill" onClick={() => setModelOpen(true)}><Sparkles /><span className="va-ga-pill-label">{modelName}</span><ChevronDown /></button>
                      {/* 原站「深度思考」是开关标签而非按钮 */}
                      <span role="switch" aria-checked={thinking} aria-label="深度思考" tabIndex={0} onClick={() => setThinking(!thinking)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setThinking(!thinking); } }} className={cn("va-ga-pill select-none", thinking && "va-on")}><Brain />深度思考</span>
                      <button type="button" className="va-ga-pill" aria-haspopup="dialog" aria-expanded={tplOpen} title="选一个模板" onClick={() => setTplOpen(true)}><Sparkles /><span className="va-ga-pill-label">模板 · {findTemplate(template)?.label}</span><ChevronDown /></button>
                      <button type="button" className={cn("va-ga-pill", refs.length > 0 && "va-on")} title="上传一条参考视频，学它的节奏和风格" onClick={() => refRef.current?.click()}><Upload /><span className="va-ga-pill-label">{refs.length ? `参考视频 ${refs.length} 条` : "参考视频学风格"}</span></button>
                      {probing > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" />{probing} 个上传中</span>}
                    </div>
                    <div className="va-ga-right">
                      {busy
                        ? <button type="button" className="va-ga-pill va-send" data-running="true" aria-label="停止" title="停止" onClick={() => abort.current?.abort()}><span className="va-send-orb"><Square /></span>停止</button>
                        : <button type="button" className="va-ga-pill va-send" data-ready={visual > 0 && probing === 0} disabled={!visual || probing > 0} aria-label="生成" title="生成" onClick={generate}><span className="va-send-orb"><Sparkles /></span>生成</button>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="clip-suggest" aria-label="试试这些">{SUGGESTIONS.map((x) => <button key={x} type="button" onClick={() => setPrompt(x)}>{x}</button>)}</div>
          </section>

          <div className="clip-modes" role="group" aria-label="选择剪辑场景">
            {MODES.map((m) => { const I = MODE_ICON[m.key as keyof typeof MODE_ICON]; const on = m.key === "mixcut"; return (
              <button key={m.key} type="button" className="clip-mode" aria-pressed={on || undefined} disabled={m.soon}>
                {on && <span className="check"><Check /></span>}
                <span className="ic"><I /></span>
                <b>{m.name}{m.soon && <span className="clip-soon">即将上线</span>}</b>
                <small>{m.desc}</small>
              </button>); })}
          </div>

          <div className="clip-sect-head" id="projects"><h2>我的剪辑项目</h2><small>{col.items.length} 个项目</small></div>
          <div className="clip-projects">
            {col.items.length === 0 ? (
              <div className="clip-empty">
                <Clapperboard />
                <div><b>还没有剪辑项目</b>上面那个框里说一句话、把素材丢进来，第一条成片几分钟就出来。</div>
                <div className="steps">{["一句话说想要什么", "传素材，AI 自动分析归类", "预览就是成片，随时改，导出免费"].map((x, i) => <span key={x}><i>{i + 1}</i>{x}</span>)}</div>
              </div>
            ) : col.items.map((p) => (
              <div key={p.id} className="clip-proj">
                <button type="button" className="clip-proj-open" onClick={() => reopen(p)} disabled={opening === p.id} title="重新打开">
                  <span className="clip-proj-cover">{opening === p.id ? <Loader2 className="h-7 w-7 animate-spin" /> : <Clapperboard className="h-7 w-7" />}<span className="ar">{p.ratio ?? "9:16"}</span></span>
                  <span className="clip-proj-body">
                    <span className="clip-proj-title"><span>{p.title || "未命名剪辑"}</span>{p.rendered && <span className="rounded-full bg-primary-tint px-1.5 text-[10px] font-medium text-accent-foreground">已导出</span>}</span>
                    <span className="clip-proj-meta"><span>{findTemplate(p.template)?.label ?? p.template}</span><i>·</i><span>素材 {p.assets.length}</span><i>·</i><span>{p.plan ? `v${p.version} · ${p.plan.segments.length} 段` : "还没成片"}</span><i>·</i><span>{dateLabel(p.updatedAt ?? p.createdAt)} {timeHM(p.updatedAt ?? p.createdAt)}</span></span>
                    {p.prompt && <span className="truncate text-xs text-muted-foreground">{p.prompt}</span>}
                  </span>
                </button>
                <button type="button" className="clip-proj-del" onClick={() => delProject(p)} aria-label="删除这个项目" title="删除这个项目"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          {/* 只写已经做到的：AI 生成 BGM / 新素材还没上线，不能先承诺（2026-10-02 修正） */}
          <div className="clip-pricing-note">
            <span><Zap /><b>先看价再花钱</b>：AI 写剪辑方案、分析素材画面按模型计费，分析素材前先给估价</span>
            <span><Check /><b>剪辑、预览、导出免费</b>：成片在你的浏览器里实时合成，改多少次都不收费</span>
            <span><Music /><b>BGM</b>：传你自己的音乐，自动铺在成片下面</span>
          </div>
        </div>
      </div></div>

      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent title="选一个模板" className="w-[min(92vw,420px)]">
          <div className="space-y-1.5">{TEMPLATES.map((t) => { const on = t.value === template; return (
            <button key={t.value} type="button" aria-pressed={on} onClick={() => { setTemplate(t.value); setTplOpen(false); }} className={cn("flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left hover:bg-muted", on && "border-primary/40 bg-primary-tint/40")}>
              <span className="flex flex-col"><span className="text-sm font-medium">{t.label}</span><small className="text-xs text-muted-foreground">{t.description}</small></span>{on && <Check size={14} className="text-primary" />}
            </button>); })}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={modelOpen} onOpenChange={setModelOpen}>
        <DialogContent title="选择对话模型" className="w-[min(92vw,560px)]">
          <label className="chip h-10 w-full gap-2 rounded-2xl"><Search size={14} className="text-muted-foreground" /><input value={modelQ} onChange={(e) => setModelQ(e.target.value)} placeholder="搜索模型名称..." className="w-full bg-transparent outline-none" /></label>
          <div className="mt-3 max-h-[55vh] space-y-1 overflow-y-auto pr-1">
            <button type="button" aria-pressed={!modelSel} onClick={() => { setModel(""); setModelOpen(false); }} className={cn("w-full rounded-2xl border px-4 py-2.5 text-left hover:bg-muted", !modelSel && "border-primary/40 bg-primary-tint/40")}><div className="text-sm font-medium">自动选模</div><div className="text-xs text-muted-foreground">不固定模型，发送时自动选择可用模型</div></button>
            {chatModels.filter((m) => !modelQ || `${m.name} ${m.id}`.toLowerCase().includes(modelQ.toLowerCase())).map((m) => (
              <button key={m.id} type="button" onClick={() => { setModel(m.id); setModelOpen(false); }} className={cn("w-full rounded-2xl border px-4 py-2.5 text-left hover:bg-muted", modelSel === m.id && "border-primary/40 bg-primary-tint/40")}><div className="text-sm font-medium">{m.name}</div>{m.description && <div className="line-clamp-2 text-xs text-muted-foreground">{m.description}</div>}</button>))}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
