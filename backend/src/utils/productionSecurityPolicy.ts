export function productionSecurityBlockers(env:Record<string,string|undefined>){
  if(!["prod","production"].includes(env.NODE_ENV||""))return [];
  const blockers:string[]=[];
  const origins=(env.XOI_ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(!origins.length)blockers.push("生产必须设置 XOI_ALLOWED_ORIGINS 精确域名白名单");
  for(const origin of origins){try{const url=new URL(origin);if(url.origin!==origin||url.protocol!=="https:"||url.username||url.password)throw new Error();}catch{blockers.push("生产来源白名单必须是完整 HTTPS origin，不能使用通配符");}}
  const proxies=(env.XOI_TRUST_PROXY||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(proxies.some(x=>["true","*","0.0.0.0/0","::/0"].includes(x)))blockers.push("禁止无条件信任客户端代理头");
  // 限流/审计的客户端 IP 取自 req.ip；若生产在反代之后却没声明可信代理，req.ip 会退化为
  // 反代自身 IP —— 所有用户共用一个限流桶：要么全员一起被限（可用性），要么分布式请求绕过按 IP
  // 的防爆破。直接暴露（无反代）的服务设 loopback 即可，反代后设真实可信来源 IP/CIDR。
  if(!proxies.length)blockers.push("生产必须设置 XOI_TRUST_PROXY（直接暴露设 loopback，反代后设可信代理 IP；否则按客户端 IP 的限流与审计会退化为单一桶，防爆破可被绕过）");
  if(env.REDIS_CONN_STRING||env.REDIS_ADDR||env.XOI_NEWAPI_REDIS_ENABLED==="1")blockers.push("当前团队/代理直接写额度尚未实现网关 Redis 缓存失效；禁止启用此部署组合");
  if(env.XOI_NEWAPI_ONLY&&["0","false","off"].includes(env.XOI_NEWAPI_ONLY.toLowerCase()))blockers.push("生产不能关闭受控 NewAPI 网关");
  if(env.XOI_NEWAPI_QUOTA_MODE!=="sync")blockers.push("生产必须确认 NewAPI 关闭批量延迟额度写入，设置 XOI_NEWAPI_QUOTA_MODE=sync 后才可释放已结算预算");
  // 会话 cookie 的 Secure 目前靠 req.secure / X-Forwarded-Proto 推导：反代（宝塔/nginx）
  // 一旦漏配 proxy_set_header X-Forwarded-Proto，HTTPS 站点也会下发不带 Secure 的会话
  // cookie，同网段明文即可截获。安全底线不能押在反代配置上，生产要求显式打开。
  if(!["1","true"].includes((env.XOI_SESSION_COOKIE_SECURE||"").toLowerCase()))blockers.push("生产必须显式设置 XOI_SESSION_COOKIE_SECURE=1（不要用反代 X-Forwarded-Proto 推导 cookie 的 Secure）");
  return blockers;
}
