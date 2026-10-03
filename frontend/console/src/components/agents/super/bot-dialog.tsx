"use client";
// Bot 形象对话框（参考站 omni-modal 460 宽）：Agent 记忆 + 预览 + 身形 / 颜色 / 情绪
import { useState } from "react";
import { Brain, Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BotFace } from "./bot-avatar";
import { BOT_COLORS, BOT_SHAPES, COLOR_HEX, EMOTION_LABEL, LIFECYCLE, REACTIONS, SHAPE_PATH, type BotEmotion } from "./bot-shapes";
import { DEFAULT_BOT, useBot, type BotConfig } from "./bot-store";
import { OmniDialog } from "./overlays";

const H3 = "mb-[8.8px] text-[13.2px] font-semibold uppercase leading-[17.6px] tracking-[0.24em] text-muted-foreground";
const SEL = "border-primary/50 bg-primary/10";
const IDLE = "border-border bg-muted hover:border-primary/40";

function MemoryCard() {
  const { memory, memoryEnabled, setMemory, setMemoryEnabled } = useBot();
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(memory);
  const exportMd = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`# Agent 记忆\n\n${memory}\n`], { type: "text/markdown;charset=utf-8" })); a.download = "agent-memory.md"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); toast.success("记忆已导出"); };
  const smallBtn = "inline-flex h-[33.4px] shrink-0 items-center justify-center gap-[6.6px] rounded-[6px] px-[11px] text-[13.2px] font-medium leading-[17.6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";
  return (
    <section className="rounded-[14px] border border-border/70 bg-muted/35 p-[15.4px]">
      <div className="flex items-start gap-[13.2px]">
        <span className="flex h-[37.6px] w-[37.6px] shrink-0 items-center justify-center rounded-[10px] border border-border/60 bg-card text-primary"><Brain className="h-[18.8px] w-[18.8px]" /></span>
        <div className="min-w-0 flex-1"><h3 className="text-[15.4px] font-semibold leading-[22px] tracking-[-0.035em] text-foreground">Agent 记忆</h3><p className="mt-[2.2px] text-[13.2px] font-medium leading-[22px] text-muted-foreground">Agent 跨会话维护的一份记忆文档，新对话自动生效；可直接编辑。</p></div>
      </div>
      <div className="mt-[13.2px] flex flex-wrap items-center justify-between gap-[8.8px] border-y border-border py-[8.8px]">
        <button type="button" onClick={exportMd} disabled={!memory.trim()} className={smallBtn}><Download className="h-[16.7px] w-[16.7px]" />导出 Markdown</button>
        <label className="flex h-[33.4px] cursor-pointer items-center gap-[8.8px] rounded-[6px] px-[8.8px] text-[13.2px] font-medium leading-[17.6px] text-muted-foreground"><span>启用 Agent 记忆</span><Switch checked={memoryEnabled} onCheckedChange={setMemoryEnabled} aria-label="启用 Agent 记忆" /></label>
      </div>
      {editing ? (
        <div className="mt-[13.2px]">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={7} aria-label="编辑记忆文档" placeholder={"- 用户叫我小创\n- 用户偏好简洁的要点式回答"} className="w-full rounded-[10px] border border-border bg-card px-[11px] py-[8px] text-[13.2px] leading-[22px] outline-none focus:ring-2 focus:ring-ring/40" />
          <div className="mt-[4px] flex items-center justify-between text-[12px] text-muted-foreground"><span>{draft.length} / 4000 字</span><span className="flex gap-[6px]"><button type="button" className={smallBtn} onClick={() => { setDraft(memory); setEditing(false); }}>取消</button><button type="button" className={cn(smallBtn, "bg-primary text-white hover:bg-primary hover:text-white")} onClick={() => { if (draft.length > 4000) return toast.error("超出字数上限，请精简后再保存"); setMemory(draft.trim()); setEditing(false); toast.success("已保存"); }}>保存</button></span></div>
        </div>
      ) : (
        <>
          {memory.trim() ? <div className="mt-[13.2px] max-h-[160px] overflow-y-auto whitespace-pre-wrap rounded-[10px] bg-card px-[11px] py-[8px] text-[13.2px] leading-[22px]">{memory}</div> : <p className="mt-[13.2px] text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">还没有记忆。你可以在对话中让 Agent 记住重要信息，或点击编辑手动添加。</p>}
          <button type="button" className={cn(smallBtn, "mt-[8.8px] -ml-[11px]")} onClick={() => { setDraft(memory); setEditing(true); }}><Pencil className="h-[15px] w-[15px]" />编辑</button>
        </>
      )}
    </section>
  );
}

/** 内容随对话框挂载 / 卸载，所以每次打开都会从已保存的形象重新初始化草稿 */
function BotDialogBody({ draft, setDraft }: { draft: BotConfig; setDraft: (b: BotConfig) => void }) {
  const preview: BotEmotion = draft.emotion === "auto" ? "idle" : draft.emotion;
  const Chip = ({ e }: { e: BotEmotion }) => <button type="button" onClick={() => setDraft({ ...draft, emotion: e })} className={cn("rounded-full border px-[11px] py-[4.4px] text-[13.2px] font-medium leading-[17.6px] transition-colors", draft.emotion === e ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground hover:text-foreground")}>{EMOTION_LABEL[e]}</button>;
  return (
    <div className="flex flex-col gap-[22px]">
      <MemoryCard />
      <div className="flex items-center justify-center rounded-[14px] border border-border bg-muted py-[22px]"><BotFace shape={draft.shape} color={draft.color} emotion={preview} size={126.5} /></div>
      <section>
        <h3 className={H3}>身形</h3>
        <div className="grid grid-cols-6 gap-[8.8px]">
          {BOT_SHAPES.map((s) => <button type="button" key={s} onClick={() => setDraft({ ...draft, shape: s })} aria-label={s} title={s} className={cn("flex h-[43.7px] items-center justify-center rounded-[10px] border p-[6.6px] text-foreground transition-colors", draft.shape === s ? SEL : IDLE)}><svg viewBox="-15 -15 259 259" className="h-[29.3px] w-[29.3px]" aria-hidden="true"><path d={SHAPE_PATH[s]} fill="currentColor" /></svg></button>)}
        </div>
      </section>
      <section>
        <h3 className={H3}>颜色</h3>
        <div className="flex flex-wrap gap-[8.8px]">
          {BOT_COLORS.map((c) => <button type="button" key={c} onClick={() => setDraft({ ...draft, color: c })} aria-label={c} title={c} className={cn("h-[33.4px] w-[33.4px] rounded-full border-2 transition-transform", draft.color === c ? "scale-110 border-primary" : "border-border hover:scale-105")} style={{ background: COLOR_HEX[c] }} />)}
        </div>
      </section>
      <section>
        <h3 className={H3}>情绪</h3>
        <button type="button" onClick={() => setDraft({ ...draft, emotion: "auto" })} className={cn("mb-[8.8px] flex w-full items-start justify-between gap-[13.2px] rounded-[10px] border px-[13.2px] py-[11px] text-left transition-colors", draft.emotion === "auto" ? SEL : "border-border hover:border-primary/40")}><span className="text-[15.4px] font-medium leading-[22px] text-foreground">自动</span><span className="text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">随运行状态与你的输入自动变化</span></button>
        <div className="mb-[8.8px]"><p className="mb-[6.6px] text-[11px] font-medium leading-[17.6px] text-muted-foreground">状态</p><div className="flex flex-wrap gap-[6.6px]">{LIFECYCLE.map((e) => <Chip key={e} e={e} />)}</div></div>
        <div><p className="mb-[6.6px] text-[11px] font-medium leading-[17.6px] text-muted-foreground">反应</p><div className="flex flex-wrap gap-[6.6px]">{REACTIONS.map((e) => <Chip key={e} e={e} />)}</div></div>
      </section>
    </div>
  );
}

function Inner({ onClose }: { onClose: () => void }) {
  const { bot, setBot } = useBot();
  const [draft, setDraft] = useState<BotConfig>(bot);
  return (
    <>
      <BotDialogBody draft={draft} setDraft={setDraft} />
      <div className="mt-[18px] flex items-center justify-end gap-[8px]">
        <button type="button" onClick={() => setDraft(DEFAULT_BOT)} className="inline-flex h-[37.6px] items-center justify-center gap-[6.6px] rounded-[4px] px-[13.2px] text-[15.4px] font-semibold leading-[22px] text-foreground hover:bg-muted">恢复默认</button>
        <button type="button" onClick={() => { setBot(draft); onClose(); toast.success("已保存"); }} className="inline-flex h-[37.6px] items-center justify-center gap-[6.6px] rounded-[4px] border border-primary/40 bg-[linear-gradient(135deg,oklch(0.54_0.247_293),oklch(0.5_0.1_293))] px-[13.2px] text-[15.4px] font-semibold leading-[22px] text-white">保存</button>
      </div>
    </>
  );
}

export function BotDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <OmniDialog open={open} onOpenChange={onOpenChange} title="Bot 形象" description="自定义你的智能体角色的身形、颜色与情绪" panelClassName="max-h-[82vh]">
      {open && <Inner onClose={() => onOpenChange(false)} />}
    </OmniDialog>
  );
}
