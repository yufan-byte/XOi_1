#!/usr/bin/env node
/**
 * 门禁：控制台（frontend/console）调用的后端接口，是否真的挂了？
 * =====================================================================
 * 为什么要它：console 是从造物整包搬过来的，里面残留了大量**造物直连 new-api 的端点**
 * （/api/user/pay、/api/token/*、/api/log/self、/api/team、/api/checkin…）。XOi 后端不提供其中的
 * 一部分，于是页面看着齐全、点下去 404 —— 这种「静默死链」靠人工翻代码很难发现，
 * 2026-10-03 就一次性清掉了七八处。
 *
 * 做法：
 *   1. 从 console 源码里抓 API 调用路径（api("...")、fetch("/api/...")）；
 *   2. 从 backend 的 router.ts（core.ts 生成）+ app.ts（显式挂载）里抓实际挂载前缀；
 *   3. 路径能被某个挂载前缀覆盖 = OK；否则报出来（除非在 INTENTIONAL 白名单里，且写明原因）。
 *
 * 用法：node ops/check-console-routes.mjs            # 只报告
 *      node ops/check-console-routes.mjs --strict   # 有未挂载路径则退出码 1（可挂 CI）
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONSOLE_SRC = path.join(ROOT, "frontend/console/src");
const ROUTER = path.join(ROOT, "backend/src/router.ts");
const APP = path.join(ROOT, "backend/src/app.ts");
const strict = process.argv.includes("--strict");

/** 已知且**有意为之**的未挂载端点（每条都要写原因，禁止无理由堆积） */
const INTENTIONAL = new Map([
  ["/api/token", "站点级单一令牌红线：不签发/不代理 sk- 子令牌（见 routes/user/self.ts 说明）"],
  ["/api/team", "团队版不做；对应组件已从顶栏摘除"],
  ["/api/checkin", "签到未开放（后端无端点，前端仅在开启时才显示入口）"],
  ["/api/status", "客户端配置探测，XOi 无该页"],
  ["/api/partner-lead", "商务合作表单，改走主站反馈渠道"],
  ["/api/catalog/sources", "造物模型目录接口，XOi 用 /api/pricing + 本地模型映射替代"],
  ["/api/catalog/logical", "同上"],
  ["/api/media/v", "成品视频通道未实现（media-route 只有 /x/:id），广场视频刷新后黑屏属已知项"],
  ["/api/openapi", "造物 API 文档页已移除"],
]);

/* ---------- 1. 抓 console 里的 API 路径 ---------- */
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const CALL_RE = /\b(?:api|apiRaw|backendJson)\s*(?:<[^>]*>)?\s*\(\s*[`"'](\/[^`"'$]*)/g;
const FETCH_RE = /fetch\s*\(\s*[`"'](\/api\/[^`"'$?]*)/g;

const calls = new Map(); // path -> Set(relative file)
for (const file of walk(CONSOLE_SRC)) {
  const src = fs.readFileSync(file, "utf-8");
  for (const re of [CALL_RE, FETCH_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      // 去掉 query / hash：`/api/reseller/config?all=1` → `/api/reseller/config`
      const p = (m[1].split("?")[0].split("#")[0]).replace(/\/+$/, "") || "/";
      if (!p.startsWith("/api")) continue;
      if (!calls.has(p)) calls.set(p, new Set());
      calls.get(p).add(path.relative(ROOT, file));
    }
  }
}

/* ---------- 2. 抓后端实际挂载前缀 ---------- */
const mounts = new Set();
for (const f of [ROUTER, APP]) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, "utf-8");
  const re = /app\.use\(\s*"(\/api[^"]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    const p = m[1].replace(/\/+$/, "");
    // ⚠️ 排除兜底挂载：app.ts 末尾 `app.use("/api", canvasStubsRouter)` 是个 catch-all，
    // 留着它会让**任何**路径都「匹配成功」，门禁直接失效（这个坑我踩过）。
    if (p === "/api") continue;
    mounts.add(p);
  }
}
// 生成器把动态段写成 :id / *，做前缀比较时把它们当通配
const mountList = [...mounts].sort();
const norm = (s) => s.replace(/:\w+/g, "§").replace(/\*/g, "§");
const matches = (p) =>
  mountList.some((m) => {
    const np = norm(p);
    const nm = norm(m);
    return np === nm || np.startsWith(nm + "/") || nm.endsWith("/§") && np.startsWith(nm.slice(0, -1));
  });

/* ---------- 3. 报告 ---------- */
const missing = [];
for (const [p, files] of [...calls.entries()].sort()) {
  if (matches(p)) continue;
  const key = [...INTENTIONAL.keys()].find((k) => p === k || p.startsWith(k + "/"));
  missing.push({ path: p, files: [...files], reason: key ? INTENTIONAL.get(key) : null });
}

console.log(`console 调用的 API 路径：${calls.size} 个；后端挂载前缀：${mountList.length} 个`);
const bad = missing.filter((m) => !m.reason);
const known = missing.filter((m) => m.reason);

if (known.length) {
  console.log(`\n有意的未挂载（${known.length}）——白名单里已写明原因：`);
  for (const m of known) console.log(`  · ${m.path}  ← ${m.reason}`);
}
if (bad.length) {
  console.log(`\n⚠️  未挂载且未说明（${bad.length}）——这些调用会 404：`);
  for (const m of bad) console.log(`  · ${m.path}\n      ${m.files.slice(0, 3).join("\n      ")}${m.files.length > 3 ? `\n      …共 ${m.files.length} 处` : ""}`);
  console.log("\n  处理方式：要么补后端路由，要么把入口摘掉，要么在 INTENTIONAL 里写明原因。");
} else {
  console.log("\n✅ 除白名单外，console 调用的接口后端都有对应挂载。");
}

process.exit(strict && bad.length ? 1 : 0);
