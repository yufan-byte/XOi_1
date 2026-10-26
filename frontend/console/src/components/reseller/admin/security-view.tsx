"use client";
/**
 * 平台管理 · 安全检测（管理员 role ≥ 10）
 *
 * 四类信号聚合展示：登录爆破 / 管理员新 IP 登录 / 异常消费 / 兑换频率异常。
 * 检测是"提醒"不是"拦截"——告警后的人工处置走「用户管理」（停用账号）与「额度发放」（补偿）。
 * 30 秒自动刷新；阈值由后端环境变量（XOI_ALERT_HOURLY_POINTS 等）控制。
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff, UserX, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { SectionHero } from "@/components/reseller/common";
import { cn } from "@/lib/utils";

type Alert = { kind: "brute" | "admin-ip" | "spend" | "redeem"; level: "high" | "medium"; title: string; detail: string; at: string };
type Overview = {
  alerts: Alert[];
  thresholds: { hourlyPoints: number; bruteCount: number; redeemCount: number };
  summary: { fails24h: number; calls1h: number; quota1h: number; poolBalance: number; poolQuota1h: number; checkedAt: string };
};

type UpstreamPool = { manualBalanceCny: number | null; totalRemainUsd: number; debt: { quota: number; cny: number; users: number }; netCny: number | null; channels: Array<{ id: number; name: string; ok: boolean; remainUsd?: number; limitUsd?: number; usedUsd?: number; error?: string }> };

const KIND_META: Record<Alert["kind"], { icon: typeof AlertTriangle; label: string; where: string }> = {
  brute: { icon: UserX, label: "登录爆破", where: "处置：确认来源 IP；持续攻击可在反代层封禁该 IP 段" },
  "admin-ip": { icon: ShieldOff, label: "管理员新 IP", where: "处置：立即核对是否本人；异常则改密并让全体管理员重新登录" },
  spend: { icon: Wallet, label: "异常消费", where: "处置：到「用户管理」核实账号，必要时停用；到「积分明细」核对账单" },
  redeem: { icon: AlertTriangle, label: "兑换频率异常", where: "处置：核对卡密发放渠道，倒卡线索可追兑换记录" },
};

export function SecurityView() {
  const q = useQuery({
    queryKey: ["admin-security"],
    queryFn: () => api<Overview>("/api/admin/security/overview"),
    refetchInterval: 30_000,
  });
  const alerts = q.data?.alerts ?? [];
  const summary = q.data?.summary;

  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="平台管理" icon={<ShieldAlert />} title="安全检测" subtitle="登录爆破、管理员异地登录、异常消费、兑换频率——提醒不拦截，处置走人工" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <UpstreamPoolCard />
        <div className="grid gap-3 sm:grid-cols-5">
          {[
            ["平台积分池余额", summary ? `${Number(summary.poolBalance).toLocaleString()} 积分` : "—"],
            ["池 1h 垫付", summary ? `${Number(summary.poolQuota1h).toLocaleString()} 积分` : "—"],
            ["用户 1h 消耗", summary ? `${Number(summary.quota1h).toLocaleString()} 积分` : "—"],
            ["24h 登录失败", summary?.fails24h ?? "—"],
            ["当前告警", alerts.length],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-2xl border border-border/50 bg-muted/35 px-4 py-3">
              <div className="text-[11px] font-medium text-muted-foreground">{k}</div>
              <div className="mt-1 font-mono text-lg font-[640] tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-5 text-muted-foreground">口径：管理员账号即「平台积分池」（生成调用实际从这里扣，再从各用户余额扣回）。异常消费检测只统计真实用户（role&lt;10），池的垫付消耗单列，不会误报。</p>

        {q.isLoading ? <div className="h-40 rounded-2xl shimmer" /> : null}
        {q.isError ? <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">安全检测读取失败：{(q.error as Error).message}</div> : null}

        {!q.isLoading && !alerts.length ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-14 text-center">
            <ShieldCheck size={28} className="text-emerald-600" />
            <p className="text-sm font-semibold text-foreground">当前没有触发告警</p>
            <p className="max-w-md text-xs leading-5 text-muted-foreground">检测每 30 秒自动刷新。阈值：单用户单小时消耗 ≥ {q.data?.thresholds.hourlyPoints ?? 500} 积分、同 IP 24h 登录失败 ≥ 10 次、单用户 1h 兑换 ≥ {q.data?.thresholds.redeemCount ?? 10} 次、管理员新 IP 登录。</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {alerts.map((a, i) => {
            const meta = KIND_META[a.kind];
            const Icon = meta.icon;
            return (
              <div key={`${a.kind}-${i}`} className={cn("rounded-2xl border p-4", a.level === "high" ? "border-rose-500/35 bg-rose-500/5" : "border-amber-500/35 bg-amber-500/5")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", a.level === "high" ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-600")}><Icon size={17} /></span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><strong className="text-sm">{a.title}</strong><span className={cn("rounded-full border px-2 py-0.5 text-[10.5px] font-semibold", a.level === "high" ? "border-rose-500/35 bg-rose-500/10 text-rose-600" : "border-amber-500/35 bg-amber-500/10 text-amber-600")}>{a.level === "high" ? "高" : "中"}</span></div>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">{a.detail}</p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">{meta.where}</p>
                    </div>
                  </div>
                  <time className="shrink-0 text-[11px] text-muted-foreground">{a.at.includes("T") ? new Date(a.at).toLocaleString() : a.at}</time>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs leading-5 text-muted-foreground">检测为只读聚合（登录审计、消费流水），不会自动封停任何账号。阈值调参考：环境变量 XOI_ALERT_HOURLY_POINTS（异常消费积分阈值）。需要外发通知（邮件/钉钉/Telegram）时在此机制上接通知渠道即可。</p>
      </div>
    </div>
  );
}

/** 上游额度池（平台真金在造物站的账号余额，手填核对；净敞口 = 上游余额 − 用户负债） */
function UpstreamPoolCard() {
  const qc = useQueryClient();
  const [cny, setCny] = useState("");
  const q = useQuery({ queryKey: ["upstream-pool"], queryFn: () => api<UpstreamPool>("/api/admin/security/upstream-pool"), staleTime: 120_000 });
  const save = useMutation({
    mutationFn: () => api<{ manualBalanceCny: number }>("/api/admin/security/upstream-pool/balance", { method: "POST", body: JSON.stringify({ cny: Number(cny) }) }),
    onSuccess: () => { toast.success("上游余额已更新"); setCny(""); void qc.invalidateQueries({ queryKey: ["upstream-pool"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = q.data;
  const net = d?.netCny;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">上游额度池（真金）</h2>
          <p className="mt-1 text-sm text-sm text-muted-foreground">用户充钱进各自余额；生成时从用户余额扣，上游渠道再扣你的造物账号。<b className="text-foreground">净敞口 = 上游余额 − 用户负债</b>，为负就必须给上游充值。</p>
        </div>
        {net != null ? <div className={cn("rounded-xl px-4 py-2 text-right", net < 0 ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-700")}><div className="text-[11px] font-medium">净敞口</div><div className="font-mono text-lg font-[680] tabular-nums">¥{net.toLocaleString()}</div></div> : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/50 px-4 py-3"><div className="text-xs text-muted-foreground">上游余额（手填核对）</div><div className="mt-1 font-mono text-lg font-[640] tabular-nums">{d?.manualBalanceCny != null ? `¥${d.manualBalanceCny.toLocaleString()}` : "未填写"}</div></div>
        <div className="rounded-xl bg-muted/50 px-4 py-3"><div className="text-xs text-muted-foreground">用户负债（已充未花）</div><div className="mt-1 font-mono text-lg font-[640] tabular-nums">{d ? `¥${d.debt.cny.toLocaleString()} · ${d.debt.users} 人` : "—"}</div></div>
        <div className="rounded-xl bg-muted/50 px-4 py-3"><div className="text-xs text-muted-foreground">渠道令牌参考（剩余合计 $）</div><div className="mt-1 font-mono text-lg font-[640] tabular-nums">{d ? `$${d.totalRemainUsd.toLocaleString()}` : "—"}<small className="ml-1 text-[10px] text-muted-foreground">不限额令牌仅供参考</small></div></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="number" min="0" step="0.01" value={cny} onChange={(e) => setCny(e.target.value)} placeholder="在造物站核对后填入当前余额（元）" aria-label="上游余额（元）" className="h-9 w-64 rounded-lg border bg-background px-3 font-mono text-[13px]" />
        <button type="button" className="rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50" disabled={!cny || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "保存中…" : "更新上游余额"}</button>
        <button type="button" className="rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-muted" onClick={() => void q.refetch()}><RefreshCw size={12} className="mr-1 inline" />重新探测渠道</button>
        <span className="text-[11px] text-muted-foreground">每次给上游充值后更新一次即可</span>
      </div>
      {q.data?.channels.some((c) => !c.ok) ? <p className="mt-2 text-[11px] text-amber-600">部分渠道探测失败（不影响手填口径）：{q.data.channels.filter((c) => !c.ok).map((c) => c.name).join("、")}</p> : null}
      <ReconCard />
    </div>
  );
}

type Recon = {
  configured: boolean; account?: string; message?: string;
  upstreamBalanceCny?: number | null; upstreamUsedCny?: number | null;
  recon: Array<{ day: string; upstreamCny: number; userCny: number; poolCny: number; marginCny: number }>;
  totalMarginCny: number; fetched?: number;
};

/** 上游对账：造物账号余额（真金）+ 每日"用户消耗 vs 上游成本"对照 + 毛利。
 *  账密只存服务器数据库（rootOnly 写入），系统自动登录拉取（access_token 7h 有效，缓存 6h）。 */
function ReconCard() {
  const qc = useQueryClient();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const recon = useQuery({ queryKey: ["upstream-recon"], queryFn: () => api<Recon>("/api/admin/security/upstream-recon"), staleTime: 300_000, refetchInterval: 300_000 });
  const saveCred = useMutation({
    mutationFn: () => api<{ saved: boolean }>("/api/admin/security/upstream-credentials", { method: "POST", body: JSON.stringify({ user: user.trim(), pass }) }),
    onSuccess: () => { toast.success("上游账号已保存，开始拉取对账数据"); setUser(""); setPass(""); void qc.invalidateQueries({ queryKey: ["upstream-recon"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = recon.data;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">上游对账（赚多少，看这里）</h2>
          <p className="mt-1 text-sm text-muted-foreground">拉取造物账号的真实余额与每日扣费，和平台用户消耗逐日对照——毛利 = 用户消耗 − 上游账号总消耗。注意：上游消耗包含你在造物站直接使用的部分（聊天/测试），不只 XOi 转发的调用。</p>
        </div>
        {d?.upstreamBalanceCny != null ? <div className="rounded-xl bg-emerald-500/10 px-4 py-2 text-right"><div className="text-[11px] font-medium text-emerald-700/80">造物账号余额（真金）{d.account ? ` · ${d.account}` : ""}</div><div className="font-mono text-lg font-[680] tabular-nums text-emerald-700">¥{d.upstreamBalanceCny.toLocaleString()}</div></div> : null}
      </div>

      {d && d.configured === false ? (
        <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">{d.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="造物账号（邮箱）" aria-label="造物账号" className="h-9 w-64 rounded-lg border bg-background px-3 text-[13px]" />
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="造物账号密码" aria-label="造物账号密码" className="h-9 w-64 rounded-lg border bg-background px-3 text-[13px]" />
            <Button size="sm" disabled={!user.trim() || pass.length < 6 || saveCred.isPending} onClick={() => saveCred.mutate()}>{saveCred.isPending ? "保存中…" : "保存并开始对账"}</Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">账密只存服务器数据库（rootOnly 写入），用于自动登录拉取余额与消耗账单；不会下发到浏览器。</p>
        </div>
      ) : null}

      {d?.recon?.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border/60">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-muted/50 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">日期</th><th className="px-3 py-2">用户消耗</th><th className="px-3 py-2">管理员测试消耗</th><th className="px-3 py-2">上游账号消耗</th><th className="px-3 py-2">毛利</th>
            </tr></thead>
            <tbody>
              {d.recon.map((r) => (
                <tr key={r.day} className="border-t border-border/40">
                  <td className="px-3 py-2 font-medium tabular-nums">{r.day}</td>
                  <td className="px-3 py-2 tabular-nums">¥{r.userCny.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.poolCny ? `¥${r.poolCny.toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-amber-700">¥{r.upstreamCny.toLocaleString()}</td>
                  <td className={cn("px-3 py-2 font-semibold tabular-nums", r.marginCny >= 0 ? "text-emerald-600" : "text-rose-600")}>{r.marginCny >= 0 ? "+" : ""}¥{r.marginCny.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className="px-3 py-2">合计（近 7 天）</td><td className="px-3 py-2 tabular-nums">¥{d.recon.reduce((s, r) => s + r.userCny, 0).toFixed(2)}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">¥{d.recon.reduce((s, r) => s + r.poolCny, 0).toFixed(2)}</td>
                <td className="px-3 py-2 tabular-nums text-amber-700">¥{d.recon.reduce((s, r) => s + r.upstreamCny, 0).toFixed(2)}</td>
                <td className={cn("px-3 py-2 tabular-nums", d.totalMarginCny >= 0 ? "text-emerald-600" : "text-rose-600")}>{d.totalMarginCny >= 0 ? "+" : ""}¥{d.totalMarginCny.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {d?.recon && !d.recon.length && d.upstreamBalanceCny != null ? <p className="mt-3 text-sm text-muted-foreground">近 7 天上游没有扣费记录（fetched {d.fetched ?? 0} 条）。</p> : null}
      {d?.upstreamBalanceCny != null ? <p className="mt-2 text-[11px] leading-5 text-muted-foreground">「上游账号消耗」= 造物站按它的内部价扣你的真金；「管理员测试消耗」= XOi 按你的售价记的内部测试账。两者差额就是<b className="text-foreground">定价毛利空间</b>（22 日示例：内部账 ¥27.07 vs 上游 ¥13.55 ≈ 售价含 50% 毛利）。测试期毛利为负属正常；开卡密收款后用户消耗上来，这里就是每日利润表。数据 5 分钟缓存，拉取 {d.fetched ?? 0} 条上游账单。</p> : null}
    </div>
  );
}
