import jwt from "jsonwebtoken";

export interface Identity { id?: number; name?: string | null; role?: string | null; status?: string | null; session_version?: number }
export async function resolveIdentity(token: string, secret: string, loadUser: (id: number) => PromiseLike<Identity | undefined>) {
  // 统一身份解析口径：反复剥掉 "Bearer " 前缀。
  // XOi 约定 localStorage 里的 token **本身已含** "Bearer "（见 atelier/src/xoi/owner.ts），
  // 客户端若再拼一次就会变成 "Bearer Bearer xxx"。只 replace 一次会让同一条凭据
  // 在部分端点(经全局中间件)通过、在另一些端点(如 reseller/agent 自带鉴权)被判无效 —— 这里一次收敛。
  const decoded = jwt.verify(token.replace(/^(Bearer\s+)+/i, ""), secret, { algorithms: ["HS256"] });
  if (typeof decoded === "string" || !Number.isSafeInteger(decoded.id) || decoded.id <= 0) throw new Error("无效的登录凭据");
  const user = await loadUser(decoded.id);
  if (!user || user.id !== decoded.id || user.status === "banned") throw new Error("账号不存在或已停用");
  if ((decoded.session_version ?? 0) !== (user.session_version ?? 0)) throw new Error("登录凭据已失效，请重新登录");
  // Ignore all identity/privilege claims apart from the database primary key.
  return { id: user.id, name: user.name, role: user.role || "user", status: user.status || "active", session_version:user.session_version||0 };
}
