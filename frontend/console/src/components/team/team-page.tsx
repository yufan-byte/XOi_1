"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, KeyRound, Pencil, RotateCcw, RefreshCw, ArrowLeft, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { TopBar } from "@/components/shell/topbar";
import {TeamManagementPanel,TeamRenameDialog} from "./team-management";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api, hasSession, loadAuth } from "@/lib/api";
import { useSelf } from "@/lib/queries";
import { cn, QUOTA_PER_UNIT } from "@/lib/utils";
import { createLoginUrl } from "../../../../../shared/loginNavigation";
import {CREDIT_RULE_LABEL,TEAM_WORKSPACE_PATH,formatTeamQuota,teamQuotaPoints,teamPointsToYuan,teamMemberRole,csvTeamCell,teamMonths,teamResetText} from "@/lib/team-presentation";

type Period = "month" | "day" | "total";
interface MemberRow {
  id: number; userId: number; nickname: string; email: string; status: "active" | "disabled";
  limitQuota: number; period: Period; canViewAll: boolean; periodUsed: number; monthUsed: number; wallet: number; over: boolean; joinedAt?: number;
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
const fmt = formatTeamQuota;
const PERIOD: Record<Period, string> = { month: "每月", day: "每日", total: "总额" };
const CATEGORIES = [["all", "全部"], ["chat", "聊天"], ["image", "图片"], ["video", "视频"], ["audio", "音频"]] as const;
const CATEGORY_LABEL: Record<string, string> = { chat: "聊天", image: "图片", video: "视频", audio: "音频", other: "其他" };
const card = "rounded-2xl border border-border/60 bg-card p-4";

const months=teamMonths;
const resetText=teamResetText;

function exportCsv(name: string, rows: (string | number)[][]) {
  const text = "﻿" + rows.map((row) => row.map((cell) => `"${csvTeamCell(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

export function TeamPage({embedded=false}:{embedded?:boolean}={}) {
  const navigate=useNavigate();
  const logged = hasSession();
  const queryClient = useQueryClient();
  const { data: self } = useSelf(logged);
  const returningToManagement=!embedded&&!!self&&(self.role??0)>=10;
  useEffect(()=>{if(returningToManagement)navigate(TEAM_WORKSPACE_PATH,{replace:true});},[returningToManagement,navigate]);
  const [month, setMonth] = useState(months()[0]);
  const [tab, setTab] = useState<"overview" | "members" | "records" | "management">("overview");
  const [renaming,setRenaming]=useState(false);
  const query = useQuery({ queryKey: ["team", loadAuth()?.user.id ?? 0, month], queryFn: () => api<Dash>(`/api/team?month=${month}`), enabled: logged });
  const data = query.data;
  const owner = data?.role === "owner";
  useEffect(() => {
    if (!logged) window.location.replace(createLoginUrl("/console/team"));
  }, [logged]);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["team"] });
    void queryClient.invalidateQueries({ queryKey: ["self"] });
    void queryClient.invalidateQueries({ queryKey: ["team-records"] });
    void queryClient.invalidateQueries({queryKey:["team-management"]});
  };

  if (!logged) return <div className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">正在前往登录…</div>;

  if(returningToManagement)return <EmptyPage>正在打开管理台团队空间…</EmptyPage>;
  let content: React.ReactNode;
  if (query.isLoading) content = <EmptyPage>正在加载团队信息…</EmptyPage>;
  else if (query.isError) content = <EmptyPage>团队信息没加载出来，<button className="text-primary" onClick={() => void query.refetch()}>重试</button></EmptyPage>;
  else if (!data || data.role === "none") content = <CreateTeam onDone={refresh} />;
  else if (data.role === "member" && !data.canViewAll) content = <MemberHome data={data} month={month} onMonth={setMonth} />;
  else content = (
    <div className={cn("mx-auto w-full max-w-6xl space-y-6",!embedded&&"px-4 py-6")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="flex items-center gap-2 text-xs text-muted-foreground">团队空间<span className="rounded-full bg-primary/10 px-2 py-1 text-primary">{owner ? "团队所有者" : "消费查看者 · 只读"}</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight">{data.team?.name}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">统一管理团队积分、成员权限和使用记录。{!owner && "你拥有消费查看权限，不能管理成员或划拨积分。"}</p><p className="mt-2 text-xs text-muted-foreground">{CREDIT_RULE_LABEL} · 额度设置不是充值；调整后可能分配或回收团队积分{data.team?.id ? ` · 团队 ID ${data.team.id}` : ""}</p></div>
        <div className="flex flex-wrap items-center gap-2"><MonthSelect month={month} onChange={setMonth} />{owner&&<Button variant="secondary" size="sm" onClick={()=>setRenaming(true)}><Pencil size={14}/>团队名称</Button>}<Button variant="secondary" size="sm" disabled={query.isFetching} onClick={refresh}><RefreshCw size={14} />{query.isFetching ? "更新中…" : "刷新"}</Button></div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b pb-2" role="tablist" aria-label="团队工作区">{([["overview", "团队概览"], ["members", "成员与额度"], ["records", "消费明细"],...(owner?[["management","管理记录"] as const]:[])] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm", tab === value ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted")}>{label}</button>)}</div>
      {tab === "overview" && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="团队待分配积分" value={fmt(data.team?.pool ?? 0)} hint="积分池余额；不含已分配到成员的余额" />
        <Stat label="所选月份消耗" value={fmt(data.monthTotal ?? 0)} hint={`${month} · 全团队成员累计`} />
        <Stat label="成员席位" value={`${data.seats?.used ?? 0} / ${data.seats?.max ?? 2000}`} hint={`${data.seats?.active ?? 0} 活跃 · ${data.seats?.disabled ?? 0} 停用`} />
        <Stat label="超额提醒" value={data.overLimit?.length ? `${data.overLimit.length} 人` : "无"} hint={data.overLimit?.length ? `${data.overLimit.slice(0, 3).join("、")} 已用满额度` : "全部成员额度正常"} warn={!!data.overLimit?.length} />
      </div>
      {owner && <PoolPanel pool={data.team?.pool ?? 0} balance={self?.quota ?? 0} members={data.members ?? []} onDone={refresh} />}
      <div className="grid gap-4 lg:grid-cols-2"><Share members={data.members ?? []} total={data.monthTotal ?? 0} /><Trend days={data.days ?? []} /></div>
      {owner && !(data.members?.length) && <div className={card}><h3 className="font-semibold">开始协作</h3><p className="mt-1 text-sm text-muted-foreground">先将个人积分划入团队，再到「成员与额度」添加成员。每位成员拥有独立账号；成员消费上限与实际可用余额分别显示。</p><Button className="mt-3" onClick={() => setTab("members")}>管理成员与额度</Button></div>}
      </>}
      {tab === "members" && <Members members={data.members ?? []} owner={owner} onDone={refresh} />}
      {tab === "records" && <Records key={month} month={month} />}
      {owner&&tab==="management"&&<TeamManagementPanel/>}
      {owner&&renaming&&<TeamRenameDialog name={data.team?.name||""} onClose={()=>setRenaming(false)} onDone={refresh}/> }
    </div>
  );

  if(embedded)return <section className="xoi-team-workspace" aria-label="团队空间">{content}</section>;
  return <div className="xoi-team-shell min-h-dvh w-full bg-background text-foreground"><div className="border-b border-border bg-card"><TopBar /></div><main><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 pt-4">{self && self.role >= 10 && <Link to="/reseller/overview" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />返回管理控制台</Link>}<a href="/#/project" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />返回创作工作台</a></div>{content}</main></div>;
}

function MonthSelect({ month, onChange }: { month: string; onChange: (value: string) => void }) {
  return <label className="flex items-center gap-2 text-sm text-muted-foreground">统计月份<select aria-label="统计月份" value={month} onChange={event => onChange(event.target.value)} className="h-9 rounded-xl border bg-card px-3 text-foreground">{months().map(value => <option key={value} value={value}>{value.replace("-", "年")}月</option>)}</select></label>;
}

function EmptyPage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-sm text-muted-foreground">{children}</div>;
}

function CreateTeam({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!name.trim()) { toast.error("请输入团队名称"); return; }
    setBusy(true);
    try { await api("/api/team", { method: "POST", body: JSON.stringify({ action: "create", name: name.trim() }) }); toast.success("团队空间已开通"); onDone(); }
    catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-xl px-4 py-16"><section className={cn(card, "p-7 text-center")}><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Users size={26} /></span><h1 className="mt-4 text-2xl font-bold">创建团队空间</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">个人作品和积分保留不变。创建后可划拨团队积分、添加成员并设置每日、每月或累计消费上限。</p><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} aria-label="团队名称" maxLength={40} placeholder="例如：XOi 创作团队" className="mt-6 h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary" /><Button className="mt-3 w-full" disabled={busy} onClick={() => void submit()}>{busy ? "创建中…" : "创建团队"}</Button></section></div>;
}

function MemberHome({ data, month, onMonth }: { data: Dash; month: string; onMonth: (month: string) => void }) {
  const mine = data.mine;
  const remaining = data.me?.limitQuota ? Math.max(0, data.me.limitQuota - (mine?.periodUsed ?? 0)) : 0;
  return <div className="mx-auto max-w-4xl space-y-4 px-4 py-6"><div><div className="text-xs text-muted-foreground">团队成员</div><h1 className="text-2xl font-bold">{data.team?.name}</h1></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="当前可用算力" value={fmt(mine?.wallet ?? 0)} /><Stat label="本期团队额度" value={data.me?.limitQuota ? fmt(data.me.limitQuota) : "不限"} hint={data.me ? PERIOD[data.me.period] : ""} /><Stat label="本期已使用" value={fmt(mine?.periodUsed ?? 0)} /><Stat label="本期剩余额度" value={data.me?.limitQuota ? fmt(remaining) : "不限"} hint={data.me ? resetText(data.me.period) : ""} /></div><div className="flex justify-end"><MonthSelect month={month} onChange={onMonth} /></div><Records key={month} month={month} /></div>;
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return <div className={card}><div className="text-xs text-muted-foreground">{label}</div><div className={cn("mt-1 text-2xl font-bold tabular-nums", warn && "text-danger")}>{value}</div>{hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}</div>;
}

function PoolPanel({ pool, balance, members, onDone }: { pool: number; balance: number; members: MemberRow[]; onDone: () => void }) {
  const [amount, setAmount] = useState(""); const [busy, setBusy] = useState(false);
  const submitting=useRef(false);
  const go = async (direction: "in" | "out") => {
    const value = teamPointsToYuan(amount);
    if (submitting.current) return;
    if (value===null || !(value > 0)) { toast.error("请输入大于 0 的有效积分"); return; }
    if (value * QUOTA_PER_UNIT > (direction === "in" ? balance : pool)) { toast.error(direction === "in" ? "个人余额不足" : "团队可用余额不足"); return; }
    if(!window.confirm(`确认将 ${fmt(value*QUOTA_PER_UNIT)} ${direction==="in"?"从个人余额划入团队":"从团队转回个人余额"}？这只是积分划拨，不会充值或调用模型。`))return;
    submitting.current=true;setBusy(true);
    try { await api("/api/team", { method: "POST", body: JSON.stringify({ action: "pool", dir: direction, amount: value }) }); toast.success(direction === "in" ? "积分已划入团队" : "积分已转回个人余额"); setAmount(""); onDone(); }
    catch (error) { toast.error((error as Error).message); }
    finally { submitting.current=false;setBusy(false); }
  };
  const unlimited = members.filter(member => member.limitQuota === 0).length;
  const budgets = (["day", "month", "total"] as Period[]).map(period => `${PERIOD[period]} ${fmt(members.filter(member => member.period === period && member.limitQuota > 0).reduce((sum, member) => sum + member.limitQuota, 0))}`);
  return <div className={cn(card, "flex flex-wrap items-center gap-4")}><Wallet size={18} className="text-primary" /><div className="text-sm">个人余额 <b>{fmt(balance)}</b></div><div className="text-sm">团队池 <b>{fmt(pool)}</b></div><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} aria-label="划拨积分" inputMode="decimal" placeholder="输入积分" className="h-10 w-36 rounded-xl border bg-background px-3 outline-none" /><Button disabled={busy} onClick={() => void go("in")}>划入团队</Button><Button variant="secondary" disabled={busy} onClick={() => void go("out")}>转回个人</Button><div className="w-full text-xs text-muted-foreground">{CREDIT_RULE_LABEL} · 划拨只转移已有积分，不是充值，也不是模型消费。成员上限按周期统计：{budgets.join(" · ")} · 不限额 {unlimited} 人。额度是消费上限，不等于已划拨余额；补给仍取决于团队池余额。</div></div>;
}

function Share({ members, total }: { members: MemberRow[]; total: number }) {
  const rows = members.filter((member) => member.monthUsed > 0).sort((a, b) => b.monthUsed - a.monthUsed);
  return <div className={card}><h3 className="font-semibold">所选月份消费占比</h3><p className="text-xs text-muted-foreground">各成员消费占团队总消费的比例</p><div className="mt-3 space-y-2">{rows.slice(0, 10).map((member) => { const percent = total ? member.monthUsed / total * 100 : 0; return <div key={member.id}><div className="flex justify-between text-xs"><span>{member.nickname}</span><span>{fmt(member.monthUsed)} · {percent.toFixed(1)}%</span></div><div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(2, percent))}%` }} /></div></div>; })}{rows.length > 10 && <p className="pt-2 text-xs text-muted-foreground">显示消费前 10 名，完整名单见「成员与额度」。</p>}{!rows.length && <p className="py-8 text-center text-sm text-muted-foreground">所选月份暂无消费</p>}</div></div>;
}

function Trend({ days }: { days: { day: string; quota: number }[] }) {
  const max = Math.max(1, ...days.map((day) => day.quota));
  return <div className={card}><h3 className="font-semibold">团队消费趋势</h3><p className="text-xs text-muted-foreground">所选月份的每日消费</p><div className="mt-3 flex h-36 items-end gap-[3px]">{days.map((day) => <div key={day.day} title={`${day.day} · ${fmt(day.quota)}`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(2, day.quota / max * 100)}%` }} />)}</div></div>;
}

function Members({ members, owner, onDone }: { members: MemberRow[]; owner: boolean; onDone: () => void }) {
  const [search, setSearch] = useState(""); const [adding, setAdding] = useState(false); const [editing, setEditing] = useState<MemberRow | null>(null); const [password, setPassword] = useState<MemberRow | null>(null);
  const [filter, setFilter] = useState("all"); const [page, setPage] = useState(1); const [busyId, setBusyId] = useState<number | null>(null);
  const list = useMemo(() => members.filter(member => {
    const key = search.trim().toLowerCase();
    return (!key || `${member.nickname} ${member.email}`.toLowerCase().includes(key)) && (filter === "all" || filter === "over" && member.over || member.status === filter);
  }), [members, search, filter]);
  const pages = Math.max(1, Math.ceil(list.length / 25));
  const currentPage = Math.min(page, pages);
  const visible = list.slice((currentPage - 1) * 25, currentPage * 25);
  const act = async (member: MemberRow, body: Record<string, unknown>, message: string) => { if (busyId !== null) return false; setBusyId(member.id); try { await api(`/api/team/members/${member.id}`, { method: "PATCH", body: JSON.stringify(body) }); toast.success(message); onDone(); return true; } catch (error) { toast.error((error as Error).message); return false; } finally { setBusyId(null); } };
  return <div className={card}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Users size={16} /><h3 className="font-semibold">团队成员</h3><span className="text-xs text-muted-foreground">{members.length} 名</span></div><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={!list.length} onClick={() => exportCsv("团队成员.csv", [["昵称", "邮箱", "角色", "当前积分", "积分上限", "周期", "本期已用积分"], ...list.map((member) => [member.nickname, member.email, teamMemberRole(member.canViewAll),teamQuotaPoints(member.wallet), member.limitQuota ? teamQuotaPoints(member.limitQuota) : "不限", PERIOD[member.period], teamQuotaPoints(member.periodUsed)])])}><Download size={14} />导出</Button>{owner && <Button size="sm" onClick={() => setAdding(true)}><UserPlus size={14} />添加成员</Button>}</div></div><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="搜索成员姓名 / 邮箱" className="mt-3 h-9 w-full rounded-xl border bg-background px-3 text-sm outline-none" /><div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="成员状态">{[["all", "全部"], ["active", "正常"], ["disabled", "已停用"], ["over", "额度已用满"]].map(([value, label]) => <button key={value} onClick={() => { setFilter(value); setPage(1); }} className={cn("rounded-lg px-3 py-1.5 text-xs", filter === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>{label}</button>)}</div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">成员</th><th>可用积分</th><th>本期已用 / 额度</th><th>剩余额度</th><th>下次重置</th><th className="text-right">{owner ? "操作" : "消费权限"}</th></tr></thead><tbody className="divide-y">{visible.map((member) => { const remaining = member.limitQuota ? Math.max(0, member.limitQuota - member.periodUsed) : 0; return <tr key={member.id}><td className="py-2"><div className="flex items-center gap-2 font-medium">{member.nickname}<span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{teamMemberRole(member.canViewAll)}</span></div><div className="text-xs text-muted-foreground">{member.email} · {member.status === "active" ? "正常" : "已停用"}</div></td><td>{fmt(member.wallet)}</td><td className={member.over ? "text-danger" : ""}>{fmt(member.periodUsed)} / {member.limitQuota ? fmt(member.limitQuota) : "不限"}</td><td>{member.limitQuota ? fmt(remaining) : "不限"}</td><td className="text-muted-foreground">{resetText(member.period)}</td><td className="text-right">{owner && <span className="inline-flex gap-1" aria-busy={busyId === member.id}><Icon label="编辑" onClick={() => setEditing(member)}><Pencil size={13} /></Icon><Icon label="改密" onClick={() => setPassword(member)}><KeyRound size={13} /></Icon>{member.status === "active" ? <Icon label="停用" disabled={busyId !== null} onClick={() => void act(member, { action: "disable" }, "已停用")}><Ban size={13} /></Icon> : <Icon label="启用" disabled={busyId !== null} onClick={() => void act(member, { action: "enable" }, "已启用")}><RotateCcw size={13} /></Icon>}<Icon label="删除" disabled={busyId !== null} danger onClick={() => { if (window.confirm(`确定删除「${member.nickname}」吗？`)) void act(member, { action: "delete" }, "已删除"); }}><Trash2 size={13} /></Icon></span>}{!owner && <span className="text-xs text-muted-foreground">只读</span>}</td></tr>; })}</tbody></table>{!list.length && <div className="py-10 text-center text-sm text-muted-foreground">{members.length ? "没有匹配成员，试试其他关键词或状态" : "还没有成员，可从添加成员开始"}</div>}</div><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>共 {list.length} 名 · 每页 25 名</span><div className="flex items-center gap-3"><Button size="sm" variant="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</Button><span>{currentPage} / {pages}</span><Button size="sm" variant="secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>下一页</Button></div></div>{adding && <MemberForm onClose={() => setAdding(false)} onDone={onDone} />}{editing && <MemberForm edit={editing} onClose={() => setEditing(null)} onDone={onDone} />}{password && <PasswordDialog member={password} onClose={() => setPassword(null)} onSave={(value) => act(password, { action: "password", password: value }, "密码已修改")} />}</div>;
}

function Icon({ label, onClick, danger, disabled, children }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; children: React.ReactNode }) { return <button title={label} aria-label={label} disabled={disabled} onClick={onClick} className={cn("grid h-8 w-8 place-items-center rounded-lg border text-muted-foreground hover:text-foreground disabled:opacity-50", danger && "hover:bg-danger/10 hover:text-danger")}>{children}</button>; }

function PasswordDialog({ member, onClose, onSave }: { member: MemberRow; onClose: () => void; onSave: (password: string) => Promise<boolean> }) {
  const [value, setValue] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    if (value.length < 8 || value.length > 20) { toast.error("新密码需 8~20 位"); return; }
    setBusy(true);
    try { if (await onSave(value)) onClose(); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent title={`修改 ${member.nickname} 的登录密码`} description="修改成功后，成员需使用新密码登录。"><input aria-label="新密码" type="password" autoComplete="new-password" value={value} onChange={event => setValue(event.target.value)} placeholder="8~20 位新密码" className="h-10 w-full rounded-xl border bg-background px-3 outline-none" /><div className="mt-3 flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存"}</Button></div></DialogContent></Dialog>;
}

function MemberForm({ edit, onClose, onDone }: { edit?: MemberRow; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ nickname: edit?.nickname ?? "", email: edit?.email ?? "", password: "", limit: edit ? String(teamQuotaPoints(edit.limitQuota)) : "", period: edit?.period ?? "month" as Period, canViewAll: edit?.canViewAll ?? false }); const [busy, setBusy] = useState(false);
  const submit = async () => { if (busy) return; if (teamPointsToYuan(form.limit)===null) { toast.error("请输入有效额度，0 表示不限额"); return; } if (!form.nickname.trim()) { toast.error("请填写成员昵称"); return; } if (!edit && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("邮箱格式不对"); return; } if (!edit && (form.password.length < 8 || form.password.length > 20)) { toast.error("初始密码需 8~20 位"); return; } setBusy(true); try { const body = edit ? { action: "update", nickname: form.nickname, limit: teamPointsToYuan(form.limit), period: form.period, canViewAll: form.canViewAll } : {...form,limit:teamPointsToYuan(form.limit)}; await api(edit ? `/api/team/members/${edit.id}` : "/api/team/members", { method: edit ? "PATCH" : "POST", body: JSON.stringify(body) }); toast.success(edit ? "已保存" : "成员已创建，可用邮箱在「团队登录」进入"); onDone(); onClose(); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } };
  const input = "mt-1 h-10 w-full rounded-xl border bg-background px-3 outline-none";
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent title={edit ? `编辑成员 · ${edit.nickname}` : "添加成员"}><div className="space-y-3"><label className="block text-xs text-muted-foreground">成员昵称<input className={input} value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} /></label>{!edit && <><label className="block text-xs text-muted-foreground">登录邮箱<input className={input} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="block text-xs text-muted-foreground">初始密码<input type="password" className={input} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label></>}<div className="flex gap-2"><label className="block flex-1 text-xs text-muted-foreground">消费上限（积分，0=不限额）<input className={input} value={form.limit} onChange={(event) => setForm({ ...form, limit: event.target.value.replace(/[^\d.]/g, "") })} /></label><label className="block w-28 text-xs text-muted-foreground">周期<select className={input} value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value as Period })}><option value="month">每月</option><option value="day">每日</option><option value="total">总额</option></select></label></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.canViewAll} onChange={(event) => setForm({ ...form, canViewAll: event.target.checked })} />允许查看全部团队消费（只读）</label><p className="text-xs leading-5 text-muted-foreground">{CREDIT_RULE_LABEL}。普通成员只查看自己的消费；消费查看者可查看全团队账单，但不能管理成员。0 表示不限额，仍受团队实际余额限制；调整额度可能分配或回收团队积分，不产生模型消费。</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>取消</Button><Button disabled={busy} onClick={() => void submit()}>{busy ? "保存中…" : "保存"}</Button></div></div></DialogContent></Dialog>;
}

function Records({ month }: { month: string }) {
  const [category, setCategory] = useState("all"); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["team-records", loadAuth()?.user.id ?? 0, month, category, page], queryFn: () => api<{ items: RecordRow[]; total: number }>(`/api/team/records?month=${month}&category=${category}&page=${page}`) });
  const items = query.data?.items ?? []; const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 50));
  return <div className={card}><div className="flex items-center justify-between"><div><h3 className="font-semibold">消费明细</h3><p className="text-xs text-muted-foreground">{CREDIT_RULE_LABEL} · 按实际消费记录核对积分</p></div><Button variant="secondary" size="sm" disabled={!items.length || query.isFetching} onClick={() => exportCsv(`团队消费-${month}-第${page}页.csv`, [["时间", "成员", "类别", "模型", "消耗积分"], ...items.map((item) => [new Date(item.at * 1000).toLocaleString("zh-CN"), item.member, CATEGORY_LABEL[item.category] ?? "其他", item.model, teamQuotaPoints(item.quota)])])}><Download size={14} />导出本页</Button></div><div className="mt-3 flex flex-wrap gap-1">{CATEGORIES.map(([value, label]) => <button key={value} onClick={() => { setCategory(value); setPage(1); }} className={cn("h-8 rounded-xl px-3 text-sm", category === value ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted")}>{label}</button>)}</div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">时间</th><th>成员</th><th>类别</th><th>模型</th><th className="text-right">消耗积分</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="py-2 text-muted-foreground">{new Date(item.at * 1000).toLocaleString("zh-CN")}</td><td>{item.member}</td><td>{CATEGORY_LABEL[item.category] ?? "其他"}</td><td>{item.model}</td><td className="text-right">{fmt(item.quota)}</td></tr>)}</tbody></table>{query.isLoading && <div className="py-8 text-center text-sm text-muted-foreground">正在加载消费记录…</div>}{query.isError && <div className="py-8 text-center text-sm text-danger">记录加载失败 <button className="text-primary underline" onClick={() => void query.refetch()}>重试</button></div>}{query.isSuccess && !items.length && <div className="py-8 text-center text-sm text-muted-foreground">所选条件下暂无消费记录</div>}</div>{pages > 1 && <div className="mt-3 flex justify-end gap-2 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button></div>}</div>;
}
