export function productionSecurityBlockers(env:Record<string,string|undefined>){
  if(!["prod","production"].includes(env.NODE_ENV||""))return [];
  const blockers:string[]=[];
  const origins=(env.XOI_ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(!origins.length)blockers.push("生产必须设置 XOI_ALLOWED_ORIGINS 精确域名白名单");
  for(const origin of origins){try{const url=new URL(origin);if(url.origin!==origin||url.protocol!=="https:"||url.username||url.password)throw new Error();}catch{blockers.push("生产来源白名单必须是完整 HTTPS origin，不能使用通配符");}}
  const proxies=(env.XOI_TRUST_PROXY||"").split(",").map(x=>x.trim());
  if(proxies.some(x=>["true","*","0.0.0.0/0","::/0"].includes(x)))blockers.push("禁止无条件信任客户端代理头");
  if(env.REDIS_CONN_STRING||env.REDIS_ADDR||env.XOI_NEWAPI_REDIS_ENABLED==="1")blockers.push("当前团队/代理直接写额度尚未实现网关 Redis 缓存失效；禁止启用此部署组合");
  if(env.XOI_NEWAPI_ONLY&&["0","false","off"].includes(env.XOI_NEWAPI_ONLY.toLowerCase()))blockers.push("生产不能关闭受控 NewAPI 网关");
  if(env.XOI_NEWAPI_QUOTA_MODE!=="sync")blockers.push("生产必须确认 NewAPI 关闭批量延迟额度写入，设置 XOI_NEWAPI_QUOTA_MODE=sync 后才可释放已结算预算");
  return blockers;
}
