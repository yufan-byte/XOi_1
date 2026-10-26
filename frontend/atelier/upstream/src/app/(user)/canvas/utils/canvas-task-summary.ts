import { CanvasNodeType, type CanvasNodeData } from "../types";

export type CanvasTaskSummary = {
    key: string;
    nodeId: string;
    title: string;
    type: "image" | "video" | "audio" | "text";
    status: "loading" | "success" | "error";
    startedAt: number;
    progress?: number;
    detail: string;
    model?: string;
};

/** Only generation attempts, never uploaded references or plain text notes. */
export function summarizeCanvasTasks(nodes: CanvasNodeData[]): CanvasTaskSummary[] {
    return nodes.flatMap<CanvasTaskSummary>(node => {
        const meta = node.metadata;
        if (!meta || !["loading", "success", "error"].includes(meta.status || "")) return [];
        const type = node.type === CanvasNodeType.Panorama ? "image" : node.type;
        if (type !== "image" && type !== "video" && type !== "audio" && type !== "text") return [];
        const taskId = meta.imageTaskId || meta.videoTaskId || meta.audioTaskId;
        const startedAt = typeof meta.startedAt === "number" && meta.startedAt > 0 && Number.isFinite(new Date(meta.startedAt).getTime()) ? meta.startedAt : 0;
        if (!taskId && !startedAt) return [];
        // Include the attempt time: a retry must never inherit an earlier attempt's read state.
        const key = `${node.id}:${taskId || "local"}:${startedAt}`;
        const progress = typeof meta.progress === "number" && Number.isFinite(meta.progress) ? Math.max(0, Math.min(100, meta.progress)) : undefined;
        return [{ key, nodeId: node.id, title: node.title || "未命名任务", type, status: meta.status as CanvasTaskSummary["status"], startedAt, progress, detail: (meta.status === "error" ? meta.errorDetails : meta.taskStage) || "", model: meta.model }];
    }).sort((a, b) => Number(b.status === "loading") - Number(a.status === "loading") || b.startedAt - a.startedAt || a.key.localeCompare(b.key));
}

export function taskReceiptStorageKey(owner: string, canvasId: string) {
    return `xoi:canvas-task-read:v1:${encodeURIComponent(owner)}:${encodeURIComponent(canvasId)}`;
}

/** Initial history and undo/redo must not masquerade as a newly completed request. */
export function newlyFinishedTasks(previous: Map<string, CanvasTaskSummary["status"]>, tasks: CanvasTaskSummary[]) {
    return tasks.filter(task => previous.get(task.key) === "loading" && task.status !== "loading");
}
