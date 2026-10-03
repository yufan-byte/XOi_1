/**
 * 代理商中心的「身份范围」（仅服务端）。
 * 移植自造物引擎 src/lib/reseller/scope.ts。
 *
 *   platform —— 站长 / 管理员（new-api role ≥ 10）：看全站，并负责代理审核、提现处理；
 *   agent    —— 站长批准过的代理（mc_agents.status = approved / frozen）：只看自己的客户、收益、卡密。
 *
 * XOi 现状：代理体系已按决策 D2 接入 new-api 的 PostgreSQL（见 lib/agent/store），
 * agent 分支**已启用** —— 登录用户若不是管理员，就去 mc_agents 里找它那条记录；
 * 没有记录（或状态是 pending / rejected）返回 null，即「不能进入代理商中心」。
 */
import type { Request } from "express";
import type { NewApiUser } from "@/utils/newapi";
import { currentUser } from "./auth";
import { agentOf, type Agent } from "@/lib/agent/store";

/** agent 载荷就是完整的 Agent 记录（造物同样直接用 Agent，不做字段裁剪） */
export type { Agent as AgentStub };

export type Scope =
  | { kind: "platform"; user: NewApiUser }
  | { kind: "agent"; user: NewApiUser; agent: Agent };

export async function resolveScope(req: Request): Promise<Scope | null> {
  const user = await currentUser(req);
  if (!user) return null;
  if ((user.role ?? 0) >= 10) return { kind: "platform", user };
  try {
    const agent = await agentOf(user.id);
    if (agent && (agent.status === "approved" || agent.status === "frozen")) return { kind: "agent", user, agent };
  } catch (e) {
    // 库暂时不可用时不放行（宁可进不去，也不要按「无代理」把全站客户当自己的）
    console.error("[reseller/scope]", (e as Error).message);
  }
  return null;
}

/** 配置 / 审计的存储键：平台一份，每个代理各一份 */
export const storeKeyOf = (s: Scope) => (s.kind === "platform" ? "platform" : `agent-${s.user.id}`);
