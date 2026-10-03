/**
 * GET /api/log/self        —— 当前用户的消费明细（网关 logs 表）
 * GET /api/log/self/stat   —— 当前用户的用量统计（quota / rpm / tpm）
 *
 * 为什么需要：控制台的「消费记录」弹窗（shell/dialogs/usage-dialog.tsx）按**网关语义**请求
 * `/api/log/self` 与 `/api/log/self/stat`，而 XOi 后端此前没有这两个端点 → 弹窗永远空白
 * （并且它底部的「查看完整日志」链到 console 里不存在的 /logs，是死链）。
 *
 * 安全：这是**只读**代理，服务端用管理员令牌 + `New-Api-User: <当前用户>` 反查自己的日志，
 * 不会把任何子令牌发到浏览器（与「站点级单一令牌」一致；对比 `/api/token/*` 那种签发子令牌的
 * 端点，仍然坚持不代理 —— 见 routes/user/self.ts 的说明）。
 *
 * 挂载：core.ts 扫描 routes/log/self.ts 生成 `/api/log/self`（"log" 已加入 ROUTE_WHITELIST），
 * 内部再挂 "/" 与 "/stat" 两个子路径。
 */
import express from "express";
import { backendRaw, currentUser } from "@/lib/reseller/auth";
import { error } from "@/lib/responseFormat";
import { boundedInteger, queryText } from "@/utils/adminQuery";

const router = express.Router();

router.get("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).send(error("请先登录"));

  const page = boundedInteger(req.query.p, 0, 100000);
  const size = boundedInteger(req.query.page_size, 20, 100);
  const type = queryText(req.query.type);
  const q = `p=${page}&page_size=${size}${type ? `&type=${encodeURIComponent(type)}` : ""}`;
  try {
    const { status, body } = await backendRaw(req, `/api/log/self?${q}`);
    res.status(status).send(body);
  } catch (e) {
    res.status(502).send(error(`消费记录加载失败：${(e as Error).message}`));
  }
});

router.get("/stat", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).send(error("请先登录"));
  try {
    const { status, body } = await backendRaw(req, "/api/log/self/stat");
    res.status(status).send(body);
  } catch (e) {
    res.status(502).send(error(`用量统计加载失败：${(e as Error).message}`));
  }
});

export default router;
