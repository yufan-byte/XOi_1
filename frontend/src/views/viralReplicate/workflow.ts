import { yuanToPoints } from "../../utils/points";
import { canUnderstandImages, canUseReferenceImages, referenceImageLimit } from "../../utils/modelCapabilities";

export type JobState = "idle" | "submitting" | "pending" | "done" | "failed" | "unknown";
export interface ReplicateShot {
  id: string; no: number; seconds: number; scene: string; camera: string; copy: string;
  frame?: string; board?: string; clip?: string; status: string; error?: string;
  boardState?: JobState; videoState?: JobState; taskId?: string; taskModel?: string;
  ttsTaskId?: string; ttsUrl?: string;
}
export interface WorkflowModel {
  modelName: string; type: string; name?: string; capabilities?: string[];
  mode?: string[]; enums?: Record<string, any[]>; defaults?: Record<string, any>;
  referenceLimits?: { images?: number }; paramSchema?: Record<string, any>;
}
export function modelName(value: string) { return value.replace(/^newapi:/, ""); }
export function videoSettings(model?: WorkflowModel) {
  return {
    durations: (model?.enums?.duration || model?.enums?.seconds || []).map(Number).filter(v => Number.isFinite(v) && v > 0),
    resolutions: (model?.enums?.resolution || []).map(String),
    ratios: (model?.enums?.aspect_ratio || []).map(String),
  };
}
export function supportsVision(model: WorkflowModel) {
  return canUnderstandImages(model);
}
export function supportsReference(model: WorkflowModel) {
  return canUseReferenceImages(model);
}
export function validateImageReferences(model: WorkflowModel | undefined, count: number) {
  if (!model || model.type !== "image" || !supportsReference(model)) throw new Error("请选择支持参考图的图片模型");
  const limit = referenceImageLimit(model);
  if (limit && count > limit) throw new Error(`当前图片模型最多支持 ${limit} 张参考图，请换用支持多图的模型`);
}
export function normalizeShots(rows: unknown, fallback: number, durations: number[] = [], id = () => crypto.randomUUID()): ReplicateShot[] {
  if (!Array.isArray(rows) || !rows.length || rows.length > 8) throw new Error("请返回 1–8 个有效镜头");
  return rows.map((row, index) => {
    if (!row || typeof row.scene !== "string" || !row.scene.trim()) throw new Error(`镜头 ${index + 1} 缺少画面描述`);
    const seconds = Number(row.seconds) > 0 && Number.isFinite(Number(row.seconds)) ? Number(row.seconds) : fallback;
    const choices = durations.length ? durations : [fallback];
    const snapped = [...choices].sort((a, b) => Math.abs(a - seconds) - Math.abs(b - seconds))[0];
    return { id: id(), no: index + 1, seconds: snapped, scene: row.scene.slice(0, 3000), camera: String(row.camera || "固定镜头").slice(0, 1000), copy: String(row.copy || "").slice(0, 2000), status: "待生成", boardState: "idle", videoState: "idle" };
  });
}
export function restoreShots(shots: ReplicateShot[]) {
  return shots.map(s => ({ ...s,
    boardState: s.boardState === "submitting" ? "unknown" as const : s.boardState,
    videoState: s.videoState === "submitting" ? (s.taskId ? "pending" as const : "unknown" as const) : s.videoState,
    status: s.clip ? "视频完成" : s.taskId ? "待查询任务" : [s.boardState, s.videoState].includes("submitting") ? "提交结果待确认" : s.status,
  }));
}
export function validateVideo(model: WorkflowModel | undefined, shot: ReplicateShot, resolution: string, ratio: string) {
  if (!model || model.type !== "video") throw new Error("请选择可用的视频模型");
  const settings = videoSettings(model);
  if (!settings.durations.length || !settings.resolutions.length || !settings.ratios.length) throw new Error("该模型的时长、清晰度或比例资料不完整，请换用已确认规格的模型");
  if (!settings.durations.includes(Number(shot.seconds)) || !settings.resolutions.includes(resolution) || !settings.ratios.includes(ratio)) throw new Error(`镜头 ${shot.no} 的时长、清晰度或比例不受当前模型支持`);
  if (!shot.board) throw new Error(`镜头 ${shot.no} 尚未生成故事板`);
  if (!supportsReference(model)) throw new Error("当前视频模型不支持参考图，请换用图生视频模型");
  if (/^seedance2\.[05]-(line1(?:-fast)?|full(?:-fast)?)$/.test(model.modelName) && !/^https?:\/\//i.test(shot.board)) throw new Error(`镜头 ${shot.no} 的故事板不是公网地址，请先上传对象存储；本次不会提交`);
}
export function boardCandidates(shots: ReplicateShot[]) { return shots.filter(s => !s.board && !["unknown", "submitting"].includes(s.boardState || "")); }
export function videoCandidates(shots: ReplicateShot[]) { return shots.filter(s => !s.clip && !s.taskId && !["unknown", "submitting"].includes(s.videoState || "")); }
export function apiMessage(error: any): string {
  return String(error?.response?.data?.message || error?.response?.data?.error || error?.message || error?.msg || error?.error?.message || error?.error || "请求失败，请稍后查询任务状态");
}
export type WorkflowApi = { post(path: string, body: any, config?: any): Promise<any>; get(path: string, config?: any): Promise<any> };
type Checkpoint = () => Promise<void>;
function unwrap(response: any) { return response?.data || response; }
function failedDefinitely(error: any) {
  const status = Number(error?.response?.status || error?.status);
  // A timeout, disconnect or 5xx may happen after upstream accepted the job.
  return status >= 400 && status < 500 && ![408, 429].includes(status);
}
export async function submitBoard(shot: ReplicateShot, body: any, api: WorkflowApi, checkpoint: Checkpoint) {
  if (shot.board) return;
  if (["submitting", "unknown"].includes(shot.boardState || "")) throw new Error("上次提交结果未确认，不自动重发，请先核对任务与账单");
  shot.boardState = "submitting"; shot.status = "生成故事板"; shot.error = "";
  await checkpoint(); // Persist intent before a possibly billable request.
  try {
    const response = await api.post("/v1/images/generations", body);
    const image = response?.data?.[0];
    const url = image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : response?.url);
    if (!url) throw new Error("未返回故事板，请核对任务结果，不自动重发");
    shot.board = url; shot.boardState = "done"; shot.status = "故事板完成";
  } catch (error) {
    shot.boardState = failedDefinitely(error) ? "failed" : "unknown";
    shot.error = apiMessage(error); shot.status = shot.boardState === "unknown" ? "提交结果待确认" : "故事板失败";
    throw error;
  } finally { await checkpoint(); }
}
export async function submitVideo(shot: ReplicateShot, body: any, api: WorkflowApi, checkpoint: Checkpoint) {
  if (shot.clip || shot.taskId) return;
  if (["submitting", "unknown"].includes(shot.videoState || "")) throw new Error("上次提交结果未确认，不自动重发，请先核对任务与账单");
  shot.videoState = "submitting"; shot.status = "提交视频"; shot.error = "";
  await checkpoint();
  try {
    const data = unwrap(await api.post("/v1/videos", body));
    const id = data?.id || data?.task_id;
    if (data?.url) { shot.clip = data.url; shot.videoState = "done"; shot.status = "视频完成"; }
    else if (id) { shot.taskId = String(id); shot.taskModel = body.model; shot.videoState = "pending"; shot.status = "视频生成中"; }
    else throw new Error("未返回任务编号，请核对任务结果，不自动重发");
  } catch (error) {
    shot.videoState = failedDefinitely(error) ? "failed" : "unknown";
    shot.error = apiMessage(error); shot.status = shot.videoState === "unknown" ? "提交结果待确认" : "视频提交失败";
    throw error;
  } finally { await checkpoint(); }
}
export async function pollVideoOnce(shot: ReplicateShot, api: WorkflowApi, checkpoint: Checkpoint) {
  if (shot.clip || !shot.taskId) return;
  try {
    const data = unwrap(await api.get(`/v1/videos/${encodeURIComponent(shot.taskId)}`, { params: { model: modelName(shot.taskModel || "") } }));
    const status = String(data?.status || "").toLowerCase();
    const url = data?.url || data?.video_url || data?.output?.url || data?.content?.url;
    if (["completed", "succeeded", "success"].includes(status) && !url) throw new Error("任务已完成，但尚未返回可下载地址，请稍后查询");
    if (url) { shot.clip = url; shot.videoState = "done"; shot.status = "视频完成"; shot.error = ""; }
    else if (["failed", "error", "cancelled"].includes(status)) {
      shot.videoState = "failed"; shot.status = "视频生成失败"; shot.error = apiMessage({ error: data.error || data.message });
      shot.taskId = undefined; // Only a known terminal failure allows an explicit, newly quoted retry.
    } else { shot.videoState = "pending"; shot.status = "视频生成中"; shot.error = ""; }
  } catch (error) {
    shot.error = apiMessage(error); shot.status = "暂未查到结果 · 可继续查询";
    // Keep taskId even on 404/restart. Never silently resubmit a possibly paid job.
    throw error;
  } finally { await checkpoint(); }
}
export interface QuoteLine { label: string; model: string; params: Record<string, any> }
export function generationQuoteLines(stage: "boards" | "videos", shots: ReplicateShot[], model: string, resolution: string): QuoteLine[] {
  return (stage === "boards" ? boardCandidates(shots) : videoCandidates(shots)).map(s => ({
    label: `镜头 ${s.no}`, model: modelName(model), params: stage === "boards" ? { n: 1 } : { seconds: s.seconds, resolution, hasReferenceVideo: false },
  }));
}
export function sumQuotes(quotes: { yuan: number }[]) {
  if (!quotes.length || quotes.some(q => !Number.isFinite(q.yuan) || q.yuan < 0)) throw new Error("暂无可靠报价，不能开始生成");
  const yuan = Math.round(quotes.reduce((sum, q) => sum + q.yuan, 0) * 1e10) / 1e10;
  return { yuan, points: Math.round(yuanToPoints(yuan) * 1e10) / 1e10 };
}
