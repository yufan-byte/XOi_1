/**
 * 代理商中心菜单（唯一数据源）
 * =====================================================================
 * 这份菜单有两个消费者：
 *   · components/reseller/shell.tsx              侧栏渲染
 *   · components/shell/dialogs/command-palette.tsx  ⌘K 面板
 *
 * 为什么单独成一个模块：让面板去 import shell.tsx 会成环
 * （shell → shell/topbar → shell/dialogs/command-palette → shell）。
 * 数据抽到中间层，两边都只往下依赖。
 *
 * ⚠️ 改菜单只改这个文件，侧栏与 ⌘K 会自动同步。
 * 之前面板里全是死链，就是因为它自己硬编码了一份**造物产品页**清单
 * （/agents/*、/chat、/square、/dashboard、/skills、/vibeapp、/guide），
 * 这些页面在 console 里一个都不存在，点下去会被路由兜底弹回登录页。
 */
import {
    Activity,
    BarChart3,
    Boxes,
    Handshake,
    Inbox,
    LayoutDashboard,
    Megaphone,
    MessageCircle,
    Network,
    Palette,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    UserCheck,
    UserCog,
    UserRound,
    Users,
    Wallet,
    type LucideIcon,
} from "lucide-react";

export type MenuItem = {
    label: string;
    href?: string;
    icon: LucideIcon;
    children?: { label: string; href: string }[];
};

/** 新版菜单 v2：与参考站代理商中心侧栏一致（末尾的「平台运营」是 XOi 补位，见下方注释） */
export const NEW_MENU: MenuItem[] = [
    { label: "白标配置", href: "/reseller/branding", icon: Palette },
    { label: "模型管理", href: "/reseller/models", icon: SlidersHorizontal },
    { label: "我的客户", href: "/reseller/customers", icon: UserCheck },
    { label: "下级代理", href: "/reseller/team", icon: Network },
    { label: "财务管理", href: "/reseller/finance", icon: Wallet },
    { label: "客户服务", href: "/reseller/customer-service", icon: MessageCircle },
    { label: "我的留言", href: "/reseller/messages", icon: Inbox },
    { label: "内容审核", href: "/reseller/moderation", icon: ShieldCheck },
    { label: "官方公告", href: "/reseller/announcements", icon: Megaphone },
    { label: "招商合作", href: "/reseller/recruit", icon: UserRound },
    { label: "设置", href: "/reseller/settings", icon: Settings2 },
    { label: "主题管理", icon: Palette, children: [{ label: "登录页管理", href: "/reseller/theme/login-page" }] },
    /**
     * 平台运营（XOi 补位）：造物把平台级运营放在独立 admin 应用（/adminCenter 等），
     * XOi 方案 A 砍掉了那套应用，后端 /api/admin/* 却一直在（订单/任务/计费/设置），
     * 于是这里补一个菜单组把接口接上。只在 scope=platform 时可见（本菜单的消费者已按 scope 过滤），
     * 代理的 AGENT_PATHS 白名单不含这些路径，会被 AdminGate 弹回概览。
     */
    {
        label: "平台运营", icon: Activity,
        children: [
            { label: "任务监控", href: "/reseller/admin/tasks" },
            { label: "充值记录", href: "/reseller/admin/topups" },
            { label: "额度发放", href: "/reseller/admin/credits" },
            { label: "兑换码", href: "/reseller/admin/redemptions" },
            { label: "运营设置", href: "/reseller/admin/policy" },
        ],
    },
];

/** 旧版菜单（临时）：分组式 —— 与参考站点「旧版菜单」逐项一致 */
export const OLD_MENU: MenuItem[] = [
    { label: "概览", href: "/reseller/overview", icon: LayoutDashboard },
    { label: "财务管理", icon: Wallet, children: [{ label: "收益记录", href: "/reseller/finance/income" }, { label: "提现记录", href: "/reseller/finance/withdrawals" }, { label: "资金流水", href: "/reseller/finance/cashflow" }, { label: "发票记录", href: "/reseller/finance/invoices" }] },
    { label: "客户管理", icon: Users, children: [{ label: "客户列表", href: "/reseller/customers/list" }, { label: "转化分析", href: "/reseller/customers/conversion" }, { label: "客户分层", href: "/reseller/customers/tiers" }] },
    { label: "渠道管理", icon: Boxes, children: [{ label: "下级代理", href: "/reseller/channel/team" }, { label: "卡密管理", href: "/reseller/channel/card-keys" }, { label: "定价设置", href: "/reseller/channel/pricing" }] },
    { label: "站内运营", icon: BarChart3, children: [{ label: "站点信息", href: "/reseller/site/info" }, { label: "客服微信", href: "/reseller/site/wechat" }, { label: "交流群", href: "/reseller/site/groups" }, { label: "工单", href: "/reseller/site/tickets" }, { label: "我的留言", href: "/reseller/site/messages" }, { label: "活动管理", href: "/reseller/site/activities" }] },
    { label: "招商合作", href: "/reseller/partner", icon: Handshake },
    { label: "平台运营", icon: Activity, children: [{ label: "任务监控", href: "/reseller/admin/tasks" }, { label: "充值记录", href: "/reseller/admin/topups" }, { label: "额度发放", href: "/reseller/admin/credits" }, { label: "兑换码", href: "/reseller/admin/redemptions" }, { label: "运营设置", href: "/reseller/admin/policy" }] },
    { label: "账号管理", icon: UserCog, children: [{ label: "推送设置", href: "/reseller/account/push" }, { label: "提现设置", href: "/reseller/account/withdrawal" }, { label: "提现资料", href: "/reseller/account/payout-profile" }, { label: "充值档次", href: "/reseller/account/topup-tiers" }, { label: "用户邀请", href: "/reseller/account/user-invite" }, { label: "注册页邀请码", href: "/reseller/account/invite-code" }, { label: "成为代理入口", href: "/reseller/account/become-reseller" }, { label: "操作日志", href: "/reseller/account/audit-log" }] },
];

/** 代理（非站长）的菜单：只有和自己生意相关的几项；白标、主题、客服、公告等是整站配置，只有站长能改 */
export const AGENT_MENU: MenuItem[] = [
    { label: "概览", href: "/reseller/overview", icon: LayoutDashboard },
    { label: "我的客户", href: "/reseller/customers", icon: UserCheck },
    { label: "加价设置", href: "/reseller/models", icon: SlidersHorizontal },
    { label: "财务管理", href: "/reseller/finance", icon: Wallet },
    { label: "邀请客户", href: "/reseller/invite", icon: UserRound },
    { label: "操作日志", href: "/reseller/account/audit-log", icon: UserCog },
];

export type FlatNav = { label: string; href: string; group: string };

/**
 * 拍平成一维可跳转清单（⌘K 面板用）。
 * 按 href 去重（新版/旧版/代理菜单里有大量重复项），子项归属到父级名下当分组。
 */
export function flatMenu(): FlatNav[] {
    const out: FlatNav[] = [];
    const seen = new Set<string>();
    const push = (label: string, href: string, group: string) => {
        if (seen.has(href)) return;
        seen.add(href);
        out.push({ label, href, group });
    };
    for (const m of [...NEW_MENU, ...OLD_MENU, ...AGENT_MENU]) {
        if (m.href) push(m.label, m.href, "后台");
        for (const c of m.children ?? []) push(c.label, c.href, m.label);
    }
    push("成为代理申请", "/agent-apply", "账号");
    return out;
}
