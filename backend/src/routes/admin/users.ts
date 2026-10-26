/**
 * 平台管理 · 用户管理（管理员的第一个核心职责）
 *
 * 真源在网关（new-api 的 users 表），本仓库不镜像写：列表/搜索走 `adminListUsers`
 * （管理员令牌），停用/启用走 `adminSetUserStatus`（同为管理员令牌）。XOi 的
 * routes/setting/userManage 旧树 operate 的是本仓库镜像且未挂载，不要复活它 —— 管账号
 * 一律以网关为准。
 *
 * 挂载：/api/admin/users（app.ts 里 /api/admin 已统一套 requireAdmin，role ≥ 10）
 *   GET  /         ?keyword=&page=&page_size=   分页 + 关键词（用户名）搜索
 *   POST /manage   { id, action: "enable" | "disable" }
 *
 * 与「额度发放 /api/admin/credits」的分工：这里是账号生命周期（停用/启用），
 * 动钱一律去额度发放页（那里有原因必填 + 审计流水）。
 */
import express from "express";
import { adminListUsers, adminSetUserStatus, NewApiError } from "@/utils/newapi";
import { success, error } from "@/lib/responseFormat";
import { boundedInteger, queryText } from "@/utils/adminQuery";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const page = boundedInteger(req.query.page, 1, 100000);
    const pageSize = boundedInteger(req.query.page_size, 20, 100);
    const keyword = queryText(req.query.keyword);
    const { items, total } = await adminListUsers({ page, pageSize, keyword: keyword || undefined });
    res.json(success({ items, total }));
  } catch (e) {
    if (e instanceof NewApiError) return res.status(502).json(error(`网关用户列表读取失败：${e.message}`));
    res.status(500).json(error(`用户列表读取失败：${(e as Error).message}`));
  }
});

router.post("/manage", async (req, res) => {
  const id = Number(req.body?.id);
  const action = String(req.body?.action ?? "");
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json(error("缺少有效的用户 ID"));
  if (action !== "enable" && action !== "disable") return res.status(400).json(error("action 仅支持 enable / disable"));
  try {
    await adminSetUserStatus(id, action === "enable");
    res.json(success({ id, enabled: action === "enable" }));
  } catch (e) {
    if (e instanceof NewApiError) return res.status(502).json(error(`网关操作失败：${e.message}`));
    res.status(500).json(error(`操作失败：${(e as Error).message}`));
  }
});

export default router;
