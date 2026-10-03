import { useMemo } from "react";
import { App, Button } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import { ArrowLeft } from "lucide-react";

import { useCanvasStore } from "@upstream/app/(user)/canvas/stores/use-canvas-store";
import { fitNodeSize } from "@upstream/app/(user)/canvas/utils/canvas-node-size";
import { uploadImage } from "@upstream/services/image-storage";

type ImportImage = { src: string; name?: string; id?: number; type?: string; projectId?: number };
type LooseNode = { id: string; type: string; title: string; position: { x: number; y: number }; width: number; height: number; metadata?: Record<string, any> };
type LooseConnection = { fromNodeId: string; toNodeId: string };
const FROM_KEY = "xoi_bridge_from";
const HANDOFF_KEY = "xoi_canvas_handoff_v1";
/** 灵感广场画布作品「免费复刻同款」的整图载荷：{workId,title,prompt,nodes,edges}（造物 preview 原格式） */
const GRAPH_KEY = "xoi_canvas_graph_v1";
/** 编辑器左上返回控件的来路标记：aiAssistant=回到对话 / square=回到灵感广场 / home=返回画布首页。
 *  与 FROM_KEY（cornerScape/assets 的「保存并返回」定点回归）互斥，两条链路各设各的。 */
const BACK_KEY = "xoi_canvas_back_v1";

type HandoffAsset = { id?: string; name?: string; type?: string; size?: number; dataUrl?: string };
type CanvasHandoff = {
    prompt?: string;
    skills?: Array<{ path?: string; name?: string }>;
    assets?: HandoffAsset[];
    /** 灵感广场「带到画布生成」带的站内媒体地址：参考图落成图片节点、源视频落成视频节点，
     *  否则画布落地是个空项目，用户会以为「没带过去」 */
    assetUrls?: string[];
    videoUrls?: string[];
    image?: { size?: string; quality?: string };
    video?: { size?: string; quality?: string };
    reasoning?: boolean;
    source?: string;
};

/** 造物灵感广场 canvas-previews.json 的单节点 / 单连线（字段是造物压缩过的短名） */
type PreviewNode = { id: string; type: string; x?: number; y?: number; w?: number; h?: number; parent?: string | null; data?: Record<string, unknown> };
type PreviewEdge = { s: string; t: string };
type GraphPayload = { workId?: string; title?: string; prompt?: string; nodes?: PreviewNode[]; edges?: PreviewEdge[] };

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
    // 与「新建直达 / 对话 handoff」的返回钮互斥：同源 sessionStorage 会残留，两组控件叠在同一位置
    sessionStorage.removeItem(BACK_KEY);
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

/** 宿主侧栏「新建画布」一键直达：?new=1&source=xoi 建一个空白项目并直接进编辑器，
 * 省掉「落首页再点一次新建」那一步。返回控件标记为「返回首页」。 */
export async function runUpstreamXoiNewCanvas(navigate: (path: string) => void) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "xoi" || params.get("new") !== "1") return;
    sessionStorage.setItem(BACK_KEY, "home");
    sessionStorage.removeItem(FROM_KEY);
    history.replaceState({}, "", window.location.pathname + window.location.hash);
    await waitForHydration();
    const count = useCanvasStore.getState().projects.length + 1;
    const projectId = useCanvasStore.getState().createProject(`无限画布 ${count}`);
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
    // 来路标记先于空提示词判断：即使 prompt 为空没建项目，用户从首页自己新建/打开的
    // 画布也算「从对话进来」，编辑器里照样给「回到对话」。灵感广场来的用「回到广场」。
    sessionStorage.setItem(BACK_KEY, handoff.source === "square" ? "square" : "aiAssistant");
    sessionStorage.removeItem(FROM_KEY);
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
    // 广场作品的参考图 / 源视频落成画布上的媒体节点：Agent 面板有得参考，画布也不是一片空白。
    // 直接挂站内媒体地址（与整图复刻同口径：图片和视频节点都认 metadata.content），
    // 不走 uploadImage 中转：省一次 1~2MB 的下载+上传往返，也不会因上传失败而丢节点。
    const coverImages = (handoff.assetUrls || []).filter((url) => typeof url === "string" && url).slice(0, 4);
    const coverVideos = (handoff.videoUrls || []).filter((url) => typeof url === "string" && url).slice(0, 2);
    if (coverImages.length || coverVideos.length) {
        const nodes: LooseNode[] = [];
        let slot = 0;
        for (const url of coverImages) {
            const natural = await new Promise<{ w: number; h: number }>((resolve) => {
                const probe = new Image();
                probe.onload = () => resolve({ w: probe.naturalWidth || 1024, h: probe.naturalHeight || 1024 });
                probe.onerror = () => resolve({ w: 1024, h: 1024 });
                probe.src = url;
            });
            const size = fitNodeSize(natural.w, natural.h);
            nodes.push({
                id: nanoid(), type: "image", title: `参考图 ${slot + 1}`,
                position: { x: 120 + slot * 360, y: 120 }, width: size.width, height: size.height,
                metadata: { content: url, naturalWidth: natural.w, naturalHeight: natural.h, status: "success" },
            });
            slot += 1;
        }
        for (const url of coverVideos) {
            const size = fitNodeSize(1280, 720);
            nodes.push({
                id: nanoid(), type: "video", title: `源视频 ${slot + 1}`,
                position: { x: 120 + slot * 360, y: 120 }, width: size.width, height: size.height,
                metadata: { content: url, status: "success" },
            });
            slot += 1;
        }
        if (nodes.length) useCanvasStore.getState().updateProject(projectId, { nodes: nodes as never[] });
    }
    navigate(`/canvas/${projectId}`);
}

/** 造物 preview 节点类型 → atelier 节点类型。config 家族（imageConfig/videoConfig/llmConfig/audioConfig）
 *  在 atelier 里统一收敛成 config + generationMode，靠 generationMode 区分生成形态。
 *  director 直通（atelier 有同名节点）；videoStory 在 atelier 无对应节点，
 *  在 adaptPreviewGraph 里降级成 text 承载分镜表内容，避免整块数据被静默丢弃。 */
const PREVIEW_TYPE_MAP: Record<string, { type: string; mode?: "text" | "image" | "video" | "audio" }> = {
    image: { type: "image" },
    video: { type: "video" },
    audio: { type: "audio" },
    text: { type: "text" },
    group: { type: "group" },
    director: { type: "director" },
    imageConfig: { type: "config", mode: "image" },
    videoConfig: { type: "config", mode: "video" },
    llmConfig: { type: "config", mode: "text" },
    audioConfig: { type: "config", mode: "audio" },
};
const PREVIEW_TITLES: Record<string, string> = { image: "图片", video: "视频", audio: "音频", text: "文本", group: "分组", config: "生成配置", director: "导演台" };

/** videoStory（分镜表）→ 文本：保留镜号/画面/提示词，至少不丢信息 */
function flattenVideoStory(data: Record<string, unknown>): string {
    const rows = Array.isArray(data.rows) ? (data.rows as Array<Record<string, unknown>>) : [];
    if (!rows.length) return String(data.content ?? "");
    return rows
        .map((row, index) => {
            const no = row.shotNo ?? index + 1;
            const parts = [row.visual, row.imagePrompt, row.narrative, row.cameraAngle, row.shotSize, row.lighting]
                .filter((v) => typeof v === "string" && v)
                .join(" | ");
            return `${no}. ${parts}`;
        })
        .join("\n");
}

/** 造物 preview 图 → atelier 图：类型收敛、x/y/w/h → position/width/height、data.* → metadata.*、
 *  parent → metadata.groupId、{s,t} 连线 → {fromNodeId,toNodeId}。无法识别的节点与悬空连线一律丢弃。 */
function adaptPreviewGraph(payload: GraphPayload) {
    const raw = payload.nodes || [];
    const groupIds = new Set(raw.filter((item) => item.type === "group").map((item) => item.id));
    const nodes: LooseNode[] = [];
    for (const item of raw) {
        // videoStory 无对应节点类型：降级为 text 承载分镜表，别整块丢掉
        const isVideoStory = item.type === "videoStory";
        const mapped = PREVIEW_TYPE_MAP[item.type];
        if (!mapped && !isVideoStory) continue;
        const data = (item.data || {}) as Record<string, unknown>;
        const mappedType = isVideoStory ? "text" : mapped!.type;
        const metadata: Record<string, unknown> = {};
        if (mappedType === "image" || mappedType === "video" || mappedType === "audio") {
            // 未生成的媒体节点（无 url）也保留：画布侧会渲染成「空图片/空视频节点」占位，
            // 保住工作流骨架与连线；丢掉它们会连带废掉下游连线。
            const url = typeof data.url === "string" ? data.url : "";
            if (url) {
                metadata.content = url;
                // 三种媒体节点都标 success：video/audio 之前不标，组件按状态判空时会有歧义
                metadata.status = "success";
            } else {
                // 源头快照就没带素材（造物发布时未收录用户本地上传的参考图/视频）。
                // 标出来让画布显示「素材未随作品收录」，而不是让用户以为复刻失败了。
                metadata.importMissing = true;
            }
            if (data.mediaW) metadata.naturalWidth = Number(data.mediaW) || undefined;
            if (data.mediaH) metadata.naturalHeight = Number(data.mediaH) || undefined;
            if (typeof data.model === "string" && data.model) metadata.model = data.model;
            if (mappedType === "video" && data.duration != null && data.duration !== "") metadata.seconds = String(data.duration);
        } else if (mappedType === "text") {
            metadata.content = isVideoStory
                ? flattenVideoStory(data)
                : String(data.content ?? data.label ?? "");
        } else if (mappedType === "config") {
            metadata.generationMode = mapped!.mode || "image";
            // 造物的 llmConfig 把指令放在 systemPrompt（没有 prompt/content），漏了它 =
            // LLM 节点的提示词全空。三个字段按优先级兜底。
            const prompt = String(data.prompt ?? data.content ?? data.systemPrompt ?? "").trim();
            if (prompt) metadata.prompt = prompt;
            if (typeof data.model === "string" && data.model) metadata.model = data.model;
            const size = data.size ?? data.ratio ?? data.aspect_ratio;
            if (size) metadata.size = String(size);
            if (data.count) metadata.count = Number(data.count) || 1;
            if (mapped!.mode === "video" && data.duration != null && data.duration !== "") metadata.seconds = String(data.duration);
            if (data.quality) metadata.quality = String(data.quality);
            if (data.generate_audio != null) metadata.generateAudio = data.generate_audio ? "true" : "false";
            if (typeof data.videoModeManual === "string" && data.videoModeManual) metadata.videoMode = data.videoModeManual;
        }
        if (item.parent && groupIds.has(item.parent)) metadata.groupId = item.parent;
        nodes.push({
            id: item.id,
            type: mappedType,
            title: String(data.label || PREVIEW_TITLES[mappedType] || "节点"),
            position: { x: Number(item.x) || 0, y: Number(item.y) || 0 },
            width: Number(item.w) || 240,
            height: Number(item.h) || 160,
            metadata,
        });
    }
    const ids = new Set(nodes.map((node) => node.id));
    const connections: LooseConnection[] = (payload.edges || [])
        .filter((edge) => edge && ids.has(edge.s) && ids.has(edge.t))
        .map((edge) => ({ id: nanoid(), fromNodeId: edge.s, toNodeId: edge.t }));
    return { nodes, connections };
}

/** 造物画布坐标跨度可达数千像素（如 x=5180,y=7490），不设初始视口会开在空白处。
 *  按节点包围盒算一个居中铺满的视口：screen = world * k + (x, y)（与 infinite-canvas 的
 *  transform: translate(x,y) scale(k) 一致）。容器尺寸取常见工作区估值即可，误差用户一滚就有。 */
function fitViewport(nodes: LooseNode[]) {
    if (!nodes.length) return undefined;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + node.width);
        maxY = Math.max(maxY, node.position.y + node.height);
    }
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const W = 1200, H = 760, PAD = 0.88;
    const k = Math.min(Math.max(Math.min(W / bw, H / bh) * PAD, 0.05), 1);
    return { k, x: W / 2 - ((minX + maxX) / 2) * k, y: H / 2 - ((minY + maxY) / 2) * k };
}

/** 灵感广场画布作品「免费复刻同款」：还原完整工作流骨架（nodes + edges），
 *  并把作品提示词写进 Agent 面板预填，复刻后既有结构也有创作意图。 */
export async function runUpstreamXoiGraphImport(navigate: (path: string) => void) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "xoi" || !params.get("graph")) return;
    const rawGraph = localStorage.getItem(GRAPH_KEY);
    if (!rawGraph) return;
    localStorage.removeItem(GRAPH_KEY);
    let payload: GraphPayload;
    try { payload = JSON.parse(rawGraph) as GraphPayload; } catch { return; }
    // 与「新建直达 / 对话 handoff」的返回钮互斥，并与角景/资产的「保存并返回」链路互斥
    sessionStorage.setItem(BACK_KEY, params.get("from") || "square");
    sessionStorage.removeItem(FROM_KEY);
    history.replaceState({}, "", window.location.pathname + window.location.hash);
    const { nodes, connections } = adaptPreviewGraph(payload);
    if (!nodes.length) return;
    await waitForHydration();
    const projectId = useCanvasStore.getState().importProject({
        title: payload.title || "复刻画布",
        nodes: nodes as never[],
        connections: connections as never[],
        viewport: fitViewport(nodes),
    });
    const prompt = String(payload.prompt || "").trim();
    if (prompt) useCanvasStore.getState().updateProject(projectId, { pendingAgentRequest: { prompt, assets: [], skills: [] } });
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

/** 编辑器内的来路返回钮：按 BACK_KEY 显示「回到对话」（Agent 对话 handoff 进入）
 * 或「返回首页」（侧栏新建画布直达，回画布首页/英雄页）。角景/资产的「保存并返回」
 * 走 XoiCanvasReturnControls，与本组件互斥（两条链路各设各的 sessionStorage 键）。 */
export function XoiCanvasBackControl() {
    const navigate = useNavigate();
    const back = sessionStorage.getItem(BACK_KEY) || "";
    if (!back) return null;
    const toChat = back === "aiAssistant";
    const toSquare = back === "square";
    const go = () => {
        sessionStorage.removeItem(BACK_KEY);
        // 宿主 Vue 工作台是对话页 / 灵感广场（同源 iframe，沿用 app-top-nav 的回跳写法）
        const parentHash = toChat ? "#/aiAssistant" : toSquare ? "#/square" : "";
        if (parentHash) {
            if (window.parent !== window) window.parent.location.hash = parentHash;
            else window.location.hash = parentHash;
        } else {
            navigate("/");
        }
    };
    return (
        <div data-xoi-canvas-back className="pointer-events-auto absolute left-1/2 top-4 z-[90] -translate-x-1/2">
            <Button icon={<ArrowLeft className="size-4" />} onClick={go}>{toChat ? "回到对话" : toSquare ? "回到广场" : "返回首页"}</Button>
        </div>
    );
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
        sessionStorage.removeItem(FROM_KEY);
        window.parent.location.href = `/#/${["cornerScape", "assets"].includes(from) ? from : "cornerScape"}`;
    };
    return <div data-xoi-canvas-return className="pointer-events-auto absolute left-1/2 top-4 z-[90] flex -translate-x-1/2 gap-2"><Button onClick={detect}>检测结果</Button><Button type="primary" onClick={save}>保存并返回</Button></div>;
}
