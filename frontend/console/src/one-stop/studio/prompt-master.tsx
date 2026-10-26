// 提示词大师（造物 PersonaDialog 媒体版）：浏览官方创意编导、管理自建角色，「选用」用该角色优化当前描述。
// 交互与造物 components/chat/persona-dialog.tsx 同款：官方 / 我的 / 新建 三页签 + 搜索 + 卡片（选用 / 复制为我的 / 编辑 / 删除）。
import { useMemo, useState } from "react";
import {
  Aperture, BookOpen, Bot, Check, Clapperboard, Compass, Globe, GraduationCap, Lightbulb, Mail, Mic, Music,
  Palette, Pencil, PenTool, Plus, Radio, Search, ShoppingBag, Sparkles, Store, User, WandSparkles, Zap, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn, uid } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OmniDialog } from "./ui";
import { useStudio, type MyPersona, type WorkKind } from "./store";

/** 官方创意编导（视频页的 5 个与造物站一致；图片 / 音频为同套编导体系） */
export interface OfficialPersona { name: string; intro: string; icon: LucideIcon; system_prompt: string; featured?: boolean }
export const OFFICIAL_PERSONAS: Record<WorkKind, OfficialPersona[]> = {
  video: [
    { name: "电影感分镜导演", intro: "按镜头拆分，写清景别、运镜、动作与节奏", icon: Clapperboard, featured: true,
      system_prompt: "你是电影感分镜导演。把用户的描述优化成专业视频提示词：按镜头拆分（一个镜头一句话），每个镜头写清景别、运镜（推拉摇移跟）、人物动作与节奏，交代光线与氛围。保持用户的主体与意图不变，补齐必要的画面细节。只输出优化后的提示词，不要解释。" },
    { name: "短视频带货编导", intro: "开头三秒抓人，商品卖点逐一展示", icon: ShoppingBag,
      system_prompt: "你是短视频带货编导。把用户的描述优化成带货视频提示词：开头三秒用强钩子抓人，商品卖点按「特写 → 使用 → 效果」逐一展示，结尾给行动指令。节奏紧凑，画面具体可拍。只输出优化后的提示词，不要解释。" },
    { name: "动画短片导演", intro: "日漫 / 3D 动画风格的短片镜头设计", icon: Sparkles,
      system_prompt: "你是动画短片导演。把用户的描述优化成动画风格视频提示词：明确画风（日漫 / 3D 渲染 / 二维手绘），设计夸张而有张力的镜头运动与表情演出，色彩明快、光影风格化。保持故事连贯。只输出优化后的提示词，不要解释。" },
    { name: "运镜指导", intro: "专攻镜头语言：让画面动起来又不乱", icon: Zap,
      system_prompt: "你是运镜指导。专攻镜头语言：为用户的描述设计让画面「动起来又不乱」的运镜——每个镜头只一个主动作，运动有起幅与落幅，用遮挡与视差制造层次。在原描述基础上补写运镜指令。只输出优化后的提示词，不要解释。" },
    { name: "产品广告导演", intro: "高级质感的产品广告片：光影、材质、慢动作", icon: Zap,
      system_prompt: "你是产品广告导演。把用户的描述优化成高级质感的产品广告提示词：突出材质与光影（金属冷光、玻璃折射、柔雾背景），用慢动作与微距展示细节，背景极简不抢主体。只输出优化后的提示词，不要解释。" },
  ],
  image: [
    { name: "概念设定画师", intro: "角色与场景设定图：三视图、光影与材质", icon: Palette, featured: true,
      system_prompt: "你是概念设定画师。把用户的描述优化成高质量生图提示词：补全主体细节、构图与视角、光源方向、材质质感与画风关键词，设定图类补「正面 / 侧面 / 三视图」表述。保持用户主体不变。只输出优化后的提示词，不要解释。" },
    { name: "商业摄影指导", intro: "电商与产品图：打光、背景、质感", icon: Aperture,
      system_prompt: "你是商业摄影指导。把用户的描述优化成商业摄影风格生图提示词：明确机位与镜头、布光（主光 / 轮廓光 / 柔光箱）、背景与道具、产品材质表现，画质关键词齐全。只输出优化后的提示词，不要解释。" },
    { name: "国风插画师", intro: "水墨、工笔、国潮元素的画风把控", icon: PenTool,
      system_prompt: "你是国风插画师。把用户的描述优化成国风生图提示词：明确水墨 / 工笔 / 国潮方向，写清线条、留白、配色（朱砂、石青、黛蓝）与纹样元素，人物衣饰与建筑考据。只输出优化后的提示词，不要解释。" },
    { name: "排版设计总监", intro: "海报与版式：层级、留白、视觉动线", icon: Store,
      system_prompt: "你是排版设计总监。把用户的描述优化成海报 / 版式类生图提示词：先定网格与视觉动线，写清标题层级、留白分组、字体气质（只写气质不写字体名）与配色。只输出优化后的提示词，不要解释。" },
  ],
  audio: [
    { name: "口播文案编导", intro: "短视频口播：钩子、节奏、行动指令", icon: Mic, featured: true,
      system_prompt: "你是口播文案编导。把用户的内容润色成短视频口播稿：前三秒钩子、中段干货按节奏推进、结尾行动指令；口语化、短句、有停顿感。保留原意。只输出文案，不要解释。" },
    { name: "儿歌作词人", intro: "孩子能跟着唱的儿歌：重复句与押韵", icon: Music,
      system_prompt: "你是儿歌作词人。把用户的主题写成孩子能跟着唱、跟着做的儿歌歌词：重复句占足比重、三种重复方式选其一来用、词汇按年龄选简单具体的词、句句押韵。只输出歌词，不要解释。" },
    { name: "诗歌朗诵编导", intro: "诗与散文的朗诵稿：气口与情感起伏", icon: BookOpen,
      system_prompt: "你是诗歌朗诵编导。把用户的诗或散文整理成朗诵稿：气口按意群不按标点，跨行连读处理行末标点，标注情感起伏的起承高落。保留原文意涵。只输出朗诵稿，不要解释。" },
    { name: "品牌声音设计师", intro: "广告背景音乐与声音气质描述", icon: Radio,
      system_prompt: "你是品牌声音设计师。把用户的想法整理成背景音乐 / 品牌声音的描述文案：写清乐器、频段、节奏与情绪曲线，口播在时哪些频段要让位。只输出描述文案，不要解释。" },
  ],
};

/** 创建角色可选头像（造物 persona-dialog 同款 20 个 lucide 图标） */
const AVATARS: [string, LucideIcon][] = [["bot", Bot], ["pen-tool", PenTool], ["mic", Mic], ["music", Music], ["store", Store], ["palette", Palette], ["clapperboard", Clapperboard], ["zap", Zap], ["sparkles", Sparkles], ["wand-sparkles", WandSparkles], ["search", Search], ["graduation-cap", GraduationCap], ["globe", Globe], ["lightbulb", Lightbulb], ["mail", Mail], ["compass", Compass]];
const AVATAR_MAP = Object.fromEntries(AVATARS) as Record<string, LucideIcon>;
const PROMPT_MAX = 30000;

export interface PersonaPick { id: string; name: string; intro: string; system_prompt: string; official?: boolean }

const field = "rounded-lg border border-border/60 bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary/40";
const EMPTY = { name: "", intro: "", avatar: "bot", system_prompt: "" };

/** 提示词大师弹窗：官方创意编导 / 我的角色 / 新建，选用后用该角色优化当前描述 */
export function PromptMasterDialog({ open, onOpenChange, modality, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; modality: WorkKind; onPick: (p: PersonaPick) => void }) {
  const my = useStudio((s) => s.myPersonas); const setMy = useStudio((s) => s.setMyPersonas);
  const [tab, setTabRaw] = useState<"official" | "mine" | "create">("official"); const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null); const [del, setDel] = useState<MyPersona | null>(null);
  const [form, setForm] = useState(EMPTY);
  const setTab = (k: "official" | "mine" | "create") => { if (k !== "create" && editId) { setEditId(null); setForm(EMPTY); } setTabRaw(k); };
  const edit = (p: MyPersona) => { setForm({ name: p.name, intro: p.intro, avatar: AVATAR_MAP[p.avatar] ? p.avatar : "bot", system_prompt: p.system_prompt }); setEditId(p.id); setTabRaw("create"); };
  const remove = (p: MyPersona) => { setMy(my.filter((m) => m.id !== p.id)); setDel(null); toast.success(`已删除「${p.name}」`); };
  const official = useMemo(() => OFFICIAL_PERSONAS[modality].map((p, i) => ({ id: `official:${modality}:${i}`, name: p.name, intro: p.intro, system_prompt: p.system_prompt, icon: p.icon, featured: p.featured, official: true })), [modality]);
  type Row = (typeof official)[number] | MyPersona;
  const list: Row[] = (tab === "official" ? official : (my as Row[])).filter((p) => !q || p.name.includes(q) || p.intro.includes(q));
  const copy = (p: (typeof official)[number]) => { setMy([{ id: uid(), name: p.name, intro: p.intro, avatar: "bot", system_prompt: p.system_prompt }, ...my]); toast.success(`已复制到「我的」：${p.name}`); };
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
    <OmniDialog open={open} onOpenChange={onOpenChange} title="提示词大师" description="浏览官方创意编导，管理你自建的角色。点「选用」用该角色优化当前描述。" className={tab === "create" ? "sm:max-w-3xl" : "sm:max-w-4xl"}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-4 py-2 sm:px-6">
        {tabs.map(([k, l, I]) => <button key={k} aria-pressed={tab === k} type="button" onClick={() => setTab(k)} className={cn("relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors", tab === k ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}><I size={14} />{l}</button>)}
        {tab !== "create" && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索角色..." aria-label="搜索角色" className="ml-auto w-40 rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40" />}
      </div>
      <div className="max-h-[calc(100svh-14rem)] overflow-y-auto px-4 py-4 sm:px-6">
        {tab === "create" ? (
          <div className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">头像</label>
              <div className="flex flex-wrap items-center gap-1">{AVATARS.map(([k, I]) => { const on = form.avatar === k; return <button key={k} type="button" aria-pressed={on} onClick={() => setForm({ ...form, avatar: k })} className={cn("flex h-8 w-8 items-center justify-center rounded-md border transition-colors", on ? "border-primary/50 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground")}><I size={16} /></button>; })}</div>
            </div>
            <div className="flex flex-col gap-1"><label htmlFor="pm-name" className="text-[11px] font-medium text-muted-foreground">名称<span className="text-danger"> *</span></label><input id="pm-name" type="text" required maxLength={50} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="给角色起个名字" className={field} /></div>
            <div className="flex flex-col gap-1"><label htmlFor="pm-intro" className="text-[11px] font-medium text-muted-foreground">简介（可选）</label><input id="pm-intro" type="text" maxLength={100} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} placeholder="一句话描述角色" className={field} /></div>
            <div className="flex flex-col gap-1">
              <label htmlFor="pm-sp" className="flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>角色写法<span className="text-danger"> *</span></span><span className={cn(form.system_prompt.length >= PROMPT_MAX && "text-danger")}>{form.system_prompt.length} / {PROMPT_MAX}</span></label>
              <textarea id="pm-sp" required rows={10} maxLength={PROMPT_MAX} value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} placeholder="设定这个编导的写法与风格，例如：你是电影感分镜导演，按镜头拆分..." className="resize-y rounded-lg border border-border/60 bg-background px-3 py-2 text-[12px] leading-6 text-foreground outline-none focus:border-primary/40" />
              <p className="text-[10px] text-muted-foreground">「选用」时按这段写法优化当前描述。</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/40 pt-4"><button type="button" disabled={!canCreate} onClick={create} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors", canCreate ? "bg-primary text-white hover:bg-primary-strong" : "cursor-not-allowed bg-muted/50 text-muted-foreground")}><Check size={14} />{editId ? "保存修改" : "创建角色"}</button></div>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.length === 0 && <li className="col-span-full py-12 text-center text-[12px] text-muted-foreground">{tab === "mine" && !q ? "还没创建过角色。点「新建」开始。" : "没有匹配的角色"}</li>}
            {list.map((p) => { const officialRow = "official" in p && p.official; const I = officialRow ? ((p as (typeof official)[number]).icon) : (AVATAR_MAP[(p as MyPersona).avatar] ?? User); return (
              <li key={p.id}>
                <div data-persona-featured={officialRow && (p as (typeof official)[number]).featured ? "" : undefined} className={cn("group relative flex h-full flex-col gap-2 rounded-xl border p-3 transition-colors hover:bg-muted/30", officialRow && (p as (typeof official)[number]).featured ? "border-[#e9b10c]/50 hover:border-[#e9b10c]/75" : "border-border/50 hover:border-border")}>
                  <div className="flex items-start gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><I size={16} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><span className="truncate text-[13px] font-semibold text-foreground">{p.name}</span><span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0 text-[9px] font-medium text-primary">{officialRow ? "官方" : "我的"}</span></div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{p.intro}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center gap-1 pt-1">
                    <button type="button" onClick={() => { onPick({ id: p.id, name: p.name, intro: p.intro, system_prompt: p.system_prompt, official: officialRow }); onOpenChange(false); }} className="flex-1 rounded-md bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15">选用</button>
                    {officialRow
                      ? <button type="button" onClick={() => copy(p as (typeof official)[number])} className="rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground">复制为我的</button>
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
