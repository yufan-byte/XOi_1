"use client";
import { useEffect } from "react";

/* 参考站 ViewportFitZoom：精确指针 + 宽 ≥1024 时，按 innerHeight/840 缩放整页（下限 0.8），
   同步 --app-zoom 供 h-dvh / popper 等抵消。仅 /dashboard、/team、代理商中心挂载，卸载即还原。 */
export function ViewportFitZoom() {
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => { root.style.removeProperty("zoom"); root.style.removeProperty("--app-zoom"); };
    const apply = () => {
      if (!window.matchMedia("(pointer: fine)").matches || window.innerWidth < 1024) return clear();
      const z = Math.min(1, window.innerHeight / 840);
      if (z < 1) { const v = String(Math.max(0.8, z)); root.style.zoom = v; root.style.setProperty("--app-zoom", v); }
      else clear();
    };
    apply();
    window.addEventListener("resize", apply);
    return () => { window.removeEventListener("resize", apply); clear(); };
  }, []);
  return null;
}
