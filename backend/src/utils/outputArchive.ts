import fs from "node:fs/promises";
import path from "node:path";
import { isAllowedMedia } from "./mediaSecurity";
import { MAX_OUTPUT_ARCHIVE_BYTES } from "../../../shared/outputArchivePolicy";

/** Only immutable MP4s uploaded into the authenticated owner's media bucket may be archived. */
export async function resolveOutputAsset(root: string, userId: number, assetUrl: string) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("账号无效");
  const match = /^\/oss\/canvas-files\/([1-9]\d*)\/([a-f0-9]{32}\.mp4)$/.exec(assetUrl);
  if (!match || match[1] !== String(userId)) throw new Error("只能归档当前账号已上传的 MP4 成片");
  const filePath = `/canvas-files/${userId}/${match[2]}`;
  const canonicalRoot = await fs.realpath(root);
  const target = path.join(canonicalRoot, filePath.slice(1));
  // No symlinks in any component: otherwise a bucket could point into another account or outside OSS.
  if (await fs.realpath(target) !== target) throw new Error("成片路径无效");
  const file = await fs.open(target, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_OUTPUT_ARCHIVE_BYTES) throw new Error("成片为空或超过 128MB 归档上限");
    const header = Buffer.alloc(32);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (!isAllowedMedia(header.subarray(0, bytesRead), "mp4")) throw new Error("成片内容不是 MP4 视频");
    return { filePath, size: stat.size };
  } finally { await file.close(); }
}
