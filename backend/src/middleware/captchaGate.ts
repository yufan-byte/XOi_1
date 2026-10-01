import type { Request, Response, NextFunction } from "express";
import { getClientIp } from "@/utils/getClientIp";
import {
  makeComboKey,
  needsCaptchaNow,
} from "@/lib/failCounter";
import { createCaptcha, verifyAndConsume } from "@/lib/captchaService";
import { needCaptcha } from "@/lib/responseFormat";

export type GateKind = "login" | "register";

/**
 * 凭据反爆破闸门 · 作为受护路由五元组链中的第三槽位(limiter 之后、validateFields 之前)。
 *
 * 单次击中的处置流:
 *  ① 由 getClientIp + body.username 合成 `${ip}|${loweredName|"__anon__"}` 组合键;
 *  ② 以 needsCaptchaNow(comboKey, ip) 判此刻是否落於「须验码」态(SOFT-HOLD 持守期内恒 true):
 *     - 否 → 直 next() 放行至 zod 校验及业务 handler;
 *     - 是 → 进一步核验请求体携带的 captchaId+captchaInput 是否匹配(answerStore 命中即删杜绝复用):
 *         · 不匹配或缺失 → 回执 HTTP 461,body.data 内顺手塞一张新鲜 svg 验证码 +
 *           requireCaptcha:true/reason 字样,使前端 catch 分支能就地拉起 UI 渲染图像无需二次往返 GET;
 *         · 匹配通过     → next() 让此次携有效码的提交继续走 zod & 业务层;
 *                         业务层的成败自决其后续命运——成功时调用 releaseHolds 归零解锄,
 *                         再次失败则 markFailure 继续累加且持守依旧生效(SOFT-HOLD 防「换号绕阈」之本意)。
 *
 * ⚠️ 本中间件严禁 throw / next(err):任何异常冒泡会被 app.ts 全局错误处理器吞成泛化 500,
 *    使风控信号丢失。故所有出口均显式 res.send/res.end 自闭合。
 */
export function produceCaptchaGate(_kind: GateKind) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const ip = getClientIp(req);
    const rawName =
      typeof req.body?.username === "string" ? req.body.username : void 0;

    const verdict = needsCaptchaNow(makeComboKey(ip, rawName), ip);
    if (!verdict.required) {
      next();
      return;
    }

    const passed = verifyAndConsume(
      req.body?.captchaId as string | undefined,
      req.body?.captchaInput as string | undefined,
    );

    if (!passed) {
      const fresh = createCaptcha();
      res.status(461).send(
        needCaptcha({
          requireCaptcha: true,
          reason: verdict.reason ?? ("FAIL_THRESHOLD" as const),
          captchaId: fresh.id,
          // svg 字符串前端 base64 内联渲染:data:image/svg+xml;base64,...
          // ⚠️ fresh.text 服务端答案绝不可出现在响应体!
          captchaSvg: fresh.svg,
          hint: "请识别图中数字并在下方输入后再提交。",
        }),
      );
      return;
    }

    // 所携码经核实有效 → 放行下游
    next();
  };
}

export default produceCaptchaGate;
