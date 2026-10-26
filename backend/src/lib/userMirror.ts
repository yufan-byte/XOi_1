/**
 * XOi 本地用户镜像层
 * =====================================================================
 * 改造后 new-api 是账号的唯一权威（密码、额度、角色、封禁都在那边）。
 * 但 XOi 全站 92 张业务表都用 `userId` 外键指向 `o_user.id`，
 * 所以本地保留一张「镜像表」，只存展示与风控需要的字段。
 *
 * 核心约定（不要改）：
 *     o_user.id  ===  new-api users.id
 *
 * 这样一来 resolveIdentity() / requireAdmin / 所有外键查询一行都不用动。
 * 密码列从此废弃（写占位符），任何本地 bcrypt 比对都必须删掉。
 */
import u from "@/utils";
import {upsertUserMirror} from '@/utils/userMirrorStore';
import type { NewApiUser } from "@/utils/newapi";
import { roleFromNewApi } from "@/utils/newapi";

export interface MirrorUser {
  id: number;
  name: string | null;
  password?: string | null;
  role: string | null;
  status: string | null;
  session_version: number | null;
  display_id: string | null;
  newapi_uid?: number | null;
  email?: string | null;
  /** new-api 的真实用户组镜像。列名刻意不叫 group（SQL 保留字） */
  user_group?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
}

/**
 * 把 new-api 的用户同步进本地镜像表（幂等）。
 *
 * 每次登录都调用：这样邮箱变更、角色升降、封禁状态都会被带下来，
 * 不需要额外的定时同步任务。
 */
export async function upsertMirrorUser(nu: NewApiUser): Promise<MirrorUser> {
  const role = roleFromNewApi(nu);
  const group = String(nu.group || "default").trim() || "default";
  const email = nu.email ? String(nu.email).trim().toLowerCase() || null : null;
  return await upsertUserMirror(u.db,{id:nu.id,name:nu.username||'',role,status:nu.status===2?'banned':'active',email,user_group:group}) as MirrorUser;
}

/** 按 new-api uid 取镜像行（业务代码里更常用 id，等价） */
export async function findMirrorById(uid: number): Promise<MirrorUser | undefined> {
  return (await u.db("o_user").where("id", uid).first()) as MirrorUser | undefined;
}

/** 写一条登录审计（表不存在时静默跳过，避免影响登录主流程） */
export async function auditLogin(entry: {
  uid?: number | null;
  name: string;
  ip?: string | null;
  ua?: string | null;
  result: "ok" | "fail" | "captcha" | "blocked";
  reason?: string;
}): Promise<void> {
  try {
    await u.db("o_auth_audit").insert({
      uid: entry.uid ?? null,
      name: entry.name.slice(0, 64),
      ip: entry.ip ?? null,
      ua: (entry.ua ?? "").slice(0, 400) || null,
      result: entry.result,
      reason: entry.reason ?? null,
      at: new Date().toISOString(),
    });
  } catch {
    /* 审计是旁路，失败不能拖垮登录 */
  }
}
