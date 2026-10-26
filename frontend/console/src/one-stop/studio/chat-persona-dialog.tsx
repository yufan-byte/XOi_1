// 选择角色（造物 chat PersonaDialog 移植）：官方 20 个角色 + 我的自建 + 新建，
// 「选择」为当前对话设定 AI 人设；自建角色与媒体页共用 myPersonas 存储。
import { useState } from "react";
import {
  BarChart3, Bot, Briefcase, Check, Clapperboard, ClipboardList, Code, FileText, Film, GraduationCap, Heart, Languages,
  Lightbulb, Mail, Network, Pencil, PenLine, PenTool, Plus, ScrollText, Search, Sparkles, User, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn, uid } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OmniDialog } from "./ui";
import { useStudio, type MyPersona } from "./store";
import personasData from "./chat-personas.json";

export interface ChatPersona { id: string; name: string; intro: string; system_prompt: string; tags: string[]; official?: boolean }
/** 官方角色的展示顺序（造物 persona-dialog 同款） */
const ORDER = ["短剧分镜导演", "分镜转视频提示词", "全能写作大师", "文案策划大师", "商业策略顾问", "数据分析师", "思维导图大师", "情感疗愈师", "代码审查专家", "学习导师", "中英双语翻译官", "全能百科助手", "总结提炼大师", "学术论文助手", "邮件撰写助手", "会议纪要助手", "合同审查助手", "财务分析助手", "资深产品经理", "编程开发助手"];
const rank = (n: string) => { const i = ORDER.indexOf(n); return i < 0 ? ORDER.length : i; };
/** 官方角色图标（造物 workspace-ui PERSONA_ICONS 同款） */
const PERSONA_ICONS: Record<string, LucideIcon> = {
  短剧分镜导演: Clapperboard, 分镜转视频提示词: Film, 全能写作大师: PenTool, 文案策划大师: PenLine, 商业策略顾问: Briefcase, 数据分析师: BarChart3,
  思维导图大师: Network, 情感疗愈师: Heart, 代码审查专家: Code, 学习导师: GraduationCap, 中英双语翻译官: Languages, 全能百科助手: Lightbulb,
  总结提炼大师: FileText, 学术论文助手: ScrollText, 邮件撰写助手: Mail, 会议纪要助手: ClipboardList,
};
const OFFICIAL: ChatPersona[] = ((personasData as unknown as { data: ChatPersona[] }).data ?? []).map((p) => ({ ...p, official: true })).sort((a, b) => rank(a.name) - rank(b.name));

const AVATAR_ICONS: [string, LucideIcon][] = [["bot", Bot], ["pen-tool", PenTool], ["pen-line", PenLine], ["briefcase", Briefcase], ["chart", BarChart3], ["network", Network], ["heart", Heart], ["code", Code], ["graduation", GraduationCap], ["languages", Languages], ["lightbulb", Lightbulb], ["file", FileText], ["scroll", ScrollText], ["mail", Mail], ["clipboard", ClipboardList], ["sparkles", Sparkles]];
const AVATAR_MAP = Object.fromEntries(AVATAR_ICONS) as Record<string, LucideIcon>;
const PROMPT_MAX = 30000;

const field = "rounded-lg border border-border/60 bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary/40";
const EMPTY = { name: "", intro: "", avatar: "bot", system_prompt: "" };

export function ChatPersonaDialog({ open, onOpenChange, currentId, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; currentId?: string; onPick: (p: ChatPersona | null) => void }) {
  const my = useStudio((s) => s.myPersonas); const setMy = useStudio((s) => s.setMyPersonas);
  const [tab, setTabRaw] = useState<"official" | "mine" | "create">("official"); const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null); const [del, setDel] = useState<MyPersona | null>(null);
  const [form, setForm] = useState(EMPTY);
  const setTab = (k: "official" | "mine" | "create") => { if (k !== "create" && editId) { setEditId(null); setForm(EMPTY); } setTabRaw(k); };
  const edit = (p: MyPersona) => { setForm({ name: p.name, intro: p.intro, avatar: AVATAR_MAP[p.avatar] ? p.avatar : "bot", system_prompt: p.system_prompt }); setEditId(p.id); setTabRaw("create"); };
  const remove = (p: MyPersona) => { setMy(my.filter((m) => m.id !== p.id)); setDel(null); toast.success(`已删除「${p.name}」`); };
  type Row = ChatPersona | MyPersona;
  const list: Row[] = (tab === "official" ? OFFICIAL : (my as Row[])).filter((p) => !q || p.name.includes(q) || p.intro.includes(q) || (p.tags ?? []).some((t) => t.includes(q)));
  const copy = (p: ChatPersona) => { setMy([{ id: uid(), name: p.name, intro: p.intro, avatar: "bot", system_prompt: p.system_prompt, tags: p.tags }, ...my]); toast.success(`已复制到「我的」：${p.name}`); };
  const canCreate = !!(form.name.trim() && form.system_prompt.trim());
  const create = () => {
    if (!canCreate) return;
    const v = { name: form.name.trim(), intro: form.intro.trim(), avatar: form.avatar, system_prompt: form.system_prompt.trim() };
    if (editId) {
      if (my.some((m) => m.id === editId)) { setMy(my.map((m) => (m.id === editId ? { ...m, ...v } : m))); toast.success("已保存"); }
      else toast.error("这个角色已经不在了，请重新创建");
    } else { setMy([{ id: uid(), ...v }, ...my]); toast.success("角色已创建"); }
    setEditId(null); setForm(EMPTY); setTabRaw("mine");
  };
  const tabs = [["official", "官方", Sparkles], ["mine", "我的", User], ["create", editId ? "编辑" : "新建", editId ? Pencil : Plus]] as const;
  return (
    <OmniDialog open={open} onOpenChange={onOpenChange} title="选择角色" description="为当前对话设定 AI 人设；选官方模板或创建自己的角色，发送时自动注入。" className={tab === "create" ? "sm:max-w-3xl" : "sm:max-w-4xl"}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-4 py-2 sm:px-6">
        {tabs.map(([k, l, I]) => <button key={k} aria-pressed={tab === k} type="button" onClick={() => setTab(k)} className={cn("relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors", tab === k ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}><I size={14} />{l}</button>)}
        {tab !== "create" && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索角色..." aria-label="搜索角色" className="ml-auto w-40 rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40" />}
      </div>
      <div className="max-h-[calc(100svh-14rem)] overflow-y-auto px-4 py-4 sm:px-6">
        {tab === "create" ? (
          <div className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">头像</label>
              <div className="flex flex-wrap items-center gap-1">{AVATAR_ICONS.map(([k, I]) => { const on = form.avatar === k; return <button key={k} type="button" aria-pressed={on} onClick={() => setForm({ ...form, avatar: k })} className={cn("flex h-8 w-8 items-center justify-center rounded-md border transition-colors", on ? "border-primary/50 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground")}><I size={16} /></button>; })}</div>
            </div>
            <div className="flex flex-col gap-1"><label htmlFor="cp-name" className="text-[11px] font-medium text-muted-foreground">名称<span className="text-danger"> *</span></label><input id="cp-name" type="text" required maxLength={50} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="给角色起个名字" className={field} /></div>
            <div className="flex flex-col gap-1"><label htmlFor="cp-intro" className="text-[11px] font-medium text-muted-foreground">简介（可选）</label><input id="cp-intro" type="text" maxLength={100} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} placeholder="一句话描述角色" className={field} /></div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cp-sp" className="flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>系统提示词<span className="text-danger"> *</span></span><span className={cn(form.system_prompt.length >= PROMPT_MAX && "text-danger")}>{form.system_prompt.length} / {PROMPT_MAX}</span></label>
              <textarea id="cp-sp" required rows={10} maxLength={PROMPT_MAX} value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} placeholder="设定角色的行为和风格…" className="resize-y rounded-lg border border-border/60 bg-background px-3 py-2 text-[12px] leading-6 text-foreground outline-none focus:border-primary/40" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/40 pt-4"><button type="button" disabled={!canCreate} onClick={create} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors", canCreate ? "bg-primary text-white hover:bg-primary-strong" : "cursor-not-allowed bg-muted/50 text-muted-foreground")}><Check size={14} />{editId ? "保存修改" : "创建角色"}</button></div>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.length === 0 && <li className="col-span-full py-12 text-center text-[12px] text-muted-foreground">{tab === "mine" && !q ? "还没创建过角色。点「新建」开始。" : "没有匹配的角色"}</li>}
            {list.map((p) => { const officialRow = "official" in p && p.official; const I = officialRow ? (PERSONA_ICONS[p.name] ?? Sparkles) : (AVATAR_MAP[(p as MyPersona).avatar] ?? User); const isCur = currentId === p.id; return (
              <li key={p.id}>
                <div className={cn("group relative flex h-full flex-col gap-2 rounded-xl border p-3 transition-colors hover:bg-muted/30", isCur ? "border-primary/45" : "border-border/50 hover:border-border")}>
                  <div className="flex items-start gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><I size={16} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><span className="truncate text-[13px] font-semibold text-foreground">{p.name}</span><span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0 text-[9px] font-medium text-primary">{officialRow ? "官方" : "我的"}</span></div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{p.intro}</p>
                      {(p.tags ?? []).length > 0 && <div className="mt-1 flex flex-wrap gap-1">{(p.tags ?? []).slice(0, 3).map((t) => <span key={t} className="rounded-full bg-muted/60 px-1.5 py-0 text-[9px] text-muted-foreground">{t}</span>)}</div>}
                    </div>
                  </div>
                  <div className="mt-auto flex items-center gap-1 pt-1">
                    <button type="button" onClick={() => { onPick({ id: p.id, name: p.name, intro: p.intro, system_prompt: p.system_prompt, tags: p.tags ?? [], official: officialRow }); onOpenChange(false); }} className="flex-1 rounded-md bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15">{isCur ? "当前使用" : "选择"}</button>
                    {officialRow
                      ? <button type="button" onClick={() => copy(p as ChatPersona)} className="rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground">复制为我的</button>
                      : <><button type="button" onClick={() => edit(p as MyPersona)} className="rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground">编辑</button><button type="button" onClick={() => setDel(p as MyPersona)} className="rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-danger/10 hover:text-danger">删除</button></>}
                  </div>
                </div>
              </li>
            ); })}
          </ul>
        )}
      </div>
      <Dialog open={!!del} onOpenChange={(v) => { if (!v) setDel(null); }}>
        <DialogContent title="删除角色" description={`确定删除这个角色？「${del?.name ?? ""}」删除后无法恢复。`} className="w-[min(92vw,420px)]">
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDel(null)}>取消</Button><Button onClick={() => del && remove(del)} className="bg-danger text-white hover:bg-danger/90">删除</Button></div>
        </DialogContent>
      </Dialog>
    </OmniDialog>
  );
}
