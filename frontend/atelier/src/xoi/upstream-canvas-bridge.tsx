import { useMemo } from "react";
import { App, Button } from "antd";
import { useParams } from "react-router-dom";
import { nanoid } from "nanoid";

import { useCanvasStore } from "/Users/zhaochenyu/Desktop/C_code/infinite-canvas-main/web/src/app/(user)/canvas/stores/use-canvas-store";
import { fitNodeSize } from "/Users/zhaochenyu/Desktop/C_code/infinite-canvas-main/web/src/app/(user)/canvas/utils/canvas-node-size";
import { uploadImage } from "/Users/zhaochenyu/Desktop/C_code/infinite-canvas-main/web/src/services/image-storage";

type ImportImage = { src: string; name?: string; id?: number; type?: string; projectId?: number };
type LooseNode = { id: string; type: string; title: string; position: { x: number; y: number }; width: number; height: number; metadata?: Record<string, any> };
type LooseConnection = { fromNodeId: string; toNodeId: string };
const FROM_KEY = "xoi_bridge_from";
const HANDOFF_KEY = "xoi_canvas_handoff_v1";

type HandoffAsset = { id?: string; name?: string; type?: string; size?: number; dataUrl?: string };
type CanvasHandoff = {
    prompt?: string;
    skills?: Array<{ path?: string; name?: string }>;
    assets?: HandoffAsset[];
    image?: { size?: string; quality?: string };
    video?: { size?: string; quality?: string };
    reasoning?: boolean;
};

async function waitForHydration() {
    if (useCanvasStore.persist.hasHydrated()) return;
    await new Promise<void>((resolve) => {
        const unsubscribe = useCanvasStore.persist.onFinishHydration(() => { unsubscribe(); resolve(); });
    });
}

export async function runUpstreamXoiImport(navigate: (path: string) => void) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "xoi" || !params.get("import")) return;
    let images: ImportImage[] = [];
    try { images = JSON.parse(params.get("import") || "[]"); } catch { return; }
    if (!images.length) return;
    sessionStorage.setItem(FROM_KEY, params.get("from") || "cornerScape");
    history.replaceState({}, "", window.location.pathname + window.location.hash);
    await waitForHydration();
    const projectId = useCanvasStore.getState().createProject(`XOi 编辑 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    const nodes: LooseNode[] = [];
    for (const [index, image] of images.entries()) {
        const uploaded = await uploadImage(image.src);
        const size = fitNodeSize(uploaded.width, uploaded.height);
        nodes.push({
            id: nanoid(), type: "image", title: image.name || `S${String(index + 1).padStart(2, "0")}`,
            position: { x: 120 + index * 360, y: 120 }, width: size.width, height: size.height,
            metadata: { content: uploaded.url, storageKey: uploaded.storageKey, naturalWidth: uploaded.width, naturalHeight: uploaded.height, mimeType: uploaded.mimeType, bytes: uploaded.bytes, xoiId: image.id, xoiType: image.type, xoiProjectId: image.projectId },
        });
    }
    useCanvasStore.getState().updateProject(projectId, { nodes: nodes as never[] });
    navigate(`/canvas/${projectId}`);
}

/** Consume the outer creative-chat composer request using the upstream canvas
 * store and pending-agent protocol, so the full upstream Agent panel receives
 * exactly the same prompt, Skills, attachments and media defaults. */
export async function runUpstreamXoiHandoff(navigate: (path: string) => void) {
    const raw = localStorage.getItem(HANDOFF_KEY);
    if (!raw) return;
    let handoff: CanvasHandoff;
    try { handoff = JSON.parse(raw) as CanvasHandoff; } catch { return; }
    const prompt = String(handoff.prompt || "").trim();
    if (!prompt) return;
    localStorage.removeItem(HANDOFF_KEY);
    await waitForHydration();

    const assets = (handoff.assets || []).filter((item) => item?.dataUrl).map((item, index) => {
        const nodeId = item.id || nanoid();
        const title = item.name || `素材 ${index + 1}`;
        const mimeType = item.type || "application/octet-stream";
        const common = { id: nodeId, title, label: `@素材${index + 1}`, mimeType };
        if (mimeType.startsWith("video/")) return { nodeId, payload: { kind: "video", url: item.dataUrl!, title, mimeType, bytes: item.size }, reference: { ...common, type: "video", url: item.dataUrl } };
        if (mimeType.startsWith("audio/")) return { nodeId, payload: { kind: "audio", url: item.dataUrl!, title, mimeType, bytes: item.size }, reference: { ...common, type: "audio", url: item.dataUrl } };
        return { nodeId, payload: { kind: "image", dataUrl: item.dataUrl!, title, mimeType, bytes: item.size }, reference: { ...common, type: "image", dataUrl: item.dataUrl } };
    });
    const skills = (handoff.skills || []).filter((item) => item?.name).slice(0, 5).map((item, index) => ({ id: item.path || `xoi-skill-${index}`, name: String(item.name), source: "system" as const }));
    const imageQuality = handoff.image?.quality === "高" ? "high" : handoff.image?.quality === "中" ? "medium" : handoff.image?.quality === "低" ? "low" : "auto";
    const videoQuality = handoff.video?.quality === "1080p" ? "1080" : handoff.video?.quality === "480p" ? "480" : "720";
    const videoPreset: Record<string, string> = { 横屏: "1280x720", 竖屏: "720x1280", 方形: "960x960", 标准横屏: "1112x834", 标准竖屏: "834x1112", 宽银幕: "1470x630" };
    const videoSize = videoPreset[handoff.video?.size || "横屏"] || "1280x720";
    const projectId = useCanvasStore.getState().createProject(prompt.slice(0, 28) || "无限画布", {
        pendingAgentRequest: { prompt, assets: assets as never[], skills },
        agentConfig: {
            textApiMode: "chat",
            textReasoningEnabled: handoff.reasoning === true,
            autoGenerateMedia: false,
            imageSize: handoff.image?.size || "1:1",
            imageQuality,
            videoSize,
            videoQuality,
        },
    });
    navigate(`/canvas/${projectId}`);
}

function collectResults(nodes: LooseNode[], connections: LooseConnection[]) {
    const sources = nodes.filter((node) => node.type === "image" && node.metadata?.xoiId != null);
    const results: Array<{ id: unknown; type: string; projectId: number; src: string }> = [];
    const missing: string[] = [];
    for (const source of sources) {
        const visited = new Set<string>();
        let queue = [source.id];
        let found = "";
        for (let depth = 0; depth < 10 && queue.length && !found; depth += 1) {
            const next: string[] = [];
            for (const id of queue) {
                if (visited.has(id)) continue;
                visited.add(id);
                for (const edge of connections.filter((item) => item.fromNodeId === id)) {
                    const node = nodes.find((item) => item.id === edge.toNodeId);
                    if (!node) continue;
                    const url = node.metadata?.storageKey || node.metadata?.content || node.metadata?.images?.[0]?.storageKey || node.metadata?.images?.[0]?.content;
                    if (node.type === "image" && url && url !== source.metadata?.content) { found = url; break; }
                    next.push(node.id);
                }
            }
            queue = next;
        }
        if (found) results.push({ id: source.metadata?.xoiId, type: source.metadata?.xoiType || "storyboard", projectId: source.metadata?.xoiProjectId || 0, src: found });
        else missing.push(source.title);
    }
    return { sources, results, missing };
}

export function XoiCanvasReturnControls() {
    const { message } = App.useApp();
    const { id } = useParams();
    const project = useCanvasStore((state) => state.projects.find((item) => item.id === id));
    const from = sessionStorage.getItem(FROM_KEY) || "";
    const state = useMemo(() => collectResults((project?.nodes || []) as LooseNode[], (project?.connections || []) as LooseConnection[]), [project]);
    if (!from || !project || !state.sources.length) return null;
    const detect = () => state.missing.length ? message.warning(`还有 ${state.missing.length} 张来源图没有检测到下游结果：${state.missing.join("、")}`) : message.success(`已检测到 ${state.results.length} 张可返回结果`);
    const save = () => {
        if (state.missing.length) { detect(); return; }
        localStorage.setItem("canvas_save_result", JSON.stringify({ images: state.results, timestamp: Date.now() }));
        window.parent.location.href = `/#/${["cornerScape", "assets"].includes(from) ? from : "cornerScape"}`;
    };
    return <div data-xoi-canvas-return className="pointer-events-auto absolute left-1/2 top-4 z-[90] flex -translate-x-1/2 gap-2"><Button onClick={detect}>检测结果</Button><Button type="primary" onClick={save}>保存并返回</Button></div>;
}
