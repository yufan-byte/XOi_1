import express from "express";
import { requireAdmin } from "@/middleware/requireAdmin";
import { success, error } from "@/lib/responseFormat";
import { diskSummary } from "@/utils/storageGuard";
import { formatBytes, getTotalUsage, platformUsage, setQuota, topUsage } from "@/utils/storageUsage";
import { lastSweepReport, runStorageSweep, TTL_DAYS } from "@/lib/workspace/storageSweep";
import { breakerSnapshot } from "@/utils/upstreamBreaker";
import { db } from "@/utils/db";

const router = express.Router();
router.use(requireAdmin);

/**
 * 存储与生成队列总览。
 *
 * 只读 + 两个显式动作（手动扫一轮、调某人配额）。运维需要的三个数在这里：
 * 盘还剩多少、谁在占盘、队列积压到什么程度。
 */
router.get("/overview", async (_req, res) => {
  try {
    const [disk, scopes, top, queueStates, leases] = await Promise.all([
      diskSummary(),
      platformUsage(),
      topUsage(10),
      db("xoi_media_queue").select("state").count({ count: "id" }).groupBy("state"),
      db("xoi_model_leases").where("expires_at", ">", Date.now()).count({ count: "id" }).first(),
    ]);

    const queue: Record<string, number> = {};
    for (const row of queueStates as any[]) queue[String(row.state)] = Number(row.count ?? 0);

    res.setHeader("Cache-Control", "private, no-store");
    return res.send(
      success({
        disk: {
          ...disk,
          freeText: formatBytes(disk.freeBytes),
          totalText: formatBytes(disk.totalBytes),
        },
        storage: {
          byScope: scopes.map((s: any) => ({ ...s, bytesText: formatBytes(s.bytes) })),
          topUsers: top.map((u: any) => ({ ...u, bytesText: formatBytes(u.bytes) })),
        },
        queue: {
          states: queue,
          waiting: (queue.queued ?? 0) + (queue.pending ?? 0),
          running: queue.running ?? 0,
        },
        upstream: {
          activeModelRequests: Number(leases?.count ?? 0),
          openBreakers: breakerSnapshot(),
        },
        sweep: {
          ttlDays: TTL_DAYS,
          last: lastSweepReport() ?? null,
        },
      }),
    );
  } catch {
    return res.status(503).send(error("存储总览暂不可用"));
  }
});

/** 手动跑一轮回收。是否真删仍由 XOI_STORAGE_SWEEP_DELETE 决定，避免误操作。 */
router.post("/sweep", async (_req, res) => {
  try {
    const report = await runStorageSweep();
    return res.send(success({ ...report, freedText: formatBytes(report.freedBytes) }));
  } catch (e) {
    return res.status(500).send(error((e as Error).message || "回收任务执行失败"));
  }
});

/** 某个账号的详细用量（按域拆开） */
router.get("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).send(error("账号无效"));
  try {
    const usage = await getTotalUsage(id);
    const scopes = Object.entries(usage.byScope).map(([scope, value]) => ({
      scope,
      ...(value as object),
      bytesText: formatBytes((value as any).bytes),
    }));
    return res.send(
      success({
        userId: id,
        totalBytes: usage.bytes,
        totalText: formatBytes(usage.bytes),
        quotaBytes: usage.quotaBytes,
        quotaText: formatBytes(usage.quotaBytes),
        fileCount: usage.fileCount,
        scopes,
      }),
    );
  } catch {
    return res.status(503).send(error("用量暂不可用"));
  }
});

/** 调整某人的 canvas 域配额（0 表示不允许再上传） */
router.post("/quota", async (req, res) => {
  const userId = Number(req.body?.userId);
  // 0 是合法配额（禁止再上传），不能用 boundedInteger 的 >0 语义
  const quotaBytes = Number(req.body?.quotaBytes);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).send(error("账号无效"));
  if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 0) return res.status(400).send(error("配额无效"));
  try {
    await setQuota(userId, quotaBytes);
    return res.send(success({ userId, quotaBytes, quotaText: formatBytes(quotaBytes) }));
  } catch {
    return res.status(503).send(error("配额调整失败"));
  }
});

export default router;
