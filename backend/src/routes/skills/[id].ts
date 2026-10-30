/**
 * Skill 市场 · 详情 / 删除 / 安装 —— core.ts 把本文件挂载在 `/api/skills/:id`。
 *
 * ⚠️ 挂载点已消费掉 `:id` 这一层，所以下面所有路由**不能再写 `/:id`**：
 *    router.get("/")        → GET    /api/skills/<id>
 *    router.delete("/")     → DELETE /api/skills/<id>
 *    router.post("/install")→ POST   /api/skills/<id>/install
 *    写 `/:id` 会变成 /api/skills/:id/:id/... 直接 404（踩过）。
 *
 * 安装口径（与 aiAssistant loadSkills 对齐）：
 *   正文落盘 `data/skills/community/<id>.md` → 该文件会被
 *   /api/setting/skillManagement/getSkillList 扫到 → 前端再按 localStorage
 *   的 xoi_installed_creative_skills_v1:<uid> 过滤，两边都在才会出现在技能选择器里。
 *   内置 228 个技能只存在于静态快照（mc_skills 里没有），因此找不到库内记录时
 *   回落到 `data/web/skill-market/bodies/<id>.md` 读取正文。
 */
import path from "node:path";
import fs from "node:fs";
import express from "express";
import u from "@/utils";
import { getSkill, deleteSkill, setInstalled, skillFail } from "@/lib/market/skill-store";

// mergeParams: 挂载点是 /api/skills/:id，默认的子 Router **不继承**父级参数，
// req.params.id 会是空的 —— 必须显式打开（旧代码在内部写 "/:id" 才碰巧拿到值）。
const router = express.Router({ mergeParams: true });

/** req.user 只有 { id, name, role, status }，且 o_user.id === new-api users.id，故取 id */
const uid = (req: express.Request): number | null => {
  const u = (req as any).user;
  const n = Number(u?.newapi_uid ?? u?.id);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * 保留字：index.ts 占用的专有子路径 + review 审核路由。
 *
 * 这些 id 必须 `next()` 放行而不是回 404 —— core.ts 生成的挂载顺序是
 *   app.use("/api/skills/:id", [id].ts)   ← 先
 *   app.use("/api/skills", index.ts)
 *   app.use("/api/skills/review", review.ts)
 * 所以 `/api/skills/review` 会先落进本文件的 `router.get("/")`（id="review"）。
 * 这里若直接 404，控制台审核页（GET/POST /api/skills/review）就永远打不开；
 * 放行后请求会继续往下命中真正的 review 路由。
 */
const RESERVED = new Set(["save", "import", "review", "catalog", "content"]);

/** 只取白名单字符，防目录穿越；UUID / s_xxx 形态原样保留 */
const safeId = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, "");

/** 内置技能正文的静态落点（造物快照，随站点一起发布） */
function staticBodyFile(id: string): string | null {
  const safe = safeId(id);
  if (!safe) return null;
  const file = path.join(u.getPath("web"), "skill-market", "bodies", `${safe}.md`);
  return fs.existsSync(file) ? file : null;
}

router.get<{ id: string }>("/", async (req, res, next) => {
  const id = String(req.params.id);
  if (RESERVED.has(id)) return next();
  try {
    const row = await getSkill(id, uid(req));
    if (row) return res.json({ success: true, data: row });
    // 内置快照：库内没有，但静态正文在
    const file = staticBodyFile(id);
    if (!file) return res.status(404).json({ success: false, message: "Skill 不存在" });
    res.json({ success: true, data: { id, name: id, body: fs.readFileSync(file, "utf-8") } });
  } catch (e) { skillFail(res, e); }
});

router.delete<{ id: string }>("/", async (req, res, next) => {
  const id = String(req.params.id);
  if (RESERVED.has(id)) return next();
  const me = uid(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  try {
    const ok = await deleteSkill(me, id);
    if (!ok) return res.status(404).json({ success: false, message: "Skill 不存在或不是你的" });
    // 删除的是作者原件；关联安装记录已在 deleteSkill 中清理，此时才能清缓存。
    const file = path.join(u.getPath("skills"), "community", `${safeId(id)}.md`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ success: true, data: {} });
  } catch (e) { skillFail(res, e); }
});

/** 安装：正文落盘 community/，返回 path 供前端写 localStorage（aiAssistant loadSkills 过滤口径） */
router.post<{ id: string }>("/install", async (req, res, next) => {
  const me = uid(req);
  const rawId = String(req.params.id);
  if (RESERVED.has(rawId)) return next();
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  const id = safeId(rawId);
  if (!id) return res.status(400).json({ success: false, message: "Skill id 不合法" });
  try {
    let body: string | null = null;
    let name = id;
    const skill = await getSkill(id, me);
    if (skill) {
      body = skill.body;
      name = skill.name || id;
    } else {
      const file = staticBodyFile(id);
      if (file) body = fs.readFileSync(file, "utf-8");
    }
    if (!body) return res.status(404).json({ success: false, message: "Skill 不存在" });

    // Database-owned skills remain in their permission-checked store, not the shared
    // community folder. The virtual path keeps existing clients compatible.
    if (skill) {
      await setInstalled(me, id, true);
      return res.json({ success: true, data: { path: `community/${id}.md`, name } });
    }

    // 自建 Skill 的正文原本没有 frontmatter；安装时补齐名称、简介和角色场景专用分类，
    // 这样生成页只读文件元数据就能稳定分到「人物 / 场景 / 道具」。
    if (!/^\uFEFF?---\s*\r?\n/.test(body)) {
      const rawCategory = "general";
      const category = ["character", "role", "person"].includes(rawCategory)
        ? "character"
        : ["scene", "environment", "location"].includes(rawCategory)
          ? "scene"
          : ["prop", "object", "tool", "product"].includes(rawCategory)
            ? "prop"
            : "general";
      body = [
        "---",
        `name: ${JSON.stringify(name)}`,
        `description: ${JSON.stringify("创作 Skill")}`,
        `category: ${category}`,
        "---",
        "",
        body,
      ].join("\n");
    }

    const dir = path.join(u.getPath("skills"), "community");
    fs.mkdirSync(dir, { recursive: true });
    const rel = `community/${id}.md`;
    fs.writeFileSync(path.join(u.getPath("skills"), rel), body, "utf-8");
    await setInstalled(me, id, true);
    res.json({ success: true, data: { path: rel, name } });
  } catch (e) { skillFail(res, e); }
});

/** 卸载：只撤销当前用户的安装；没有任何用户仍安装时才删除共享磁盘缓存。 */
router.delete<{ id: string }>("/install", async (req, res, next) => {
  const me = uid(req);
  const rawId = String(req.params.id);
  if (RESERVED.has(rawId)) return next();
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  const id = safeId(rawId);
  if (!id) return res.status(400).json({ success: false, message: "Skill id 不合法" });
  try {
    const remaining = await setInstalled(me, id, false);
    if (remaining === 0) {
      const file = path.join(u.getPath("skills"), "community", `${id}.md`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    res.json({ success: true, data: { remaining } });
  } catch (e) { skillFail(res, e); }
});

export default router;
