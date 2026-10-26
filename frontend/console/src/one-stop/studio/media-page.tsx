// 媒体工作台布局：造物 components/media/media-page.tsx 的移植。
// 三段式骨架——白色工作区面板（顶条 / 作品流 / 输入 dock）；参数胶囊交给页面注入（param-form），
// 参考素材上传格支持 图片 / 视频 / 音频 三类（模式 tab 决定显示哪几格，造物同款）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowDown, BookOpen, Check, ChevronDown, Copy, CornerDownLeft, Download, Eraser, Film, Highlighter, Image as ImageIcon, Heart, Info,
  FoldVertical, Images, ListChecks, Loader2, Maximize2, Mic, Music4, PencilLine, Pin, Plus, QrCode, Quote, RefreshCw, Send, Share2, Trash2, Wand2, WandSparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import type { CatalogModel } from "@/lib/models";
import { cn, timeHM, dateLabel } from "@/lib/utils";
import { useCatalog } from "../adapters/queries";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AppShell } from "../adapters/shell";
import { useStudio, reuseWork, type Modality, type Work, type WorkKind } from "./store";
import {
  benchChip, EmptyModel, OmniDialog, RichTip, SideDrawer, TipProvider,
  WorkspaceHero, lastFrame, topbarBtn, trimByLine, useNow,
} from "./ui";
import { AnnotateDialog, type AnnotateResult } from "./annotate";
import { QrUploadDialog, type PickupItem } from "./qr-upload";
import { HELP_DEFAULT, HELP_NONE, HELP_NONE_LABEL, HELP_NONE_DESC, helpSkillsFor, helpSystemPrompt, loadHelpSkill, saveHelpSkill } from "./help-skill";
import { PromptMasterDialog, type PersonaPick } from "./prompt-master";
import { VoiceoverDialog } from "./voiceover";
import { WorksPickerDialog } from "./works-picker";
import { useNavigate } from "react-router-dom";

export type RefKind = "image" | "video" | "audio";
export interface MediaMode { key: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; desc?: string; refs?: number; refLabel?: string; tiles?: RefTile[]; default?: boolean }
export interface RefTile { kind: RefKind; max: number; label: string; aria: string; required?: boolean; optional?: boolean }
export interface Estimate { total: string; max?: string; rows: [string, string][]; cost?: number }
export interface MediaRefs { images: string[]; videos: string[]; audios: string[]; mask?: string }

const railTool = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-card/40 text-muted-foreground transition-all duration-200 hover:border-border hover:bg-muted hover:text-foreground";
const Rail = ({ label, desc, icon: I, onClick, active }: { label: string; desc?: string; icon: typeof BookOpen; onClick: () => void; active?: boolean }) => (
  <RichTip title={label} desc={desc} side="left"><button type="button" onClick={onClick} aria-label={label} className={cn(railTool, active && "border-foreground/20 bg-muted text-foreground")}><I size={16} className="h-4 w-4" /></button></RichTip>
);
const ACCEPT: Record<RefKind, string> = { image: "image/*", video: "video/*", audio: "audio/*" };
const MB = 1048576;
/** 超过这个大小的参考图先在浏览器里压一遍；视频 / 音频不压，超限直接拒收（后端 JSON 上限 25MB） */
const COMPRESS_OVER = 20 * MB;
const MEDIA_MAX = 12 * MB;

/** 局部重绘：把蒙版（透明=要重绘）以半透明红盖印到原图上，导出单张标记图随请求上送 */
async function compositeMask(imageUrl: string, maskUrl: string): Promise<string> {
  const [img, mk] = await Promise.all([imageUrl, maskUrl].map((src) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("读取失败")); i.src = src; })));
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(mk, 0, 0, c.width, c.height);
  ctx.globalAlpha = 1;
  return c.toDataURL("image/jpeg", 0.92);
}

async function shrinkImage(dataUrl: string, maxEdge: number, maxBytes = 8 * MB): Promise<string> {
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("图片读取失败")); img.src = dataUrl; });
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  let out = canvas.toDataURL("image/jpeg", 0.9);
  for (let q = 0.8; q >= 0.4 && out.length > maxBytes; q -= 0.2) out = canvas.toDataURL("image/jpeg", q);
  return out;
}

interface Attachment { url: string; name: string; kind: RefKind }

/** 参考素材上传格（造物 reference-add-tile：52×64、-8° 倾斜、右下角计数）；按格子的种类收图 / 视频 / 音频 */
function UploadTile({ tile, items, onAdd, onRemove, uploading, onQr, onPickFromWorks }: { tile: RefTile; items: Attachment[]; onAdd: (files: File[]) => void; onRemove: (url: string) => void; uploading: boolean; onQr?: () => void; onPickFromWorks?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const thumb = (a: Attachment) => a.kind === "image"
    ? <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
    : a.kind === "video"
      ? <><video src={a.url} muted playsInline preload="metadata" className="h-full w-full object-cover" /><span aria-hidden className="absolute inset-0 grid place-items-center bg-black/25 text-white text-[9px]">▶ 视频</span></>
      : <span className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">♪ 音频</span>;
  return (
    <div role="group" aria-label={tile.aria} className="relative flex shrink-0 items-center gap-2 rounded-lg outline-none">
      <input ref={inputRef} type="file" multiple={tile.max > 1} accept={ACCEPT[tile.kind]} className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; onAdd(fs); }} />
          {onQr && (
            <button type="button" onClick={onQr} className="absolute bottom-[2px] left-[2px] z-10 inline-flex -rotate-[8deg] items-center justify-center text-primary transition-transform hover:scale-110 motion-reduce:rotate-0" aria-label="扫码用手机上传" title="扫码用手机上传"><QrCode size={13} /></button>
          )}
      {items.map((a) => (
        <span key={a.url} className="group relative h-[64px] w-[52px] shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
          {thumb(a)}
          <button type="button" onClick={() => onRemove(a.url)} className="absolute right-0.5 top-0.5 z-10 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white" aria-label="移除参考素材"><X size={10} /></button>
        </span>
      ))}
      <div className="relative shrink-0" style={{ width: 52, height: 64 }}>
        {onPickFromWorks && (
          <button type="button" onClick={onPickFromWorks} className="absolute -top-1 right-0 z-10 inline-flex rotate-[8deg] items-center justify-center text-primary transition-transform hover:scale-110 motion-reduce:rotate-0" aria-label={`从作品库选${tile.label}`} title={`从作品库选${tile.label}`}><Images size={13} /></button>
        )}
        <button type="button" onClick={() => inputRef.current?.click()} aria-label={tile.aria} title={tile.aria}
          className="relative flex h-full w-full -rotate-[8deg] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 bg-card/60 text-center leading-none text-muted-foreground shadow-sm transition-[rotate,scale,border-color,color] duration-300 hover:rotate-[-4deg] hover:scale-105 hover:border-primary/55 hover:text-primary motion-reduce:rotate-0">
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={20} className="h-5 w-5" aria-hidden />}
          <span className="absolute bottom-[2px] right-[3px] text-[8px] tabular-nums text-muted-foreground/50">{items.length}/{tile.max}</span>
        </button>
      </div>
    </div>
  );
}

export interface MediaPageProps {
  modality: WorkKind; label: string; placeholder: string;
  modes: MediaMode[];
  /** 按当前模型（param_schema）给出模式与各模式的上传格；不给用 modes */
  modesFor?: (m: CatalogModel) => MediaMode[] | undefined;
  renderParams: (m: CatalogModel, values: Record<string, string>, set: (k: string, v: string) => void, mode: string) => React.ReactNode;
  estimate?: (m: CatalogModel, values: Record<string, string>, mode: string, media: { images: number; videos: number; audios: number }, prompt: string) => Estimate | null;
  /** 返回 false 表示被前置校验拦下、没有提交：此时页面保留提示词与已上传素材 */
  submit: (m: CatalogModel, prompt: string, values: Record<string, string>, mode: string, media: MediaRefs) => Promise<void | false>;
  /** 智能帮写的系统提示；不给用通用版 */
  helpPrompt?: string;
  /** 玩法说明抽屉内容 */
  playbook: React.ReactNode;
  /** 空状态推荐问题 */
  samples?: string[];
  /** 空状态副标题（默认模型系列名） */
  subtitleFor?: (m: CatalogModel) => string | undefined;
  heroCaption?: string;
  heroIcon?: React.ReactNode;
  /** 输入区顶栏的额外控件（视频页的「稳定优先」渠道策略等） */
  chipsExtra?: (m: CatalogModel) => React.ReactNode;
}

/** 通用帮写提示词（造物 HELP_PROMPT） */
const HELP_PROMPT: Record<WorkKind, string> = {
  image: "你是 AI 绘图提示词专家。把用户的简短描述扩写成一条高质量中文生图提示词：主体、构图/镜头、场景、光线、风格、材质、画质，60~120 字，不要解释，只输出提示词。",
  video: "你是 AI 视频提示词专家。把用户的描述改写成一条高质量视频提示词：主体 + 动作 + 场景 + 运镜 + 光线 + 画质，一个镜头一句话，60~120 字，不要解释，只输出提示词。",
  audio: "你是配音文案专家。把用户的内容润色成适合朗读的口播文案，语句自然、有停顿感，保留原意，只输出文案。",
};

export function MediaPage(p: MediaPageProps) {
  const navigate = useNavigate();
  const { data: catalog, isError: catalogFailed, refetch: refetchCatalog } = useCatalog();
  const works = useStudio((s) => s.works); const addWork = useStudio((s) => s.addWork); const updateWork = useStudio((s) => s.updateWork); const removeWork = useStudio((s) => s.removeWork);
  const selected = useStudio((s) => s.selected[p.modality as Modality]); const select = useStudio((s) => s.select);
  const pinned = useStudio((s) => s.pinned); const togglePin = useStudio((s) => s.togglePin);
  const myWorks = useMemo(() => works.filter((w) => w.kind === p.modality), [works, p.modality]);
  const models = useMemo(() => (catalog?.models ?? []).filter((m) => m.category === p.modality), [catalog, p.modality]);
  const model = useMemo(
    () => models.find((m) => m.id === selected) ?? models.find((m) => pinned.includes(m.id)) ?? models.find((m) => m.featured) ?? models[0],
    [models, selected, pinned],
  );
  useEffect(() => { if (model && model.id !== selected) select(model); }, [model, selected, select]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rawMode, setMode] = useState<string>(p.modes[0]?.key ?? "default");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [compress, setCompress] = useState(true);
  const [dlg, setDlg] = useState<"tasks" | "playbook" | "estimate" | "qr" | null>(null);
  /** 标注 / 局部重绘弹窗（作品卡工具触发）：src 为要处理的图，tool 决定初始页签 */
  const [ann, setAnn] = useState<{ src: string; tool: "annotate" | "inpaint" } | null>(null);
  /** 局部重绘蒙版（dataURL，透明处 = 要重绘的区域）：随下一次生成发给后端 */
  const [mask, setMask] = useState<string | null>(null);
  /** 从作品库选素材：目标上传格种类 */
  const [pickKind, setPickKind] = useState<RefKind | null>(null);
  /** 用文案配音（视频页且当前模式收参考音频时显示） */
  const [voOpen, setVoOpen] = useState(false);
  const [helping, setHelping] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [showDown, setShowDown] = useState(false);
  const [full, setFull] = useState(false);
  const [enterNewline, setEnterNewline] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const now = useNow();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const set = useCallback((k: string, v: string) => setValues((c) => ({ ...c, [k]: v })), []);
  // 模式列表：优先按模型 schema 动态推导；当前模型不支持所选模式时回落到默认模式
  const modes = useMemo(() => (model && p.modesFor?.(model)) || p.modes, [model, p]);
  useEffect(() => { if (!modes.some((m) => m.key === rawMode)) setMode(modes.find((m) => m.default)?.key ?? modes[0]?.key ?? "default"); }, [modes, rawMode]);
  const mode = modes.some((m) => m.key === rawMode) ? rawMode : (modes.find((m) => m.default)?.key ?? modes[0]?.key ?? "default");
  const cur = modes.find((m) => m.key === mode) ?? modes[0];
  /** 当前模式的各上传格：页面给了 tiles 用 tiles，否则按 refs 推一个图片格 */
  const tiles: RefTile[] = useMemo(() => {
    if (cur?.tiles) return cur.tiles.filter((t) => t.max > 0);
    if (cur?.refs) return [{ kind: "image", max: cur.refs, label: (cur.refLabel ?? "上传参考图").replace(/^上传/, ""), aria: cur.refLabel ?? "上传参考图" }];
    return [];
  }, [cur]);
  const countOf = useCallback((k: RefKind) => attachments.filter((a) => a.kind === k).length, [attachments]);
  const capOf = useCallback((k: RefKind) => tiles.find((t) => t.kind === k)?.max ?? 0, [tiles]);
  const textOf = () => textRef.current?.value ?? "";

  // 预估价：参数变化停手 400ms 后重算（报价请求别跟每个按键走）
  const estKey = JSON.stringify(values) + mode + attachments.map((a) => a.kind).join(",") + (model?.id ?? "");
  useEffect(() => {
    if (!model || !p.estimate) { setEst(null); return; }
    const t = setTimeout(() => { try { setEst(p.estimate!(model, values, mode, { images: Math.min(countOf("image"), capOf("image")), videos: Math.min(countOf("video"), capOf("video")), audios: Math.min(countOf("audio"), capOf("audio")) }, textOf())); } catch { setEst(null); } }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id, estKey, p.estimate]);

  // 作品卡「重新编辑 / 再次生成 / 任务记录沿用」：按作品原样恢复提示词 + 参数 + 输入模式 + 参考图
  useEffect(() => {
    const h = (e: Event) => {
      const w = (e as CustomEvent<Work>).detail; if (!w || w.kind !== p.modality) return;
      const params = w.meta?.params; if (params && typeof params === "object") setValues({ ...(params as Record<string, string>) });
      const mk = w.meta?.modeKey; if (typeof mk === "string" && modes.some((m) => m.key === mk)) setMode(mk);
      if (textRef.current) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
        setter.call(textRef.current, w.prompt); textRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const r = Array.isArray(w.meta?.refs) ? (w.meta.refs as unknown[]).filter((u): u is string => typeof u === "string" && !!u) : [];
      const max = capOf("image");
      setAttachments(r.slice(0, max).map((url) => ({ url, name: "参考图", kind: "image" as const })));
      if (r.length > max) toast.info(`这个模式最多带 ${max} 张参考图，已保留前 ${max} 张`);
    };
    document.addEventListener("mc:reuse", h);
    return () => document.removeEventListener("mc:reuse", h);
  });

  // 滚动：新作品贴底；向上翻历史时出现「回到最新」
  useEffect(() => { const el = scrollRef.current; if (el && !showDown) el.scrollTo({ top: el.scrollHeight }); }, [myWorks.length, busy, showDown]);
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const h = () => setShowDown(el.scrollTop + el.clientHeight < el.scrollHeight - 320);
    el.addEventListener("scroll", h, { passive: true }); h();
    return () => el.removeEventListener("scroll", h);
  }, [myWorks.length]);

  /** 参考素材：图片超线先压，视频 / 音频按体积上限收 dataURL（后端 25MB JSON 上限内） */
  const addFiles = async (tile: RefTile, files: File[]) => {
    setUploading(true);
    try {
      const out: Attachment[] = [];
      const room = tile.max - countOf(tile.kind);
      for (const f of files.slice(0, Math.max(0, room))) {
        const okKind = tile.kind === "image" ? f.type.startsWith("image/") : tile.kind === "video" ? f.type.startsWith("video/") : f.type.startsWith("audio/");
        if (!okKind) { toast.error(`「${f.name}」不是${tile.kind === "image" ? "图片" : tile.kind === "video" ? "视频" : "音频"}文件`); continue; }
        if (!f.size) { toast.error(`「${f.name}」是空文件，请重新选择`); continue; }
        if (tile.kind !== "image" && f.size > MEDIA_MAX) { toast.error(`「${f.name}」超过 ${Math.round(MEDIA_MAX / MB)}MB，请先裁短或压缩再上传`); continue; }
        if (tile.kind === "image" && f.size > 30 * MB) { toast.error(`「${f.name}」超过 30MB，请更换更小的图片`); continue; }
        const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); }).catch(() => null as unknown as string);
        if (!dataUrl) { toast.error(`「${f.name}」读取失败，请换一个文件`); continue; }
        const shrunk = tile.kind === "image" && f.size > COMPRESS_OVER ? await shrinkImage(dataUrl, 2048).catch(() => dataUrl) : dataUrl;
        out.push({ url: shrunk, name: f.name, kind: tile.kind });
      }
      if (files.length > Math.max(0, room) && room >= 0) toast.info(`${tile.label}最多 ${tile.max} 个，已保留前 ${Math.max(0, room)} 个`);
      if (out.length) setAttachments((c) => [...c, ...out]);
    } catch (e) { toast.error((e as Error).message || "文件读取失败，请换一个"); }
    finally { setUploading(false); }
  };

  /** 智能帮写 / 提示词大师（造物 help-skill 同款）：按选中的帮写 skill 扩写，先进草稿区让用户改。
   *  choice 为 default（通用写法）/ none（不使用 skill）/ 某个 skill id；每个页面记住上次选择。 */
  const helpWrite = async (choice?: string) => {
    const text = textOf().trim();
    if (!text) { toast.error("先写一句简单描述，再让 AI 帮写"); return; }
    const cm = catalog?.models.find((m) => m.category === "chat");
    if (!cm) { toast.error("暂无可用文本模型，无法智能帮写"); return; }
    const pick = choice ?? helpSkill();
    setHelping(true);
    try {
      const { chat } = await import("../adapters/llm");
      const sys = helpSystemPrompt(p.modality as "image" | "video" | "audio", pick, p.helpPrompt ?? HELP_PROMPT[p.modality]);
      const r = await chat(cm.id, [{ role: "system", content: sys }, { role: "user", content: text }], { temperature: 0.8 });
      const out = r.content.trim();
      if (!out) throw new Error("模型没有返回内容");
      setDraft(out);
      const picked = helpSkills().find((x) => x.id === pick);
      if (picked) toast.success(`已按「${picked.name}」写好一版，可再改再采用`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setHelping(false); }
  };
  const [masterOpen, setMasterOpen] = useState(false);
  /** 提示词大师「选用」：用该角色的写法优化当前描述（草稿区可改再采用） */
  const applyPersona = async (p: PersonaPick) => {
    const text = textOf().trim();
    if (!text) { toast.error("先写一句描述，再让编导帮你优化"); return; }
    const cm = catalog?.models.find((m) => m.category === "chat");
    if (!cm) { toast.error("暂无可用文本模型"); return; }
    setHelping(true);
    try {
      const { chat } = await import("../adapters/llm");
      const r = await chat(cm.id, [{ role: "system", content: p.system_prompt }, { role: "user", content: text }], { temperature: 0.8 });
      const out = r.content.trim();
      if (!out) throw new Error("模型没有返回内容");
      setDraft(out);
      toast.success(`已按「${p.name}」优化当前描述，可再改再采用`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setHelping(false); }
  };
  const [masterPick, setMasterPick] = useState<string | null>(null);
  const helpSkill = () => masterPick ?? loadHelpSkill(p.modality as "image" | "video" | "audio");
  const helpSkills = () => helpSkillsFor(p.modality as "image" | "video" | "audio");
  const currentSkill = helpSkills().find((x) => x.id === helpSkill());
  const skillOptions = [{ id: HELP_DEFAULT, name: "通用写法", description: p.helpPrompt ? "本页通用写法" : "按页面默认写法扩写" }, { id: HELP_NONE, name: HELP_NONE_LABEL, description: HELP_NONE_DESC }, ...helpSkills()];
  const adoptDraft = () => {
    const text = (draft ?? "").trim(); if (!text) { setDraft(null); return; }
    if (textRef.current) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textRef.current, text); textRef.current.dispatchEvent(new Event("input", { bubbles: true })); textRef.current.focus();
    }
    setDraft(null); toast.success("已采用帮写的提示词");
  };
  /** textarea 直操作 DOM（受控 value 每次渲染会丢光标，造物同款做法） */
  const setText = (v: string) => {
    if (!textRef.current) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(textRef.current, v);
    textRef.current.dispatchEvent(new Event("input", { bubbles: true }));
  };
  /** 标注 / 局部重绘结果（造物 work-card.applyAnnotate 同款）：标注图直接作参考图；重绘挂原图 + 蒙版 */
  const applyAnnotate = (r: AnnotateResult) => {
    const imgCap = capOf("image");
    if (imgCap <= 0) { toast.error("当前模式不收参考图，请先切到带参考图的生成模式"); return; }
    if (r.kind === "annotate") {
      setAttachments((c) => [...c.filter((a) => a.kind !== "image" || !a.name.startsWith("标注图")), { url: r.url, name: "标注图", kind: "image" as const }].slice(0, Math.max(0, imgCap)));
      toast.success("标注图已作为参考图，请在提示词里说明要怎么改");
      return;
    }
    setMask(r.mask);
    setAttachments((c) => [...c.filter((a) => a.kind !== "image" || !a.name.startsWith("重绘原图")), { url: r.image, name: "重绘原图", kind: "image" as const }].slice(0, Math.max(0, imgCap)));
    toast.success("已记下涂抹区域：写好要改成什么再生成，只会重绘涂抹处");
  };
  // 作品卡「标注编辑 / 局部重绘」事件（WorkCard 里派发 mc:annotate）
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ url: string; tool: "annotate" | "inpaint" }>).detail;
      if (d?.url) setAnn({ src: d.url, tool: d.tool ?? "annotate" });
    };
    document.addEventListener("mc:annotate", h);
    return () => document.removeEventListener("mc:annotate", h);
  }, []);
  // 蒙版只在重绘原图还在时有效：图被移除就清掉
  useEffect(() => {
    if (mask && !attachments.some((a) => a.name.startsWith("重绘原图"))) setMask(null);
  }, [attachments, mask]);

  // mc:attach（作品卡「用作参考图 / 末帧用作首帧」）与 mc:mode（切换输入模式）
  useEffect(() => {
    const onMode = (e: Event) => { const k = (e as CustomEvent<string>).detail; if (k && modes.some((m) => m.key === k)) setMode(k); };
    const onAtt = (e: Event) => {
      const a = (e as CustomEvent<{ url: string; name?: string; type?: RefKind }>).detail;
      if (!a?.url) return;
      const kind: RefKind = a.type === "video" ? "video" : a.type === "audio" ? "audio" : "image";
      const t = tiles.find((x) => x.kind === kind);
      if (!t || t.max <= 0) { toast.error(`当前模式不收${kind === "image" ? "参考图" : kind === "video" ? "参考视频" : "参考音频"}，请切换模式`); return; }
      setMode((m) => m); // 保持当前模式
      setAttachments((c) => [...c.filter((x) => x.kind !== kind || x.name !== (a.name ?? "参考图")), { url: a.url, name: a.name ?? "参考图", kind: kind as RefKind }]);
      toast.success(`已挂进${t.label}`);
    };
    document.addEventListener("mc:mode", onMode);
    document.addEventListener("mc:attach", onAtt);
    return () => { document.removeEventListener("mc:mode", onMode); document.removeEventListener("mc:attach", onAtt); };
  }, [modes, tiles]);

  // 扫码取回：新素材按种类挂进当前模式的对应上传格
  const applyPickup = (items: PickupItem[]) => {
    for (const x of items) {
      const kind: RefKind = x.kind === "video" ? "video" : x.kind === "audio" ? "audio" : "image";
      const t = tiles.find((y) => y.kind === kind);
      if (!t || t.max <= 0) { toast.info(`「${x.name}」当前模式用不上（没有${kind === "image" ? "图片" : kind === "video" ? "视频" : "音频"}上传格），已保存在扫码记录里`); continue; }
      setAttachments((c) => (c.some((a) => a.url === x.url) || c.filter((a) => a.kind === kind).length >= t.max ? c : [...c, { url: x.url, name: x.name, kind: kind as RefKind }]));
    }
  };

  // 挂载时读 sessionStorage 注入（图片卡「转视频」跨页带提示词 + 参考图；造物 composer 同款约定）
  useEffect(() => {
    try {
      const pre = sessionStorage.getItem("mc.prefill");
      if (pre) { sessionStorage.removeItem("mc.prefill"); queueMicrotask(() => setText(pre)); }
      const att = sessionStorage.getItem("mc.attach");
      if (att) { sessionStorage.removeItem("mc.attach"); const a = JSON.parse(att); if (a?.url) queueMicrotask(() => document.dispatchEvent(new CustomEvent("mc:attach", { detail: a }))); }
    } catch { /* 脏数据忽略 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mc:prefill 注入（字符串追加 / {text, replace} 整段替换）
  useEffect(() => {
    const onPre = (e: Event) => {
      const d = (e as CustomEvent<string | { text: string; replace?: boolean }>).detail;
      const t = typeof d === "string" ? d : d.text; const replace = typeof d !== "string" && !!d.replace;
      const curText = textOf();
      setText(curText && !replace ? curText + "\n" + t : t);
      textRef.current?.focus();
    };
    document.addEventListener("mc:prefill", onPre);
    return () => document.removeEventListener("mc:prefill", onPre);
  }, []);

  const send = async () => {
    if (!model) return;
    const text = textOf().trim();
    if (busy) return;
    if (!text && !attachments.length) { toast.info("请先输入提示词，或上传参考素材"); return; }
    // 上传格写了必传的（视频编辑的源视频等）：缺了先说，不发出去白等一单失败
    const missing = tiles.find((t) => t.required && countOf(t.kind) === 0);
    if (missing) { toast.error(`请先上传${missing.label}`); return; }
    // 非首个模式的图片格（首帧 / 参考图）也要有素材
    const imgTile = tiles.find((t) => t.kind === "image");
    if (imgTile && !imgTile.optional && countOf("image") === 0 && mode !== modes[0]?.key && !tiles.some((t) => t.kind !== "image" && countOf(t.kind) > 0)) { toast.error(`请先上传${imgTile.label}`); return; }
    // 模式写了上传格时严格按上限取（0 = 这个模式不收这种素材，一张都不带）
    const pick = (k: RefKind) => attachments.filter((a) => a.kind === k).slice(0, capOf(k)).map((a) => a.url);
    // 局部重绘：蒙版半透明红盖印进「重绘原图」（按名字定位，上传格里还有别的图也不会合成错），提示词自动补指令
    let images = pick("image");
    let effectiveText = text;
    if (mask && images.length) {
      const base = attachments.find((a) => a.kind === "image" && a.name.startsWith("重绘原图") && images.includes(a.url))?.url ?? images[0];
      try {
        images = [await compositeMask(base, mask), ...images.filter((u) => u !== base)];
        effectiveText = `${text}\n（只修改图中红色半透明标注的区域，标注区域以外的画面保持原样）`;
      } catch { toast.error("重绘蒙版合成失败，请重新涂抹"); return false; }
    }
    const media: MediaRefs = { images, videos: pick("video"), audios: pick("audio"), mask: mask ?? undefined };
    setBusy(true);
    try {
      const sent = await p.submit(model, effectiveText, values, mode, media);
      if (sent === false) return;
      if (textRef.current) setText("");
      setAttachments([]);
      setMask(null);
    } catch (e) {
      console.error("[media] submit failed:", e);
      toast.error((e as Error)?.message || "提交没有成功，请重试；若反复出现请刷新页面");
    } finally { setBusy(false); }
  };

  const nameOf = useMemo(() => { const m = new Map(models.map((x) => [x.id, x.name])); return (id: string) => m.get(id) ?? id; }, [models]);
  const isPinned = model ? pinned.includes(model.id) : false;
  const reqs = tiles.map((t) => [t.label, `${t.kind === "image" ? "JPG / PNG / WebP" : t.kind === "video" ? "MP4 等视频 · ≤12MB" : "MP3 / WAV · ≤12MB"} · 最多 ${t.max} 个`] as const);

  const refSlot = tiles.length > 0 ? (
    <div className="flex shrink-0 flex-col justify-center gap-1.5">
      <div className="flex h-full items-stretch gap-2">
        {tiles.map((t) => (
          <UploadTile key={t.kind} tile={t} items={attachments.filter((a) => a.kind === t.kind)} uploading={uploading} onQr={p.modality === "image" ? () => setDlg("qr") : undefined} onPickFromWorks={() => setPickKind(t.kind)}
            onAdd={(fs) => void addFiles(t, fs)} onRemove={(url) => setAttachments((c) => c.filter((x) => x.url !== url))} />
        ))}
        {p.modality === "image" && mask && (
          <div className="flex shrink-0 flex-col items-center justify-center gap-1" title="局部重绘：只重绘涂抹区域，其余像素原样保留">
            <span className="relative block h-[64px] w-[52px] overflow-hidden rounded-md border border-primary/40 bg-[repeating-conic-gradient(var(--muted)_0_25%,var(--card)_0_50%)] bg-[length:8px_8px]">
              <img src={mask} alt="重绘蒙版" className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-primary/80 py-px text-center text-[8px] font-medium text-white">蒙版</span>
              <button type="button" onClick={() => setMask(null)} className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white" aria-label="移除重绘蒙版"><X size={10} /></button>
            </span>
          </div>
        )}
      </div>
      {reqs.length > 0 && <div className="flex flex-col gap-0.5 text-[10px] leading-[14px] text-muted-foreground/75">{reqs.map(([l, r]) => <span key={l} className="whitespace-nowrap">{l}：{r}</span>)}</div>}
    </div>
  ) : undefined;

  const promptRail = (
    <div className="hidden shrink-0 items-center sm:flex [@media(max-height:860px)]:items-start">
      <div className="flex flex-col items-center gap-1.5 [@media(max-height:860px)]:flex-row">
        <RichTip title="回车换行" desc="在光标处插入换行"><button type="button" className={cn(railTool, enterNewline && "border-foreground/25 bg-muted text-foreground")} onClick={() => setEnterNewline(!enterNewline)} aria-label="回车换行"><CornerDownLeft size={14} /></button></RichTip>
        <RichTip title="全屏编辑" desc="打开更大的编辑器编写长提示词"><button type="button" className={railTool} onClick={() => setFull(true)} aria-label="全屏编辑"><Maximize2 size={14} /></button></RichTip>
        <RichTip title="一键清空" desc="清空当前输入内容"><button type="button" className={railTool} onClick={() => { if (textOf() || attachments.length) { setText(""); setAttachments([]); toast.success("已清空"); } }} aria-label="一键清空"><Eraser size={14} /></button></RichTip>
      </div>
    </div>
  );

  return (
    <TipProvider>
      <AppShell>
        <div className="h-[calc(100dvh-3.5rem-13px)] min-h-0 p-[12px] md:pl-0">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-pane border border-foreground/10 bg-card">
            {/* 顶条：置顶 / 玩法说明 ｜ 任务记录 / 模型线路（造物 media-page 同款布局） */}
            <div className="relative z-10 flex w-full shrink-0 flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.06] px-3 py-[10px] sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" aria-pressed={isPinned} aria-label={isPinned ? "取消置顶" : "置顶当前模型"} title={isPinned ? "取消置顶" : "置顶当前模型"} onClick={() => model && togglePin(model.id)} className={cn(topbarBtn(isPinned ? "active" : "neutral"), "min-h-9")}><Pin size={14} />{isPinned ? "取消置顶" : "置顶"}</button>
                <button type="button" aria-label="玩法说明" title="玩法说明" onClick={() => setDlg("playbook")} className={cn(topbarBtn("accent"), "min-h-9")}><BookOpen size={14} /><span className="hidden sm:inline">玩法说明</span></button>
              </div>
              <div className="flex w-full min-w-0 items-center justify-start gap-2 sm:w-auto sm:flex-none sm:justify-end">
                <button type="button" aria-label="任务记录" title="任务记录" onClick={() => setDlg("tasks")} className={cn(topbarBtn("neutral"), "min-h-9")}><ListChecks size={14} /><span className="hidden sm:inline">任务记录</span></button>
                <SeriesPicker models={models} current={model} onPick={select} className={cn(topbarBtn("model"), "min-h-9 min-w-0 flex-1 shrink justify-between sm:flex-none")} />
              </div>
            </div>
            {/* 作品流在上方自己滚动，输入 dock 固定在底部（造物同款） */}
            <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {!model && <EmptyModel modality={p.label} failed={catalogFailed && !catalog} onRetry={() => void refetchCatalog()} />}
              {model && myWorks.length === 0 && (
                <div className="flex h-full min-h-0 w-full flex-col items-center overflow-y-auto overscroll-contain px-4 py-6">
                  <div className="relative z-10 my-auto flex w-full shrink-0 flex-col items-center">
                    <WorkspaceHero model={model} caption={p.heroCaption} subtitle={p.subtitleFor?.(model)} icon={p.heroIcon}
                      suggestions={p.samples} onSuggestion={(q) => setText(q)} />
                  </div>
                </div>
              )}
              {myWorks.length > 0 && <div ref={scrollRef} data-media-scroll className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-5 sm:px-5">
                {myWorks.map((w) => <WorkCard key={w.id} w={w} nameOf={nameOf} onReuse={() => reuseWork(w)} onRedo={() => { reuseWork(w); setTimeout(() => void send(), 50); }} onRemove={() => removeWork(w.id)} onFavorite={() => updateWork(w.id, { favorite: !w.favorite })}
                  onToVideo={p.modality === "image" ? (url) => { try { sessionStorage.setItem("mc.attach", JSON.stringify({ url, name: w.prompt.slice(0, 20), type: "image" })); sessionStorage.setItem("mc.prefill", w.prompt); } catch {} navigate("/video-studio"); } : undefined} />)}
              </div>}
              {showDown && <button onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })} className="absolute bottom-4 left-1/2 z-30 flex h-10 -translate-x-1/2 items-center gap-1.5 rounded-full border bg-card px-4 text-sm shadow-pop hover:bg-muted"><ArrowDown size={14} className="rotate-180" />回到最新</button>}
            </section>
            {/* 输入 dock */}
            <div className="relative z-20 shrink-0 px-2 pb-2 pt-2 sm:px-4 sm:pb-3 sm:pt-3 border-t border-foreground/[0.06]">
              <div className="relative">
                <div className="flex flex-col gap-1">
                  {draft !== null && (
                    <div role="region" aria-label="智能帮写结果" className="mb-1 rounded-[20px] border border-foreground/10 bg-card/95 p-3 shadow-pop backdrop-blur-xl pop-in sm:ml-11">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground"><WandSparkles size={14} className="text-primary" />帮写结果 <span className="font-normal text-muted-foreground">· 可以直接改，满意再采用</span></span>
                        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                          {helpSkills().length > 0 && (
                            <select aria-label="帮写 skill" value={helpSkill()} disabled={helping}
                              onChange={(e) => { setMasterPick(e.target.value); saveHelpSkill(p.modality as "image" | "video" | "audio", e.target.value); if (!helping) void helpWrite(e.target.value); }}
                              className="h-7 max-w-[220px] cursor-pointer truncate rounded-full border border-border/70 bg-card px-2 text-[11px] text-foreground outline-none transition-colors hover:border-foreground/25">
                              {skillOptions.map((op) => <option key={op.id} value={op.id}>{op.id === HELP_NONE ? HELP_NONE_LABEL : op.name}</option>)}
                            </select>
                          )}
                          {draft.length} 字
                        </span>
                      </div>
                      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} aria-label="编辑帮写结果" className="block w-full resize-y rounded-2xl border border-border/60 bg-muted/50 px-3 py-2 text-[13px] leading-6 text-foreground outline-none focus:border-foreground/25" />
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => setDraft(null)} className={cn(topbarBtn("neutral"), "min-h-8")}><X size={13} />放弃</button>
                        <button type="button" onClick={() => void helpWrite()} disabled={helping} className={cn(topbarBtn("neutral"), "min-h-8")}><RefreshCw size={13} className={cn(helping && "animate-spin")} />{helping ? "重写中…" : "换一版"}</button>
                        <button type="button" onClick={adoptDraft} className={cn(topbarBtn("active"), "min-h-8")}><Check size={13} />采用</button>
                      </div>
                    </div>
                  )}
                  <div className="flex w-full min-w-0 items-center gap-2">
                    {/* 输入面板（造物 bento workspace-glass-composer） */}
                    <div data-chat-dropzone className="relative isolate min-w-0 flex-1 overflow-hidden rounded-shell border border-foreground/[0.08] bg-card/90 shadow-[0_8px_32px_-16px_color-mix(in_srgb,var(--foreground)_16%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--foreground)_6%,transparent)] backdrop-blur-xl">
                      <div className="relative z-[2]">
                        {/* 模式 tab / 模型名 / 预估价 / 智能压缩 */}
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-2 [@media(max-height:860px)]:py-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {modes.length > 0 && (
                              <div role="tablist" aria-label="生成模式" className="inline-flex max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full border border-foreground/10 bg-foreground/[0.03] p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {modes.map((m) => { const on = mode === m.key; return <button key={m.key} type="button" role="tab" aria-selected={on} title={m.desc ?? m.label} onClick={() => setMode(m.key)}
                                  className={cn("inline-flex shrink-0 items-center whitespace-nowrap gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96]",
                                    on ? "border-foreground/10 bg-muted text-foreground shadow-[0_1px_3px_color-mix(in_srgb,var(--foreground)_8%,transparent)]" : "border-transparent text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")}>
                                  <m.icon size={13} className="h-3.5 w-3.5" />{m.label}</button>; })}
                              </div>
                            )}
                            {model && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{model.name}</span>}
                            {est && (
                              <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
                                <span className="inline-block max-w-full truncate rounded-2xl border border-transparent bg-foreground/[0.04] px-2 py-[3px] text-[11px] font-medium text-foreground">预计 <span className="text-[12px] font-semibold leading-none tracking-[0.02em] text-foreground/90">{est.total}</span>{est.max && est.max !== est.total && <span> · 最高 {est.max}</span>}</span>
                                {est.rows.length > 0 && <RichTip content={<span className="flex flex-col gap-1"><span className="font-semibold text-foreground">预估价</span><span className="text-foreground/80">按当前参数估算；实际以生成完成后的结算为准。点开看明细。</span></span>}><button type="button" onClick={() => setDlg("estimate")} className={cn(benchChip(), "h-7 cursor-help px-2.5 sm:h-[30px]")} aria-label="预估价明细"><Info size={12} className="h-3 w-3" /></button></RichTip>}
                              </div>
                            )}
                            {model && p.chipsExtra && p.chipsExtra(model)}
                            {p.modality !== "audio" && (
                              <button type="button" role="switch" aria-checked={compress} aria-label="智能压缩" onClick={() => setCompress(!compress)} title="提示词超出渠道上限时自动压缩（保留全部镜头），关闭则每次询问"
                                className={cn(benchChip(compress), "group h-7 whitespace-nowrap px-2.5 sm:h-[30px]")}>
                                <FoldVertical size={14} className="h-3.5 w-3.5 shrink-0 transition-opacity" style={{ opacity: compress ? 1 : 0.6 }} />智能压缩
                                <span aria-hidden className={cn("relative ml-0.5 inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors", compress ? "bg-foreground" : "bg-muted-foreground/30")}><span className={cn("absolute h-2.5 w-2.5 rounded-full bg-background shadow-sm transition-transform", compress ? "translate-x-3" : "translate-x-0.5")} /></span>
                              </button>
                            )}
                          </div>
                        </div>
                        {/* 输入行：参考素材上传格 ｜ 编辑器 ｜ 提示词工具竖栏 */}
                        <div className="flex items-stretch gap-3 px-4 py-2.5 sm:px-5 sm:py-2.5 [@media(max-height:860px)]:py-1.5 min-h-[64px] sm:min-h-[84px] [@media(max-height:860px)]:min-h-[48px]">
                          {refSlot}
                          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                            <textarea ref={textRef} defaultValue="" onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { const sendNow = enterNewline ? (e.metaKey || e.ctrlKey) : !e.shiftKey; if (sendNow) { e.preventDefault(); void send(); } } }}
                              onPaste={(e) => { const add = e.clipboardData.getData("text"); if (!add) return; const curText = textOf(); if (curText.length + add.length <= 10000) return; e.preventDefault(); const { text: keep, dropped } = trimByLine(curText, add, 10000); setText(keep); if (dropped) toast.message(`提示词过长，粘贴内容按整行保留，未放下的 ${dropped} 字已略过`); }}
                              placeholder={p.placeholder} rows={1} data-chat-input data-tour="composer"
                              className="block min-h-[48px] max-h-[200px] w-full resize-none overflow-y-auto bg-transparent p-0 text-[14px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/50 [@media(max-height:860px)]:max-h-[104px]"
                              onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`; }} />
                          </div>
                          {promptRail}
                        </div>
                        {/* 底部工具栏 */}
                        <div className="px-2 pb-1.5 pt-1.5 max-[639px]:pb-1 max-[639px]:pt-1 sm:px-3 sm:pb-2 sm:pt-1.5">
                          <div className="flex flex-col items-stretch justify-between gap-2 overflow-visible rounded-[var(--radius-tile)] px-2 py-1.5 max-[639px]:gap-1.5 max-[639px]:py-1 sm:flex-row sm:items-end sm:gap-3 sm:rounded-[var(--radius-pane)] sm:px-3">
                            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden pr-1 [scrollbar-width:none] sm:flex-wrap sm:gap-y-1.5 sm:gap-1.5 sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden">
                              {model ? p.renderParams(model, values, set, mode) : null}
                            </div>
                            <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
                              {p.modality === "video" && tiles.some((t) => t.kind === "audio") && (
                                <button type="button" aria-label="用文案配音" title={`选音色、写文案，生成的配音直接填进${tiles.find((t) => t.kind === "audio")?.label ?? "参考音频"}`} onClick={() => setVoOpen(true)} className={cn(benchChip(), "group justify-center active:scale-[0.97]")}>
                                  <Mic size={15} className="h-4 w-4 shrink-0 text-primary" /><span>用文案配音</span>
                                </button>
                              )}
                              <button type="button" aria-label="提示词大师" title="浏览官方创意编导，选用角色优化当前描述" onClick={() => setMasterOpen(true)} className={cn(benchChip(), "group justify-center active:scale-[0.97]")}>
                                <BookOpen size={15} className="h-4 w-4 shrink-0 text-primary" />
                                <span>提示词大师</span>
                              </button>
                              <RichTip content={<div className="flex items-start gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><WandSparkles size={14} /></span><span className="min-w-0"><span className="block text-xs font-semibold leading-4 text-foreground">智能帮写</span><span className="mt-0.5 block text-[11px] font-normal leading-[1.45] tracking-normal text-muted-foreground">让 AI 根据你的想法和素材，生成专业、可直接使用的提示词</span></span></div>}>
                                <button type="button" aria-label="智能帮写" onClick={() => void helpWrite()} disabled={helping} className={cn(benchChip(), "group justify-center active:scale-[0.97]")}><WandSparkles size={16} className="h-4 w-4 shrink-0" /><span>{helping ? "帮写中…" : "智能帮写"}</span></button>
                              </RichTip>
                              {busy ? (
                                <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground transition-all sm:h-10 sm:w-10" aria-label="提交中"><Loader2 size={16} className="animate-spin" /></button>
                              ) : (
                                <button type="button" onClick={() => void send()} aria-label={`生成${p.label}`} className="primary-gradient inline-flex h-9 w-9 items-center justify-center rounded-full text-white shadow-pop transition-all duration-200 hover:scale-105 hover:brightness-110 active:scale-95 sm:h-10 sm:w-10"><Send size={18} className="h-[1.125rem] w-[1.125rem]" /></button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>

      {/* 扫码用手机上传 */}
      <QrUploadDialog open={dlg === "qr"} onOpenChange={(v) => setDlg(v ? "qr" : null)} onPickup={applyPickup} />
      {/* 标注编辑 / 局部重绘（key 让每次打开重置画笔状态，造物同款） */}
      <AnnotateDialog key={ann ? `${ann.tool}:${ann.src}` : "closed"} open={!!ann} onOpenChange={(v) => !v && setAnn(null)} src={ann?.src ?? null} initialTool={ann?.tool} onDone={applyAnnotate} />

      {/* 从作品库选参考素材 */}
      {pickKind && (
        <WorksPickerDialog open onOpenChange={(v) => !v && setPickKind(null)} kind={pickKind} cap={Math.max(0, capOf(pickKind) - countOf(pickKind))} existing={attachments.filter((a) => a.kind === pickKind).map((a) => a.url)}
          onPick={(urls) => {
            const t = tiles.find((x) => x.kind === pickKind);
            if (!t) return;
            setAttachments((c) => [...c, ...urls.map((url) => ({ url, name: "作品", kind: pickKind as RefKind }))].slice(0, capOf(pickKind) + attachments.filter((a) => a.kind !== pickKind).length));
          }} />
      )}
      {/* 用文案配音（视频页） */}
      {p.modality === "video" && (
        <VoiceoverDialog open={voOpen} onOpenChange={setVoOpen} model={model} slotLabel={tiles.find((t) => t.kind === "audio")?.label ?? "参考音频"}
          minSec={tiles.find((t) => t.kind === "audio")?.max ? undefined : undefined}
          onDone={(url) => {
            const t = tiles.find((x) => x.kind === "audio");
            if (!t) { toast.error("当前模式没有参考音频上传格"); return; }
            setAttachments((c) => { const audios = c.filter((a) => a.kind === "audio"); const keep = audios.length >= t.max ? c.filter((a) => a !== audios[audios.length - 1]) : c; return [...keep, { url, name: "配音.mp3", kind: "audio" as const }]; });
          }} />
      )}

      {/* 提示词大师（官方创意编导 + 我的角色） */}
      <PromptMasterDialog open={masterOpen} onOpenChange={setMasterOpen} modality={p.modality} onPick={(pp) => void applyPersona(pp)} />

      {/* 玩法说明 */}
      <SideDrawer open={dlg === "playbook"} onOpenChange={(v) => setDlg(v ? "playbook" : null)} title="玩法说明" icon={<BookOpen size={18} className="text-primary" />}>{p.playbook}</SideDrawer>

      {/* 任务记录（本机作品 = 任务记录，造物 TaskDrawer 同款） */}
      <TaskDrawer open={dlg === "tasks"} onOpenChange={(v) => setDlg(v ? "tasks" : null)} works={myWorks} nameOf={nameOf} onRemove={removeWork} onReuse={(w) => { reuseWork(w); setDlg(null); }} />

      {/* 全屏编辑 */}
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent title="全屏编辑提示词" description="适合编写和修改较长提示词，内容实时同步" className="w-[min(94vw,900px)]">
          <textarea defaultValue={textOf()} onChange={(e) => setText(e.target.value)} rows={18} className="w-full rounded-2xl border bg-muted/30 px-4 py-3 text-[15px] leading-7 outline-none" placeholder={p.placeholder} autoFocus />
          <div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">{textOf().length} 字</span><div className="flex gap-2"><button className="chip h-9" onClick={() => { setText(""); setFull(false); }}>一键清空</button><button className="chip chip-active h-9" onClick={() => setFull(false)}>关闭</button></div></div>
        </DialogContent>
      </Dialog>

      {/* 预估价明细 */}
      <OmniDialog open={dlg === "estimate"} onOpenChange={(v) => setDlg(v ? "estimate" : null)} title="预估价" description="按当前参数估算；实际以生成完成后的结算为准" className="w-[min(92vw,420px)]">
        <div className="px-4 py-4 sm:px-6">{est && <div className="divide-y rounded-2xl border text-sm">{est.rows.map(([k, v]) => <div key={k} className="flex justify-between px-4 py-2.5"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>)}<div className="flex justify-between px-4 py-3 text-base"><span>合计</span><span className="font-semibold text-primary">{est.total}</span></div></div>}</div>
      </OmniDialog>
    </TipProvider>
  );
}

/** 模型线路下拉（造物 ModelSeriesPicker 简化：按系列分组、每行名称 + 价格 + 选中勾） */
export function SeriesPicker({ models, current, onPick, className }: { models: CatalogModel[]; current: CatalogModel | null; onPick: (m: CatalogModel) => void; className?: string }) {
  const sections = useMemo(() => {
    const map = new Map<string, CatalogModel[]>();
    for (const m of models) { const k = m.series || "其他线路"; if (!map.has(k)) map.set(k, []); map.get(k)!.push(m); }
    return [...map.entries()];
  }, [models]);
  if (!current) return null;
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button type="button" aria-label={`切换模型线路，当前 ${current.name}`} className={cn(className, "gap-1")}>
          <span className="min-w-0 truncate">{current.name}</span>
          <ChevronDown size={14} className="shrink-0 opacity-70" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content className="fixed right-4 top-[64px] z-50 max-h-[70vh] w-[min(94vw,360px)] overflow-y-auto rounded-[20px] border border-foreground/10 bg-card p-1.5 text-foreground shadow-[0_16px_48px_-18px_color-mix(in_srgb,var(--foreground)_20%,transparent)] outline-none animate-in fade-in-0 zoom-in-95">
          <DialogPrimitive.Title className="sr-only">切换模型线路</DialogPrimitive.Title>
          {sections.map(([g, list], gi) => (
            <div key={g}>
              <div className={cn("px-2 pb-1 pt-1.5", gi > 0 && "mt-1 border-t border-border/60 pt-2")}>
                <div className="text-[11px] font-semibold text-muted-foreground">{g}</div>
              </div>
              {list.map((m) => {
                const on = m.id === current.id;
                return (
                  <DialogPrimitive.Close asChild key={m.id}>
                    <button type="button" onClick={() => onPick(m)} aria-label={`${g} ${m.name}，${m.price ?? ""}`}
                      className={cn("flex w-full flex-col items-stretch gap-1 rounded-2xl border border-transparent px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/70", on && "bg-muted text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_15%,transparent)]")}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate text-[12px]">{m.name}</span>
                          {m.featured && <span className="shrink-0 rounded-sm border border-primary/50 bg-primary/10 px-1 py-px text-[9px] font-semibold leading-none text-primary-strong">重点推荐</span>}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{m.price || "按用量"}</span>
                        <Check className={cn("ml-1 h-3.5 w-3.5 shrink-0", !on && "invisible")} />
                      </span>
                      {m.description && <span className="line-clamp-2 pr-6 text-left text-[11px] leading-[15px] text-muted-foreground">{m.description}</span>}
                    </button>
                  </DialogPrimitive.Close>
                );
              })}
            </div>
          ))}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** 作品卡（造物 WorkCard 简化：提示词 + 媒体 + 操作行） */
function waitedLabel(createdAt: number) {
  const min = Math.floor((Date.now() - createdAt) / 60000);
  return min >= 1 ? ` · 已等 ${min} 分钟` : "";
}
const ACT = "inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-card px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground active:scale-[0.96]";
/** 媒体成品上的悬停小圆钮（造物 WorkCard.Tool 同款） */
const Tool = ({ label, icon: I, onClick }: { label: string; icon: typeof Film; onClick: () => void }) => <button title={label} aria-label={label} onClick={onClick} className="inline-flex items-center justify-center rounded-full bg-background/70 p-1.5 text-muted-foreground backdrop-blur-sm transition-colors hover:text-primary"><I size={16} /></button>;

export function WorkCard({ w, nameOf, onReuse, onRedo, onRemove, onFavorite, onToVideo }: { w: Work; nameOf: (id: string) => string; onReuse: () => void; onRedo: () => void; onRemove: () => void; onFavorite: () => void; onToVideo?: (url: string) => void }) {
  const [detail, setDetail] = useState(false);
  const [now] = useState(() => Date.now());
  const url = w.url;
  /** 末帧图：作品 meta 里存过就直接用；没有则首次点开时现场抽帧并存回作品 */
  const [lf, setLf] = useState<string | null>(typeof w.meta?.lastFrame === "string" ? (w.meta.lastFrame as string) : null);
  const [lfBusy, setLfBusy] = useState(false);
  const ensureLastFrame = async (): Promise<string | null> => {
    if (lf) return lf;
    if (!url || w.kind !== "video") return null;
    setLfBusy(true);
    try { const f = await lastFrame(url); setLf(f); useStudio.getState().updateWork(w.id, { meta: { ...(w.meta ?? {}), lastFrame: f } }); return f; }
    catch { toast.error("无法读取视频末帧"); return null; }
    finally { setLfBusy(false); }
  };
  /** 末帧用作首帧：切到首帧模式并挂图（mc:mode / mc:attach 由媒体页接） */
  const useAsFirstFrame = async () => {
    const f = await ensureLastFrame();
    if (!f) return;
    document.dispatchEvent(new CustomEvent("mc:mode", { detail: "first-frame" }));
    document.dispatchEvent(new CustomEvent("mc:attach", { detail: { url: f, name: "末帧", type: "image" } }));
    toast.success("已把末帧作为首帧参考，切换到「首帧」模式继续拍");
  };
  const copyPrompt = () => { navigator.clipboard.writeText(w.prompt).then(() => toast.success("已复制提示词"), () => toast.error("复制失败，请手动选中复制")); };
  const kindGlyph = w.kind === "video" ? "▶" : w.kind === "audio" ? "♪" : "▣";
  return (
    <div className="pop-in border-b border-foreground/[0.06] pb-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted/60 text-xs font-semibold text-muted-foreground shadow-[0_0_0_1px_var(--border)]">{kindGlyph}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <button type="button" onClick={() => setDetail(true)} title="查看完整提示词" className="min-w-0 truncate text-left text-sm font-medium leading-7 text-foreground hover:text-primary">{w.prompt}</button>
            {w.prompt && <button type="button" onClick={copyPrompt} title="复制提示词" aria-label="复制提示词" className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><Copy size={13} /></button>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{nameOf(w.model)} · {timeHM(w.createdAt)}{w.meta?.size ? ` · ${String(w.meta.size)}` : ""}{w.meta?.resolution ? ` · ${String(w.meta.resolution)}` : ""}{w.meta?.seconds ? ` · ${String(w.meta.seconds)}s` : ""}{w.meta?.mode ? ` · ${String(w.meta.mode)}` : ""}{w.meta?.ratio ? ` · ${String(w.meta.ratio)}` : ""}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 pl-11">
        {w.status !== "done" && (
          <div className={cn("grid h-44 w-44 place-items-center rounded-2xl border", w.status === "failed" ? "border-danger/40 bg-danger/5 text-danger" : "shimmer")}>
            {w.status === "failed" ? <div className="flex flex-col items-center gap-2 px-4 text-center text-xs"><span>{w.error === "Failed to fetch" ? "网络中断，请重试" : (w.error || "生成失败")}</span>{w.error !== "Failed to fetch" && !/扣费|退回|退款|网络|余额|充值/.test(w.error ?? "") && <span className="text-[11px] text-muted-foreground">失败的任务不收费，已扣的会自动退回</span>}<div className="flex flex-wrap justify-center gap-1.5">
              <button className={cn(ACT, "h-8 text-foreground")} onClick={onRedo}><RefreshCw size={13} />重试</button>
            </div></div> : <div className="flex flex-col items-center gap-2 px-4 text-center text-xs text-muted-foreground"><Loader2 className="animate-spin" size={20} /><span>{w.status === "pending" ? "排队中" : `生成中${waitedLabel(w.createdAt)}`}</span>{w.status === "running" && now - w.createdAt > 15 * 60000 && <span className="text-[11px] leading-snug opacity-75">这条线路出片较慢，可以离开页面，稍后回来查看</span>}</div>}
          </div>
        )}
        {w.status === "done" && url && (w.kind === "video"
          ? <div className="group relative">
              <video src={url} controls preload="metadata" className="h-64 rounded-2xl bg-black" />
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                <Tool label="用作首帧（接镜）" icon={ImageIcon} onClick={() => void useAsFirstFrame()} />
                <Tool label="用作参考视频" icon={Film} onClick={() => { document.dispatchEvent(new CustomEvent("mc:attach", { detail: { url, name: "参考视频", type: "video" } })); toast.success("已作为参考视频挂进上传格"); }} />
              </div>
            </div>
          : w.kind === "audio"
            ? <span className="flex w-96 max-w-full flex-col gap-1 rounded-2xl border border-border/60 bg-card px-4 py-3"><span className="flex items-center gap-2 text-sm font-medium text-foreground"><Music4 size={16} className="text-primary" />音频已生成</span><audio src={url} controls className="w-full" /></span>
            : <div className="group relative">
                <img src={url} alt={w.prompt} className="h-44 cursor-zoom-in rounded-2xl bg-card object-cover" onClick={() => window.open(url, "_blank", "noopener")} />
                <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                  <Tool label="引用到输入框" icon={Quote} onClick={() => { document.dispatchEvent(new CustomEvent("mc:attach", { detail: { url, name: w.prompt.slice(0, 20), type: "image" } })); toast.success("已引用为参考图"); }} />
                  <Tool label="标注编辑" icon={Highlighter} onClick={() => document.dispatchEvent(new CustomEvent("mc:annotate", { detail: { url, tool: "annotate" } }))} />
                  <Tool label="局部重绘" icon={Wand2} onClick={() => document.dispatchEvent(new CustomEvent("mc:annotate", { detail: { url, tool: "inpaint" } }))} />
                  {onToVideo && <Tool label="转视频（首帧接镜）" icon={Film} onClick={() => onToVideo(url)} />}
                </div>
              </div>)}
        {w.status === "done" && w.kind === "video" && lf && (
          <div className="flex w-40 flex-col gap-2">
            <div className="text-xs text-muted-foreground">末帧图 <span className="text-muted-foreground/70">· 可作下一段的首帧</span></div>
            <img src={lf} alt="末帧图" className="aspect-video w-full cursor-zoom-in rounded-xl border object-cover" onClick={() => window.open(lf, "_blank", "noopener")} />
            <button className={cn(ACT, "justify-center")} onClick={() => void useAsFirstFrame()}><ImageIcon size={14} className="h-3.5 w-3.5" />用作首帧</button>
          </div>
        )}
      </div>
      {w.status === "done" && (
        <div className="mt-4 flex flex-wrap gap-2 pl-11">
          <button className={ACT} title="把这条的提示词、参数和输入模式原样填回输入区" onClick={onReuse}><PencilLine size={14} className="h-3.5 w-3.5" />重新编辑</button>
          {w.kind === "video" && <button className={ACT} disabled={lfBusy} title={lf ? "查看末帧图（可作下一段首帧）" : "抽取这条视频的末帧图"} onClick={() => void ensureLastFrame()}>{lfBusy ? <Loader2 size={14} className="h-3.5 w-3.5 animate-spin" /> : <Film size={14} className="h-3.5 w-3.5" />}{lf ? "查看末帧" : "抽末帧"}</button>}
          <button className={ACT} onClick={onRedo}><RefreshCw size={14} className="h-3.5 w-3.5" />再次生成</button>
          {url && <a className={ACT} href={url} target="_blank" rel="noreferrer" download><Download size={14} className="h-3.5 w-3.5" />下载</a>}
          {url && <button className={ACT} onClick={() => { navigator.clipboard.writeText(location.origin + url).then(() => toast.success("链接已复制"), () => toast.error("复制失败")); }}><Share2 size={14} className="h-3.5 w-3.5" />分享</button>}
          <button className={cn(ACT, w.favorite && "border-foreground/20 bg-muted text-foreground")} aria-pressed={!!w.favorite} onClick={onFavorite}><Heart size={14} className={cn("h-3.5 w-3.5", w.favorite && "fill-current text-danger")} />收藏</button>
          <button className={ACT} onClick={onRemove}><Trash2 size={14} className="h-3.5 w-3.5" />删除</button>
        </div>
      )}
      <Dialog open={detail} onOpenChange={setDetail}>
        <DialogContent title="提示词详情" description={`${nameOf(w.model)} · ${timeHM(w.createdAt)}`} className="w-[min(92vw,560px)]">
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border bg-muted/30 p-3 text-sm leading-6">{w.prompt || "（没有提示词）"}</div>
          <div className="mt-3 flex justify-end"><button type="button" className={ACT} onClick={copyPrompt}><Copy size={14} className="h-3.5 w-3.5" />复制</button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 任务记录抽屉（造物 TaskDrawer：状态 / 缩略图 / 沿用 / 删除） */
export function TaskDrawer({ open, onOpenChange, works, nameOf, onRemove, onReuse }: { open: boolean; onOpenChange: (v: boolean) => void; works: Work[]; nameOf: (id: string) => string; onRemove: (id: string) => void; onReuse: (w: Work) => void }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const list = works;
  const groups = useMemo(() => { const m = new Map<string, Work[]>(); for (const w of list) m.set(dateLabel(w.createdAt), [...(m.get(dateLabel(w.createdAt)) ?? []), w]); return [...m.entries()]; }, [list]);
  const close = (v: boolean) => { onOpenChange(v); if (!v) setPicked(new Set()); };
  const del = (id: string) => { onRemove(id); setPicked((c) => { const n = new Set(c); n.delete(id); return n; }); };
  const ST: Record<Work["status"], [string, string]> = { pending: ["排队中", "text-warning"], running: ["生成中", "text-primary"], done: ["已完成", "text-success"], failed: ["失败", "text-danger"] };
  return (
    <SideDrawer open={open} onOpenChange={close} title="任务记录" description={`共 ${list.length} 条任务 · 本机记录`} icon={<ListChecks size={18} className="text-primary" />}>
      {groups.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">暂无任务记录</div>}
      {groups.map(([d, ws]) => (
        <section key={d} className="mb-5"><div className="mb-2 text-xs tracking-[0.2em] text-muted-foreground">{d}</div>
          <div className="space-y-2">{ws.map((w) => (
            <div key={w.id} className="flex gap-3 rounded-[14px] border border-border/60 bg-card p-3 transition-colors">
              <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">{w.status === "done" && w.url ? (w.kind === "video" ? <video src={w.url} muted className="h-full w-full object-cover" /> : w.kind === "audio" ? <span className="grid h-full place-items-center">♪</span> : <img src={w.url} alt="" className="h-full w-full object-cover" />) : <span className="grid h-full place-items-center text-muted-foreground">{w.status === "running" ? <Loader2 size={16} className="animate-spin" /> : "—"}</span>}</span>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{w.prompt}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{nameOf(w.model)} · {timeHM(w.createdAt)}</div><div className={cn("mt-1 text-xs font-medium", ST[w.status][1])}>{ST[w.status][0]}{w.error ? `：${w.error}` : ""}</div></div>
              <div className="flex flex-col gap-1"><button className="text-xs text-primary" title="把提示词、参数和输入模式原样填回输入区" onClick={() => onReuse(w)}>沿用</button><button className="text-xs text-muted-foreground" onClick={() => del(w.id)}>删除</button></div>
            </div>
          ))}</div>
        </section>
      ))}
      <div className="border-t border-border/60 px-1 py-3 text-xs text-muted-foreground">这里只列本机发起的任务；服务器端任务以后台记录为准。</div>
    </SideDrawer>
  );
}
