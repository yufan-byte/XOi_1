import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { collection } from "./collections";
import { accountKey, oneStopRequest } from "./request";
import { formatYuan, formatPoints } from "../../../../src/utils/points";
import {checkDailySpendReminder} from '../../../../src/utils/dailySpend';
import {useActionConfirmation} from './action-confirmation';
import type { ComicProject } from "../comic/types";
import { generationScope } from "./isolation-keys";
export type Operation =
  | "bible"
  | "intent"
  | "direction"
  | "outline"
  | "novel"
  | "script"
  | "assets"
  | "shots"
  | "asset-image"
  | "storyboard-image"
  | "scene-video"
  | "speech"
  | "voice-sample"
  | "asset-images"
  | "storyboard-images"
  | "scene-videos"
  | "autopilot"
  | "render"
  | "motion-video";
// Server-only composition has no model request and no model charge.
export type Generate = {
  projectId: string;
  operation: Operation;
  target?: string;
  index?: number;
  prompt?: string;
  voice?: string;
  seconds?: number;
  variant?: "main" | "extra";
  replace?:boolean;
};
type Handler = (input: Generate) => Promise<any>;
const handlers = new Map<string, Handler>();
const textListeners=new Map<string,(text:string)=>void>();
export function observeGenerationText(id:string,listener:(text:string)=>void){const key=generationScope(accountKey(),id);textListeners.set(key,listener);return()=>{if(textListeners.get(key)===listener)textListeners.delete(key);};}
export function runProjectGeneration(p: Pick<ComicProject, "id">, operation: Operation, options: Partial<Generate> = {}) {
  const handler = handlers.get(generationScope(accountKey(), p.id));
  if (!handler) throw new Error("请在项目工作区内生成");
  return handler({ ...options, projectId: p.id, operation });
}
const api = <T,>(path: string, body?: unknown) =>
  oneStopRequest<T>("/api/one-stop/generation/" + path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
export async function recoverExistingVideo(p: ComicProject, upstreamId: string) {
  const owner = accountKey();
  const jobs = await api<any[]>("jobs?projectId=" + encodeURIComponent(p.id));
  if (accountKey() !== owner) throw new Error("账号已切换");
  const job = jobs.find((j) => j.upstreamId === upstreamId);
  if (!job) return { kind: "later" as const, message: "没有找到当前账号对应的原任务，请在后台任务列表核对" };
  const result = await api<any>("jobs/" + job.id + "/recover", {});
  return result.url ? { kind: "done" as const, url: result.url } : { kind: "later" as const, message: result.message || "原任务尚未完成" };
}
export function GenerationPanel({
  projectId,
  onProject,
  onBusy,
}: {
  projectId: string;
  onProject: (p: ComicProject) => void;
  onBusy: (busy: boolean) => void;
}) {
  const ask=useActionConfirmation();
  const [jobs, setJobs] = useState<any[]>([]),
    [showHistory,setShowHistory]=useState(false),
    [quote, setQuote] = useState<any>(),
    [points, setPoints] = useState(10),
    [loading, setLoading] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState(""),
    [connectionError, setConnectionError] = useState(false);
  const pending = useRef<
    { input: Generate; resolve: (v: any) => void; reject: (e: Error) => void; id?: string; clientId: string; owner: string } | undefined
  >(undefined);
  const mounted = useRef(true),
    preparing = useRef(false),
    hasActive = useRef(false),
    lastRead = useRef(0),
    reading = useRef(false),
    owner = accountKey();
  const scope = generationScope(owner, projectId);
  const epochRef = useRef({scope});
  if (epochRef.current.scope !== scope) epochRef.current = {scope};
  const epoch = epochRef.current;
  const valid = () => mounted.current && epochRef.current === epoch && accountKey() === owner;
  const projectCallback = useRef(onProject),
    busyCallback = useRef(onBusy);
  projectCallback.current = onProject;
  busyCallback.current = onBusy;
  const read = async () => {
    if (!valid() || reading.current) return;
    reading.current = true;
    lastRead.current = Date.now();
    try {
      const next = await api<any[]>("jobs?projectId=" + encodeURIComponent(projectId));
      if (!valid()) return;
      setConnectionError(false);
      setJobs(next);
      const streamed=next.find(j=>j.status==='running'&&j.pendingStep?.operation==='novel'&&typeof j.partialText==='string');
      if(streamed)textListeners.get(scope)?.(streamed.partialText);
      void checkDailySpendReminder();
      const active = next.some((j) => ["queued", "running"].includes(j.status)) || !!(pending.current?.id && !next.some(j=>j.id===pending.current?.id));
      // Keep the editing fence until the final document is read, including reloads
      // where this tab did not submit the task and has no pending Promise.
      if (active || hasActive.current || pending.current?.id) {
        const col = collection<ComicProject>("comic");
        const p = await col.open(projectId);
        if (p && valid()) projectCallback.current(p);
      }
      if(!valid())return;
      hasActive.current = active;
      busyCallback.current(active || next.some((j) => j.status === "unknown"));
      const current = pending.current,
        finished = current?.id ? next.find((j) => j.id === current.id) : undefined;
      if (current && finished && !["queued", "running"].includes(finished.status)) {
        pending.current = undefined;
        if (finished.status === "succeeded") {
          current.resolve(finished.result);
          toast.success("本轮结果已保存，可在任务中查看积分回执");
        } else current.reject(new Error(finished.error || "任务已停止，请核对原任务和积分明细"));
      }
    } catch (e) {
      if (valid()) setConnectionError(true);
      throw e;
    } finally {
      if (valid()) reading.current = false;
    }
  };
  useEffect(() => {
    mounted.current = true;
    reading.current = false; preparing.current = false; hasActive.current = false; lastRead.current = 0;
    setJobs([]); setQuote(undefined); setLoading(false); setSubmitting(false);
    const handler: Handler = async (input) => {
      if (pending.current || preparing.current) throw new Error("已有生成操作待确认或执行，请先查看原任务");
      if (!valid() || input.projectId !== projectId) throw new Error("账号或项目已切换");
      setLoading(true);
      preparing.current = true;
      setError("");
      try {
        await collection<ComicProject>("comic").flush(projectId);
        if (!valid()) throw new Error("账号或项目已切换");
        const q = await api<any>("quote", input);
        if (!valid()) throw new Error("工作区已关闭或切换");
        if(q.automatic){
          return await new Promise((resolve,reject)=>{
            const current={input,resolve,reject,owner,clientId:crypto.randomUUID(),id:undefined as string|undefined};pending.current=current;
            busyCallback.current(true);
            void api<any>('jobs',{request:input,revision:q.revision,points:q.free?.001:q.defaultPoints,clientId:current.clientId,automatic:true}).then(async job=>{if(!valid()||pending.current!==current)return;current.id=job.id;hasActive.current=true;lastRead.current=0;await read();}).catch(e=>{if(!current.id){if(valid()&&pending.current===current){pending.current=undefined;busyCallback.current(false);}reject(e);}});
          });
        }
        setQuote(q);
        setPoints(q.defaultPoints);
        return await new Promise((resolve, reject) => {
          pending.current = { input, resolve, reject, owner, clientId: crypto.randomUUID() };
        });
      } finally {
        if (valid()) { preparing.current = false; setLoading(false); }
      }
    };
    handlers.set(scope, handler);
    void read().catch(() => {});
    const timer = setInterval(() => {
      const delay = document.hidden ? 15000 : hasActive.current ? 2500 : 30000;
      if (Date.now() - lastRead.current >= delay) void read().catch(() => {});
    }, 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      if (handlers.get(scope) === handler) handlers.delete(scope);
      pending.current?.reject(new Error("已离开工作区；已提交的任务继续在后台运行，请从任务列表找回"));
      pending.current = undefined;
    };
    // Callbacks are refs; the job subscription is account/project scoped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, owner]);
  const cancel = () => {
    if (submitting) return;
    pending.current?.reject(new Error("已取消，未提交模型"));
    pending.current = undefined;
    setQuote(undefined);
    setLoading(false);
  };
  const submit = async () => {
    const current = pending.current;
    if (!current || submitting) return;
    if (!valid() || current.owner !== owner || current.input.projectId !== projectId) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await api<any>("jobs", {
        request: current.input,
        revision: quote.revision,
        points: quote.free ? 0.001 : points,
        clientId: current.clientId,
      });
      if (!valid() || pending.current !== current) return;
      current.id = result.id;
      hasActive.current=true;
      lastRead.current=0;
      setQuote(undefined);
      busyCallback.current(true);
      await read();
    } catch (e) {
      setError((e as Error).message + "；如提交结果不明，请先刷新任务列表核对，不要连续重试。");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <>
      <section className="os-generation-panel" aria-label="后台生成任务">
        <div className="os-generation-heading">
          <strong>后台制作</strong>
          <span>按实际用量结算 · 成功步骤自动保存 · 日消费提醒不打断任务</span>
          <button type="button" onClick={() => void read().catch((e) => toast.error(e.message))}>
            刷新任务
          </button>
          {jobs.length>1 && <button type="button" onClick={()=>setShowHistory(v=>!v)}>{showHistory?'收起历史':`历史任务（${jobs.length-1}）`}</button>}
        </div>
        {jobs.some((j) => j.status === "running" && j.operation === "autopilot") && (() => {
          const ap = jobs.find((j) => j.status === "running" && j.operation === "autopilot")!;
          return (
            <div className="os-autopilot-live" role="status">
              <span className="os-autopilot-spin" aria-hidden />
              自动托管运行中：{ap.current || "推进中"}
              {typeof ap.progress === "number" && ap.progress > 0 ? ` · ${ap.progress}%` : ""}（关闭页面也会在服务器继续跑完）
            </div>
          );
        })()}
        {jobs.some((j) => j.status === "unknown") && (
          <div className="os-job-alert" role="alert">
            <strong>有一轮生成结果待核对，处理前本项目保持只读。</strong>
            有上游任务号的点「查询原视频」可找回结果；确认不需要后点「已核对，结束本轮」即可解锁继续制作（不退款，费用以积分明细为准）。
          </div>
        )}
        {jobs.some((j) => ["queued", "running"].includes(j.status) && j.recoveryRequired) && (
          <div className="os-job-alert warn" role="alert">
            <strong>检测到失联任务：状态长时间没有更新，服务可能已重启。</strong>
            可点该任务的「停止后续生成」后重新提交；已提交的请求费用以积分明细为准。
          </div>
        )}
        {connectionError && <p role="status">任务状态暂未同步，后台任务可能仍在运行。请恢复连接后刷新任务，不要重复提交。</p>}
        {loading && !quote && !jobs.some((j) => ["queued", "running"].includes(j.status)) && <p role="status">正在读取费用或等待后台任务…</p>}
        {(showHistory?jobs:jobs.filter((j,i)=>i===0||['queued','running','unknown'].includes(j.status))).slice(0,20).map((job) => (
          <div className="os-generation-job" key={job.id}>
            <div>
              <strong>{job.label}</strong>
              <span>
                {(
                  {
                    queued: "排队中",
                    running: (job.recoveryRequired ? "⚠ 已失联（服务可能重启）· " : "") + (job.current || "生成中"),
                    succeeded: "本轮已完成",
                    failed: "未完成",
                    unknown: "结果待核对",
                    cancelled: "已取消",
                  } as Record<string, string>
                )[job.status] || job.status}{" "}
                · 已保存 {job.steps?.length || 0} 步{job.limitPoints > 0.001 ? ` · 预算上限 ${job.limitPoints} 积分` : ""}
              </span>
              {job.error && <p>{job.error}</p>}
              {job.status==='running' && job.partialText && <details><summary>查看正在写作的正文</summary><pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs">{job.partialText}</pre></details>}
            </div>
            <div className="os-generation-job-actions">
              {typeof job.result?.url === "string" && /^\/oss\/one-stop\/\d+\/[a-f0-9-]+\.(png|mp4|mp3)$/.test(job.result.url) && (
                <a className="chip" href={job.result.url} target="_blank" rel="noopener noreferrer">
                  查看已归档素材
                </a>
              )}
              {["queued", "running"].includes(job.status) && (
                <button
                  type="button"
                  onClick={() =>
                    void api("jobs/" + job.id + "/stop", {})
                      .then(() => toast.info("已停止后续调用，已提交请求仍需核对"))
                      .catch((e) => toast.error(e.message))
                  }>
                  停止后续生成
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  void api<any>("jobs/" + job.id + "/receipt")
                    .then((r) =>
                      toast.info(
                        r.receipt.status==='not_billable'?'本次仅本地媒体处理，没有调用模型，模型积分消耗为 0。':`已记录用量：${formatPoints(r.receipt.points)}；${r.receipt.entries.length ? "以积分明细最终结算为准" : "回执尚未齐全，不代表免费"}`,
                      ),
                    )
                    .catch((e) => toast.error(e.message))
                }>
                积分回执
              </button>
              {job.status === "unknown" && job.upstreamId && (
                <button
                  type="button"
                  onClick={() =>
                    void api<any>("jobs/" + job.id + "/recover", {})
                      .then(async (r) => {
                        toast.info(r.url ? "原视频已找回，没有重新生成" : r.message);
                        const p = await collection<ComicProject>("comic").open(projectId);
                        if (p && valid()) projectCallback.current(p);
                        await read();
                      })
                      .catch((e) => toast.error(e.message))
                  }>
                  查询原视频
                </button>
              )}
              {job.status === "unknown" && (
                <button
                  type="button"
                  onClick={async () => {
                    if (await ask({title:'结束待核对状态？',description:'请先核对原任务和积分明细。这不会退款，也不会取消上游已接收的任务；结束后才能提交后续制作。',confirm:'已核对，结束本轮'}))
                      void api("jobs/" + job.id + "/acknowledge", { confirmed: true })
                        .then(() => read())
                        .catch((e) => toast.error(e.message));
                  }}>
                  已核对，结束本轮
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
      <Dialog
        open={!!quote}
        onOpenChange={(open) => {
          if (!open) cancel();
        }}>
        <DialogContent title={quote?.label || "确认制作预算"} description="确认后才会提交模型，1 元 = 10 积分。">
          <div className="space-y-3">
            {quote?.quotes.map((q: any) => (
              <div key={q.model} className="rounded-xl border p-3 text-sm">
                <strong>{q.name}</strong>
                <p className="mt-1 text-xs text-muted-foreground">
                  单次参考 {q.points} 积分（{formatYuan(q.yuan)}）
                </p>
              </div>
            ))}
            {quote?.free ? (
              <p className="text-sm">当前组合明确免费，本轮模型费 0 积分。仍受次数和超时限制。</p>
            ) : (
              <label className="flex items-center justify-between gap-3 text-sm">
                本轮预算硬上限
                <input
                  aria-label="本轮预算硬上限"
                  type="number"
                  min="0.001"
                  max="1000"
                  step="0.001"
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                  className="w-28 rounded-lg border px-3 py-2"
                />
                积分
              </label>
            )}
            <p className="text-xs leading-6 text-muted-foreground">
              {quote?.note} 停止只阻止后续调用；已经提交的请求可能产生费用。预算不是实际扣款。
            </p>
            {error && (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" disabled={submitting} onClick={cancel}>
                取消
              </Button>
              <Button disabled={submitting || !Number.isFinite(points) || points < 0.001 || points > 1000} onClick={() => void submit()}>
                {submitting ? "正在提交…" : "确认并开始"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
