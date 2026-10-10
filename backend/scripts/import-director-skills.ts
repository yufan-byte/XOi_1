import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DIRECTOR_SKILLS } from "../../shared/directorSkills";
import { directorPackagesRoot } from "../src/utils/director/skillRegistry";

async function inspect(root: string, relative = ""): Promise<Array<{ path: string; sha256: string; bytes: number }>> {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    if (entry.isSymbolicLink()) throw new Error("技能包不能含符号链接");
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await inspect(root, name));
    else if (entry.isFile()) {
      const body = await fs.readFile(path.join(root, name));
      result.push({ path: name, sha256: crypto.createHash("sha256").update(body).digest("hex"), bytes: body.length });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
async function main() {
  const source = path.resolve(process.argv[2] || "../skills_copy");
  const destination = directorPackagesRoot();
  await fs.mkdir(destination, { recursive: true });
  const imported = [];
  for (const skill of DIRECTOR_SKILLS) {
    const root = path.join(source, skill.id);
    await fs.access(path.join(root, "SKILL.md"));
    const files = await inspect(root);
    const digest = crypto.createHash("sha256").update(JSON.stringify(files)).digest("hex");
    const target = path.join(destination, skill.id);
    // 已存在不同版本时不覆盖，以便保留用户的适配或修改。
    try {
      if (crypto.createHash("sha256").update(JSON.stringify(await inspect(target))).digest("hex") !== digest) throw new Error(`${skill.id} 已有不同内容，请先备份并移走旧包再导入`);
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
      await fs.cp(root, target, { recursive: true, filter: src => path.basename(src) !== ".DS_Store" });
    }
    imported.push({ id: skill.id, name: skill.name, sha256: digest, files });
  }
  await fs.writeFile(path.join(destination, "manifest.json"), JSON.stringify({ version: 1, importedAt: new Date().toISOString(), skills: imported }, null, 2));
  console.log(JSON.stringify({ imported: imported.length, files: imported.reduce((n, s) => n + s.files.length, 0), destination }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
