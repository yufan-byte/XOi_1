"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { trimmingStorage } from "@/lib/persist-storage";
import type { CatalogModel, Modality } from "@/lib/models";
import type { NewApiUser } from "@/lib/api";

export type MainTab = "models" | "agents" | "inspiration" | "skills";

export interface Work {
  id: string; kind: "image" | "video" | "audio" | "chat"; model: string; prompt: string; createdAt: number;
  url?: string; urls?: string[]; status: "pending" | "running" | "done" | "failed"; taskId?: string; meta?: Record<string, unknown>; error?: string; favorite?: boolean;
}

interface AppState {
  user: NewApiUser | null; setUser: (u: NewApiUser | null) => void;
  modality: Modality | "all" | "mine"; setModality: (m: Modality | "all" | "mine") => void;
  vendor: string; setVendor: (v: string) => void;
  search: string; setSearch: (s: string) => void;
  selected: Record<Modality, string | null>; select: (m: CatalogModel) => void;
  pinned: string[]; togglePin: (id: string) => void;
  sidebarOpen: boolean; setSidebarOpen: (v: boolean) => void;
  /** 侧栏面板（大模型 / 智能体）：客户端状态，不持久化，刷新后回到大模型 */
  sidebarPanel: "models" | "agents"; setSidebarPanel: (p: "models" | "agents") => void;
  works: Work[]; addWork: (w: Work) => void; updateWork: (id: string, patch: Partial<Work>) => void; removeWork: (id: string) => void;
  strategy: "stable" | "price" | "speed"; setStrategy: (s: "stable" | "price" | "speed") => void;
  layout: "classic" | "new"; setLayout: (l: "classic" | "new") => void;
  fontScale: "compact" | "normal" | "large" | "xlarge"; setFontScale: (f: "compact" | "normal" | "large" | "xlarge") => void;
  myPersonas: { id: string; name: string; intro: string; system_prompt: string; tags: string[]; avatar: string }[]; setMyPersonas: (p: AppState["myPersonas"]) => void;
  lanes: Record<string, string[]>; setLanes: (model: string, groups: string[]) => void;
}

/** blob: 地址只在生成它的那个页面会话里有效；有任务号的视频改用站内成品地址（lib/media-store.ts） */
export function reviveBlobWork(w: Work): Work {
  if (!w.taskId || !(w.url?.startsWith("blob:") || w.urls?.some((u) => u.startsWith("blob:")))) return w;
  const url = `/api/media/v/${encodeURIComponent(w.taskId)}`;
  return { ...w, url, urls: [url] };
}

export const useApp = create<AppState>()(persist((set) => ({
  user: null, setUser: (user) => set({ user }),
  modality: "all", setModality: (modality) => set({ modality }),
  vendor: "", setVendor: (vendor) => set({ vendor }),
  search: "", setSearch: (search) => set({ search }),
  selected: { chat: null, image: null, video: null, audio: null },
  select: (m) => set((s) => ({ selected: { ...s.selected, [m.category]: m.id } })),
  pinned: [], togglePin: (id) => set((s) => ({ pinned: s.pinned.includes(id) ? s.pinned.filter((x) => x !== id) : [id, ...s.pinned] })),
  sidebarOpen: true, setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  sidebarPanel: "models", setSidebarPanel: (sidebarPanel) => set({ sidebarPanel }),
  works: [], addWork: (w) => set((s) => ({ works: [w, ...s.works].slice(0, 300) })),
  updateWork: (id, patch) => set((s) => ({ works: s.works.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
  removeWork: (id) => set((s) => ({ works: s.works.filter((w) => w.id !== id) })),
  strategy: "stable", setStrategy: (strategy) => set({ strategy }),
  layout: "classic", setLayout: (layout) => set({ layout }),
  fontScale: "compact", setFontScale: (fontScale) => set({ fontScale }),
  myPersonas: [], setMyPersonas: (myPersonas) => set({ myPersonas }),
  lanes: {}, setLanes: (model, groups) => set((s) => ({ lanes: { ...s.lanes, [model]: groups } })),
}), { name: "mc.app", version: 2,
  // 写满时丢掉最旧的一半作品，也不要让 set() 抛出去：抛出去会把「点生成」整条链路打断（见 persist-storage.ts）
  storage: trimmingStorage((dropped) => {
    try { document.dispatchEvent(new CustomEvent("mc:works-trimmed", { detail: dropped })); } catch { /* SSR */ }
  }),
  migrate: (state, v) => {
  let st = state as { works?: Work[] } & Record<string, unknown>;
  if (v < 1) st = { ...st, fontScale: "compact" };
  // v2：视频作品以前存的是 blob: 临时地址，刷新页面就失效（作品库里一片黑）。有任务号的换成站内成品地址
  if (v < 2 && Array.isArray(st.works)) st = { ...st, works: st.works.map(reviveBlobWork) };
  return st as never;
}, partialize: (s) => ({ selected: s.selected, pinned: s.pinned, works: s.works, strategy: s.strategy, sidebarOpen: s.sidebarOpen, layout: s.layout, fontScale: s.fontScale, myPersonas: s.myPersonas, lanes: s.lanes }) }));
