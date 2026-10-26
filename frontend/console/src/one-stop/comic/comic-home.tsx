"use client";
// AI 漫剧首页：新建项目（输入区）+ 精品剧 / 批量剧 创作路径卡 + 项目列表
import { useMemo, useRef, useState } from "react";
import "./comic-home.css";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Film,
  FolderOpen,
  Gem,
  Layers,
  LayoutTemplate,
  Plus,
  Search,
  SendHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell/app-shell";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { PillSelect } from "@/components/ui/select";
import { ModelPicker } from "../adapters/model-picker";
import {useActionConfirmation} from '../adapters/action-confirmation';
import { HoverVideoCard } from "./hover-video-card";
import { useCollection } from "@/lib/store-local";
import { useCatalog } from "@/lib/queries";
import { defaultChatModel, defaultImageModel, defaultSpeechModel, defaultVideoModel } from "@/lib/llm";
import { cn, uid } from "@/lib/utils";
import { shrinkImage } from "./video-kit";
import {
  COMIC_REGIONS,
  STAGE_DEFS,
  episodeCountOf,
  parseDurationText,
  projectProgress,
  stagePath,
  type ComicKind,
  type ComicProject,
  type ComicRatio,
  type ComicStrategy,
} from "./types";
import { RatioPicker, RegionPicker, StylePicker, type SpecModels } from "./pickers";
import { COMIC_TEMPLATES, HELP_FEATURES, HELP_STAGES, type ComicTemplate } from "./templates";

const EXAMPLES = ["少年御剑入云，寻找失落的仙山", "末世里最后一间便利店", "校园里每个人都会读心"];
const KIND_CARDS: { kind: ComicKind; label: string; desc: string; icon: typeof Gem }[] = [
  { kind: "premium", label: "精品剧", desc: "完整 9 阶段流程，逐项打磨风格、分镜与视频", icon: Gem },
  { kind: "batch", label: "批量剧", desc: "统一系列设定，剧本直出，再制作角色与镜头", icon: Layers },
];

/** 模块级时间戳（事件处理中调用，避开 render 纯度检查） */
const now = () => Date.now();

type Filter = "全部" | "进行中" | "已完成" | "本周新增";
type Archive = "all" | ComicKind;
const ARCHIVES: { value: Archive; label: string }[] = [
  { value: "all", label: "全部项目" },
  { value: "premium", label: "精品剧" },
  { value: "batch", label: "批量剧" },
];
const FILTERS: [Filter, string][] = [
  ["全部", ""],
  ["进行中", "cs-ftab--run"],
  ["已完成", "cs-ftab--done"],
  ["本周新增", "cs-ftab--new"],
];

export function ComicHome() {
  const ask=useActionConfirmation();
  const router = useRouter();
  const col = useCollection<ComicProject>("comic");
  const { data } = useCatalog();
  const [kind, setKind] = useState<ComicKind>("premium");
  const [cover, setCover] = useState<string>();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [style, setStyle] = useState("精致国漫");
  const [ratio, setRatio] = useState<ComicRatio>("9:16");
  const [region, setRegion] = useState<string>(COMIC_REGIONS[0]);
  const [specModels, setSpecModels] = useState<SpecModels>({});
  const [advanced, setAdvanced] = useState(false);
  const [episodeSeconds, setEpisodeSeconds] = useState(60);
  const [episodeCount, setEpisodeCount] = useState(1);
  const chosenModels = {
    chat: specModels.chat || defaultChatModel(data?.models)?.id,
    image: specModels.image || defaultImageModel(data?.models)?.id,
    video: specModels.video || defaultVideoModel(data?.models)?.id,
  };
  const [archive, setArchive] = useState<Archive>("all");
  const [filter, setFilter] = useState<Filter>("全部");
  const [q, setQ] = useState("");
  const [help, setHelp] = useState(false);
  const [tpl, setTpl] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const creating = useRef(false);
  const [savingNew, setSavingNew] = useState(false);

  const list = useMemo(() => col.items.filter((p) => archive === "all" || (p.kind ?? "premium") === archive), [col.items, archive]);
  const [weekAgo] = useState(() => Date.now() - 7 * 86400_000);
  const counts: Record<Filter, number> = {
    全部: list.length,
    进行中: list.filter((p) => p.status === "进行中").length,
    已完成: list.filter((p) => p.status === "已完成").length,
    本周新增: list.filter((p) => p.createdAt > weekAgo).length,
  };
  const kw = q.trim();
  const matches = (p: ComicProject) =>
    !kw ||
    [
      p.name,
      p.description,
      p.idea,
      p.outline?.title,
      p.script?.title,
      ...(p.outline?.episodes.map((e) => e.title) ?? []),
      ...(p.script?.episodes.map((e) => e.title) ?? []),
      ...(p.direction?.keywords ?? []),
      p.intent?.genre,
    ].some((t) => t?.includes(kw));
  const shown = list.filter((p) => filter === "全部" || (filter === "本周新增" ? p.createdAt > weekAgo : p.status === filter)).filter(matches);
  const episodes = list.reduce((n, p) => n + episodeCountOf(p), 0);
  const countOf = (k: ComicKind) => col.items.filter((p) => (p.kind ?? "premium") === k).length;

  const build = (
    o: { name: string; idea: string; style: string; episodes?: number; duration?: string; tag?: string },
    createdAt: number,
  ): ComicProject => {
    const models = data?.models;
    return {
      id: uid(),
      kind,
      name: o.name,
      description: o.idea,
      cover,
      style: o.style || "精致国漫",
      ratio,
      region: region || COMIC_REGIONS[0],
      spec: "默认",
      schedule: "渐进式",
      status: "进行中",
      stage: stagePath(kind)[0],
      done: {},
      createdAt,
      idea: o.idea,
      episodeCount: o.episodes ?? episodeCount,
      sceneCount: kind === "batch" ? 6 : 4,
      assets: [],
      episodeDuration: o.duration,
      episodeSeconds: parseDurationText(o.duration) ?? episodeSeconds,
      genreTag: o.tag,
      models: {
        chat: specModels.chat || defaultChatModel(models)?.id,
        image: specModels.image || defaultImageModel(models)?.id,
        video: specModels.video || defaultVideoModel(models)?.id,
        audio: defaultSpeechModel(models)?.id,
      },
      voice: "alloy",
      log: [],
    };
  };
  /** 只有服务器确认保存后才能进入详情；结果未知时不重复创建。 */
  const persistNew = async (p: ComicProject) => {
    try {
      col.upsert(p);
      await col.flush(p.id);
      return true;
    } catch (e) {
      toast.error((e as Error).message + "；项目保存结果待核对，请勿重复创建。");
      return false;
    }
  };
  const create = async () => {
    if (creating.current) return;
    if (col.state.saveError) {
      toast.error("有保存结果待核对的项目，请先下载副本并重新打开项目列表。");
      return;
    }
    if (!desc.trim() && !name.trim()) {
      toast.error("先描述一下你的故事");
      return;
    }
    const idea = desc.trim() || name.trim();
    const p = build({ name: name.trim() || idea.slice(0, 20), idea, style }, now());
    creating.current = true;
    setSavingNew(true);
    try {
      if (await persistNew(p)) router.push(`/comic/${p.id}`);
    } finally {
      creating.current = false;
      setSavingNew(false);
    }
  };
  const applyTemplate = async (t: ComicTemplate) => {
    if (col.state.saveError) {
      toast.error("请先核对之前的保存结果");
      return;
    }
    if (creating.current) return;
    creating.current = true;
    setSavingNew(true);
    const p = build({ name: t.title, idea: t.idea, style: t.style, episodes: t.episodes, duration: t.duration, tag: t.tag }, now());
    try {
      if (!(await persistNew(p))) return;
      setTpl(false);
      toast.success(`已用模板「${t.title}」创建项目`);
      router.push(`/comic/${p.id}`);
    } finally {
      creating.current = false;
      setSavingNew(false);
    }
  };
  const onCover = async (f?: File) => {
    if (!f) return;
    try {
      setCover(await shrinkImage(f, 640));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell>
      <div data-comic-ui className="cs-page-frame">
      <div className="cs-page">
        <div className="cs-page-scroll">
          <div className="cs-page-inner">
            <div className="space-y-5">
              <section className="cs-hero">
                <div className="cs-hero-corner">
                  <button type="button" className="cs-btn cs-btn--ghost cs-btn--sm" onClick={() => setHelp(true)}>
                    <CircleHelp className="h-3.5 w-3.5" />
                    帮助
                  </button>
                  <button type="button" className="cs-btn cs-btn--sm" onClick={() => setTpl(true)}>
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    从模板开始
                  </button>
                </div>
                <div className="cs-heading">
                  <span className="cs-eyebrow">
                    <Film size={13} />
                    快速创作 · AI 一站式
                  </span>
                  <h1>
                    让想象，有<span>下一幕</span>
                  </h1>
                  <p>从一句故事开始，复杂的设置留给我们。</p>
                </div>
                <div className="cs-composer-slot">
                  <div className="cs-composer-row">
                    <div className="cs-flow cs-composer">
                      <div className="cs-flow-ring" aria-hidden="true">
                        <div className="cs-flow-beam" />
                      </div>
                      <div className="cs-inner">
                        <div className="cs-title">
                          <input
                            value={name}
                            maxLength={100}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="作品名称（可选）"
                            aria-label="项目名称"
                          />
                          <span className="cs-cnt">{name.length}/100</span>
                        </div>
                        <div className="cs-ta-wrap">
                          <textarea
                            ref={descRef}
                            value={desc}
                            maxLength={500}
                            onChange={(e) => setDesc(e.target.value)}
                            rows={3}
                            placeholder="故事发生在哪里？主角是谁？你想看到怎样的第一幕？"
                            aria-label="项目描述"
                          />
                          <span className="cs-story-count">{desc.length}/500</span>
                        </div>
                        <div className="cs-bar">
                          <div className="cs-bar-l">
                            <StylePicker pill value={style} onChange={setStyle} />
                            <RatioPicker pill value={ratio} onChange={setRatio} />
                            <PillSelect ariaLabel="每集时长" label="每集" value={String(episodeSeconds)} onChange={v=>setEpisodeSeconds(Number(v))} options={[30,60,120,180].map(sec=>({value:String(sec),label:sec<60?`${sec} 秒`:`${sec/60} 分钟`}))} className="cs-duration cs-duration-select"/>
                            <label
                              className="cs-cover-inline"
                              onDragOver={(e) => { e.preventDefault(); }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const img = Array.from(e.dataTransfer.files ?? []).find((f) => f.type.startsWith("image/"));
                                if (img) void onCover(img);
                                else toast.error("封面图只收 PNG / JPG / WebP 图片");
                              }}
                            >
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  void onCover(e.target.files?.[0]);
                                  e.target.value = "";
                                }}
                              />
                              {cover ? <img src={cover} alt="已选封面" /> : <Upload size={13} />}
                              <span>{cover ? "更换封面" : "添加封面"}</span>
                            </label>
                            {cover && (
                              <button type="button" aria-label="移除封面" className="cs-cover-remove" onClick={() => setCover(undefined)}>
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="cs-advanced-row">
                          <span>
                            {Object.values(specModels).some(Boolean) ? "已自选模型组合" : "默认推荐模型组合"}
                            <small>文案 / 图片 / 视频</small>
                          </span>
                          <button
                            type="button"
                            className="cs-advanced-toggle"
                            aria-expanded={advanced}
                            aria-controls="quick-advanced-settings"
                            onClick={() => setAdvanced((v) => !v)}>
                            高级设置
                            <ChevronDown size={13} className={advanced ? "is-open" : ""} />
                          </button>
                        </div>
                        {advanced && (
                          <section id="quick-advanced-settings" className="cs-model-section" aria-label="高级创作设置">
                            <div className="cs-model-heading">
                              <span>模型与规格</span>
                              <small>基础单价，不是整部作品总价 · 1 元 = 10 积分</small>
                            </div>
                            <div className="cs-model-strip">
                              {(
                                [
                                  ["chat", "文案 · 策划与剧本"],
                                  ["image", "图片 · 角色与画面"],
                                  ["video", "视频 · 动态镜头"],
                                ] as const
                              ).map(([category, label]) => (
                                <ModelPicker
                                  key={category}
                                  category={category}
                                  label={label}
                                  value={chosenModels[category]}
                                  showPrice
                                  onChange={(id) => setSpecModels((previous) => ({ ...previous, [category]: id }))}
                                />
                              ))}
                            </div>
                            <div className="cs-advanced-spec">
                              <RegionPicker pill value={region} onChange={setRegion} />
                              <PillSelect ariaLabel="计划集数" label="计划集数" value={String(episodeCount)} onChange={v=>setEpisodeCount(Number(v))} options={[1,3,6,12].map(n=>({value:String(n),label:`${n} 集`}))} className="cs-duration cs-duration-select"/>
                              <button type="button" className="cs-reset-models" onClick={() => setSpecModels({})}>
                                恢复推荐模型
                              </button>
                            </div>
                          </section>
                        )}
                        <div className="cs-create-footer">
                          <span>
                            先保存故事与设置，进入项目后继续创作
                            <br />
                            <small>仅创建草稿，不调用模型、不扣积分</small>
                          </span>
                          <button
                            type="button"
                            disabled={savingNew || (!name.trim() && !desc.trim())}
                            onClick={() => void create()}
                            className="cs-create-button"
                            aria-label="创建项目">
                            {savingNew ? "正在保存…" : "创建项目"}
                            <SendHorizontal size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="cs-suggest">
                    {EXAMPLES.map((e) => (
                      <button key={e} type="button" onClick={() => setDesc(e)}>
                        <Plus className="mr-1 inline h-3 w-3" />
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section role="tablist" aria-label="项目档位" className="cs-deck">
                {KIND_CARDS.map(({ kind: k, label, desc: d, icon: I }) => {
                  const on = kind === k;
                  const path = stagePath(k);
                  return (
                    <HoverVideoCard
                      key={k}
                      kind={k}
                      label={label}
                      selected={on}
                      onSelect={() => {
                        setKind(k);
                        if (k !== kind) setEpisodeCount(k === "batch" ? 3 : 1);
                      }}
                      className={cn("cs-mode", k === "premium" ? "cs-mode--a" : "cs-mode--b")}>
                      <div className="cs-mode-top">
                        <span className="cs-mode-ic">
                          <I className="h-4 w-4" />
                        </span>
                        <div className="cs-mode-tt">
                          <h3>
                            {label}
                            <span title={`${label}: ${countOf(k)}`} className="cs-mode-cnt">
                              {countOf(k)}
                            </span>
                          </h3>
                          <p>{d}</p>
                        </div>
                        {on && (
                          <span className="cs-mode-cur">
                            <Check className="h-2.5 w-2.5" />
                            当前
                          </span>
                        )}
                      </div>
                      <div className="cs-path">
                        <span className="cs-pk">{k === "batch" ? "创作路径 · 跳过策划中间步骤" : "创作路径"} · 移入预览</span>
                        <ol className="cs-steps">
                          {path.map((s) => {
                            const sd = STAGE_DEFS[s];
                            const key = ["script", "assets", "storyboard", "video"].includes(s);
                            return (
                              <li key={s} className={cn("cs-step", key && "cs-step--key")}>
                                <span className="cs-n">{sd.no}</span>
                                {sd.label}
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </HoverVideoCard>
                  );
                })}
              </section>

              <div className="cs-listing">
                <div className="cs-listing-head">
                  <h2>
                    快速创作项目
                    <span className="cs-sub">
                      已加载 {list.length} 个作品 · {episodes} 集
                    </span>
                    <Dropdown>
                      <DropdownTrigger asChild>
                        <button type="button" className="cs-arch-btn">
                          <FolderOpen className="h-3.5 w-3.5" />
                          <span className="cs-cur-name">{ARCHIVES.find((a) => a.value === archive)?.label}</span>
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownTrigger>
                      <DropdownContent align="start">
                        {ARCHIVES.map((a) => (
                          <DropdownItem key={a.value} onSelect={() => setArchive(a.value)}>
                            {a.label}
                            {archive === a.value && <Check size={14} className="ml-auto" />}
                          </DropdownItem>
                        ))}
                      </DropdownContent>
                    </Dropdown>
                  </h2>
                  <div className="flex items-center gap-2">
                    <label className="cs-search">
                      <Search className="h-3.5 w-3.5" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索已加载的项目、集和关键词..." />
                    </label>
                  </div>
                </div>
                <div className="cs-ftabs">
                  {FILTERS.map(([f, cls]) => (
                    <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("cs-ftab", cls)}>
                      {cls && <i />}
                      {f}
                      <b>{counts[f]}</b>
                    </button>
                  ))}
                </div>
                {shown.length === 0 ? (
                  <button type="button" onClick={() => descRef.current?.focus()} className="cs-empty-hint">
                    {list.length ? "没有匹配的项目" : "还没有项目 · 在上方输入区描述你的故事，即可创建第一部漫剧"}
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {shown.map((p) => {
                      const pr = projectProgress(p);
                      const sd = STAGE_DEFS[p.stage] ?? STAGE_DEFS.input;
                      const poster=p.cover || p.script?.episodes.flatMap(e=>e.scenes).find(s=>s.imageUrl)?.imageUrl;
                      return (
                        <div
                          key={p.id}
                          className="group overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop">
                          <button onClick={() => router.push(`/comic/${p.id}`)} className="block w-full text-left">
                            <div className="relative aspect-[16/10] bg-muted">
                              {poster ? (
                                <img src={poster} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                              ) : (
                                <div className="grid h-full place-items-center bg-gradient-to-br from-primary-tint to-accent text-4xl">🎬</div>
                              )}
                              <span
                                className={cn(
                                  "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  p.status === "已完成" ? "bg-success text-white" : "bg-white/90 text-accent-foreground",
                                )}>
                                {p.status}
                              </span>
                              <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white">
                                {p.kind === "batch" ? "批量剧" : "精品剧"} · {p.style} · {p.ratio}
                              </span>
                            </div>
                            <div className="p-3">
                              <div className="truncate text-sm font-semibold">{p.script?.title || p.outline?.title || p.name}</div>
                              <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.description || p.idea || "暂无描述"}</div>
                              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <span className="block h-full rounded-full bg-primary" style={{ width: `${pr}%` }} />
                                </span>
                                {pr}% · {sd.no} {sd.label}
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
                            <span>
                              {new Date(p.createdAt).toLocaleDateString("zh-CN")} · {episodeCountOf(p) || p.episodeCount || 1} 集
                              {p.strategy ? ` · ${p.strategy}` : ""}
                            </span>
                            <button
                              onClick={async () => {
                                if (await ask({title:'移入回收状态？',description:`「${p.name}」将从项目列表隐藏，服务器保留记录，不会自动退还已发生的模型费用。`,confirm:'移入回收状态',danger:true})) {
                                  try {
                                    await col.remove(p.id);
                                    toast.success("已移入回收状态");
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }
                              }}
                              className="flex items-center gap-1 text-danger hover:underline">
                              <Trash2 size={12} />
                              删除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(col.state.hasMore || col.state.error) && (
                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      disabled={col.state.loading}
                      className="cs-btn"
                      onClick={() => void col.load().catch((e) => toast.error(e.message))}>
                      {col.state.loading ? "正在读取…" : col.state.error ? "读取失败，重试" : "加载更多项目"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent
          title="快速创作 · 使用指南"
          description="可创建项目、编辑内容并保存到服务器。点击生成后在后台执行，按所选模型的实际用量结算；今日消费提醒不打断任务，已产生费用以积分明细为准，不会因刷新自动重发。"
          className="w-[min(94vw,760px)]">
          <div className="max-h-[64vh] space-y-5 overflow-y-auto pr-1">
            <section>
              <h3 className="text-sm font-semibold">创作流程 · 9 阶段</h3>
              <ol className="mt-2 grid gap-2 sm:grid-cols-2">
                {HELP_STAGES.map((h) => (
                  <li key={h.no} className="flex gap-3 rounded-xl border bg-muted/30 p-3">
                    <span className="grid h-7 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint font-mono text-xs text-accent-foreground">
                      {h.no}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{h.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{h.desc}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h3 className="text-sm font-semibold">核心功能点</h3>
              <ul className="mt-2 space-y-1.5 text-sm leading-6">
                {HELP_FEATURES.map((h) => (
                  <li key={h} className="flex gap-2">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={tpl} onOpenChange={setTpl}>
        <DialogContent title="从模板开始" description="选一个题材种子，一键创建项目并预填创意、风格与集数设定" className="w-[min(96vw,1040px)]">
          <div className="grid max-h-[66vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {COMIC_TEMPLATES.map((t) => (
              <div key={t.title} className="flex flex-col rounded-2xl border bg-card p-4">
                <span className="w-fit rounded-full bg-primary-tint px-2 py-0.5 text-[11px] font-medium text-accent-foreground">{t.tag}</span>
                <div className="mt-2 text-lg font-semibold">{t.title}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{t.tagline}</div>
                <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted-foreground">{t.idea}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-md bg-muted px-1.5 py-0.5">{t.style}</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                    <Film size={11} />
                    {t.episodes} 集
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                    <Clock3 size={11} />
                    {t.duration}
                  </span>
                  <Button size="sm" className="ml-auto" onClick={() => applyTemplate(t)}>
                    使用此模板
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-right">
            <Button variant="ghost" onClick={() => setTpl(false)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
