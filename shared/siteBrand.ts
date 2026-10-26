/** Public identity only. Never put credentials, quotas or tenant permissions here. */
export interface PublicSiteBrand { name: string; subtitle: string; hideSubtitle: boolean; logo: string; footer: string }
export const DEFAULT_SITE_BRAND: PublicSiteBrand = {name:"",subtitle:"",hideSubtitle:false,logo:"",footer:""};
export function safeBrandImage(value: unknown): string {
  if(typeof value!=="string"||value.length>2_800_000)return "";
  if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return value;
  if(/^\/(?!\/)[^\s\\<>"']+$/.test(value))return value;
  try { const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password?u.href:""; }catch{return "";}
}
export function publicSiteBrand(raw: unknown): PublicSiteBrand {
  const s=(raw&&typeof raw==="object"?raw:{}) as Record<string,unknown>;
  const str=(k:string,max:number)=>typeof s[k]==="string"?(s[k] as string).trim().slice(0,max):"";
  return {name:str("name",50),subtitle:str("subtitle",60),hideSubtitle:s.hideSubtitle===true,logo:safeBrandImage(s.logo),footer:str("footer",200)};
}
