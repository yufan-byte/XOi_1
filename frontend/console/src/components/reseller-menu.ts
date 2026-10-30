/**
 * 管理控制台菜单（唯一数据源）
 * =====================================================================
 * 2026-10-24 决策：砍掉代理/分站/招商的产品化入口，管理员后台聚焦四核心 ——
 * 用户管理、订单、每日收益消耗、卡密分发（含在线充值）。被撤下菜单的页面
 * （/reseller/overview、customers、finance、recruit、invite、team、models 等）
 * **路由与后端全部保留**，作为未来「培训客户/机构」体系重启时的扩展点；
 * 剩余低频工具收进「更多功能」组，不删入口。
 *
 * 这份菜单有两个消费者：
 *   · components/reseller/shell.tsx              侧栏渲染
 *   · components/shell/dialogs/command-palette.tsx  ⌘K 面板
 * 为什么单独成一个模块：让面板去 import shell.tsx 会成环
 * （shell → shell/topbar → shell/dialogs/command-palette → shell）。
 *
 * ⚠️ 改菜单只改这个文件，侧栏与 ⌘K 会自动同步。
 */
import {
    Activity,
    BellRing,
    Boxes,
    CircleDollarSign,
    HandCoins,
    Megaphone,
    ReceiptText,
    Rocket,
    ShieldCheck,
    SlidersHorizontal,
    Ticket,
    TrendingUp,
    Users,
    UsersRound,
    type LucideIcon,
} from "lucide-react";

export type MenuItem = {
    rootOnly?: boolean;
    label: string;
    href?: string;
    icon: LucideIcon;
    children?: { label: string; href: string }[];
    /** 仅 XOi 管理员可见（如团队管理：涉及批量下发密码，普通用户一律隐藏） */
    adminOnly?: boolean;
};

/** 平台管理菜单（scope=platform）：四核心优先，低频工具收进「更多功能」 */
export const NEW_MENU: MenuItem[] = [
    { label: "收益总览", href: "/reseller/admin/stats", icon: TrendingUp },
    { label: "用户管理", href: "/reseller/admin/users", icon: Users },
    { label: "团队管理", href: "/reseller/team-space", icon: UsersRound, adminOnly: true },
    { label: "订单", href: "/reseller/admin/topups", icon: CircleDollarSign },
    { label: "卡密分发", href: "/reseller/channel/card-keys", icon: Ticket },
    { label: "兑换码记录", href: "/reseller/admin/redemptions", icon: ReceiptText },
    { label: "额度发放", href: "/reseller/admin/credits", icon: HandCoins },
    { label: "任务监控", href: "/reseller/admin/tasks", icon: Activity },
    { label: "安全检测", href: "/reseller/admin/security", icon: BellRing },
    { label: "官方公告", href: "/reseller/announcements", icon: Megaphone },
    { label: "内容审核", href: "/reseller/moderation", icon: ShieldCheck },
    { label: "运营设置", href: "/reseller/admin/policy", icon: SlidersHorizontal },
    { label: "发布中心", href: "/reseller/admin/releases", icon: Rocket, rootOnly: true },
    {
        label: "更多功能", icon: Boxes,
        children: [
            { label: "模型管理", href: "/reseller/models" },
            { label: "站点设置", href: "/reseller/site/info" },
            { label: "客户服务", href: "/reseller/customer-service" },
        ],
    },
];

/** 代理（非站长）的菜单：代理体系已从产品里下线（不再开放申请），页面与菜单保留作扩展点 */
export const AGENT_MENU: MenuItem[] = [
    { label: "概览", href: "/reseller/overview", icon: TrendingUp },
    { label: "我的客户", href: "/reseller/customers", icon: Users },
    { label: "加价设置", href: "/reseller/models", icon: SlidersHorizontal },
    { label: "财务管理", href: "/reseller/finance", icon: HandCoins },
    { label: "邀请客户", href: "/reseller/invite", icon: Users },
    { label: "操作日志", href: "/reseller/account/audit-log", icon: Activity },
];

export type FlatNav = { label: string; href: string; group: string };

/**
 * 拍平成一维可跳转清单（⌘K 面板用）。
 * 按 href 去重，子项归属到父级名下当分组。
 */
export function flatMenu(access?:{scope:"platform"|"agent"|null;root?:boolean}): FlatNav[] {
    const out: FlatNav[] = [];
    const seen = new Set<string>();
    const push = (label: string, href: string, group: string) => {
        if (seen.has(href)) return;
        seen.add(href);
        out.push({ label, href, group });
    };
    const menus=access?(access.scope==="platform"?NEW_MENU:access.scope==="agent"?AGENT_MENU:[]):[...NEW_MENU,...AGENT_MENU];
    for (const m of menus.filter(m=>!m.rootOnly||access?.root===true)) {
        if (m.href) push(m.label, m.href, "后台");
        for (const c of m.children ?? []) push(c.label, c.href, m.label);
    }
    return out;
}
