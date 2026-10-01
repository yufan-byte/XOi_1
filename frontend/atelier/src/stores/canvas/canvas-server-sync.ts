/**
 * 画布工程 ↔ 宿主后端(/api/canvases) 同步层。
 *
 * 契约对齐 backend/src/routes/canvas.ts：
 * - 列表 GET /api/canvases → { canvases: Record[] }，Record.format==='atelier' 为本引擎画布
 * - 新建 POST /api/canvases {title, icon} → 服务端生成 id（客户端 nanoid 需映射 serverId）
 * - 全量保存 PUT /api/canvases/:id {title, nodes, connections, viewport, settings, base_updated_at}
 *   · chatSessions 等扩展字段放 settings.atelier 载荷（后端透传 settings）
 *   · base_updated_at 乐观锁：409 时取服务端最新基线覆盖一次（单人编辑 last-write-wins）
 * - 删除 DELETE /api/canvases/:id（软删进回收站，后端 30 天保留）
 */

import { backendFetch, backendJson } from "@/xoi/backend";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

type SyncMeta = { serverId: string; baseUpdatedAt: number; json: string };

const syncMap = new Map<string, SyncMeta>();
let queue: Promise<void> = Promise.resolve();

// ---- 序列化 ----

function projectToServerPayload(project: CanvasProject) {
    return {
        title: project.title,
        nodes: project.nodes,
        connections: project.connections,
        viewport: project.viewport,
        settings: {
            atelier: {
                chatSessions: project.chatSessions,
                activeChatId: project.activeChatId,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo,
            },
        },
    };
}

function projectFingerprint(project: CanvasProject): string {
    return JSON.stringify(projectToServerPayload(project));
}

export function serverCanvasToProject(canvas: any): CanvasProject {
    const atelier = canvas?.settings?.atelier || {};
    const viewport = canvas?.viewport || {};
    return {
        id: String(canvas.id),
        title: canvas.title || "未命名画布",
        createdAt: new Date(canvas.created_at || Date.now()).toISOString(),
        updatedAt: new Date(canvas.updated_at || Date.now()).toISOString(),
        nodes: Array.isArray(canvas.nodes) ? canvas.nodes : [],
        connections: Array.isArray(canvas.connections) ? canvas.connections : [],
        chatSessions: Array.isArray(atelier.chatSessions) ? atelier.chatSessions : [],
        activeChatId: atelier.activeChatId ?? null,
        backgroundMode: atelier.backgroundMode || "lines",
        showImageInfo: !!atelier.showImageInfo,
        viewport: {
            x: Number(viewport.x) || 0,
            y: Number(viewport.y) || 0,
            k: Number(viewport.k ?? viewport.scale) || 1,
        },
    };
}

// ---- 服务端 → 本地（启动水合） ----

export async function fetchServerProjects(): Promise<CanvasProject[] | null> {
    try {
        const listResp = await backendFetch("/api/canvases");
        if (!listResp.ok) return null;
        const { canvases } = (await listResp.json()) as { canvases?: any[] };
        const records = (canvases || []).filter((item) => item.format === "atelier");

        const projects = await Promise.all(
            records.map(async (record): Promise<CanvasProject | null> => {
                try {
                    const { canvas } = await backendJson<{ canvas: any }>(`/api/canvases/${record.id}`);
                    return serverCanvasToProject(canvas);
                } catch {
                    return null;
                }
            }),
        );
        const cleaned = projects.filter((item): item is CanvasProject => item !== null);
        cleaned.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        // 建立同步基线：已有映射保留（保留 baseUpdatedAt），新条目以服务端 updated_at 为基线
        for (const record of records) {
            const project = cleaned.find((item) => item.id === record.id);
            if (!project) continue;
            const fingerprint = projectFingerprint(project);
            const existing = syncMap.get(project.id);
            if (!existing) {
                syncMap.set(project.id, {
                    serverId: record.id,
                    baseUpdatedAt: Number(record.updated_at) || 0,
                    json: fingerprint,
                });
            } else if (fingerprint !== existing.json) {
                existing.json = fingerprint;
                existing.baseUpdatedAt = Number(record.updated_at) || existing.baseUpdatedAt;
            }
        }

        return cleaned;
    } catch {
        return null; // 服务端不可达 → 调用方回退本地缓存
    }
}

// ---- 本地 → 服务端（防抖 flush 后入队串行执行） ----

export function enqueueSync(projects: CanvasProject[], removedIds: string[]): void {
    queue = queue
        .then(async () => {
            for (const project of projects) {
                await syncOne(project);
            }
            for (const id of removedIds) {
                await removeOne(id);
            }
        })
        .catch((error) => console.warn("[atelier-sync] 同步失败(下次保存重试):", error));
}

async function syncOne(project: CanvasProject): Promise<void> {
    const fingerprint = projectFingerprint(project);
    let meta = syncMap.get(project.id);
    if (meta && meta.json === fingerprint) return; // 无变化
    try {
        if (!meta) {
            // 新画布：先 POST 拿服务端 id，再全量 PUT
            const { canvas } = await backendJson<{ canvas: any }>("/api/canvases", {
                method: "POST",
                json: { title: project.title, icon: "atelier", kind: "classic" },
            });
            meta = { serverId: canvas.id, baseUpdatedAt: Number(canvas.updated_at) || 0, json: "" };
            syncMap.set(project.id, meta);
        }
        const saved = await putProject(meta.serverId, project, meta.baseUpdatedAt);
        meta.baseUpdatedAt = Number(saved.updated_at) || meta.baseUpdatedAt;
        meta.json = fingerprint;
    } catch (error) {
        console.warn("[atelier-sync] 画布保存失败(下次保存重试):", project.title, error);
    }
}

async function putProject(serverId: string, project: CanvasProject, baseUpdatedAt: number, allowRetry = true): Promise<any> {
    try {
        const { canvas } = await backendJson<{ canvas: any }>(`/api/canvases/${serverId}`, {
            method: "PUT",
            json: { ...projectToServerPayload(project), base_updated_at: baseUpdatedAt || undefined },
        });
        return canvas;
    } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 409 && allowRetry) {
            // 服务端版本更新：拉最新基线后覆盖一次（last-write-wins）
            const { canvas } = await backendJson<{ canvas: any }>(`/api/canvases/${serverId}`);
            return putProject(serverId, project, Number(canvas.updated_at) || 0, false);
        }
        throw error;
    }
}

async function removeOne(clientId: string): Promise<void> {
    const meta = syncMap.get(clientId);
    if (!meta) return;
    syncMap.delete(clientId);
    try {
        await backendFetch(`/api/canvases/${meta.serverId}`, { method: "DELETE" });
    } catch {
        // 软删失败不阻塞（画布仍在服务端，只是没进回收站）
    }
}
