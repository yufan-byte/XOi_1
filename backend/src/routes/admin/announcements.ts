/**
 * 站内公告（官方公告）—— 站长在控制台直接编辑，主站菜单红点即时生效。
 *
 * 为什么要写文件而不是建表：
 *   主站（Vue）读的是静态 `/announcements.json`（backend/data/web/announcements.json，
 *   由 app.ts 的 express.static(webDir) 直接伺服），未读红点靠「最新一条 id ≠ localStorage 记录」判定。
 *   公告是**低频、少量、纯展示**的内容，为它建表反而要同步两条链路；直接读写这个 JSON 即可，
 *   站长改完刷新主站就能看到，不用重构建、不用重启。
 *
 * 形状（与主站约定一致，别改）：
 *   { "data": [ { "id": string, "title": string, "content": string, "type"?: "notice"|"update"|"maintenance", "published_at"?: "YYYY-MM-DD" } ] }
 *
 * 鉴权：/api/admin 前缀已统一套 requireAdmin（app.ts），本文件不重复校验。
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";

const router = express.Router();

const file = () => u.getPath(["web", "announcements.json"]);
const TYPES = ["notice", "update", "maintenance"];
const LIMITS = { items: 50, title: 80, content: 20000 };

interface Announcement { id: string; title: string; content: string; type?: string; published_at?: string }

function readFileSync(): Announcement[] {
  try {
    const raw = fs.readFileSync(file(), "utf-8");
    const parsed = JSON.parse(raw) as { data?: unknown } | unknown[];
    const list = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown })?.data ?? [];
    return (Array.isArray(list) ? list : []).filter((x): x is Announcement => !!x && typeof (x as Announcement).id === "string" && typeof (x as Announcement).title === "string");
  } catch {
    // 文件缺失 / 内容损坏：当作「还没有公告」，不要让控制台报错
    return [];
  }
}

/** 生成稳定 id：日期 + 4 位随机（主站用 id 判未读，换 id 就会重新亮红点，所以只在新建时生成） */
function newId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${Math.random().toString(36).slice(2, 6)}`;
}

router.get("/", async (_req, res) => {
  try {
    res.send(success({ items: readFileSync() }));
  } catch (e) {
    res.status(500).send(error(`读取公告失败：${(e as Error).message}`));
  }
});

router.put("/", async (req, res) => {
  const raw = (req.body ?? {}) as { items?: unknown };
  if (!Array.isArray(raw.items)) return res.status(400).send(error("请求体需要 { items: [...] }"));

  const items: Announcement[] = [];
  for (const it of raw.items as Array<Record<string, unknown>>) {
    const title = String(it?.title ?? "").trim();
    const content = String(it?.content ?? "").trim();
    if (!title) return res.status(400).send(error("每条公告都要有标题"));
    if (content.length > LIMITS.content) return res.status(400).send(error(`公告正文最多 ${LIMITS.content} 字`));
    const type = TYPES.includes(String(it?.type)) ? String(it.type) : "notice";
    items.push({
      id: String(it?.id ?? "").trim() || newId(),
      title: title.slice(0, LIMITS.title),
      content,
      type,
      published_at: String(it?.published_at ?? "").trim() || new Date().toISOString().slice(0, 10),
    });
  }
  if (items.length > LIMITS.items) return res.status(400).send(error(`最多保留 ${LIMITS.items} 条公告`));
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) return res.status(400).send(error("公告 id 有重复"));

  try {
    const target = file();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // 先写临时文件再 rename：避免写一半被主站读到半个 JSON
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ data: items }, null, 2), "utf-8");
    fs.renameSync(tmp, target);
    res.send(success({ items }));
  } catch (e) {
    res.status(500).send(error(`保存公告失败：${(e as Error).message}`));
  }
});

export default router;
