export type WorkKind = "image" | "video" | "audio";
export interface Work {
  id: string; kind: WorkKind; model: string; prompt: string; createdAt: number;
  url?: string; urls?: string[]; status: "pending" | "running" | "done" | "failed"; taskId?: string;
  meta?: Record<string, unknown>; error?: string; favorite?: boolean;
}
