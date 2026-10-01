import jwt from "jsonwebtoken";

export interface Identity { id?: number; name?: string | null; role?: string | null; status?: string | null; session_version?: number }
export async function resolveIdentity(token: string, secret: string, loadUser: (id: number) => PromiseLike<Identity | undefined>) {
  const decoded = jwt.verify(token.replace(/^Bearer\s+/i, ""), secret, { algorithms: ["HS256"] });
  if (typeof decoded === "string" || !Number.isSafeInteger(decoded.id) || decoded.id <= 0) throw new Error("无效的登录凭据");
  const user = await loadUser(decoded.id);
  if (!user || user.id !== decoded.id || user.status === "banned") throw new Error("账号不存在或已停用");
  if ((decoded.session_version ?? 0) !== (user.session_version ?? 0)) throw new Error("登录凭据已失效，请重新登录");
  // Ignore all identity/privilege claims apart from the database primary key.
  return { id: user.id, name: user.name, role: user.role || "user", status: user.status || "active" };
}
