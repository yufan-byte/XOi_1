import { useMemo, useState } from "react";
import { App, Button, Modal } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import {normalizeWorkflowLayout} from "./graph-layout";
import { ArrowLeft } from "lucide-react";

import { useCanvasStore } from "@upstream/app/(user)/canvas/stores/use-canvas-store";
import { fitNodeSize } from "@upstream/app/(user)/canvas/utils/canvas-node-size";
import { uploadImage, imageToDataUrl } from "@upstream/services/image-storage";
import { backendJson, backendUploadFile } from "@/xoi/backend";
import { flushCanvasBeforeExit } from "@upstream/app/(user)/canvas/stores/use-canvas-store";
import { useConfigStore as useUpstreamConfigStore } from "@upstream/stores/use-config-store";
import { canvasThemes } from "@upstream/lib/canvas-theme";
import { useThemeStore } from "@upstream/stores/use-theme-store";
import {takeBrowserHandoff,writeBrowserHandoff} from "../../../../shared/browserHandoff";
import {assertCanvasAccount} from "./owner";

type ImportImage = { src: string; name?: string; id?: number; type?: string; projectId?: number; prompt?: string };
type LooseNode = { id: string; type: string; title: string; position: { x: number; y: number }; width: number; height: number; metadata?: Record<string, any> };
type LooseConnection = { fromNodeId: string; toNodeId: string };
const FROM_KEY = "xoi_bridge_from";
/** 灵感广场画布作品「免费复刻同款」的整图载荷：{workId,title,prompt,nodes,edges}（造物 preview 原格式） */
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
    model?: string;
    reasoning?: boolean;
    source?: string;
};

/** 造物灵感广场 canvas-previews.json 的单节点 / 单连线（字段是造物压缩过的短名） */
type PreviewNode = { id: string; type: string; x?: number; y?: number; w?: number; h?: number; parent?: string | null; data?: Record<string, unknown> };
type PreviewEdge = { s: string; t: string };
type GraphPayload = { workId?: string; title?: string; prompt?: string; source?: string; referenceId?:string; focusNodeIds?: string[]; nodes?: PreviewNode[]; edges?: PreviewEdge[] };

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
    const handoffId = params.get("handoffId") || "";
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
            position: handoffId ? { x: 120, y: 100 + index * 300 } : { x: 120 + index * 360, y: 120 }, width: size.width, height: size.height,
            metadata: { content: uploaded.url, storageKey: uploaded.storageKey, naturalWidth: uploaded.width, naturalHeight: uploaded.height, mimeType: uploaded.mimeType, bytes: uploaded.bytes, xoiId: image.id, xoiType: image.type, xoiProjectId: image.projectId, ...(index === 0 && /^[0-9a-f-]{36}$/i.test(handoffId) ? { xoiHandoffId: handoffId } : {}) },
        });
    }
    if (handoffId) {
        const generationId = nanoid();
        nodes.push({ id: generationId, type: "image", title: "图片生成与修改", position: { x: 650, y: 140 }, width: 320, height: 240, metadata: { prompt: images[0]?.prompt || "", status: "idle" } });
        const connections = nodes.slice(0, -1).map(node => ({ id: nanoid(), fromNodeId: node.id, toNodeId: generationId }));
        useCanvasStore.getState().updateProject(projectId, { nodes: nodes as never[], connections: connections as never[], viewport: fitViewport(nodes) });
    } else useCanvasStore.getState().updateProject(projectId, { nodes: nodes as never[] });
    await navigate(`/canvas/${projectId}`);
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
    await navigate(`/canvas/${projectId}`);
}

/** Consume the outer creative-chat composer request using the upstream canvas
 * store and pending-agent protocol, so the full upstream Agent panel receives
 * exactly the same prompt, Skills, attachments and media defaults. */
export async function runUpstreamXoiHandoff(navigate: (path: string) => void) {
    const params = new URLSearchParams(location.search);
    if(params.get("source")!=="xoi"||params.get("handoff")!=="1")return;
    const handoff = takeBrowserHandoff<CanvasHandoff>(sessionStorage,assertCanvasAccount(),"canvas-prompt");
    if (!handoff) return;
    // 来路标记先于空提示词判断：即使 prompt 为空没建项目，用户从首页自己新建/打开的
    // 画布也算「从对话进来」，编辑器里照样给「回到对话」。灵感广场来的用「回到广场」。
    sessionStorage.setItem(BACK_KEY, handoff.source === "square" ? "square" : "aiAssistant");
    sessionStorage.removeItem(FROM_KEY);
    const prompt = String(handoff.prompt || "").trim();
    if (!prompt) return;
    await waitForHydration();
    assertCanvasAccount();

    const requestedTextModel = String(handoff.model || "").split("::").pop()!.replace(/^newapi:/, "");


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
        pendingAgentRequest: { prompt, assets: assets as never[], skills, requestedModel:requestedTextModel, awaitServerModels:true },
        agentConfig: {
            textModel: requestedTextModel || useUpstreamConfigStore.getState().config.textModel,
            textChannelId: useUpstreamConfigStore.getState().config.textChannelId,
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
    await navigate(`/canvas/${projectId}`);
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
export function adaptPreviewGraph(payload: GraphPayload) {
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
        if (payload.source === "director3d") {
            if (data.directorSource) metadata.directorSource = data.directorSource;
            if(data.referenceRole)metadata.referenceRole=data.referenceRole;
            if(data.previz)metadata.previz=data.previz;
            if(mappedType==="video"){if(data.durationMs)metadata.durationMs=data.durationMs;if(data.mimeType)metadata.mimeType=data.mimeType;}
            if(mappedType === "director" && payload.referenceId)metadata.directorReferenceId=payload.referenceId;
            if (mappedType === "director" && data.directorProject) { metadata.directorProject=data.directorProject;metadata.directorCover=typeof data.url==="string"?data.url:undefined; }
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
    return { nodes:normalizeWorkflowLayout(nodes), connections };
}

/** 造物画布坐标跨度可达数千像素（如 x=5180,y=7490），不设初始视口会开在空白处。
 *  按节点包围盒算一个居中铺满的视口：screen = world * k + (x, y)（与 infinite-canvas 的
 *  transform: translate(x,y) scale(k) 一致）。容器尺寸取常见工作区估值即可，误差用户一滚就有。 */
function fitViewport(nodes: LooseNode[], director=false) {
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
    if(director){const width=Math.max(640,window.innerWidth-280),height=Math.max(480,window.innerHeight);const k=Math.min(1,Math.max(.05,Math.min((width-96)/bw,(height-192)/bh)));return {k,x:width/2-(minX+maxX)/2*k,y:96-minY*k};}
    const W = 1200, H = 760, PAD = 0.88;
    const k = Math.min(Math.max(Math.min(W / bw, H / bh) * PAD, 0.05), 1);
    return { k, x: W / 2 - ((minX + maxX) / 2) * k, y: H / 2 - ((minY + maxY) / 2) * k };
}

/** 灵感广场画布作品「免费复刻同款」：还原完整工作流骨架（nodes + edges），
 *  并把作品提示词写进 Agent 面板预填，复刻后既有结构也有创作意图。 */
export async function runUpstreamXoiGraphImport(navigate: (path: string) => void) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "xoi" || !params.get("graph")) return;
    const payload = takeBrowserHandoff<GraphPayload>(sessionStorage,assertCanvasAccount(),"canvas-graph");
    if (!payload) return;
    // 与「新建直达 / 对话 handoff」的返回钮互斥，并与角景/资产的「保存并返回」链路互斥
    sessionStorage.setItem(BACK_KEY, params.get("from") || "square");
    sessionStorage.removeItem(FROM_KEY);
    history.replaceState({}, "", window.location.pathname + window.location.hash);
    const { nodes, connections } = adaptPreviewGraph(payload);
    if (!nodes.length) return;
    await waitForHydration();
    assertCanvasAccount();
    if(payload.source==='director3d'&&payload.referenceId){const existing=useCanvasStore.getState().projects.find(project=>project.nodes.some(node=>node.type==='director'&&(node.metadata as any)?.directorReferenceId===payload.referenceId));if(existing){await navigate(`/canvas/${existing.id}`);return;}}
    const projectId = useCanvasStore.getState().importProject({
        title: payload.title || "复刻画布",
        nodes: nodes as never[],
        connections: connections as never[],
        viewport: fitViewport(payload.source==='director3d'&&Array.isArray(payload.focusNodeIds)?nodes.filter(n=>payload.focusNodeIds!.includes(n.id)):nodes,payload.source==='director3d'),
    });
    const prompt = String(payload.prompt || "").trim();
    if (prompt) useCanvasStore.getState().updateProject(projectId, { pendingAgentRequest: { prompt, assets: [], skills: [] } });
    await navigate(`/canvas/${projectId}`);
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
    // 用画布自己的主题色，深色模式跟着变；旧版是 antd 默认白按钮，在画布上一眼"外来控件"。
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const back = sessionStorage.getItem(BACK_KEY) || "";
    if (!back) return null;
    const toChat = back === "aiAssistant";
    const toSquare = back === "square";
    const toDirector = back === "director3d";
    const go = () => {
        sessionStorage.removeItem(BACK_KEY);
        // 宿主 Vue 工作台是对话页 / 灵感广场（同源 iframe，沿用 app-top-nav 的回跳写法）
        const directorScene = sessionStorage.getItem("xoi_director_return_scene_v1") || "";
        const parentHash = toChat ? "#/aiAssistant" : toSquare ? "#/square" : toDirector ? `#/director3d${directorScene ? `?scene=${encodeURIComponent(directorScene)}` : ""}` : "";
        if (parentHash) {
            if (window.parent !== window) window.parent.location.hash = parentHash;
            else window.location.hash = parentHash;
        } else {
            navigate("/");
        }
    };
    const label = toChat ? "回到对话" : toSquare ? "回到广场" : toDirector ? "返回导演台" : "返回首页";
    const restingShadow = "0 2px 10px rgba(23,21,17,.06), 0 1px 2px rgba(23,21,17,.04)";
    const hoverShadow = "0 6px 18px rgba(242,100,50,.18), 0 1px 2px rgba(23,21,17,.04)";
    return (
        <div data-xoi-canvas-back className="pointer-events-auto absolute left-[76px] top-[76px] z-30">
            <button
                type="button"
                onClick={go}
                title={label}
                className="group inline-flex h-8 items-center gap-1.5 rounded-full border pl-2.5 pr-3.5 text-[13px] font-medium leading-none backdrop-blur-md transition-all duration-150 hover:-translate-y-px"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: restingShadow }}
                onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor = "rgba(245,116,0,.45)";
                    event.currentTarget.style.color = "#f57400";
                    event.currentTarget.style.boxShadow = hoverShadow;
                }}
                onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = theme.toolbar.border;
                    event.currentTarget.style.color = theme.toolbar.item;
                    event.currentTarget.style.boxShadow = restingShadow;
                }}
            >
                <ArrowLeft className="size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" strokeWidth={2.2} />
                <span>{label}</span>
            </button>
        </div>
    );
}

export function XoiCanvasReturnControls() {
    const { message } = App.useApp();
    const { id } = useParams();
    const project = useCanvasStore((state) => state.projects.find((item) => item.id === id));
    const from = sessionStorage.getItem(FROM_KEY) || "";
    const state = useMemo(() => collectResults((project?.nodes || []) as LooseNode[], (project?.connections || []) as LooseConnection[]), [project]);
    const source = (project?.nodes || []).find((node) => (node.metadata as any)?.xoiHandoffId);
    if (project && source) return <ProjectHandoffReturn projectId={project.id} handoffId={String((source.metadata as any).xoiHandoffId)} nodes={(project.nodes || []) as LooseNode[]} />;
    if (!from || !project || !state.sources.length) return null;
    const detect = () => state.missing.length ? message.warning(`还有 ${state.missing.length} 张来源图没有检测到下游结果：${state.missing.join("、")}`) : message.success(`已检测到 ${state.results.length} 张可返回结果`);
    const save = () => {
        if (state.missing.length) { detect(); return; }
        writeBrowserHandoff(sessionStorage,assertCanvasAccount(),"canvas-result",{images:state.results,timestamp:Date.now()});
        sessionStorage.removeItem(FROM_KEY);
        window.parent.location.href = `/#/${["cornerScape", "assets"].includes(from) ? from : "cornerScape"}`;
    };
    return <div data-xoi-canvas-return className="pointer-events-auto absolute left-1/2 top-4 z-[90] flex -translate-x-1/2 gap-2"><Button onClick={detect}>检测结果</Button><Button type="primary" onClick={save}>保存并返回</Button></div>;
}

function ProjectHandoffReturn({ projectId, handoffId, nodes }: { projectId: string; handoffId: string; nodes: LooseNode[] }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [chosen, setChosen] = useState("");
    const [busy, setBusy] = useState(false);
    const options = nodes.filter(node => node.type === "image" && (node.metadata?.content || node.metadata?.storageKey || node.metadata?.images?.[0]?.content || node.metadata?.images?.[0]?.storageKey));
    const send = async () => {
        const node = options.find(item => item.id === chosen);
        if (!node || busy) return;
        setBusy(true);
        try {
            await flushCanvasBeforeExit(projectId);
            const image = node.metadata?.images?.[0] || node.metadata || {};
            const dataUrl = await imageToDataUrl({ url: image.content || image.url, storageKey: image.storageKey });
            if (!dataUrl) throw new Error("无法读取所选图片，请稍后重试");
            const blob = await (await fetch(dataUrl)).blob();
            const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[blob.type];
            if (!ext || blob.size > 10 * 1024 * 1024) throw new Error("请选择不超过 10MB 的图片");
            const uploaded = await backendUploadFile(blob, ext);
            const response = await backendJson<{ data: { projectId: number; scriptId?: number; targetId: number; kind: string; conflict: boolean } }>(`/api/workspace/canvas-handoffs/${encodeURIComponent(handoffId)}/complete`, { method: "POST", json: { url: uploaded.url } });
            const result = response.data;
            message.success(result.conflict ? "项目原图已有更新，结果已保存为历史候选" : "已保存为历史候选，可回项目查看并采用");
            const target = result.kind === "storyboard" ? `/#/production?projectId=${result.projectId}&episode=${result.scriptId}&stage=frames&view=studio&canvasTarget=${result.targetId}` : `/#/cornerScape?projectId=${result.projectId}&canvasTarget=${result.targetId}`;
            if (window.parent !== window) window.parent.location.href = target; else window.location.href = target;
        } catch (error) { message.error(error instanceof Error ? error.message : "保存失败，画布内容仍保留"); }
        finally { setBusy(false); }
    };
    return <div data-xoi-canvas-return className="pointer-events-auto absolute left-1/2 top-4 z-[90] flex -translate-x-1/2 gap-2">
        <Button type="primary" onClick={() => setOpen(true)}>选择图片送回项目</Button>
        <Modal title="选择要带回的图片" open={open} onCancel={() => !busy && setOpen(false)} onOk={() => void send()} okText="保存为候选并返回" cancelText="继续编辑" confirmLoading={busy} okButtonProps={{ disabled: !chosen }}>
            <p className="text-sm text-stone-500">选择一张画布图片作为候选，当前项目图片不会自动替换。</p>
            <div className="grid max-h-[52vh] grid-cols-3 gap-3 overflow-auto">{options.map(node => <button key={node.id} type="button" onClick={() => setChosen(node.id)} className={`overflow-hidden rounded-xl border p-1 text-left ${chosen === node.id ? 'border-orange-500' : 'border-stone-200'}`}>
                {typeof node.metadata?.content === 'string' && !node.metadata.content.startsWith('server:') ? <img src={node.metadata.content} className="h-24 w-full rounded-lg object-contain bg-stone-100" /> : <div className="grid h-24 place-items-center bg-stone-100 text-xs text-stone-500">画布图片</div>}
                <span className="block truncate px-1 py-2 text-xs">{node.title || '未命名图片'}{chosen === node.id ? ' ✓' : ''}</span>
            </button>)}</div>
        </Modal>
    </div>;
}
