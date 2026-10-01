import express from "express";
import { success } from "@/lib/responseFormat";
import { createCaptcha } from "@/lib/captchaService";

const router = express.Router();

/**
 * 公开取码端点 · GET /api/login/captcha
 * ------------------------------------------------------------
 * 供前端「换一张」刷新钮于处于需验码态时主动拉取新鲜数字 SVG 验证码;
 * 无须鉴权(app.ts 匿名 JWT 白名单显式放行本路径),
 * 响应走标准 success 外壳,data 仅含 {id, svg} 两键 ── 服务端答案 text 绝不可外流。
 */
export default router.get("/", (_req, res) => {
  const fresh = createCaptcha();
  res.status(200).send(
    success(
      {
        id: fresh.id,
        svg: fresh.svg,
      },
      "ok",
    ),
  );
});
