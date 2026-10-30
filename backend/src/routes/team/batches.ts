/**
 * GET /api/team/batches            —— 最近批量下发批次（只有元信息，无任何密码）
 * GET /api/team/batches/export     —— 下载账号清单 Excel（**必须重新做一次安全验证**）
 *
 * 安全设计（对应「等级最高」）：
 *  · 明文密码在服务端 AES-256-GCM 暂存，TTL 默认 30 分钟后物理删除；
 *  · 导出接口要求 `X-Xoi-Sudo` 令牌——即使刚刚才批量创建过，下载时仍要再验一次；
 *    （令牌 10 分钟内复用，避免连续导出时的重复打扰）
 *  · 每次下载都写团队审计日志（member.add 之外的 batch.export 动作见日志）；
 *  · 单个批次最多可下载 5 次，超了就只能逐个重置，降低清单被无限传播的风险；
 *  · 响应强制 `no-store` + 附件下载，避免被代理/浏览器缓存。
 */
import express, { type Response } from "express";
import ExcelJS from "exceljs";
import { claimBatchCredentials, listBatches, BatchSummary } from "@/lib/team/batchStore";
import { batchExportQuery } from "@/lib/team/inputs";
import { requireSudo, SudoError } from "@/lib/team/sudo";
import { TeamError, teamForOwner } from "@/lib/team/store";
import { recordTeamAudit } from "@/lib/team/managementRuntime";

const router = express.Router();
const uid = (req: express.Request) => Number((req as express.Request & { user?: { id?: number } }).user?.id || 0);

function fail(res: Response, error: unknown) {
  if (error instanceof TeamError) return res.status(error.status).json({ success: false, message: error.message });
  if (error instanceof SudoError) return res.status(error.status).json({ success: false, message: error.message });
  console.error("[team/batches]", error);
  return res.status(500).json({ success: false, message: "导出失败，请稍后重试" });
}

const PERIOD_TEXT: Record<string, string> = { day: "每日", month: "每月", total: "累计" };
const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "团队";

router.get("/", async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  res.setHeader("Cache-Control", "no-store");
  try {
    const requested = Number(req.query.teamId);
    const items: BatchSummary[] = await listBatches(userId, Number.isSafeInteger(requested) && requested > 0 ? requested : undefined);
    return res.json({ success: true, data: { items } });
  } catch (error) {
    return fail(res, error);
  }
});

router.get("/export", async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  try {
    const parsed = batchExportQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || "导出参数无效" });

    // 导出属于高敏感动作：必须持有有效 sudo 令牌（10 分钟内有效）
    await requireSudo(req.headers["x-xoi-sudo"], userId);

    // 换团队也取不到：teamForOwner 会校验这条 teamId 真的属于当前账号
    const team = await teamForOwner(parsed.data.teamId, userId);
    const claimed = await claimBatchCredentials(parsed.data.batchId, userId, team.id);
    if (!claimed) {
      return res.status(410).json({ success: false, message: "该批次已过期或下载次数用尽，请逐个重置成员密码" });
    }

    await recordTeamAudit(userId, "batch.export", undefined, {
      batchId: parsed.data.batchId, teamId: team.id, rows: claimed.rows.length, downloadNo: claimed.downloads,
    }).catch(() => undefined);

    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = `${safeName(team.name)}-账号清单-${stamp}`;

    if (parsed.data.format === "csv") {
      // CSV 走 UTF-8 BOM，Excel 双击不乱码
      const rows = [["登录账号", "初始密码", "成员昵称", "消费额度(积分)", "额度周期", "说明"]];
      for (const row of claimed.rows) {
        rows.push([row.username, row.password, row.nickname, String(row.limitQuota || "不限"), PERIOD_TEXT[row.period] ?? row.period, "首次登录会强制修改密码"]);
      }
      const csv = rows.map((cells) => cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}.csv`)}`);
      res.setHeader("Cache-Control", "no-store");
      return res.send(`\uFEFF${csv}`);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "XOI STUDIO 团队管理";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("账号密码");
    sheet.columns = [
      { header: "登录账号", width: 20 }, { header: "初始密码", width: 20 }, { header: "成员昵称", width: 22 },
      { header: "消费额度(积分)", width: 16 }, { header: "额度周期", width: 10 }, { header: "说明", width: 40 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: "middle" };
    for (const row of claimed.rows) {
      sheet.addRow([row.username, row.password, row.nickname, row.limitQuota || "不限", PERIOD_TEXT[row.period] ?? row.period, "首次登录会强制修改密码"]);
    }
    // 密码列用等宽字体，避免 0/O、1/l 看错
    sheet.getColumn(2).font = { name: "Menlo", size: 11 };
    sheet.getColumn(1).font = { name: "Menlo", size: 11 };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}.xlsx`)}`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    return res.end(Buffer.from(buffer));
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
