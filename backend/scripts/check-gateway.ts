/**
 * 网关（new-api）连通性自检
 * =====================================================================
 * 用 XOi 自己的 `@/utils/newapi` 客户端打真实请求，确认：
 *   1. 网关可达（/api/status）
 *   2. NEWAPI_ADMIN_TOKEN 有效（/api/user/self，带 New-Api-User 头）
 *   3. 管理员接口可用（分页用户列表）
 *   4. 登录返回结构与造物一致（含 access_token）
 *
 * 不花钱、不写数据：只读接口 + 一个必然失败的登录探测。
 *
 * 用法：cd backend && npx tsx scripts/check-gateway.ts
 *
 * ⚠️ 导入顺序：先 `@/utils` 再 `@/utils/*`（见 scripts/check-db.ts 顶部说明）。
 * =====================================================================
 */
import "@/env";
import u from "@/utils";
import { probeContract, newApiSelfByAdmin, adminListUsers, assertConfigured } from "@/utils/newapi";

async function main() {
    console.log("网关地址：", process.env.NEWAPI_BASE_URL || "(默认 http://127.0.0.1:3000)");

    console.log("\n[1/4] 契约探测（/api/status + 一个不存在的用户登录，不产生数据）");
    const report = await probeContract();
    console.log("  可达：", report.reachable);
    console.log("  登录返回结构：", report.loginShape ?? "(未取到)");
    for (const n of report.notes) console.log("  ·", n);

    console.log("\n[2/4] 管理员令牌");
    try {
        assertConfigured();
        console.log("  NEWAPI_ADMIN_TOKEN 已配置");
    } catch (e) {
        console.log("  ✗", e instanceof Error ? e.message : e);
        process.exit(1);
    }

    console.log("\n[3/4] 以管理员身份读自己（/api/user/self + New-Api-User）");
    const me = await newApiSelfByAdmin(1);
    console.log(`  id=${me.id} username=${me.username} role=${me.role} group=${me.group} quota=${me.quota}`);

    console.log("\n[4/4] 管理员用户列表（/api/user/）");
    const { items, total } = await adminListUsers({ pageSize: 5 });
    console.log(`  总数 ${total}，本页 ${items.length}：${items.map((x) => x.username ?? x.id).join(", ")}`);

    console.log("\n✓ 网关自检通过");
}

main().catch((e) => {
    console.error("✗ 网关自检失败：");
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
