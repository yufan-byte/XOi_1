import express from "express";
import u from "@/utils";
import bcrypt from "bcryptjs";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { registerLimiter } from "@/middleware/rateLimiter";
import { produceCaptchaGate } from "@/middleware/captchaGate";
import { getClientIp } from "@/utils/getClientIp";
import { makeComboKey, releaseHolds } from "@/lib/failCounter";
import { setToken } from "./login";
import { z } from "zod";
import crypto from "crypto";
import { getPlatformPolicy } from "@/utils/platformPolicy";
import { rechargePoints } from "@/utils/points";

const router = express.Router();

async function createDisplayId(): Promise<string> {
  for (;;) {
    const displayId = String(crypto.randomInt(100000, 1000000));
    const exists = await u.db("o_user").where("display_id", displayId).first();
    if (!exists) return displayId;
  }
}

/**
 * 注册（基础频率限流 + IP 总线维度的数字图形验证码闸门 抗批量薅号）。
 *
 * 注:「用户名占用」「字符集不符」等资源冲突类拒绝非凭据泄露迹象,B1 决议下不计入 failCounter;
 * 注册侧的风控主要依靠 byIpOnly 总线于同 IP 尝试累计 ≥ IP_TOTAL_TRIG 时强制弹出验码兜底。
 */
export default router.post(
  "/",
  registerLimiter,
  produceCaptchaGate("register"),
  validateFields({
    username: z.string().min(3).max(20),
    password: z.string().min(6).max(100),
  }),
  async (req, res) => {
    const { username, password } = req.body;
    const policy = await getPlatformPolicy();
    if (!policy.registrationOpen || policy.maintenance) return res.status(403).send(error("平台暂未开放注册"));
    const trimmedUsername = username.trim();
    const clientIp = getClientIp(req);

    // 校验用户名格式（仅允许字母数字下划线中文）── 非凭据类,不计 failure
    if (!/^[a-zA-Z0-9_一-龥]+$/.test(trimmedUsername)) {
      return res.status(400).send(error("用户名只能包含字母、数字、下划线和中文"));
    }

    // 检查用户名是否已存在（不区分大小写）── 非凭据类,不计 failure
    const existing = await u.db("o_user").whereRaw("LOWER(name) = LOWER(?)", [trimmedUsername]).first();
    if (existing) {
      return res.status(400).send(error("用户名已存在"));
    }

    // 密码哈希后插入新用户
    const hashedPassword = await bcrypt.hash(password, 12);
    const displayId = await createDisplayId();
    const user = await u.db.transaction(async (trx) => {
    const duplicate = await trx("o_user").whereRaw("LOWER(name) = LOWER(?)", [trimmedUsername]).first();
    if (duplicate) return null;
    const [newId] = await trx("o_user").insert({
      name: trimmedUsername,
      password: hashedPassword,
      role: "user",
      status: "active",
      display_id: displayId,
      created_at: new Date().toISOString(),
    });
    if (policy.welcomePoints > 0) await rechargePoints(newId, policy.welcomePoints, undefined, undefined, { trx, relatedId: "welcome:" + newId });
    return trx("o_user").where("id", newId).first();
    });
    if (!user) return res.status(409).send(error("用户名已存在"));

    // 签发 token（与登录一致，24小时有效期）
    const tokenData = await u.db("o_setting").where("key", "tokenKey").first();
    if (!tokenData) return res.status(500).send(error("服务器配置错误"));

    const token = setToken(
      {
        id: user.id,
      },
      "24h",
      tokenData.value as string,
    );

    // 注册成功 ── 清解此 IP 总线持守回到基线免码状态
    releaseHolds(makeComboKey(clientIp, trimmedUsername), clientIp);

    return res.status(200).send(
      success(
        {
          token: "Bearer " + token,
          name: user.name,
          id: user.id,
          display_id: user.display_id,
          role: user.role || "user",
        },
        "注册成功",
      ),
    );
  },
);
