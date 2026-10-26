"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Avatar, Dropdown, Modal, Tooltip } from "antd";
import { Keyboard, LogOut, ReceiptText, Settings2 } from "lucide-react";
import type { ItemType } from "antd/es/menu/interface";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { CreditSymbol } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { yuanToSignedPoints } from "../../../../../src/utils/points";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    onOpenCanvasModels?: () => void;
    accountOpen?: boolean;
    onAccountOpenChange?: (open: boolean) => void;
    accountRef?: RefObject<HTMLDivElement | null>;
    getPopupContainer?: (node: HTMLElement) => HTMLElement;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, onOpenCanvasModels, accountOpen, onAccountOpenChange, accountRef, getPopupContainer }: UserStatusActionsProps) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const logout = useUserStore((state) => state.clearSession);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const userName = user?.displayName || user?.username || "";
    // /auth/me 的 credits 是人民币余额，展示沿用全站 1 元 = 10 积分口径。
    const balanceLabel = typeof user?.credits === "number" && Number.isFinite(user.credits) ? `${Math.floor(yuanToSignedPoints(user.credits)).toLocaleString("zh-CN")} 积分` : "余额待刷新";
    const avatarUrl = user?.avatarUrl?.trim();
    const avatarText = (userName.trim()[0] || "U").toUpperCase();
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const avatarStyle: CSSProperties | undefined = variant === "canvas" ? { borderColor: canvasTheme.toolbar.border, color: canvasTheme.node.text, background: "transparent" } : undefined;
    const [usageOpen, setUsageOpen] = useState(false);
    const usageFrame = useRef<HTMLIFrameElement>(null);
    const closeUsage = () => {
        setUsageOpen(false);
        if (!useUserStore.getState().isLoading) void useUserStore.getState().hydrateUser();
    };
    useEffect(() => {
        if (!usageOpen) return;
        const close = (event: MessageEvent) => {
            if (event.origin === location.origin && event.source === usageFrame.current?.contentWindow && event.data?.type === "xoi:usage:close") closeUsage();
        };
        window.addEventListener("message", close);
        return () => window.removeEventListener("message", close);
    }, [usageOpen]);
    const menuItems: ItemType[] = [
        { key: "user", disabled: true, label: <span className="font-medium text-current">{userName}</span> },
        { key: "usage", icon: <ReceiptText className="size-4" />, label: "积分明细", onClick: () => { onAccountOpenChange?.(false); setUsageOpen(true); } },
        ...(onOpenCanvasModels ? [{ key: "canvas-models", icon: <Settings2 className="size-4" />, label: "画布模型", onClick: () => { onAccountOpenChange?.(false); onOpenCanvasModels(); } }] : []),
        ...(onOpenShortcuts ? [{ key: "shortcuts", icon: <Keyboard className="size-4" />, label: "快捷键", onClick: onOpenShortcuts }] : []),
        { type: "divider" },
        { key: "logout", icon: <LogOut className="size-4" />, label: "退出登录", onClick: logout },
    ];

    return (
        <>
        <div className="inline-flex shrink-0 items-center gap-1">
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            {variant === "canvas" ? (
                <Tooltip title="可用积分 · 点击刷新余额" placement="bottom">
                    <button type="button" aria-label="刷新积分余额" onClick={() => { if (!useUserStore.getState().isLoading) void useUserStore.getState().hydrateUser(); }} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium tabular-nums transition hover:bg-black/5 dark:hover:bg-white/5" style={{ color: canvasTheme.node.text }}>
                        <CreditSymbol className="text-sm leading-none" />
                        <span>{balanceLabel}</span>
                    </button>
                </Tooltip>
            ) : null}
            {!user && onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {!user ? (
                <a href="/#/aiAssistant" aria-label="回到创作对话" onClick={(event) => { event.preventDefault(); window.parent.location.href = "/#/aiAssistant"; }} className="px-1.5 text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-stone-950 hover:underline dark:text-stone-300 dark:hover:text-stone-100" style={iconStyle}>
                    回对话
                </a>
            ) : null}
            {user ? (
                <div ref={accountRef}>
                    <Dropdown open={accountOpen} onOpenChange={onAccountOpenChange} trigger={["click"]} placement="bottomRight" getPopupContainer={getPopupContainer} styles={{ root: { minWidth: 150 } }} menu={{ items: menuItems }}>
                        <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-transparent p-0 text-[0] leading-[0] transition" aria-label="账户菜单">
                            <Avatar
                                size={24}
                                src={avatarUrl ? <img src={avatarUrl} alt={userName} referrerPolicy="no-referrer" /> : undefined}
                                alt={userName}
                                className="!flex !items-center !justify-center border border-stone-300 bg-transparent text-[11px] font-semibold text-stone-800 transition hover:border-stone-500 hover:text-stone-950 dark:border-stone-700 dark:text-stone-100 dark:hover:border-stone-400 dark:hover:text-white"
                                style={avatarStyle}
                            >
                                {avatarText}
                            </Avatar>
                        </button>
                    </Dropdown>
                </div>
            ) : null}
        </div>
        <AppConfigModal />
        <Modal open={usageOpen} onCancel={closeUsage} footer={null} closable={false} centered destroyOnHidden width="min(1120px, calc(100vw - 32px))" styles={{ container: { padding: 0, background: "transparent", boxShadow: "none" }, body: { height: "min(86dvh, 900px)" } }}>
            {usageOpen ? <iframe ref={usageFrame} title="积分与消费明细" src={`/console/usage?embed=1&theme=${theme}`} style={{ width: "100%", height: "100%", border: 0, display: "block", background: "transparent" }} /> : null}
        </Modal>
        </>
    );
}
