import {useState} from "react";
import {Save,Palette,Type,Upload,FileText} from "lucide-react";
import {toast} from "sonner";
import {useResellerAll,useSaveSection} from "@/lib/reseller/client";
import {type ResellerData} from "@/lib/reseller/types";
import {platformBrandAsset} from "../../../../../../shared/platformBrand";
import {SettingCard,ImagePicker,LabeledSwitch,PHOTO_TYPES,UnderlineTabs} from "./ui";
import {SKINS} from "./skins";
import {cn} from "@/lib/utils";
const BrandMark=({size}:{size:number})=><img src={platformBrandAsset("logo",import.meta.env.BASE_URL)} alt="XOi 默认 Logo" width={size} height={size} className="rounded-xl object-contain"/>;

/** One platform identity; independent agent storefronts are not advertised. */
export function SiteInfo(){
  const q=useResellerAll();
  if(q.isLoading)return <p className="p-6 text-sm text-muted-foreground">正在读取站点设置…</p>;
  if(q.error||!q.data)return <div role="alert" className="rounded-xl border p-6"><p>站点设置读取失败，未展示可保存的默认值。</p><button className="mt-3 underline" onClick={()=>void q.refetch()}>重新加载</button></div>;
  return <SiteSettings initial={q.data}/>;
}
function SiteSettings({initial}:{initial:ResellerData}){
  const save=useSaveSection();
  const [tab,setTab]=useState<"brand"|"appearance">("brand");
  const [site,setSite]=useState({...initial.site});
  const [theme,setTheme]=useState({...initial.theme});
  const [saved,setSaved]=useState({site:initial.site,theme:initial.theme});
  const [busy,setBusy]=useState(false);
  const patch=(p:Partial<typeof site>)=>setSite(s=>({...s,...p}));
  const changed=JSON.stringify(site)!==JSON.stringify(saved.site)||theme.skin!==saved.theme.skin;
  async function commit(){
    if(busy||!changed)return;
    if(site.name.trim()&&site.name.trim().length<2){toast.error("站点名称至少 2 个字，或留空使用 XOi");return;}
    setBusy(true);
    try{
      if(JSON.stringify(site)!==JSON.stringify(saved.site)){
        const next=await save("site",site,"site.brand.update",{expectedValue:saved.site});setSite(next);setSaved(s=>({...s,site:next}));
      }
      if(theme.skin!==saved.theme.skin){
        const next=await save("theme",theme,"site.appearance.update",{expectedValue:saved.theme});setTheme(next);setSaved(s=>({...s,theme:next}));
      }
      toast.success("站点设置已保存；其他已打开页面会自动同步");
    }catch(e){toast.error(`保存失败：${(e as Error).message}`);}finally{setBusy(false);}
  }
  const field="mt-2 h-11 w-full rounded-xl border bg-transparent px-3 text-sm outline-none focus:border-primary/50";
  return <div className="mx-auto w-full max-w-5xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-semibold">站点设置</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">统一 XOi 主站、登录页和管理台的品牌；不改变模型价格、积分或客户归属。</p></div><button disabled={busy||!changed} onClick={()=>void commit()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"><Save size={16}/>{busy?"正在保存…":"保存更改"}</button></header>
    <UnderlineTabs value={tab} onChange={setTab} tabs={[{value:"brand",label:"品牌信息"},{value:"appearance",label:"控制台外观"}]}/>
    <fieldset disabled={busy} className="min-w-0">
    {tab==="brand"?<div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <SettingCard icon={<Type/>} title="站点名称" help="留空使用 XOi；保存后用于首页导航、登录页及管理台。"><input aria-label="站点名称" value={site.name} maxLength={50} placeholder="XOi" onChange={e=>patch({name:e.target.value})} className={field}/></SettingCard>
        <SettingCard icon={<Upload/>} title="站点 Logo" help="同时用于品牌标识和标签页图标。移除后恢复 XOi 默认标识。"><ImagePicker value={site.logo} onChange={logo=>patch({logo})} label="上传 Logo" removeLabel="恢复默认" types={PHOTO_TYPES} hint="PNG / JPG / WebP，不超过 2MB"/></SettingCard>
        <SettingCard icon={<Type/>} title="品牌副标题" help="显示在导航品牌名旁或下方；留空不显示。"><input aria-label="品牌副标题" value={site.subtitle} maxLength={60} onChange={e=>patch({subtitle:e.target.value})} className={field}/><div className="mt-4 flex items-center justify-between text-sm"><span>隐藏副标题</span><LabeledSwitch label="隐藏副标题" checked={site.hideSubtitle} onCheckedChange={hideSubtitle=>patch({hideSubtitle})}/></div></SettingCard>
        <SettingCard icon={<FileText/>} title="页脚说明" help="显示于登录页、主站导航底部和管理台底部；最多 200 字。"><textarea aria-label="页脚说明" value={site.footer} maxLength={200} rows={3} onChange={e=>patch({footer:e.target.value})} className="w-full resize-y rounded-xl border bg-transparent p-3 text-sm"/></SettingCard>
      </div>
      <aside className="self-start rounded-2xl border bg-card p-5 lg:sticky lg:top-6"><p className="text-xs text-muted-foreground">品牌预览 · 保存后生效</p><div className="mt-5 flex items-center gap-3">{site.logo?<img src={site.logo} alt="品牌预览" className="size-12 rounded-xl object-contain"/>:<BrandMark size={48}/>}<div className="min-w-0"><strong className="block break-words">{site.name.trim()||"XOi"}</strong>{!site.hideSubtitle&&site.subtitle.trim()&&<p className="mt-1 break-words text-xs text-muted-foreground">{site.subtitle}</p>}</div></div>{site.footer.trim()&&<p className="mt-6 whitespace-pre-wrap break-words border-t pt-4 text-xs leading-6 text-muted-foreground">{site.footer}</p>}<p className="mt-6 text-xs leading-6 text-muted-foreground">仅平台管理员可修改。下级代理的客户、收益和定价由独立入口管理。</p></aside>
    </div>:<SettingCard icon={<Palette/>} title="控制台配色" help="仅影响管理台配色，不改变创作首页和登录页布局。"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{SKINS.map(s=><button key={s.key} type="button" aria-pressed={theme.skin===s.key} onClick={()=>setTheme(t=>({...t,skin:s.key}))} className={cn("rounded-xl border p-4 text-left",theme.skin===s.key&&"border-primary ring-1 ring-primary")}><span className="flex h-12 overflow-hidden rounded-lg">{s.swatch.map((c,i)=><i key={i} className="flex-1" style={{background:c}}/>)}</span><span className="mt-3 block text-sm font-medium">{s.key==="obsidian"?"平台默认":s.name}</span></button>)}</div></SettingCard>}
    </fieldset>
  </div>;
}
