import fs from "node:fs/promises";
import path from "node:path";

/** Fixed extension filtering avoids interpreting caller-controlled glob expressions or following symlinks. */
export async function listFiles(root: string, extensions: string[], recursive = true): Promise<string[]> {
  const files: string[] = [];
  let visited = 0;
  async function walk(relative: string): Promise<void> {
    const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      if (++visited > 100000) throw new Error("目录条目超过扫描上限");
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory() && recursive) await walk(file);
      else if (entry.isFile() && extensions.includes(path.extname(entry.name))) files.push(file);
    }
  }
  await walk("");
  return files.sort();
}
