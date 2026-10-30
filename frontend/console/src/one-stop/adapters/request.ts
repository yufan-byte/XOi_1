import { authHeaders, sessionSignal } from "../../lib/session";
export class OneStopError extends Error {constructor(message:string,public status=0){super(message);}}
export const accountKey=()=>sessionSignal();
let pageOwner = "";
/** Bind this document after cookie bootstrap. An old tab must never send as a new account. */
export function bindAccountSession() { assertAccountSession(); pageOwner ||= accountKey(); }
export function assertAccountSession(expected = pageOwner || accountKey()) {
  if (!expected || accountKey() !== expected || (pageOwner && expected !== pageOwner))
    throw new OneStopError("账号已切换或退出，请重新打开页面", 401);
  return expected;
}
export async function accountFetch(path: string, init: RequestInit = {}) {
  const owner = assertAccountSession();
  if (!path.startsWith("/api/")) throw new OneStopError("请求地址无效");
  const headers = new Headers(init.headers);
  headers.set("X-Xoi-Expected-User", owner.split(":")[0]);
  const response = await fetch(path, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  assertAccountSession(owner);
  return response;
}
/** 本机内容按账号隔离；旧的无归属存储保留原处，不自动分配给新账号。 */
export function accountStorageKey(name: string) {
  const id = /^([1-9]\d*):/.exec(accountKey())?.[1];
  return `${name}:${id ?? "anonymous"}`;
}
export function accountLocalStorage() {
  const owner = accountKey();
  const valid = () => { try { assertAccountSession(owner); return true; } catch { return false; } };
  return {
    getItem: (name: string) => valid() ? localStorage.getItem(name) : null,
    setItem: (name: string, value: string) => { if (valid()) localStorage.setItem(name, value); },
    removeItem: (name: string) => { if (valid()) localStorage.removeItem(name); },
  };
}
/** Auth stays inside XOi. No NewAPI admin/upstream credentials in this bundle. */
export async function oneStopRequest<T>(path:string,init:RequestInit={}):Promise<T>{
  if(!path.startsWith("/api/"))throw new OneStopError("请求地址无效");
  const key=assertAccountSession();
  const headers=new Headers(init.headers);
  // F3：有内存凭据才带 Authorization；刷新后为空，由同源 httpOnly cookie 兜底。
  for(const [name,value] of Object.entries(authHeaders()))headers.set(name,value);
  headers.set("Content-Type","application/json");
  headers.set("X-Xoi-Expected-User",key.split(":")[0]);
  const response=await fetch(path,{...init,headers,cache:"no-store",signal:AbortSignal.any([init.signal||new AbortController().signal,AbortSignal.timeout(15000)])});
  const body=await response.json().catch(()=>null);
  assertAccountSession(key);
  if(!response.ok||body?.success===false)throw new OneStopError(body?.message||"服务暂时不可用，请稍后重试",response.status);
  if(!body||body.data===undefined)throw new OneStopError("服务响应不完整",502);
  return body.data as T;
}
