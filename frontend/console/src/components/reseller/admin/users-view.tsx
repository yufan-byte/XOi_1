"use client";
/**
 * 平台管理 · 用户管理（管理员核心职责之一）
 *
 * 数据真源在网关：GET /api/admin/users（管理员令牌转发 /api/user/），
 * 停用/启用走 POST /api/admin/users/manage（adminSetUserStatus → 网关）。
 * 动钱（加/减余额）不在这里 —— 去「额度发放」页，那边有原因必填 + 审计流水。
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, Coins, Loader2, PlayCircle, RefreshCw, Search, ShieldOff, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SectionHero } from "@/components/reseller/common";
import { ErrorBanner, Kpi } from "@/components/reseller/legacy/frame";
import { dateTimeFull } from "@/components/reseller/common";
import { useResellerMe } from "@/lib/reseller/client";
import { cn } from "@/lib/utils";

const inputCls = "h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60";
const btnCls = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-50";
const thCls = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground";
const tdCls = "px-3 py-2 align-middle text-[13px] text-foreground/90";
const rowCls = "border-t border-border/40 hover:bg-muted/40";

/** 与 lib/reseller/newapi.ts 同口径：500000 额度单位 = ¥1 */
const QUOTA_PER_UNIT = 500000;
const toCny = (quota: unknown) => (Number.isFinite(Number(quota)) ? Number(quota) / QUOTA_PER_UNIT : 0);
const money = (v: unknown) => `¥${toCny(v).toFixed(2)}`;

type AdminUser = {
  id: number; username: string; display_name?: string; email?: string;
  quota?: number; used_quota?: number; group?: string; role?: number; status?: number;
  created_at?: number; last_login_at?: number;
};
type UsersResp = { items: AdminUser[]; total: number };

/** new-api 用户状态：1=已启用 2=已停用（3=已删除，列表里不会出现） */
const STATUS_CN: Record<number, string> = { 1: "已启用", 2: "已停用" };
const ROLE_CN = (r?: number) => (r == null ? "—" : r >= 100 ? "站长" : r >= 10 ? "管理员" : "用户");
/** 时间戳秒/毫秒两版兜底（网关各表实现不一） */
const showTime = (v?: number) => (v && v > 0 ? dateTimeFull(v * (v > 1e12 ? 1 : 1000)) : "—");

export function AdminUsersView() {
  const qc = useQueryClient();
  const me = useResellerMe();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kw, setKw] = useState("");
  /** 二次确认中的用户（停用是高影响操作，点一次变确认态，再点才执行） */
  const [confirming, setConfirming] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["admin-users", page, kw],
    queryFn: () => api<UsersResp>(`/api/admin/users?page=${page}&page_size=20${kw ? `&keyword=${encodeURIComponent(kw)}` : ""}`),
  });
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;

  const manage = useMutation({
    mutationFn: (p: { id: number; action: "enable" | "disable" }) =>
      api<{ id: number; enabled: boolean }>("/api/admin/users/manage", { method: "POST", body: JSON.stringify(p) }),
    onSuccess: (r) => { toast.success(r.enabled ? "已启用该账号" : "已停用该账号"); setConfirming(null); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e) => toast.error((e as Error).message || "操作失败"),
  });

  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="平台管理" icon={<Users />} title="用户管理" subtitle="账号真源在网关：搜索用户、查看余额消耗、停用/启用账号；动钱请去「额度发放」" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="用户总数" value={total} icon={<Users size={14} />} />
          <Kpi label="本页余额合计" value={money(items.reduce((s, u) => s + toCny(u.quota), 0))} accent icon={<CircleDollarSign size={14} />} />
          <Kpi label="本页累计消费" value={money(items.reduce((s, u) => s + toCny(u.used_quota), 0))} icon={<Coins size={14} />} />
          <Kpi label="本页停用数" value={items.filter((u) => u.status === 2).length} icon={<ShieldOff size={14} />} />
        </div>

        <div className="rounded-2xl border border-border/50 bg-muted/35">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div className="text-sm font-semibold text-foreground">用户列表</div>
            <div className="flex items-center gap-1.5">
              <input className={cn(inputCls, "w-52")} placeholder="用户名搜索" value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (setKw(search.trim()), setPage(1))} />
              <button type="button" className={btnCls} onClick={() => { setKw(search.trim()); setPage(1); }}><Search size={13} />查询</button>
              <button type="button" className={btnCls} onClick={() => q.refetch()}><RefreshCw size={13} />刷新</button>
            </div>
          </div>
          {q.isError ? <div className="p-4"><ErrorBanner error={q.error} suffix="用户列表加载失败" onRetry={() => q.refetch()} /></div> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead><tr className="bg-muted/50">
                <th className={thCls}>#</th><th className={thCls}>用户</th><th className={thCls}>邮箱</th><th className={thCls}>角色</th><th className={thCls}>分组</th>
                <th className={thCls}>余额</th><th className={thCls}>累计消费</th><th className={thCls}>状态</th><th className={thCls}>注册时间</th><th className={thCls}>操作</th>
              </tr></thead>
              <tbody>
                {items.map((u) => {
                  const disabled = u.status === 2;
                  const busy = manage.isPending && manage.variables?.id === u.id;
                  return (
                    <tr key={u.id} className={rowCls}>
                      <td className={cn(tdCls, "font-mono text-xs text-muted-foreground")}>{u.id}</td>
                      <td className={tdCls}>
                        <span className="font-medium text-foreground">{u.display_name || u.username}</span>
                        <span className="ml-1.5 text-[11px] text-muted-foreground">@{u.username}</span>
                      </td>
                      <td className={cn(tdCls, "text-muted-foreground")}>{u.email || "—"}</td>
                      <td className={tdCls}>{ROLE_CN(u.role)}</td>
                      <td className={cn(tdCls, "font-mono text-xs")}>{u.group || "default"}</td>
                      <td className={cn(tdCls, "tabular-nums")}>{money(u.quota)}</td>
                      <td className={cn(tdCls, "tabular-nums text-muted-foreground")}>{money(u.used_quota)}</td>
                      <td className={tdCls}>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", disabled ? "border-rose-500/35 bg-rose-500/10 text-rose-600" : "border-emerald-500/35 bg-emerald-500/10 text-emerald-600")}>
                          {STATUS_CN[u.status ?? 1] ?? "未知"}
                        </span>
                      </td>
                      <td className={cn(tdCls, "tabular-nums text-muted-foreground")}>{showTime(u.created_at)}</td>
                      <td className={tdCls}>
                        {confirming === u.id ? (
                          <span className="flex items-center gap-1.5">
                            <button type="button" className={cn(btnCls, disabled ? "border-emerald-500/50 text-emerald-600" : "border-rose-500/50 text-rose-600")} disabled={busy} onClick={() => manage.mutate({ id: u.id, action: disabled ? "enable" : "disable" })}>
                              {busy ? <Loader2 size={13} className="animate-spin" /> : null}确认{disabled ? "启用" : "停用"}
                            </button>
                            <button type="button" className={btnCls} onClick={() => setConfirming(null)}>取消</button>
                          </span>
                        ) : (
                          <button type="button" className={btnCls} disabled={busy} onClick={() => setConfirming(u.id)} title={disabled ? "恢复该账号登录与调用" : "停用后该账号无法登录与调用"}>
                            {disabled ? <PlayCircle size={13} /> : <ShieldOff size={13} />}{disabled ? "启用" : "停用"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!q.isLoading && !items.length ? (
                  <tr><td className={cn(tdCls, "py-10 text-center text-muted-foreground")} colSpan={10}>{kw ? `没有匹配「${kw}」的用户` : "暂无用户"}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {(() => {
            const pages = Math.max(1, Math.ceil(total / 20));
            return (
              <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground">
                <span>共 {total} 个用户 · 第 {page} / {pages} 页</span>
                <div className="flex gap-2">
                  <button type="button" className={btnCls} disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
                  <button type="button" className={btnCls} disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button>
                </div>
              </div>
            );
          })()}
        </div>
        {me.data?.scope === "platform" && !me.data?.root ? (
          <p className="text-xs text-muted-foreground">你是管理员（role ≥ 10）：可以查看与停启用账号；资金动作（额度发放/扣回）仅站长可提交。</p>
        ) : null}
      </div>
    </div>
  );
}
