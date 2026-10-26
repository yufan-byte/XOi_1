/** Pure, shared inventory. Reads, uploads and local editing must never be marked billable. */
export type BillableOperation = { label: string; kind: "text" | "image" | "video" | "audio"; agent?: string; multiple?: boolean };
export const billableRoutes: Record<string, BillableOperation> = {
  "/workflow/one-stop": { label: "快速创作 · 一站式制作", kind: "text", multiple: true },
  "/workflow/canvas-text": { label: "画布本轮文字规划", kind: "text", multiple: true },
  "/novel/addNovel": { label: "导入小说并分析章节", kind: "text", multiple: true },
  "/novel/event/generateEvents": { label: "分析章节事件", kind: "text", multiple: true },
  "/script/getAiRegex": { label: "AI 识别剧本规则", kind: "text" },
  "/script/extractAssets": { label: "AI 提取剧本素材", kind: "text", multiple: true },
  "/artStyle/extractStylePrompt": { label: "提取画面风格", kind: "text" },
  "/assetsGenerate/polishAssetsPrompt": { label: "优化素材提示词", kind: "text" },
  "/assetsGenerate/batchPolishAssetsPrompt": { label: "批量优化素材提示词", kind: "text", multiple: true },
  "/assetsGenerate/generateAssets": { label: "生成素材图片", kind: "image" },
  "/assetsGenerate/batchGenerateImageAssets": { label: "批量生成素材图片", kind: "image", multiple: true },
  "/assets/polishAssetsPrompt": { label: "优化素材提示词", kind: "text" },
  "/assets/generateAssets": { label: "生成素材图片", kind: "image" },
  "/cornerScape/batchBindAudio": { label: "AI 匹配角色音色", kind: "text", multiple: true },
  "/production/assets/batchGenerateAssetsImage": { label: "批量生成剧集素材", kind: "image", multiple: true },
  "/production/storyboard/batchGenerateImage": { label: "批量生成分镜图片", kind: "image", multiple: true },
  "/production/editImage/generateFlowImage": { label: "生成编辑图片", kind: "image" },
  "/production/workbench/generateVideoPrompt": { label: "生成视频提示词", kind: "text" },
  "/production/workbench/batchGeneratePrompt": { label: "批量生成视频提示词", kind: "text", multiple: true },
  "/production/workbench/generateVideo": { label: "生成镜头视频", kind: "video" },
  "/production/workbench/batchGenerateVideo": { label: "批量生成镜头视频", kind: "video", multiple: true },
  "/canvas-llm": { label: "画布 AI 对话", kind: "text" },
  "/aiAssistant/chat": { label: "参考素材 AI 分析", kind: "text", multiple: true },
  "/aiAssistant/chat/stream": { label: "参考素材 AI 分析", kind: "text", multiple: true },
  "/aiAssistant/director/plan": { label: "AI 导演方案", kind: "text" },
  "/aiAssistant/director/compose": { label: "AI 场景搭建与调整", kind: "text" },
  "/canvas-image-tasks": { label: "画布生图", kind: "image" },
  "/canvas-video": { label: "画布生成视频", kind: "video" },
  "/v1/canvas/image-tasks": { label: "画布生图", kind: "image" },
  "/v1/canvas/audio-tasks": { label: "画布生成音频", kind: "audio" },
  "/v1/chat/completions": { label: "AI 生成与分析", kind: "text" },
  "/v1/responses": { label: "AI 生成与分析", kind: "text" },
  "/v1/images/generations": { label: "生成图片", kind: "image" },
  "/v1/images/edits": { label: "AI 编辑图片", kind: "image" },
  "/v1/videos": { label: "生成视频", kind: "video" },
  "/v1/audio/speech": { label: "生成语音", kind: "audio" },
  "/v1/audio/transcriptions": { label: "识别音频", kind: "audio" },
  "/v1/audio/translations": { label: "翻译音频", kind: "audio" },
  "/setting/vendorConfig/modelTest": { label: "真实模型测试（会产生用量）", kind: "text" },
  "/setting/vendorConfig/modelTest/textTest": { label: "文字模型真实测试", kind: "text" },
  "/setting/vendorConfig/modelTest/imageTest": { label: "图片模型真实测试", kind: "image" },
  "/setting/vendorConfig/modelTest/videoTest": { label: "视频模型真实测试", kind: "video" },
  "/setting/agentDeploy/agentSetKey": { label: "AI 配置测试", kind: "text" },
};
const caseRoutes=new Map(Object.entries(billableRoutes).map(([path,operation])=>[path.toLowerCase(),operation]));
export function billableOperation(path: string, method = "POST"): BillableOperation | undefined {
  if (method.toUpperCase() !== "POST") return;
  if (/^https?:\/\//i.test(path)) { try { path = new URL(path).pathname; } catch { return; } }
  const normalized = path.split("?")[0].replace(/^\/api(?=\/)/i, "").replace(/\/$/, "");
  const socket = /^\/socket\/(aiAssistant|scriptAgent|productionAgent)$/.exec(normalized);
  if (socket) return { label: socket[1] === "scriptAgent" ? "剧本 AI 创作" : socket[1] === "productionAgent" ? "导演 AI 助手" : "智能创作", kind: "text", agent: socket[1], multiple: socket[1] !== "aiAssistant" };
  // Express routers match case-insensitively; consent matching must not be bypassable by case.
  return caseRoutes.get(normalized.toLowerCase());
}
export const BILLING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function canvasTextWorkflowPath(path:string) {
  const clean=path.split("?")[0].replace(/^\/api(?=\/)/i,"").replace(/\/$/,"").toLowerCase();
  return ["/v1/chat/completions","/v1/responses","/canvas-llm"].includes(clean);
}
