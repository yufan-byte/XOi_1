/**
 * new-api 管理接口的服务端聚合工具（代理商中心 = 站点管理员；客户 = 全部非管理员用户）。
 * 移植自造物引擎 src/app/api/reseller/_shared/newapi.ts，适配 Express 与 XOi 的 new-api 客户端。
 */
import type { Request } from "express";
import type { Response } from "express";
import { backend } from "./auth";
import type { Scope } from "./scope";
import { customerLogs, customersOf } from "@/lib/agent/store";

export interface NUser { id: number; username: string; display_name: string; email: string; role: number; status: number; quota: number; used_quota: number; request_count: number; group: string; aff_code: string; aff_count: number; inviter_id: number; created_at: number; last_login_at: number }
export interface NLog { id: number; user_id: number; created_at: number; type: number; content: string; username: string; token_name: string; model_name: string; quota: number; prompt_tokens: number; completion_tokens: number; use_time: number; is_stream: boolean; channel_name?: string }
interface Page<T> { page: number; page_size: number; total: number; items: T[] }

const PAGE = 100;
/** new-api 站内 "$" 即人民币（客户 1:1 充值），不做汇率换算 —— 与造物 / XOi 双方口径一致 */
export const QUOTA_PER_UNIT = 500000;
export const USD_TO_CNY = 1;
export const toCny = (quota: number) => (quota / QUOTA_PER_UNIT) * USD_TO_CNY;
export const fromCny = (cny: number) => Math.round((cny / USD_TO_CNY) * QUOTA_PER_UNIT);
export const shareOf = (markupPct: number) => (markupPct > 0 ? markupPct / (100 + markupPct) : 0);

async function paged<T>(req: Request, path: string, maxPages: number): Promise<T[]> {
  const out: T[] = [];
  for (let p = 1; p <= maxPages; p++) {
    const sep = path.includes("?") ? "&" : "?";
    const d = await backend<Page<T>>(req, `${path}${sep}p=${p}&page_size=${PAGE}`);
    const items = d?.items ?? []; out.push(...items);
    if (items.length < PAGE) break;
  }
  return out;
}
export const allUsers = (req: Request) => paged<NUser>(req, "/api/user/", 20);
export const isCustomer = (u: NUser) => u.role < 10;
/** 日志：type 1 充值 / 2 消费 / 0 全部；时间戳为秒 */
export function fetchLogs(req: Request, q: { type: number; start?: number; end?: number; username?: string }, maxPages = 30) {
  const sp = new URLSearchParams({ type: String(q.type) });
  if (q.start) sp.set("start_timestamp", String(Math.floor(q.start)));
  if (q.end) sp.set("end_timestamp", String(Math.ceil(q.end)));
  if (q.username) sp.set("username", q.username);
  return paged<NLog>(req, `/api/log/?${sp.toString()}`, maxPages);
}
/** 充值日志的额度：新版 new-api 写在 quota 字段，旧版只在 content 里（"＄1.000000 额度" / "500000 点额度"） */
export function topupQuota(l: NLog) {
  if (l.quota > 0) return l.quota;
  const m = /[$＄]\s*([\d.]+)/.exec(l.content ?? ""); if (m) return Math.round(Number(m[1]) * QUOTA_PER_UNIT);
  const n = /([\d,]+)\s*点?额度/.exec(l.content ?? ""); if (n) return Number(n[1].replace(/,/g, ""));
  return 0;
}
export const forbidden = (res: Response) => res.status(403).json({ success: false, message: "forbidden" });
/** 原始报错可能带数据库 / 网关内部信息：只记服务端日志，给前端通用文案 */
export const failed = (res: Response, e: unknown) => { console.error("[reseller]", e); return res.status(502).json({ success: false, message: "数据加载失败，请稍后重试" }); };

// ---------- 按身份范围取数 ----------
// platform = 全站非管理员，直接走 new-api 管理接口；
// agent    = 只看自己名下的客户 / 只算绑定之后的日志，直接查库（同库，决策 D2 —— 见 lib/agent/store）。

export async function scopedUsers(req: Request, scope: Scope): Promise<NUser[]> {
  if (scope.kind === "platform") return (await allUsers(req)).filter(isCustomer);
  return (await customersOf(scope.agent.userId)) as unknown as NUser[];
}
/** 日志：平台走 new-api 管理接口（调用方再按客户过滤）；代理直接查库，只含绑定之后的记录 */
export async function scopedLogs(req: Request, scope: Scope, q: { type: number; start?: number; end?: number; username?: string; userId?: number }, maxPages = 30): Promise<NLog[]> {
  if (scope.kind === "platform") return fetchLogs(req, q, maxPages);
  // username 在代理视角无意义（查询按 userId 归属过滤），传了也忽略
  return (await customerLogs(scope.agent.userId, { ...q, limit: maxPages * PAGE })) as unknown as NLog[];
}
/** 加价占比：平台用站长后台的加价率，代理用自己的 */
export const scopeShare = (scope: Scope, platformMarkup: number) => shareOf(scope.kind === "agent" ? scope.agent.markupPct : platformMarkup);
