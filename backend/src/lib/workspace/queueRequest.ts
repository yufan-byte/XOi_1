import type { MediaKind } from "./mediaQueue";
/** Persist generation parameters only: never headers, credentials, vendor scripts or req.user. */
export function queueRequest(kind: MediaKind, body: Record<string, any>) {
  const keys =
    kind === "image"
      ? [
          "model",
          "prompt",
          "size",
          "width",
          "height",
          "resolution",
          "exact_size",
          "aspect_ratio",
          "mode",
          "negative_prompt",
          "reference_images",
        ]
      : kind === "video"
        ? [
            "model",
            "prompt",
            "duration",
            "resolution",
            "aspect_ratio",
            "mode",
            "images",
            "videos",
            "audios",
            "generate_audio",
            "enhance_prompt",
            "enable_upsample",
            "watermark",
            "camerafixed",
            "multimodal",
          ]
        : [
            "model",
            "input",
            "voice",
            "response_format",
            "speed",
            "instructions",
          ];
  const result = Object.fromEntries(
    keys
      .filter((key) => body[key] !== undefined)
      .map((key) => [key, structuredClone(body[key])]),
  );
  // Reference objects accept content only, never arbitrary nested headers/credentials.
  for (const key of ["reference_images", "images", "videos", "audios"]) {
    if (result[key] !== undefined) {
      if (!Array.isArray(result[key]) || result[key].length > 32)
        throw new Error("参考素材列表无效或超过 32 个");
      result[key] = result[key].map((ref: any) =>
        typeof ref === "string"
          ? ref
          : Object.fromEntries(
              ["url", "base64"]
                .filter((field) => typeof ref?.[field] === "string")
                .map((field) => [field, ref[field]]),
            ),
      );
    }
  }
  return result;
}
