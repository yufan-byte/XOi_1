import crypto from "node:crypto";
import type { Knex } from "knex";
import { withSecuritySchemaLock } from "@/utils/securitySchema";
import { BILLING_ID_PATTERN } from "../../../../shared/billableOperations";

export type MediaKind = "image" | "video" | "audio" | "one-stop";
export interface MediaJob {
  kind: MediaKind;
  taskId: string;
  userId: number;
  billingId: string;
  body: Record<string, any>;
  leaseToken: string;
  workerId: string;
}
export interface QueueLimits {
  waitingGlobal: number;
  waitingUser: number;
  runningGlobal: number;
  runningUser: number;
  waitMs: number;
  leaseMs: number;
  maxBytes: number;
}
export const DEFAULT_QUEUE_LIMITS: QueueLimits = {
  waitingGlobal: 128,
  waitingUser: 8,
  runningGlobal: 64,
  runningUser: 6,
  waitMs: 10 * 60_000,
  leaseMs: 90_000,
  maxBytes: 8 * 1024 * 1024,
};
const terminal = new Set(["succeeded", "failed", "cancelled"]);
export const queueError = (message: string, status = 409) =>
  Object.assign(new Error(message), { status });

/** Committed waiting jobs + fenced worker leases. Never replay an ambiguous upstream POST. */
export class MediaQueue {
  private schema?: Promise<unknown>;
  readonly limits: QueueLimits;
  constructor(
    private db: Knex,
    readonly workerId: string = crypto.randomUUID(),
    limits: Partial<QueueLimits> = {},
    private now = () => Date.now(),
  ) {
    this.limits = { ...DEFAULT_QUEUE_LIMITS, ...limits };
  }
  ensure() {
    return (this.schema ||= withSecuritySchemaLock(this.db, async (trx) => {
      if (!(await trx.schema.hasTable("xoi_media_queue")))
        await trx.schema.createTable("xoi_media_queue", (t) => {
          t.increments("id");
          t.string("kind", 16).notNullable();
          t.string("task_id", 160).notNullable();
          t.bigInteger("user_id").notNullable();
          t.string("billing_id", 36).notNullable();
          t.string("state", 20).notNullable();
          t.text("request").notNullable();
          t.string("request_hash", 64).notNullable();
          t.string("client_id", 160);
          t.bigInteger("created_at").notNullable();
          t.bigInteger("expires_at").notNullable();
          t.bigInteger("lease_until");
          t.bigInteger("heartbeat_at");
          t.string("lease_token", 36);
          t.string("worker_id", 64);
          t.bigInteger("dispatch_started_at");
          t.text("error");
          t.unique(["kind", "task_id"]);
          t.unique(["user_id", "kind", "client_id"]);
          t.index(["state", "created_at"]);
          t.index(["user_id", "state"]);
          t.index(["user_id", "billing_id"]);
        });
    }).catch((e) => {
      this.schema = undefined;
      throw e;
    }));
  }
  private async lock(trx: Knex.Transaction) {
    if (this.db.client.config.client === "pg")
      await trx.raw(
        "select pg_advisory_xact_lock(hashtext('xoi:media-task-capacity'))",
      );
  }
  private task(trx: Knex | Knex.Transaction, row: any) {
    return trx("xoi_generation_tasks").where({
      kind: row.kind,
      task_id: row.task_id,
      user_id: row.user_id,
    });
  }
  private async state(
    trx: Knex.Transaction,
    row: any,
    status: string,
    error?: string,
  ) {
    const task = await this.task(trx, row).forUpdate().first();
    if (!task) return;
    if (terminal.has(task.status)) return;
    const payload = {
      ...JSON.parse(task.payload),
      status,
      ...(error ? { error } : {}),
      ...(status === "queued" ? { recoveryRequired: false } : {}),
      ...(terminal.has(status) ? { completedAt: this.now() } : {}),
    };
    await this.task(trx, row).update({
      status,
      updated_at: this.now(),
      worker_id: status === "queued" ? "queue" : row.worker_id || "queue",
      payload: JSON.stringify(payload),
    });
  }
  async enqueue(
    kind: MediaKind,
    taskId: string,
    userId: number,
    billingId: string,
    body: Record<string, any>,
    payload: Record<string, any>,
    clientId?: string,
  ) {
    if (
      !["image", "video", "audio", "one-stop"].includes(kind) ||
      !Number.isSafeInteger(userId) ||
      userId < 1 ||
      !BILLING_ID_PATTERN.test(billingId) ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(taskId)
    )
      throw queueError("任务身份或预算无效", 400);
    if (clientId && !/^[a-zA-Z0-9_-]{1,160}$/.test(clientId))
      throw queueError("客户端任务编号无效", 400);
    const request = JSON.stringify(body);
    if (Buffer.byteLength(request) > this.limits.maxBytes)
      throw queueError(
        "排队素材过大，请先上传素材并使用地址，单任务参数最多 8MB",
        413,
      );
    const hash = crypto.createHash("sha256").update(request).digest("hex");
    await this.ensure();
    return this.db.transaction(async (trx) => {
      await this.lock(trx);
      // 幂等键 = 客户端任务编号 + 请求参数指纹：参数完全相同（网络重试）才复用旧任务；
      // 参数变了（画布上改了提示词/模型再点一次生成）走新任务，不再 409。
      // 表上有 (user_id, kind, client_id) 唯一索引，所以把指纹拼进 client_id 区分不同尝试。
      const clientKey = clientId ? `${clientId.slice(0, 120)}#${hash.slice(0, 16)}` : null;
      if (clientKey) {
        const old = await trx("xoi_media_queue")
          .where({ user_id: userId, kind, client_id: clientKey })
          .first();
        if (old) return { id: old.task_id, status: old.state, reused: true };
      }
      const waiting = () => trx("xoi_media_queue").where("state", "queued");
      const [global, user] = await Promise.all([
        waiting().count("id as count").first(),
        waiting().where("user_id", userId).count("id as count").first(),
      ]);
      if (
        Number(global?.count) >= this.limits.waitingGlobal ||
        Number(user?.count) >= this.limits.waitingUser
      )
        throw queueError(
          "等待队列已满，本次未提交上游，请等待现有任务完成",
          429,
        );
      const now = this.now();
      await trx("xoi_generation_tasks")
        .insert({
          task_id: taskId,
          user_id: userId,
          kind,
          worker_id: "queue",
          updated_at: now,
          status: "queued",
          payload: JSON.stringify({
            ...payload,
            status: "queued",
            queuedAt: now,
            billingId,
            queueManaged: true,
          }),
        })
        .returning("id");
      await trx("xoi_media_queue")
        .insert({
          kind,
          task_id: taskId,
          user_id: userId,
          billing_id: billingId,
          state: "queued",
          request,
          request_hash: hash,
          client_id: clientKey,
          created_at: now,
          expires_at: now + this.limits.waitMs,
        })
        .returning("id");
      return { id: taskId, status: "queued", reused: false };
    });
  }
  async recover() {
    await this.ensure();
    return this.db.transaction(async (trx) => {
      await this.lock(trx);
      const now = this.now();
      const rows = await trx("xoi_media_queue")
        .where((q) =>
          q
            .where((b) =>
              b.where("state", "queued").where("expires_at", "<=", now),
            )
            .orWhere((b) =>
              b.where("state", "running").where("lease_until", "<=", now),
            ),
        )
        .forUpdate();
      for (const row of rows) {
        const task = await this.task(trx, row).first();
        if (task && terminal.has(task.status)) {
          await trx("xoi_media_queue")
            .where("id", row.id)
            .update({ state: task.status, request: "{}" });
          continue;
        }
        const uncertain =
          row.dispatch_started_at !== null &&
          row.dispatch_started_at !== undefined;
        // Time passing cannot prove that an upstream request was free or failed.
        const state = uncertain
            ? "unknown"
            : Number(row.expires_at) <= now
              ? "cancelled"
              : "queued";
        const error = uncertain
            ? "执行中断，任务已尝试提交上游，结果待核实；请查询原任务，勿重复生成"
            : state === "cancelled"
              ? "排队超时，任务未提交上游，请重新确认后再试"
              : undefined;
        await trx("xoi_media_queue")
          .where("id", row.id)
          .update({
            state,
            error: error || null,
            lease_until: null,
            ...(state === "queued"
              ? { lease_token: null, worker_id: null }
              : { request: "{}" }),
          });
        await this.state(trx, row, state, error);
      }
      return rows.length;
    });
  }
  async claim(kinds: MediaKind[]): Promise<MediaJob | undefined> {
    await this.ensure();
    return this.db.transaction(async (trx) => {
      await this.lock(trx);
      const now = this.now();
      const active = () =>
        trx("xoi_generation_tasks")
          .whereIn("status", ["running", "unknown"])
          .where("updated_at", ">", now - 45 * 60_000);
      if (
        Number((await active().count("id as count").first())?.count) >=
        this.limits.runningGlobal
      )
        return;
      const candidates = await trx("xoi_media_queue")
        .where("state", "queued")
        .whereIn("kind", kinds)
        .where("expires_at", ">", now)
        .orderBy("created_at", "asc")
        .orderBy("id", "asc")
        .limit(this.limits.waitingGlobal)
        .forUpdate();
      for (const row of candidates) {
        if (
          Number(
            (
              await active()
                .where("user_id", row.user_id)
                .count("id as count")
                .first()
            )?.count,
          ) >= this.limits.runningUser
        )
          continue;
        const token = crypto.randomUUID();
        await trx("xoi_media_queue")
          .where("id", row.id)
          .update({
            state: "running",
            worker_id: this.workerId,
            lease_token: token,
            heartbeat_at: now,
            lease_until: now + this.limits.leaseMs,
          });
        await this.state(trx, { ...row, worker_id: this.workerId }, "running");
        return {
          kind: row.kind,
          taskId: row.task_id,
          userId: Number(row.user_id),
          billingId: row.billing_id,
          body: JSON.parse(row.request),
          leaseToken: token,
          workerId: this.workerId,
        };
      }
    });
  }
  private owned(job: MediaJob) {
    return this.db("xoi_media_queue")
      .where({
        kind: job.kind,
        task_id: job.taskId,
        user_id: job.userId,
        worker_id: job.workerId,
        lease_token: job.leaseToken,
        state: "running",
      })
      .where("lease_until", ">", this.now());
  }
  async heartbeat(job: MediaJob) {
    return !!(await this.owned(job).update({
      heartbeat_at: this.now(),
      lease_until: this.now() + this.limits.leaseMs,
    }));
  }
  async markDispatch(job: MediaJob) {
    const updated = await this.owned(job)
      .whereNull("dispatch_started_at")
      .update({ dispatch_started_at: this.now() });
    if (!updated) {
      const row = await this.owned(job).first();
      if (!row || row.dispatch_started_at == null)
        throw queueError("任务已取消或执行租约失效，未继续提交上游");
    }
  }
  async finish(job: MediaJob, error?: string) {
    return this.db.transaction(async (trx) => {
      const row = await trx("xoi_media_queue")
        .where({
          kind: job.kind,
          task_id: job.taskId,
          user_id: job.userId,
          lease_token: job.leaseToken,
          state: "running",
        })
        .forUpdate()
        .first();
      if (!row || Number(row.lease_until) <= this.now()) return false;
      const task = await this.task(trx, row).first();
      const status = terminal.has(task?.status)
        ? task.status
        : task?.status === "unknown" || row.dispatch_started_at !== null
          ? "unknown"
          : "failed";
      await trx("xoi_media_queue")
        .where("id", row.id)
        .update({
          state: status,
          lease_until: null,
          request: "{}",
          error: error || null,
        });
      if (!terminal.has(task?.status))
        await this.state(
          trx,
          row,
          status,
          error || "任务执行未完成；结果待核实，请勿重复生成",
        );
      return true;
    });
  }
  async cancel(userId: number, kind: string, taskId: string) {
    await this.ensure();
    return this.db.transaction(async (trx) => {
      await this.lock(trx);
      const row = await trx("xoi_media_queue")
        .where({ user_id: userId, kind, task_id: taskId })
        .forUpdate()
        .first();
      if (!row) throw queueError("任务不存在", 404);
      if (row.state === "cancelled") return { billingId: row.billing_id };
      if (
        !["queued", "running"].includes(row.state) ||
        row.dispatch_started_at !== null
      )
        throw queueError(
          "任务已尝试提交上游或已结束，不能当作未扣费任务取消；请查询原任务及积分明细",
        );
      await trx("xoi_media_queue")
        .where("id", row.id)
        .update({
          state: "cancelled",
          request: "{}",
          lease_until: null,
          error: "用户取消，任务未提交上游",
        });
      await this.state(trx, row, "cancelled", "用户取消，任务未提交上游");
      return { billingId: row.billing_id };
    });
  }
  async cancelBudget(userId: number, billingId: string) {
    await this.ensure();
    const rows = await this.db("xoi_media_queue")
      .where({ user_id: userId, billing_id: billingId })
      .whereIn("state", ["queued", "running"])
      .whereNull("dispatch_started_at")
      .select("kind", "task_id");
    for (const row of rows)
      await this.cancel(userId, row.kind, row.task_id).catch(() => {});
  }
}
