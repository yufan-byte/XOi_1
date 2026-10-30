import type {CatalogModel} from '../../lib/model-catalog';
import {supportsBoundedGptVision,supportsBoundedQwenVision} from '../gptVisionBudget';
import {validateOutboundUrl} from '../safeUrl';
import {parseMediaGrant} from '../privateMedia';

export function sceneMediaOrigin(base=process.env.XOI_PUBLIC_BASE_URL||process.env.ossURL){
  if(!base)return null;
  try{const url=validateOutboundUrl(base,false);return url.protocol==='https:'?url.origin:null;}catch{return null;}
}
export function sceneModels(models:CatalogModel[],origin:string|null){
  const rank=(name:string)=>name==='gpt-5.4-nano'?0:/^qwen3\.[5678]-flash/.test(name)?1:name==='gpt-5.4-mini'?2:3;
  return models.filter(m=>m.type==='text'&&m.selectable&&m.capabilities.includes('vision')&&(supportsBoundedGptVision(m.modelName)||supportsBoundedQwenVision(m.modelName))).sort((a,b)=>rank(a.modelName)-rank(b.modelName)).map(m=>{
    const imageInput=supportsBoundedQwenVision(m.modelName)?'url':'inline';
    return {id:`newapi:${m.modelName}`,name:m.name,modelName:m.modelName,imageInput,disabled:imageInput==='url'&&!origin,unavailableReason:imageInput==='url'&&!origin?'此线路需要公网图片，管理员尚未配置安全素材域名':''};
  });
}
/** The budget only accepts a short-lived, own-file URL minted by our server.
 * No arbitrary URLs, foreign uploads, credentials, paths or signature lookalikes.
 */
export function allowedSceneImageUrl(value:string,user:number,secret:string,origin:string|null){
  if(!origin||!secret)return false;
  try{
    const url=new URL(value);
    if(url.origin!==origin||url.username||url.password||url.hash||!new RegExp(`^/oss/canvas-files/${user}/[a-f0-9]{32}\\.(?:jpg|jpeg|png)$`).test(url.pathname)||Array.from(url.searchParams.keys()).join(',')!=='xoi_m')return false;
    return parseMediaGrant(secret,url.pathname.slice(4),url.searchParams.get('xoi_m')||'').id===user;
  }catch{return false;}
}
