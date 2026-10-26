import {useState} from 'react';
import {Check,ChevronDown,Search,Sparkles,Image,Film,AudioLines,MessageSquare} from 'lucide-react';
import {Dialog,DialogContent} from '@/components/ui/dialog';
import {useCatalog} from './queries';
import {providerLogoFor} from './provider-logos';
const labels:Record<string,string>={chat:'文案模型',image:'图片模型',video:'视频模型',audio:'配音模型'};
const icons={chat:MessageSquare,image:Image,video:Film,audio:AudioLines};
export function ModelPicker({value,onChange,category='chat',className='',label,showPrice=false}:{value?:string;onChange:(value:string)=>void;category?:string;className?:string;label?:string;showPrice?:boolean;[key:string]:unknown}){
  const {data,isPending,isError,refetch}=useCatalog(),[q,setQ]=useState(''),[open,setOpen]=useState(false),[tab,setTab]=useState<'recommended'|'all'>('recommended');
  const all=(data?.models||[]).filter(m=>m.category===category),selected=all.find(m=>m.id===value);
  const recommended=all.filter(m=>m.featured),pool=q.trim()?all:tab==='recommended'?(recommended.length?recommended:all.slice(0,4)):all;
  const models=pool.filter(m=>!q.trim()||`${m.name} ${m.id} ${m.series}`.toLowerCase().includes(q.trim().toLowerCase()));
  const Icon=icons[category as keyof typeof icons]||Sparkles;
  const selectedLogo=providerLogoFor(selected?.series,selected?.name,selected?.id);
  return <><button type="button" className={`os-model-trigger ${className}`} onClick={()=>{setQ('');setOpen(true);}} aria-label={`选择${labels[category]||'模型'}`} aria-haspopup="dialog"><span className="os-model-symbol">{selectedLogo?<img className="os-model-logo" src={selectedLogo} alt=""/>:<Icon size={17}/>}</span><span className="os-model-copy">{label&&<small>{label}</small>}<strong>{selected?.name||(isPending?'读取模型…':value?'原模型暂不可用':'选择模型')}</strong>{showPrice&&<span title={selected?.price}>{selected?.price||'选择后查看基础单价'}</span>}</span><ChevronDown size={14}/></button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="os-model-dialog" title={`选择${labels[category]||'创作模型'}`} description="按用途选择，平台自动分配渠道。更换模型不会发起生成。">
      <div className="os-model-tabs"><button type="button" aria-pressed={tab==='recommended'} onClick={()=>setTab('recommended')}>为你推荐</button><button type="button" aria-pressed={tab==='all'} onClick={()=>setTab('all')}>全部模型 <small>{all.length}</small></button></div>
      <label className="os-model-search"><Search size={16}/><input aria-label="搜索模型" placeholder="搜索模型名称或系列" value={q} onChange={e=>setQ(e.target.value)}/></label>
      <div className="os-model-options" role="listbox" aria-label={labels[category]}>{isPending?<p className="os-model-empty">正在读取模型与单价…</p>:isError?<div className="os-model-empty">模型目录暂不可用<button type="button" onClick={()=>void refetch()}>重新读取</button></div>:!models.length?<p className="os-model-empty">{q?'没有找到匹配模型':'暂无可选模型，可先创建草稿，稍后配置。'}</p>:models.map(m=>{const logo=providerLogoFor(m.series,m.name,m.id);return <button key={m.id} type="button" role="option" aria-selected={m.id===value} className="os-model-option" onClick={()=>{onChange(m.id);setOpen(false);}}><span className="os-model-symbol">{logo?<img className="os-model-logo" src={logo} alt=""/>:<Icon size={18}/>}</span><span className="os-model-option-copy"><strong>{m.name}{m.featured&&<em>推荐</em>}</strong>{m.description&&<small>{m.description}</small>}<span>{m.price}</span></span>{m.id===value&&<Check size={17}/>}</button>})}</div>
      <footer className="os-model-footer">1 元 = 10 积分 · 这里是基础单价，不是整部作品总价</footer>
    </DialogContent></Dialog></>;
}
