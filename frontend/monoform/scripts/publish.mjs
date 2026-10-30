#!/usr/bin/env node
/**
 * 把构建产物发布到站点目录。
 *
 * 为什么要单独一个脚本：
 *  - `public/monoform/` 现在由后端静态伺服，直接 `cp -r` 会丢掉上一次的产物，
 *    出问题没法回滚；这里先做时间戳备份。
 *  - 旧目录里有一批 `xoi-*.js` 注入脚本，新产物不再需要它们（身份校验已搬进入口），
 *    但**必须显式清理**，否则旧的 `xoi-identity-bootstrap.js` 还在 index.html 里引用会 404。
 *
 * 用法：
 *   node scripts/publish.mjs            # 发布（自动备份）
 *   node scripts/publish.mjs --dry-run  # 只打印将要做什么
 */

import { cpSync, existsSync, mkdirSync, renameSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const SITE = join(ROOT, "..", "public", "monoform");
const dryRun = process.argv.includes("--dry-run");
const keepBackups = process.argv.includes("--keep-backups");

if (!existsSync(DIST)) {
  console.error("✗ 没有 dist/，先跑 npm run build");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const backup = `${SITE}.bak.${stamp}`;

console.log(`源: ${DIST}`);
console.log(`目标: ${SITE}`);
console.log(`备份: ${existsSync(SITE) ? backup : "（目标不存在，跳过备份）"}`);

if (dryRun) {
  const entries = readdirSync(DIST);
  console.log(`\n[dry-run] 将写入 ${entries.length} 项:`, entries.join(", "));
  process.exit(0);
}

// 1) 备份现网产物（只保留最近 3 份，避免堆积）
if (existsSync(SITE)) {
  renameSync(SITE, backup);
  console.log(`✓ 已备份到 ${backup}`);
  try {
    const olds = readdirSync(join(ROOT, "..", "public"))
      .filter((name) => name.startsWith("monoform.bak."))
      .sort()
      .reverse();
    for (const name of keepBackups ? [] : olds.slice(3)) {
      rmSync(join(ROOT, "..", "public", name), { recursive: true, force: true });
      console.log(`  清理旧备份 ${name}`);
    }
  } catch {
    /* 清理失败不影响发布 */
  }
}

// 2) 复制新产物
mkdirSync(SITE, { recursive: true });
cpSync(DIST, SITE, { recursive: true });
console.log("✓ 产物已复制");

// 3) 明确提示旧注入脚本的去向
const legacyScripts = [
  "xoi-identity-bootstrap.js",
  "xoi-scene-sync.js",
  "xoi-workspace.js",
  "xoi-keyframe-guide.js",
  "xoi-motion-library.js",
  "xoi-timeline-actions.js",
  "xoi-video-runtime.js",
];
const stillThere = existsSync(SITE)
  ? readdirSync(SITE).filter((name) => legacyScripts.includes(name))
  : [];
console.log(
  stillThere.length
    ? `\n⚠ 产物目录里仍存在旧注入脚本: ${stillThere.join(", ")}\n  这些脚本依赖老产物的 DOM 与文件名，新版本不应再引用。`
    : "\n✓ 旧注入脚本已不在产物目录",
);
console.log("\n回滚: rm -rf public/monoform && mv " + backup + " public/monoform");
