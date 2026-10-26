import {useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {RefreshCw} from "lucide-react";
import {toast} from "sonner";
import {api,loadAuth} from "@/lib/api";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent} from "@/components/ui/dialog";
import {cn} from "@/lib/utils";
import {CREDIT_RULE_LABEL,formatTeamQuota} from "@/lib/team-presentation";

type Row={id:string;kind?:string;userId?:number;nickname?:string;amount?:number;poolAfter?:number;actorId:number;at:number;action?:string;status?:string;memberId?:number;details?:{name?:string;previousName?:string;nickname?:string;limitQuota?:number;period?:string;canViewAll?:boolean}};
const ACTIONS:Record<string,string>={"member.add":"添加成员","member.update":"修改成员额度与权限","member.password":"修改成员密码","member.disable":"停用成员","member.enable":"启用成员","member.delete":"移除成员","team.rename":"修改团队名称"};
const FLOWS:Record<string,string>={transfer_in:"个人划入团队",transfer_out:"团队转回个人",allocate:"分配给成员",reclaim:"回收到团队池"};
function details(row:Row){
  const d=row.details??{},parts:string[]=[];
  if(row.action==="team.rename")return `${d.previousName||"—"} → ${d.name||"—"}`;
  if(d.nickname)parts.push(d.nickname);else if(row.memberId)parts.push(`成员 #${row.memberId}`);
  if(d.limitQuota!==undefined)parts.push(`上限 ${d.limitQuota===0?"不限额":formatTeamQuota(d.limitQuota)}`);
  if(d.period)parts.push(({day:"每日",month:"每月",total:"累计"} as Record<string,string>)[d.period]||d.period);
  if(d.canViewAll!==undefined)parts.push(d.canViewAll?"可查看全团队消费":"仅查看本人消费");
  if(row.action==="member.password")parts.push("不记录密码内容");
  return parts.join(" · ")||"—";
}
function time(at:number){return new Date(at).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false});}
export function TeamManagementPanel(){
  const [view,setView]=useState<"ledger"|"operations">("ledger"),[page,setPage]=useState(1);
  const query=useQuery({queryKey:["team-management",loadAuth()?.user.id??0,view,page],queryFn:()=>api<{items:Row[];total:number;pageSize:number}>(`/api/team/management?view=${view}&page=${page}`),retry:false});
  const rows=query.data?.items??[],pages=Math.max(1,Math.ceil((query.data?.total??0)/20));
  return <section className="rounded-2xl border border-border/60 bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">团队管理记录</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">仅团队所有者可见 · 时间按北京时间 · {CREDIT_RULE_LABEL}</p></div><Button variant="secondary" size="sm" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={14}/>{query.isFetching?"更新中…":"刷新记录"}</Button></div>
    <div className="mt-4 flex gap-2" role="group" aria-label="管理记录类型">{([["ledger","积分流转"],["operations","成员与设置操作"]] as const).map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>{setView(key);setPage(1);}} className={cn("rounded-xl px-3 py-2 text-sm",view===key?"bg-primary/10 font-medium text-primary":"text-muted-foreground hover:bg-muted")}>{label}</button>)}</div>
    {query.isError&&<div role="alert" className="mt-4 rounded-xl border border-danger/20 p-4 text-sm text-danger">管理记录暂时未能加载，请稍后重试。请先核对已提交的操作，避免重复提交。</div>}
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="py-3">时间</th><th>{view==="ledger"?"流转类型":"操作"}</th><th>{view==="ledger"?"关联成员":"内容"}</th><th className="text-right">{view==="ledger"?"团队池变化":"结果"}</th>{view==="ledger"&&<th className="text-right">流转后池余额</th>}</tr></thead><tbody className="divide-y">{rows.map(row=>{
      const incoming=row.kind==="transfer_in"||row.kind==="reclaim",known=!!FLOWS[row.kind||""];
      return <tr key={row.id}><td className="py-4 text-xs text-muted-foreground">{time(row.at)}</td><td>{view==="ledger"?FLOWS[row.kind||""]||"其他流转":ACTIONS[row.action||""]||"其他操作"}</td><td className="max-w-[300px] break-words text-xs text-muted-foreground">{view==="ledger"?(row.nickname||(row.userId===row.actorId?"团队所有者":row.userId?`成员 #${row.userId}`:"—")):details(row)}</td><td className={cn("text-right tabular-nums",view==="operations"&&row.status!=="confirmed"&&"text-warning")}>{view==="ledger"?`${known?(incoming?"+":"−"):""}${formatTeamQuota(row.amount??NaN)}`:row.status==="confirmed"?"已完成":row.status==="needs_review"?"结果待核对":"处理中 / 结果未确认"}</td>{view==="ledger"&&<td className="text-right tabular-nums">{formatTeamQuota(row.poolAfter??NaN)}</td>}</tr>;
    })}</tbody></table></div>
    {query.isLoading&&<p role="status" className="py-8 text-center text-sm text-muted-foreground">正在读取管理记录…</p>}
    {query.isSuccess&&!rows.length&&<p className="py-8 text-center text-sm text-muted-foreground">暂无此类记录</p>}
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>第 {page} / {pages} 页 · {query.data?.total??"—"} 条</span><div className="flex gap-3"><button disabled={page<=1||query.isFetching} onClick={()=>setPage(p=>p-1)} className="disabled:opacity-40">上一页</button><button disabled={page>=pages||query.isFetching} onClick={()=>setPage(p=>p+1)} className="disabled:opacity-40">下一页</button></div></div>
    <p className="mt-5 border-t pt-4 text-xs leading-6 text-muted-foreground">积分流转不是模型消费。操作记录从此功能启用后开始保留；若显示“结果待核对”或长时间未确认，请先刷新成员与积分记录，避免重复提交。历史操作不会凭空补记。</p>
  </section>;
}
export function TeamRenameDialog({name,onClose,onDone}:{name:string;onClose:()=>void;onDone:()=>void}){
  const [value,setValue]=useState(name),[busy,setBusy]=useState(false),lock=useRef(false);
  async function save(){
    const clean=value.trim();if(lock.current)return;if(!clean||clean.length>40){toast.error("团队名称需 1–40 字");return;}
    if(clean===name){onClose();return;}lock.current=true;setBusy(true);
    try{await api("/api/team/management",{method:"PATCH",body:JSON.stringify({name:clean,expectedName:name})});toast.success("团队名称已更新");onDone();onClose();}catch(e){toast.error((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent title="修改团队名称" description="只修改显示名称，不改变成员、积分或项目权限。"><label className="text-sm">团队名称<input aria-label="新的团队名称" value={value} disabled={busy} maxLength={40} onChange={e=>setValue(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3"/></label><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy||!value.trim()} onClick={()=>void save()}>{busy?"保存中…":"保存名称"}</Button></div></DialogContent></Dialog>;
}
