import { lazy, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

const AppTopNav = lazy(() => import("@/components/layout/app-top-nav").then((module) => ({ default: module.AppTopNav })));

export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    // Canvas routes have no top bar; do not load its account dialogs and media tools.
    const showTopNav = !/^\/canvas(?:\/|$)/.test(pathname);
    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {showTopNav ? <Suspense fallback={null}><AppTopNav /></Suspense> : null}
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
        </div>
    );
}
