// 对话工作台（文本）：造物 /chat 的简化版——消息流 + 输入区，模型从侧栏选择。
// 走 /api/canvas-llm（adapters/llm.chat 带平台预算单确认），非流式回包。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Bot, CornerDownLeft, Eraser, History, ListChecks, Loader2, Maximize2, MessageSquare, Pin, Plus, Send, Square, User, X } from "lucide-react";
import { toast } from "sonner";
import { cn, timeHM } from "@/lib/utils";
import { useCatalog } from "./adapters/queries";
import { chat } from "./adapters/llm";
import { AppShell } from "./adapters/shell";
import { useStudio } from "./studio/store";
import { EmptyModel, RichTip, SideDrawer, TipProvider, topbarBtn } from "./studio/ui";
import { SeriesPicker } from "./studio/media-page";
import { ChatPersonaDialog, type ChatPersona } from "./studio/chat-persona-dialog";

interface ChatMsg { id: string; role: "user" | "assistant"; content: string; at: number; error?: boolean }
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const railTool = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-card/40 text-muted-foreground transition-all duration-200 hover:border-border hover:bg-muted hover:text-foreground";

export function ChatStudio() {
  const { data: catalog, isError: catalogFailed, refetch: refetchCatalog } = useCatalog();
  const selected = useStudio((s) => s.selected.chat); const select = useStudio((s) => s.select);
  const pinned = useStudio((s) => s.pinned); const togglePin = useStudio((s) => s.togglePin);
  const models = useMemo(() => (catalog?.models ?? []).filter((m) => m.category === "chat"), [catalog]);
  const model = useMemo(() => models.find((m) => m.id === selected) ?? models.find((m) => pinned.includes(m.id)) ?? models.find((m) => m.featured) ?? models[0], [models, selected, pinned]);
  useEffect(() => { if (model && model.id !== selected) select(model); }, [model, selected, select]);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [enterNewline, setEnterNewline] = useState(false);
  const [dlg, setDlg] = useState<"tasks" | "history" | null>(null);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [persona, setPersona] = useState<ChatPersona | null>(null);
  /** 历史会话（本机 localStorage）：恢复 / 删除 */
  const [sessions, setSessions] = useState<{ id: string; title: string; at: number; msgs: ChatMsg[] }[]>(() => { try { return JSON.parse(localStorage.getItem("xoi-chat-sessions") || "[]"); } catch { return []; } });
  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showDown, setShowDown] = useState(false);

  useEffect(() => { const el = scrollRef.current; if (el && !showDown) el.scrollTo({ top: el.scrollHeight }); }, [msgs.length, busy, showDown]);
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const h = () => setShowDown(el.scrollTop + el.clientHeight < el.scrollHeight - 320);
    el.addEventListener("scroll", h, { passive: true }); h();
    return () => el.removeEventListener("scroll", h);
  }, [msgs.length]);

  const send = useCallback(async () => {
    const text = (textRef.current?.value ?? "").trim();
    if (!text || busy || !model) return;
    if (textRef.current) textRef.current.value = "";
    const userMsg: ChatMsg = { id: uid(), role: "user", content: text, at: Date.now() };
    const aiId = uid();
    setMsgs((c) => [...c, userMsg, { id: aiId, role: "assistant", content: "", at: Date.now() }]);
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      const history = msgs.slice(-16).map((m) => ({ role: m.role, content: m.content }));
      const sys: { role: "system"; content: string }[] = persona ? [{ role: "system", content: persona.system_prompt }] : [];
      const r = await chat(model.id, [...sys, ...history, { role: "user", content: text }], { signal: abortRef.current.signal });
      setMsgs((c) => c.map((m) => (m.id === aiId ? { ...m, content: r.content || "（模型没有返回内容）" } : m)));
    } catch (e) {
      const msg = (e as Error).message || "请求失败";
      if (/abort/i.test(msg)) setMsgs((c) => c.filter((m) => m.id !== aiId));
      else setMsgs((c) => c.map((m) => (m.id === aiId ? { ...m, content: msg, error: true } : m)));
    } finally { setBusy(false); abortRef.current = null; }
  }, [busy, model, msgs]);

  // 会话自动保存：有消息就写一份到本机（最多 30 份），历史会话抽屉可恢复
  const sessionRef = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
  useEffect(() => {
    if (!msgs.length) return;
    try {
      const id = sessionRef.current;
      const title = (msgs.find((m) => m.role === "user")?.content ?? "对话").slice(0, 24);
      setSessions((c) => {
        const next = [{ id, title, at: Date.now(), msgs }, ...c.filter((x) => x.id !== id)].slice(0, 30);
        localStorage.setItem("xoi-chat-sessions", JSON.stringify(next));
        return next;
      });
    } catch { /* 隐私模式忽略 */ }
  }, [msgs]);
  const restoreSession = (id: string) => {
    const x = sessions.find((y) => y.id === id); if (!x) return;
    setMsgs(x.msgs); sessionRef.current = x.id; setDlg(null);
    toast.success("已恢复该会话");
  };
  const deleteSession = (id: string) => { setSessions((c) => { const n = c.filter((x) => x.id !== id); try { localStorage.setItem("xoi-chat-sessions", JSON.stringify(n)); } catch {} return n; }); };
  const nameOf = useMemo(() => { const m = new Map(models.map((x) => [x.id, x.name])); return (id: string) => m.get(id) ?? id; }, [models]);

  return (
    <TipProvider>
      <AppShell>
        <div className="h-[calc(100dvh-3.5rem-13px)] min-h-0 p-[12px] md:pl-0">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-pane border border-foreground/10 bg-card">
            {/* 顶条：置顶 ｜ 新对话 / 模型线路 */}
            <div className="relative z-10 flex w-full shrink-0 flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.06] px-3 py-[10px] sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" aria-pressed={model ? pinned.includes(model.id) : false} onClick={() => model && togglePin(model.id)} className={cn(topbarBtn(model && pinned.includes(model.id) ? "active" : "neutral"), "min-h-9")}><Pin size={14} />{model && pinned.includes(model.id) ? "取消置顶" : "置顶"}</button>
                <button type="button" aria-label="任务记录" title="任务记录" onClick={() => setDlg("tasks")} className={cn(topbarBtn("neutral"), "min-h-9")}><ListChecks size={14} /><span className="hidden sm:inline">任务记录</span></button>
              </div>
              <div className="flex w-full min-w-0 items-center justify-start gap-2 sm:w-auto sm:flex-none sm:justify-end">
                <button type="button" onClick={() => { setMsgs([]); setPersona(null); sessionRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; textRef.current?.focus(); }} className={cn(topbarBtn("neutral"), "min-h-9")}><Plus size={14} />新对话</button>
                <button type="button" aria-label="历史会话" title="历史会话" onClick={() => setDlg("history")} className={cn(topbarBtn("neutral"), "min-h-9")}><History size={14} /><span className="hidden sm:inline">历史会话</span></button>
                <button type="button" aria-label={persona ? `当前角色：${persona.name}` : "选择角色"} title={persona ? `当前角色：${persona.name}（点此更换）` : "选择角色"} onClick={() => setPersonaOpen(true)} className={cn(topbarBtn(persona ? "accent" : "neutral"), "min-h-9")}><Bot size={14} /><span className="hidden sm:inline">{persona ? persona.name : "选择角色"}</span></button>
                <SeriesPicker models={models} current={model} onPick={select} className={cn(topbarBtn("model"), "min-h-9 min-w-0 flex-1 shrink justify-between sm:flex-none")} />
              </div>
            </div>
            {/* 消息流 */}
            <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {!model && <EmptyModel modality="对话" failed={catalogFailed && !catalog} onRetry={() => void refetchCatalog()} />}
              {model && msgs.length === 0 && (
                <div className="flex h-full min-h-0 w-full flex-col items-center justify-center overflow-y-auto px-4 py-6">
                  <div className="pop-in flex flex-col items-center text-center">
                    <span className="grid h-14 w-14 place-items-center rounded-[1.55rem] bg-primary/10 text-primary"><MessageSquare size={26} /></span>
                    <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{model.name}</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{model.description || "有问题尽管问，写文案、列大纲、改剧本都可以"}</p>
                  </div>
                </div>
              )}
              {msgs.length > 0 && (
                <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
                  {msgs.map((m) => (
                    <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                      <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold shadow-[0_0_0_1px_var(--border)]", m.role === "user" ? "bg-primary/12 text-primary-strong" : "bg-muted/60 text-muted-foreground")}>
                        {m.role === "user" ? <User size={14} /> : <MessageSquare size={14} />}
                      </span>
                      <div className={cn("min-w-0 max-w-[min(92%,46rem)] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[14px] leading-6", m.role === "user" ? "bg-primary/10 text-foreground" : m.error ? "border border-danger/30 bg-danger/5 text-danger" : "bg-muted/60 text-foreground")}>
                        {m.content || (busy && m.role === "assistant" ? <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 size={14} className="animate-spin" />思考中…</span> : "")}
                      </div>
                    </div>
                  ))}
                  {showDown && <button onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })} className="sticky bottom-2 left-1/2 z-30 flex h-9 -translate-x-1/2 items-center rounded-full border bg-card px-4 text-sm shadow-pop hover:bg-muted">回到最新</button>}
                </div>
              )}
              {/* 输入区（造物 chat 版式） */}
              <div className="relative z-20 shrink-0 px-2 pb-2 pt-2 sm:px-4 sm:pb-3 sm:pt-3 border-t border-foreground/[0.06]">
                <div data-chat-dropzone className="relative isolate min-w-0 overflow-hidden rounded-shell border border-foreground/[0.08] bg-card/90 shadow-[0_8px_32px_-16px_color-mix(in_srgb,var(--foreground)_16%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--foreground)_6%,transparent)] backdrop-blur-xl">
                  <div className="min-h-[60px] px-4 py-3 sm:px-[22px] sm:py-3.5">
                    <div className="relative flex items-stretch gap-2">
                      <div className="relative flex min-w-0 flex-1 flex-col">
                        <textarea ref={textRef} placeholder={model ? `给「${model.name}」发消息…` : "先在左侧选择对话模型"} rows={1} data-chat-input
                          className="relative block max-h-[40vh] min-h-[40px] w-full resize-none bg-transparent p-0 text-[15px] leading-[26px] text-foreground outline-none placeholder:text-muted-foreground/50"
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { const sendNow = enterNewline ? (e.metaKey || e.ctrlKey) : !e.shiftKey; if (sendNow) { e.preventDefault(); void send(); } } }}
                          onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`; }} />
                      </div>
                      <div className="hidden shrink-0 items-center sm:flex">
                        <div className="flex flex-col items-center gap-1.5">
                          <RichTip title="回车换行" desc="在光标处插入换行"><button type="button" className={cn(railTool, enterNewline && "border-foreground/25 bg-muted text-foreground")} onClick={() => setEnterNewline(!enterNewline)} aria-label="回车换行"><CornerDownLeft size={14} /></button></RichTip>
                          <RichTip title="全屏编辑" desc="打开更大的编辑器"><button type="button" className={railTool} onClick={() => textRef.current?.requestFullscreen?.()} aria-label="全屏编辑"><Maximize2 size={14} /></button></RichTip>
                          <RichTip title="一键清空" desc="清空当前输入内容"><button type="button" className={railTool} onClick={() => { if (textRef.current) textRef.current.value = ""; }} aria-label="一键清空"><Eraser size={14} /></button></RichTip>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-stretch justify-between gap-2 px-3 pb-2 pt-1 sm:flex-row sm:items-center sm:px-3.5 sm:pb-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground">
                      {persona && <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary-strong"><Bot size={11} className="shrink-0" /><span className="min-w-0 truncate">{persona.name}</span><button type="button" aria-label="移除角色" onClick={() => setPersona(null)} className="shrink-0 hover:text-foreground"><X size={10} /></button></span>}
                      <CornerDownLeft size={12} />{enterNewline ? "⌘/Ctrl + Enter 发送" : "Shift + Enter 换行"}
                      {model && <span className="truncate">· {model.name}{model.price ? ` · ${model.price.split(" · ")[0]}` : " · 按用量计费"}</span>}
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      {busy ? (
                        <button type="button" onClick={() => abortRef.current?.abort()} className="inline-flex h-9 items-center gap-2 rounded-full border border-foreground/20 bg-muted px-4 text-[12px] font-medium text-foreground hover:bg-muted/80" aria-label="停止"><span className="grid h-6 w-6 place-items-center rounded-full bg-foreground text-background"><Square size={9} fill="currentColor" /></span>停止</button>
                      ) : (
                        <button type="button" onClick={() => void send()} aria-label="发送消息" className="inline-flex h-9 items-center gap-2 rounded-full border border-foreground/[0.09] bg-muted/90 px-3 text-[12px] font-medium text-foreground/75 transition-all hover:border-foreground/20 hover:bg-muted hover:text-foreground active:scale-[0.97]">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-foreground text-background"><Send size={12} /></span><span>发送</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </AppShell>
      <SideDrawer open={dlg === "tasks"} onOpenChange={(v) => setDlg(v ? "tasks" : null)} title="对话记录" description="本页当前会话的问答记录" icon={<ListChecks size={18} className="text-primary" />}>
        {msgs.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">还没有对话</div> : (
          <div className="space-y-2">{msgs.map((m) => (
            <div key={m.id} className="rounded-[14px] border border-border/60 bg-card p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{m.role === "user" ? "我" : nameOf(model?.id ?? "")}</span><span>{timeHM(m.at)}</span></div>
              <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{m.content || "…"}</div>
            </div>
          ))}</div>
        )}
        {msgs.length > 0 && <button type="button" onClick={() => { setMsgs([]); setDlg(null); }} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border/60 text-[12.5px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"><BookOpen size={14} />清空当前对话</button>}
      </SideDrawer>
      <SideDrawer open={dlg === "history"} onOpenChange={(v) => setDlg(v ? "history" : null)} title="历史会话" description={`共 ${sessions.length} 个会话 · 本机保存`} icon={<History size={18} className="text-primary" />}>
        {sessions.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">还没有历史会话</div> : (
          <div className="space-y-2">{sessions.map((x) => (
            <div key={x.id} className="flex items-center gap-3 rounded-[14px] border border-border/60 bg-card p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><MessageSquare size={15} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-foreground">{x.title}</span><span className="block truncate text-[11px] text-muted-foreground">{new Date(x.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {x.msgs.length} 条消息</span></span>
              <span className="flex shrink-0 flex-col gap-1"><button className="text-xs text-primary" onClick={() => restoreSession(x.id)}>恢复</button><button className="text-xs text-muted-foreground" onClick={() => deleteSession(x.id)}>删除</button></span>
            </div>
          ))}</div>
        )}
      </SideDrawer>
      <ChatPersonaDialog open={personaOpen} onOpenChange={setPersonaOpen} currentId={persona?.id} onPick={(p: ChatPersona | null) => { if (!p) return; setPersona(p); toast.success(`已选定角色「${p.name}」，发送时自动注入`); }} />
    </TipProvider>
  );
}
