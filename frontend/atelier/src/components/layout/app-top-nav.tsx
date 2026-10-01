import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { assetUrl } from "@/lib/asset-url";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [workspaceNavOpen, setWorkspaceNavOpen] = useState(false);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    useEffect(() => {
        const onWorkspaceNavState = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.data?.type !== "xoi:workbench-nav-state") return;
            setWorkspaceNavOpen(event.data.open === true);
        };
        window.addEventListener("message", onWorkspaceNavState);
        return () => window.removeEventListener("message", onWorkspaceNavState);
    }, []);
    const toggleWorkspaceNav = () => {
        if (window.parent !== window) {
            window.parent.postMessage({ type: "xoi:toggle-workbench-nav" }, window.location.origin);
            return;
        }
        setMobileNavOpen(true);
    };
    const openConversation = () => {
        if (window.parent !== window) {
            window.parent.location.hash = "#/aiAssistant";
        } else {
            window.location.hash = "#/aiAssistant";
        }
    };

    return (
        <>
            {!hideHeader ? (
                <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-stone-200 bg-background/90 backdrop-blur-xl dark:border-stone-800">
                    <div className="mx-auto flex h-full w-full items-stretch justify-between gap-5 px-5 sm:px-6">
                        <div className="flex min-w-0 items-center">
                            <button
                                type="button"
                                className="inline-flex h-full shrink-0 items-center gap-3 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-stone-600 dark:text-stone-100 dark:hover:text-stone-300"
                                onClick={toggleWorkspaceNav}
                                aria-label={workspaceNavOpen ? "关闭工作台导航" : "打开工作台导航"}
                                title={workspaceNavOpen ? "关闭工作台导航" : "打开工作台导航"}
                            >
                                <Menu className="size-5 text-stone-600 dark:text-stone-300" />
                                <img src={assetUrl("/xoi-logo.png")} alt="XOi" className="h-6 w-10 shrink-0 object-contain" />
                            </button>

                            <nav className="hide-scrollbar ml-8 hidden h-14 min-w-0 items-center gap-7 overflow-x-auto md:flex">
                                {navigationTools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    const className = cn(
                                        "relative flex h-14 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                                        active
                                            ? "font-medium text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100"
                                            : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100",
                                    );
                                    const content = <><Icon className="size-4" /><span className="truncate">{t(`navigation.${tool.slug}`)}</span></>;
                                    return tool.external ? (
                                        <button key={tool.slug} type="button" className={className} onClick={openConversation}>
                                            {content}
                                        </button>
                                    ) : (
                                        <Link key={tool.slug} to={`/${tool.slug}`} className={className}>
                                            {content}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                            <UserStatusActions />
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
        </>
    );
}
