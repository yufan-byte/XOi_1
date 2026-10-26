import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const denied = () => Object.assign(new Error("只能读取技能目录内的受支持文本资料"), { status: 400 });
/** No arbitrary server paths, hidden files, scripts, symlinks or unbounded reads. Never executes content. */
export async function readSkillDocument(root: string, relative: string) {
  if (typeof relative !== "string" || relative.length > 500 || relative.includes("\\") || relative.includes("\0") || path.isAbsolute(relative)) throw denied();
  const parts = relative.split("/");
  if (!parts.length || parts.some(part => !part || part.startsWith("."))) throw denied();
  if (![".md", ".txt", ".json", ".yaml", ".yml"].includes(path.extname(relative).toLowerCase())) throw denied();
  const base = await fs.realpath(root);
  let target = base;
  for (let i = 0; i < parts.length; i++) {
    target = path.join(target, parts[i]);
    const info = await fs.lstat(target).catch(() => { throw denied(); });
    if (info.isSymbolicLink() || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile())) throw denied();
  }
  const actual = await fs.realpath(target);
  if (!actual.startsWith(base + path.sep)) throw denied();
  const file = await fs.open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 256_000) throw denied();
    return await file.readFile("utf8");
  } finally { await file.close(); }
}
