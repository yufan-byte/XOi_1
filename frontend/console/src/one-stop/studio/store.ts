// 导演台工作区的全局小状态（对齐造物 store/app.ts 的关键字段）：
// 模态筛选 / 厂商 / 搜索 / 各模态选中模型 / 置顶 / 侧栏开合 / 作品记录。
// 作品即「任务记录」的数据源，与造物一致落在本机 localStorage。
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CatalogModel } from "@/lib/models";

export type Modality = "chat" | "image" | "video" | "audio";
/** 自建角色（提示词大师「我的」页签；造物 store/app.myPersonas 同款，落本机 localStorage） */
export interface MyPersona { id: string; name: string; intro: string; avatar: string; system_prompt: string; tags?: string[] }
export type WorkKind = "image" | "video" | "audio";
export interface Work {
  id: string; kind: WorkKind; model: string; prompt: string; createdAt: number;
  url?: string; urls?: string[]; status: "pending" | "running" | "done" | "failed"; taskId?: string;
  meta?: Record<string, unknown>; error?: string; favorite?: boolean;
}
/** 每类模态在侧栏点模型后去的工作台路由（视频沿用既有的 /video-studio 路径） */
export const PAGE_OF: Record<Modality, string> = { chat: "/chat", image: "/image", video: "/video-studio", audio: "/audio" };
export const MODALITY_LABEL: Record<Modality | "all" | "mine", string> = { all: "全部", chat: "聊天", image: "图片", video: "视频", audio: "音频", mine: "我的" };

interface StudioState {
  modality: Modality | "all" | "mine"; setModality: (m: Modality | "all" | "mine") => void;
  vendor: string; setVendor: (v: string) => void;
  search: string; setSearch: (s: string) => void;
  selected: Record<Modality, string | null>; select: (m: CatalogModel) => void;
  pinned: string[]; togglePin: (id: string) => void;
  sidebarOpen: boolean; setSidebarOpen: (v: boolean) => void;
  works: Work[]; addWork: (w: Work) => void; updateWork: (id: string, patch: Partial<Work> & { meta?: Record<string, unknown> }) => void; removeWork: (id: string) => void;
  myPersonas: MyPersona[]; setMyPersonas: (p: MyPersona[]) => void;
}

export const useStudio = create<StudioState>()(
  persist(
    (set) => ({
      modality: "all", setModality: (modality) => set({ modality }),
      vendor: "", setVendor: (vendor) => set({ vendor }),
      search: "", setSearch: (search) => set({ search }),
      selected: { chat: null, image: null, video: null, audio: null },
      select: (m) => set((s) => ({ selected: { ...s.selected, [m.category as Modality]: m.id } })),
      pinned: [], togglePin: (id) => set((s) => ({ pinned: s.pinned.includes(id) ? s.pinned.filter((x) => x !== id) : [...s.pinned, id] })),
      sidebarOpen: true, setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      works: [],
      addWork: (w) => set((s) => ({ works: [...s.works.filter((x) => x.id !== w.id), w].slice(-200) })),
      // meta 合并而非覆盖：轮询写进度时不能把 seconds / ratio 等字段抹掉（对齐造物 video 页的 patchWork）
      updateWork: (id, patch) => set((s) => ({ works: s.works.map((w) => (w.id === id ? { ...w, ...patch, meta: patch.meta ? { ...(w.meta ?? {}), ...patch.meta } : w.meta } : w)) })),
      removeWork: (id) => set((s) => ({ works: s.works.filter((w) => w.id !== id) })),
      myPersonas: [], setMyPersonas: (myPersonas) => set({ myPersonas }),
    }),
    {
      name: "xoi-one-stop-studio",
      partialize: (s) => ({ modality: s.modality, vendor: s.vendor, selected: s.selected, pinned: s.pinned, sidebarOpen: s.sidebarOpen, works: s.works, myPersonas: s.myPersonas }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StudioState>;
        return { ...current, ...p, works: (p.works ?? []).map((w) => (w.kind === "video" && w.taskId && w.url?.startsWith("blob:") ? { ...w, url: undefined, urls: undefined } : w)) };
      },
    },
  ),
);

/** 让工作台按作品原样恢复提示词 + 参数 + 输入模式（媒体页监听 mc:reuse，造物同款事件） */
export function reuseWork(w: Work) { document.dispatchEvent(new CustomEvent<Work>("mc:reuse", { detail: w })); }
/** 余额不足事件（顶栏/弹窗层接） */
export function emitInsufficient(need: number, have: number) { document.dispatchEvent(new CustomEvent("mc:insufficient", { detail: { need, have } })); }
