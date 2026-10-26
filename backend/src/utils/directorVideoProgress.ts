interface Track { id: number }
interface Video { videoTrackId: number | null; state: string | null; filePath: string | null }

/** A track is ready when it has a playable result; repeated attempts do not count as extra shots. */
export function directorVideoProgress(tracks: Track[], videos: Video[]) {
  const byTrack = new Map<number, Video[]>();
  for (const video of videos) {
    const id = Number(video.videoTrackId);
    const rows = byTrack.get(id) ?? [];
    rows.push(video);
    byTrack.set(id, rows);
  }
  const progress = { total: tracks.length, done: 0, failed: 0, generating: 0, pending: 0, trackStates: {} as Record<number, string> };
  for (const track of tracks) {
    const rows = byTrack.get(track.id) ?? [];
    const ready = rows.some(row => ["生成成功", "已完成"].includes(row.state ?? "") && !!row.filePath);
    const generating = rows.some(row => row.state === "生成中");
    const failed = rows.some(row => row.state === "生成失败");
    const state = ready ? "已完成" : generating ? "生成中" : failed ? "生成失败" : "未生成";
    progress.trackStates[track.id] = state;
    progress[ready ? "done" : generating ? "generating" : failed ? "failed" : "pending"]++;
  }
  return progress;
}
