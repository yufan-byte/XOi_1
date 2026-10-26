/**
 * Asset-first, entry-last publishing for the local single-origin service.
 * Retain old hashed assets and preserve editable announcements.
 */
import { access, cp, copyFile, mkdir, readdir, rename } from "node:fs/promises";
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
if([consoleOnly,oneStopOnly,process.argv.includes("--main-only")].filter(Boolean).length>1)throw Error("只能选择一个独立发布范围");
await access(join(consoleOnly?join(publicDir,"console"):oneStopOnly?join(publicDir,"one-stop"):distDir, "index.html"));
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
  await copyFile(join(source, "index.html"), temporary);
  await rename(temporary, join(target, "index.html"));
}

// Independent bundles must come from their own latest builds, not stale dist snapshots.
if(oneStopOnly){
  await publish(join(publicDir,"one-stop"),join(webDir,"one-stop"));
}else if(consoleOnly){
  await publish(join(publicDir,"console"),join(webDir,"console"));
}else{
if (!process.argv.includes("--main-only")) {
  for (const app of ["atelier-canvas", "console", "monoform", "one-stop"]) await publish(join(publicDir, app), join(webDir, app));
}
await publish(distDir, webDir, ["atelier-canvas", "console", "monoform", "one-stop", "announcements.json"]);
}
console.log("XOi 静态页面已发布（保留旧哈希资源与公告）：" + webDir);
