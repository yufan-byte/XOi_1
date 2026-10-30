import { listFiles } from "./listFiles";
import { readSkillDocument } from "./skillDocument";

export type CreativeSkillCategory = "character" | "scene" | "prop" | "general";
export type SkillCatalogEntry = { path: string; name: string; description: string; category: CreativeSkillCategory; hasFiles: boolean };

export function skillCategory(raw: string, searchable: string): CreativeSkillCategory {
  const value = raw.trim().toLowerCase();
  if (["character", "role", "person", "people", "人物", "角色"].includes(value)) return "character";
  if (["scene", "environment", "location", "场景", "景"].includes(value)) return "scene";
  if (["prop", "object", "tool", "product", "道具", "物"].includes(value)) return "prop";
  const text = searchable.toLowerCase();
  if (/(人物|角色|捏脸|人像|肖像|character|portrait|face)/i.test(text)) return "character";
  if (/(场景|空间|环境|地点|布景|scene|environment|location)/i.test(text)) return "scene";
  if (/(道具|物件|物品|产品|器物|prop|object|product)/i.test(text)) return "prop";
  return "general";
}

/** Shared system metadata, never skill bodies. The document reader rejects paths and symlinks. */
export async function listSkillCatalog(root: string): Promise<SkillCatalogEntry[]> {
  const paths = (await listFiles(root, [".md"]))
    .filter(path => /(?:^|\/)SKILL\.md$/i.test(path) || /^community\/[^/]+\.md$/i.test(path)).slice(0, 256);
  const items: SkillCatalogEntry[] = [];
  for (let offset = 0; offset < paths.length; offset += 8) {
    const batch = await Promise.allSettled(paths.slice(offset, offset + 8).map(async path => {
      const content = await readSkillDocument(root, path);
      const front = content.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] || "";
      const field = (key: string, limit: number) => (front.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "m"))?.[1] || "").slice(0, limit);
      const name = field("name", 120) || path.split("/").at(-2) || path;
      const description = field("description", 400);
      return { path, name, description, category: skillCategory(field("category", 40), `${path} ${name} ${description}`), hasFiles: /\/SKILL\.md$/i.test(path) };
    }));
    items.push(...batch.flatMap(result => result.status === "fulfilled" ? [result.value] : []));
  }
  return items;
}
