"use client";
/**
 * /reseller/* 路由总表 —— 对应造物 src/app/reseller/** 的全部页面薄壳 + layout 闸门。
 *
 * 路径刻意保持与造物一致（/reseller/...，在 console 子应用里即 /console/reseller/...）：
 * shell 菜单和组件里有大量硬编码的 /reseller/ 链接，不改一个字就能对上。
 *
 * 页面实现全部来自已移植的 components/reseller/*；这里只做「薄壳内联 + 接缝适配」：
 *   next/navigation → react-router-dom；redirect() → <Navigate>。
 */
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, Route, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Building2, Globe2, ShieldCheck, Sparkles, ScrollText, UserPlus, QrCode, Bell, CircleDollarSign, CreditCard, Ticket, Percent, TrendingUp, FileText, ArrowDownToLine, ArrowLeftRight, Clapperboard, Network, UserCheck, Users, Handshake, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@/shims/next-link";
import { ResellerShell } from "@/components/reseller/shell";
import { ResellerGate, SectionHero } from "@/components/reseller/common";
import { AdminOnly } from "@/components/reseller/site/ui";
import { LegacyPage, ErrorBanner, CurrentPanel } from "@/components/reseller/legacy/frame";
import {
    IncomeView, WithdrawButton, WithdrawalsView, CashflowView, InvoicesView, ConversionView, TiersView,
    ChannelTeamView, CardKeysView, SiteMessagesView, ActivitiesView, AuditLogView,
} from "@/components/reseller/legacy/views";
import { AccountSettings, SettingsView } from "@/components/reseller/settings/settings";
import { OverviewConsole } from "@/components/reseller/overview/console";
import { CustomersView } from "@/components/reseller/customers/customers";
import { LegacyCustomerList } from "@/components/reseller/customers/legacy-list";
import { FinanceView, useFinance, ACCOUNT_TYPES } from "@/components/reseller/finance/finance";
import { AccountsTab, ProfileTab } from "@/components/reseller/finance/payout";
import { InvoiceRequestsPanel } from "@/components/reseller/finance/invoice-requests";
import { ModelsCenter } from "@/components/reseller/models/models-center";
import { CustomerServiceCenter } from "@/components/reseller/customer-service/customer-service-center";
import { AnnouncementsView } from "@/components/reseller/announcements/announcements";
import { AdminTasksView, AdminTopupsView, AdminRedemptionsView, AdminPolicyView, AdminCreditsView } from "@/components/reseller/admin/platform-views";
import { AdminUsersView } from "@/components/reseller/admin/users-view";
import { DailyStatsView } from "@/components/reseller/admin/stats-view";
import { SecurityView } from "@/components/reseller/admin/security-view";
import { MessagesView } from "@/components/reseller/messages/messages";
import { SiteInfo } from "@/components/reseller/site/site-info";
import { LoginVideoPanel } from "@/components/reseller/site/login-videos";
import { AdminRecruitView, UserRecruitView, PartnerView } from "@/components/reseller/recruit/recruit";
import { AgentsPanel } from "@/components/reseller/team/agents-panel";
import { AgentInvite, AgentMarkup } from "@/components/reseller/agent/agent-views";
import { SkillReview, WorkReview } from "@/components/reseller/moderation/skill-review";
import { useResellerMe, useResellerScope, useIsReseller } from "@/lib/reseller/client";
import { api, hasSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { createLoginUrl } from "../../../../../shared/loginNavigation";
import {ReleasesView} from "@/components/reseller/admin/releases";
import {TeamPage as TeamWorkspaceContent} from "@/components/team/team-page";

/* ------------------------------------------------------------------ */
/* 闸门（对应造物 reseller/layout.tsx）                                  */
/* ------------------------------------------------------------------ */

/** 代理能打开的页面；其余是整站配置（白标、主题、客服…），只有站长能看 */
const AGENT_PATHS = ["/reseller/overview", "/reseller/customers", "/reseller/models", "/reseller/finance", "/reseller/invite", "/reseller/account/audit-log", "/reseller/account/payout-profile", "/reseller/account/withdrawal"];

/** 登录后回跳的目标：带上查询串（useLocation.pathname 不含查询串） */
const nextTarget = (path: string) => path + window.location.search;

export function AdminGate() {
    const navigate = useNavigate();
    const location = useLocation();
    const path = location.pathname;
    // XOi: 造物 layout 还会读 localStorage("mc.auth") 兜底首屏；console 的会话键是平铺的，
    // hasSession() 等价覆盖「本机有登录态」这个判定，不做逐键解析。
    const logged = hasSession();
    const me = useResellerMe();
    const allowed = logged && !!me.data?.scope;
    const agentBlocked = me.data?.scope === "agent" && !AGENT_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
    useEffect(() => {
        if (allowed && agentBlocked) { navigate("/reseller/overview", { replace: true }); return; }
        if (allowed) return;
        if (!logged) { navigate(createLoginUrl(nextTarget(path)).replace(/^\/console/, ""), { replace: true }); return; }
        if (me.isSuccess) navigate("/agent-apply", { replace: true });
    }, [allowed, agentBlocked, logged, navigate, path, me.isSuccess, me.isError]);
    if (logged && me.isError) return <div className="grid h-dvh place-content-center gap-3 bg-background px-6 text-center text-foreground"><h1 className="font-semibold">后台权限暂时未能加载</h1><p className="text-sm text-muted-foreground">请重试，当前页面地址已保留。</p><button className="rounded-xl border px-4 py-2" onClick={() => void me.refetch()}>重新加载</button><a href="/#/aiAssistant" className="text-sm text-primary">返回智能创作</a></div>;
    if (!allowed || agentBlocked) return <div className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">正在验证后台权限…</div>;
    return <Outlet />;
}

/* ------------------------------------------------------------------ */
/* 动态段 [section] 的「成为代理商」引导页（对应 [section]/page.tsx）      */
/* ------------------------------------------------------------------ */

const TITLES: Record<string, string> = { branding: "白标配置", models: "模型管理", customers: "我的客户", team: "下级代理", finance: "财务管理", "customer-service": "客户服务", messages: "我的留言", announcements: "官方公告", settings: "设置", "login-page": "登录页管理", partner: "招商合作", income: "收益记录", withdrawals: "提现记录", invoices: "发票记录", tiers: "客户分层", "user-invite": "用户邀请", tree: "代理族谱", channel: "渠道管理", pricing: "定价设置", "site-ops": "站内运营", "site-activities": "活动管理", "site-info": "站点信息", conversion: "转化分析", tickets: "工单" };

function ResellerSectionGate() {
    const { section } = useParams<{ section: string }>();
    const title = TITLES[section ?? ""] ?? "代理商中心";
    const navigate = useNavigate();
    const isReseller = useIsReseller();
    const logged = hasSession();
    useEffect(() => { if (logged && isReseller) navigate("/reseller/overview", { replace: true }); }, [logged, isReseller, navigate]);
    return (
        <ResellerShell>
            {logged && !isReseller ? (
                <section className="pane mx-auto max-w-4xl px-8 py-12 text-center">
                    <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-[#fff8e6] text-warning"><Sparkles size={36} /></span>
                    <h2 className="mt-6 text-4xl font-bold">成为代理商</h2>
                    <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-muted-foreground">您当前还不是代理商。「{title}」需申请并获平台批准后使用。可管理归属客户、收益和收款资料；整站品牌由平台管理员统一设置。</p>
                    <div className="mx-auto mt-8 max-w-xl space-y-3 text-left">
                        {["按平台规则查看客户分润", "仅查看归属自己的客户和收益", "管理卡密与收款资料"].map((t) => <div key={t} className="flex items-center gap-3 rounded-2xl border px-5 py-4 text-[15px]"><ShieldCheck size={18} className="text-success" />{t}</div>)}
                    </div>
                    <div className="mx-auto mt-8 grid max-w-3xl gap-4 text-left md:grid-cols-2">
                        {[[Globe2, "客户管理", "通过邀请建立客户归属，只查看自己权限范围内的客户。"], [Building2, "收益管理", "按平台已批准的规则管理收益；不代表开通独立品牌分站。"]].map(([I, t, d]) => { const Icon = I as typeof Globe2; return (
                            <div key={String(t)} className="rounded-2xl border p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff8e6] text-warning"><Icon size={20} /></span><span className="text-lg font-semibold">{String(t)}</span></div><p className="mt-3 text-sm leading-7 text-muted-foreground">{String(d)}</p><Link href="/reseller/recruit" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">查看付费方案 <ArrowRight size={14} /></Link></div>
                        ); })}
                    </div>
                    <Link href="/reseller/recruit" className="mt-10 inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-8 text-[15px] font-medium text-white shadow-pop hover:bg-primary-strong">立即申请</Link>
                </section>
            ) : <div className="h-[60vh] rounded-shell shimmer" />}
        </ResellerShell>
    );
}

/* ------------------------------------------------------------------ */
/* 各页面（薄壳内联，顺序与造物 app/reseller 目录一致）                   */
/* ------------------------------------------------------------------ */

const OverviewPage = () => { const ok = useIsReseller(); return <ResellerShell>{ok ? <OverviewConsole /> : <ResellerGate title="代理商中心" />}</ResellerShell>; };
const CustomersPage = () => { const ok = useIsReseller(); return <ResellerShell>{ok ? <CustomersView /> : <ResellerGate title="我的客户" />}</ResellerShell>; };
const FinancePage = () => { const ok = useIsReseller(); return <ResellerShell>{ok ? <FinanceView /> : <ResellerGate title="财务管理" />}</ResellerShell>; };
const MessagesPage = () => { const ok = useIsReseller(); return <ResellerShell>{ok ? <MessagesView /> : <ResellerGate title="我的留言" />}</ResellerShell>; };
const AnnouncementsPage = () => { const ok = useIsReseller(); return <ResellerShell>{ok ? <AnnouncementsView /> : <ResellerGate title="官方公告" />}</ResellerShell>; };
const SettingsPage = () => { const ok = useIsReseller(); return <ResellerShell>{ok ? <SettingsView /> : <ResellerGate title="设置" />}</ResellerShell>; };
const CustomerServicePage = () => <ResellerShell><AdminOnly title="客户服务"><CustomerServiceCenter /></AdminOnly></ResellerShell>;

const ModelsPage = () => {
    if (useResellerScope() === "agent") return <ResellerShell><AgentMarkup /></ResellerShell>;
    return <ResellerShell><AdminOnly title="模型管理"><ModelsCenter /></AdminOnly></ResellerShell>;
};

const ModerationPage = () => {
    const scope = useResellerScope();
    return (
        <ResellerShell>
            {scope === "platform" ? (
                <div className="flex min-h-full flex-col gap-3">
                    <SectionHero badge="内容审核" icon={<ShieldCheck />} title="内容审核" subtitle="用户发布的 Skill 与灵感广场作品，通过后才对所有人可见" />
                    <SkillReview />
                    <WorkReview />
                </div>
            ) : <ResellerGate title="内容审核" />}
        </ResellerShell>
    );
};

const RecruitPage = () => { const ok = useIsReseller(); return <ResellerShell>{ok ? <AdminRecruitView /> : <UserRecruitView />}</ResellerShell>; };
const PartnerPage = () => { const ok = useIsReseller(); if (!ok) return <ResellerShell><UserRecruitView /></ResellerShell>; return <LegacyPage title="招商合作" bare gap="space-y-4"><PartnerView /></LegacyPage>; };
const InvitePage = () => <ResellerShell><AgentInvite /></ResellerShell>;

const TeamPage = () => {
    const { data } = useQuery({ queryKey: ["reseller", "agents"], queryFn: () => api<{ agents: { status: string; customers: number }[] }>("/api/reseller/agents"), retry: false });
    const list = data?.agents ?? [];
    const nums = [list.filter((a) => a.status === "approved" || a.status === "frozen").length, list.filter((a) => a.status === "approved").length, list.reduce((s, a) => s + a.customers, 0)];
    const stats = [[Network, "代理"], [UserCheck, "正常"], [Users, "其客户合计"]] as const;
    const TeamView = (
        <div className="flex min-h-full flex-col gap-3">
            <SectionHero badge="代理网络" icon={<Network />} title="下级代理" subtitle="审核代理申请、冻结违规代理、登记提现打款" />
            <div className="flex flex-1 flex-col gap-3 pb-24">
                <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border/45 bg-muted/40 px-5 py-3">
                    {stats.map(([I, k], i) => <span key={k} className="inline-flex items-center gap-1.5 text-xs"><I size={14} className="text-primary" /><span className="font-semibold text-muted-foreground">{k}</span><span className="font-mono font-black tabular-nums text-foreground">{nums[i]}</span></span>)}
                </section>
                <AgentsPanel />
            </div>
        </div>
    );
    const ok = useIsReseller();
    return <ResellerShell>{ok ? TeamView : <ResellerGate title="下级代理" />}</ResellerShell>;
};

const SiteInfoPage = () => <ResellerShell><AdminOnly title="站点设置"><SiteInfo /></AdminOnly></ResellerShell>;

// ---- 平台运营（XOi 补位：后端 /api/admin/* 一直没有 UI）----
// 视图自带 SectionHero，这里只包 ResellerShell + AdminOnly；代理进不来（AGENT_PATHS 不含这些路径）
const AdminTasksPage = () => <ResellerShell><AdminOnly title="任务监控"><AdminTasksView /></AdminOnly></ResellerShell>;
const AdminUsersPage = () => <ResellerShell><AdminOnly title="用户管理"><AdminUsersView /></AdminOnly></ResellerShell>;
const AdminStatsPage = () => <ResellerShell><AdminOnly title="收益总览"><DailyStatsView /></AdminOnly></ResellerShell>;
const AdminSecurityPage = () => <ResellerShell><AdminOnly title="安全检测"><SecurityView /></AdminOnly></ResellerShell>;
const AdminReleasesPage=()=> <ResellerShell><ReleasesView/></ResellerShell>;
const TeamWorkspacePage=()=> <ResellerShell><TeamWorkspaceContent embedded/></ResellerShell>;
const AdminTopupsPage = () => <ResellerShell><AdminOnly title="充值记录"><AdminTopupsView /></AdminOnly></ResellerShell>;
const AdminRedemptionsPage = () => <ResellerShell><AdminOnly title="兑换码"><AdminRedemptionsView /></AdminOnly></ResellerShell>;
const AdminPolicyPage = () => <ResellerShell><AdminOnly title="运营设置"><AdminPolicyView /></AdminOnly></ResellerShell>;
const AdminCreditsPage = () => <ResellerShell><AdminOnly title="额度发放"><AdminCreditsView /></AdminOnly></ResellerShell>;
const LoginPageThemePage = () => (
    <ResellerShell>
        <AdminOnly title="登录页管理">
            <div className="flex min-h-full flex-col gap-3">
                <SectionHero badge="登录页" icon={<Clapperboard size={14} />} title="登录页管理" subtitle="选择用于你的白标登录页的背景视频" />
                <LoginVideoPanel />
            </div>
        </AdminOnly>
    </ResellerShell>
);

// ---- 旧版菜单页面（LegacyPage 薄壳）----
const IncomePage = () => <LegacyPage head="lg" icon={<TrendingUp />} title="收益记录" subtitle="客户与下级代理充值带来的收益，充值成功自动结算。" right={<WithdrawButton />}><IncomeView /></LegacyPage>;
const WithdrawalsPage = () => <LegacyPage head="lg" icon={<ArrowDownToLine />} title="提现记录" subtitle="提现申请与到账进度，预计 1 小时内到账、0 手续费。"><WithdrawalsView /></LegacyPage>;
const CashflowPage = () => <LegacyPage head="lg" icon={<ArrowLeftRight />} title="资金流水" subtitle="分润进账与提现出账的资金变动全景。"><CashflowView /></LegacyPage>;
const InvoicesPage = () => <LegacyPage head="lg" icon={<FileText />} title="发票记录" subtitle="用户的开票申请与发票文件，以及已提交的开票申请与开具进度。"><InvoiceRequestsPanel /><InvoicesView /></LegacyPage>;
const CustomerListPage = () => <LegacyPage title="客户列表" bare gap="space-y-4"><LegacyCustomerList /></LegacyPage>;
const ConversionPage = () => <LegacyPage head="banner" title="转化分析" subtitle="邀请点击为链接流量(仅统计经邀请链接的访问); 转化漏斗按客户注册→付费统计。"><ConversionView /></LegacyPage>;
const TiersPage = () => <LegacyPage head="banner" title="客户分层" subtitle="按消费额把客户分档, 帮你识别高价值客户与运营重点。"><TiersView /></LegacyPage>;
const ChannelTeamPage = () => <LegacyPage title="下级代理" bare><ChannelTeamView /></LegacyPage>;
const CardKeysPage = () => <LegacyPage icon={<Ticket />} title="卡密管理" subtitle="批量生成卡密分发给客户；平台发码不扣钱包，代理发码面值从代理钱包扣除"><CardKeysView /></LegacyPage>;
const ChannelPricingPage = () => <LegacyPage icon={<Percent />} title="定价设置" subtitle="设置对用户与对下级的加价率，查看拿货折扣与每模型利润"><ModelsCenter only="pricing" /></LegacyPage>;
const WechatPage = () => <LegacyPage title="客服微信" bare><CustomerServiceCenter fixedTab="wechat" /></LegacyPage>;
const GroupsPage = () => <LegacyPage title="交流群" bare><CustomerServiceCenter fixedTab="groups" /></LegacyPage>;
const TicketsPage = () => <LegacyPage head="plain" title="工单" subtitle="工单走平台统一客服系统，下面是高频问题快捷入口。"><CustomerServiceCenter fixedTab="tickets" /></LegacyPage>;
const SiteMessagesPage = () => <LegacyPage head="plain" title="我的留言" subtitle="平台管理员发给你的私密留言。"><SiteMessagesView /></LegacyPage>;
const ActivitiesPage = () => <LegacyPage title="活动管理" bare><ActivitiesView /></LegacyPage>;
const AuditLogPage = () => <LegacyPage icon={<ScrollText />} title="操作日志" subtitle="查看你与平台超管在你账户上的操作流水（提现、白标、代客登录等），透明可追溯。" gap="space-y-6"><AuditLogView /></LegacyPage>;

const PushPage = () => <LegacyPage icon={<Bell />} narrow title="推送设置" subtitle="配置运营通知邮箱，以及注册、分佣事件的推送开关。"><AccountSettings only="push" /></LegacyPage>;
const BecomeResellerPage = () => <LegacyPage icon={<UserPlus />} narrow title="成为代理入口" subtitle="控制顶栏「成为代理」入口的显隐；关闭后普通访客/用户不再看到该按钮，已经是代理的用户不受影响。"><AccountSettings only="become" /></LegacyPage>;
const InviteCodePage = () => <LegacyPage icon={<QrCode />} narrow title="注册页邀请码" subtitle="控制白标注册页「邀请码手填框」的显隐；关闭仅隐藏手填框，自动归因照常保留。"><AccountSettings only="signup" /></LegacyPage>;
const TopupTiersPage = () => <LegacyPage icon={<CircleDollarSign />} narrow title="充值档次" subtitle="自定义白标用户的充值档位与最低额；平台护栏由后端强校验。"><AccountSettings only="topup" /></LegacyPage>;
const UserInvitePage = () => <LegacyPage icon={<UserPlus />} narrow title="用户邀请" subtitle="开启后，站点每个用户自动获得推广码，从直邀新用户的充值中赚分佣（从你的 margin 切，平台费率不变）。"><AccountSettings only="invite" /></LegacyPage>;

function PayoutProfileBody() { const f = useFinance(); return f.isLoading ? <div className="h-72 rounded-2xl shimmer" /> : <><ErrorBanner error={f.error} /><ProfileTab d={f.data} variant="legacy" /></>; }
const PayoutProfilePage = () => <LegacyPage icon={<Building2 />} narrow title="提现资料" subtitle="对公开票资质信息（公司名称、开户行、银行账号、税号、发票文件），提现开票时使用。"><PayoutProfileBody /></LegacyPage>;

function WithdrawalBody() {
    const f = useFinance(); if (f.isLoading) return <div className="h-72 rounded-2xl shimmer" />;
    const acc = f.data?.accounts ?? []; const def = acc[0];
    return (
        <>
            <ErrorBanner error={f.error} />
            <CurrentPanel items={[["已绑定", `${acc.length} 个账号`], ["默认账号", def ? `${ACCOUNT_TYPES[def.type] ?? def.type}${def.note ? ` · ${def.note}` : ""}` : "暂无"]]} />
            <AccountsTab d={f.data} variant="legacy" />
        </>
    );
}
const WithdrawalSettingsPage = () => <LegacyPage icon={<CreditCard />} narrow title="提现设置" subtitle="绑定收款账号（收款码 + 备注），提现时下拉选择免重输，财务扫码打款。"><WithdrawalBody /></LegacyPage>;

/* ------------------------------------------------------------------ */
/* 成为代理申请页（对应造物 app/agent-apply；后端 /api/agent/apply 已就绪）  */
/* ------------------------------------------------------------------ */

interface AgentApplyStatus { admin: boolean; status: "pending" | "approved" | "rejected" | "frozen" | null; apply: { name?: string; contact?: string; reason?: string } | null; reviewNote: string | null; inviteCode: string | null }
const input = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring/30";

export function AgentApplyPage() {
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ["agent-apply"], queryFn: () => api<AgentApplyStatus>("/api/agent/apply"), enabled: hasSession(), retry: false });
    const [name, setName] = useState(""); const [contact, setContact] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (!name.trim() || !contact.trim()) { toast.error("请填写称呼和联系方式"); return; }
        setBusy(true);
        try { await api("/api/agent/apply", { method: "POST", body: JSON.stringify({ name, contact, reason }) }); toast.success("申请已提交，站长审核后会开通"); qc.invalidateQueries({ queryKey: ["agent-apply"] }); }
        catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    };
    const s = q.data;
    // 代理体系已下线（2026-10-24）：申请入口关闭，页面保留作未来扩展点。
    // 普通用户看到的不再是申请表单，而是明确的「暂未开放」说明；后台 mc_agents 审核链路原样保留。
    const canApply = false;
    return (
        // XOi: 造物这里用 AppShell（整站工作台外壳）。XOi 的代理申请只在这一页
        // （后端 /api/agent/apply 已就绪），用轻容器承载即可，不必为一个单页搬整套工作台 chrome。
        <div className="min-h-dvh w-full bg-background">
            <div className="mx-auto w-full max-w-2xl px-4 py-8">
                <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Handshake size={24} /></span><div><h1 className="text-xl font-bold">成为代理</h1><p className="text-sm text-muted-foreground">邀请客户来用，客户每笔消费里你加价的部分都归你。</p></div></div>
                <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                    {[["自己定价", "在平台价基础上加价 0–50%，随时可调"], ["专属邀请", "邀请链接注册、兑换你的卡密的用户都是你的客户"], ["收益可提现", "按每笔消费实时累计，满 ¥10 可申请提现"]].map(([t, d]) => <li key={t} className="rounded-2xl border border-border/60 bg-card p-4"><div className="text-sm font-semibold">{t}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{d}</p></li>)}
                </ul>
                <section className="mt-6 rounded-2xl border border-border/60 bg-card p-5">
                    {!hasSession() ? <p className="text-sm">请先<Link href="/login?next=/agent-apply" className="mx-1 text-primary hover:underline">登录</Link>再申请。</p>
                        : q.isLoading ? <div className="h-32 rounded-xl shimmer" />
                        : q.error ? <p className="text-sm text-danger">申请信息读取失败：{(q.error as Error).message}（如持续失败请联系站长）</p>
                        : s?.admin ? <p className="text-sm">管理员账号可以直接进入<Link href="/reseller/overview" className="mx-1 text-primary hover:underline">代理商中心</Link>。</p>
                        : s?.status === "approved" || s?.status === "frozen" ? <div className="flex items-start gap-2 text-sm"><CheckCircle2 size={18} className="shrink-0 text-success" /><div>你已经是代理了{s.status === "frozen" ? "（当前被冻结，请联系站长）" : ""}。<Link href="/reseller/overview" className="ml-1 text-primary hover:underline">进入代理商中心</Link></div></div>
                        : s?.status === "pending" ? <div className="flex items-start gap-2 text-sm"><Clock size={18} className="shrink-0 text-warning" /><div>申请已提交（{s.apply?.name} · {s.apply?.contact}），请等待站长审核。</div></div>
                        : null}
                    {canApply && (
                        <div className="space-y-3">
                            {s?.status === "rejected" && <div className="flex items-start gap-2 rounded-xl bg-danger/5 px-3 py-2 text-sm"><XCircle size={16} className="mt-0.5 shrink-0 text-danger" />上次申请未通过{s.reviewNote ? `：${s.reviewNote}` : ""}。可以补充信息后重新申请。</div>}
                            <label className="block text-sm font-medium">称呼<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="你的名字或团队名" className={`${input} mt-1.5`} /></label>
                            <label className="block text-sm font-medium">联系方式<input value={contact} maxLength={80} onChange={(e) => setContact(e.target.value)} placeholder="微信 / 手机 / 邮箱" className={`${input} mt-1.5`} /></label>
                            <label className="block text-sm font-medium">推广渠道（选填）<textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="比如：有自己的社群、工作室、客户资源" className={`${input} mt-1.5 h-auto py-2`} /></label>
                            <Button className="w-full" disabled={busy} onClick={submit}>提交申请</Button>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 汇总导出（main.tsx 挂 <Route path="/reseller/*">）                    */
/* ------------------------------------------------------------------ */

export const adminRoutes = (
    <>
        <Route path="/reseller" element={<Navigate to="/reseller/overview" replace />} />
        <Route path="/reseller/overview" element={<OverviewPage />} />
        <Route path="/reseller/customers" element={<CustomersPage />} />
        <Route path="/reseller/customers/list" element={<CustomerListPage />} />
        <Route path="/reseller/customers/conversion" element={<ConversionPage />} />
        <Route path="/reseller/customers/tiers" element={<TiersPage />} />
        <Route path="/reseller/finance" element={<FinancePage />} />
        <Route path="/reseller/finance/income" element={<IncomePage />} />
        <Route path="/reseller/finance/withdrawals" element={<WithdrawalsPage />} />
        <Route path="/reseller/finance/cashflow" element={<CashflowPage />} />
        <Route path="/reseller/finance/invoices" element={<InvoicesPage />} />
        <Route path="/reseller/models" element={<ModelsPage />} />
        <Route path="/reseller/channel/team" element={<ChannelTeamPage />} />
        <Route path="/reseller/channel/card-keys" element={<CardKeysPage />} />
        <Route path="/reseller/channel/pricing" element={<ChannelPricingPage />} />
        <Route path="/reseller/site" element={<Navigate to="/reseller/site/info" replace />} />
        <Route path="/reseller/site/info" element={<SiteInfoPage />} />
        <Route path="/reseller/site/wechat" element={<WechatPage />} />
        <Route path="/reseller/site/groups" element={<GroupsPage />} />
        <Route path="/reseller/site/tickets" element={<TicketsPage />} />
        <Route path="/reseller/site/messages" element={<SiteMessagesPage />} />
        <Route path="/reseller/site/activities" element={<ActivitiesPage />} />
        <Route path="/reseller/customer-service" element={<CustomerServicePage />} />
        <Route path="/reseller/messages" element={<MessagesPage />} />
        <Route path="/reseller/moderation" element={<ModerationPage />} />
        <Route path="/reseller/announcements" element={<AnnouncementsPage />} />
        <Route path="/reseller/recruit" element={<RecruitPage />} />
        <Route path="/reseller/partner" element={<PartnerPage />} />
        <Route path="/reseller/invite" element={<InvitePage />} />
        <Route path="/reseller/team" element={<TeamPage />} />
        <Route path="/reseller/settings" element={<SettingsPage />} />
        <Route path="/reseller/admin/tasks" element={<AdminTasksPage />} />
        <Route path="/reseller/admin/users" element={<AdminUsersPage />} />
        <Route path="/reseller/admin/stats" element={<AdminStatsPage />} />
        <Route path="/reseller/admin/security" element={<AdminSecurityPage />} />
        <Route path="/reseller/admin/releases" element={<AdminReleasesPage />} />
        <Route path="/reseller/team-space" element={<TeamWorkspacePage />} />
        <Route path="/reseller/admin/topups" element={<AdminTopupsPage />} />
        <Route path="/reseller/admin/redemptions" element={<AdminRedemptionsPage />} />
        <Route path="/reseller/admin/credits" element={<AdminCreditsPage />} />
        <Route path="/reseller/admin/policy" element={<AdminPolicyPage />} />
        <Route path="/reseller/theme/login-page" element={<Navigate to="/reseller/site/info" replace />} />
        <Route path="/reseller/account/push" element={<PushPage />} />
        <Route path="/reseller/account/withdrawal" element={<WithdrawalSettingsPage />} />
        <Route path="/reseller/account/payout-profile" element={<PayoutProfilePage />} />
        <Route path="/reseller/account/topup-tiers" element={<TopupTiersPage />} />
        <Route path="/reseller/account/user-invite" element={<UserInvitePage />} />
        <Route path="/reseller/account/invite-code" element={<InviteCodePage />} />
        <Route path="/reseller/account/become-reseller" element={<BecomeResellerPage />} />
        <Route path="/reseller/account/audit-log" element={<AuditLogPage />} />
        <Route path="/reseller/branding" element={<Navigate to="/reseller/site/info" replace />} />
        {/* 造物的 [section] 动态段：未匹配的分区 → 成为代理商引导 / 回概览 */}
        <Route path="/reseller/:section" element={<ResellerSectionGate />} />
        <Route path="/reseller/*" element={<Navigate to="/reseller/overview" replace />} />
        <Route path="/agent-apply" element={<AgentApplyPage />} />
    </>
);
