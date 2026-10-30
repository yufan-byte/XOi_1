import {ref,computed} from "vue";
import {DEFAULT_SITE_BRAND,publicSiteBrand} from "../../../shared/siteBrand";
import {platformBrandAsset} from "../../../shared/platformBrand";

export const siteBrand=ref({...DEFAULT_SITE_BRAND});
export const workbenchBrandName=computed(()=>siteBrand.value.name||"XOi 导演台");
let inFlight:Promise<void>|undefined;
let previousName="XOi";
let titleSuffix="";
function applyBrand(){
  const b=siteBrand.value;
  const links=Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"],link[rel="shortcut icon"]'));
  const icon=links.shift()||document.createElement("link");
  for(const extra of links)extra.remove();
  icon.rel="icon";icon.href=b.logo||platformBrandAsset("favicon");
  if(!icon.isConnected)document.head.append(icon);
  const target=b.name||"XOi";
  let title=document.title;
  if(titleSuffix&&title.endsWith(titleSuffix))title=title.slice(0,-titleSuffix.length);
  titleSuffix="";
  if(previousName&&title.includes(previousName))title=title.split(previousName).join(target);
  else if(title.includes("XOi"))title=title.split("XOi").join(target);
  else if(b.name){titleSuffix=` · ${target}`;title+=titleSuffix;}
  if(document.title!==title)document.title=title;
  previousName=target;
}
export async function refreshSiteBrand(){
  if(inFlight)return inFlight;
  inFlight=(async()=>{
    try{
      const r=await fetch("/api/reseller/config?section=site",{cache:"no-store",signal:AbortSignal.timeout(5000)});
      if(!r.ok)return;
      const j=await r.json();if(!j.success||!j.data)return;
      siteBrand.value=publicSiteBrand(j.data);applyBrand();
    }catch{/* Keep the last usable brand. Brand availability never blocks login or editing. */}
  })().finally(()=>{inFlight=undefined;});
  return inFlight;
}
/** Public metadata only; no persisted credentials, no model requests, no blocking bootstrap. */
/** 品牌配置改动极少：启动拉一次，之后每 10 分钟兜底刷新；focus 触发的刷新限频 60s，避免高频打接口。 */
const REFRESH_INTERVAL_MS=600_000;
const FOCUS_MIN_GAP_MS=60_000;
export function installSiteBrand(){
  void refreshSiteBrand();
  let lastRefresh=Date.now();
  const refresh=()=>{
    if(document.visibilityState!=="visible")return;
    if(Date.now()-lastRefresh<FOCUS_MIN_GAP_MS)return;
    lastRefresh=Date.now();
    void refreshSiteBrand();
  };
  window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
  const timer=window.setInterval(refresh,REFRESH_INTERVAL_MS);
  const title=document.querySelector("title");
  const observer=new MutationObserver(applyBrand);if(title)observer.observe(title,{childList:true,characterData:true,subtree:true});
  return ()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);observer.disconnect();};
}
