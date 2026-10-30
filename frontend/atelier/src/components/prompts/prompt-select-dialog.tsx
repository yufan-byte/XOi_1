"use client";

import { useMemo, useRef, useState } from "react";
import { App, AutoComplete, Button, Empty, Input, Modal, Popconfirm, Select, Switch, Tag, Tooltip } from "antd";
import copy from "copy-to-clipboard";
import { BookOpen, Check, ChevronRight, Copy, Download, Plus, RotateCcw, Save, Search, SlidersHorizontal, Sparkles, Trash2, Upload, UserRound } from "lucide-react";

import { brandPrompts, promptCategories } from "@/constant/prompt-library";
import { CHARACTER_DEFAULTS, CHARACTER_PRESETS, CHARACTER_SECTIONS, composeCharacterNegative, composeCharacterPrompt, createCharacterPreset, type PromptStudioField, type PromptStudioValues } from "@/constant/prompt-studio";
import { cn } from "@/lib/utils";
import { ownerKey } from "@/xoi/owner";

type StudioView = "quick" | "character" | "presets";
type ApplyMode = "replace" | "append";
type SavedPreset = { id: string; name: string; values: PromptStudioValues; updatedAt: string };

const PRESET_STORAGE_KEY = "xoi-prompt-studio-presets-v1";
const SYSTEM_PRESET_ID = "cool-lead";

function readPresets(): SavedPreset[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(ownerKey(PRESET_STORAGE_KEY)) || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && item.values && typeof item.values === "object").slice(0, 50);
    } catch {
        return [];
    }
}

function sanitizeValues(values: unknown): PromptStudioValues {
    if (!values || typeof values !== "object" || Array.isArray(values)) return {};
    return Object.fromEntries(
        Object.entries(values as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string")
            .map(([key, value]) => [key.slice(0, 80), (value as string).slice(0, 3000)]),
    );
}

export function PromptSelectDialog({ open, onOpenChange, onSelect, currentPrompt = "" }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void; currentPrompt?: string }) {
    const { message } = App.useApp();
    const [view, setView] = useState<StudioView>("quick");
    const [activeSection, setActiveSection] = useState(CHARACTER_SECTIONS[0].id);
    const [values, setValues] = useState<PromptStudioValues>(() => createCharacterPreset());
    const [systemPreset, setSystemPreset] = useState(SYSTEM_PRESET_ID);
    const [keyword, setKeyword] = useState("");
    const [category, setCategory] = useState("all");
    const [media, setMedia] = useState("all");
    const [presets, setPresets] = useState<SavedPreset[]>(readPresets);
    const [saveOpen, setSaveOpen] = useState(false);
    const [presetName, setPresetName] = useState("");
    const importRef = useRef<HTMLInputElement>(null);

    const characterPrompt = useMemo(() => composeCharacterPrompt(values), [values]);
    const negativePrompt = useMemo(() => composeCharacterNegative(values), [values]);
    const section = CHARACTER_SECTIONS.find((item) => item.id === activeSection) || CHARACTER_SECTIONS[0];
    const quickItems = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return brandPrompts.filter((item) => {
            const categoryMatch = category === "all" || item.category === category;
            const mediaMatch = media === "all" || (item.media || "image") === media;
            const text = `${item.title["zh-CN"]} ${item.summary["zh-CN"]} ${item.prompt["zh-CN"]} ${(item.tags || []).join(" ")}`.toLowerCase();
            return categoryMatch && mediaMatch && (!query || text.includes(query));
        });
    }, [category, keyword, media]);

    const updateValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
    const applyPrompt = (prompt: string, mode: ApplyMode = "replace") => {
        const next = mode === "append" && currentPrompt.trim() ? `${currentPrompt.trim()}\n\n${prompt.trim()}` : prompt.trim();
        onSelect(next);
        onOpenChange(false);
    };
    const persistPresets = (next: SavedPreset[]) => {
        setPresets(next);
        try {
            localStorage.setItem(ownerKey(PRESET_STORAGE_KEY), JSON.stringify(next));
            return true;
        } catch {
            message.error("预设保存失败，请检查浏览器存储空间");
            return false;
        }
    };
    const savePreset = () => {
        const name = presetName.trim();
        if (!name) return message.warning("先给这个预设起个名字");
        const now = new Date().toISOString();
        const existing = presets.find((item) => item.name === name);
        const next = existing
            ? presets.map((item) => (item.id === existing.id ? { ...item, values: { ...values }, updatedAt: now } : item))
            : [{ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name, values: { ...values }, updatedAt: now }, ...presets].slice(0, 50);
        if (!persistPresets(next)) return;
        setSaveOpen(false);
        setPresetName("");
        message.success(existing ? "已更新同名预设" : "人物预设已保存");
    };
    const exportPresets = () => {
        if (!presets.length) return message.info("还没有可导出的预设");
        const blob = new Blob([JSON.stringify({ version: 1, type: "xoi-character-presets", items: presets }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `xoi-character-presets-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };
    const importPresets = async (file: File) => {
        try {
            const parsed = JSON.parse(await file.text());
            const rows = Array.isArray(parsed) ? parsed : parsed?.items;
            if (!Array.isArray(rows)) throw new Error("invalid");
            const imported = rows
                .filter((item) => item && typeof item.name === "string")
                .slice(0, 50)
                .map((item, index) => ({
                    id: `${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    name: String(item.name).slice(0, 40),
                    values: sanitizeValues(item.values),
                    updatedAt: new Date().toISOString(),
                }))
                .filter((item) => Object.keys(item.values).length);
            if (!imported.length) throw new Error("invalid");
            const merged = [...imported, ...presets].slice(0, 50);
            if (!persistPresets(merged)) return;
            message.success(`已导入 ${imported.length} 个人物预设`);
        } catch {
            message.error("导入失败，请选择由画布导出的预设 JSON 文件");
        } finally {
            if (importRef.current) importRef.current.value = "";
        }
    };
    const loadSystemPreset = (id: string) => {
        const preset = CHARACTER_PRESETS.find((item) => item.id === id);
        if (preset) {
            setSystemPreset(id);
            setValues(createCharacterPreset(preset.values));
        }
    };

    return (
        <>
            <Modal title={null} open={open} onCancel={() => onOpenChange(false)} footer={null} width={1240} centered style={{ maxWidth: "calc(100vw - 28px)" }} styles={{ body: { padding: 0 } }} className="prompt-studio-modal">
                <div className="flex h-[min(76vh,780px)] min-h-[560px] overflow-hidden rounded-2xl bg-white text-stone-900 dark:bg-stone-950 dark:text-stone-100" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                    <aside className="flex w-[168px] shrink-0 flex-col border-r border-stone-200/80 bg-stone-50/75 p-3 dark:border-stone-800 dark:bg-stone-900/45">
                        <div className="px-2 pb-3 pt-1">
                            <div className="flex items-center gap-2 text-[15px] font-semibold">
                                <Sparkles className="size-4 text-[#f57400]" />
                                创作提示词
                            </div>
                            <p className="mt-1 text-[11px] leading-4 text-stone-500">少填一点，也能控制得很细</p>
                        </div>
                        <StudioNavButton active={view === "quick"} icon={<BookOpen className="size-4" />} label="快速模板" onClick={() => setView("quick")} />
                        <StudioNavButton active={view === "character"} icon={<UserRound className="size-4" />} label="人物捏脸" onClick={() => setView("character")} />
                        <StudioNavButton active={view === "presets"} icon={<Save className="size-4" />} label="我的预设" count={presets.length} onClick={() => setView("presets")} />
                        {view === "character" ? (
                            <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-stone-200/80 pt-3 dark:border-stone-800">
                                <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">精细控制</div>
                                {CHARACTER_SECTIONS.map((item, index) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setActiveSection(item.id)}
                                        className={cn(
                                            "mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition active:scale-[0.98]",
                                            activeSection === item.id ? "bg-[#fff0e3] font-semibold text-[#c95708] dark:bg-orange-950/35 dark:text-orange-300" : "text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800",
                                        )}
                                    >
                                        <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[10px]", activeSection === item.id ? "bg-[#f57400] text-white" : "bg-stone-200/70 dark:bg-stone-800")}>{index + 1}</span>
                                        <span className="flex-1">{item.shortTitle}</span>
                                        <ChevronRight className="size-3 opacity-40" />
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        <div className="mt-auto px-2 pt-3 text-[10px] leading-4 text-stone-400">所有选项均可输入自定义内容，修改会实时合成提示词。</div>
                    </aside>

                    {view === "quick" ? (
                        <main className="flex min-w-0 flex-1 flex-col">
                            <div className="border-b border-stone-200/80 px-6 py-5 dark:border-stone-800">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-semibold tracking-tight">从舒服的起点开始</h2>
                                        <p className="mt-1 text-xs text-stone-500">只保留创作类型与素材筛选，不再堆叠两层标签。</p>
                                    </div>
                                    <Button icon={<UserRound className="size-4" />} onClick={() => setView("character")}>
                                        精细捏脸
                                    </Button>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Input className="!min-w-52 !flex-1" allowClear prefix={<Search className="size-4 text-stone-400" />} placeholder="搜索场景、用途或提示词内容" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                                    <Select className="w-32" value={category} onChange={setCategory} options={promptCategories.map((item) => ({ value: item.id, label: item.label["zh-CN"] }))} />
                                    <Select
                                        className="w-28"
                                        value={media}
                                        onChange={setMedia}
                                        options={[
                                            { value: "all", label: "图片 + 视频" },
                                            { value: "image", label: "图片" },
                                            { value: "video", label: "视频" },
                                        ]}
                                    />
                                </div>
                            </div>
                            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
                                <button
                                    type="button"
                                    onClick={() => setView("character")}
                                    className="group mb-5 flex w-full items-center gap-4 rounded-2xl border border-[#f4d6bf] bg-[#fff8f2] p-4 text-left transition hover:border-[#eeb98f] active:scale-[0.995] dark:border-orange-900/40 dark:bg-orange-950/20"
                                >
                                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f57400] text-white">
                                        <SlidersHorizontal className="size-5" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <strong className="block text-sm">原创人物捏脸控制台</strong>
                                        <span className="mt-1 block text-xs leading-5 text-stone-500">气质、脸型比例、五官主次、妆造、光线、负面约束，逐项可调。</span>
                                    </span>
                                    <span className="flex items-center gap-1 text-xs font-semibold text-[#d86009]">
                                        开始设计
                                        <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
                                    </span>
                                </button>
                                {quickItems.length ? (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {quickItems.map((item) => (
                                            <article key={item.id} className="flex min-w-0 gap-3 rounded-2xl border border-stone-200/90 p-3 transition hover:border-stone-300 hover:shadow-sm dark:border-stone-800 dark:hover:border-stone-700">
                                                <img src={item.coverUrl} alt="" className="h-[92px] w-[104px] shrink-0 rounded-xl object-cover" />
                                                <div className="flex min-w-0 flex-1 flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="truncate text-sm font-semibold">{item.title["zh-CN"]}</h3>
                                                        <Tag className="!m-0 !text-[10px]">{item.media === "video" ? "视频" : "图片"}</Tag>
                                                    </div>
                                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{item.summary["zh-CN"]}</p>
                                                    <div className="mt-auto flex justify-end gap-1 pt-2">
                                                        {currentPrompt.trim() ? (
                                                            <Button type="text" size="small" onClick={() => applyPrompt(item.prompt["zh-CN"], "append")}>
                                                                追加
                                                            </Button>
                                                        ) : null}
                                                        <Button size="small" type="primary" icon={<Check className="size-3.5" />} onClick={() => applyPrompt(item.prompt["zh-CN"])}>
                                                            使用
                                                        </Button>
                                                    </div>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的模板，换个关键词试试" className="py-16" />
                                )}
                            </div>
                        </main>
                    ) : null}

                    {view === "character" ? (
                        <>
                            <main className="flex min-w-0 flex-1 flex-col">
                                <div className="flex flex-wrap items-center gap-2 border-b border-stone-200/80 px-6 py-4 dark:border-stone-800">
                                    <Select
                                        className="!min-w-48 !flex-1"
                                        value={systemPreset}
                                        onChange={loadSystemPreset}
                                        options={CHARACTER_PRESETS.map((item) => ({ value: item.id, label: item.name, description: item.description }))}
                                        optionRender={(option) => (
                                            <div className="py-1">
                                                <div>{option.data.label}</div>
                                                <div className="mt-0.5 text-xs font-normal text-stone-400">{option.data.description}</div>
                                            </div>
                                        )}
                                    />
                                    <Tooltip title="保存当前全部控制项">
                                        <Button
                                            icon={<Save className="size-4" />}
                                            onClick={() => {
                                                setPresetName("");
                                                setSaveOpen(true);
                                            }}
                                        >
                                            存为预设
                                        </Button>
                                    </Tooltip>
                                    <Popconfirm title="恢复为成熟清冷女主的默认设定？" okText="恢复" cancelText="取消" onConfirm={() => setValues(createCharacterPreset())}>
                                        <Tooltip title="恢复默认">
                                            <Button aria-label="恢复默认" icon={<RotateCcw className="size-4" />} />
                                        </Tooltip>
                                    </Popconfirm>
                                </div>
                                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
                                    <div className="mb-5">
                                        <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
                                        <p className="mt-1 text-xs leading-5 text-stone-500">{section.description}</p>
                                    </div>
                                    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                                        {section.fields.map((field) => (
                                            <StudioField key={field.key} field={field} value={values[field.key] || ""} onChange={(value) => updateValue(field.key, value)} />
                                        ))}
                                    </div>
                                    {section.id === "constraints" ? (
                                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                            {[
                                                ["original", "原创角色", "不参考真实人物、明星或网红脸"],
                                                ["stableIdentity", "角色一致性", "锁定脸型、比例、五官和妆造"],
                                                ["noSmile", "不微笑", "正负向提示词同时排除笑容"],
                                                ["brightStudio", "明亮影棚", "避免暗调、压黑与过重阴影"],
                                            ].map(([key, label, hint]) => (
                                                <div key={key} className="flex items-center gap-3 rounded-xl border border-stone-200/80 p-3 dark:border-stone-800">
                                                    <Switch size="small" checked={values[key] === "yes"} onChange={(checked) => updateValue(key, checked ? "yes" : "")} />
                                                    <div>
                                                        <div className="text-xs font-medium">{label}</div>
                                                        <div className="mt-0.5 text-[11px] text-stone-400">{hint}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                    <div className="mt-6 flex justify-between border-t border-stone-100 pt-4 dark:border-stone-800">
                                        <Button type="text" disabled={activeSection === CHARACTER_SECTIONS[0].id} onClick={() => setActiveSection(CHARACTER_SECTIONS[Math.max(0, CHARACTER_SECTIONS.findIndex((item) => item.id === activeSection) - 1)].id)}>
                                            上一项
                                        </Button>
                                        {activeSection !== CHARACTER_SECTIONS.at(-1)?.id ? (
                                            <Button onClick={() => setActiveSection(CHARACTER_SECTIONS[Math.min(CHARACTER_SECTIONS.length - 1, CHARACTER_SECTIONS.findIndex((item) => item.id === activeSection) + 1)].id)}>
                                                下一项
                                                <ChevronRight className="ml-1 size-3.5" />
                                            </Button>
                                        ) : (
                                            <Button type="primary" onClick={() => applyPrompt(characterPrompt)}>
                                                完成并使用
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 border-t border-stone-200/80 p-3 dark:border-stone-800 xl:hidden">
                                    <ApplyButtons currentPrompt={currentPrompt} onApply={(mode) => applyPrompt(characterPrompt, mode)} />
                                </div>
                            </main>
                            <aside className="hidden w-[360px] shrink-0 flex-col border-l border-stone-200/80 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/30 xl:flex">
                                <div className="flex items-center justify-between border-b border-stone-200/80 px-4 py-4 dark:border-stone-800">
                                    <div>
                                        <h3 className="text-sm font-semibold">实时提示词</h3>
                                        <p className="mt-0.5 text-[11px] text-stone-400">{characterPrompt.length} 字 · 自动整理为模型可读结构</p>
                                    </div>
                                    <Tooltip title="复制完整提示词">
                                        <Button
                                            type="text"
                                            aria-label="复制完整提示词"
                                            icon={<Copy className="size-4" />}
                                            onClick={() => {
                                                copy(characterPrompt);
                                                message.success("已复制完整提示词");
                                            }}
                                        />
                                    </Tooltip>
                                </div>
                                <pre className="thin-scrollbar min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-4 py-4 font-sans text-xs leading-6 text-stone-600 dark:text-stone-300">{characterPrompt}</pre>
                                <div className="border-t border-stone-200/80 p-4 dark:border-stone-800">
                                    <details className="mb-3 text-[11px] text-stone-400">
                                        <summary className="cursor-pointer">仅查看负面约束</summary>
                                        <p className="mt-2 max-h-24 overflow-y-auto leading-5">{negativePrompt}</p>
                                    </details>
                                    <ApplyButtons currentPrompt={currentPrompt} onApply={(mode) => applyPrompt(characterPrompt, mode)} />
                                </div>
                            </aside>
                        </>
                    ) : null}

                    {view === "presets" ? (
                        <main className="flex min-w-0 flex-1 flex-col">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 px-6 py-5 dark:border-stone-800">
                                <div>
                                    <h2 className="text-lg font-semibold tracking-tight">我的人物预设</h2>
                                    <p className="mt-1 text-xs text-stone-500">预设按当前账号保存在本机，可导出备份或交给其他创作者。</p>
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        ref={importRef}
                                        hidden
                                        type="file"
                                        accept=".json,application/json"
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            if (file) void importPresets(file);
                                        }}
                                    />
                                    <Button icon={<Upload className="size-4" />} onClick={() => importRef.current?.click()}>
                                        导入
                                    </Button>
                                    <Button icon={<Download className="size-4" />} onClick={exportPresets}>
                                        导出
                                    </Button>
                                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setView("character")}>
                                        新建预设
                                    </Button>
                                </div>
                            </div>
                            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
                                {presets.length ? (
                                    <div className="space-y-2">
                                        {presets.map((preset) => (
                                            <div key={preset.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200/90 p-4 dark:border-stone-800">
                                                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff0e3] text-[#d86009] dark:bg-orange-950/30">
                                                    <UserRound className="size-5" />
                                                </span>
                                                <div className="min-w-40 flex-1">
                                                    <h3 className="text-sm font-semibold">{preset.name}</h3>
                                                    <p className="mt-1 truncate text-xs text-stone-400">
                                                        {preset.values.identity || "原创角色"} · {preset.values.temperament || "自定义气质"}
                                                    </p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        size="small"
                                                        onClick={() => {
                                                            setValues(createCharacterPreset(preset.values));
                                                            setView("character");
                                                        }}
                                                    >
                                                        继续编辑
                                                    </Button>
                                                    <Button size="small" type="primary" onClick={() => applyPrompt(composeCharacterPrompt(createCharacterPreset(preset.values)))}>
                                                        直接使用
                                                    </Button>
                                                    <Popconfirm title={`删除预设“${preset.name}”？`} okText="删除" cancelText="取消" onConfirm={() => persistPresets(presets.filter((item) => item.id !== preset.id))}>
                                                        <Button size="small" type="text" danger aria-label={`删除 ${preset.name}`} icon={<Trash2 className="size-4" />} />
                                                    </Popconfirm>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid h-full place-items-center">
                                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有自定义预设">
                                            <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setView("character")}>
                                                从人物捏脸开始
                                            </Button>
                                        </Empty>
                                    </div>
                                )}
                            </div>
                        </main>
                    ) : null}
                </div>
            </Modal>
            <Modal title="保存人物预设" open={saveOpen} onCancel={() => setSaveOpen(false)} onOk={savePreset} okText="保存" cancelText="取消" width={420} destroyOnHidden>
                <p className="mb-3 text-xs leading-5 text-stone-500">会保存当前六大区域的全部控制项。以后可以继续编辑，也可以直接用于生成。</p>
                <Input autoFocus maxLength={40} showCount placeholder="如：清冷女主·明亮灰底" value={presetName} onChange={(event) => setPresetName(event.target.value)} onPressEnter={savePreset} />
            </Modal>
        </>
    );
}

function StudioNavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "mb-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs transition active:scale-[0.98]",
                active ? "bg-white font-semibold text-stone-950 shadow-sm dark:bg-stone-800 dark:text-white" : "text-stone-500 hover:bg-white/70 dark:text-stone-400 dark:hover:bg-stone-800/60",
            )}
        >
            <span className={active ? "text-[#f57400]" : "text-stone-400"}>{icon}</span>
            <span className="flex-1">{label}</span>
            {typeof count === "number" ? <span className="text-[10px] text-stone-400">{count}</span> : null}
        </button>
    );
}

function StudioField({ field, value, onChange }: { field: PromptStudioField; value: string; onChange: (value: string) => void }) {
    return (
        <label className={cn("block min-w-0", field.wide && "sm:col-span-2")}>
            <span className="mb-1.5 block text-xs font-medium text-stone-600 dark:text-stone-300">{field.label}</span>
            <AutoComplete
                className="w-full"
                value={value}
                onChange={onChange}
                options={(field.options || []).map((option) => ({ value: option, label: option }))}
                filterOption={(input, option) =>
                    String(option?.value || "")
                        .toLowerCase()
                        .includes(input.toLowerCase())
                }
                allowClear
            >
                <Input placeholder={field.placeholder} />
            </AutoComplete>
            <span className="mt-1 block text-[10px] text-stone-400">可选择，也可直接输入</span>
        </label>
    );
}

function ApplyButtons({ currentPrompt, onApply }: { currentPrompt: string; onApply: (mode: ApplyMode) => void }) {
    return (
        <div className="flex justify-end gap-2">
            {currentPrompt.trim() ? <Button onClick={() => onApply("append")}>追加到画布</Button> : null}
            <Button type="primary" icon={<Check className="size-4" />} onClick={() => onApply("replace")}>
                {currentPrompt.trim() ? "替换并使用" : "使用提示词"}
            </Button>
        </div>
    );
}
