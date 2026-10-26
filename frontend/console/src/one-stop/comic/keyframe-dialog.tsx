import {useState} from 'react';
import {Download,ImagePlus,Loader2,Upload} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {PriceTag} from './cost-dialog';
import {downloadUrl,shrinkImage} from './video-kit';
import {selectKeyframe,updateShotPrompt} from './keyframes';
import {allScenes,type ComicScene} from './types';
import type {Save} from './stage-kit';
import type {CatalogModel} from '@/lib/models';

export function KeyframeDialog({scene,index,mode,busy,save,onClose,onGenerate,model}:{scene:ComicScene;index:number;mode:'frames'|'prompt';busy:boolean;save:Save;onClose:()=>void;onGenerate:()=>Promise<boolean>;model?:CatalogModel}){
  const [tab,setTab]=useState(mode),[prompt,setPrompt]=useState(scene.shotPrompt??''),[uploading,setUploading]=useState(false);
  const candidates=[...new Set(scene.altImages??[])].filter(u=>u!==scene.imageUrl);
  const upload=async(file?:File)=>{
    if(!file||busy||uploading)return;
    setUploading(true);
    try{
      const url=await shrinkImage(file,1024);
      const updated=save(p=>{const s=allScenes(p).find(s=>s.id===scene.id);return !s?p:s.imageUrl?{...p,script:{...p.script!,episodes:p.script!.episodes.map(e=>({...e,scenes:e.scenes.map(x=>x.id===scene.id?{...x,altImages:[...new Set([...(x.altImages??[]),url])]}:x)}))}}:selectKeyframe(p,scene.id,url);});
      if(!allScenes(updated).some(s=>s.id===scene.id&&(s.imageUrl===url||s.altImages?.includes(url))))throw new Error('任务正在保存或镜头已变化，本次上传未保存，请稍后重试');
      toast.success(scene.imageUrl?'图片已加入候选图，点击「设为主图」后生效':'已补上本镜关键帧');
    }catch(e){toast.error((e as Error).message);}finally{setUploading(false);}
  };
  const locked=busy||uploading||scene.imageStatus==='running';
  const unsavedPrompt=prompt.trim()!==(scene.shotPrompt??'').trim();
  return <Dialog open onOpenChange={open=>{if(!open&&!uploading)onClose();}}><DialogContent className="os-keyframe-dialog" title={`镜头 ${String(index+1).padStart(2,'0')} · 画面与关键帧`} description={`${scene.location||'未命名场景'} · ${scene.time||'时间未设定'}`}>
    <div className="os-editor-tabs"><button aria-pressed={tab==='frames'} onClick={()=>setTab('frames')}>关键帧管理 {Number(!!scene.imageUrl)+candidates.length}</button><button aria-pressed={tab==='prompt'} onClick={()=>setTab('prompt')}>编辑画面描述</button></div>
    {tab==='prompt'?<div className="space-y-3"><label className="block text-sm">画面描述<textarea aria-label="镜头画面描述" value={prompt} disabled={locked} onChange={e=>setPrompt(e.target.value)} rows={9} maxLength={12000} className="os-prompt-editor"/></label><p className="text-xs text-muted-foreground">保存描述不扣积分，也不会自动改图。已有关键帧保留；如需应用新描述，请明确点击重新生成。</p><div className="os-dialog-actions"><Button variant="secondary" onClick={onClose}>取消</Button><Button disabled={locked||!prompt.trim()} onClick={()=>{save(p=>updateShotPrompt(p,scene.id,prompt.trim()));toast.success('画面描述已保存，未发起生成');onClose();}}>保存描述</Button></div></div>:<div className="space-y-4">
      <div className="os-keyframe-grid"><div className="os-current-frame">{scene.imageUrl?<img src={scene.imageUrl} alt="当前主图"/>:<div>暂无主图，可上传图片或明确点击 AI 生成</div>}<span>当前主图 · 参考图模式使用这张关键帧</span></div><div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium">候选图 <span className="text-muted-foreground">{candidates.length}</span></h3><label className={`chip ml-auto ${locked?'pointer-events-none opacity-50':'cursor-pointer'}`}><Upload size={14}/>上传图片<input aria-label="上传关键帧图片" type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={locked} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label></div>
      <p className="os-dialog-note">补图会保存在下面的候选区，不会自动替换主图。设为主图后，旧主图仍保留；已有视频需核对或重新制作。</p>
      {candidates.length?<div className="os-frame-candidates">{candidates.map((url,i)=><div key={url}><img src={url} alt={`候选图 ${i+1}`}/><Button size="sm" variant="secondary" disabled={locked} onClick={()=>{save(p=>selectKeyframe(p,scene.id,url));toast.success('已设为主图，旧图保留在候选区');}}>设为主图</Button></div>)}</div>:<div className="os-frame-empty">还没有候选图。可以上传现成图片，或用当前画面描述补一张。</div>}</div></div>
      <div className="os-frame-generation"><div><strong>AI 生成{scene.imageUrl?'候选图':'关键帧'}</strong><div><PriceTag model={model}/></div><small>{unsavedPrompt?'画面描述尚未保存，请先切到「编辑画面描述」保存。':'按已保存的画面描述生成；点击才提交模型，按实际用量结算。'}</small></div><Button disabled={locked||unsavedPrompt} onClick={()=>void onGenerate()}>{locked?<Loader2 size={14} className="animate-spin"/>:<ImagePlus size={14}/>}{scene.imageUrl?'生成一张候选图':'生成本镜关键帧'}</Button></div>
      <div className="os-dialog-actions">{scene.imageUrl&&<Button variant="ghost" onClick={()=>void downloadUrl(scene.imageUrl!,`镜头${index+1}-主图.png`)}><Download size={14}/>下载主图</Button>}<Button variant="secondary" onClick={onClose}>完成</Button></div>
    </div>}
  </DialogContent></Dialog>;
}
