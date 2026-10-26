"use client";
// 各阶段共用：属性类型、阶段标题、确认栏、空态
import { ArrowRight, Check, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogModel } from "@/lib/models";
import { cn } from "@/lib/utils";
import type { MfVideoCaps } from "../multiframe/video-caps";
import { STAGE_DEFS, stagePath, type ComicProject, type StageKey } from "./types";

export type Save = (fn: (p: ComicProject) => ComicProject) => ComicProject;
export interface StepProps {
  p: ComicProject;
  save: Save;
  busy: boolean;
  setBusy: (b: boolean) => void;
  /** 确认当前阶段并进入下一阶段（最后一阶段则标记项目已完成） */
  confirmStage: () => void;
  /** Replacement confirmation; cancellation never submits, old downstream media is retained. */
  redo: (key: StageKey) => Promise<boolean>;
  navigate: (key: StageKey) => void;
  /** 打开工作台右上「项目设定」抽屉（生成对话框里的「调整模型与模式」等入口用） */
  openSettings?: () => void;
  /** 自动托管：从当前进度一路跑到成片 */
  autopilot: () => void;
  /** 读最新项目：异步循环里别用渲染时的 p（旧快照，改过的时长 / 模型 / 前情都读不到） */
  get: () => ComicProject;
  /** 批量逐项执行：占住 busy 防重复点击；单项失败不中断（fn 返回 false 记为失败）；页头「停止」会中止当前项并跳出循环；离开页面自动停止 */
  runBatch: <T>(label: string, items: T[], fn: (item: T, signal: AbortSignal) => Promise<boolean>) => Promise<void>;
  /** 当前视频模型的线路能力（时长档 / 清晰度 / 首帧还是参考图）；目录未加载时为空，按老逻辑走 */
  vcaps?: MfVideoCaps;
  /** 模型目录：报价、风格参考图 / 音色校验要用到图片、视频、配音模型的卡片 */
  catalog?: CatalogModel[];
}

export const err = (e: unknown) => (e as Error)?.message || "出错了";

export function nextStageOf(p: ComicProject, key: StageKey) { const path = stagePath(p.kind); return path[path.indexOf(key) + 1]; }

export function StageHeader({ p, stage, children }: { p: ComicProject; stage: StageKey; children?: React.ReactNode }) {
  const d = STAGE_DEFS[stage];
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold"><span className="rounded-lg bg-primary-tint px-2 py-0.5 font-mono text-sm text-accent-foreground">{d.no}</span>{d.label}{p.done[stage] && <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success"><CheckCircle2 size={12} />已确认</span>}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{d.desc}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** 阶段底部确认栏：确认后进入下一阶段；已确认时可直接进入下一阶段 */
export function ConfirmBar({ p, stage, can = true, busy, onConfirm, hint, label }: { p: ComicProject; stage: StageKey; can?: boolean; busy?: boolean; onConfirm: () => void; hint?: string; label?: string }) {
  const next = nextStageOf(p, stage);
  const done = !!p.done[stage];
  const auto = p.schedule === "自动托管" && (stage === "input" || stage === "bible");
  const text = label ?? (auto ? "开始后台连续制作" : next ? `确认，进入 ${STAGE_DEFS[next].no} ${STAGE_DEFS[next].label}` : "确认，标记为已完成");
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3", done ? "border-success/30 bg-success/5" : "bg-muted/40")}>
      <div className="text-sm text-muted-foreground">{done ? <span className="inline-flex items-center gap-1 text-success"><Check size={14} />本阶段已确认{next ? "，可继续或返回修改；重生成后请核对后续内容" : ""}</span> : hint ?? "确认后进入下一阶段；之后仍可回到本阶段重做。"}</div>
      <Button className="ml-auto" disabled={!can || busy} onClick={onConfirm}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}{done && next ? `进入 ${STAGE_DEFS[next].no} ${STAGE_DEFS[next].label}` : text}<ArrowRight size={14} /></Button>
    </div>
  );
}

export function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">{text}</div>; }
