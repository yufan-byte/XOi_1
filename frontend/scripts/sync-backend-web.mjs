/**
 * Asset-first, entry-last publishing for the local single-origin service.
 * Retain old hashed assets and preserve editable announcements.
 */
import { access, cp, copyFile, mkdir, readdir, rename, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const distDir = process.env.XOI_FRONTEND_DIST_DIR ? resolve(process.env.XOI_FRONTEND_DIST_DIR) : join(scriptsDir, "..", "dist");
const publicDir = join(scriptsDir, "..", "public");
const webDir = join(scriptsDir, "..", "..", "backend", "data", "web");
const consoleOnly=process.argv.includes("--console-only");
const oneStopOnly=process.argv.includes("--one-stop-only");
const monoformOnly=process.argv.includes("--monoform-only");
if([consoleOnly,oneStopOnly,monoformOnly,process.argv.includes("--main-only")].filter(Boolean).length>1)throw Error("只能选择一个独立发布范围");
await access(join(consoleOnly?join(publicDir,"console"):oneStopOnly?join(publicDir,"one-stop"):monoformOnly?join(publicDir,"monoform"):distDir, "index.html"));
await mkdir(webDir, { recursive: true });

// Preserve pre-upgrade operator content without overwriting a newer edit.
try { await copyFile(join(webDir, "announcements.json"), join(webDir, "..", "announcements.json"), constants.COPYFILE_EXCL); }
catch (error) { if (!["ENOENT", "EEXIST"].includes(error.code)) throw error; }

async function publish(source, target, excluded = []) {
  await access(join(source, "index.html"));
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source)) {
    if (entry === "index.html" || excluded.includes(entry)) continue;
    await cp(join(source, entry), join(target, entry), { recursive: true, force: true });
  }
  const temporary = join(target, "index.html." + crypto.randomUUID() + ".next");
  // Vite 的入口文件偶尔会在异步 chunk 变化后保持同名。发布时复制一份带版本号的入口，
  // 避免浏览器继续复用旧入口映射；不用 query string，保持模块相对路径与 import.meta 行为不变。
  const publishRevision = crypto.randomUUID().slice(0, 8);
  let entryHtml = await readFile(join(source, "index.html"), "utf8");
  const entryScriptMatch = entryHtml.match(/(<script[^>]+\bsrc=["'])(\.\/[^"']+\.js)(["'])/);
  if (entryScriptMatch) {
    const sourceEntryPath = entryScriptMatch[2];
    const versionedEntryPath = sourceEntryPath.replace(/\.js$/, `-publish-${publishRevision}.js`);
    await copyFile(join(source, sourceEntryPath), join(target, versionedEntryPath));
    entryHtml = entryHtml.replace(entryScriptMatch[0], `${entryScriptMatch[1]}${versionedEntryPath}${entryScriptMatch[3]}`);
  }
  await writeFile(temporary, entryHtml, "utf8");
  await rename(temporary, join(target, "index.html"));
}

// Independent bundles must come from their own latest builds, not stale dist snapshots.
if(monoformOnly){
  await publish(join(publicDir,"monoform"),join(webDir,"monoform"));
}else if(oneStopOnly){
  await publish(join(publicDir,"one-stop"),join(webDir,"one-stop"));
}else if(consoleOnly){
  await publish(join(publicDir,"console"),join(webDir,"console"));
}else{
if (!process.argv.includes("--main-only")) {
  for (const app of ["atelier-canvas", "console", "monoform", "one-stop"]) await publish(join(publicDir, app), join(webDir, app));
}
await publish(distDir, webDir, ["atelier-canvas", "console", "monoform", "one-stop", "announcements.json"]);
}
/**
 * 旧哈希资源清理（2026-10-26）。
 *
 * 保留旧哈希是为了「同步新产物时，还开着的标签页不至于 404」。但以前只保留不清理，
 * 结果是每次构建都新增一批、从不回收 —— 本地实测 2.5GB / 24965 个文件。
 * 文件数上万后目录遍历、ls、备份都会变慢，而其中 99% 是几个月前的死文件。
 *
 * 策略（保守，不碰任何正在被引用的文件）：
 *  1. 先扫描 web 目录下**所有** .html，把里面引用到的资源名收集成白名单；
 *  2. 只有「未被任何 HTML 引用」且「mtime 早于 N 天」的文件才删；
 *  3. 默认 N=7 天，可用 --prune-days=30 或 --prune-days=0 关闭。
 */
const pruneArg = process.argv.find((a) => a.startsWith("--prune-days="));
const pruneDays = pruneArg ? Number(pruneArg.split("=")[1]) : 7;

async function pruneStaleAssets(days, roots) {
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const referenced = new Set();

  // 收集所有 HTML 里出现的资源文件名（egrep 不够，直接按 basename 白名单匹配，宁可少删）
  async function collectHtml(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await collectHtml(full); continue; }
      if (!/\.html?$/i.test(entry.name)) continue;
      let html = "";
      try { html = await readFile(full, "utf8"); } catch { continue; }
      for (const m of html.matchAll(/([A-Za-z0-9_.\-]+\.[A-Za-z0-9]{2,5})(?:[?#"']|$)/g)) referenced.add(m[1]);
    }
  }
  await collectHtml(webDir);

  let removed = 0, kept = 0, freed = 0;
  async function sweep(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await sweep(full); continue; }
      if (referenced.has(entry.name)) { kept++; continue; }
      const info = await stat(full).catch(() => null);
      if (!info || info.mtimeMs >= cutoff) { kept++; continue; }
      try { await unlink(full); removed++; freed += info.size; } catch { kept++; }
    }
  }
  for (const root of roots) await sweep(root);
  if (removed > 0) {
    console.log(`旧产物清理：删除 ${removed} 个文件（释放 ${(freed / 1048576).toFixed(1)}MB），保留 ${kept} 个仍在引用或近期文件`);
  }
}

const assetRoots = [join(webDir, "assets"), join(webDir, "console", "assets"), join(webDir, "atelier-canvas", "assets"), join(webDir, "one-stop", "assets"), join(webDir, "monoform", "assets")];
await pruneStaleAssets(pruneDays, assetRoots);

console.log("XOi 静态页面已发布（保留旧哈希资源与公告）：" + webDir);
