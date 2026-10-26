const secretKey=/^(authorization|cookie|set-cookie|password|api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|sql_dsn|.*database_url|.*_(?:token|password|secret|api_key|conn_string))$/i;
export function redactLogText(value:string){return value
  .replace(/\bBearer\s+[^\s"',}]+/gi,"Bearer [REDACTED]")
  .replace(/\bsk-[A-Za-z0-9_-]{12,}/g,"[REDACTED_KEY]")
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[REDACTED_JWT]")
  .replace(/\b(postgres(?:ql)?|mysql|redis|https?):\/\/[^\s/:@]+:[^\s/@]+@/gi,"$1://[REDACTED]@")
  .replace(/(["']?(?:password|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|token)["']?\s*[:=]\s*)["']?[^\s"',}]+["']?/gi,"$1\"[REDACTED]\"").slice(0,8000);}
export function safeLogValue(value:unknown,seen=new WeakSet<object>(),depth=0):unknown{
  if(typeof value==="string")return redactLogText(value);
  if(value instanceof Error)return {name:value.name,message:redactLogText(value.message),stack:redactLogText(value.stack||""),code:(value as any).code,status:(value as any).response?.status};
  if(!value||typeof value!=="object")return value;
  if(depth>5||seen.has(value))return "[truncated]";seen.add(value);
  if(Array.isArray(value))return value.slice(0,30).map(x=>safeLogValue(x,seen,depth+1));
  return Object.fromEntries(Object.entries(value).slice(0,100).map(([key,item])=>[key,secretKey.test(key)||(key==="key"&&typeof item==="string"&&item.length>=32)?"[REDACTED]":safeLogValue(item,seen,depth+1)]));
}
export function installSecurityLogging(){for(const method of ["log","info","warn","error","debug"] as const){const original=console[method].bind(console);console[method]=(...args:any[])=>original(...args.map(value=>safeLogValue(value)));}}
