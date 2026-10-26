import { useEffect, useMemo, useRef, useState } from "react";
import { App, Badge, Button, Popover, Segmented, Tooltip } from "antd";
import { Check, CheckCircle2, Clock3, LoaderCircle, X, XCircle } from "lucide-react";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "../../../../stores/use-user-store";
import { getOwnerTag } from "@/xoi/owner";
import type { CanvasNodeData } from "../types";
import { newlyFinishedTasks, summarizeCanvasTasks, taskReceiptStorageKey, type CanvasTaskSummary } from "../utils/canvas-task-summary";

const labels = { image: "图片", video: "视频", audio: "音频", text: "文本" };

/** A read-only view of the current canvas's existing generation state. No new polling or model calls. */
export function CanvasTaskCenter({ canvasId, nodes, onFocusNode }: { canvasId: string; nodes: CanvasNodeData[]; onFocusNode: (id: string) => void }) {
    const theme = canvasThemes[useThemeStore(state => state.theme)];
    const { notification } = App.useApp();
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState("all");
    const tasks = useMemo(() => summarizeCanvasTasks(nodes), [nodes]);
    const storageKey = taskReceiptStorageKey(getOwnerTag(), canvasId);
    const [read, setRead] = useState<Set<string>>(() => {
        try {
            const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
            return new Set(Array.isArray(value) ? value.filter((key): key is string => typeof key === "string").slice(-800) : []);
        } catch { return new Set(); }
    });
    const previous = useRef(new Map<string, CanvasTaskSummary["status"]>());
    const announced = useRef(new Set<string>());
    const noticeKeys = useRef(new Set<string>());
    const focus = (task: CanvasTaskSummary) => {
        setRead(current => new Set([...current, task.key]));
        setOpen(false);
        onFocusNode(task.nodeId);
    };

    useEffect(() => {
        const live = new Set(tasks.map(task => task.key));
        announced.current = new Set([...announced.current].filter(key => live.has(key)));
        const completed = newlyFinishedTasks(previous.current, tasks).filter(task => !announced.current.has(task.key));
        previous.current = new Map(tasks.map(task => [task.key, task.status]));
        if (!completed.length) return;
        for (const task of completed) announced.current.add(task.key);
        const key = `canvas-task:${canvasId}`;
        noticeKeys.current.add(key);
        const task = completed[0];
        const failed = completed.filter(item => item.status === "error").length;
        notification.open({ key, title: completed.length > 1 ? `${completed.length} 个任务已更新${failed ? ` · ${failed} 个失败` : ""}` : `${labels[task.type]}生成${task.status === "success" ? "完成" : "失败"}`, description: completed.length > 1 ? "打开当前画布的任务列表查看结果。" : task.title, duration: 5, placement: "bottomRight", icon: failed ? <XCircle style={{ color: "#c45d47" }} /> : <CheckCircle2 style={{ color: "#39816b" }} />, actions: <Button size="small" onClick={() => { setOpen(true); notification.destroy(key); }}>查看任务</Button> });
        const user = useUserStore.getState();
        if (!user.isLoading) void user.hydrateUser();
    }, [tasks, notification, canvasId]);

    useEffect(() => () => {
        for (const key of noticeKeys.current) notification.destroy(key);
    }, [notification]);
    useEffect(() => {
        try { localStorage.setItem(storageKey, JSON.stringify([...read].slice(-800))); } catch { /* Read markers remain usable in memory when storage is unavailable. */ }
    }, [read, storageKey]);

    const unread = tasks.filter(task => task.status !== "loading" && !read.has(task.key)).length;
    const running = tasks.filter(task => task.status === "loading").length;
    const visible = tasks.filter(task => filter === "all" || task.type === filter);
    const panel = <section aria-label="当前画布任务列表" className="flex flex-col" style={{ width: "min(380px, calc(100vw - 52px))", color: theme.node.text }}>
        <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
            <div><div className="text-sm font-semibold">本画布任务{running ? <span className="ml-2 text-xs font-normal" style={{ color: theme.node.muted }}>{running} 个进行中</span> : null}</div><p className="mb-0 mt-1 text-xs" style={{ color: theme.node.muted }}>生成结果会保留在对应节点</p></div>
            <div className="flex gap-1"><Tooltip title="全部标为已读"><Button size="small" type="text" aria-label="全部标为已读" disabled={!unread} icon={<Check size={15} />} onClick={() => setRead(new Set(tasks.filter(task => task.status !== "loading").map(task => task.key)))} /></Tooltip><Button size="small" type="text" aria-label="关闭任务列表" icon={<X size={15} />} onClick={() => setOpen(false)} /></div>
        </header>
        <div className="px-4 pb-3"><Segmented block size="small" value={filter} onChange={setFilter} options={[{ label: "全部", value: "all" }, ...Object.entries(labels).map(([value, label]) => ({ label, value }))]} /></div>
        <div className="thin-scrollbar max-h-[min(440px,60vh)] overflow-y-auto border-t p-2" style={{ borderColor: theme.node.stroke }}>
            {!visible.length ? <div className="grid min-h-36 place-content-center gap-2 px-6 text-center text-xs" style={{ color: theme.node.muted }}><Clock3 className="mx-auto size-6 opacity-40" /><span>暂无{filter === "all" ? "" : labels[filter as keyof typeof labels]}生成任务</span><span className="text-[11px] opacity-70">在画布中生成后，可以在这里跟进进度</span></div> : visible.map(task => {
                const unreadTask = task.status !== "loading" && !read.has(task.key);
                const Icon = task.status === "loading" ? LoaderCircle : task.status === "success" ? CheckCircle2 : XCircle;
                const status = task.status === "loading" ? "生成中" : task.status === "success" ? "已完成" : "未完成";
                return <button key={task.key} type="button" aria-label={`${task.title} · ${status} · 定位节点`} className="mb-1 flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:brightness-95" style={{ background: unreadTask ? theme.toolbar.itemHover : theme.node.panel, borderColor: unreadTask ? theme.node.stroke : "transparent" }} onClick={() => focus(task)}>
                    <Icon className={`mt-0.5 size-4 shrink-0 ${task.status === "loading" ? "animate-spin" : ""}`} style={{ color: task.status === "error" ? "#bd614e" : task.status === "success" ? "#39816b" : theme.node.muted }} />
                    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium">{task.title}</span>{unreadTask ? <span aria-label="未读" className="size-1.5 shrink-0 rounded-full bg-orange-500" /> : null}</span><span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: theme.node.muted }}><span>{labels[task.type]} · {status}{task.status === "loading" && task.progress !== undefined ? ` ${Math.round(task.progress)}%` : ""}</span>{task.startedAt ? <time dateTime={new Date(task.startedAt).toISOString()}>{new Date(task.startedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time> : null}</span>{task.model ? <span className="mt-1 block truncate text-[11px]" style={{ color: theme.node.muted }}>{task.model}</span> : null}{task.detail ? <span className="mt-1 line-clamp-2 block text-[11px]" style={{ color: task.status === "error" ? "#bd614e" : theme.node.muted }}>{task.detail}</span> : null}</span>
                </button>;
            })}
        </div>
        <footer className="border-t px-4 py-2.5 text-[11px]" style={{ color: theme.node.muted, borderColor: theme.node.stroke }}>点击任务定位节点 · 查看不扣积分</footer>
    </section>;

    return <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" arrow={false} content={panel} styles={{ container: { padding: 0, borderRadius: 20, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, overflow: "hidden", boxShadow: "0 16px 60px #17212c16" } }}>
        <button type="button" aria-label="本画布任务" aria-expanded={open} title="本画布任务" className="inline-flex h-8 items-center gap-2 rounded-lg px-2 transition hover:bg-black/5 dark:hover:bg-white/5" style={{ color: theme.node.text }}><Badge count={unread} size="small" overflowCount={99} offset={[4, -2]}><Clock3 className={`size-4 ${running ? "text-orange-600" : ""}`} /></Badge>{running ? <span className="text-xs tabular-nums">{running}</span> : null}</button>
    </Popover>;
}
