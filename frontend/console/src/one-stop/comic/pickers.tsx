"use client";
// 漫剧首页 / 项目设定共用的参数选择器（与原站一致）：画面风格弹窗、屏幕方向、剧集地区、制作规格、调度
import { useState } from "react";
import { toast } from "sonner";
import * as PO from "@radix-ui/react-popover";
import { Check, ChevronDown, Monitor, Plus, Smartphone, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ModelPicker } from "@/components/ui/model-picker";
import { useCatalog } from "@/lib/queries";
import { defaultChatModel, defaultImageModel, defaultVideoModel } from "@/lib/llm";
import { useCollection } from "@/lib/store-local";
import { cn, uid } from "@/lib/utils";
import {useActionConfirmation} from '../adapters/action-confirmation';
import { COMIC_REGIONS, COMIC_STRATEGIES, RATIO_LABEL, STYLE_GROUPS, STYLE_GROUP_COUNT, type ComicRatio, type ComicStrategy } from "./types";

const trigger = "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm hover:bg-muted data-[state=open]:bg-muted";
const panel = "z-50 rounded-tile border bg-card p-3 shadow-pop animate-in fade-in-0 zoom-in-95 outline-none";

/** pill：漫剧首页输入区用的描边胶囊（参考站 cs-fpill，无下拉箭头；未选必填项金色高亮） */
function Pop({ label, value, children, width = 260, disabled, pill, req }: { label?: string; value: string; children: (close: () => void) => React.ReactNode; width?: number; disabled?: boolean; pill?: boolean; req?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <PO.Root open={open} onOpenChange={setOpen}>
      <PO.Trigger asChild disabled={disabled}>{pill
        ? <button type="button" className={cn("cs-fpill", req && "cs-fpill--req")} aria-haspopup="dialog">{label && <span className="cs-k">{label}</span>}<span className="cs-v">{value}</span></button>
        : <button type="button" className={cn(trigger, disabled && "opacity-60")} aria-haspopup="dialog">{label && <span className="text-muted-foreground">{label}</span>}<span className="font-medium">{value}</span><ChevronDown size={13} className="text-muted-foreground" /></button>}</PO.Trigger>
      <PO.Portal><PO.Content sideOffset={6} align="start" className={panel} style={{ width }}>{children(() => setOpen(false))}</PO.Content></PO.Portal>
    </PO.Root>
  );
}

const Opt = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted", on && "bg-primary-tint text-accent-foreground")}>{children}<span className="ml-auto">{on && <Check size={14} />}</span></button>
);

/** 屏幕方向：竖屏 9:16 / 横屏 16:9 */
export function RatioPicker({ value, onChange, pill }: { value: ComicRatio; onChange: (v: ComicRatio) => void; pill?: boolean }) {
  return (
    <Pop value={value} width={220} pill={pill}>{(close) => (
      <div><div className="px-1 pb-2 text-xs font-medium text-muted-foreground">屏幕方向</div>
        <Opt on={value === "9:16"} onClick={() => { onChange("9:16"); close(); }}><Smartphone size={15} />竖屏<span className="text-muted-foreground">9:16</span></Opt>
        <Opt on={value === "16:9"} onClick={() => { onChange("16:9"); close(); }}><Monitor size={15} />横屏<span className="text-muted-foreground">16:9</span></Opt>
      </div>)}</Pop>
  );
}

/** 剧集地区：国产剧 · 中文 / 海外剧（9 种语言） */
export function RegionPicker({ value, onChange, pill,hideLabel=false }: { value: string; onChange: (v: string) => void; pill?: boolean;hideLabel?:boolean }) {
  return (
    <Pop label={hideLabel?undefined:"剧集地区"} value={value ? (value.startsWith("海外剧") ? value.replace("海外剧 · ", "海外 · ") : value.split(" · ")[0]) : "未选"} width={300} pill={pill} req={!value}>{(close) => (
      <div><div className="px-1 text-sm font-medium">剧集地区</div><div className="px-1 pb-2 text-xs text-muted-foreground">国产剧用中文创作；海外剧按所选语言写剧名、对白，内容尺度软化</div>
        <div className="max-h-[320px] overflow-y-auto">{COMIC_REGIONS.map((r) => <Opt key={r} on={value === r} onClick={() => { onChange(r); close(); }}>{r}</Opt>)}</div>
      </div>)}</Pop>
  );
}

/** 调度：稳定优先 / 价格优先 / 速度优先（未选时显示「智能」） */
export function StrategyPicker({ value, onChange, pill }: { value?: ComicStrategy; onChange: (v: ComicStrategy) => void; pill?: boolean }) {
  return (
    <Pop label="调度" value={value ?? "智能"} width={200} pill={pill}>{(close) => (
      <div><div className="px-1 pb-2 text-xs font-medium text-muted-foreground">调度</div>
        {COMIC_STRATEGIES.map((s) => <Opt key={s} on={value === s} onClick={() => { onChange(s); close(); }}>{s}</Opt>)}
      </div>)}</Pop>
  );
}

export interface SpecModels { chat?: string; image?: string; video?: string }
/** 制作规格：文案 / 图像 / 视频模型（创建后锁定，全剧统一；仅精品剧） */
export function SpecPicker({ models, onChange, premium, locked, pill }: { models: SpecModels; onChange: (m: SpecModels) => void; premium: boolean; locked?: boolean; pill?: boolean }) {
  const custom = !!(models.chat || models.image || models.video);
  // 没选的项显示项目实际会用的默认模型（与 comic-home 的 build 同源）；以前 ModelPicker 拿到空值就显示列表第一个，
  // 界面写着一台（如 CL Opus 5），创建出来的项目用的却是另一台
  const { data } = useCatalog();
  const def: SpecModels = { chat: defaultChatModel(data?.models)?.id, image: defaultImageModel(data?.models)?.id, video: defaultVideoModel(data?.models)?.id };
  return (
    <Pop label="制作规格" value={custom ? "自定义" : "默认"} width={340} disabled={locked} pill={pill}>{() => (
      <div className="space-y-3">
        <div><div className="flex items-center gap-2 text-sm font-medium">制作规格<span className="rounded-full bg-primary-tint px-1.5 text-[10px] text-accent-foreground">仅精品剧</span></div><div className="text-xs text-muted-foreground">模型与分辨率（创建后锁定，全剧统一）</div></div>
        {!premium && <div className="rounded-lg bg-muted px-2.5 py-2 text-xs text-muted-foreground">批量剧的制作配置按系列自动预设</div>}
        {([["chat", "文案模型", "chat"], ["image", "图像模型", "image"], ["video", "视频模型", "video"]] as const).map(([k, l, cat]) => (
          <div key={k} className="flex items-center gap-2 text-sm"><span className="w-16 shrink-0 text-muted-foreground">{l}</span>
            <ModelPicker category={cat} value={models[k] ?? def[k] ?? ""} onChange={(v) => onChange({ ...models, [k]: v })} className="h-9 min-w-0 flex-1 justify-between rounded-xl text-xs" />
            {models[k] ? <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => onChange({ ...models, [k]: undefined })}>默认推荐</button> : <span className="text-[11px] text-muted-foreground">默认推荐</span>}
          </div>
        ))}
        <div className="border-t pt-2 text-[11px] text-muted-foreground">创建后锁定，章节继承统一规格以保持跨集一致</div>
      </div>)}</Pop>
  );
}

interface MyStyle { id: string; name: string; prompt: string; createdAt: number }

/** 画面风格弹窗：我的自建 / 真人 / 2D / 3D */
export function StylePicker({ value, onChange, placeholder = "未选", buttonClassName, pill,hideLabel=false }: { value: string; onChange: (v: string) => void; placeholder?: string; buttonClassName?: string; pill?: boolean;hideLabel?:boolean }) {
  const ask=useActionConfirmation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>(() => STYLE_GROUPS.find((g) => g.styles.includes(value))?.key ?? "真人");
  const mine = useCollection<MyStyle>("comic-styles");
  const [name, setName] = useState(""); const [prompt, setPrompt] = useState("");
  const [saving,setSaving]=useState(false);
  const createStyle=async()=>{if(saving||mine.state.saveError)return;setSaving(true);try{const id=uid();mine.upsert({id,name:name.trim(),prompt:prompt.trim(),createdAt:Date.now()});await mine.flush(id);setName("");setPrompt("");toast.success("风格已保存到服务器");}catch(e){toast.error((e as Error).message);}finally{setSaving(false);}};
  const pick = (v: string) => { onChange(v); setOpen(false); };
  const list = STYLE_GROUPS.find((g) => g.key === tab)?.styles ?? [];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {pill
        ? <button type="button" onClick={() => setOpen(true)} className={cn("cs-fpill", !value && "cs-fpill--req", buttonClassName)} aria-haspopup="dialog"><span className="cs-k">画面风格</span><span className="cs-v">{value || placeholder}</span></button>
        : <button type="button" onClick={() => setOpen(true)} className={cn(trigger, buttonClassName)} aria-label="画面风格" aria-haspopup="dialog">{!hideLabel&&<span className="text-muted-foreground">画面风格</span>}<span className="font-medium">{value || placeholder}</span><ChevronDown size={13} className="text-muted-foreground" /></button>}
      <DialogContent title="画面风格" description="选定风格锁定到所有剧集，并注入 9 个创作阶段的画面语言" className="w-[min(94vw,880px)]">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {["我的自建", ...STYLE_GROUPS.map((g) => g.key)].map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("chip h-9", tab === k && "chip-active")}>{k}{STYLE_GROUP_COUNT[k] ? <span className="text-xs opacity-70">{STYLE_GROUP_COUNT[k]}</span> : null}</button>)}
        </div>
        <div className="mt-4 max-h-[56vh] overflow-y-auto pr-1">
          {tab === "我的自建" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2 rounded-2xl border bg-muted/40 p-3">
                <label className="w-40 text-xs"><span className="text-muted-foreground">风格名</span><input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none" placeholder="例：雨夜霓虹" /></label>
                <label className="min-w-0 flex-1 text-xs"><span className="text-muted-foreground">风格描述（注入画面语言）</span><input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none" placeholder="色调、光线、笔触、镜头质感…" /></label>
                <button type="button" disabled={!name.trim()||saving||!!mine.state.saveError} onClick={()=>void createStyle()} className="chip h-9 disabled:opacity-50"><Plus size={14} />{saving?"正在保存…":"新建风格"}</button>
              </div>
              {mine.items.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">还没有自建风格</div> : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{mine.items.map((m) => (
                  <div key={m.id} className={cn("group relative rounded-xl border p-3 text-left hover:border-primary/50", value === m.name && "border-primary ring-2 ring-primary/20")}>
                    <button type="button" className="block w-full text-left" onClick={() => pick(m.name)}><div className="truncate text-sm font-medium">{m.name}</div><div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.prompt || "—"}</div></button>
                    <button type="button" aria-label={`删除 ${m.name}`} onClick={async () => {if(await ask({title:'移除自建风格？',description:`「${m.name}」将移入回收状态，已有项目不会自动重新生成。`,confirm:'移除风格',danger:true}))void mine.remove(m.id).catch(e=>toast.error(e.message));}} className="icon-btn absolute right-1 top-1 h-6 w-6 opacity-0 hover:text-danger group-hover:opacity-100"><Trash2 size={12} /></button>
                  </div>))}</div>
              )}
              {(mine.state.hasMore||mine.state.error)&&<button type="button" className="chip" disabled={mine.state.loading} onClick={()=>void mine.load().catch(e=>toast.error(e.message))}>{mine.state.loading?"正在读取…":"加载更多风格"}</button>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {list.map((s, i) => (
                <button key={s} type="button" onClick={() => pick(s)} className={cn("group overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-pop", value === s && "border-primary ring-2 ring-primary/25")}>
                  <div className="relative aspect-[4/3]" style={{ background: styleSwatch(tab, i) }}>{value === s && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-white"><Check size={12} /></span>}</div>
                  <div className="truncate px-2 py-1.5 text-xs font-medium">{s}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 风格卡封面：每个分类使用一张 4 x 3 的独立样片图集。
 * 分类内前 12 个风格各有自己的画面，避免不同风格复用同一张封面。
 */
function styleSwatch(group: string, i: number) {
  const atlas = group === "真人"
    ? "style-preview-live-v1.png"
    : group === "2D"
      ? "style-preview-2d-v1.png"
      : "style-preview-3d-v1.png";
  const tile = i % 12;
  const col = tile % 4;
  const row = Math.floor(tile / 4);
  const x = [0, 33.333, 66.667, 100][col];
  const y = [0, 50, 100][row];
  return `url("/one-stop/brand/${atlas}") ${x}% ${y}% / 400% 300% no-repeat`;
}
export { RATIO_LABEL };
