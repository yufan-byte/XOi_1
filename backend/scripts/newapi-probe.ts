/**
 * new-api 契约探测（不花钱、不写数据）
 * =====================================================================
 * 用法：
 *    cd backend && NEWAPI_BASE_URL=http://127.0.0.1:3000 yarn tsx scripts/newapi-probe.ts
 *
 * 它会打印：
 *   · 网关是否可达、版本信息
 *   · 登录失败响应的 data 结构（用来判断是 JWT 版还是经典版）
 *   · 哪些配置项还缺
 *
 * 只打一个公开只读接口 + 一个「必然失败」的登录请求，不消耗任何额度，也不会创建账号。
 */
import "./../src/env";
import { probeContract } from "../src/utils/newapi";

async function main() {
  const r = await probeContract();
  console.log("\n========== new-api 契约探测报告 ==========");
  console.log("网关地址 :", r.baseURL);
  console.log("可达     :", r.reachable ? "是" : "否");
  if (r.loginShape) console.log("登录结构 :", r.loginShape);
  if (r.status?.data) console.log("版本信息 :", JSON.stringify(r.status.data).slice(0, 500));
  console.log("备注:");
  for (const n of r.notes) console.log("  -", n);
  console.log("==========================================\n");
}

void main();
