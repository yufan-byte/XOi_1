/**
 * Skill 市场 · 列表 / 保存 / 收藏 / 导入 —— 挂载 /api/skills（core.ts 白名单 "skills"）。
 * GET  ?tab=market|mine|saved     market 匿名可看，mine/saved 需登录
 * POST /                          保存（新建或更新自己的；submit=true 上架需管理员）
 * POST /save  {skillId,on}        收藏 toggle（专有路径，先于 [id].ts 的 :id 匹配）
 * POST /import {code}             分享码导入
 *
 * 用户 id 口径：req.user.newapi_uid（new-api int），与 mc_skills.user_id 一致。
 */
import express from "express";
import {
  mySkills, marketSkills, savedSkills, savedIds, installedIds, setSaved, saveSkill, importByCode, skillFail, getSkill,
} from "@/lib/market/skill-store";
import { listSkillCatalog, skillCategory } from "@/utils/skillCatalog";
import { readSkillDocument } from "@/utils/skillDocument";
import { screenSkillPayload } from "@/utils/promptGuard";
import u from "@/utils";

const router = express.Router();

/**
 * 当前用户的 new-api int id（未登录 null）。
 *
 * 注意：resolveIdentity() 塞进 req.user 的只有 { id, name, role, status }，**没有** newapi_uid；
 * 而全局铁律是 `o_user.id === new-api users.id`（见 lib/userMirror.ts 文件头），
 * 所以 req.user.id 本身就是造物口径的 newapi uid —— 取它即可，取 newapi_uid 恒为 undefined。
 */
const uid = (req: express.Request): number | null => {
  const u = (req as any).user;
  const n = Number(u?.newapi_uid ?? u?.id);
  return Number.isFinite(n) && n > 0 ? n : null;
};

router.get("/", async (req, res) => {
  const me = uid(req);
  const tab = String(req.query.tab || "market");
  try {
    if (tab === "market") {
      const items = await marketSkills();
      return res.json({ success: true, data: { items, ids: me ? await savedIds(me) : [], installedIds: me ? await installedIds(me) : [] } });
    }
    if (!me) return res.status(401).json({ success: false, message: "请先登录" });
    if (tab === "mine") return res.json({ success: true, data: { items: await mySkills(me) } });
    if (tab === "saved") return res.json({ success: true, data: { items: await savedSkills(me) } });
    return res.status(400).json({ success: false, message: "未知页签" });
  } catch (e) { skillFail(res, e); }
});

/**
 * GET /api/skills/catalog —— 可被创作页"加载"的技能清单（仅元数据，不含正文）。
 *
 * 【为什么新开这个口子】原来唯一的技能清单接口是 `POST /api/setting/skillManagement/getSkillList`，
 * 而 `app.use("/api/setting/skillManagement", requireAdmin)` 是管理员专属 —— 普通用户在角色场景页
 * 根本拉不到列表。这里挂在 /api/skills 下（非管理员路由），只回 path/name/description，
 * 正文仍然只在生成时由后端按路径读取，前端拿不到也改不了文件。
 */
router.get("/catalog", async (req, res) => {
  try {
    const me = uid(req);
    const installed = me ? await installedIds(me) : [];
    // Old installs could leave private skill files in the shared directory. Do not
    // expose their metadata; resolve database-owned entries under the user's identity.
    // community/ 下的散 .md 是「市场安装」的共享执行缓存：只对安装了该技能的
    // 用户展示（此前全员可见，画布技能选择器会被别人的安装记录刷屏）。
    const items = (await listSkillCatalog(u.getPath("skills"))).filter(item => {
      if (/^community\/s_[A-Za-z0-9_-]+\.md$/.test(item.path)) return false;
      if (/^community\/[^/]+\.md$/i.test(item.path)) {
        const id = item.path.replace(/^community\//i, "").replace(/\.md$/i, "");
        return installed.includes(id);
      }
      return true;
    });
    if (me) {
      const own = await mySkills(me);
      const ownIds = new Set(own.map(row => row.id));
      const installedRows = await Promise.all(installed.filter(id => id.startsWith("s_") && !ownIds.has(id)).map(id => getSkill(id, me)));
      for (const row of [...own, ...installedRows.filter((row): row is NonNullable<typeof row> => Boolean(row))]) {
        items.push({
          path: `community/${row.id}.md`, name: row.name, description: row.description,
          category: skillCategory(row.categoryId, `${row.name} ${row.description}`), hasFiles: false,
        });
      }
    }
    res.json({
      success: true,
      data: {
        items,
        installedIds: installed,
      },
    });
  } catch (e) { skillFail(res, e); }
});

/**
 * GET /api/skills/content?path=... —— 登录用户读取技能正文 / 技能目录内辅助文件。
 *
 * 【为什么开这个口子】唯一的正文通道 `POST /api/setting/skillManagement/getSkillContent`
 * 挂在 requireAdmin 之后，普通用户在画布智能体里解析系统技能正文、执行 read_skill_file
 * 全部 403 → 前端静默回落，普通账号的技能弹窗只剩 5 个内置短技能。
 * 安全口径：必须登录；path 必须是 catalog 里登记的 SKILL.md 本体或其所在技能目录内的
 * 受支持文本文件（readSkillDocument 自带防穿越/防符号链接/扩展名白名单/256KB 上限）。
 */
router.get("/content", async (req, res) => {
  const me = uid(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  const rel = String(req.query.path || "");
  if (!rel) return res.status(400).json({ success: false, message: "缺少 path" });
  try {
    const root = u.getPath("skills");
    const catalog = await listSkillCatalog(root);
    const listed = catalog.some(item => item.path === rel);
    const insideSkillDir = catalog.some(item => /\/SKILL\.md$/i.test(item.path) && rel.startsWith(`${item.path.replace(/\/SKILL\.md$/i, "")}/`));
    if (!listed && !insideSkillDir) return res.status(403).json({ success: false, message: "只能读取已登记技能目录内的文件" });
    res.json({ success: true, data: await readSkillDocument(root, rel) });
  } catch (e) {
    const status = (e as { status?: number })?.status || 500;
    res.status(status).json({ success: false, message: e instanceof Error ? e.message : "技能正文读取失败" });
  }
});

router.post("/", async (req, res) => {
  const me = uid(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  try {
    // 用户上传内容审核：暴力血腥 / 网络攻击 / 违法制作类拒绝入库（含附属文件）。
    const guard = screenSkillPayload((req.body ?? {}) as Record<string, unknown>);
    if (!guard.ok) return res.status(400).json({ success: false, message: `内容未通过审核：包含${guard.category}类违规内容（「${guard.excerpt}」），不允许保存` });
    // canPublish（上架进市场）口径与审核页一致：管理员才行。
    // resolveIdentity() 已把角色归一成 "admin"/"user" 字符串，所以不能只做 Number(role)>=100
    // —— Number("admin") 是 NaN，会让管理员也上不了架；两种口径都认。
    const role = (req as any).user?.role;
    const canPublish = role === "admin" || Number(role) >= 100;
    const row = await saveSkill(me, (req.body ?? {}) as any, canPublish);
    res.json({ success: true, data: row });
  } catch (e) { skillFail(res, e); }
});

router.post("/save", async (req, res) => {
  const me = uid(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  const skillId = String((req.body as any)?.skillId || "");
  const on = (req.body as any)?.on !== false;
  if (!skillId) return res.status(400).json({ success: false, message: "缺少 Skill" });
  try {
    await setSaved(me, skillId, on);
    res.json({ success: true, data: {} });
  } catch (e) { skillFail(res, e); }
});

router.post("/import", async (req, res) => {
  const me = uid(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  const code = String((req.body as any)?.code || "").trim();
  if (!code) return res.status(400).json({ success: false, message: "请输入分享码" });
  try {
    res.json({ success: true, data: await importByCode(me, code) });
  } catch (e) { skillFail(res, e); }
});

export default router;
