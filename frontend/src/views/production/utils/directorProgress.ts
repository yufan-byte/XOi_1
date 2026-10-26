import type { FlowData } from "./flowBuilder";
import type { ComputedRef, InjectionKey } from "vue";

export type DirectorNodeId = "script" | "assets" | "scriptPlan" | "storyboardTable" | "storyboard" | "workbench" | "output";
export interface DirectorProgress { tone: "done" | "todo" | "working" | "warn"; label: string; next: string }
export const directorProgressKey: InjectionKey<ComputedRef<Record<DirectorNodeId, DirectorProgress>>> = Symbol("directorProgress");

export function getDirectorProgress(data: FlowData): Record<DirectorNodeId, DirectorProgress> {
  const content = (value: string, next: string): DirectorProgress => value?.trim()
    ? { tone: "done", label: "内容已就绪", next: "可继续检查与调整" }
    : { tone: "todo", label: "待完善", next };
  const assets = (data.assets ?? []).flatMap(asset => [asset, ...(asset.derive ?? [])]);
  const assetDone = assets.filter(asset => !!asset.src).length;
  const assetFailed = assets.filter(asset => asset.state === "生成失败" && !asset.src).length;
  const assetWorking = assets.filter(asset => asset.state === "生成中" && !asset.src).length;
  const frames = data.storyboard ?? [];
  const images = frames.filter(frame => frame.shouldGenerateImage !== 0);
  const imageDone = images.filter(frame => !!frame.src && frame.state === "已完成").length;
  const imageFailed = images.filter(frame => frame.state === "生成失败").length;
  const imageWorking = images.filter(frame => frame.state === "生成中").length;
  const video = data.videoProgress;
  const outputCount = (data.output ?? []).length;
  return {
    script: content(data.script, "先导入或整理本集剧本"),
    scriptPlan: data.scriptPlan?.trim() ? { tone: data.reviewState?.planApproved ? 'done' : 'warn', label: data.reviewState?.planApproved ? '已审核' : '待审核', next: data.reviewState?.planApproved ? '可制定分镜表' : '检查内容后点击审核通过' } : content(data.scriptPlan, "待补充镜头风格与节奏规划"),
    storyboardTable: data.storyboardTable?.trim() ? { tone: data.reviewState?.tableApproved ? 'done' : 'warn', label: data.reviewState?.tableApproved ? '已审核' : '待审核', next: data.reviewState?.tableApproved ? '可制作分镜画面与视频' : '检查内容后点击审核通过' } : content(data.storyboardTable, "待把剧本拆成镜头清单"),
    assets: {
      tone: assetFailed ? "warn" : assetWorking ? "working" : assets.length && assetDone === assets.length ? "done" : "todo",
      label: assets.length ? `已就绪 ${assetDone}/${assets.length}` : "待准备资产",
      next: assetFailed ? `${assetFailed} 个生成失败，请重试` : assetWorking ? `${assetWorking} 个正在生成` : assetDone < assets.length ? `还需生成 ${assets.length - assetDone} 个资产` : assets.length ? "角色与场景已就绪，可按需衍生" : "先从剧本提取角色与场景",
    },
    storyboard: {
      tone: imageFailed ? "warn" : imageWorking ? "working" : frames.length && imageDone === images.length ? "done" : "todo",
      label: frames.length ? `图片 ${imageDone}/${images.length}` : "待创建分镜",
      next: imageFailed ? `${imageFailed} 张生成失败，请重试` : imageWorking ? `${imageWorking} 张正在生成` : !frames.length ? "先根据分镜表创建镜头" : imageDone < images.length ? `还需生成 ${images.length - imageDone} 张画面` : images.length ? "分镜画面已就绪，可进入视频制作" : "本集镜头无需生成参考图片",
    },
    workbench: {
      tone: video?.failed ? "warn" : video?.generating ? "working" : video?.total && video.done === video.total ? "done" : "todo",
      label: video?.total ? `视频 ${video.done}/${video.total}` : "待制作视频",
      next: video?.failed ? `${video.failed} 个镜头组生成失败` : video?.generating ? `${video.generating} 个镜头组正在生成` : video?.total ? video.done === video.total ? "视频已就绪，可进入剪辑" : `还需制作 ${video.total - video.done} 个镜头组` : "打开工作台生成或导入镜头视频",
    },
    output: outputCount ? { tone: "done", label: `已归档 ${outputCount} 个成片`, next: "可预览成片与检查交付版本" } : { tone: "todo", label: "待剪辑导出", next: "完成剪辑并导出，即可在这里预览" },
  };
}
