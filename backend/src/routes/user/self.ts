/**
 * 当前用户的资料读写 —— 对齐造物 / 控制台里 `api("/api/user/self")` 的语义。
 *
 * 为什么需要它：控制台（console）从造物搬过来的「资料与安全」弹窗会 `PUT /api/user/self`
 * 改显示名称 / 邮箱 / 密码；造物部署里这个端点是网关自己的，XOi 后端没有，于是 404。
 *
 * 设计取舍（重要，与「站点级单一令牌」铁律一致）：
 *   · GET  —— 只回**白名单字段**。网关 /api/user/self 的原始返回里带着 permissions、
 *            会话等内部结构，没必要发给浏览器；余额/角色这些真正要用的字段一个不少。
 *            注意控制台顶栏的余额走的是 `/api/login/self`（XOi 自己那条，读 o_user 镜像 +
 *            实时额度），本端点是给「资料弹窗」用的补充口径。
 *   · PUT  —— **只放通 display_name**，并且转调网关 PUT /api/user/self（网关才是资料的
 *            真源，改这里才能在主站、控制台、网关后台三处一致）。
 *             邮箱与密码两栏**明确回绝**并给出指引，理由：
 *               - 邮箱绑定在 XOi 是「发验证码 → 校验 → 绑定」的完整流程（utils/newapi#bindEmail），
 *                 不是一次 PUT 能完成的；控制台拿到失败会提示「请通过原站绑定流程」（见 profile-dialog）；
 *               - 改密码：实测网关对「带 password 的 PUT /api/user/self」返回 AUTH_UNAUTHORIZED，
 *                 它要求的是**用户自己的会话**而不是管理员令牌。用管理员令牌代改密码等于把
 *                 「谁拿到管理员令牌谁就能改任意用户密码」变成一条真实可用的路径 —— 不做。
 *
 * 挂载路径：/api/user/self，挂在全局 XOi JWT 中间件之前（本 Router 自带 lib/reseller/auth 鉴权）。
 */
import express, { type Response } from "express";
import { backend, currentUser } from "@/lib/reseller/auth";
import { newApiSelfByAdmin, type NewApiUser } from "@/utils/newapi";

const router = express.Router();

const unauthorized = (res: Response) => res.status(401).json({ success: false, message: "请先登录" });
class SelfError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** 对外的用户资料白名单（网关原始返回里其余字段不对外） */
const publicSelf = (u: NewApiUser & { display_name?: string }) => ({
  id: u.id,
  username: u.username,
  name: u.username,
  display_name: u.display_name ?? u.username,
  email: u.email ?? "",
  quota: u.quota ?? 0,
  used_quota: u.used_quota ?? 0,
  group: u.group ?? "",
  role: u.role ?? 0,
  status: u.status ?? 1,
  aff_code: u.aff_code ?? "",
});

router.get("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return unauthorized(res);
  try {
    // 重新拉一次而不是复用 currentUser 的结果：currentUser 只保证 id/role 可用，
    // 资料弹窗要的是 display_name / email 这些完整字段。
    const fresh = await newApiSelfByAdmin(me.id);
    res.json({ success: true, data: publicSelf(fresh) });
  } catch (e) {
    res.status(502).json({ success: false, message: `读取资料失败：${(e as Error).message}` });
  }
});

/** PUT {display_name} —— 目前只支持改显示名称；邮箱/密码见文件头说明 */
router.put("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return unauthorized(res);
  const b = (req.body ?? {}) as { display_name?: unknown; email?: unknown; password?: unknown };
  try {
    if (b.email !== undefined) throw new SelfError("邮箱需要验证码校验，请通过主站「账号安全」完成绑定");
    if (b.password !== undefined) throw new SelfError("密码修改请通过主站「账号安全」流程完成");
    if (b.display_name === undefined) throw new SelfError("没有要修改的内容");

    const display_name = String(b.display_name).trim();
    if (!display_name) throw new SelfError("显示名称不能为空");
    if (display_name.length > 64) throw new SelfError("显示名称最多 64 个字符");

    try {
      await backend(req, "/api/user/self", { method: "PUT", body: JSON.stringify({ display_name }) });
    } catch (e) {
      throw new SelfError(`网关拒绝了这次修改：${(e as Error).message}`, 502);
    }

    const fresh = await newApiSelfByAdmin(me.id).catch(() => null);
    res.json({ success: true, data: fresh ? publicSelf(fresh) : { id: me.id, display_name } });
  } catch (e) {
    if (e instanceof SelfError) return res.status(e.status).json({ success: false, message: e.message });
    res.status(500).json({ success: false, message: "保存失败，请稍后重试" });
  }
});

export default router;
