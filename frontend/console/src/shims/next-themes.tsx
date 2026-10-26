"use client";
/**
 * next-themes 的最小 shim（Vite 子应用用，避免为了主题切换引入整个包）。
 * 管理端默认浅色；保留用户明确选择。所有使用方共享偏好，避免弹窗挂载后覆盖顶栏切换。
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { consoleSurface } from "@/lib/console-appearance";

export type Theme = "dark" | "light" | "system";

const THEME_EVENT = "xoi:theme-change";
let volatileTheme: Theme | undefined;
function readTheme(): Theme {
    if (volatileTheme) return volatileTheme;
    const surface = consoleSurface(window.location.pathname, window.location.search, import.meta.env.BASE_URL);
    // A host-provided frame theme is document-local, never an account/browser preference.
    if (surface.frameTheme) return surface.frameTheme;
    try {
        const saved = localStorage.getItem("theme");
        if (saved === "dark" || saved === "light" || saved === "system") return saved;
    } catch { /* Storage may be unavailable in private contexts. */ }
    return surface.defaultTheme;
}
function subscribeTheme(notify: () => void) {
    const onStorage = (event: StorageEvent) => { if (event.key === "theme" || event.key === null) { volatileTheme = undefined; notify(); } };
    window.addEventListener(THEME_EVENT, notify);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(THEME_EVENT, notify); window.removeEventListener("storage", onStorage); };
}
const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
function subscribeSystem(notify: () => void) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
}

export function useTheme() {
    const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as Theme);
    const prefersDark = useSyncExternalStore(subscribeSystem, systemDark, () => false);
    const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    useEffect(() => {
        document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    }, [resolvedTheme]);
    const setTheme = useCallback((next: Theme) => {
        const surface = consoleSurface(window.location.pathname, window.location.search, import.meta.env.BASE_URL);
        if (surface.embedded) volatileTheme = next;
        else { try { localStorage.setItem("theme", next); volatileTheme = undefined; } catch { volatileTheme = next; } }
        window.dispatchEvent(new Event(THEME_EVENT));
    }, []);
    return { theme, setTheme, resolvedTheme };
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
