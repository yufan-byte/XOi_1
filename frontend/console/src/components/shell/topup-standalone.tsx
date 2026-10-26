"use client";
/**
 * 独立充值落点页（/console/topup）。
 *
 * 为什么存在：主站（Vue）的「充值」按钮需要一个 console 侧落点，但 console 里唯一
 * 挂了顶栏（TopupDialog 常驻其中）的是代理商中心 /reseller/*，被 AdminGate 保护——
 * 普通用户会被弹到 /agent-apply，充值就断了。本页不走代理鉴权，只要求登录态，
 * 直接常开造物的 TopupDialog（对接 new-api /api/user/pay 与 /api/user/topup）。
 *
 * 两种形态：
 * - 独立页（默认）：进入即弹充值窗，背景放品牌名 + 返回链接；关掉弹窗即回主站。
 * - 嵌入态 ?embed=1：被主站用透明 iframe 内弹（WorkbenchLayout 的充值入口）。
 *   遮罩交给宿主画（overlayClassName 透明化），本页只渲染弹窗本身；
 *   弹窗关闭 postMessage {type:"xoi:topup:close"} 通知宿主收起 iframe。
 *   ?theme=light|dark 只覆盖当前嵌入文档，不改写全局主题偏好。
 */
import { useEffect } from "react";
import { createLoginUrl } from "../../../../../shared/loginNavigation";
import { TopupDialog } from "./dialogs/topup-dialog";
import { hasSession } from "@/lib/api";

const APP_HOME = import.meta.env.VITE_APP_HOME || "/";
const CLOSE_MSG = "xoi:topup:close";

export function TopupStandalone() {
    const logged = hasSession();
    const embed = new URLSearchParams(window.location.search).get("embed") === "1";
    useEffect(() => {
        if (!logged) window.location.replace(createLoginUrl("/console/topup"));
    }, [logged]);
    if (!logged) return <div className="grid h-dvh w-full place-items-center bg-background text-sm text-muted-foreground">正在前往登录…</div>;
    if (embed) {
        return (
            <div className="grid min-h-dvh w-full place-items-center bg-transparent">
                <TopupDialog
                    open
                    transparentShell
                    overlayClassName="bg-transparent backdrop-blur-0"
                    contentClassName="bg-transparent p-0 shadow-none dark:bg-transparent"
                    onOpenChange={(v) => { if (!v && window.parent !== window) window.parent.postMessage({ type: CLOSE_MSG }, "*"); }}
                />
            </div>
        );
    }
    return (
        <div className="grid min-h-dvh w-full place-items-center bg-background">
            {/* 背景放品牌名 + 提示，弹窗关闭即回主站，不留悬空页 */}
            <div className="flex flex-col items-center gap-3 text-center">
                <span className="text-[15px] font-[660] tracking-tight text-foreground">XOi · 积分充值</span>
                <span className="max-w-[320px] text-[12px] leading-[19px] text-muted-foreground">正在打开充值面板…关闭面板后将返回创作平台。</span>
                <a href={APP_HOME} className="text-[12px] font-[560] text-primary underline-offset-4 hover:underline">返回创作平台</a>
            </div>
            <TopupDialog open onOpenChange={(v) => { if (!v) window.location.replace(APP_HOME); }} />
        </div>
    );
}
