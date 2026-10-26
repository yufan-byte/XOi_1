import u from "@/utils";
import { isAllowedMedia } from "@/utils/mediaSecurity";
import { diskRefusal } from "@/utils/storageGuard";
import { MAX_FILE_BYTES, release, reserve, type StorageScope } from "@/utils/storageUsage";

/**
 * 统一的 base64 媒体落盘入口。
 *
 * 背景：assets/uploadClip、assets/saveAssets、assets/addAudioAssets、
 * production/editImage/uploadImage 这几个口原来各自 `Buffer.from(base64)` 后直接
 * `oss.writeFile` —— 不校验文件头、不限制大小、不记账。带来的问题：
 *  · 客户端把任意内容声明成 image/png 就能写进项目目录；
 *  · 没有大小上限（只受全局 25MB JSON body 限制，base64 膨胀后实际只能传 18MB，
 *    但小文件可以无限多）；
 *  · 占了多少盘没人知道，也没法做容量报表。
 *
 * 这里把「解码 → 大小 → 魔数 → 磁盘水位 → 记账 → 落盘」收成一条路径，
 * 失败时回滚配额。所有参数都必须显式给出 scope：写进用户上传域还是项目域，
 * 决定了它占不占用户的硬配额。
 */

export class MediaWriteError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** 从 `data:image/png;base64,xxx` 或裸 base64 里取出字节 */
export function decodeBase64(input: string): Buffer {
  if (typeof input !== "string" || !input) throw new MediaWriteError("缺少文件内容");
  const marker = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,/i.exec(input);
  const payload = marker ? input.slice(marker[0].length) : input;
  // 只保留合法 base64 字符，避免换行/空白导致解码出垃圾
  const cleaned = payload.replace(/[^A-Za-z0-9+/=]/g, "");
  if (!cleaned) throw new MediaWriteError("文件内容为空");
  return Buffer.from(cleaned, "base64");
}

/** 从 data URL 的 mime 推断扩展名；推不出来就返回空串 */
export function extFromDataUrl(input: string): string {
  const marker = /^data:([^;,]+)?;base64,/i.exec(input);
  const mime = marker?.[1]?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/aiff": "aiff",
    "audio/x-aiff": "aiff",
  };
  return map[mime] ?? "";
}

/** 按文件头逐个试白名单，得出真实类型。只信内容，不信声明。 */
export function detectMediaExt(buffer: Buffer): string | null {
  const candidates = ["png", "jpg", "webp", "gif", "mp4", "m4a", "webm", "mp3", "wav", "flac", "aiff"];
  for (const ext of candidates) {
    if (isAllowedMedia(buffer, ext)) return ext;
  }
  return null;
}

export interface SaveMediaInput {
  userId: number;
  /** canvas 域占用户硬配额；project / onestop 只记账 */
  scope: StorageScope;
  /**
   * oss 相对路径。传函数时会在确定实际类型后调用，
   * 用于 autoDetect 场景（浏览器声明的 mime 未必准确）。
   */
  relPath: string | ((ext: string) => string);
  /** data URL 或裸 base64 */
  base64: string;
  /** 期望的扩展名。开启 autoDetect 时只作提示 */
  ext?: string;
  /**
   * 以文件头为准决定类型（用于用户上传：浏览器给的 mime 可能是 jpg 而声明成 png）。
   * 关闭时声明与内容不符直接拒绝（用于扩展名由客户端显式指定的场景）。
   */
  autoDetect?: boolean;
  isAdmin?: boolean;
  maxBytes?: number;
}

/**
 * 解码并落盘。
 *
 * 顺序很重要：先校验再记账，记账成功才写盘，写盘失败回滚记账 ——
 * 保证「记账」与「磁盘上真的有这个文件」始终一致。
 */
export async function saveBase64Media(input: SaveMediaInput): Promise<{ bytes: number; ext: string; relPath: string }> {
  const { userId, scope, base64, isAdmin = false } = input;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new MediaWriteError("未登录", 401);

  const buffer = decodeBase64(base64);
  const limit = Math.min(input.maxBytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES);
  if (buffer.length > limit) {
    throw new MediaWriteError(`文件超过 ${Math.floor(limit / 1024 / 1024)}MB 上限`, 413);
  }
  if (buffer.length === 0) throw new MediaWriteError("文件内容为空");

  const declared = String(input.ext || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const declaredOk = Boolean(declared) && isAllowedMedia(buffer, declared);

  let ext = declared;
  if (!declaredOk) {
    if (!input.autoDetect) throw new MediaWriteError("文件内容与媒体类型不匹配", 400);
    const detected = detectMediaExt(buffer);
    if (!detected) throw new MediaWriteError("文件内容不是受支持的媒体类型", 400);
    ext = detected;
  }

  const relPath = typeof input.relPath === "function" ? input.relPath(ext) : input.relPath;

  const refused = await diskRefusal();
  if (refused) throw new MediaWriteError(refused.message, refused.status);

  await reserve(userId, buffer.length, { scope, isAdmin });

  try {
    await u.oss.writeFile(relPath, buffer);
  } catch {
    await release(userId, buffer.length, scope).catch(() => {});
    throw new MediaWriteError("文件保存失败，请重试", 500);
  }

  return { bytes: buffer.length, ext, relPath };
}
