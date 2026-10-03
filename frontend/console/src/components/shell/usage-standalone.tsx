"use client";

/**
 * 独立算力明细落点（/console/usage）。
 *
 * Vue 主站通过同源透明 iframe 复用造物的 UsageDialog。账单只读 NewAPI
 * 的用户余额与 logs，不在主站维护第二份消费流水。
 */
import { useEffect } from "react";
import { UsageDialog } from "./dialogs/usage-dialog";
import { hasSession } from "@/lib/api";

const APP_HOME = import.meta.env.VITE_APP_HOME || "/";
const CLOSE_MSG = "xoi:usage:close";

function applyQueryTheme() {
  try {
    const theme = new URLSearchParams(window.location.search).get("theme");
    if (theme === "light" || theme === "dark") {
      localStorage.setItem("theme", theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  } catch {
    /* 忽略受限存储环境 */
  }
}

export function UsageStandalone() {
  const logged = hasSession();
  const embed = new URLSearchParams(window.location.search).get("embed") === "1";

  useEffect(() => {
    applyQueryTheme();
    if (!logged) window.location.replace(`/login?next=${encodeURIComponent("/usage")}`);
  }, [logged]);

  if (!logged) return <div className="grid h-dvh w-full place-items-center bg-background text-sm text-muted-foreground">正在前往登录…</div>;

  const close = () => {
    if (embed && window.parent !== window) window.parent.postMessage({ type: CLOSE_MSG }, "*");
    else window.location.replace(APP_HOME);
  };

  return (
    <div className={embed ? "grid min-h-dvh w-full place-items-center bg-transparent" : "grid min-h-dvh w-full place-items-center bg-background"}>
      {!embed && <div className="text-center text-sm text-muted-foreground">XOi · 算力与消费明细</div>}
      <UsageDialog open overlayClassName={embed ? "bg-transparent backdrop-blur-0" : undefined} contentClassName={embed ? "bg-transparent p-0 shadow-none dark:bg-transparent" : undefined} onOpenChange={(open) => { if (!open) close(); }} />
    </div>
  );
}
