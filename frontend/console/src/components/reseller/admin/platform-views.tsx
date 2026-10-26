"use client";
/**
 * 平台运营视图（造物没有独立 admin 应用，这里是 XOi 的补位：后端 /api/admin/* 早已存在，之前只是没有 UI）。
 *
 * 数据来源与取舍：
 *   · 任务监控 /api/admin/tasks          —— 读 o_tasks（生成任务流水，真的有数据，排障用）
 *   · 充值记录 /api/admin/gateway/topups —— 读**网关** topup 表（真钱的真源；本仓库 admin/orders.ts
 *     读的是 o_order 旧积分订单，已下线，别拿它当充值记录）
 *   · 兑换码   /api/admin/gateway/redemptions —— 读网关 redemption 表
 *   · 运营设置 /api/admin/settings       —— platformPolicy（注册开关 / 维护模式 / 新用户赠送），
 *     这三个开关是**真的在生效**的：注册接口、HTTP 兜底、socket 握手都会读它
 *
 * 权限：/api/admin 前缀在 app.ts 已统一套 requireAdmin；菜单只在 scope=platform 时出现，
 *      代理（scope=agent）的 AGENT_PATHS 白名单不含这些路径，会被 AdminGate 弹回概览。
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, BadgeCheck, CircleDollarSign, Coins, Gift, HandCoins, Loader2, Minus, RefreshCw, Save, Search, Send, ShieldAlert, Ticket, Undo2, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { dateTimeFull } from "@/components/reseller/common";
import { SectionHero, VaultPanel } from "@/components/reseller/common";
import { ErrorBanner, Kpi } from "@/components/reseller/legacy/frame";
import { useResellerMe } from "@/lib/reseller/client";
import { cn } from "@/lib/utils";

/* ----------------------------- 公共小件 ----------------------------- */

const inputCls = "h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60";
const btnCls = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-50";
const thCls = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground";
const tdCls = "px-3 py-2 align-middle text-[13px] text-foreground/90";
const rowCls = "border-t border-border/40 hover:bg-muted/40";

function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-3 text-xs text-muted-foreground">
      <span>共 {total} 条 · 第 {page} / {pages} 页</span>
      <div className="flex gap-2">
        <button type="button" className={btnCls} disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
        <button type="button" className={btnCls} disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button>
      </div>
    </div>
  );
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ----------------------------- 任务监控 ----------------------------- */

type TaskRow = { id: number | string; projectId?: number; taskClass?: string; model?: string; state?: string; describe?: string; startTime?: number; project_name?: string; user_name?: string };
type TaskResp = { tasks: TaskRow[]; pagination: { page: number; limit: number; total: number }; stateStats: Array<{ state: string; count: number }> };

const STATE_TONE: Record<string, string> = {
  unknown: "border-orange-500/35 bg-orange-500/10 text-orange-600",
  success: "border-emerald-500/35 bg-emerald-500/10 text-emerald-600",
  failed: "border-rose-500/35 bg-rose-500/10 text-rose-600",
  running: "border-sky-500/35 bg-sky-500/10 text-sky-600",
  pending: "border-amber-500/35 bg-amber-500/10 text-amber-600",
  cancelled: "border-stone-400/35 bg-stone-500/10 text-stone-500",
};
const STATE_CN: Record<string, string> = { success: "已完成", failed: "失败", running: "生成中", pending: "等待中", unknown: "结果待核实", cancelled: "已取消" };
const STATE_FILTERS = [{ key: "", label: "全部" }, { key: "unknown", label: "待核实" }, { key: "running", label: "生成中" }, { key: "success", label: "已完成" }, { key: "failed", label: "失败" }, { key: "pending", label: "等待中" }, {key:"cancelled",label:"已取消"}];

export function AdminTasksView() {
  const [page, setPage] = useState(1);
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const [kw, setKw] = useState("");
  const q = useQuery({
    queryKey: ["admin-tasks", page, state, kw],
    queryFn: () => api<TaskResp>(`/api/admin/tasks?page=${page}&limit=20${state ? `&state=${state}` : ""}${kw ? `&search=${encodeURIComponent(kw)}` : ""}`),
  });
  const stat = (key: string) => num(q.data?.stateStats?.find((s) => s.state === key)?.count);

  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="平台运营" icon={<Activity />} title="任务监控" subtitle="全站生成任务流水：模型、耗时、失败原因一目了然，排障从这里开始" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <div className="grid gap-3 sm:grid-cols-5">
          <Kpi label="任务总数" value={num(q.data?.pagination?.total)} icon={<Activity size={14} />} />
          <Kpi label="待核实（勿重发）" value={stat("unknown")} icon={<ShieldAlert size={14} />} />
          <Kpi label="生成中" value={stat("running")} icon={<Loader2 size={14} />} />
          <Kpi label="已完成" value={stat("success")} accent icon={<BadgeCheck size={14} />} />
          <Kpi label="失败" value={stat("failed")} icon={<AlertTriangle size={14} />} />
        </div>

        <VaultPanel
          title="任务流水"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-border p-0.5">
                {STATE_FILTERS.map((f) => (
                  <button key={f.key} type="button" onClick={() => { setState(f.key); setPage(1); }}
                    className={cn("rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors", state === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input className={cn(inputCls, "w-48")} placeholder="任务类型 / 模型 / 用户" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setKw(search.trim()), setPage(1))} />
                <button type="button" className={btnCls} onClick={() => { setKw(search.trim()); setPage(1); }}><Search size={13} />查询</button>
              </div>
              <button type="button" className={btnCls} onClick={() => q.refetch()}><RefreshCw size={13} />刷新</button>
            </div>
          }
        >
          {q.isError ? <ErrorBanner error={q.error} suffix="任务列表加载失败" onRetry={() => q.refetch()} /> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse">
              <thead><tr className="bg-muted/50">
                <th className={thCls}>#</th><th className={thCls}>任务类型</th><th className={thCls}>模型</th><th className={thCls}>项目 / 用户</th>
                <th className={thCls}>描述</th><th className={thCls}>状态</th><th className={thCls}>开始时间</th>
              </tr></thead>
              <tbody>
                {(q.data?.tasks ?? []).map((t) => (
                  <tr key={t.id} className={rowCls}>
                    <td className={cn(tdCls, "font-mono text-xs text-muted-foreground")}>{t.id}</td>
                    <td className={tdCls}>{t.taskClass || "—"}</td>
                    <td className={cn(tdCls, "font-mono text-xs")}>{t.model || "—"}</td>
                    <td className={cn(tdCls, "text-muted-foreground")}>{t.project_name || `#${t.projectId ?? "—"}`}{t.user_name ? ` · ${t.user_name}` : ""}</td>
                    <td className={cn(tdCls, "max-w-[280px] truncate text-muted-foreground")} title={t.describe || ""}>{t.describe || "—"}</td>
                    <td className={tdCls}>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATE_TONE[t.state || ""] ?? "border-border bg-muted text-muted-foreground")}>{STATE_CN[t.state || ""] ?? t.state ?? "—"}</span>
                    </td>
                    <td className={cn(tdCls, "tabular-nums text-muted-foreground")}>{t.startTime ? dateTimeFull(t.startTime) : "—"}</td>
                  </tr>
                ))}
                {!q.isLoading && !(q.data?.tasks ?? []).length ? (
                  <tr><td className={cn(tdCls, "py-10 text-center text-muted-foreground")} colSpan={7}>暂无任务记录</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pager page={q.data?.pagination?.page ?? page} limit={q.data?.pagination?.limit ?? 20} total={num(q.data?.pagination?.total)} onPage={setPage} />
        </VaultPanel>
      </div>
    </div>
  );
}

/* ----------------------------- 网关记录（充值 / 兑换码） ----------------------------- */

type GatewayPage = { data?: { page?: number; page_size?: number; total?: number; items?: Array<Record<string, unknown>> }; message?: string; success?: boolean };

function GatewayTable({ rows, columns, empty }: { rows: Array<Record<string, unknown>>; columns: Array<{ key: string; label: string; render?: (row: Record<string, unknown>) => React.ReactNode }>; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead><tr className="bg-muted/50">{columns.map((c) => <th key={c.key} className={thCls}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.id ?? i)} className={rowCls}>
              {columns.map((c) => <td key={c.key} className={tdCls}>{c.render ? c.render(r) : String(r[c.key] ?? "—")}</td>)}
            </tr>
          ))}
          {!rows.length ? <tr><td className={cn(tdCls, "py-10 text-center text-muted-foreground")} colSpan={columns.length}>{empty}</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

const ts = (v: unknown) => (typeof v === "number" && v > 0 ? dateTimeFull(v * (v < 1e12 ? 1000 : 1)) : "—");
const money = (v: unknown) => `¥${num(v).toFixed(2)}`;

export function AdminTopupsView() {
  const [page, setPage] = useState(0);
  const q = useQuery({ queryKey: ["admin-topups", page], queryFn: () => api<GatewayPage>(`/api/admin/gateway/topups?p=${page}&page_size=20`) });
  const items = q.data?.data?.items ?? [];
  const total = num(q.data?.data?.total);
  const paidRows = items.filter((r) => String(r.status ?? "").toLowerCase() === "success" || r.status === 1);

  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="平台运营" icon={<CircleDollarSign />} title="充值记录" subtitle="在线充值订单来自网关（真钱的真源）：渠道、金额、状态、到账时间" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="订单总数" value={total} icon={<CircleDollarSign size={14} />} />
          <Kpi label="本页已支付" value={paidRows.length} accent icon={<BadgeCheck size={14} />} />
          <Kpi label="本页金额合计" value={money(paidRows.reduce((s, r) => s + num(r.amount ?? r.money), 0))} icon={<Coins size={14} />} />
        </div>
        <VaultPanel title="充值订单" right={<button type="button" className={btnCls} onClick={() => q.refetch()}><RefreshCw size={13} />刷新</button>}>
          {q.isError ? <ErrorBanner error={q.error} suffix="充值记录加载失败" onRetry={() => q.refetch()} /> : null}
          <GatewayTable
            rows={items}
            empty="暂无充值订单（网关侧未开启在线充值或还没有人充值）"
            columns={[
              { key: "id", label: "#", render: (r) => <span className="font-mono text-xs text-muted-foreground">{String(r.id ?? "—")}</span> },
              { key: "username", label: "用户", render: (r) => String(r.username ?? r.user_name ?? r.user_id ?? "—") },
              { key: "trade_no", label: "商户单号", render: (r) => <span className="font-mono text-xs">{String(r.trade_no ?? r.out_trade_no ?? "—")}</span> },
              { key: "amount", label: "金额", render: (r) => money(r.amount ?? r.money) },
              { key: "payment_method", label: "渠道", render: (r) => String(r.payment_method ?? r.channel ?? "—") },
              { key: "status", label: "状态", render: (r) => String(r.status ?? "—") },
              { key: "create_time", label: "下单时间", render: (r) => <span className="tabular-nums text-muted-foreground">{ts(r.create_time)}</span> },
              { key: "complete_time", label: "到账时间", render: (r) => <span className="tabular-nums text-muted-foreground">{ts(r.complete_time)}</span> },
            ]}
          />
          <Pager page={page + 1} limit={20} total={total} onPage={(p) => setPage(Math.max(0, p - 1))} />
        </VaultPanel>
      </div>
    </div>
  );
}

export function AdminRedemptionsView() {
  const [page, setPage] = useState(0);
  const q = useQuery({ queryKey: ["admin-redemptions", page], queryFn: () => api<GatewayPage>(`/api/admin/gateway/redemptions?p=${page}&page_size=20`) });
  const items = q.data?.data?.items ?? [];
  const total = num(q.data?.data?.total);
  const used = items.filter((r) => r.status === 2 || r.redeemed_time).length;

  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="平台运营" icon={<Ticket />} title="兑换码" subtitle="网关侧兑换码库存与核销情况；批量生成在「财务 → 卡密」，点对点补偿用「额度发放」" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="兑换码总数" value={total} icon={<Ticket size={14} />} />
          <Kpi label="本页已核销" value={used} accent icon={<BadgeCheck size={14} />} />
          <Kpi label="本页面额合计" value={money(items.reduce((s, r) => s + num(r.quota ?? 0) / 500000, 0))} icon={<Coins size={14} />} />
        </div>
        <VaultPanel title="兑换码列表" right={<button type="button" className={btnCls} onClick={() => q.refetch()}><RefreshCw size={13} />刷新</button>}>
          {q.isError ? <ErrorBanner error={q.error} suffix="兑换码加载失败" onRetry={() => q.refetch()} /> : null}
          <GatewayTable
            rows={items}
            empty="暂无兑换码"
            columns={[
              { key: "id", label: "#", render: (r) => <span className="font-mono text-xs text-muted-foreground">{String(r.id ?? "—")}</span> },
              { key: "name", label: "名称", render: (r) => String(r.name ?? "—") },
              { key: "key", label: "兑换码", render: (r) => <span className="font-mono text-xs">{String(r.key ?? "—")}</span> },
              { key: "quota", label: "面额", render: (r) => money(num(r.quota) / 500000) },
              { key: "status", label: "状态", render: (r) => (r.status === 1 ? "未使用" : r.status === 3 ? "已使用" : r.status === 2 ? "已禁用" : String(r.status ?? "—")) },
              { key: "created_time", label: "创建时间", render: (r) => <span className="tabular-nums text-muted-foreground">{ts(r.created_time)}</span> },
              { key: "redeemed_time", label: "核销时间", render: (r) => <span className="tabular-nums text-muted-foreground">{ts(r.redeemed_time)}</span> },
            ]}
          />
          <Pager page={page + 1} limit={20} total={total} onPage={(p) => setPage(Math.max(0, p - 1))} />
        </VaultPanel>
      </div>
    </div>
  );
}

/* ----------------------------- 运营设置 ----------------------------- */

type Policy = { registrationOpen: boolean; welcomePoints: number; maintenance: boolean };

export function AdminPolicyView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-policy"], queryFn: () => api<Policy>("/api/admin/settings") });
  const [draft, setDraft] = useState<Policy | null>(null);
  const policy = draft ?? q.data ?? { registrationOpen: true, welcomePoints: 0, maintenance: false };

  const save = useMutation({
    mutationFn: (body: Policy) => api<Policy>("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("已保存，立即生效"); setDraft(null); qc.invalidateQueries({ queryKey: ["admin-policy"] }); },
    onError: (e) => toast.error(`保存失败：${(e as Error).message}`),
  });

  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="平台运营" icon={<ShieldAlert />} title="运营设置" subtitle="这三个开关直接生效：注册入口、维护模式、新用户赠送额度" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <VaultPanel title="平台策略">
          {q.isError ? <ErrorBanner error={q.error} suffix="读取失败" onRetry={() => q.refetch()} /> : null}
          <div className="flex flex-col gap-4">
            <label className="flex items-start gap-3 rounded-xl border border-border/45 bg-muted/35 p-4">
              <input type="checkbox" className="mt-0.5 size-4" checked={policy.registrationOpen} onChange={(e) => setDraft({ ...policy, registrationOpen: e.target.checked })} />
              <span className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">开放注册</span>
                <span className="text-xs leading-relaxed text-muted-foreground">关闭后新账号无法注册（注册接口直接拒绝），已登录用户不受影响。</span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-border/45 bg-muted/35 p-4">
              <input type="checkbox" className="mt-0.5 size-4" checked={policy.maintenance} onChange={(e) => setDraft({ ...policy, maintenance: e.target.checked })} />
              <span className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">维护模式</span>
                <span className="text-xs leading-relaxed text-muted-foreground">开启后普通用户请求与实时连接一律被拒（管理员可继续操作），用于停机维护。</span>
              </span>
            </label>

            <div className="flex flex-col gap-2 rounded-xl border border-border/45 bg-muted/35 p-4">
              <span className="text-sm font-semibold text-foreground">新用户赠送额度</span>
              <span className="text-xs leading-relaxed text-muted-foreground">新账号注册成功后自动到账的赠送额度（0 表示不赠送）。</span>
              <div className="mt-1 flex items-center gap-2">
                <input type="number" min={0} max={100000} className={cn(inputCls, "w-40 tabular-nums")} value={policy.welcomePoints}
                  onChange={(e) => setDraft({ ...policy, welcomePoints: Math.max(0, Math.min(100000, Math.floor(Number(e.target.value) || 0))) })} />
                <span className="text-xs text-muted-foreground">0 – 100000</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button type="button" disabled={!draft || save.isPending} className={cn(btnCls, "border-primary/60 bg-primary text-primary-foreground hover:bg-primary-strong")} onClick={() => draft && save.mutate(draft)}>
              {save.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}保存更改
            </button>
            {draft ? <button type="button" className={btnCls} onClick={() => setDraft(null)}>放弃修改</button> : <span className="text-xs text-muted-foreground">未修改</span>}
          </div>
        </VaultPanel>
      </div>
    </div>
  );
}

/* ----------------------------- 额度发放 ----------------------------- */

type CreditRow = { id: number; userId: number; username: string; delta: number; amount: number; balanceAfter: number; reason: string; operatorId: number; operator: string; createdAt: string };
type Direction = "grant" | "revoke";

/**
 * 平台「额度发放」：给指定用户直接加/减额度。
 *
 * 与「卡密」的分工（这是本页存在的理由）：
 *   · 卡密 = 可流通的一次性凭证，适合对外售卖 / 批量分发；会入库、可能被转卖、有核销状态。
 *   · 额度发放 = 点对点补偿（客服退款、误扣回滚、活动奖励、内部测试），**必须留痕**：
 *     谁、给谁、多少钱、为什么，全部写进 o_quota_ledger（type=admin）。
 * 只有站长（role ≥ 100）能提交，且**必须填原因** —— 这是动钱动作的最小审计要求。
 */
export function AdminCreditsView() {
  const qc = useQueryClient();
  const me = useResellerMe();
  const isRoot = me.data?.scope === "platform" && me.data?.root === true;

  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState<Direction>("grant");
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());

  const q = useQuery({ queryKey: ["admin-credits"], queryFn: () => api<CreditRow[]>("/api/admin/credits") });
  const rows = q.data ?? [];

  const grant = rows.filter((r) => r.amount > 0);
  const revoke = rows.filter((r) => r.amount < 0);
  const d0 = new Date(new Date().toDateString()).getTime();
  const todayCount = rows.filter((r) => { const t = Date.parse(r.createdAt); return Number.isFinite(t) && t >= d0; }).length;

  const submit = useMutation({
    mutationFn: () => api<{ username: string; amount: number; balanceAfter: number | null }>("/api/admin/credits", {
      method: "POST",
      headers: { "Idempotency-Key": requestId },
      body: JSON.stringify({ target: target.trim(), amount: Number(amount), reason: reason.trim(), direction }),
    }),
    onSuccess: (r) => {
      const abs = Math.abs(Number(r?.amount ?? 0)).toFixed(2);
      toast.success(`${direction === "revoke" ? "已扣回" : "已发放"} ¥${abs} → ${r?.username ?? "用户"}${r?.balanceAfter != null ? `（余额 ¥${Number(r.balanceAfter).toFixed(2)}）` : ""}`);
      setAmount(""); setReason("");
      setRequestId(crypto.randomUUID());
      qc.invalidateQueries({ queryKey: ["admin-credits"] });
      qc.invalidateQueries({ queryKey: ["admin-topups"] });
    },
    onError: (e) => toast.error((e as Error).message || "发放失败"),
  });

  const canSubmit = isRoot && target.trim() && Number(amount) > 0 && reason.trim().length >= 2 && !submit.isPending;

  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="平台运营" icon={<HandCoins />} title="额度发放" subtitle="点对点给某个用户加/减余额（客服补偿、误扣回滚、活动奖励）。每一笔都必须填原因并写入审计流水" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="累计发放" value={money(grant.reduce((s, r) => s + r.amount, 0))} accent icon={<Gift size={14} />} />
          <Kpi label="累计扣回" value={money(Math.abs(revoke.reduce((s, r) => s + r.amount, 0)))} icon={<Undo2 size={14} />} />
          <Kpi label="发放笔数" value={grant.length} icon={<HandCoins size={14} />} />
          <Kpi label="今日笔数" value={todayCount} icon={<Activity size={14} />} />
        </div>

        <VaultPanel title="发放额度" icon={<HandCoins />}>
          {!isRoot && me.data ? (
            <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs leading-5 text-foreground/85">
              当前账号不是站长（role ≥ 100），只能查看发放记录，不能动钱。
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-foreground">目标用户 <span className="font-normal text-muted-foreground">（用户 ID 或用户名，需精确匹配）</span></span>
                <span className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary/60">
                  <UserSearch size={15} className="shrink-0 text-muted-foreground" />
                  <input className="h-10 w-full bg-transparent text-sm outline-none" placeholder="例如 12 或 cheny" value={target} onChange={(e) => setTarget(e.target.value)} />
                </span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">金额（元）</span>
                  <span className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 focus-within:border-primary/60">
                    <span className="font-mono text-sm text-muted-foreground">¥</span>
                    <input type="number" min={0} step="0.01" className="h-10 w-full bg-transparent font-mono text-sm tabular-nums outline-none" placeholder="10.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </span>
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">方式</span>
                  <div role="tablist" className="inline-flex rounded-xl border border-border bg-muted/50 p-0.5">
                    {([["grant", "发放", Gift], ["revoke", "扣回", Minus]] as const).map(([k, label, Icon]) => (
                      <button key={k} type="button" role="tab" aria-selected={direction === k} onClick={() => setDirection(k)}
                        className={cn("inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-xs font-semibold transition-colors", direction === k ? (k === "revoke" ? "bg-card text-danger shadow-sm" : "bg-card text-primary shadow-sm") : "text-muted-foreground hover:text-foreground")}>
                        <Icon size={13} />{label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-foreground">原因 <span className="font-normal text-muted-foreground">（必填，会写进审计流水，2–200 字）</span></span>
                <textarea rows={2} maxLength={200} className="resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary/60" placeholder="例如：订单 #1024 重复扣费，退还差额" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>

              <div className="flex items-center gap-3">
                <button type="button" disabled={!canSubmit} onClick={() => submit.mutate()}
                  className={cn("inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors disabled:opacity-45",
                    direction === "revoke" ? "bg-danger hover:opacity-90" : "bg-primary hover:bg-primary-strong")}>
                  {submit.isPending ? <Loader2 size={15} className="animate-spin" /> : direction === "revoke" ? <Minus size={15} /> : <Send size={15} />}
                  {direction === "revoke" ? "确认扣回" : "确认发放"}
                </button>
                {Number(amount) > 0 && target.trim() ? (
                  <span className="text-xs text-muted-foreground">将{direction === "revoke" ? "扣回" : "发放"} <b className="tabular-nums text-foreground">¥{Number(amount).toFixed(2)}</b> 给 <b className="text-foreground">{target.trim()}</b></span>
                ) : <span className="text-xs text-muted-foreground">填写用户与金额后即可提交</span>}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/35 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"><ShieldAlert size={14} className="text-primary" />发放须知</div>
              <ul className="mt-3 space-y-2.5 text-xs leading-5 text-muted-foreground">
                <li><b className="text-foreground">为什么要填原因：</b>这是给用户账户加钱，属于高影响操作；原因会永久留在审计流水里，对账时能追溯是谁、为什么、改了多少。</li>
                <li><b className="text-foreground">发放还是卡密：</b>点对点补偿用这里；对外售卖 / 批量分发给不特定用户，用「财务 → 卡密」或「兑换码」页。</li>
                <li><b className="text-foreground">扣回会校验余额：</b>只扣得动当前余额，扣不穿（避免把用户余额做成负数）。</li>
                <li><b className="text-foreground">不代替站长操作：</b>后端只放行 role ≥ 100；普通管理员即使绕过前端也提交不了。</li>
              </ul>
            </div>
          </div>
        </VaultPanel>

        <VaultPanel title="发放记录" icon={<Coins />} right={<button type="button" className={btnCls} onClick={() => q.refetch()}><RefreshCw size={13} />刷新</button>}>
          {q.isError ? <ErrorBanner error={q.error} suffix="发放记录加载失败" onRetry={() => q.refetch()} /> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead><tr className="bg-muted/50">
                <th className={thCls}>时间</th><th className={thCls}>用户</th><th className={thCls}>变动</th><th className={thCls}>变动后余额</th><th className={thCls}>原因</th><th className={thCls}>操作人</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={rowCls}>
                    <td className={cn(tdCls, "whitespace-nowrap tabular-nums text-muted-foreground")}>{r.createdAt ? dateTimeFull(Date.parse(r.createdAt)) : "—"}</td>
                    <td className={tdCls}><span className="font-medium text-foreground">{r.username}</span><span className="ml-1.5 font-mono text-[11px] text-muted-foreground">#{r.userId}</span></td>
                    <td className={tdCls}>
                      <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-bold tabular-nums", r.amount >= 0 ? "border-success/35 bg-success/10 text-success" : "border-danger/35 bg-danger/10 text-danger")}>
                        {r.amount >= 0 ? <Gift size={12} /> : <Minus size={12} />}{r.amount >= 0 ? "+" : "−"}¥{Math.abs(r.amount).toFixed(2)}
                      </span>
                    </td>
                    <td className={cn(tdCls, "tabular-nums text-muted-foreground")}>{money(r.balanceAfter)}</td>
                    <td className={cn(tdCls, "max-w-[320px] truncate text-muted-foreground")} title={r.reason}>{r.reason || "—"}</td>
                    <td className={cn(tdCls, "text-muted-foreground")}>{r.operator}</td>
                  </tr>
                ))}
                {!q.isLoading && !rows.length ? (
                  <tr><td className={cn(tdCls, "py-10 text-center text-muted-foreground")} colSpan={6}>暂无发放记录</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </VaultPanel>
      </div>
    </div>
  );
}
