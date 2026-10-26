import { listFiles } from "./listFiles";
import { readSkillDocument } from "./skillDocument";

export type SkillCatalogEntry = { path: string; name: string; description: string; hasFiles: boolean };

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
      return { path, name: field("name", 120) || path.split("/").at(-2) || path, description: field("description", 400), hasFiles: /\/SKILL\.md$/i.test(path) };
    }));
    items.push(...batch.flatMap(result => result.status === "fulfilled" ? [result.value] : []));
  }
  return items;
}
