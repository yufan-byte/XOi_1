"use client";
// Project library is a read-through view of server-backed projects; opening it never generates media.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Boxes, ChevronDown, Download, Film, FolderOpen, Image as ImageIcon, ImagePlus, Loader2, Music2, Pencil, Play, RefreshCw, Search, Sparkles, SquarePen, Upload, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell/app-shell";
import { useCollection } from "@/lib/store-local";
import { cn, uid } from "@/lib/utils";
import { downloadUrl, shrinkImage } from "./video-kit";
import { ASSET_KIND_LABEL, allScenes, type AssetKind, type ComicAsset, type ComicProject } from "./types";
import {Dialog,DialogContent} from '@/components/ui/dialog';
import {PillSelect} from '@/components/ui/select';
import {projectMedia,filterProjectMedia,type ProjectMedia,type LibraryKind} from '../../../../../shared/oneStopLibrary';
import './asset-library.css';

type Compliance = "all" | "clean" | "flagged" | "replaced";
const PILL = "rounded-full border border-border/55 bg-background/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** 本地资产没有合规审核：生成失败视为「需处理」，用户上传视为「已替换」 */
const complianceOf = (a: ComicAsset): Exclude<Compliance, "all"> => (a.status === "error" ? "flagged" : a.custom ? "replaced" : "clean");
const statusLabel = (a: ComicAsset) => (a.status === "running" ? "生成中" : a.status === "error" ? "失败" : a.imageUrl ? "已完成" : "待生成");
const byRecent = (a: ComicProject, b: ComicProject) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cn("rounded-full border px-3 py-1 text-[11px] font-medium transition-colors", active ? "border-primary/35 bg-primary/14 text-primary" : "border-border/50 bg-background/45 text-muted-foreground hover:bg-muted hover:text-foreground")}>{children}</button>;
}

function Empty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[30px] border border-border/50 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--muted)_54%,transparent),color-mix(in_srgb,var(--background)_88%,transparent))] px-6 py-14 text-center shadow-[0_24px_70px_rgba(20,20,31,0.06)]">
      <div className="relative mx-auto max-w-lg">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/24 bg-primary/16 text-primary"><Sparkles className="h-6 w-6" /></div>
        <h2 className="font-display text-2xl font-bold tracking-[-0.035em] text-foreground">{title}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">{description}</p>
        {action && <div className="mt-7">{action}</div>}
      </div>
    </section>
  );
}

const CTA = "inline-flex rounded-full bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_80%,white),var(--primary-strong))] px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-10px_color-mix(in_srgb,var(--primary)_70%,transparent)]";

/** One searchable project switcher; never fill the toolbar with long project names. */
function ProjectPicker({ projects, value, onSelect }: { projects: ComicProject[]; value: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  const cur = projects.find((p) => p.id === value);
  const kw = q.trim().toLowerCase(); const all = projects.filter((p) => !kw || p.name.toLowerCase().includes(kw) || (p.description || "").toLowerCase().includes(kw));
  return (
    <div ref={ref} className="relative space-y-2">
      <button type="button" aria-label="切换素材项目" aria-expanded={open} onClick={()=>setOpen(v=>!v)} className="library-project-trigger"><FolderOpen size={17}/><span><small>当前项目</small><strong>{cur?.script?.title||cur?.name||'选择项目'}</strong></span><ChevronDown size={15}/></button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-2xl border bg-card p-2 shadow-pop">
          <label className="mb-1 flex h-9 items-center gap-2 rounded-xl border border-border/55 px-2.5"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索项目" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
          <div className="max-h-64 overflow-y-auto">
            {all.map((p) => <button key={p.id} type="button" onClick={() => { onSelect(p.id); setOpen(false); }} className={cn("block w-full truncate rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted", p.id === value && "font-semibold text-primary")}>{p.name || "未命名项目"}</button>)}
            {all.length === 0 && <div className="py-4 text-center text-xs text-muted-foreground">没有匹配的项目</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function AssetCard({ a, usage, styleHint, onPreview, onUpload, onSave, onOpen }: { a: ComicAsset; usage: number; styleHint?: string; onPreview: () => void; onUpload: () => void; onSave: (patch: Partial<ComicAsset>) => Promise<boolean>; onOpen: () => void }) {
  const [edit, setEdit] = useState(false); const [name, setName] = useState(a.name); const [desc, setDesc] = useState(a.description); const [dl, setDl] = useState(false);
  const flagged = complianceOf(a) === "flagged"; const running = a.status === "running";
  const btn = "inline-flex items-center justify-center gap-1 rounded-xl border border-border/55 bg-background/45 px-2 py-2 text-[11px] text-foreground transition-colors hover:bg-muted";
  const overlayBtn = "inline-flex items-center gap-1 rounded-full bg-black/62 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/78 disabled:opacity-60";
  return (
    <article className="group relative overflow-hidden rounded-[24px] border border-border/50 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--muted)_72%,transparent),color-mix(in_srgb,var(--background)_88%,transparent))] shadow-[0_14px_36px_rgba(20,20,31,0.07)]">
      <div role="button" tabIndex={0} aria-label="打开预览" onClick={onPreview} onKeyDown={(e) => { if (e.key === "Enter") onPreview(); }} className="relative aspect-[4/3] cursor-zoom-in overflow-hidden bg-background/70">
        {a.imageUrl
          ? <img src={a.imageUrl} alt={a.name} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
          : <div role="img" aria-label="等待生成图片" className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_60%)] text-muted-foreground"><div className="rounded-full bg-primary/14 p-2 text-primary"><ImagePlus className="h-8 w-8" /></div><span className="text-xs">等待生成图片</span></div>}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-black/58 px-2 py-0.5 text-[10px] font-semibold text-white">{ASSET_KIND_LABEL[a.kind]}</span>
          {flagged && <span className="rounded-full bg-danger/80 px-2 py-0.5 text-[10px] font-semibold text-white">需处理</span>}
        </div>
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
          {a.imageUrl && <button type="button" disabled={dl} title="下载图" onClick={(e) => { e.stopPropagation(); setDl(true); downloadUrl(a.imageUrl!, a.name).finally(() => setDl(false)); }} className={overlayBtn}>{dl ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}下载图</button>}
          <button type="button" title="上传图" onClick={(e) => { e.stopPropagation(); onUpload(); }} className={overlayBtn}><Upload className="h-3 w-3" />上传图</button>
        </div>
      </div>
      {edit ? (
        <div className="space-y-2 p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="资产名称" className="w-full rounded-lg border border-border/55 bg-background/60 px-3 py-1.5 text-sm focus:border-primary/55 focus:outline-none" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="资产描述" className="w-full resize-none rounded-lg border border-border/55 bg-background/60 px-3 py-1.5 text-xs leading-relaxed focus:border-primary/55 focus:outline-none" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setName(a.name); setDesc(a.description); setEdit(false); }} className={btn}>取消</button>
            <button type="button" disabled={!name.trim()} onClick={async() => { if(await onSave({ name: name.trim(), description: desc.trim() }))setEdit(false); }} className="inline-flex items-center justify-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2 py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/14 disabled:opacity-60">保存</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="line-clamp-1 font-display text-base font-bold tracking-[-0.03em] text-foreground">{a.name || "未命名资产"}</h3>
              {styleHint && <span className="shrink-0 rounded-full border border-border/45 bg-background/45 px-2 py-0.5 text-[10px] text-muted-foreground">{styleHint}</span>}
            </div>
            <p title={a.description || "暂无资产描述"} className="line-clamp-1 text-xs leading-5 text-muted-foreground">{a.description || "暂无资产描述"}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-border/45 bg-background/45 px-2 py-0.5 text-[10px] text-muted-foreground">{statusLabel(a)}</span>
            <span className="rounded-full border border-border/45 bg-background/45 px-2 py-0.5 text-[10px] text-muted-foreground">引用 {usage}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" title="快速改名" onClick={() => setEdit(true)} className={btn}><Pencil className="h-3.5 w-3.5" />快编</button>
            <button type="button" onClick={onOpen} className={btn}><SquarePen className="h-3.5 w-3.5" />详编</button>
            <button type="button" disabled={running} onClick={onOpen} className="inline-flex items-center justify-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2 py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/14 disabled:opacity-60">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}{a.imageUrl ? "重生" : "生成"}</button>
          </div>
        </div>
      )}
    </article>
  );
}

function UploadCreate({ onClose, onCreate }: { onClose: () => void; onCreate: (a: ComicAsset) => void }) {
  const [img, setImg] = useState<string>(); const [busy, setBusy] = useState(false); const [name, setName] = useState(""); const [kind, setKind] = useState<AssetKind>("character");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="上传新建资产" onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-md rounded-[24px] border bg-card p-5 shadow-pop">
        <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-bold">上传新建资产</h3><button type="button" aria-label="关闭" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">图片</div>
          <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/40 text-xs text-muted-foreground hover:border-primary/40">
            {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : busy ? "上传中…" : <span className="inline-flex items-center gap-1.5"><Upload className="h-4 w-4" />选择图片</span>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); try { setImg(await shrinkImage(f, 1024)); } finally { setBusy(false); } }} />
          <div className="text-xs font-medium text-muted-foreground">名称</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="给资产起个名字" className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary/50" />
          <div className="text-xs font-medium text-muted-foreground">类型</div>
          <div className="flex gap-2">{(["character", "scene", "prop"] as AssetKind[]).map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{ASSET_KIND_LABEL[k]}</Chip>)}</div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={cn(PILL, "px-4 py-2 text-sm")}>取消</button>
          <button type="button" disabled={!img || !name.trim()} onClick={() => onCreate({ id: uid(), kind, name: name.trim(), description: "", imageUrl: img, status: "done", custom: true })} className={cn(CTA, "disabled:opacity-50")}>创建资产</button>
        </div>
      </div>
    </div>
  );
}

const MEDIA_TABS:[LibraryKind|'all',string][]=[['all','全部素材'],['image','图片'],['video','视频镜头'],['movie','成片'],['audio','配音']];
const STATE_TEXT:Record<ProjectMedia['state'],string>={ready:'已就绪',pending:'待生成',running:'生成中',review:'需核对'};
function MediaCard({item,onPreview,onOpen}:{item:ProjectMedia;onPreview:()=>void;onOpen:()=>void}){
  const ref=useRef<HTMLElement>(null),[visible,setVisible]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{const node=ref.current;if(!node)return;if(!('IntersectionObserver' in window)){setVisible(true);return;}const o=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);o.disconnect();}},{rootMargin:'160px'});o.observe(node);return()=>o.disconnect();},[]);
  const Icon=item.kind==='audio'?Music2:item.kind==='image'?ImageIcon:Film;
  const extension=item.kind==='image'?'png':item.kind==='audio'?'mp3':'mp4';
  return <article ref={ref} className="library-media-card" data-media-kind={item.kind}>
    <button type="button" className={'library-media-visual '+(item.kind==='audio'?'is-audio':'')} disabled={!item.url} onClick={onPreview} aria-label={'预览'+item.title}>
      {item.kind==='image'&&item.url?<img loading="lazy" src={item.url} alt={item.title} onError={()=>setFailed(true)}/>:item.kind!=='audio'&&item.url&&visible?<video src={item.url} poster={item.poster} preload="metadata" muted playsInline onError={()=>setFailed(true)}/>:<Icon size={34} strokeWidth={1.25}/>}
      {item.url&&item.kind!=='image'&&<span className="library-play"><Play size={19}/></span>}
      <span className="library-media-label">{item.label}</span>
      {item.seconds&&<span className="library-media-duration">{Number(item.seconds).toFixed(item.kind==='movie'?1:0)} 秒</span>}
    </button>
    <div className="library-media-copy"><div className="library-media-title"><h2 title={item.title}>{item.title}</h2><span className={'library-state is-'+(failed?'review':item.state)}>{failed?'无法读取':STATE_TEXT[item.state]}</span></div>
      <p title={item.description}>{item.description||'文件保存在服务器，打开项目可继续编辑。'}</p>
      <div className="library-card-actions"><button type="button" onClick={onOpen}><SquarePen size={13}/>{item.origin==='keyframe'?'管理关键帧':'打开项目'}</button>{item.url&&<a href={item.url} download={item.title+'.'+extension} rel="noopener noreferrer"><Download size={13}/>下载{item.kind==='movie'?'成片':''}</a>}</div>
      {failed&&<small role="status">文件暂时无法读取，请刷新核对；不会自动重新生成或扣费。</small>}
    </div>
  </article>;
}

export function ComicAssetLibrary() {
  const router=useRouter(),pathname=usePathname(),search=useSearchParams(),col=useCollection<ComicProject>('comic');
  const projects=useMemo(()=>[...col.items].sort(byRecent),[col.items]);
  const [type,setType]=useState<LibraryKind|'all'>('all'),[state,setState]=useState<'all'|'ready'|'pending'|'review'>('all'),[q,setQ]=useState(''),[limit,setLimit]=useState(18);
  const [refreshing,setRefreshing]=useState(false),[preview,setPreview]=useState<string|null>(null),[creating,setCreating]=useState(false);
  const uploadRef=useRef<HTMLInputElement>(null),uploadFor=useRef<string|null>(null);
  const selectedId=search.get('project')||projects[0]?.id;
  const project=projects.find(p=>p.id===selectedId);
  const items=useMemo(()=>projectMedia(project),[project]);
  const visible=useMemo(()=>filterProjectMedia(items,type,state,q),[items,type,state,q]);
  const selected=items.find(m=>m.id===preview);
  const assets=project?.assets||[],scenes=project?allScenes(project):[];
  const count=(kind:LibraryKind|'all')=>kind==='all'?items.length:items.filter(m=>m.kind===kind).length;
  const select=(id:string)=>{setPreview(null);setType('all');setState('all');setQ('');setLimit(18);const s=new URLSearchParams(search);s.set('project',id);router.replace(pathname+'?'+s.toString(),{scroll:false});};
  const openProject=()=>project&&router.push('/comic/'+project.id);
  const openMedia=(m:ProjectMedia)=>project&&router.push('/comic/'+project.id+(m.origin==='keyframe'?'?stage=storyboard':''));
  const persist=async(next:ComicProject)=>{try{col.upsert(next);await col.flush(next.id);return true;}catch(e){toast.error((e as Error).message+'；未保存的改动仍保留在本页');return false;}};
  const patchAsset=(id:string,patch:Partial<ComicAsset>)=>project?persist({...project,assets:project.assets.map(a=>a.id===id?{...a,...patch}:a)}):Promise.resolve(false);
  const usageOf=(a:ComicAsset)=>scenes.filter(s=>a.kind==='character'?s.characters.includes(a.name):[s.location,s.action].some(t=>t?.includes(a.name))).length;
  const reset=()=>{setType('all');setState('all');setQ('');setLimit(18);};
  return <AppShell><div data-comic-ui className="cs-page-frame"><div data-testid="comic-asset-library" className="project-library cs-asset-page">
    <header className="library-heading"><div><span className="library-eyebrow"><Boxes size={14}/>PROJECT LIBRARY</span><h1>项目素材</h1><p>角色、画面与每一个镜头，都有处可寻。</p></div><Link href="/comic" className="library-back"><ArrowLeft size={15}/>返回项目</Link></header>
    {!project?<Empty title="暂时没有可显示的项目" description={selectedId?'这个项目尚未读取成功，请返回列表后重新打开；不会切换到其他项目或清空文件。':'先保存故事，生成的图片、镜头、配音与成片会自动出现在这里。'} action={<Link href="/comic" className={CTA}>返回项目列表</Link>}/>:<>
      <section className="library-controls" aria-label="素材筛选">
        <div className="library-toolbar"><ProjectPicker projects={projects} value={project.id} onSelect={select}/>
          <div className="library-tools"><label className="library-search"><Search size={16}/><input aria-label="搜索项目素材" value={q} onChange={e=>{setQ(e.target.value);setLimit(18);}} placeholder="搜索镜头、角色或描述…"/></label>
            <button type="button" className="library-icon-button" aria-label="刷新项目素材" title="刷新素材" disabled={refreshing||col.state.saving||!!col.state.saveError} onClick={async()=>{setRefreshing(true);try{await col.open(project.id);}catch(e){toast.error((e as Error).message);}finally{setRefreshing(false);}}}><RefreshCw size={16} className={refreshing?'animate-spin':''}/></button>
            <button type="button" className="library-upload" onClick={()=>setCreating(true)}><Upload size={14}/>上传图片</button>
          </div>
        </div>
        <div className="library-filter-row"><div className="library-tabs" role="tablist" aria-label="素材分类">{MEDIA_TABS.map(([key,label])=><button key={key} type="button" role="tab" aria-selected={type===key} onClick={()=>{setType(key);setLimit(18);}}>{label}<span>{count(key)}</span></button>)}</div>
          <PillSelect ariaLabel="素材状态" value={state} onChange={v=>{setState(v as typeof state);setLimit(18);}} options={[{value:'all',label:'全部状态'},{value:'ready',label:'已就绪'},{value:'pending',label:'待就绪'},{value:'review',label:'需核对'}]} className="library-state-select"/>
        </div>
      </section>
      <div className="library-result-line" aria-live="polite"><span>{q||state!=='all'?'找到':'共'} <strong>{visible.length}</strong> 项素材{type==='all'&&count('movie')>0?' · 成片已归档':''}</span><span>预览、下载不扣积分</span></div>
      {(col.state.hasMore||col.state.error)&&<button type="button" className="library-back" disabled={col.state.loading} onClick={()=>void col.load().catch(e=>toast.error(e.message))}>{col.state.loading?'正在读取…':'加载更多项目'}</button>}
      {!visible.length?<Empty title={type==='image'&&count('video')>0?'这个项目直接生成了视频':'没有匹配的素材'} description={type==='image'&&count('video')>0?'纯提示词模式不需要生成图片，视频镜头与成片仍完整保留。切换到「视频镜头」或「成片」即可查看。':q||state!=='all'?'试试其他关键词，或清除筛选；现有文件不会被删除。':'本类别还没有生成结果。可进入项目继续创作，已有结果将自动汇总到这里。'} action={items.length?<button type="button" className={CTA} onClick={reset}>查看全部素材</button>:<button type="button" className={CTA} onClick={openProject}>打开项目</button>}/>:<section className="library-grid" aria-label="项目素材列表">{visible.slice(0,limit).map(m=>{const a=m.origin==='asset'?assets.find(a=>a.id===m.assetId):undefined;return a?<AssetCard key={m.id} a={a} usage={usageOf(a)} onPreview={()=>setPreview(m.id)} onUpload={()=>{uploadFor.current=a.id;uploadRef.current?.click();}} onSave={patch=>patchAsset(a.id,patch)} onOpen={openProject}/>:<MediaCard key={m.id} item={m} onPreview={()=>setPreview(m.id)} onOpen={()=>openMedia(m)}/>;})}</section>}
      {visible.length>limit&&<button type="button" className="library-load-more" onClick={()=>setLimit(n=>n+18)}>再显示 18 项 · 还有 {visible.length-limit} 项</button>}
    </>}
    <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';const id=uploadFor.current;uploadFor.current=null;if(!file||!id)return;try{if(await patchAsset(id,{imageUrl:await shrinkImage(file,1024),status:'done',error:undefined,custom:true}))toast.success('图片已保存');}catch(e){toast.error((e as Error).message);}}}/>
    {creating&&project&&<UploadCreate onClose={()=>setCreating(false)} onCreate={async a=>{if(await persist({...project,assets:[a,...project.assets]})){setCreating(false);toast.success('图片资产已保存');}}}/>}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="library-preview" title={selected?.title||'素材预览'} description={selected?.label}>{selected?.url?<><div className="library-preview-stage">{selected.kind==='image'?<img src={selected.url} alt={selected.title}/>:selected.kind==='audio'?<audio src={selected.url} controls preload="metadata"/>:<video src={selected.url} controls playsInline preload="metadata" poster={selected.poster}/>}</div><div className="library-preview-footer"><span>{selected.state==='review'?'这是已保留的旧结果，可在项目中核对或更新。':'服务器归档文件 · 预览不扣积分'}</span><a href={selected.url} download rel="noopener noreferrer"><Download size={14}/>下载文件</a></div></>:<p className="text-sm text-muted-foreground">此项尚无可预览文件，请进入项目查看生成状态。</p>}</DialogContent></Dialog>
  </div></div></AppShell>;
}
