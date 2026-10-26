import express from "express";
import u from "@/utils";
import { db } from "@/utils/db";
import { DurableTasks } from "@/lib/workspace/tasks";
import { getUserCatalog } from "@/lib/model-catalog";
import { getUserGatewayCredentials } from "@/lib/gateway/newapi";
import { trackedGatewayFetch } from "@/lib/gateway/receipts";
import { getGatewayRequestContext } from "@/lib/gateway/context";
import {
  mediaQueue,
  registerMediaHandler,
} from "@/lib/workspace/mediaQueueRuntime";
import { queueRequest } from "@/lib/workspace/queueRequest";
import {
  canvasAudioRequest,
  readAudioBody,
  audioMime,
} from "@/utils/canvasAudioRequest";
const router = express.Router(),
  tasks = new DurableTasks<any>(db, "audio");
function view(id: string, task: any) {
  return {
    id,
    task_id: id,
    model: task.model,
    status: task.status === "succeeded" ? "completed" : task.status,
    error: task.error ? { message: task.error } : undefined,
    url: task.result?.url,
    audio_url: task.result?.url,
    mimeType: task.result?.mimeType,
    bytes: task.result?.bytes,
    queued_at: task.queuedAt,
    started_at: task.startedAt,
    startedAt: task.startedAt,
    created_at: task.queuedAt || task.startedAt,
    completed_at: task.completedAt,
    queue_message:
      task.status === "queued"
        ? "等待执行 · 尚未提交上游"
        : task.status === "running"
          ? "正在生成"
          : task.status === "unknown"
            ? "结果待核实，请勿重复生成"
            : undefined,
  };
}
router.post("/v1/canvas/audio-tasks", async (req: any, res) => {
  try {
    const userId = Number(req.user.id),
      request = canvasAudioRequest(req.body),
      catalog = await getUserCatalog(userId);
    if (
      !catalog.models.some(
        (m) =>
          m.modelName === request.model && m.type === "audio" && m.selectable,
      )
    )
      return res
        .status(400)
        .json({ message: "所选模型不支持已开放的语音合成，请重新选择" });
    const id = "audio_" + u.uuid();
    const job = await mediaQueue.enqueue(
      "audio",
      id,
      userId,
      getGatewayRequestContext()?.billingId || "",
      queueRequest("audio", request),
      {
        model: request.model,
        modelKey: "newapi:" + request.model,
        sourceId: req.body.sourceId,
        nodeId: req.body.nodeId,
      },
      req.body.clientTaskId,
    );
    const task = await tasks.getForUser(job.id, userId);
    res.json({ code: 0, msg: "", data: view(job.id, task) });
  } catch (error: any) {
    if (!res.headersSent)
      res.status(error.status || 400).json({ message: error.message });
  }
});
registerMediaHandler("audio", async (job) => {
  const request = job.body;
  await tasks.set(job.taskId, { status: "running", startedAt: Date.now() });
  try {
    const catalog = await getUserCatalog(job.userId);
    if (
      !catalog.models.some(
        (m) =>
          m.modelName === request.model && m.type === "audio" && m.selectable,
      )
    )
      throw new Error("排队期间模型已不可用，本次不提交上游");
    const cred = await getUserGatewayCredentials(job.userId);
    const response = await trackedGatewayFetch(cred.baseUrl + "/audio/speech", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cred.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(180000),
    });
    const bytes = await readAudioBody(response),
      path =
        "/canvas/audio/" +
        job.userId +
        "/" +
        job.taskId +
        "." +
        request.response_format;
    await u.oss.writeFile(path, bytes);
    await tasks.set(job.taskId, {
      status: "succeeded",
      completedAt: Date.now(),
      result: {
        url: await u.oss.getFileUrl(path),
        mimeType: audioMime[request.response_format as keyof typeof audioMime],
        bytes: bytes.length,
      },
    });
  } catch (error: any) {
    await tasks.set(job.taskId, {
      status: /超时|timeout|network|ECONN/i.test(error.message)
        ? "unknown"
        : "failed",
      error: error.message,
      completedAt: Date.now(),
    });
  }
});
router.get("/v1/canvas/audio-tasks/:id", async (req: any, res) => {
  const task = await tasks.getForUser(
    String(req.params.id),
    Number(req.user.id),
  );
  if (!task)
    return res
      .status(404)
      .json({ code: 404, msg: "音频任务不存在", data: null });
  if (task.recoveryRequired || task.status === "unknown")
    return res.status(409).json({
      message: "音频任务结果待核实，请勿重复生成",
      recoveryRequired: true,
    });
  res.json({ code: 0, msg: "", data: view(String(req.params.id), task) });
});
export default router;
