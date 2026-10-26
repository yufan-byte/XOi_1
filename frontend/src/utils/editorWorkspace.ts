/** Reserve useful preview space when resizing the timeline, including short windows. */
export function editorTimelineSize(viewport: number, requested?: number) {
  const height = Number.isFinite(viewport) && viewport > 0 ? viewport : 800;
  const min = height < 600 ? 150 : 190;
  const max = Math.max(min, Math.min(500, height - 330));
  const value = requested === undefined || !Number.isFinite(requested) ? Math.round(height * 0.33) : requested;
  return { min, max, value: Math.min(max, Math.max(min, value)) };
}
export function fitEditorScale(duration: number, width: number, pixelsPerSecond: number, min: number, max: number) {
  if (!(duration > 0) || !Number.isFinite(duration) || !(width > 0) || !(pixelsPerSecond > 0)) return null;
  return Math.max(min, Math.min(max, Math.max(1, width - 36) / duration / pixelsPerSecond));
}
export function adjacentEditPoint(clips: { startTime: number; endTime: number }[], current: number, direction: -1 | 1) {
  const points = [...new Set([0, ...clips.flatMap((clip) => [clip.startTime, clip.endTime])])]
    .filter((time) => Number.isFinite(time) && time >= 0)
    .sort((a, b) => a - b);
  return direction === 1
    ? (points.find((time) => time > current + 0.02) ?? points.at(-1) ?? 0)
    : (points.filter((time) => time < current - 0.02).at(-1) ?? 0);
}

export function canSplitEditorClip(clip: { startTime: number; endTime: number; type?: string }, time: number) {
  return clip.type !== "transition" && Number.isFinite(time) && time - clip.startTime >= 0.05 && clip.endTime - time >= 0.05;
}

/** A null storage default otherwise selects VueUse's string serializer for timeline arrays. */
export const editorDraftSerializer = {
  read(raw: string): any[] | null {
    try {
      const value: unknown = JSON.parse(raw);
      return Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  },
  write(value: any[] | null) {
    return JSON.stringify(value);
  },
};
