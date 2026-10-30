/**
 * 把内部错误换成「用户能看懂、且不泄露实现细节」的文案。
 *
 * 为什么需要：生成类接口过去直接把 `u.error(e).message` 吐给前端，
 * 数据库一旦拒绝写入，用户界面上就会弹出一整条 SQL：
 *   insert into "o_tasks" (...) values ($1, ...) - value too long for type character varying(255)
 * 这既没法看懂，也把表名/列名/参数占位符全暴露了。
 *
 * 判据（宁可多脱敏，不可漏）：
 *  1. PostgreSQL 错误的 `code` 是 5 位 SQLSTATE（22001 / 23505 / 42P01 …）；
 *  2. message 长得像 SQL 语句；
 *  3. message 里出现 pg 特有的报错句式。
 * 命中任一就用兜底文案，原文只进服务端日志。
 * 业务错误（我们自己抛的中文提示、上游供应商返回的说明）保持原样透出。
 */

/** 5 位 SQLSTATE。axios 的 code 形如 ERR_BAD_REQUEST / ECONNREFUSED，不会命中。 */
const SQLSTATE = /^[0-9A-Z]{5}$/;
const SQL_STATEMENT = /^(insert\s+into|update\s+|delete\s+from|select\s+.+\s+from)\b/i;
const PG_MESSAGE = /character varying\(\d+\)|duplicate key value|violates .*constraint|relation ".*" does not exist|null value in column/i;

export function isInternalDbError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = String((error as { message?: unknown })?.message ?? "");
  return SQLSTATE.test(code) || SQL_STATEMENT.test(message) || PG_MESSAGE.test(message);
}

export function userFacingError(error: unknown, fallback = "操作失败，请稍后重试"): string {
  const message = String((error as { message?: unknown })?.message ?? "").trim();
  if (!message) return fallback;
  if (isInternalDbError(error)) return fallback;
  return message;
}

export default userFacingError;
