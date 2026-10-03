"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, KeyRound, Pencil, RotateCcw, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api, hasSession } from "@/lib/api";
import { useSelf } from "@/lib/queries";
import { cn, QUOTA_PER_UNIT } from "@/lib/utils";

type Period = "month" | "day" | "total";
interface MemberRow {
  id: number; userId: number; nickname: string; email: string; status: "active" | "disabled";
  limitQuota: number; period: Period; canViewAll: boolean; periodUsed: number; monthUsed: number; wallet: number; over: boolean;
}
interface Dash {
  role: "owner" | "member" | "none"; canViewAll?: boolean;
  me?: { nickname: string; limitQuota: number; period: Period; status: string };
  team?: { id?: number; name: string; pool?: number; isolate?: boolean };
  monthTotal?: number; seats?: { used: number; max: number; active: number; disabled: number };
  overLimit?: string[]; members?: MemberRow[]; days?: { day: string; quota: number }[]; mine?: MemberRow;
}
interface RecordRow { id: number; member: string; at: number; model: string; quota: number; category: string }

const yuan = (quota: number) => quota / QUOTA_PER_UNIT;
const fmt = (quota: number) => `¥${yuan(quota).toFixed(yuan(quota) >= 100 ? 0 : 2)}`;
const PERIOD: Record<Period, string> = { month: "每月", day: "每日", total: "总额" };
const CATEGORIES = [["all", "全部"], ["chat", "聊天"], ["image", "图片"], ["video", "视频"], ["audio", "音频"]] as const;
const CATEGORY_LABEL: Record<string, string> = { chat: "聊天", image: "图片", video: "视频", audio: "音频", other: "其他" };
const card = "rounded-2xl border border-border/60 bg-card p-4";

function months() {
  const result: string[] = [];
  const now = new Date();
  for (let index = 0; index < 12; index += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    result.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

function resetText(period: Period) {
  if (period === "total") return "不自动重置";
  if (period === "day") return "明日 00:00 重置";
  const date = new Date();
  return `${date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear()}年${date.getMonth() === 11 ? 1 : date.getMonth() + 2}月1日重置`;
}

function exportCsv(name: string, rows: (string | number)[][]) {
  const text = "﻿" + rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  anchor.download = name;
  anchor.click();
}

export function TeamPage() {
  const logged = hasSession();
  const queryClient = useQueryClient();
  const { data: self } = useSelf(logged);
  const [month, setMonth] = useState(months()[0]);
  const query = useQuery({ queryKey: ["team", month], queryFn: () => api<Dash>(`/api/team?month=${month}`), enabled: logged });
  const data = query.data;
  const owner = data?.role === "owner";
  useEffect(() => {
    if (!logged) window.location.replace("/console/login?next=%2Fteam");
  }, [logged]);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["team"] });
    void queryClient.invalidateQueries({ queryKey: ["self"] });
  };

  if (!logged) return <div className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">正在前往登录…</div>;

  let content: React.ReactNode;
  if (query.isLoading) content = <EmptyPage>正在加载团队信息…</EmptyPage>;
  else if (query.isError) content = <EmptyPage>团队信息没加载出来，<button className="text-primary" onClick={() => void query.refetch()}>重试</button></EmptyPage>;
  else if (!data || data.role === "none") content = <CreateTeam onDone={refresh} />;
  else if (data.role === "member" && !data.canViewAll) content = <MemberHome data={data} month={month} />;
  else content = (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="text-xs text-muted-foreground">团队管理</div><h1 className="text-2xl font-bold">{data.team?.name}</h1><p className="mt-1 text-sm text-muted-foreground">算力池、成员额度与 NewAPI 消费归属。{!owner && "（只读）"}</p></div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">选择月份<select value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-xl border bg-card px-3 text-foreground">{months().map((value) => <option key={value} value={value}>{value.replace("-", "年")}月</option>)}</select></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="团队可用算力" value={fmt(data.team?.pool ?? 0)} hint="主账号从个人账号划拨" />
        <Stat label="本月团队消费" value={fmt(data.monthTotal ?? 0)} hint="全团队成员本月累计" />
        <Stat label="席位" value={`${data.seats?.used ?? 0} / ${data.seats?.max ?? 2000}`} hint={`${data.seats?.active ?? 0} 活跃 · ${data.seats?.disabled ?? 0} 停用`} />
        <Stat label="超额提醒" value={data.overLimit?.length ? `${data.overLimit.length} 人` : "无"} hint={data.overLimit?.length ? `${data.overLimit.slice(0, 3).join("、")} 已用满额度` : "全部成员额度正常"} warn={!!data.overLimit?.length} />
      </div>
      {owner && <PoolPanel pool={data.team?.pool ?? 0} balance={self?.quota ?? 0} members={data.members ?? []} onDone={refresh} />}
      <div className="grid gap-4 lg:grid-cols-2"><Share members={data.members ?? []} total={data.monthTotal ?? 0} /><Trend days={data.days ?? []} /></div>
      <Members members={data.members ?? []} owner={owner} onDone={refresh} />
      <Records month={month} />
    </div>
  );

  return <div className="min-h-dvh w-full bg-background text-foreground"><TopBar /><main>{content}</main></div>;
}

function EmptyPage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-sm text-muted-foreground">{children}</div>;
}

function CreateTeam({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) { toast.error("请输入团队名称"); return; }
    setBusy(true);
    try { await api("/api/team", { method: "POST", body: JSON.stringify({ action: "create", name: name.trim() }) }); toast.success("团队空间已开通"); onDone(); }
    catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-xl px-4 py-16"><section className={cn(card, "p-7 text-center")}><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Users size={26} /></span><h1 className="mt-4 text-2xl font-bold">开启团队版</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">个人作品和余额保留不变。开通后可划拨团队算力、创建成员账号并按周期设置消费额度。</p><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} placeholder="例如：鲲鹏创意" className="mt-6 h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary" /><Button className="mt-3 w-full" disabled={busy} onClick={() => void submit()}>{busy ? "创建中…" : "创建团队"}</Button></section></div>;
}

function MemberHome({ data, month }: { data: Dash; month: string }) {
  const mine = data.mine;
  const remaining = data.me?.limitQuota ? Math.max(0, data.me.limitQuota - (mine?.periodUsed ?? 0)) : 0;
  return <div className="mx-auto max-w-4xl space-y-4 px-4 py-6"><div><div className="text-xs text-muted-foreground">团队成员</div><h1 className="text-2xl font-bold">{data.team?.name}</h1></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="当前可用算力" value={fmt(mine?.wallet ?? 0)} /><Stat label="本期团队额度" value={data.me?.limitQuota ? fmt(data.me.limitQuota) : "不限"} hint={data.me ? PERIOD[data.me.period] : ""} /><Stat label="本期已使用" value={fmt(mine?.periodUsed ?? 0)} /><Stat label="本期剩余额度" value={data.me?.limitQuota ? fmt(remaining) : "不限"} hint={data.me ? resetText(data.me.period) : ""} /></div><Records month={month} /></div>;
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return <div className={card}><div className="text-xs text-muted-foreground">{label}</div><div className={cn("mt-1 text-2xl font-bold tabular-nums", warn && "text-danger")}>{value}</div>{hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}</div>;
}

function PoolPanel({ pool, balance, members, onDone }: { pool: number; balance: number; members: MemberRow[]; onDone: () => void }) {
  const [amount, setAmount] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (direction: "in" | "out") => {
    const value = Number(amount);
    if (!(value > 0)) { toast.error("请输入大于 0 的金额"); return; }
    setBusy(true);
    try { await api("/api/team", { method: "POST", body: JSON.stringify({ action: "pool", dir: direction, amount: value }) }); toast.success(direction === "in" ? "已划拨到团队" : "已提回个人余额"); setAmount(""); onDone(); }
    catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  };
  const allocated = members.reduce((sum, member) => sum + member.limitQuota, 0);
  return <div className={cn(card, "flex flex-wrap items-center gap-4")}><Wallet size={18} className="text-primary" /><div className="text-sm">个人余额 <b>{fmt(balance)}</b></div><div className="text-sm">团队池 <b>{fmt(pool)}</b></div><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} placeholder="金额（元）" className="h-10 w-36 rounded-xl border bg-background px-3 outline-none" /><Button disabled={busy} onClick={() => void go("in")}>划拨</Button><Button variant="secondary" disabled={busy} onClick={() => void go("out")}>提回</Button><div className="w-full text-xs text-muted-foreground">成员额度合计 {fmt(allocated)}；系统每分钟按额度自动补给。</div></div>;
}

function Share({ members, total }: { members: MemberRow[]; total: number }) {
  const rows = members.filter((member) => member.monthUsed > 0).sort((a, b) => b.monthUsed - a.monthUsed);
  return <div className={card}><h3 className="font-semibold">本月消费占比</h3><p className="text-xs text-muted-foreground">各成员消费占团队总消费的比例</p><div className="mt-3 space-y-2">{rows.map((member) => { const percent = total ? member.monthUsed / total * 100 : 0; return <div key={member.id}><div className="flex justify-between text-xs"><span>{member.nickname}</span><span>{fmt(member.monthUsed)} · {percent.toFixed(1)}%</span></div><div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, percent)}%` }} /></div></div>; })}{!rows.length && <p className="py-8 text-center text-sm text-muted-foreground">本月暂无消费</p>}</div></div>;
}

function Trend({ days }: { days: { day: string; quota: number }[] }) {
  const max = Math.max(1, ...days.map((day) => day.quota));
  return <div className={card}><h3 className="font-semibold">团队消费趋势</h3><p className="text-xs text-muted-foreground">所选月份的每日消费</p><div className="mt-3 flex h-36 items-end gap-[3px]">{days.map((day) => <div key={day.day} title={`${day.day} · ${fmt(day.quota)}`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(2, day.quota / max * 100)}%` }} />)}</div></div>;
}

function Members({ members, owner, onDone }: { members: MemberRow[]; owner: boolean; onDone: () => void }) {
  const [search, setSearch] = useState(""); const [adding, setAdding] = useState(false); const [editing, setEditing] = useState<MemberRow | null>(null); const [password, setPassword] = useState<MemberRow | null>(null);
  const list = useMemo(() => members.filter((member) => !search || member.nickname.includes(search) || member.email.includes(search)), [members, search]);
  const act = async (member: MemberRow, body: Record<string, unknown>, message: string) => { try { await api(`/api/team/members/${member.id}`, { method: "PATCH", body: JSON.stringify(body) }); toast.success(message); onDone(); } catch (error) { toast.error((error as Error).message); } };
  return <div className={card}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Users size={16} /><h3 className="font-semibold">团队成员</h3><span className="text-xs text-muted-foreground">{members.length} 名</span></div><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={!members.length} onClick={() => exportCsv("团队成员.csv", [["昵称", "邮箱", "当前余额", "额度", "周期", "本期已用"], ...members.map((member) => [member.nickname, member.email, yuan(member.wallet), member.limitQuota ? yuan(member.limitQuota) : "不限", PERIOD[member.period], yuan(member.periodUsed)])])}><Download size={14} />导出</Button>{owner && <Button size="sm" onClick={() => setAdding(true)}><UserPlus size={14} />添加成员</Button>}</div></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索成员姓名 / 邮箱" className="mt-3 h-9 w-full rounded-xl border bg-background px-3 text-sm outline-none" /><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">成员</th><th>当前余额</th><th>本期已用 / 额度</th><th>剩余额度</th><th>下次重置</th><th className="text-right">操作</th></tr></thead><tbody className="divide-y">{list.map((member) => { const remaining = member.limitQuota ? Math.max(0, member.limitQuota - member.periodUsed) : 0; return <tr key={member.id}><td className="py-2"><div className="font-medium">{member.nickname}</div><div className="text-xs text-muted-foreground">{member.email} · {member.status === "active" ? "正常" : "已停用"}</div></td><td>{fmt(member.wallet)}</td><td className={member.over ? "text-danger" : ""}>{fmt(member.periodUsed)} / {member.limitQuota ? fmt(member.limitQuota) : "不限"}</td><td>{member.limitQuota ? fmt(remaining) : "不限"}</td><td className="text-muted-foreground">{resetText(member.period)}</td><td className="text-right">{owner && <span className="inline-flex gap-1"><Icon label="编辑" onClick={() => setEditing(member)}><Pencil size={13} /></Icon><Icon label="改密" onClick={() => setPassword(member)}><KeyRound size={13} /></Icon>{member.status === "active" ? <Icon label="停用" onClick={() => void act(member, { action: "disable" }, "已停用")}><Ban size={13} /></Icon> : <Icon label="启用" onClick={() => void act(member, { action: "enable" }, "已启用")}><RotateCcw size={13} /></Icon>}<Icon label="删除" danger onClick={() => { if (window.confirm(`确定删除「${member.nickname}」吗？`)) void act(member, { action: "delete" }, "已删除"); }}><Trash2 size={13} /></Icon></span>}</td></tr>; })}</tbody></table></div>{adding && <MemberForm onClose={() => setAdding(false)} onDone={onDone} />}{editing && <MemberForm edit={editing} onClose={() => setEditing(null)} onDone={onDone} />}{password && <PasswordDialog member={password} onClose={() => setPassword(null)} onSave={(value) => act(password, { action: "password", password: value }, "密码已修改")} />}</div>;
}

function Icon({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) { return <button title={label} aria-label={label} onClick={onClick} className={cn("grid h-8 w-8 place-items-center rounded-lg border text-muted-foreground hover:text-foreground", danger && "hover:bg-danger/10 hover:text-danger")}>{children}</button>; }

function PasswordDialog({ member, onClose, onSave }: { member: MemberRow; onClose: () => void; onSave: (password: string) => Promise<void> }) { const [value, setValue] = useState(""); return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent title={`修改 ${member.nickname} 的登录密码`}><input type="password" value={value} onChange={(event) => setValue(event.target.value)} placeholder="8~20 位新密码" className="h-10 w-full rounded-xl border bg-background px-3 outline-none" /><div className="mt-3 flex justify-end"><Button onClick={async () => { if (value.length < 8 || value.length > 20) { toast.error("新密码需 8~20 位"); return; } await onSave(value); onClose(); }}>保存</Button></div></DialogContent></Dialog>; }

function MemberForm({ edit, onClose, onDone }: { edit?: MemberRow; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ nickname: edit?.nickname ?? "", email: edit?.email ?? "", password: "", limit: edit ? String(yuan(edit.limitQuota)) : "0", period: edit?.period ?? "month" as Period, canViewAll: edit?.canViewAll ?? false }); const [busy, setBusy] = useState(false);
  const submit = async () => { if (!form.nickname.trim()) { toast.error("请填写成员昵称"); return; } if (!edit && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("邮箱格式不对"); return; } if (!edit && (form.password.length < 8 || form.password.length > 20)) { toast.error("初始密码需 8~20 位"); return; } setBusy(true); try { const body = edit ? { action: "update", nickname: form.nickname, limit: Number(form.limit), period: form.period, canViewAll: form.canViewAll } : form; await api(edit ? `/api/team/members/${edit.id}` : "/api/team/members", { method: edit ? "PATCH" : "POST", body: JSON.stringify(body) }); toast.success(edit ? "已保存" : "成员已创建，可用邮箱在「团队登录」进入"); onDone(); onClose(); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } };
  const input = "mt-1 h-10 w-full rounded-xl border bg-background px-3 outline-none";
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent title={edit ? `编辑成员 · ${edit.nickname}` : "添加成员"}><div className="space-y-3"><label className="block text-xs text-muted-foreground">成员昵称<input className={input} value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} /></label>{!edit && <><label className="block text-xs text-muted-foreground">登录邮箱<input className={input} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="block text-xs text-muted-foreground">初始密码<input type="password" className={input} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label></>}<div className="flex gap-2"><label className="block flex-1 text-xs text-muted-foreground">消费额度（元，0=不限）<input className={input} value={form.limit} onChange={(event) => setForm({ ...form, limit: event.target.value.replace(/[^\d.]/g, "") })} /></label><label className="block w-28 text-xs text-muted-foreground">周期<select className={input} value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value as Period })}><option value="month">每月</option><option value="day">每日</option><option value="total">总额</option></select></label></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.canViewAll} onChange={(event) => setForm({ ...form, canViewAll: event.target.checked })} />允许查看全部团队消费（只读）</label><div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>取消</Button><Button disabled={busy} onClick={() => void submit()}>{busy ? "保存中…" : "保存"}</Button></div></div></DialogContent></Dialog>;
}

function Records({ month }: { month: string }) {
  const [category, setCategory] = useState("all"); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["team-records", month, category, page], queryFn: () => api<{ items: RecordRow[]; total: number }>(`/api/team/records?month=${month}&category=${category}&page=${page}`) });
  const items = query.data?.items ?? []; const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 50));
  return <div className={card}><div className="flex items-center justify-between"><div><h3 className="font-semibold">消费明细</h3><p className="text-xs text-muted-foreground">每一笔都直接来自 NewAPI logs</p></div><Button variant="secondary" size="sm" disabled={!items.length} onClick={() => exportCsv(`团队消费-${month}.csv`, [["时间", "成员", "类别", "模型", "花费（元）"], ...items.map((item) => [new Date(item.at * 1000).toLocaleString("zh-CN"), item.member, CATEGORY_LABEL[item.category] ?? "其他", item.model, yuan(item.quota)])])}><Download size={14} />导出</Button></div><div className="mt-3 flex gap-1">{CATEGORIES.map(([value, label]) => <button key={value} onClick={() => { setCategory(value); setPage(1); }} className={cn("h-8 rounded-xl px-3 text-sm", category === value ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted")}>{label}</button>)}</div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">时间</th><th>成员</th><th>类别</th><th>模型</th><th className="text-right">花费</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="py-2 text-muted-foreground">{new Date(item.at * 1000).toLocaleString("zh-CN")}</td><td>{item.member}</td><td>{CATEGORY_LABEL[item.category] ?? "其他"}</td><td>{item.model}</td><td className="text-right">{fmt(item.quota)}</td></tr>)}</tbody></table>{!query.isLoading && !items.length && <div className="py-8 text-center text-sm text-muted-foreground">暂无消费记录</div>}</div>{pages > 1 && <div className="mt-3 flex justify-end gap-2 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button></div>}</div>;
}
