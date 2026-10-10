import fs from "node:fs/promises";
import path from "node:path";
import { DIRECTOR_SKILLS, DirectorInputError } from "../../../../shared/directorSkills";

export const directorPackagesRoot = () => path.resolve(process.cwd(), "data/skills/purchased/director");
export async function listDirectorSkills(root = directorPackagesRoot()) {
  return Promise.all(DIRECTOR_SKILLS.map(async skill => {
    let available = false;
    try { available = (await fs.stat(path.join(root, skill.id, "SKILL.md"))).isFile(); } catch {}
    return { ...skill, available };
  }));
}
async function readPackageFile(root: string, id: string, relative: string): Promise<string> {
  const packageRoot = await fs.realpath(path.join(root, id));
  const file = await fs.realpath(path.resolve(packageRoot, relative));
  if (!file.startsWith(packageRoot + path.sep) || path.extname(file).toLowerCase() !== ".md") throw new DirectorInputError("技能参考文件路径无效");
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 256_000) throw new DirectorInputError("技能参考文件过大或格式无效");
  return fs.readFile(file, "utf8");
}
export async function loadDirectorSkill(id: string, intent: string, scene: { aspectRatio: string; objects: Array<{ type: string }> }, root = directorPackagesRoot()) {
  const skill = DIRECTOR_SKILLS.find(s => s.id === id);
  if (!skill) throw new DirectorInputError("请选择导演台支持的技能");
  const refs: string[] = [];
  if (id === "seedance-shot-design") {
    refs.push("references/cinematography.md", "references/quality-anchors.md");
    if (/风格|水墨|科幻|复古|导演|电影感|赛博/.test(intent)) refs.push("references/director-styles.md");
  } else if (id === "emotion-expression-director") refs.push("references/expression-language.md");
  else if (id === "seedance-previz-to-render") {
    refs.push("references/style-parsing-guide.md");
    refs.push(/建筑|室内|展厅|空间|漫游/.test(intent) ? "references/architecture-render-guide.md" : /产品|商品|汽车|珠宝/.test(intent) ? "references/product-render-guide.md" : "references/character-previs-guide.md");
  } else if (id === "fpv") {
    refs.push("references/INDEX.md", "references/formats/fpv-prompt-grammar.md", "references/formats/segment-continuity.md");
    const trajectory = /车辆|汽车|追车/.test(intent) ? "vehicle" : /建筑|大楼|楼宇/.test(intent) ? "building" : /树林|森林|洞穴/.test(intent) ? "nature-tunnel" : /山|海|峡谷|风景/.test(intent) ? "landscape" : scene.objects.some(o => o.type === "person") ? "person" : "interior";
    refs.push(`references/trajectories/${trajectory}.md`);
    if (scene.aspectRatio === "9:16") refs.push("references/formats/vertical-rules.md");
  }
  const files = ["SKILL.md", ...refs];
  const documents = await Promise.all(files.map(async relative => ({ path: relative, content: await readPackageFile(root, id, relative) })));
  if (documents.reduce((n, d) => n + Buffer.byteLength(d.content), 0) > 512_000) throw new DirectorInputError("本轮技能参考内容过多，请缩小需求");
  // 完整读入正文和本轮参考，不静默截断，也不执行原包脚本。
  return { skill, files, context: JSON.stringify(documents) };
}
