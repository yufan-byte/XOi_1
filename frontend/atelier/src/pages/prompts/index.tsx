import { useMemo, useState } from "react";
import { App, Button, Card, Empty, Input, Tag, Typography } from "antd";
import { Copy, FolderPlus, Search, Sparkles } from "lucide-react";

import { brandPrompts, getPromptLocale, promptCategories, type PromptCategoryId } from "@/constant/prompt-library";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/use-asset-store";
import { useTranslation } from "react-i18next";

export default function PromptsPage() {
    const { i18n } = useTranslation();
    const { message } = App.useApp();
    const copyText = useCopyText();
    const addAsset = useAssetStore((state) => state.addAsset);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<PromptCategoryId>("all");
    const locale = getPromptLocale(i18n.resolvedLanguage);
    const filtered = useMemo(() => brandPrompts.filter((item) => {
        if (category !== "all" && item.category !== category) return false;
        const text = `${item.title[locale]} ${item.summary[locale]} ${item.prompt[locale]}`.toLowerCase();
        return !query.trim() || text.includes(query.trim().toLowerCase());
    }), [category, locale, query]);
    const savePrompt = (item: (typeof brandPrompts)[number]) => {
        addAsset({ kind: "text", title: item.title[locale], coverUrl: item.coverUrl || "", tags: [item.category], source: "prompt-library", data: { content: item.prompt[locale] }, metadata: { promptId: item.id } });
        message.success("已加入我的资产");
    };

    return <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100"><main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] p-6 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]"><div className="mx-auto max-w-7xl"><div className="mx-auto max-w-3xl text-center"><div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-400"><Sparkles className="size-3.5" /> PROMPT LIBRARY</div><h1 className="mt-2 text-4xl font-semibold tracking-tight">提示词库</h1><p className="mt-3 text-sm text-stone-500 dark:text-stone-400">按创作类型查找经过整理的提示词，复制后即可送入工作台或保存为资产。</p><Input size="large" className="mt-6 text-left" prefix={<Search className="size-4 text-stone-400" />} placeholder="搜索标题、分类或提示词内容" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="mx-auto mt-6 flex max-w-5xl flex-wrap justify-center gap-2">{promptCategories.map((item) => <Tag.CheckableTag key={item.id} checked={category === item.id} className={cn("prompt-filter-tag", category === item.id && "is-active")} onChange={() => setCategory(item.id)}>{item.label[locale]}</Tag.CheckableTag>)}</div>{filtered.length ? <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => <Card key={item.id} className="overflow-hidden rounded-2xl" cover={item.coverUrl ? <img src={item.coverUrl} alt="" className="h-44 object-cover" /> : undefined} styles={{ body: { padding: 18 } }}><div className="text-xs font-medium text-stone-400">{promptCategories.find((option) => option.id === item.category)?.label[locale]}</div><Typography.Title level={4} className="!mb-1 !mt-2">{item.title[locale]}</Typography.Title><p className="mb-4 text-sm text-stone-500 dark:text-stone-400">{item.summary[locale]}</p><p className="line-clamp-5 text-sm leading-6 text-stone-700 dark:text-stone-300">{item.prompt[locale]}</p><div className="mt-5 flex gap-2"><Button size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(item.prompt[locale], "提示词已复制")}>复制</Button><Button size="small" type="primary" icon={<FolderPlus className="size-3.5" />} onClick={() => savePrompt(item)}>存入资产</Button></div></Card>)}</div> : <div className="mt-16"><Empty description="没有匹配的提示词" /></div>}</div></main></div>;
}
