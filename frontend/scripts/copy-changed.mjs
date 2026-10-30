/**
 * 只同步「内容有变化」的文件，跳过完全相同的文件。
 *
 * 为什么需要它：sync-backend-web.mjs 用 cp({force:true}) 覆盖全部文件，
 * 而沙箱的 safe-delete shim 会把「覆盖已存在文件」当成删除，一次超过 50 个
 * 就抛 SAFE_DELETE_BULK_CONFIRM_REQUIRED，导致发布中断。
 * 这个脚本先比对内容，只动真正变化的文件（通常几十个以内）。
 */
import { readdir, readFile, mkdir, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error("用法: node copy-changed.mjs <source> <target>");
  process.exit(1);
}

let copied = 0;
let skipped = 0;

async function walk(dir, rel = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const from = join(dir, entry.name);
    const to = join(target, rel, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await walk(from, join(rel, entry.name));
      continue;
    }
    let same = false;
    try {
      const [a, b] = await Promise.all([stat(from), stat(to)]);
      if (a.size === b.size) {
        // 大小相同再看内容，避免把「改了但长度没变」漏掉
        const [ba, bb] = await Promise.all([readFile(from), readFile(to)]);
        same = ba.equals(bb);
      }
    } catch {
      same = false;
    }
    if (same) { skipped++; continue; }
    await mkdir(join(target, rel), { recursive: true });
    await copyFile(from, to);
    copied++;
  }
}

await walk(source);
console.log(`已发布：${copied} 个新/变更文件，跳过 ${skipped} 个未变化文件`);
