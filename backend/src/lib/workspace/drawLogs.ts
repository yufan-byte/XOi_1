/**
 * 绘图记录（对标造物的 mc_draw_logs）。
 *
 * 为什么要有这张表：图片是**同步**接口，上游慢的时候（gpt-image-2 实测 221 秒）
 * 一旦客户端/进程先放弃，响应就没人接了 —— 钱扣了、图找不到。有了这张账本，
 * 每次出图都能回答三个问题：提交了没、上游到底出没出、图在哪。
 *
 * 与造物的差异：造物在自己 /v1 代理里记账，所以能「反查」；我们的上游是第三方网关，
 * 拿不到对方记录，只能记自己的。但只要有这张表 + 足够长的等待窗口，
 * 超时后再回来看一眼就能确认结果，而不是两眼一抹黑。
 */
import u from "@/utils";
import { withSecuritySchemaLock } from "@/utils/securitySchema";

export type DrawStatus = "running" | "succeeded" | "failed";

let schema: Promise<unknown> | undefined;

export function ensureDrawLogs() {
  return (schema ||= withSecuritySchemaLock(u.db, async db => {
    if (await db.schema.hasTable("xoi_draw_logs")) return;
    await db.schema.createTable("xoi_draw_logs", (t) => {
      t.increments("id");
      t.string("task_id", 160).notNullable().index();
      t.bigInteger("user_id").notNullable().index();
      t.string("model", 160).notNullable();
      t.text("prompt");
      t.string("size", 32);
      t.string("status", 16).notNullable();
      t.text("url");
      t.text("error");
      t.bigInteger("started_at").notNullable();
      t.bigInteger("finished_at");
      t.index(["user_id", "started_at"]);
    });
  }).catch((e) => {
    schema = undefined;
    throw e;
  }));
}

export async function recordDrawStart(input: {
  taskId: string;
  userId: number;
  model: string;
  prompt?: string;
  size?: string;
}) {
  try {
    await ensureDrawLogs();
    await u.db("xoi_draw_logs").insert({
      task_id: input.taskId,
      user_id: input.userId,
      model: input.model,
      prompt: input.prompt ?? "",
      size: input.size ?? null,
      status: "running",
      started_at: Date.now(),
    });
  } catch (e) {
    // 记账失败不能影响出图本身
    console.warn("[draw-logs] 写入失败:", e instanceof Error ? e.message : e);
  }
}

export async function recordDrawFinish(taskId: string, status: Exclude<DrawStatus, "running">, detail: { url?: string; error?: string } = {}) {
  try {
    await ensureDrawLogs();
    await u.db("xoi_draw_logs")
      .where({ task_id: taskId, status: "running" })
      .update({
        status,
        url: detail.url ?? null,
        error: detail.error ?? null,
        finished_at: Date.now(),
      });
  } catch (e) {
    console.warn("[draw-logs] 更新失败:", e instanceof Error ? e.message : e);
  }
}
