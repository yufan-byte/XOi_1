"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { authedDownload } from "@/lib/api";
import { CREDIT_RULE_LABEL, formatTeamQuota, teamPointsToYuan } from "@/lib/team-presentation";
import { SudoDialog, cachedSudoToken } from "./team-sudo";
import type { BatchResult } from "@/lib/team-types";

export type { BatchResult };
const PERIOD: Record<string, string> = { day: "每日", month: "每月", total: "累计" };

function countdown(expiresAt: number): string {
  const left = Math.max(0, expiresAt - Date.now());
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function BatchCreateDialog({
  teamId, teamName, mfaEnabled, onClose, onDone,
}: { teamId: number; teamName: string; mfaEnabled: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ count: "10", prefix: "", nicknameBase: "", limit: "", period: "month" as "day" | "month" | "total", canViewAll: false });
  const [busy, setBusy] = useState(false);
  const [askSudo, setAskSudo] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [left, setLeft] = useState("");
  const lock = useRef(false);

  const count = Number(form.count) || 0;
  const limitYuan = teamPointsToYuan(form.limit || "0");
  const estimate = limitYuan === null ? null : `${((Number(form.limit) || 0) * count).toLocaleString("zh-CN")} 积分`;

  useEffect(() => {
    if (!result?.expiresAt) return;
    const tick = () => setLeft(countdown(result.expiresAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [result?.expiresAt]);

  const submit = async () => {
    if (lock.current) return;
    if (!count || count < 1 || count > 200) { toast.error("人数需在 1~200 之间"); return; }
    if (!/^[a-z0-9][a-z0-9_-]{1,11}$/.test(form.prefix)) { toast.error("账号前缀需 2~12 位小写字母/数字/下划线/短横线"); return; }
    if (limitYuan === null) { toast.error("每人额度需为 0 或正数"); return; }
    const token = cachedSudoToken();
    if (!token) { setAskSudo(true); return; }
    lock.current = true;
    setBusy(true);
    try {
      const data = await apiPostBatch(teamId, { count, prefix: form.prefix, nicknameBase: form.nicknameBase || form.prefix, limit: limitYuan, period: form.period, canViewAll: form.canViewAll }, token);
      setResult(data);
      onDone();
      toast.success(`已创建 ${data.createdCount} 个账号${data.failed ? `，${data.failed} 个失败` : ""}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    if (!result) return;
    await downloadBatch(result.batchId, teamId, mfaEnabled, () => setAskSudo(true));
  };

  const input = "mt-1 h-10 w-full rounded-xl border bg-background px-3 outline-none";
  const close = () => {
    if (result?.createdCount) {
      if (!window.confirm("关闭后仍可在「最近下发」里重新下载 Excel（30 分钟内有效，最多 5 次）。确认关闭？")) return;
    }
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open && !busy) close(); }}>
        <DialogContent
          title={result ? "账号已创建" : "批量下发团队账号"}
          description={result ? "初始密码不显示在这里 —— 请导出 Excel 后再发给学员。" : `为「${teamName}」一次性创建多个成员账号，每人一套独立密码`}
        >
          {!result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-muted-foreground">人数<input className={input} inputMode="numeric" value={form.count} onChange={(event) => setForm({ ...form, count: event.target.value.replace(/[^\d]/g, "") })} /></label>
                <label className="block text-xs text-muted-foreground">账号前缀<input className={input} placeholder="如 cls01" value={form.prefix} onChange={(event) => setForm({ ...form, prefix: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 12) })} /></label>
              </div>
              <p className="text-xs text-muted-foreground">登录账号将生成 {form.prefix || "前缀"}-01、{form.prefix || "前缀"}-02 …，学员用「账号 + 初始密码」登录。</p>
              <label className="block text-xs text-muted-foreground">昵称前缀（可选）<input className={input} placeholder="如 高一(2)班 学员" value={form.nicknameBase} onChange={(event) => setForm({ ...form, nicknameBase: event.target.value.slice(0, 30) })} /></label>
              <div className="flex gap-2">
                <label className="block flex-1 text-xs text-muted-foreground">每人额度（积分，0=不限额）<input className={input} inputMode="decimal" value={form.limit} onChange={(event) => setForm({ ...form, limit: event.target.value.replace(/[^\d.]/g, "") })} /></label>
                <label className="block w-28 text-xs text-muted-foreground">周期<select className={input} value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value as typeof form.period })}><option value="month">每月</option><option value="day">每日</option><option value="total">累计</option></select></label>
              </div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={form.canViewAll} onChange={(event) => setForm({ ...form, canViewAll: event.target.checked })} />允许这批成员查看全团队消费（只读）</label>
              <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
                {CREDIT_RULE_LABEL}。本次预计从团队池划出 <b className="text-foreground">{estimate ?? "—"}</b>（{count} 人 × {form.limit || 0} 积分）。池子不够会整批拒绝，不会创建半成品。
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" disabled={busy} onClick={close}>取消</Button>
                <Button disabled={busy} onClick={() => void submit()}>{busy ? "创建中…" : mfaEnabled ? "验证口令并创建" : "验证密码并创建"}</Button>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-6">
                <Users size={16} className="mt-0.5 shrink-0 text-primary" />
                <span>已创建 <b>{result.createdCount}</b> 个账号{result.failed ? `，${result.failed} 个失败（其余未创建）` : ""}。所有账号首次登录都会强制修改密码。</span>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-6">
                <Lock size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <span>
                  初始密码<b>不会显示在页面上</b>——它们在服务端加密暂存，只能通过下方「导出 Excel」取走。
                  下载窗口 <b className="tabular-nums">{left || "—"}</b>，最多下载 5 次，每次下载都会记入团队审计日志。
                </span>
              </div>

              <div className="max-h-56 overflow-auto rounded-xl border">
                <table className="w-full min-w-[360px] text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground"><tr><th className="p-2">登录账号</th><th>昵称</th><th className="text-right">额度</th></tr></thead>
                  <tbody className="divide-y">
                    {result.users.map((row) => (
                      <tr key={row.id}>
                        <td className="p-2 font-mono text-xs">{row.username}</td>
                        <td className="text-xs text-muted-foreground">{row.nickname}</td>
                        <td className="pr-2 text-right text-xs tabular-nums">{row.limitQuota ? formatTeamQuota(row.limitQuota) : "不限"} · {PERIOD[row.period] ?? row.period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => void exportExcel()}><FileSpreadsheet size={14} />导出 Excel</Button>
                <Button onClick={close}><Download size={14} />完成</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {askSudo && (
        <SudoDialog
          mfaEnabled={mfaEnabled}
          reason="批量创建账号或导出账号密码属于高风险操作，需要先完成安全验证。"
          onClose={() => setAskSudo(false)}
          onDone={(token) => {
            setAskSudo(false);
            if (!result) void submit();
            else void downloadBatch(result.batchId, teamId, mfaEnabled, () => setAskSudo(true), token);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------ 请求辅助 ------------------------------ */

async function apiPostBatch(
  teamId: number,
  body: { count: number; prefix: string; nicknameBase: string; limit: number; period: string; canViewAll: boolean },
  token: string,
): Promise<BatchResult> {
  const { api } = await import("@/lib/api");
  return api<BatchResult>("/api/team", {
    method: "POST",
    headers: { "X-Xoi-Sudo": token },
    body: JSON.stringify({ action: "batchMembers", teamId, ...body }),
  });
}

/**
 * 服务端生成 Excel + 带会话下载。
 * 不走 JSON api()，因为它要的是二进制流；这里 fetch 后落 Blob 再触发保存。
 */
export async function downloadBatch(
  batchId: string, teamId: number, mfaEnabled: boolean,
  onNeedSudo: () => void, tokenOverride?: string,
): Promise<void> {
  const token = tokenOverride || cachedSudoToken();
  if (!token) { onNeedSudo(); return; }
  try {
    const blob = await authedDownload(
      `/api/team/batches/export?batchId=${encodeURIComponent(batchId)}&teamId=${teamId}&format=xlsx`,
      token,
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `团队账号清单-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("已导出，建议尽快发送并提醒学员首次登录后改密码");
  } catch (error) {
    toast.error((error as Error).message);
  }
  void mfaEnabled;
}
