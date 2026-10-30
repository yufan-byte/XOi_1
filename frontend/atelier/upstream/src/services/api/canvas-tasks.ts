import type { CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import { apiGet, apiPost } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

export async function listCanvasProjects(token: string) {
    return apiGet<CanvasProject[]>("/api/v1/canvas/projects", undefined, token);
}

/**
 * 云端快照瘦身：画布节点把整张 base64 图存在 metadata.content，本地优先没问题，
 * 但整包 POST /api/v1/canvas/projects 会超 13MB 网关上限 → 永远 413「云端保存失败」。
 * 规则：有 storageKey 的超大 dataUrl 直接丢弃（跨设备可由 /api/files/<id>/content 回源）；
 * 无 storageKey 的超大图片 dataUrl 降采样兜底；blob: 会话地址跨设备无用，一律剥掉。
 * 本机（zustand/localForage）始终保留完整原图，不受影响。
 */
const CLOUD_MEDIA_URL_LIMIT = 300_000;

function isCloudUselessMediaUrl(value: string) {
    if (value.startsWith("blob:")) return true;
    return value.startsWith("data:") && value.length > CLOUD_MEDIA_URL_LIMIT;
}

/** 无 storageKey 的超大图片 dataUrl：降采样为 1280px JPEG 兜底，尽量保住跨设备可见性。 */
async function compactOversizeDataUrlForCloud(dataUrl: string): Promise<string> {
    try {
        if (!dataUrl.startsWith("data:image/")) return "";
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("decode failed"));
            element.src = dataUrl;
        });
        const scale = Math.min(1, 1280 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
        const context = canvas.getContext("2d");
        if (!context) return "";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const compacted = canvas.toDataURL("image/jpeg", 0.82);
        return compacted.length < dataUrl.length ? compacted : "";
    } catch {
        return "";
    }
}

async function sanitizeValueForCloud(value: unknown, depth = 0): Promise<unknown> {
    if (typeof value === "string") return isCloudUselessMediaUrl(value) ? "" : value;
    if (Array.isArray(value)) return Promise.all(value.map((item) => sanitizeValueForCloud(item, depth + 1)));
    if (value && typeof value === "object" && depth < 10) {
        const entries = await Promise.all(
            Object.entries(value as Record<string, unknown>).map(async ([key, item]) => [key, await sanitizeValueForCloud(item, depth + 1)] as const),
        );
        return Object.fromEntries(entries);
    }
    return value;
}

export async function sanitizeCanvasProjectForCloud<P extends CanvasProject>(project: P): Promise<P> {
    const nodes = await Promise.all((project.nodes || []).map(async (node) => {
        const metadata = node.metadata as Record<string, unknown> | undefined;
        if (!metadata || typeof metadata !== "object") return node;
        const nextMetadata: Record<string, unknown> = { ...metadata };
        const content = nextMetadata.content;
        if (typeof content === "string" && content.startsWith("data:") && content.length > CLOUD_MEDIA_URL_LIMIT) {
            nextMetadata.content = nextMetadata.storageKey ? "" : await compactOversizeDataUrlForCloud(content);
        }
        return { ...node, metadata: await sanitizeValueForCloud(nextMetadata, 0) as typeof metadata };
    }));
    const rest = await sanitizeValueForCloud({ ...project, nodes: [] }, 0) as Record<string, unknown>;
    return { ...(project as unknown as Record<string, unknown>), ...rest, nodes } as unknown as P;
}

export async function saveCanvasProject(
    token: string,
    project: CanvasProject,
) {
    return apiPost<CanvasProject>(
        "/api/v1/canvas/projects",
        { data: await sanitizeCanvasProjectForCloud(project) },
        token,
    );
}

export async function syncCanvasProjects(
    token: string,
    projects: CanvasProject[],
) {
    const sanitized = await Promise.all(projects.map((project) => sanitizeCanvasProjectForCloud(project)));
    return apiPost<CanvasProject[]>(
        "/api/v1/canvas/projects/sync",
        { projects: sanitized },
        token,
    );
}

export async function deleteCanvasTasks(sourceId: string, nodeIds: string[] = []) {
    const token = useUserStore.getState().token;
    const source = sourceId.trim();
    if (!token || !source) return;
    return apiPost<{ deleted: boolean }>(
        "/api/v1/canvas/tasks/delete",
        {
            source_id: source,
            node_ids: Array.from(new Set(nodeIds.map((id) => id.trim()).filter(Boolean))),
        },
        token,
    );
}

export async function deleteCanvasProjects(ids: string[]) {
    const token = useUserStore.getState().token;
    const projectIds = Array.from(
        new Set(ids.map((id) => id.trim()).filter(Boolean)),
    );
    if (!token || !projectIds.length) return;
    return apiPost<{ deleted: boolean }>(
        "/api/v1/canvas/projects/delete",
        { ids: projectIds },
        token,
    );
}
