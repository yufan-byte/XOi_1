// 站内邮箱：生成任务的完成 / 失败通知（zaowu lib/inbox 同款机制）。
// 消息存本浏览器；未读数挂顶栏信封徽标，打开抽屉即全部已读。
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type InboxModule = "video" | "image" | "audio" | "platform";
export interface InboxMessage { id: string; module: InboxModule; title: string; body?: string; href?: string; createdAt: number; read?: boolean; tone?: "success" | "error" | "info" }

/** 最多留 200 条，旧的自动丢掉，免得把本地存储写满 */
const MAX = 200;
const MODULE_LABEL: Record<InboxModule, string> = { video: "视频", image: "图片", audio: "音频", platform: "平台" };
const KIND_MODULE: Record<string, InboxModule> = { image: "image", video: "video", audio: "audio" };
const KIND_PAGE: Record<string, string> = { image: "/image", video: "/video-studio", audio: "/audio" };

interface InboxState {
  messages: InboxMessage[];
  push: (m: Omit<InboxMessage, "id" | "createdAt"> & { id?: string }) => InboxMessage | null;
  markAllRead: () => void; remove: (id: string) => void; clearAll: () => void;
}

export const useInbox = create<InboxState>()(persist((set, get) => ({
  messages: [],
  push: (m) => {
    const id = m.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    if (get().messages.some((x) => x.id === id)) return null;   // 同一作品同一种结果只写一次
    const msg: InboxMessage = { ...m, id, createdAt: Date.now() };
    set((s) => ({ messages: [msg, ...s.messages].slice(0, MAX) }));
    return msg;
  },
  markAllRead: () => set((s) => ({ messages: s.messages.map((x) => (x.read ? x : { ...x, read: true })) })),
  remove: (id) => set((s) => ({ messages: s.messages.filter((x) => x.id !== id) })),
  clearAll: () => set({ messages: [] }),
}), { name: "xoi-one-stop-inbox", version: 1 }));

export const unreadCount = (s: Pick<InboxState, "messages">) => s.messages.reduce((n, m) => n + (m.read ? 0 : 1), 0);

/** 作品状态从进行中变成完成 / 失败时写一条（各工作台在终态处调用）。
 *  消息 id 带 `work:{id}:{status}`：轮询重试、重复回调都不会重复进邮箱。 */
export function notifyWork(w: { id: string; kind: string; prompt: string; status: string; error?: string }) {
  const mod = KIND_MODULE[w.kind];
  if (!mod || (w.status !== "done" && w.status !== "failed")) return;
  const ok = w.status === "done"; const what = MODULE_LABEL[mod];
  const brief = w.prompt.length > 40 ? `${w.prompt.slice(0, 40)}…` : w.prompt;
  useInbox.getState().push({
    id: `work:${w.id}:${w.status}`, module: mod, tone: ok ? "success" : "error",
    title: ok ? `${what}生成完成` : `${what}生成失败`,
    body: ok ? brief : `${brief}${w.error ? ` —— ${w.error}` : ""}`,
    href: KIND_PAGE[w.kind],
  });
}
