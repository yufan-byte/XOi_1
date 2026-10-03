"use client";
// Bot 形象 + Agent 记忆：本地持久化（不能改 store/app.ts，故独立一个 zustand persist 存储）
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BotColor, BotEmotion, BotShape } from "./bot-shapes";

export interface BotConfig { shape: BotShape; color: BotColor; emotion: BotEmotion | "auto" }
export const DEFAULT_BOT: BotConfig = { shape: "Blob", color: "black", emotion: "auto" };

interface BotState {
  bot: BotConfig; setBot: (b: BotConfig) => void;
  memoryEnabled: boolean; setMemoryEnabled: (v: boolean) => void;
  memory: string; setMemory: (doc: string) => void; appendMemory: (text: string) => void;
}

export const useBot = create<BotState>()(persist((set) => ({
  bot: DEFAULT_BOT, setBot: (bot) => set({ bot }),
  memoryEnabled: true, setMemoryEnabled: (memoryEnabled) => set({ memoryEnabled }),
  memory: "", setMemory: (memory) => set({ memory }),
  appendMemory: (text) => set((s) => { const t = text.trim(); if (!t || s.memory.includes(t)) return {}; return { memory: (s.memory ? `${s.memory.trimEnd()}\n` : "") + `- ${t}` }; }),
}), { name: "mc.superagent.bot" }));
