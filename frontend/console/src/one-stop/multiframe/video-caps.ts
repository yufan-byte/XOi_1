// 视频线路对「首帧接镜」的真实支持情况：多帧短片每段都要把关键帧作为首帧发出去，
// 线路不认首帧时首帧会被静默忽略（照常扣费、段间完全不连贯），时长不在线路档位里上游直接 400。
// 这里从目录卡片（aicost 线路用 aicostCaps 推导出的能力）读出来，创建任务前就告诉用户，而不是跑到一半失败。
import type { CatalogModel, ParamField } from "@/lib/models";

export type MfFrameMode = "first-frame" | "reference" | "none";
export interface MfVideoCaps { frame: MfFrameMode; durations: number[]; resolutions: string[]; ratios: string[]; sendMode: boolean }

const values = (f?: ParamField) => (f?.enum ?? f?.options?.map((o) => o.value) ?? []).map(String);
const INPUT_MODES = ["text-to-video", "first-frame", "first-last", "reference", "edit", "extend", "continuation"];

export function mfVideoCaps(m: CatalogModel): MfVideoCaps {
  const ps = m.paramSchema ?? {};
  const durations = values(ps.duration).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  const resolutions = values(ps.resolution);
  const ratios = values(ps.aspect_ratio).filter((r) => /^\d+:\d+$/.test(r));
  if (m.aicost) {
    const c = m.aicost; // Seedance 线路没有首帧字段，图只能当参考图；Grok 单图 = 首帧；Sora 933 image_url + start_frame
    // 清晰度：线路锁定一档就是那一档；任务式上游的线路（seedance2.0-line1 / seedance2.5-line1）一条可选多档，aicostCaps 不锁定，
    // 选项在卡片的 resolution 字段里（视频页也从这里取）。以前这类线路列表为空 → 不发清晰度 → 网关插件按 720p 扣，
    // 报价却落在 480p 的 default 档（少报 22% / 35%），选「480P 省费」也照样按 720p 扣
    return { frame: c.firstFrame ? "first-frame" : c.images > 0 ? "reference" : "none", durations: c.durations.map(Number).sort((a, b) => a - b), resolutions: c.resolution ? [c.resolution] : resolutions, ratios: c.ratios, sendMode: false };
  }
  const modes = values(ps.mode).filter((x) => INPUT_MODES.includes(x)); // kling omni 的 mode 是 std/pro 档位，不是输入方式
  const takesImages = !!ps.images || !Object.keys(ps).length; // 没有卡片的老线路按 input_reference 首帧处理
  const frame: MfFrameMode = modes.length ? (modes.includes("first-frame") ? "first-frame" : modes.includes("reference") && takesImages ? "reference" : "none") : takesImages ? "first-frame" : "none";
  return { frame, durations, resolutions, ratios, sendMode: modes.length > 0 };
}

/** 每段时长对齐到线路支持的档位：取 ≥ 目标的最小档，没有就取最大档；线路没写档位则原样 */
export function snapSeconds(want: number, durations: number[] | undefined) {
  if (!durations?.length) return want;
  return durations.find((d) => d >= want) ?? durations[durations.length - 1];
}

/** 这一段实际提交的清晰度：线路列了清晰度才发，任务的清晰度不在其中时取 720p，再不行取第一档。
 *  首页报价、换模型重生的报价都用它，报价取档与实际提交同源 */
export function segResolution(t: { resolution: string }, caps?: MfVideoCaps): string | undefined {
  return caps?.resolutions.length ? (caps.resolutions.includes(t.resolution) ? t.resolution : caps.resolutions.includes("720p") ? "720p" : caps.resolutions[0]) : undefined;
}
