// 语音合成工作台：造物 /audio 工作台（MediaPage）的皮 + 本站 /v1/canvas/audio-tasks（TTS）的里子。
// 输入文案 → 选音色 / 语速 / 格式 → 提交后轮询取音频；按字符计费走平台预算单。
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Info } from "lucide-react";
import { toast } from "sonner";
import type { CatalogModel } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { accountKey } from "./adapters/request";
import { voiceLibraryOf } from "./adapters/voices";
import { MediaPage } from "./studio/media-page";
import { ParamSelect, ParamPills, PILL, countOptions, optionsOf, pickOf, bodyParams, type Field, type Schema, type Values } from "./studio/param-form";
import { useStudio } from "./studio/store";
import { notifyWork } from "./studio/inbox";

type BillingPreview = { label: string; model: string; modelId?: string; free?: boolean; quote?: { yuan: number } | null; basis?: string; budget: { defaultPoints: number; maxPoints: number; maxCalls: number; minutes: number } };
const FORMATS = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "opus", label: "OPUS" },
  { value: "aac", label: "AAC" },
  { value: "flac", label: "FLAC" },
];
const SAMPLES = ["欢迎来到一站式故事工作区，把你的故事讲给更多人听。", "夜深了，城市渐渐安静下来，只有路灯还亮着。", "限时特惠，今天下单立减五十！"];

async function audioFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accountKey();
  if (!token) throw new Error("请先登录");
  const res = await fetch(path, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: token, "Content-Type": "application/json" }, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) throw new Error(body?.message || body?.error || `请求失败（${res.status}）`);
  return ((body && typeof body === "object" && "data" in body ? body.data : body) ?? body) as T;
}

export function AudioStudio() {
  const addWork = useStudio((s) => s.addWork);
  const updateWork = useStudio((s) => s.updateWork);
  const works = useStudio((s) => s.works);
  const [bill, setBill] = useState<{ preview: BillingPreview; points: number; resolve: (v: number | null) => void } | null>(null);
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const previewKey = useRef("");
  const confirm = useCallback((p: BillingPreview) => new Promise<number | null>((resolve) => setBill({ preview: p, points: p.budget.defaultPoints, resolve })), []);

  /** 估价：按字符计费的模型报价跟文案长度走；preview 的 inputLength 用当前草稿字数（由 MediaPage 传入 prompt） */
  const estimate = useCallback((m: CatalogModel, v: Values, _mode: string, _media: { images: number; videos: number; audios: number }, prompt: string) => {
    const n = Math.max(1, Number(v.n ?? 1) || 1);
    const inputLength = Math.max(1, prompt.length);
    const key = [m.id, inputLength, v.voice ?? "", v.speed ?? ""].join("|");
    if (key !== previewKey.current) {
      previewKey.current = key;
      void audioFetch<BillingPreview>("/api/billing/preview", { method: "POST", body: JSON.stringify({ path: "/api/v1/canvas/audio-tasks", body: { model: m.id, input: "字", inputLength, voice: v.voice || undefined, speed: v.speed ? Number(v.speed) : undefined, ...bodyParams((m.paramSchema ?? {}) as Schema, v, undefined, ["voice", "speed", "response_format"]) } }) }).then(setPreview).catch(() => setPreview(null));
    }
    const quoteYuan = preview?.quote?.yuan;
    if (!Number.isFinite(quoteYuan as number)) return null;
    return {
      total: quoteYuan != null && quoteYuan > 0 ? `${(quoteYuan * 10 * n).toFixed(2)} 积分（¥${(quoteYuan * n).toFixed(2)}）` : "免费",
      rows: [["模型", m.name], ["文案长度", `${inputLength} 字`], ["音色", v.voice || "默认"], ["生成数量", `${n} 条`]] as [string, string][],
      cost: quoteYuan != null ? quoteYuan * n : undefined,
    };
  }, [preview]);

  const poll = useCallback((id: string, taskId: string) => {
    const settle = (patch: Parameters<typeof updateWork>[1]) => {
      updateWork(id, patch);
      const w = useStudio.getState().works.find((x) => x.id === id);
      if (w) notifyWork(w);
    };
    const timer = setInterval(async () => {
      try {
        const t = await audioFetch<any>(`/api/v1/canvas/audio-tasks/${taskId}`);
        const status = t?.status;
        if (status === "completed" || status === "succeeded") {
          const url = t?.url || t?.audio_url || t?.result?.url;
          if (typeof url === "string") { settle({ status: "done", url, urls: [url] }); clearInterval(timer); }
        } else if (status === "failed") { settle({ status: "failed", error: t?.error?.message || t?.error || "生成失败，可重试" }); clearInterval(timer); }
      } catch (e) { settle({ status: "failed", error: (e as Error).message }); clearInterval(timer); }
    }, 3000);
  }, [updateWork]);

  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return; resumed.current = true;
    for (const w of works) {
      if (w.kind !== "audio" || !w.taskId) continue;
      if (w.status === "running" || w.status === "pending") poll(w.id, w.taskId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(async (m: CatalogModel, prompt: string, v: Record<string, string>) => {
    const text = prompt.trim();
    if (!text) { toast.error("先写要朗读的文案"); return false; }
    if (text.length > 10000) { toast.error("文案最长 10000 字，请分段生成"); return false; }
    const schemaParams = bodyParams((m.paramSchema ?? {}) as Schema, v, undefined, ["voice", "speed", "response_format"]);
    const voiceId = v.voice || pickOf((m.paramSchema ?? {}) as Schema, "voice", v, undefined) || undefined;
    const speedNum = v.speed ? Number(v.speed) : undefined;
    const fmt = v.format || "mp3";
    const p = await audioFetch<BillingPreview>("/api/billing/preview", { method: "POST", body: JSON.stringify({ path: "/api/v1/canvas/audio-tasks", body: { model: m.id, input: text, voice: voiceId, speed: speedNum, response_format: fmt, ...schemaParams } }) });
    if (!p?.budget) throw new Error("计费信息暂不可用，本次未提交，请稍后重试");
    const freeOnly = p.free === true && p.quote?.yuan === 0 && !!p.modelId;
    const points = freeOnly ? 0.001 : await confirm(p);
    if (points === null || !Number.isFinite(points) || points <= 0) { toast.error("已取消，未提交模型请求"); return false; }
    const authorized = await audioFetch<{ id: string }>("/api/billing/authorize", { method: "POST", body: JSON.stringify({ path: "/api/v1/canvas/audio-tasks", points, model: p.modelId, freeOnly, automatic: freeOnly }) });
    if (!/^[0-9a-f-]{36}$/.test(authorized?.id || "")) throw new Error("预算授权失败，未提交模型请求");
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    addWork({ id, kind: "audio", model: m.id, prompt: text, createdAt: Date.now(), status: "running", meta: { voice: v.voice, mode: "语音合成", modeKey: "tts", params: v } });
    try {
      const resp = await audioFetch<any>("/api/v1/canvas/audio-tasks", {
        method: "POST",
        headers: { "X-Xoi-Billing-Id": authorized.id },
        body: JSON.stringify({ model: m.id, input: text, voice: voiceId, speed: speedNum, response_format: fmt, ...bodyParams((m.paramSchema ?? {}) as Schema, v, undefined, ["voice", "speed", "response_format"]) }),
      });
      const taskId = resp?.task_id || resp?.id;
      if (!taskId) throw new Error(resp?.error || "任务提交失败");
      toast.success("已提交后台合成");
      updateWork(id, { taskId });
      poll(id, taskId);
    } catch (e) {
      updateWork(id, { status: "failed", error: (e as Error).message });
      notifyWork({ id, kind: "audio", prompt: text, status: "failed", error: (e as Error).message });
      toast.error((e as Error).message);
    }
  }, [addWork, updateWork, poll, confirm]);

  const renderParams = useCallback((m: CatalogModel, v: Values, set: (k: string, s: string) => void) => {
    const sc = (m.paramSchema ?? {}) as Schema;
    const hasSchema = Object.keys(sc).length > 0;
    const voices = voiceLibraryOf(m);
    // 语速 / 格式：schema 给了枚举按它（计价与上游都以它为准），没给用通用档位
    const speedOpts = hasSchema && sc.speed ? optionsOf(sc, "speed", v, undefined) : ["0.5", "0.75", "1", "1.25", "1.5", "2"].map((x) => ({ value: x, label: `${x}x` }));
    const curSpeed = speedOpts.some((o) => o.value === v.speed) ? v.speed : (hasSchema && sc.speed ? pickOf(sc, "speed", v, undefined) : undefined) ?? speedOpts.find((o) => o.value === "1")?.value ?? speedOpts[0]?.value;
    const fmtOpts = hasSchema && sc.response_format ? optionsOf(sc, "response_format", v, undefined).map((o) => ({ ...o, label: o.label.toUpperCase() })) : FORMATS;
    const curFmt = fmtOpts.some((o) => o.value === v.format) ? v.format : (hasSchema && sc.response_format ? pickOf(sc, "response_format", v, undefined) : undefined) ?? "mp3";
    return (
      <>
        {voices.length > 0 && (
          <ParamSelect label="音色" value={voices.some((x) => x.id === v.voice) ? (v.voice as string) : voices[0].id}
            options={voices.slice(0, 60).map((x) => ({ value: x.id, label: x.name, description: [x.gender, x.language, ...(x.styles ?? [])].filter(Boolean).join(" · ") }))}
            onChange={(x) => set("voice", x)} className={cnPill} active />
        )}
        <ParamSelect label="语速" value={curSpeed ?? ""} options={speedOpts} onChange={(x) => set("speed", x)} className={PILL} active />
        <ParamSelect label="格式" value={curFmt ?? ""} options={fmtOpts} onChange={(x) => set("format", x)} className={PILL} />
        {/* 其余 schema 参数（情绪 / 情绪强度 / 变声 / 音效 / 档位 / 版本…） */}
        {hasSchema && <ParamPills schema={sc} values={v} onChange={set} exclude={["voice", "speed", "response_format"]} />}
      </>
    );
  }, []);

  return (
    <>
      <MediaPage
        modality="audio" label="音频"
        placeholder="粘贴要朗读的文案，或写一段口播稿；长文案按字数计费"
        modes={[{ key: "tts", label: "语音合成", icon: AudioLines, desc: "文字转语音，选音色与语速" }]}
        renderParams={renderParams}
        estimate={estimate}
        submit={submit}
        helpPrompt="你是配音文案专家。把用户的内容润色成适合朗读的口播文案，语句自然、有停顿感，保留原意，只输出文案。"
        samples={SAMPLES}
        playbook={<AudioPlaybook />}
        subtitleFor={() => "文字转语音 · 提交后可关闭页面"}
      />
      {bill && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[radial-gradient(48%_42%_at_50%_0,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_72%)] bg-background/60 p-4 backdrop-blur-[18px] animate-in fade-in-0" role="dialog" aria-modal="true" aria-label="语音合成费用确认">
          <div className="w-[min(92vw,440px)] overflow-hidden rounded-shell border border-foreground/10 bg-card shadow-pop animate-in fade-in-0 zoom-in-95">
            <div className="flex flex-col gap-2 border-b border-border/60 px-4 pb-3 pt-5 sm:px-6">
              <div className="flex items-center gap-2 text-[15px] font-semibold"><Info size={16} className="text-primary" />语音合成 · 费用确认</div>
              <p className="text-[12px] leading-[1.6] text-muted-foreground">这是安全上限，不是预扣款；仅按实际用量扣积分</p>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <p className="text-sm"><strong>{bill.preview.label}</strong> · {bill.preview.model}</p>
              <p className="mt-1 text-sm text-primary-strong">{typeof bill.preview.quote?.yuan === "number" && bill.preview.quote.yuan > 0 ? `本次约 ${(bill.preview.quote.yuan * 10).toFixed(2)} 积分（¥${bill.preview.quote.yuan.toFixed(2)}）` : "暂无完整预估，不代表免费"}</p>
              <label className="mt-4 flex items-center justify-between gap-3 text-sm font-medium">
                本轮预算上限（积分）
                <input type="number" min={0.001} max={bill.preview.budget.maxPoints} step={0.001} defaultValue={bill.points}
                  onChange={(e) => setBill({ ...bill, points: Number(e.target.value) })}
                  className="w-32 rounded-xl border border-border px-3 py-2 text-right font-mono text-sm outline-none focus:border-primary/40" />
              </label>
              <p className="mt-3 text-[12px] leading-5 text-muted-foreground">1 元 = 10 积分 · 按文案字数计费 · 失败自动退回</p>
            </div>
            <div className="flex justify-end gap-2 px-4 pb-4 sm:px-6">
              <Button variant="secondary" onClick={() => { bill.resolve(null); setBill(null); }}>取消</Button>
              <Button disabled={!Number.isFinite(bill.points) || bill.points < 0.001 || bill.points > bill.preview.budget.maxPoints} onClick={() => { const v = bill.points; bill.resolve(v); setBill(null); }}>确认并生成</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const cnPill = `${PILL} max-w-[280px]`;

function AudioPlaybook() {
  return (
    <div className="space-y-4 text-sm leading-6">
      <section><h3 className="font-semibold text-foreground">怎么用</h3>
        <p className="mt-1 text-muted-foreground">粘贴或撰写口播文案，选好音色与语速提交；约十几秒出音频，可关闭页面稍后回来收听 / 下载。</p>
      </section>
      <section><h3 className="font-semibold text-foreground">音色与语速</h3>
        <p className="mt-1 text-muted-foreground">音色决定声线（男女声、语言、风格），语速 0.25–4 倍可调；拿不准就先用默认音色试一小段。</p>
      </section>
      <section><h3 className="font-semibold text-foreground">计费方式</h3>
        <p className="mt-1 text-muted-foreground">按文案字数计费，提交前确认预算上限；失败自动退回。</p>
      </section>
    </div>
  );
}
