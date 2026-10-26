import { Suspense, useLayoutEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { consoleSurface } from "@/lib/console-appearance";

/** Document-wide appearance only; each route keeps its own authentication/permission gate. */
export function ManagementAppearance() {
  const location = useLocation();
  const { resolvedTheme } = useTheme();
  useLayoutEffect(() => {
    const surface = consoleSurface(location.pathname, location.search, "/");
    const root = document.documentElement;
    root.classList.toggle("xoi-management", !surface.authentication);
    root.classList.toggle("xoi-embed", surface.embedded);
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.dataset.xoiSurface = surface.authentication ? "auth" : "workspace";
    // Do not clear on unmount: an error boundary must retain the last readable palette.
    // Normal route changes (including login/signup) apply their own policy above.
  }, [location.pathname, location.search, resolvedTheme]);
  return <Suspense fallback={<div role="status" className="xoi-console-loading grid min-h-dvh place-items-center px-6 text-center text-sm">正在打开工作区…</div>}><Outlet /></Suspense>;
}
