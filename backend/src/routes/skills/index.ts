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
  mySkills, marketSkills, savedSkills, savedIds, installedIds, setSaved, saveSkill, importByCode, skillFail,
} from "@/lib/market/skill-store";

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

router.post("/", async (req, res) => {
  const me = uid(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  try {
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
