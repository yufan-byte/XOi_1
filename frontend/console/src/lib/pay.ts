"use client";
/**
 * 支付相关的前端公共入口（充值弹窗与招商加盟下单共用）。
 *
 * 为什么单独抽出来：`/api/user/pay` 的**收银台地址挂在响应顶层**（`{ message, data: 表单参数, url }`），
 * 而 `lib/api.ts` 的 `api()` 会把 `data` 拆出来、丢掉 `url` —— 所以不能走 api()，必须自己读整段响应体。
 * 这个坑原先只在 topup-dialog 里被绕过（见其注释），招商加盟页仍在用 api()，导致拿不到 url、
 * 一律提示「暂未开启在线支付」。这里统一到一处，两个页面共用。
 *
 * 后端侧：XOi 的 `/api/user/pay`、`/api/user/amount` 由 Express 原样代理 new-api
 * （backend/src/routes/user/pay.ts），形状与造物直连网关时一致；网关失败分支已被规整为
 * `{success:false, message: 真实原因}`，所以下面 `message === "success"` 的判定对失败体仍成立。
 */
import { ApiError, loadAuth } from "@/lib/api";

/** /api/user/pay 的几种返回：易支付给 url + 表单参数；Stripe 等给 pay_link；部分渠道直接给可扫的 qr / code_url */
export interface PayResp {
  url?: string;
  params?: Record<string, string>;
  data?: Record<string, string> | { pay_link?: string; qr_code?: string; qrcode?: string; code_url?: string; payurl?: string; url?: string };
  pay_link?: string;
  qr_code?: string;
  qrcode?: string;
  code_url?: string;
  payurl?: string;
  message?: string;
}

/** 下单后本地用于展示/轮询的订单快照 */
export interface PayOrder {
  dataUrl: string;
  scan: string;
  amount: number;
  money: number | null;
  method: string;
  url?: string;
  params?: Record<string, string>;
  startQuota: number;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** 从返回体里挑出手机扫码能打开的地址；易支付只给 POST 表单时，同一组参数用 GET 拼到 submit 地址上（标准易支付 submit.php 两种都收） */
export function pickScanUrl(r: PayResp): { scan?: string; url?: string; params?: Record<string, string> } {
  const d = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
  const direct =
    str(r.qr_code) ?? str(r.qrcode) ?? str(r.code_url) ?? str(r.payurl) ?? str(r.pay_link) ??
    str(d.qr_code) ?? str(d.qrcode) ?? str(d.code_url) ?? str(d.payurl) ?? str(d.pay_link);
  const url = str(r.url) ?? str(d.url);
  const params =
    r.params ??
    (r.data && typeof r.data === "object" && !("pay_link" in r.data) && !("url" in r.data)
      ? (r.data as Record<string, string>)
      : undefined);
  if (direct) return { scan: direct, url, params };
  if (url && params && Object.keys(params).length) {
    const u = new URL(url, location.href);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    return { scan: u.toString(), url, params };
  }
  if (url) return { scan: url, url };
  return {};
}

/** 发起下单。调用前建议先 getSelf() 一次，让 api() 顺手把快过期的 JWT 刷新掉 */
export async function requestPay(body: { amount: number; payment_method: string; top_up_code: string }): Promise<PayResp> {
  const a = loadAuth();
  if (!a) throw new ApiError(401, "未登录");
  const res = await fetch("/api/user/pay", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(a.accessToken ? { Authorization: `Bearer ${a.accessToken}` } : {}), "New-Api-User": String(a.user.id) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let r: PayResp & { success?: boolean } = {};
  try {
    r = JSON.parse(text);
  } catch {
    /* 非 JSON 按失败处理 */
  }
  if (!res.ok || r.success === false || (r.message && r.message !== "success")) {
    throw new ApiError(res.status, r.message || `HTTP ${res.status}`);
  }
  return r;
}

/** 在新窗口打开收银台（扫码遇到问题时的兜底，与跳转充值一致） */
export function openCashier(o: Pick<PayOrder, "url" | "params" | "scan">) {
  if (o.url && o.params) {
    const f = document.createElement("form");
    f.method = "POST";
    f.action = o.url;
    f.target = "_blank";
    for (const [k, v] of Object.entries(o.params)) {
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = k;
      i.value = String(v);
      f.appendChild(i);
    }
    document.body.appendChild(f);
    f.submit();
    f.remove();
  } else window.open(o.url ?? o.scan, "_blank", "noopener");
}
