/**
 * XOi ↔ Atelier 桥接层：角景/资产「发送到画布」入口引导与「保存并返回」出口信封。
 * 入口协议（宿主 sendToCanvas.ts → Vue 壳透传 iframe src query）：
 *   ?import=<encodeURIComponent(JSON([{src,name,id?,type?,projectId?}]))>&source=xoi&from=cornerScape|assets
 * 出口协议（消费端 cornerScape/index.vue / assets/index.vue 零改动，按 timestamp 判新）：
 *   localStorage.canvas_save_result = { images:[{id,type,projectId,src}], timestamp }
 *   随后跳回宿主 /#/{from}（同源 iframe 直接改 parent.location.hash 路由）。
 */

import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { CanvasNodeType, type CanvasAgentSkillSelection, type CanvasConnection, type CanvasNodeData, type CanvasPendingAgentRequest } from "@/types/canvas";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { uploadImage } from "@/services/image-storage";
import {takeBrowserHandoff,writeBrowserHandoff} from "../../../../shared/browserHandoff";
import {assertCanvasAccount} from "./owner";

export type XoiImportImage = { src: string; name?: string; id?: number; type?: string; projectId?: number };
export type XoiSaveResultImage = { id?: number | string; type?: string; projectId?: number; src: string };

const FROM_STORAGE_KEY = "xoi_bridge_from";
const XOI_RETURN_ROUTES = ["cornerScape", "assets"];

type XoiCanvasHandoff = {
    prompt?: string;
    category?: string;
    skills?: Array<Partial<CanvasAgentSkillSelection> & { path?: string; group?: string }>;
    source?: string;
    createdAt?: number;
};

function readCanvasHandoff(): CanvasPendingAgentRequest | null {
    try {
        const data = takeBrowserHandoff<XoiCanvasHandoff>(sessionStorage,assertCanvasAccount(),"canvas-prompt");
        if (!data) return null;
        const prompt = typeof data.prompt === "string" ? data.prompt.trim() : "";
        const skills = Array.isArray(data.skills)
            ? data.skills.filter((skill) => skill && typeof skill.name === "string").slice(0, 5).map((skill, index) => ({
                id: typeof skill.id === "string" ? skill.id : skill.path || `xoi-skill-${index}`,
                name: String(skill.name),
                source: skill.source === "user" ? "user" as const : "system" as const,
                path: typeof skill.path === "string" ? skill.path : undefined,
                group: typeof skill.group === "string" ? skill.group : undefined,
            }))
            : [];
        return { prompt, skills };
    } catch {
        return null;
    }
}

export async function runXoiCanvasHandoff(navigate: (path: string) => void) {
    const request = readCanvasHandoff();
    if (!request) return;
    await waitForCanvasStoreHydrated();
    assertCanvasAccount();
    const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
    const title = request.prompt ? request.prompt.slice(0, 28) : i18n.t("xoiBridge.canvasTitle");
    const projectId = useCanvasStore.getState().createProject(title, { pendingAgentRequest: request });
    navigate(`/canvas/${projectId}`);
}

export function parseXoiImportFromLocation(): { images: XoiImportImage[]; from: string } | null {
    try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get("import");
        if (!raw || params.get("source") !== "xoi") return null;
        const images = (JSON.parse(raw) as XoiImportImage[]).filter((image) => image && typeof image.src === "string" && image.src);
        if (!images.length) return null;
        const from = params.get("from") || "cornerScape";
        // 暂存发起来源页：顶栏「保存并返回」按钮在整个会话期间（含刷新）据此定点回归
        try {
            sessionStorage.setItem(FROM_STORAGE_KEY, from);
        } catch {
            /* ignore */
        }
        return { images, from };
    } catch (error) {
        console.error("[xoi-bridge] import 参数解析失败:", error);
        return null;
    }
}

export function clearXoiImportFromLocation() {
    try {
        const url = new URL(window.location.href);
        if (!url.search) return;
        url.search = "";
        window.history.replaceState({}, "", url.toString());
    } catch {
        /* ignore */
    }
}

export function getXoiFrom(): string {
    try {
        return sessionStorage.getItem(FROM_STORAGE_KEY) || "";
    } catch {
        return "";
    }
}


// ---- 入口引导：建画布 + 导入图片节点（复刻旧 xoi-bridge.js autoCreateAndImport）----

async function waitForCanvasStoreHydrated() {
    const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
    if (useCanvasStore.persist.hasHydrated()) return;
    await new Promise<void>((resolve) => {
        const unsubscribe = useCanvasStore.persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
        });
    });
}

export async function runXoiImportEntry(navigate: (path: string) => void) {
    const entry = parseXoiImportFromLocation();
    if (!entry) return;
    clearXoiImportFromLocation();
    await waitForCanvasStoreHydrated();
    const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
    const title = `${i18n.t("xoiBridge.canvasTitle")} ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    const projectId = useCanvasStore.getState().createProject(title);
    const nodes: CanvasNodeData[] = [];
    for (const [index, image] of entry.images.entries()) {
        try {
            const uploaded = await uploadImage(image.src);
            const size = fitNodeSize(uploaded.width, uploaded.height);
            nodes.push({
                id: nanoid(),
                type: CanvasNodeType.Image,
                title: image.name || `S${String(index + 1).padStart(2, "0")}`,
                position: { x: 120 + index * 360, y: 120 },
                width: size.width,
                height: size.height,
                metadata: {
                    ...imageMetadata(uploaded),
                    xoiId: image.id,
                    xoiType: image.type,
                    xoiProjectId: image.projectId,
                },
            });
        } catch (error) {
            console.error("[xoi-bridge] 图片导入失败:", image.src, error);
        }
    }
    useCanvasStore.getState().updateProject(projectId, { nodes });
    navigate(`/canvas/${projectId}`);
}

// ---- 出口：保存并返回（复刻旧 xoi-bridge.js saveAndGoBack 的自动追踪）----

/** BFS 沿连线找该输入图下游第一张「新」图片产物的 URL（storageKey 优先；排除原图自身） */
export function findDownstreamImageResult(startNodeId: string, sourceContent: string | undefined, nodes: CanvasNodeData[], connections: CanvasConnection[]): string {
    const visited = new Set<string>();
    let queue = [startNodeId];
    for (let depth = 0; depth < 10 && queue.length; depth += 1) {
        const next: string[] = [];
        for (const currentId of queue) {
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            for (const connection of connections) {
                if (connection.fromNodeId !== currentId) continue;
                const target = nodes.find((node) => node.id === connection.toNodeId);
                if (!target) continue;
                if (target.type === CanvasNodeType.Image) {
                    const url = target.metadata?.storageKey || target.metadata?.content || "";
                    if (url && url !== sourceContent) return url;
                }
                next.push(target.id);
            }
        }
        queue = next;
    }
    return "";
}

export function buildXoiSaveResults(nodes: CanvasNodeData[], connections: CanvasConnection[]): { results: XoiSaveResultImage[]; missingNames: string[]; sourceCount: number } {
    const sourceNodes = nodes.filter((node) => node.type === CanvasNodeType.Image && node.metadata?.xoiId != null);
    const results: XoiSaveResultImage[] = [];
    const missingNames: string[] = [];
    for (const node of sourceNodes) {
        const url = findDownstreamImageResult(node.id, node.metadata?.content, nodes, connections);
        if (url) {
            results.push({
                id: node.metadata!.xoiId,
                type: node.metadata!.xoiType || "storyboard",
                projectId: node.metadata!.xoiProjectId || 0,
                src: url,
            });
        } else {
            missingNames.push(node.title || String(node.metadata!.xoiId));
        }
    }
    return { results, missingNames, sourceCount: sourceNodes.length };
}

/** 写出口信封并定点跳回宿主来源页（白名单限定防 URL 注入乱跳） */
export function writeSaveResultAndGoBack(results: XoiSaveResultImage[]) {
    try {
        writeBrowserHandoff(sessionStorage,assertCanvasAccount(),"canvas-result",{images:results,timestamp:Date.now()});
    } catch (error) {
        console.error("[xoi-bridge] 写保存结果失败:", error);
        throw error;
    }
    const from = getXoiFrom();
    const target = `/#/${XOI_RETURN_ROUTES.includes(from) ? from : "cornerScape"}`;
    if (window.parent && window.parent !== window) window.parent.location.href = target;
    else window.location.href = target;
}
