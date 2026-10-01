import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { tool, jsonSchema, type ToolSet } from "ai";
import getPath from "@/utils/getPath";
import { parseFrontmatter } from "./skillsTools";

const SCRIPT_AGENT_SKILLS = new Set([
  "community/drama-skills/short-drama-novel-analyze/SKILL.md",
  "community/drama-skills/short-drama-develop/SKILL.md",
  "community/drama-skills/short-drama-write/SKILL.md",
  "community/drama-skills/short-drama-review/SKILL.md",
]);

// Only imported entrypoints are selectable. Resources remain read-only and inside this suite.
export async function loadCreativeSkills(input: unknown, root = getPath("skills")): Promise<{ prompt: string; tools: ToolSet }> {
  const paths = Array.isArray(input) ? [...new Set(input.filter((s): s is string => typeof s === "string"))] : [];
  if (paths.length > 4) throw new Error("每次最多加载 4 个 Skill");
  const suite = await fs.realpath(path.join(root, "community/drama-skills")).catch(() => "");
  const blocks: string[] = [];
  const allowed = new Set<string>();
  for (const entry of paths) {
    if (!SCRIPT_AGENT_SKILLS.has(entry)) throw new Error("剧本 Agent 仅支持剧本创作相关 Skill");
    const full = await fs.realpath(path.join(root, entry));
    if (!suite || !full.startsWith(suite + path.sep)) throw new Error("Skill 路径无效");
    const raw = await fs.readFile(full, "utf8");
    const meta = parseFrontmatter(raw);
    blocks.push(`### ${meta.name}\n${raw}`);
  }
  if (!blocks.length) return { prompt: "", tools: {} };
  // Cross-skill references are part of the imported suite; expose text only, never execution.
  const resources = await fg("**/*.{md,json,jsonl,yaml}", { cwd: suite, onlyFiles: true, followSymbolicLinks: false });
  resources.forEach((file) => allowed.add(file));
  return {
    prompt: `\n\n## 本轮用户加载的创作 Skills\n采用以下专业方法完成当前任务。项目数据读取、写入和 XML 输出格式仍以本应用工具与原有角色约定为准。文档中的本地文件操作改用现有项目工具；不声称执行 Python、Shell、Dashboard 或媒体生产。需要参考资料时调用 read_creative_skill_file，路径相对于 drama-skills 目录。只处理用户本轮要求的阶段。\n${blocks.join("\n\n")}\n\n可读取的资料：\n${resources.join("\n")}`,
    tools: {
      read_creative_skill_file: tool({
        description: "读取已导入短剧 Skill 的参考文档和模板，不执行脚本。",
        inputSchema: jsonSchema<{ filePath: string }>({ type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"], additionalProperties: false }),
        execute: async ({ filePath }) => {
          if (!allowed.has(filePath)) return { error: "资料路径不在可读列表中" };
          const full = await fs.realpath(path.join(suite, filePath));
          if (!full.startsWith(suite + path.sep)) return { error: "资料路径无效" };
          return { content: await fs.readFile(full, "utf8") };
        },
      }),
    },
  };
}
