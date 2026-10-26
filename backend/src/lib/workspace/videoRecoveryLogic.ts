import { isAllowedMedia } from "../../utils/mediaSecurity";
import type { DurableTask, DurableTasks } from "./tasks";

interface RecoveryIO {
  getCredentials(userId: number): Promise<{ baseUrl: string; apiKey: string }>;
  get(url: string, config: any): Promise<any>;
  writeFile(path: string, buffer: Buffer): Promise<void>;
}
const unwrap = (response: any) => response.data?.data || response.data;
export function createVideoRecovery(io: RecoveryIO) {
  const inFlight = new Map<string, Promise<DurableTask>>();
  return async function recover<T extends DurableTask>(tasks: DurableTasks<T>, id: string, userId: number): Promise<T | undefined> {
    const task = await tasks.getForUser(id, userId);
    if (!task || ["succeeded", "failed"].includes(task.status)) return task;
    if (!task.recoveryRequired && task.status !== "unknown") return task;
    if (!task.upstreamId || !task.modelKey?.startsWith("newapi:")) throw Object.assign(new Error("任务结果待核实：尚无可恢复的上游任务编号，请勿重复生成"), { status: 409 });
    const key = `${userId}:${id}`;
    let recovery = inFlight.get(key);
    if (!recovery) {
      recovery = (async () => {
        const credentials = await io.getCredentials(userId);
        const root = credentials.baseUrl.replace(/\/+$/, ""), remote = encodeURIComponent(task.upstreamId!);
        const headers = { Authorization: `Bearer ${credentials.apiKey}` };
        // Deliberately GET only: no path exists here to submit or resubmit a paid task.
        const state = unwrap(await io.get(`${root}/videos/${remote}`, { headers, timeout: 15000 }));
        if (["failed", "cancelled", "canceled"].includes(String(state?.status).toLowerCase())) {
          const failed = { ...task, status: "failed", recoveryRequired: false, error: String(state.error?.message || state.message || "上游任务失败") };
          await tasks.set(id, failed as T); return failed;
        }
        if (!["completed", "succeeded"].includes(String(state?.status).toLowerCase())) return { ...task, status: "running", recoveryRequired: true };
        const content = await io.get(`${root}/videos/${remote}/content`, { headers, responseType: "arraybuffer", timeout: 120000, maxContentLength: 128 * 1024 * 1024 });
        const buffer = Buffer.from(content.data);
        if (!isAllowedMedia(buffer, "mp4")) throw new Error("上游成片暂不可用，请稍后查询");
        if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error("无效的本地任务编号");
        const file = `/canvas/video/${userId}/recovered-${id}.mp4`;
        await io.writeFile(file, buffer);
        const succeeded = { ...task, status: "succeeded", recoveryRequired: false, error: "", result: { status: "succeeded", url: `/oss${file}`, videos: [{ url: `/oss${file}` }] } };
        await tasks.set(id, succeeded as T); return succeeded;
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, recovery);
    }
    return await recovery as T;
  };
}
