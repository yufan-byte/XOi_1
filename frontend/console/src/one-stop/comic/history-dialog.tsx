import {useEffect,useRef,useState} from 'react';
import {Download,History,Loader2,RotateCcw} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {oneStopRequest} from '../adapters/request';
import {collection} from '../adapters/collections';
import {useActionConfirmation} from '../adapters/action-confirmation';
import {STAGE_DEFS,type ComicProject,type StageKey} from './types';

type Entry={revision:number;operation:string;stage?:string;createdAt:number};
type Snapshot=Entry&{sourceOperation:string;value:unknown};
function readable(value:unknown){
  const full=JSON.stringify(value,(_key,v)=>typeof v==='string'&&/^data:image\//.test(v)?'[已保存的上传图片]':v,2)??'此时还没有内容';
  return full.length>200000?full.slice(0,200000)+'\n…界面预览到此，下载可获得完整快照。':full;
}
function currentValue(p:ComicProject,s:Snapshot){
  if(s.sourceOperation==='render')return p.finalMovie??null;
  if(s.stage==='assets')return p.assets;
  if(s.stage==='storyboard'||s.stage==='video')return p.script??null;
  if(s.stage==='direction')return {direction:p.direction??null,directions:p.directions??null};
  return (p as unknown as Record<string,unknown>)[s.stage||'']??null;
}
export function HistoryDialog({p,busy,onClose,onRestored}:{p:ComicProject;busy:boolean;onClose:()=>void;onRestored:(p:ComicProject)=>void}){
  const ask=useActionConfirmation(),[items,setItems]=useState<Entry[]>([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[comparison,setComparison]=useState<{revision:number;payload:ComicProject}|null>(null),[error,setError]=useState(''),[restoring,setRestoring]=useState(false);
  const selection=useRef(0),alive=useRef(true),attempt=useRef<{version:number;revision:number;clientId:string}|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const base=`/api/one-stop/documents/${encodeURIComponent(p.id)}/history`;
  async function load(n:number){setLoading(true);setError('');try{const r=await oneStopRequest<{items:Entry[];hasMore:boolean}>(base+'?page='+n);if(!alive.current)return;setItems(old=>n===1?r.items:[...old,...r.items]);setMore(r.hasMore);setPage(n);}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setLoading(false);}}
  useEffect(()=>{void load(1);},[p.id]);
  const select=async(entry:Entry)=>{const n=++selection.current;setSnapshot(null);setComparison(null);setError('');attempt.current=null;try{if(!busy)await collection<ComicProject>('comic').flush(p.id);const [r,current]=await Promise.all([oneStopRequest<Snapshot>(base+'/'+entry.revision),oneStopRequest<{revision:number;payload:ComicProject}>(`/api/one-stop/documents/${p.id}?collection=comic`)]);if(alive.current&&n===selection.current){setSnapshot(r);setComparison(current);}}catch(e){if(alive.current&&n===selection.current)setError((e as Error).message);}};
  const restore=async()=>{
    if(!snapshot||!comparison||busy||restoring)return;
    if(!await ask({title:'恢复这个阶段的历史内容？',description:'仅恢复选中阶段，不调用模型、不扣积分。当前阶段先保存为可恢复的备份；后续图片和视频不会删除，但需要核对一致性。',confirm:'备份当前内容并恢复'}))return;
    setRestoring(true);setError('');
    try{
      await collection<ComicProject>('comic').flush(p.id);
      // Only overwrite the exact revision the user compared, not a newer edit from another device.
      if(!attempt.current)attempt.current={version:snapshot.revision,revision:comparison.revision,clientId:crypto.randomUUID()};
      const a=attempt.current;await oneStopRequest(base+'/'+a.version+'/restore',{method:'POST',body:JSON.stringify({revision:a.revision,clientId:a.clientId})});
      const current=await collection<ComicProject>('comic').open(p.id);if(current){onRestored(current);toast.success('已恢复历史阶段，当前内容也已备份；未调用模型');onClose();}
    }catch(e){if(alive.current)setError((e as Error).message+'；连接中断时请先刷新核对，不要更换操作编号重复提交。');}finally{if(alive.current)setRestoring(false);}
  };
  const download=()=>{if(!snapshot)return;const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${p.name}-版本${snapshot.revision}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <Dialog open onOpenChange={open=>{if(!open&&!restoring)onClose();}}><DialogContent className="os-history-dialog" title="阶段历史与恢复" description="查看每次生成前的内容。恢复只修改项目记录，不调用模型，也不删除媒体文件。">
    {error&&<p role="alert" className="os-readonly-note">{error}</p>}
    {busy&&<p className="os-readonly-note">项目有执行中或待核对任务，可以查看历史；完成或核对后才能恢复。</p>}
    <div className="os-history-layout"><aside aria-label="历史版本列表">{items.map(e=><button key={e.revision} onClick={()=>void select(e)} aria-pressed={snapshot?.revision===e.revision} disabled={restoring}><History size={14}/><span><strong>{e.operation==='restore'?'恢复前备份':STAGE_DEFS[e.stage as StageKey]?.label||e.operation} · #{e.revision}</strong><small>{new Date(e.createdAt).toLocaleString('zh-CN')}</small></span></button>)}{loading?<p><Loader2 size={14} className="animate-spin"/>正在读取…</p>:!items.length?<p>暂无生成历史。手动保存不会调用模型，也不伪造生成版本。</p>:more&&<Button variant="ghost" onClick={()=>void load(page+1)}>加载更多</Button>}{error&&!items.length&&<Button variant="secondary" onClick={()=>void load(1)}>重新读取</Button>}</aside>
      <section>{snapshot&&comparison?<><div className="os-history-panels"><div><h3>本次生成前的内容</h3><pre>{readable(snapshot.value)}</pre></div><div><h3>当前项目内容 · #{comparison.revision}</h3><pre>{readable(currentValue(comparison.payload,snapshot))}</pre></div></div><div className="os-dialog-actions"><Button variant="secondary" disabled={restoring} onClick={download}><Download size={14}/>下载完整快照</Button><Button disabled={busy||restoring} onClick={()=>void restore()}>{restoring?<Loader2 size={14} className="animate-spin"/>:<RotateCcw size={14}/>}恢复此阶段</Button></div></>:<div className="os-frame-empty">选择左侧历史记录，对照查看后再决定是否恢复。</div>}</section>
    </div>
  </DialogContent></Dialog>;
}
