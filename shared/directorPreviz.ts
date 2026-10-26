/** Read the actual, non-fragmented MP4 written by the native frame exporter. */
export interface DirectorVideoMetadata {
  mimeType: "video/mp4";
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  frameCount: number;
  codec: string;
}
export interface DirectorPrevizAsset extends DirectorVideoMetadata {
  url: string;
  requestId: string;
}
const invalid = () => new Error("预演视频格式不完整，请重新导出；原场景保留");
const text = (view: DataView, p: number) =>
  String.fromCharCode(
    ...Array.from({ length: 4 }, (_, i) => view.getUint8(p + i)),
  );
interface Box {
  type: string;
  start: number;
  end: number;
  data: number;
}
function boxes(view: DataView, start = 0, end = view.byteLength): Box[] {
  const result: Box[] = [];
  let p = start;
  while (p < end) {
    if (end - p < 8 || result.length >= 10000) throw invalid();
    let size = view.getUint32(p),
      header = 8;
    if (size === 1) {
      if (end - p < 16) throw invalid();
      const big = view.getBigUint64(p + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
      size = Number(big);
      header = 16;
    }
    if (size === 0) size = end - p;
    if (size < header || p + size > end) throw invalid();
    result.push({
      type: text(view, p + 4),
      start: p,
      end: p + size,
      data: p + header,
    });
    p += size;
  }
  return result;
}
function child(v: DataView, b: Box, type: string) {
  const found = boxes(v, b.data, b.end).find((x) => x.type === type);
  if (!found) throw invalid();
  return found;
}
function uint(v: DataView, p: number, end: number) {
  if (p + 4 > end) throw invalid();
  return v.getUint32(p);
}
export async function readDirectorMP4(
  blob: Blob,
): Promise<DirectorVideoMetadata> {
  if (
    blob.size < 64 ||
    blob.size > 128 * 1024 * 1024 ||
    blob.type.split(";")[0] !== "video/mp4"
  )
    throw invalid();
  let p = 0,
    moov: ArrayBuffer | undefined,
    hasMedia = false,
    hasType = false,
    count = 0;
  while (p < blob.size) {
    if (++count > 10000 || blob.size - p < 8) throw invalid();
    const h = new DataView(await blob.slice(p, p + 16).arrayBuffer());
    let size = h.getUint32(0),
      header = 8;
    if (size === 1) {
      if (h.byteLength < 16) throw invalid();
      const big = h.getBigUint64(8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
      size = Number(big);
      header = 16;
    }
    if (size === 0) size = blob.size - p;
    if (size < header || p + size > blob.size) throw invalid();
    const type = text(h, 4);
    if (type === "ftyp") hasType = true;
    if (type === "mdat" && size > header) hasMedia = true;
    if (type === "moof")
      throw new Error("暂不支持分片预演视频，请使用导演台 MP4 导出");
    if (type === "moov") {
      if (moov || size > 8 * 1024 * 1024) throw invalid();
      moov = await blob.slice(p + header, p + size).arrayBuffer();
    }
    p += size;
  }
  if (!moov || !hasType || !hasMedia) throw invalid();
  const v = new DataView(moov),
    tracks = boxes(v).filter((b) => b.type === "trak");
  for (const track of tracks) {
    const mdia = child(v, track, "mdia"),
      hdlr = child(v, mdia, "hdlr");
    if (hdlr.data + 12 > hdlr.end) throw invalid();
    if (text(v, hdlr.data + 8) !== "vide") continue;
    const mdhd = child(v, mdia, "mdhd"),
      version = v.getUint8(mdhd.data);
    if (version !== 0 && version !== 1) throw invalid();
    const clock = mdhd.data + (version === 1 ? 20 : 12),
      timescale = uint(v, clock, mdhd.end);
    if (!timescale) throw invalid();
    const stbl = child(v, child(v, mdia, "minf"), "stbl"),
      stsz = child(v, stbl, "stsz"),
      stts = child(v, stbl, "stts"),
      stsd = child(v, stbl, "stsd");
    const frameCount = uint(v, stsz.data + 8, stsz.end),
      entries = uint(v, stts.data + 4, stts.end);
    if (
      !frameCount ||
      frameCount > 36000 ||
      entries > 36000 ||
      stts.data + 8 + entries * 8 > stts.end
    )
      throw invalid();
    let samples = 0,
      ticks = 0;
    for (let i = 0; i < entries; i++) {
      const n = uint(v, stts.data + 8 + i * 8, stts.end),
        delta = uint(v, stts.data + 12 + i * 8, stts.end);
      if (!n || !delta) throw invalid();
      samples += n;
      ticks += n * delta;
    }
    if (samples !== frameCount || !Number.isSafeInteger(ticks)) throw invalid();
    const descriptions = boxes(v, stsd.data + 8, stsd.end),
      visual = descriptions[0];
    if (
      !visual ||
      !["avc1", "avc3", "av01", "vp09", "hvc1", "hev1"].includes(visual.type) ||
      visual.data + 28 > visual.end
    )
      throw invalid();
    const width = v.getUint16(visual.data + 24),
      height = v.getUint16(visual.data + 26),
      durationSeconds = ticks / timescale,
      fps = frameCount / durationSeconds;
    if (
      width < 16 ||
      height < 16 ||
      width > 8192 ||
      height > 8192 ||
      durationSeconds <= 0 ||
      durationSeconds > 601 ||
      !Number.isFinite(fps)
    )
      throw invalid();
    return {
      mimeType: "video/mp4",
      width,
      height,
      durationSeconds,
      fps,
      frameCount,
      codec: visual.type,
    };
  }
  throw invalid();
}
export function assertDirectorVideo(
  metadata: DirectorVideoMetadata,
  shot: { fps: number; durationSeconds: number; aspectRatio: string },
) {
  const frames = Math.round(shot.fps * shot.durationSeconds),
    ratio = shot.aspectRatio.split(":").map(Number);
  if (
    !Number.isFinite(shot.fps) ||
    frames !== metadata.frameCount ||
    Math.abs(metadata.fps - shot.fps) > 0.01 ||
    Math.abs(metadata.durationSeconds - shot.durationSeconds) >
      1 / shot.fps + 0.001
  )
    throw new Error("预演视频时长或帧率与本镜头不符，未带入画布");
  if (
    ratio.length === 2 &&
    ratio.every((n) => n > 0) &&
    Math.abs(metadata.width / metadata.height - ratio[0] / ratio[1]) > 0.02
  )
    throw new Error("预演视频画幅与本镜头不符，未带入画布");
}
