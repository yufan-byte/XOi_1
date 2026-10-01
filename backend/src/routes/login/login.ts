import express from "express";
import u from "@/utils";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { loginLimiter } from "@/middleware/rateLimiter";
import { produceCaptchaGate } from "@/middleware/captchaGate";
import { getClientIp } from "@/utils/getClientIp";
import { makeComboKey, markFailure, releaseHolds } from "@/lib/failCounter";
import { z } from "zod";

const router = express.Router();

export function setToken(payload: string | object, expiresIn: string | number, secret: string): string {
  if (!payload || typeof secret !== "string" || !secret) {
    throw new Error("参数不合法");
  }
  return (jwt.sign as any)(payload, secret, { expiresIn });
}

// 登录（基础频率限流 + 凭据失败次数触发的数字图形验证码闸门 双保险防爆破）
export default router.post(
  "/",
  loginLimiter,
  produceCaptchaGate("login"),
  // 登录场仅做空值／超长(payload 防 DoS)防护，绝不卡内容格式正则：
  //   错误密码可能是任意形态（短至 1 位、纯符号、半截复制粘贴…）；此处若套 min(N)/charset 规则会
  //   把本应判作「凭据不符」的尝试提前拦截在校验层并回弹通用「参数错误」（见 middleware.validateFields 兜底）,
  //   既误导用户又向爆破者泄露后端阈值口径。一切真伪裁定交给下面 bcrypt.compare 统一以「用户名或密码错误」回应。
  validateFields({
    username: z.string().min(1).max(50),
    password: z.string().min(1).max(100),
  }),
  async (req, res) => {
    const { username, password } = req.body;
    const trimmedUsername = username.trim();
    const clientIp = getClientIp(req);

    // 不区分大小写查询用户名
    const data = await u.db("o_user").whereRaw("LOWER(name) = LOWER(?)", [trimmedUsername]).first();
    if (!data) {
      markFailure(makeComboKey(clientIp, trimmedUsername), clientIp);
      return res.status(400).send(error("用户名或密码错误"));
    }

    // 仅支持 bcrypt 哈希密码（明文密码已在迁移中转换）── 数据异常视为系统故障不计凭据失败
    if (!data!.password || !data!.password.startsWith("$2")) {
      return res.status(400).send(error("账号密码格式异常，请联系管理员"));
    }
    const passwordMatch = await bcrypt.compare(password, data!.password);

    if (passwordMatch) {
      // 检查用户是否被封禁 ── 密码已对不算凭据失败故不调 markFailure
      if (data!.status === "banned") {
        return res.status(403).send(error("账号已被封禁"));
      }

      const tokenData = await u.db("o_setting").where("key", "tokenKey").first();
      if (!tokenData) return res.status(400).send(error("未找到tokenKey"));
      const token = setToken(
        {
          id: data!.id,
          session_version: (data as any).session_version ?? 0,
        },
        "24h",
        tokenData?.value as string,
      );

      // 登录成功 ── 解除对该账号/IP 的风控软持有令其回归基线免码常态
      releaseHolds(makeComboKey(clientIp, trimmedUsername), clientIp);

      return res.status(200).send(success({ token: "Bearer " + token, name: data!.name, id: data!.id, display_id: data!.display_id, role: data!.role || "user" }, "登录成功"));
    } else {
      // 凭据不符累加失败计数;越过阈值后下次提交即由 captchaGate 强制弹码(SOFT-HOLD)
      markFailure(makeComboKey(clientIp, trimmedUsername), clientIp);
      return res.status(400).send(error("用户名或密码错误"));
    }
  },
);
