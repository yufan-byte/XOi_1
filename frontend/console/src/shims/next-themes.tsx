"use client";
/**
 * next-themes 的最小 shim（Vite 子应用用，避免为了主题切换引入整个包）。
 * 造物的后台是固定的暗色主题；这里恒返回 dark，setTheme 只更新 localStorage。
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(() => {
        try { return (localStorage.getItem("theme") as Theme) || "dark"; } catch { return "dark"; }
    });
    useEffect(() => {
        const resolved = theme === "system" ? "dark" : theme;
        document.documentElement.classList.toggle("dark", resolved === "dark");
        try { localStorage.setItem("theme", theme); } catch { /* 忽略 */ }
    }, [theme]);
    const setTheme = useCallback((t: Theme) => setThemeState(t), []);
    return { theme, setTheme, resolvedTheme: theme === "system" ? "dark" : theme };
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
