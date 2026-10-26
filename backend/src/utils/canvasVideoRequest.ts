const bool = (value: unknown) => value === true || value === "true" || value === 1 || value === "1";
const urls = (value: unknown): string[] => Array.isArray(value)
  ? value.map(item => typeof item === "string" ? item : item?.url).filter((url): url is string => typeof url === "string" && !!url)
  : [];

/** Normalize the browser JSON contract once; queueing may not change or silently drop choices. */
export function canvasVideoRequest(body: Record<string, any>, headers: Record<string, any> = {}) {
  const seconds = body.seconds ?? body.duration;
  return {
    clientTaskId: body.clientTaskId || body.client_task_id || headers["x-client-video-task-id"],
    source_id: body.source_id || headers["x-video-task-source-id"], node_id: body.node_id || headers["x-video-task-node-id"],
    prompt: body.prompt, model: typeof body.model === "string" ? body.model : "",
    duration: seconds === undefined || seconds === "" ? undefined : Number(seconds),
    resolution: typeof (body.resolution ?? body.resolution_name) === "string" ? (body.resolution ?? body.resolution_name)
      : typeof body.size === "string" && /^\d{3,4}p$/i.test(body.size) ? body.size : undefined,
    aspect_ratio: body.aspect_ratio || (typeof body.size === "string" && /^\d+:\d+$/.test(body.size) ? body.size : undefined),
    generate_audio: bool(body.generate_audio ?? body.video_generate_audio),
    watermark: bool(body.watermark ?? body.video_watermark),
    images: [...new Set([...urls(body.images ?? body["input_reference[]"]), ...[body.first_frame, body.first_frame_url, body.last_frame_url].filter(value => typeof value === "string" && value)])],
    videos: urls(body.videos ?? body["video_reference[]"]), audios: urls(body.audios ?? body["audio_reference[]"]),
  };
}
