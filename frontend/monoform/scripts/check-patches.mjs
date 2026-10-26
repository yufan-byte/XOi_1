#!/usr/bin/env node
/**
 * 构建前的补丁自检。
 *
 * 背景：`upstream/` 是 monoform 源码原样入仓，我们对它的改动必须是最小的、可枚举的。
 * 每次上游升级后，靠人工记住改了哪几处不现实——漏一处就会静默退化
 * （最典型：storage key 漏了，所有场景塌成同一份，功能看起来正常但数据串了）。
 *
 * 这个脚本在 `npm run build` 之前跑：把 upstream 里所有 `XOI-PATCH:<name>` 标记
 * 与下面的 EXPECTED 清单对账，数量或位置不符就退出码 1，构建直接停下。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UPSTREAM = join(ROOT, "upstream");

/**
 * 期望的补丁清单。
 * 新增补丁时**必须**同时更新这里，否则自检会报「未登记」。
 */
const EXPECTED = [
  {
    name: "storage-key",
    files: ["src/App.jsx"],
    /** 每个文件里至少出现几次（一处 import + 一处使用算一次标记） */
    minCount: 2,
    why: "多项目隔离：上游是单项目常量，必须换成 ?key= 派生的函数",
  },
  {
    name: "brand",
    files: ["src/App.jsx"],
    minCount: 1,
    why: "顶栏与摄像机水印换成 XOi 品牌（原来是 MONOFORM）",
  },
];

/** 递归收集 upstream 下的源码文件（跳过依赖与产物） */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(jsx?|mjs|css|html)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(UPSTREAM);
const found = new Map(); // name -> [{ file, count }]

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/XOI-PATCH:([a-z0-9-]+)/g)) {
    const name = match[1];
    const rel = relative(UPSTREAM, file);
    const list = found.get(name) ?? [];
    const hit = list.find((item) => item.file === rel);
    if (hit) hit.count++;
    else list.push({ file: rel, count: 1 });
    found.set(name, list);
  }
}

const problems = [];

for (const spec of EXPECTED) {
  const hits = found.get(spec.name);
  if (!hits?.length) {
    problems.push(`缺少补丁 ${spec.name}（${spec.why}）——上游升级后大概忘了重放`);
    continue;
  }
  for (const file of spec.files) {
    const hit = hits.find((item) => item.file === file);
    if (!hit) problems.push(`补丁 ${spec.name} 不在预期的 ${file} 里`);
    else if (hit.count < spec.minCount) {
      problems.push(`补丁 ${spec.name} 在 ${file} 只出现 ${hit.count} 次，期望至少 ${spec.minCount} 次`);
    }
  }
  for (const hit of hits) {
    if (!spec.files.includes(hit.file)) {
      problems.push(`补丁 ${spec.name} 出现在未登记的 ${hit.file}`);
    }
  }
}

for (const name of found.keys()) {
  if (!EXPECTED.some((spec) => spec.name === name)) {
    problems.push(`发现未登记的补丁 ${name}，请加到 scripts/check-patches.mjs 的 EXPECTED 里`);
  }
}

if (problems.length) {
  console.error("\n✗ monoform 补丁自检未通过：\n");
  for (const problem of problems) console.error("  · " + problem);
  console.error("\n  上游升级后请按 docs/monoform-upgrade.md 逐个重放标记。\n");
  process.exit(1);
}

const summary = EXPECTED.map((spec) => {
  const count = (found.get(spec.name) ?? []).reduce((sum, hit) => sum + hit.count, 0);
  return `${spec.name}×${count}`;
});
console.log(`✓ monoform 补丁自检通过：${summary.join("  ")}`);
