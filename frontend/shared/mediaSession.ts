/** Cookie-only media playback; model/API calls still require an Authorization header. */
export async function prepareMediaSession(){
  const token=localStorage.getItem('token')||'',secure=location.protocol==='https:'?'; Secure':'';
  const cookie=(value:string,maxAge:number)=>{document.cookie=`xoi_media_owner=${value}; Path=/oss; SameSite=Lax; Max-Age=${maxAge}${secure}`;};
  if(!token){cookie('',0);return;}
  const raw=token.replace(/^(Bearer\s+)+/i,''),claims=JSON.parse(atob(raw.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  if(!Number.isSafeInteger(claims.id)||claims.id<1)throw Error('登录身份无效，请重新登录');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token.replace(/^(Bearer\s+)+/i,'')));
  const hint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  if(localStorage.getItem('token')!==token)throw new DOMException('账号已切换','AbortError');
  cookie(`${claims.id}:${hint}`,86400);
  const response=await fetch('/api/login/media-session',{headers:{Authorization:token},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(localStorage.getItem('token')!==token)throw new DOMException('账号已切换','AbortError');
  if(!response.ok)throw Error('素材访问授权暂不可用，请重新登录或刷新');
}
