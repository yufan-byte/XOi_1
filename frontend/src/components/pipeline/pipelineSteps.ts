/**
 * 影视创作流水线的「唯一事实来源」。
 *
 * 各页的「下一步」吸底条（NextStepBar）与进度带（PipelineProgress）都从这里取，
 * 避免步骤名 / 路径 / 顺序在多处各写一份而漂移。
 * 侧栏菜单（layouts/WorkbenchLayout.vue）的文案与此保持一致。
 */
export type PipelineStepId = "novel" | "scriptAgent" | "script" | "cornerScape" | "production";

export interface PipelineStep {
  id: PipelineStepId;
  /** 吸底条 / 进度带里的短名 */
  label: string;
  /** 侧栏与标题用的完整名 */
  title: string;
  /** 一句话职责 */
  desc: string;
  /** 路由路径 */
  path: string;
  /**
   * 只有「小说改编」型项目（projectType=novel）才需要的前置站点。
   * 剧本创作型项目（projectType=script）直接从 /script 起步。
   */
  novelOnly?: boolean;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  { id: "novel", label: "原始素材", title: "导入素材", desc: "导入小说原文或已有剧本", path: "/novel", novelOnly: true },
  { id: "scriptAgent", label: "AI 改编", title: "AI 改编（可选）", desc: "把原文改写成分集剧本", path: "/scriptAgent", novelOnly: true },
  { id: "script", label: "剧本整理", title: "剧本整理", desc: "整理分集剧本并提取角色场景", path: "/script" },
  { id: "cornerScape", label: "角色场景", title: "角色场景", desc: "生成角色、场景和道具形象", path: "/cornerScape" },
  { id: "production", label: "分镜成片", title: "分镜成片", desc: "制作分镜、画面、视频并合成成片", path: "/production" },
];

/** 进度带的 5 个「数据段」。与站点不是一一对应：
 *  素材/剧本/角色场景/分镜/成片——按数据维度统计，才能一眼看出「卡在哪」。
 *  数据来自后端 getProject 的 progress 聚合。 */
export type ProgressSegmentId = "material" | "script" | "asset" | "storyboard" | "output";

export interface ProgressSegment {
  id: ProgressSegmentId;
  label: string;
  hint: string;
}

export const PROGRESS_SEGMENTS: ProgressSegment[] = [
  { id: "material", label: "素材", hint: "已收录的小说章节" },
  { id: "script", label: "剧本", hint: "分集剧本" },
  { id: "asset", label: "角色场景", hint: "角色 / 场景 / 道具资产" },
  { id: "storyboard", label: "分镜", hint: "分镜与画面" },
  { id: "output", label: "成片", hint: "合成归档的成片" },
];

export interface ProgressCounter {
  done: number;
  total: number;
}

/** 按项目类型过滤出该项目真正会经过的站点 */
export function visibleSteps(projectType?: string | null): PipelineStep[] {
  const isScript = projectType === "script";
  return PIPELINE_STEPS.filter((step) => !(isScript && step.novelOnly));
}

export function getStep(id: PipelineStepId): PipelineStep | undefined {
  return PIPELINE_STEPS.find((step) => step.id === id);
}

/** 该项目里 current 的下一站；已是终站返回 undefined */
export function getNextStep(id: PipelineStepId, projectType?: string | null): PipelineStep | undefined {
  const list = visibleSteps(projectType);
  const idx = list.findIndex((step) => step.id === id);
  if (idx < 0 || idx >= list.length - 1) return undefined;
  return list[idx + 1];
}

/** current 在流水线里的序号（第 N 步，按项目类型过滤后计）。找不到返回 0 */
export function getStepNo(id: PipelineStepId, projectType?: string | null): number {
  const list = visibleSteps(projectType);
  const idx = list.findIndex((step) => step.id === id);
  return idx < 0 ? 0 : idx + 1;
}

/** 该项目共有几站 */
export function getStepTotal(projectType?: string | null): number {
  return visibleSteps(projectType).length;
}
