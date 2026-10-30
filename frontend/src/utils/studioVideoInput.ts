/** References shown in the composer must be the references submitted to the model. Never reorder a user's choice. */
export interface StudioReference {
  id?: number | null;
  sources?: string;
  src?: string;
  fileType?: string;
}

export interface StudioReferenceAllowance {
  image: number;
  video: number;
  audio: number;
  total: number;
}

export interface StudioVideoModeChoice {
  value: string;
  label: string;
  description: string;
  glyph: string;
}

const MODE_META: Record<string, Omit<StudioVideoModeChoice, "value">> = {
  text: { label: "文生视频", description: "只发送文字描述，适合从零创作镜头", glyph: "✦" },
  textToVideo: { label: "文生视频", description: "只发送文字描述，适合从零创作镜头", glyph: "✦" },
  singleImage: { label: "首帧", description: "用一张画面确定开场构图，再生成动作与运镜", glyph: "▣" },
  multiReference: { label: "全能参考", description: "同时参考角色、场景、图片或音视频素材", glyph: "◇" },
  startEndRequired: { label: "首尾帧", description: "固定开场与结尾画面，由模型补全中间运动", glyph: "◫" },
  endFrameOptional: { label: "首帧 + 尾帧", description: "首帧必选，尾帧可选；适合控制动作落点", glyph: "◫" },
  startFrameOptional: { label: "尾帧 + 首帧", description: "尾帧必选，首帧可选；适合倒推镜头运动", glyph: "◫" },
};

export function parseStudioVideoMode(value: string): string | string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : value;
  } catch {
    return value;
  }
}

function referencePartLabel(part: string) {
  const match = part.match(/^(videoReference|imageReference|audioReference|textReference)(?::(\d+))?$/);
  if (!match) return part;
  const names: Record<string, string> = { videoReference: "视频", imageReference: "图片", audioReference: "音频", textReference: "文本" };
  return `${names[match[1]] || match[1]}${match[2] ? ` ×${match[2]}` : ""}`;
}

export function studioVideoModeChoice(value: string, fallbackLabel = ""): StudioVideoModeChoice {
  const parsed = parseStudioVideoMode(value);
  if (Array.isArray(parsed)) {
    const parts = parsed.map(referencePartLabel);
    return { value, label: parts.length > 1 ? "多素材" : parts[0] || "素材参考", description: `支持 ${parts.join(" + ")}，按选择顺序发送`, glyph: "◇" };
  }
  const meta = MODE_META[parsed];
  return meta ? { value, ...meta } : { value, label: fallbackLabel || parsed, description: "按当前模型声明的参考方式生成", glyph: "◆" };
}

export function studioVideoModeChoices(modes: Array<string | string[]>): StudioVideoModeChoice[] {
  const seen = new Set<string>();
  return modes.flatMap((mode) => {
    const value = Array.isArray(mode) ? JSON.stringify(mode) : String(mode);
    if (!value || seen.has(value)) return [];
    seen.add(value);
    return [studioVideoModeChoice(value)];
  });
}

/** Keep the user's semantic choice when switching models, even if the exact provider mode differs. */
export function compatibleStudioVideoMode(current: string, available: StudioVideoModeChoice[]) {
  if (!available.length) return "";
  if (available.some((item) => item.value === current)) return current;
  const wantsText = isTextVideoMode(current);
  const sameKind = available.find((item) => isTextVideoMode(item.value) === wantsText);
  return sameKind?.value || available[0].value;
}

export function videoReferenceAllowance(
  mode: string,
  limits: { images?: number; videos?: number; audios?: number } = {},
): StudioReferenceAllowance {
  if (isTextVideoMode(mode)) return { image: 0, video: 0, audio: 0, total: 0 };
  if (mode === "singleImage") return { image: 1, video: 0, audio: 0, total: 1 };
  if (["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(mode)) return { image: 2, video: 0, audio: 0, total: 2 };
  const parsed = parseStudioVideoMode(mode);
  if (Array.isArray(parsed)) {
    const count = (kind: string) => parsed.reduce((sum, part) => {
      const match = part.match(new RegExp(`^${kind}(?::(\\d+))?$`));
      return sum + (match ? Math.max(1, Number(match[1]) || 1) : 0);
    }, 0);
    const allowance = { image: count("imageReference"), video: count("videoReference"), audio: count("audioReference"), total: 0 };
    allowance.total = allowance.image + allowance.video + allowance.audio;
    return allowance;
  }
  const image = Math.max(0, Number(limits.images) || (mode === "multiReference" ? 32 : 1));
  const video = Math.max(0, Number(limits.videos) || 0);
  const audio = Math.max(0, Number(limits.audios) || 0);
  return { image, video, audio, total: Math.min(32, image + video + audio || image) };
}

export function isTextVideoMode(mode: string) {
  return mode === "text" || mode === "textToVideo";
}
export function videoReferenceItems<T extends StudioReference>(mode: string, items: T[], allowance?: StudioReferenceAllowance): T[] {
  if (isTextVideoMode(mode)) return [];
  const selected =
    mode === "singleImage"
      ? items.slice(0, 1)
      : ["startEndRequired", "startFrameOptional", "endFrameOptional"].includes(mode)
        ? items.slice(0, 2)
        : items;
  const valid = selected.filter((i) => Boolean(i.src) && typeof i.id === "number" && i.id > 0 && (i.sources === "assets" || i.sources === "storyboard"));
  if (!allowance) return valid;
  const used = { image: 0, video: 0, audio: 0 };
  return valid.filter((item) => {
    const kind = item.fileType === "video" ? "video" : item.fileType === "audio" ? "audio" : "image";
    if (used[kind] >= allowance[kind] || used.image + used.video + used.audio >= allowance.total) return false;
    used[kind]++;
    return true;
  });
}
export function videoReferenceError(mode: string, items: StudioReference[], allowance?: StudioReferenceAllowance) {
  if (isTextVideoMode(mode)) return "";
  const valid = (i?: StudioReference) => !!i?.src && typeof i.id === "number" && i.id > 0;
  if (mode === "startEndRequired" && (!valid(items[0]) || !valid(items[1]))) return "请分别选择首帧和尾帧图片";
  if (mode === "endFrameOptional" && !valid(items[0])) return "请选择首帧图片";
  if (mode === "startFrameOptional" && !valid(items[1])) return "请选择尾帧图片";
  if (!videoReferenceItems(mode, items, allowance).length) return "请先选择当前模式支持的参考素材";
  return "";
}
