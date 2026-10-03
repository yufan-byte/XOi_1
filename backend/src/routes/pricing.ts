/**
 * 模型价格表 —— 造物那边这个端点由 new-api 直接提供（`/api/pricing`），前端 getPricing()
 * 是**不带鉴权头**的裸 fetch，所以这里必须做成公开只读端点。
 *
 * 为什么由 XOi 后端代取（而不是让控制台直连网关）：
 *   · 同源：控制台不发跨域请求，也没有第二个 baseURL 要维护；
 *   · 站点级单一令牌：服务端 → 网关一律用管理员令牌，客户端永远不持有网关凭据；
 *   · 网关地址（NEWAPI_BASE_URL）与令牌都只存在于后端进程环境里。
 *
 * 返回体原样透传（`{ data, group_ratio, usable_group, auto_groups, vendors, ... }`）——
 * 控制台的 lib/models.ts#buildCatalog 就是按这套字段解析的，少一个字段模型列表就会空。
 *
 * 挂载路径：/api/pricing，且**必须挂在全局 XOi JWT 中间件之前**（它不能被要求登录）。
 */
import express from "express";
import axios from "axios";

const router = express.Router();

const baseURL = () => (process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000").trim().replace(/\/+$/, "");
const adminToken = () => (process.env.NEWAPI_ADMIN_TOKEN || "").trim();
const timeoutMs = () => {
  const n = Number(process.env.NEWAPI_TIMEOUT_MS || 15000);
  return Number.isFinite(n) && n > 0 ? n : 15000;
};

/** 进程内短缓存：价格表在网关侧是按 pricing_version 变化的，10 秒足够挡掉页面切换的重复拉取 */
let cache: { at: number; body: unknown } | null = null;
const TTL_MS = 10_000;

router.get("/", async (_req, res) => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    res.setHeader("cache-control", "public, max-age=10");
    return res.json(cache.body);
  }
  try {
    const r = await axios.request({
      url: `${baseURL()}/api/pricing`,
      method: "GET",
      timeout: timeoutMs(),
      validateStatus: () => true,
      headers: {
        "Content-Type": "application/json",
        // 网关这个端点本身允许匿名，仍带管理员令牌是为了不受「站点关闭公开价格」类开关影响
        ...(adminToken() ? { Authorization: `Bearer ${adminToken()}` } : {}),
      },
    });
    if (r.status < 200 || r.status >= 300) {
      return res.status(502).json({ success: false, message: `网关价格表读取失败（HTTP ${r.status}）` });
    }
    cache = { at: Date.now(), body: r.data };
    res.setHeader("cache-control", "public, max-age=10");
    res.json(r.data);
  } catch (e) {
    console.error("[pricing] 网关不可用:", (e as Error).message);
    res.status(502).json({ success: false, message: "网关暂时不可用，请稍后重试" });
  }
});

export default router;
