/**
 * 代理体系自检（直连 new-api 的 PostgreSQL + 真调网关）
 * =====================================================================
 * 用途：不依赖 HTTP 登录（XOi JWT / 验证码），直接把移植过来的 agent-store
 * 跑一遍完整链路，确认「造物 → XOi」这次移植真的可用。覆盖：
 *
 *   建号 → 申请 → 站长批准（写网关 GroupGroupRatio）→ 绑客户（改 users.group）
 *        → 调价（倍率随之重算）→ 报价系数 → 卡密（扣代理钱包 + 真调网关生成）
 *        → 收益 / 可提余额 → 非法状态流转被挡
 *
 * 为什么值得单独做一个脚本：这 4 张 mc_* 表 + 420 行逻辑是**跨库跨服务**的
 * （表在 new-api 的库里、倍率要写网关的 options、卡密要调网关的兑换码接口），
 * 只做类型检查完全覆盖不到；而挂在 CI 里跑一次的成本只有两次建号 + 一次删号。
 *
 * 用法：cd backend && npx tsx scripts/check-agent.ts
 *
 * 副作用（全部会还原）：建两个 e2e 账号、写 mc_* 表、改网关 GroupGroupRatio、
 * 生成两张兑换码；结束时删号删码并把 GroupGroupRatio 还原成跑之前的值。
 * 前置：new-api 可达且 NEWAPI_ADMIN_TOKEN 已配置；NEWAPI_DATABASE_URL 指向它的库。
 * =====================================================================
 */
import "@/env"; // dotenv/config —— 服务端是靠 app.ts 顶部这句加载 .env 的

import { adminApi, getOptions, putOption } from "@/lib/agent/newapi-admin";
import { db } from "@/lib/agent/db";
import {
  applyAgent, agentOf, reviewAgent, setMarkup, priceFactorOf, bindCustomer,
  customersOf, codesOf, createCodes, balanceOf, backfillCardCustomers, agentGroup, ensureAgentTables,
} from "@/lib/agent/store";

const AGENT_NAME = "e2eagent";
const CUST_NAME = "e2ecust";
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  —— " + extra : ""}`); };

async function findUid(username: string): Promise<number> {
  const r = await db()!.query<{ id: number }>("SELECT id FROM users WHERE username = $1", [username]);
  return Number(r.rows[0]?.id ?? 0);
}
async function mkUser(username: string): Promise<number> {
  const exist = await findUid(username);
  if (exist) return exist;
  await adminApi("/api/user/", { method: "POST", body: { username, password: "E2eTest12345", display_name: username } });
  return findUid(username);
}

async function cleanup(uids: number[], originalGgr: string): Promise<void> {
  const pool = db()!;
  await pool.query("DELETE FROM mc_agent_customers WHERE user_id = ANY($1::int[]) OR agent_id = ANY($1::int[])", [uids]);
  await pool.query("DELETE FROM mc_agent_codes WHERE agent_id = ANY($1::int[])", [uids]);
  await pool.query("DELETE FROM mc_agent_withdrawals WHERE agent_id = ANY($1::int[])", [uids]);
  await pool.query("DELETE FROM mc_agents WHERE user_id = ANY($1::int[])", [uids]);
  // 卡密本体（redemptions）也删掉，保持库干净
  await pool.query("DELETE FROM redemptions WHERE name LIKE 'E2E%'");
  for (const id of uids) {
    await adminApi("/api/user/manage", { method: "POST", body: { id, action: "delete" } }).catch(async () => {
      await pool.query("DELETE FROM users WHERE id = $1", [id]).catch(() => {});
    });
  }
  // GroupGroupRatio 还原成跑之前的样子
  await putOption("GroupGroupRatio", originalGgr);
  console.log("\n[清理] 测试账号 / mc_* 记录 / 兑换码已删除，GroupGroupRatio 已还原");
}

async function main(): Promise<void> {
  await ensureAgentTables();
  const originalGgr = (await getOptions()).GroupGroupRatio ?? "{}";

  const agentUid = await mkUser(AGENT_NAME);
  const custUid = await mkUser(CUST_NAME);
  check("两个测试账号就位", agentUid > 0 && custUid > 0, `agent=${agentUid} customer=${custUid}`);

  // ---- 1. 申请 ----
  const applied = await applyAgent(agentUid, { name: "E2E 代理", contact: "e2e@test.local", reason: "自动化自检" });
  check("applyAgent 写入 pending", applied.status === "pending", `status=${applied.status}`);

  // ---- 2. 审核批准 → 应分配邀请码并写网关 ----
  const approved = await reviewAgent(agentUid, "approve", 1, "自检批准");
  check("reviewAgent 批准并分配邀请码", approved.status === "approved" && !!approved.inviteCode, `code=${approved.inviteCode}`);
  const ggr1 = JSON.parse((await getOptions()).GroupGroupRatio ?? "{}") as Record<string, Record<string, number>>;
  check("网关 GroupGroupRatio 已写入 agt_<id> 分组", !!ggr1[agentGroup(agentUid)], JSON.stringify(ggr1[agentGroup(agentUid)] ?? {}));

  // ---- 3. 绑客户 → users.group 应改为 agt_<agentId> ----
  const bound = await bindCustomer(custUid, agentUid, "invite");
  const grp = await db()!.query<{ group: string }>(`SELECT "group" FROM users WHERE id = $1`, [custUid]);
  check("bindCustomer 建立归属并改分组", bound && String(grp.rows[0]?.group) === agentGroup(agentUid), `group=${grp.rows[0]?.group}`);

  const cs = await customersOf(agentUid);
  check("customersOf 能查到该客户", cs.some((c) => c.id === custUid && c.source === "invite"), `共 ${cs.length} 人`);

  // ---- 4. 调价 → 报价系数 ----
  const a2 = (await agentOf(agentUid))!;
  const marked = await setMarkup(a2, 20);
  check("setMarkup 写入 20%", marked.markupPct === 20);
  const ggr2 = JSON.parse((await getOptions()).GroupGroupRatio ?? "{}") as Record<string, Record<string, number>>;
  check("网关倍率按 1.2 倍重算", Math.abs((ggr2[agentGroup(agentUid)]?.default ?? 0) - 1.2) < 1e-6, `default=${ggr2[agentGroup(agentUid)]?.default}`);
  const factor = await priceFactorOf(custUid);
  check("priceFactorOf 返回 1.2", Math.abs(factor - 1.2) < 1e-9, `factor=${factor}`);

  // ---- 5. 卡密：给代理钱包充值 → 生成 → 扣款 ----
  // 注意：new-api 默认关闭兑换码，要站长在它后台**亲自确认合规条款**
  // （option: payment_setting.compliance_confirmed）才放行。这是个合规勾选，
  // 本脚本不代替站长勾；撞到闸门时只断言「已扣的钱全额退回」，成功路径留待开启后再验。
  await db()!.query("UPDATE users SET quota = $2 WHERE id = $1", [agentUid, 5_000_000]);
  const a3 = (await agentOf(agentUid))!;
  let gate = "";
  try {
    const keys = await createCodes(a3, 500_000, 2, "E2E卡密", 30);
    check("createCodes 返回 2 个明文 key", keys.length === 2 && keys.every((k) => !!k), keys.join(","));
  } catch (e) {
    gate = (e as Error).message ?? "";
    if (!/compliance|合规|disabled/i.test(gate)) throw e;
  }
  const after = await db()!.query<{ quota: string }>("SELECT quota FROM users WHERE id = $1", [agentUid]);
  if (gate) {
    check("网关合规闸门拒绝时，已扣的卡密款全额退回", Number(after.rows[0].quota) === 5_000_000, `quota=${after.rows[0].quota}`);
    console.log("  ↳ 提示：兑换码功能未开启（需站长在 new-api 后台确认合规条款），卡密成功路径本次未验证");
  } else {
    check("代理钱包按面值扣款（5,000,000 − 1,000,000）", Number(after.rows[0].quota) === 4_000_000, `quota=${after.rows[0].quota}`);
    const codeRows = await codesOf(agentUid);
    check("codesOf 能列出刚生成的卡密", codeRows.length >= 2, `共 ${codeRows.length} 条`);
  }

  // ---- 6. 收益 / 余额（无消费日志 → 0，只验证不报错）----
  const bal = await balanceOf(a3);
  check("balanceOf 可算（无消费 → 收益 0，可提 0）", bal.income === 0 && bal.available === 0, JSON.stringify(bal));

  const backfilled = await backfillCardCustomers();
  check("backfillCardCustomers 可跑（未兑换 → 0）", backfilled === 0, `bound=${backfilled}`);

  // ---- 7. 非法状态流转应被业务规则挡住 ----
  let rejected = "";
  try { await reviewAgent(agentUid, "reject", 1); } catch (e) { rejected = (e as Error).message; }
  check("拒绝非法状态流转（reject 只能对 pending）", rejected.includes("只能驳回待审核"), rejected);

  await cleanup([agentUid, custUid], originalGgr);
  console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("自检异常：", e); process.exit(1); });
