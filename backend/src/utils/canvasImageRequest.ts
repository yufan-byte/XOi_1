/** Normalize the upstream canvas envelope; don't silently reinterpret tool/chat protocols. */
export function canvasImageRequest(body: any) {
  if (!body?.request) return body;
  const fail = (message: string) => {
    throw Object.assign(new Error(message), { status: 400 });
  };
  if (!["/images/generations", "/images/edits"].includes(body.endpoint))
    fail(
      "当前画布仅开放标准图片生成／参考图接口，请切换图片模型的标准图片模式；未提交上游",
    );
  const request = body.request;
  if (
    !request ||
    typeof request !== "object" ||
    Array.isArray(request) ||
    typeof request.model !== "string" ||
    typeof request.prompt !== "string"
  )
    fail("图片模型、提示词参数无效，未提交上游");
  if (request.n !== undefined && Number(request.n) !== 1)
    fail("单个图片任务只生成一张；多图请分任务确认，未提交上游");
  const refs =
    request.extra_body?.image ?? request.images ?? request.image ?? [];
  const list = Array.isArray(refs) ? refs : [refs];
  if (list.length > 32) fail("参考图片过多，未提交上游");
  const reference_images = list.map((ref: any) =>
    typeof ref === "string"
      ? { url: ref }
      : typeof ref?.url === "string"
        ? { url: ref.url }
        : typeof ref?.base64 === "string"
          ? { base64: ref.base64 }
          : fail("参考图片格式无效，未提交上游"),
  );
  return {
    model: request.model,
    prompt: request.prompt,
    size: request.size,
    width: request.width,
    height: request.height,
    resolution: request.resolution,
    negative_prompt: request.negative_prompt,
    reference_images,
    clientTaskId: body.clientTaskId,
    source_id: body.sourceId || body.source_id,
    node_id: body.nodeId || body.node_id,
  };
}
