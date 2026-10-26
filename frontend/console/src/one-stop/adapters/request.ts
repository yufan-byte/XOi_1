export class OneStopError extends Error {constructor(message:string,public status=0){super(message);}}
export const accountKey=()=>localStorage.getItem("token")||"";
/** Auth stays inside XOi. No NewAPI admin/upstream credentials in this bundle. */
export async function oneStopRequest<T>(path:string,init:RequestInit={}):Promise<T>{
  if(!path.startsWith("/api/"))throw new OneStopError("请求地址无效");
  const token=accountKey();if(!token)throw new OneStopError("请先登录",401);
  const headers=new Headers(init.headers);headers.set("Authorization",token);headers.set("Content-Type","application/json");
  const response=await fetch(path,{...init,headers,cache:"no-store",signal:AbortSignal.any([init.signal||new AbortController().signal,AbortSignal.timeout(15000)])});
  const body=await response.json().catch(()=>null);
  if(accountKey()!==token)throw new OneStopError("账号已切换，请重新打开页面",401);
  if(!response.ok||body?.success===false)throw new OneStopError(body?.message||"服务暂时不可用，请稍后重试",response.status);
  if(!body||body.data===undefined)throw new OneStopError("服务响应不完整",502);
  return body.data as T;
}
