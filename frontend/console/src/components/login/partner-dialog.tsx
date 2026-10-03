"use client";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const TYPES = [["llm_api", "语言模型"], ["image_api", "图像生成"], ["video_api", "视频生成"], ["voice_api", "语音 / TTS"], ["multimodal", "多模态"], ["other", "其他"]] as const;
const EMPTY = { company: "", contact: "", wechat: "", phone: "", site: "", pricing: "", notes: "", website: "" };

const field = "h-11 w-full rounded-xl border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40";
const area = "w-full rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40";

/** 商务合作 → 成为上游渠道伙伴 表单弹窗（POST /api/partner-lead） */
export function PartnerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [f, setF] = useState(EMPTY); const [types, setTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const close = (v: boolean) => { onOpenChange(v); if (!v && done) { setF(EMPTY); setTypes([]); setDone(false); setErr(""); } };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (!f.contact.trim() || !f.pricing.trim()) { setErr("请填写联系人和提供的模型与价格"); return; }
    if (!f.wechat.trim() && !f.phone.trim()) { setErr("请至少留一个联系方式 (微信或手机)"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/partner-lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, types }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!r.ok || !j.ok) throw new Error(j.message || "提交失败, 请稍后重试");
      setDone(true);
    } catch (ex) { setErr((ex as Error).message === "Failed to fetch" ? "提交失败, 请稍后重试" : (ex as Error).message || "提交失败, 请稍后重试"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title="成为上游渠道伙伴" description="您提供模型与算力, 我们带来稳定流量与结算。留下联系方式, 我们尽快对接。" className="w-[min(92vw,560px)] text-foreground">
        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-tint text-accent-foreground"><Check size={26} /></div>
            <h3 className="mt-4 text-lg font-semibold">已收到您的合作意向</h3>
            <p className="mt-2 text-sm text-muted-foreground">我们的商务团队会尽快与您联系, 感谢您选择 {SITE.name}。</p>
            <Button className="mt-6 w-full" size="lg" onClick={() => close(false)}>完成</Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="max-h-[70vh] space-y-3.5 overflow-y-auto pr-1 text-sm">
            <label className="block"><span className="mb-1.5 block">公司 / 平台名称</span><input value={f.company} onChange={set("company")} placeholder="选填, 例: 某某中转 / 某某云" className={field} /></label>
            <label className="block"><span className="mb-1.5 block">联系人 <span className="text-danger">*</span></span><input value={f.contact} onChange={set("contact")} placeholder="您的称呼" required className={field} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="mb-1.5 block">微信</span><input value={f.wechat} onChange={set("wechat")} placeholder="微信号" className={field} /></label>
              <label className="block"><span className="mb-1.5 block">手机</span><input value={f.phone} onChange={set("phone")} placeholder="手机号" inputMode="tel" className={field} /></label>
            </div>
            <label className="block"><span className="mb-1.5 block">官网 / 后台地址</span><input value={f.site} onChange={set("site")} placeholder="选填, https://" inputMode="url" className={field} /></label>
            {/* 蜜罐：真人看不到也不会填 */}
            <label className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label>
            <div>
              <div className="mb-1.5">可提供的能力</div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="可提供的能力">
                {TYPES.map(([k, l]) => { const on = types.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => setTypes((t) => (on ? t.filter((x) => x !== k) : [...t, k]))} className={cn("chip", on && "chip-active")}>{l}</button>; })}
              </div>
            </div>
            <label className="block"><span className="mb-1.5 block">提供的模型与价格 <span className="text-danger">*</span></span><textarea value={f.pricing} onChange={set("pricing")} rows={3} required placeholder="例: GT-5.4 0.3 折 / VO-3.1 按次 / 自有算力直连…" className={area} /></label>
            <label className="block"><span className="mb-1.5 block">补充说明</span><textarea value={f.notes} onChange={set("notes")} rows={2} placeholder="选填: 充值优惠 / 并发上限 / 结算方式等" className={area} /></label>
            {err && <p role="alert" className="text-xs text-danger">{err}</p>}
            <Button type="submit" size="lg" disabled={busy} className="w-full">{busy ? <><Loader2 size={16} className="animate-spin" />提交中…</> : "提交合作意向"}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
