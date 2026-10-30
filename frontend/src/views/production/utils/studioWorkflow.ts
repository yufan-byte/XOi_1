import type { FlowData } from "./flowBuilder";

export const studioStages = [
  { id: "planning", label: "镜头规划", purpose: "把剧本拆成镜头，确定每镜拍什么、如何衔接。", output: "导演计划 + 分镜表" },
  { id: "frames", label: "分镜画面", purpose: "用分镜图预览整集，逐镜检查场景布局、人物位置和动作承接。", output: "分镜预览 + 衔接设定" },
  { id: "video", label: "视频制作", purpose: "写动作与运镜，自主选择文生视频或参考图生视频，再挑选采用版本。", output: "已采用的镜头视频" },
  { id: "edit", label: "剪辑成片", purpose: "连播检查已采用的片段，再到剪辑台调整顺序、声音与节奏并导出。", output: "本集成片" },
] as const;
export type StudioStage = (typeof studioStages)[number]["id"];
export function studioStageFor(value: unknown): StudioStage | undefined {
  if (typeof value !== "string") return undefined;
  if (studioStages.some((stage) => stage.id === value)) return value as StudioStage;
  return (
    {
      preview: "frames",
      storyboard: "frames",
      generate: "video",
      playback: "edit",
      editVideo: "edit",
      scriptPlan: "planning",
      storyboardTable: "planning",
      script: "planning",
    } as Record<string, StudioStage>
  )[value];
}
/** Start at the earliest unfinished work. Existing media never silently approves a changed plan. */
export function initialStudioStage(data: FlowData, requested?: unknown): StudioStage {
  const explicit = studioStageFor(requested);
  if (explicit) return explicit;
  if (!data.scriptPlan?.trim() || !data.storyboardTable?.trim() || !data.reviewState?.planApproved || !data.reviewState?.tableApproved)
    return "planning";
  const frames = data.storyboard ?? [];
  if (!frames.length || frames.some((frame) => !(Number(frame.duration) > 0) || !(frame.videoDesc || frame.prompt)?.trim())) return "planning";
  if (frames.some((frame) => frame.shouldGenerateImage !== 0 && !frame.src)) return "frames";
  // A filled image gallery says nothing about continuity or which video version the user wants.
  return "frames";
}
export function studioStageStatus(data: FlowData): Record<StudioStage, string> {
  const frames = data.storyboard ?? [];
  const incomplete = frames.filter((frame) => !(Number(frame.duration) > 0) || !(frame.videoDesc || frame.prompt)?.trim()).length;
  const images = frames.filter((frame) => frame.src).length;
  const video = data.videoProgress;
  const unlinked = frames.filter((frame) => !(Number(frame.trackId) > 0)).length;
  return {
    planning: !data.reviewState?.planApproved
      ? "导演计划待确认"
      : !data.reviewState?.tableApproved
        ? "分镜表待确认"
        : incomplete
          ? `${incomplete} 镜信息待补齐`
          : frames.length
            ? `${frames.length} 镜 · 已确认`
            : "待创建镜头记录",
    frames: frames.length ? `画面 ${images}/${frames.length} · 逐镜核对衔接` : "待制作画面",
    video: (video?.total ? `视频 ${video.done}/${video.total}` : "待制作视频") + (unlinked ? ` · ${unlinked} 镜未关联` : ""),
    edit: data.output?.length ? `${data.output.length} 个成片存档` : "连播检查 · 剪辑导出",
  };
}

/** Keep shot numbers stable across previews, grouped clips and missing/unlinked records. */
export function storyboardTrackCode(frames: { trackId?: number | null }[], trackId: number, standaloneIndex: number) {
  const codes = frames.flatMap((frame, index) => (Number(frame.trackId) === Number(trackId) ? [`S${String(index + 1).padStart(2, "0")}`] : []));
  return codes.length ? codes.join(" / ") : `独立片段 ${standaloneIndex + 1}`;
}

/** Return from the editor to this episode, never to a different project supplied in returnTo. */
export function editorProductionReturn(returnTo: unknown, projectId: string, episode: string) {
  let stage: StudioStage = "edit";
  let view: "canvas" | "studio" = "studio";
  if (typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\")) {
    try {
      const target = new URL(returnTo, "http://local.invalid");
      if (target.pathname === "/production" && target.searchParams.get("projectId") === projectId) {
        stage = studioStageFor(target.searchParams.get("stage")) || "edit";
        if (target.searchParams.get("view") === "canvas") view = "canvas";
      }
    } catch {
      /* Keep a local episode return if an old link is malformed. */
    }
  }
  return { path: "/production", query: { projectId, episode, stage, view } };
}
