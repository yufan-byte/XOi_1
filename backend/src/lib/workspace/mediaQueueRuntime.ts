import { db } from "@/utils/db";
import { MediaQueue, type MediaJob, type MediaKind } from "./mediaQueue";
import { taskWorkerId } from "./tasks";
import { capacityValue } from "@/utils/modelConcurrency";
import { runWithGatewayUser } from "@/lib/gateway/context";
import { assertCurrentBudgetOpen } from "@/lib/gateway/budgets";
import { completeMediaBudgets } from "./budgetCompletion";
import {releaseLifecycle} from "@/utils/releaseLifecycle";
import {executionWindow} from './mediaTiming';
const queue = new MediaQueue(db, taskWorkerId, {
  waitingGlobal: capacityValue("XOI_MEDIA_QUEUE_GLOBAL_LIMIT", 128, 1000),
  waitingUser: capacityValue("XOI_MEDIA_QUEUE_USER_LIMIT", 8, 50),
  // Do not eagerly start more media jobs than the downstream model limiter admits.
  // Text requests still share that limiter; saturation remains a safe explicit failure.
  runningGlobal: Math.min(
    capacityValue("XOI_MEDIA_GLOBAL_CONCURRENCY", 64, 2000),
    capacityValue("XOI_MODEL_GLOBAL_CONCURRENCY", 32, 2000),
  ),
  runningUser: Math.min(
    capacityValue("XOI_MEDIA_USER_CONCURRENCY", 6, 50),
    capacityValue("XOI_MODEL_USER_CONCURRENCY", 3, 20),
  ),
});
export const mediaQueue = queue;
const handlers = new Map<MediaKind, (job: MediaJob) => Promise<void>>();
const active = new Map<string, AbortController>();
let timer: ReturnType<typeof setInterval> | undefined,
  ticking = false,
  claiming = false,
  stopping = false,
  paused = false;
const workers = capacityValue("XOI_MEDIA_WORKERS", 4, 16);
let lastHealthyTick = 0;
let lastBudgetSweep = 0;
export function mediaQueueReady() {
  return Boolean(timer) && !stopping && Date.now() - lastHealthyTick < 30000;
}
export function registerMediaHandler(
  kind: MediaKind,
  handler: (job: MediaJob) => Promise<void>,
) {
  handlers.set(kind, handler);
}
async function execute(job: MediaJob) {
  const controller = new AbortController();
  active.set(job.taskId, controller);
  const heartbeat = setInterval(() => {
    void queue
      .heartbeat(job)
      .then((ok) => {
        if (!ok) controller.abort();
      })
      .catch((e) => {
        console.error("[media-queue] 租约续期失败", e.message);
        controller.abort();
      });
  }, 15000);
  heartbeat.unref();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const execution = runWithGatewayUser(
      job.userId,
      async () => {
        await assertCurrentBudgetOpen();
        if (controller.signal.aborted) throw new Error("任务已停止");
        const user = await db("users")
          .where({ id: job.userId, status: 1 })
          .whereNull("deleted_at")
          .first();
        if (!user) throw new Error("账号已禁用，本任务不提交上游");
        await handlers.get(job.kind)!(job);
      },
      job.billingId,
      { ...job, signal: controller.signal },
    );
    await Promise.race([
      execution,
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          controller.abort();
          reject(
            new Error(
              "执行超时，已停止后续调用；已提交任务结果待核实，请勿重复生成",
            ),
          );
        }, executionWindow(job.kind,job.body));
        deadline.unref();
      }),
    ]);
    await queue.finish(job);
  } catch (e: any) {
    if (!stopping)
      await queue
        .finish(job, e.message)
        .catch((error) =>
          console.error("[media-queue] 保存异常状态失败", error.message),
        );
  } finally {
    if (deadline) clearTimeout(deadline);
    clearInterval(heartbeat);
    active.delete(job.taskId);
    if (!stopping)
      await completeMediaBudgets(db, job.userId, job.billingId).catch((e) =>
        console.error("[media-queue] 结束授权暂未写入，保留原预算", e.message),
      );
  }
}
async function tick() {
  if (ticking || stopping) return;
  ticking = true;
  try {
    await queue.recover();
    if (Date.now() - lastBudgetSweep > 15000) {
      await completeMediaBudgets(db);
      lastBudgetSweep = Date.now();
    }
    while (!stopping && !paused && active.size < workers) {
      claiming=true;
      try{
        const job = await queue.claim([...handlers.keys()]);
        if (!job) break;
        // execute registers active ownership synchronously before claim-in-flight clears.
        void execute(job);
      }finally{claiming=false;}
    }
    lastHealthyTick = Date.now();
  } catch (e: any) {
    console.error("[media-queue] 本轮调度失败，任务仍由数据库保留", e.message);
  } finally {
    ticking = false;
  }
}
export async function startMediaQueue() {
  await queue.ensure();
  if (timer) return;
  stopping = false;
  paused=releaseLifecycle.isDraining();
  lastHealthyTick = Date.now();
  timer = setInterval(() => void tick(), 1000);
  timer.unref();
  void tick();
}
export function stopMediaQueue() {
  stopping = true;
  if (timer) clearInterval(timer);
  timer = undefined;
  for (const controller of active.values()) controller.abort();
}
/** Planned rollout: no new claims, but active jobs keep their lease heartbeats and settlement. */
export function pauseMediaQueue(){paused=true;}
export function resumeMediaQueue(){if(!stopping)paused=false;}
export function mediaQueueActivity(){return {media:active.size,claiming};}
export async function runQueuedRoute(
  handler: (req: any, res: any) => Promise<void>,
  job: MediaJob,
) {
  let status = 200,
    body: any;
  const response: any = {
    headersSent: false,
    status(code: number) {
      status = code;
      return this;
    },
    json(value: any) {
      body = value;
      this.headersSent = true;
      return this;
    },
  };
  await handler(
    { user: { id: job.userId }, body: job.body, __mediaJob: job },
    response,
  );
  if (status >= 400)
    throw new Error(
      body?.error || body?.message || "排队任务校验未通过，未提交上游",
    );
}
