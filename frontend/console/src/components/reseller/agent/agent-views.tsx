"use client";
// 代理（站长批准的普通账号）自己的几块界面：加价设置、邀请客户。站长看到的是整站版本（models-center 等）。
// 数据接口按身份范围过滤：/api/reseller/models（代理 = 自己的加价）、/api/reseller/me（邀请码）。
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Copy, Globe, Link2, Ticket } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { SectionHero, VaultPanel } from "@/components/reseller/common";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useResellerMe } from "@/lib/reseller/client";
import type { ModelsConfig } from "@/lib/reseller/types";

interface ModelsResp { models: ModelsConfig; remaining: number }
const small = "w-24 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary";

async function copy(text: string, ok: string) { try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error("复制失败，请手动复制"); } }

export function AgentMarkup() {
  const qc = useQueryClient(); const me = useResellerMe();
  const q = useQuery({ queryKey: ["reseller", "models-admin"], queryFn: () => api<ModelsResp>("/api/reseller/models") });
  const [val, setVal] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const rate = q.data?.models.markupPct ?? 0; const frozen = me.data?.status === "frozen";
  const save = async () => {
    const n = Number(val ?? rate);
    if (!Number.isFinite(n) || n < 0 || n > 50) { toast.error("加价率需在 0 – 50% 之间"); return; }
    setBusy(true);
    try { const r = await api<ModelsResp>("/api/reseller/models", { method: "PUT", body: JSON.stringify({ action: "markup", markupPct: n }) }); qc.setQueryData(["reseller", "models-admin"], r); qc.invalidateQueries({ queryKey: ["reseller", "me"] }); setVal(null); toast.success(`已保存：加价率 ${r.models.markupPct}%，客户下一次调用起按新价扣费`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const hist = q.data?.models.markupHistory ?? [];
  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="加价设置" icon={<Coins />} title="我的加价率" subtitle="你的客户按「平台价 ×（1 + 加价率）」付费，多出来的部分就是你的收益。" />
      {q.error && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{(q.error as Error).message}</div>}
      <VaultPanel title="当前加价" icon={<Coins />}>
        <div className="font-mono text-4xl font-semibold tabular-nums text-primary">{q.isLoading ? "…" : `${rate}%`}</div>
        <p className="mt-3 rounded-xl bg-success/[0.08] px-4 py-3 text-xs leading-5">举例：平台价 ¥100 的调用，你的客户付 ¥{(100 + rate).toFixed(2)}，其中 ¥{rate.toFixed(2)} 计入你的收益。客户在模型列表里看到的就是加价后的价格。</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="agent-markup" className="text-xs font-medium">设置加价率</label>
          <span className="flex items-center gap-1"><input id="agent-markup" type="number" min={0} max={50} step={1} value={val ?? String(rate)} onChange={(e) => setVal(e.target.value)} className={small} disabled={frozen} /><span className="text-xs text-muted-foreground">%</span></span>
          <span className="font-mono text-[10px] text-muted-foreground">0 – 50%</span>
          <Button size="sm" disabled={busy || frozen || val === null || Number(val) === rate || (q.data?.remaining ?? 0) <= 0} onClick={save}>保存</Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{frozen ? "代理资格已被冻结，暂不能调价；你的客户按平台原价计费。" : `新价格立即对客户之后的调用生效，已经发生的消费不受影响。30 天内最多调整 10 次，还剩 ${q.data?.remaining ?? "…"} 次。`}</p>
      </VaultPanel>
      {hist.length > 0 && (
        <VaultPanel title="调价记录">
          <ul className="space-y-1.5 text-sm">{hist.slice(0, 20).map((h) => <li key={h.at} className="flex justify-between rounded-lg bg-muted/40 px-3 py-2"><span className="text-muted-foreground">{new Date(h.at).toLocaleString("zh-CN")}</span><span className="font-mono">{h.pct}%</span></li>)}</ul>
        </VaultPanel>
      )}
    </div>
  );
}

export function AgentInvite() {
  const me = useResellerMe(); const code = me.data?.inviteCode ?? "";
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = code ? `${origin}/signup?ref=${code}` : "";
  const domain = me.data?.domain ?? ""; const site = domain ? `https://${domain}` : "";
  const frozen = me.data?.status === "frozen";
  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="邀请客户" icon={<Link2 />} title="邀请客户" subtitle="在你的专属网址注册、通过你的邀请链接注册、或兑换你生成的卡密的用户，会成为你的客户。" />
      {frozen && <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm">代理资格已被冻结：专属网址和邀请链接暂时不再绑定新客户，新注册的用户不会归到你名下。</div>}
      <VaultPanel title="我的专属网址" icon={<Globe />}>
        {me.isLoading ? <div className="h-12 rounded-xl shimmer" /> : site ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2"><input readOnly value={site} className="h-10 min-w-0 flex-1 rounded-lg border bg-muted/30 px-3 font-mono text-sm" aria-label="专属网址" /><Button size="sm" onClick={() => copy(site, "专属网址已复制")}><Copy size={14} />复制网址</Button></div>
            <p className="text-xs leading-5 text-muted-foreground">把这个网址发给客户即可，不用让他们填邀请码：在这个网址上注册的所有新用户都自动成为你的客户。</p>
          </div>
        ) : <p className="text-sm text-muted-foreground">还没有分配专属网址。需要的话请联系站长开通，开通后会显示在这里。</p>}
      </VaultPanel>
      <VaultPanel title="我的邀请链接" icon={<Link2 />}>
        {me.isLoading ? <div className="h-20 rounded-xl shimmer" /> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">邀请码</span><span className="rounded-lg bg-primary/10 px-3 py-1 font-mono text-lg font-semibold tracking-[0.2em] text-primary">{code || "—"}</span>{code && <button type="button" onClick={() => copy(code, "邀请码已复制")} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Copy size={12} />复制</button>}</div>
            <div className="flex flex-wrap items-center gap-2"><input readOnly value={link} className="h-10 min-w-0 flex-1 rounded-lg border bg-muted/30 px-3 font-mono text-xs" aria-label="邀请链接" /><Button size="sm" disabled={!link} onClick={() => copy(link, "邀请链接已复制")}><Copy size={14} />复制链接</Button></div>
          </div>
        )}
      </VaultPanel>
      <VaultPanel title="规则说明">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
          <li>新用户在你的专属网址上注册，自动成为你的客户（即使填了别人的邀请码，也以网址为准）。</li>
          <li>新用户打开你的邀请链接注册（或注册时填写你的邀请码），自动成为你的客户。</li>
          <li>已注册的用户兑换了你生成的卡密，且还没有归属其他代理时，也会成为你的客户。</li>
          <li>客户的每一笔消费按你当时的加价率计算收益，可在「财务管理」申请提现。</li>
          <li>管理员、其他代理和团队成员账号不会被绑定。</li>
        </ul>
        <Link href="/reseller/finance?tab=card-keys" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Ticket size={14} />去生成卡密</Link>
      </VaultPanel>
    </div>
  );
}
