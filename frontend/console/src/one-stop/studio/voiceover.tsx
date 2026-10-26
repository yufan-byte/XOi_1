// 用文案配音（造物 VoiceoverDialog 同款）：选音色、写文案，走 /v1/canvas/audio-tasks 合成，
// 成品直接挂进当前模式的参考音频上传格。计费与语音工作台同一套平台预算单（preview → 确认 → authorize）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import type { CatalogModel } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { OmniDialog } from "./ui";
import { voiceLibraryOf } from "../adapters/voices";
import { accountKey } from "../adapters/request";
import { cn } from "@/lib/utils";

type BillingPreview = { label: string; model: string; modelId?: string; free?: boolean; quote?: { yuan: number } | null; budget: { defaultPoints: number; maxPoints: number; maxCalls: number; minutes: number } };

async function audioFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accountKey();
  if (!token) throw new Error("请先登录");
  const res = await fetch(path, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: token, "Content-Type": "application/json" }, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) throw new Error(body?.message || body?.error || `请求失败（${res.status}）`);
  return ((body && typeof body === "object" && "data" in body ? body.data : body) ?? body) as T;
}

export function VoiceoverDialog({ open, onOpenChange, model, slotLabel, minSec, maxSec, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  /** 当前视频模型（取音色库与 schema 档位）；无语音能力时用通用音色表 */
  model: CatalogModel | null;
  slotLabel: string;
  minSec?: number; maxSec?: number;
  onDone: (url: string, seconds?: number) => void;
}) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState("1");
  const [busy, setBusy] = useState(false);
  const [pollTask, setPollTask] = useState<string | null>(null);
  const voices = useMemo(() => (model ? voiceLibraryOf(model) : []).slice(0, 60), [model]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const gen = useCallback(async () => {
    const t = text.trim();
    if (!t) { toast.error("先写要朗读的文案"); return; }
    if (t.length > 10000) { toast.error("文案最长 10000 字"); return; }
    const secs = Math.max(1, Math.ceil(t.length / 4));
    if (maxSec != null && secs > maxSec) toast.info(`文案预计约 ${secs} 秒，超过${slotLabel}上限 ${maxSec} 秒的部分可能被截断`);
    setBusy(true);
    try {
      const chatModel = { id: (model?.id || "") as string } as CatalogModel;
      const m = model ?? chatModel;
      const p = await audioFetch<BillingPreview>("/api/billing/preview", { method: "POST", body: JSON.stringify({ path: "/api/v1/canvas/audio-tasks", body: { model: pickSpeechModel(m), input: t, voice: voice || undefined, speed: Number(speed) || 1 } }) });
      if (!p?.budget) throw new Error("计费信息暂不可用，本次未提交");
      const freeOnly = p.free === true && p.quote?.yuan === 0 && !!p.modelId;
      const points = freeOnly ? 0.001 : await new Promise<number | null>((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#17151166;backdrop-filter:blur(4px)";
        const panel = document.createElement("section");
        panel.style.cssText = "width:min(420px,92vw);padding:24px;border:1px solid #dee1e8;border-radius:18px;background:#fff;color:#2e3138;font:14px/1.7 system-ui,'PingFang SC',sans-serif";
        const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
        panel.innerHTML = `<h2 style="margin:0 0 10px;font-size:17px">用文案配音 · 费用确认</h2><p style="margin:6px 0">${esc(p.label)} · ${esc(p.model)}</p><p style="margin:6px 0;color:#1e56c8;font-weight:600">${typeof p.quote?.yuan === "number" && p.quote.yuan > 0 ? `本次约 ${(p.quote.yuan * 10).toFixed(2)} 积分（¥${p.quote.yuan.toFixed(2)}）` : "暂无完整预估，不代表免费"}</p><label style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 0 4px;font-weight:600">本轮预算上限（积分）<input type="number" min="0.001" max="${p.budget.maxPoints}" step="0.001" value="${p.budget.defaultPoints}" style="width:110px;border:1px solid #ced2dc;border-radius:8px;padding:8px;font:inherit" /></label><footer style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button data-a="cancel" style="padding:9px 16px;border:1px solid #dee1e8;border-radius:10px;background:#fff;cursor:pointer;font:inherit">取消</button><button data-a="ok" style="padding:9px 16px;border:0;border-radius:10px;background:linear-gradient(135deg,#2e6ff7,#12c8ea);color:#fff;cursor:pointer;font:inherit">确认并合成</button></footer>`;
        overlay.append(panel); document.body.append(overlay);
        const close = (v: number | null) => { overlay.remove(); resolve(v); };
        panel.querySelector('[data-a="cancel"]')!.addEventListener("click", () => close(null));
        panel.querySelector('[data-a="ok"]')!.addEventListener("click", () => { const v = Number((panel.querySelector("input") as HTMLInputElement).value); close(Number.isFinite(v) && v >= 0.001 ? v : null); });
      });
      if (points === null) { toast.error("已取消，未提交合成"); return; }
      const authorized = await audioFetch<{ id: string }>("/api/billing/authorize", { method: "POST", body: JSON.stringify({ path: "/api/v1/canvas/audio-tasks", points, model: p.modelId, freeOnly, automatic: freeOnly }) });
      if (!/^[0-9a-f-]{36}$/.test(authorized?.id || "")) throw new Error("预算授权失败，未提交合成");
      const resp = await audioFetch<any>("/api/v1/canvas/audio-tasks", { method: "POST", headers: { "X-Xoi-Billing-Id": authorized.id }, body: JSON.stringify({ model: p.modelId, input: t, voice: voice || undefined, speed: Number(speed) || 1, response_format: "mp3" }) });
      const taskId = resp?.task_id || resp?.id;
      if (!taskId) throw new Error(resp?.error || "任务提交失败");
      toast.success("配音合成中，完成后自动挂进上传格");
      setPollTask(taskId);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }, [text, voice, speed, model, slotLabel, maxSec]);

  // 轮询合成结果；完成即回调挂进上传格
  useEffect(() => {
    if (!pollTask) return;
    const timer = setInterval(async () => {
      try {
        const t = await audioFetch<any>(`/api/v1/canvas/audio-tasks/${pollTask}`);
        if (t?.status === "completed" || t?.status === "succeeded") {
          const url = t?.url || t?.audio_url;
          if (typeof url === "string") { onDone(url, t?.seconds); toast.success("配音已生成并挂进上传格"); setPollTask(null); onOpenChange(false); setText(""); }
        } else if (t?.status === "failed") { toast.error(t?.error?.message || t?.error || "配音合成失败"); setPollTask(null); }
      } catch { /* 网络抖动下一拍再试 */ }
    }, 3000);
    timerRef.current = timer;
    return () => clearInterval(timer);
  }, [pollTask, onDone, onOpenChange]);

  return (
    <OmniDialog open={open} onOpenChange={onOpenChange} title={<>用文案配音</>} description={`选音色、写文案，生成的配音直接填进${slotLabel}`} icon={<Mic size={16} className="text-primary" />} className="sm:max-w-xl">
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="音色" value={voice} onChange={(e) => setVoice(e.target.value)} className="h-10 min-w-0 flex-1 cursor-pointer truncate rounded-2xl border border-border bg-card px-3 text-[13px] text-foreground outline-none focus:border-primary/40">
            <option value="">默认音色</option>
            {voices.map((vv) => <option key={vv.id} value={vv.id}>{vv.name}{[vv.gender, vv.language, ...(vv.styles ?? [])].filter(Boolean).length ? ` · ${[vv.gender, vv.language, ...(vv.styles ?? [])].filter(Boolean).join(" / ")}` : ""}</option>)}
          </select>
          <select aria-label="语速" value={speed} onChange={(e) => setSpeed(e.target.value)} className="h-10 cursor-pointer rounded-2xl border border-border bg-card px-3 text-[13px] text-foreground outline-none focus:border-primary/40">
            {["0.5", "0.75", "1", "1.25", "1.5", "2"].map((x) => <option key={x} value={x}>{x}x</option>)}
          </select>
        </div>
        <textarea aria-label="配音文案" rows={5} maxLength={10000} value={text} onChange={(e) => setText(e.target.value)} placeholder="写或粘贴要朗读的文案…" className="w-full resize-y rounded-2xl border border-border/60 bg-muted/40 px-3 py-2 text-[13px] leading-6 text-foreground outline-none focus:border-primary/40" />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{minSec != null || maxSec != null ? `${minSec != null ? `至少 ${minSec} 秒` : ""}${minSec != null && maxSec != null ? " · " : ""}${maxSec != null ? `最长 ${maxSec} 秒` : ""} · ` : ""}按实际合成计费</span>
          <span>{text.length} 字</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          {pollTask && <span className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 size={12} className="animate-spin" />合成中…</span>}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>关闭</Button>
          <Button disabled={busy || !text.trim()} onClick={() => void gen()}>{busy ? <><Loader2 size={14} className="animate-spin" />提交中…</> : <><Info size={14} className="opacity-60" />生成配音</>}</Button>
        </div>
      </div>
    </OmniDialog>
  );
}

/** 配音模型：视频项目里没有语音模型时，落到目录里第一条语音模型（由调用方的目录传入也可；这里从 schema 不可得，用固定解析） */
function pickSpeechModel(m: CatalogModel): string {
  // canvas-audio 只收语音合成模型；视频模型的 id 传给 preview 会被解析成最近可用语音模型（服务端 resolveUserCatalogModel 兜底）
  return (m as { id: string }).id || "";
}
