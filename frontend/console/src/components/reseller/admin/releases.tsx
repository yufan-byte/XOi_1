"use client";
import {useState} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {RefreshCw,ShieldCheck,Server,GitBranch,Download} from "lucide-react";
import {cn} from "@/lib/utils";
import {toast} from "sonner";
import {api} from "@/lib/api";
import {useResellerMe} from "@/lib/reseller/client";
import {Button} from "@/components/ui/button";
import {SectionHero} from "@/components/reseller/common";
import * as Dialog from "@radix-ui/react-dialog";

type Node={instanceId:string;label:string;release:string;heartbeatAt:number;revision:number;online:boolean;ready:boolean;dependenciesReady:boolean;desiredDraining:boolean;observedDraining:boolean;observedIdle:boolean;activity:{http:number;socket:number;media:number;claiming:boolean;pending:number;legacyPending:number}};
type State={currentInstanceId:string;rolloutEnabled:boolean;instances:Node[];audit:{id:string;instance_id:string;release:string;action:string;operator_id:number;reason:string;created_at:string}[]};
export function ReleasesView(){
  const me=useResellerMe(),root=me.data?.scope==="platform"&&me.data.root===true;
  const cache=useQueryClient();
  const [pending,setPending]=useState<{node:Node;action:"drain"|"resume"}|null>(null),[reason,setReason]=useState("");
  const state=useQuery({queryKey:["admin-releases"],queryFn:()=>api<State>("/api/admin/releases"),enabled:root,refetchInterval:5000,retry:false});
  const change=useMutation({mutationFn:()=>api("/api/admin/releases/"+pending!.node.instanceId+"/control",{method:"POST",headers:{"X-XOi-Release-Intent":"node-control"},body:JSON.stringify({revision:pending!.node.revision,action:pending!.action,reason:reason.trim(),confirm:"CONFIRM_NODE_CONTROL"})}),retry:false,
    onSuccess:()=>{toast.success("节点指令已登记，请等待心跳确认；未执行重启或安装");setPending(null);setReason("");void cache.invalidateQueries({queryKey:["admin-releases"]});},
    onError:(e:Error)=>{toast.error(e.message);setPending(null);void cache.invalidateQueries({queryKey:["admin-releases"]});}});
  if(me.isPending)return <p className="p-6 text-sm text-muted-foreground">正在核验发布权限…</p>;
  if(!root)return <div className="rounded-2xl border bg-card p-8"><ShieldCheck className="mb-3 text-muted-foreground"/><h1 className="font-semibold">仅平台超级管理员可访问</h1><p className="mt-2 text-sm text-muted-foreground">普通管理员、代理和团队成员不能查看节点或执行发布操作。</p></div>;
  return <div className="flex flex-col gap-5">
    <SectionHero badge="发布运维" icon={<GitBranch size={14}/>} title="版本与节点" subtitle="先启动并验证新节点，再让旧节点完成手里的工作。"/>
    <UpdateCard/>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5"><div><p className="font-medium">{state.data?.rolloutEnabled?"多节点发布已启用":"当前仅监控，未开放多节点摘流"}</p><p className="mt-1 text-sm text-muted-foreground">此页的节点控制不会下载代码或安装文件；脚本更新仅在上方「版本与更新」卡片中发起。</p></div><Button variant="outline" disabled={state.isFetching} onClick={()=>void state.refetch()}><RefreshCw size={14} className="mr-2"/>刷新状态</Button></div>
    {state.isError&&<div role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">{state.error.message}；没有执行任何发布操作。</div>}
    {state.isPending&&<p className="p-5 text-sm text-muted-foreground">正在读取节点状态…</p>}
    {state.data?.instances.map(node=><div key={node.instanceId} className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><div className="grid size-10 place-items-center rounded-xl bg-muted"><Server size={19}/></div><div><h2 className="font-semibold">{node.label}<span className="ml-2 text-xs font-normal text-muted-foreground">{node.instanceId===state.data.currentInstanceId?"当前响应节点":""}</span></h2><p className="mt-1 font-mono text-xs text-muted-foreground">{node.release}</p></div></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{!node.online?"心跳过期":node.observedIdle?"已观测任务归零":node.observedDraining?"正在排空":node.desiredDraining?"等待摘流确认":node.ready?"可接流量":"依赖未就绪"}</span></div>
      <div className="my-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["HTTP 请求",node.activity.http],["实时会话任务",node.activity.socket],["媒体执行",node.activity.media],["待核对任务",node.activity.pending+node.activity.legacyPending]].map(([label,n])=><div key={String(label)} className="rounded-xl bg-muted/50 px-4 py-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{n}</div></div>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">最近心跳 {new Date(node.heartbeatAt).toLocaleTimeString()} · 状态版本 {node.revision} · {node.dependenciesReady?"依赖已就绪":"依赖未就绪"}{node.activity.claiming?" · 调度确认中":""}</p><Button size="sm" variant="outline" disabled={!node.online||change.isPending||(!node.desiredDraining&&!state.data.rolloutEnabled)||(node.desiredDraining&&!node.dependenciesReady)} onClick={()=>{setPending({node,action:node.desiredDraining?"resume":"drain"});setReason("");}}>{node.desiredDraining?"恢复接流":"申请排空"}</Button></div>
    </div>)}
    <Dialog.Root open={!!pending} onOpenChange={open=>{if(!open&&!change.isPending)setPending(null);}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[100] bg-black/30"/><Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-6 shadow-xl"><Dialog.Title className="text-lg font-semibold">确认{pending?.action==="drain"?"排空":"恢复"} {pending?.node.label}？</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">只操作这一个节点，不影响账号、积分和价格。排空不会强制终止正在执行的任务；没有健康替代节点会被拒绝。</Dialog.Description><label className="mt-5 block text-sm">操作原因<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={200} placeholder="例如：发布已验收的新版本" className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm"/></label><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={change.isPending} onClick={()=>setPending(null)}>取消</Button><Button disabled={!reason.trim()||change.isPending} onClick={()=>change.mutate()}>{change.isPending?"提交中…":"确认节点操作"}</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    <div className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">最近操作</h2><div className="mt-3 divide-y">{state.data?.audit.map(row=><div key={row.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{row.action==="drain"?"申请排空":"恢复接流"} · {row.release}</span><time className="text-xs text-muted-foreground">{new Date(Number(row.created_at)).toLocaleString()}</time></div><p className="mt-1 text-xs text-muted-foreground">操作人 ID {row.operator_id} · 节点 {row.instance_id.slice(0,8)} · {row.reason}</p></div>)}{state.data&&!state.data.audit.length&&<p className="py-3 text-sm text-muted-foreground">尚无节点控制记录</p>}</div></div>
    <p className="text-xs leading-6 text-muted-foreground">“任务归零”是当前心跳的观测结果，不等于已完成发布验收。停止容器前仍需检查账单、上游任务和长连接；此功能不代替预发、备份、负载均衡与恢复演练。</p>
  </div>;
}


/* ─────────────── 版本与更新（2026-10-24：对齐参考站的系统配置卡） ───────────────
 * 检查更新读 GitHub Releases（服务端走 SSRF 防护出站，5 分钟缓存）；
 * 「立即更新」只在服务器开启 XOI_UPDATE_MODE=git-script 且放置了 ops/update.sh 时可用，
 * 触发的是服务端固定脚本（rootOnly + 原因必填 + 二次确认），更新由守护进程拉起新版本。 */
type CurrentInfo = { release: string; mode: string; modeLabel: string; commit?: string; branch?: string; scriptReady: boolean };
type LatestInfo = { configured: boolean; tag?: string; name?: string; notes?: string; publishedAt?: string; url?: string; message?: string };
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function UpdateCard() {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ["update-current"], queryFn: () => api<CurrentInfo>("/api/admin/update/current") });
  const latest = useQuery({ queryKey: ["update-latest"], queryFn: () => api<LatestInfo>("/api/admin/update/latest"), staleTime: 300_000 });
  const log = useQuery({ queryKey: ["update-log"], queryFn: () => api<{ log: string; updatedAt: string | null }>("/api/admin/update/log"), refetchInterval: confirming ? 3000 : 15000 });
  const run = useMutation({
    mutationFn: () => api<{ started: boolean }>("/api/admin/update/run", { method: "POST", body: JSON.stringify({ target: target.trim(), reason: reason.trim() }) }),
    onSuccess: () => { toast.success("更新脚本已启动：切换版本 → 构建 → 重启。期间站点会短暂 502，完成后请核对版本号。"); setConfirming(false); void qc.invalidateQueries({ queryKey: ["update-log"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const info = current.data;
  const canRun = info?.mode === "git-script" && info.scriptReady && TAG_RE.test(target.trim()) && reason.trim().length >= 4;
  const behind = latest.data?.configured && latest.data.tag && latest.data.tag !== info?.release;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold">版本与更新</h2>
          <p className="mt-1 text-sm text-muted-foreground">从 GitHub 检查新版本。更新会切换代码、重新构建并重启程序，正在运行的任务会被中断。</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs">{info?.modeLabel ?? "…"}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">当前版本</span>
        <span className="rounded-lg bg-muted px-2.5 py-1 font-mono text-[13px] font-semibold">{info?.release ?? "…"}</span>
        {info?.commit ? <span className="font-mono text-xs text-muted-foreground">{info.branch}@{info.commit}</span> : null}
        {latest.data?.configured && latest.data.tag ? <><span className="text-muted-foreground">/</span><span className={cn("rounded-lg px-2.5 py-1 font-mono text-[13px] font-semibold", behind ? "bg-emerald-500/15 text-emerald-700" : "bg-muted")}>{latest.data.tag}{behind ? "（有新版本）" : "（已是最新）"}</span></> : null}
      </div>
      {latest.data?.configured === false ? <p className="mt-3 text-xs text-muted-foreground">{latest.data.message}。设置环境变量 <code className="font-mono">XOI_UPDATE_REPO=owner/repo</code> 后可检查远程版本。</p> : null}
      {latest.data?.configured && latest.data.notes ? (
        <details className="mt-3 rounded-xl border border-border/60 bg-muted/30"><summary className="cursor-pointer px-3.5 py-2 text-xs font-semibold text-muted-foreground">{latest.data.name || latest.data.tag} · 更新说明</summary><pre className="max-h-52 overflow-auto whitespace-pre-wrap px-3.5 pb-3 text-xs leading-relaxed text-muted-foreground">{latest.data.notes}</pre></details>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={latest.isFetching} onClick={() => void latest.refetch()}><RefreshCw size={14} className="mr-2"/>{latest.isFetching ? "检查中…" : "检查更新"}</Button>
        <Button disabled={!canRun || run.isPending} onClick={() => setConfirming(true)}><Download size={14} className="mr-2"/>立即更新</Button>
        {!canRun && info?.mode !== "git-script" ? <span className="text-xs text-muted-foreground">服务器开启 <code className="font-mono">XOI_UPDATE_MODE=git-script</code> 并放置 ops/update.sh 后可一键更新</span> : null}
        {info?.mode === "git-script" ? <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="目标版本号，如 v1.2.0" maxLength={80} className="h-9 w-44 rounded-lg border bg-background px-3 font-mono text-[13px]" aria-label="目标版本号" /> : null}
      </div>
      {info?.mode === "git-script" ? <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="更新原因（必填，记入更新日志）" maxLength={200} className="mt-2 h-9 w-full max-w-md rounded-lg border bg-background px-3 text-[13px]" aria-label="更新原因" /> : null}
      {info?.mode === "git-script" && !info.scriptReady ? <p className="mt-2 text-xs text-amber-600">服务器上缺少 ops/update.sh：请按《部署方案总纲》放置更新脚本后再启用一键更新。</p> : null}
      <details className="mt-4 rounded-xl border border-border/60 bg-muted/30" open={!!log.data?.log}>
        <summary className="cursor-pointer px-3.5 py-2 text-xs font-semibold text-muted-foreground">更新日志（最近 16KB）{log.data?.updatedAt ? ` · ${new Date(log.data.updatedAt).toLocaleString()}` : ""}</summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3.5 pb-3 text-[11px] leading-relaxed text-muted-foreground">{log.data?.log || "暂无更新记录"}</pre>
      </details>
      <Dialog.Root open={confirming} onOpenChange={setConfirming}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40"/><Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">确认更新到 {target.trim()}？</Dialog.Title>
          <Dialog.Description className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
            <p>将执行服务器更新脚本：切换代码 → 安装依赖 → 重新构建 → 重启程序。整个过程约数分钟，期间站点短暂不可用，正在运行的任务会被中断。</p>
            <p>更新前请确认：已完成数据库备份；目标版本已经过预发验收。此操作仅限站长。</p>
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirming(false)}>取消</Button><Button disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? "启动中…" : "确认并开始更新"}</Button></div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
