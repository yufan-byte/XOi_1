import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { v4 as uuidv4 } from "uuid";
import getPath from "@/utils/getPath";
import { isAllowedMedia } from "@/utils/mediaSecurity";
import { diskRefusal } from "@/utils/storageGuard";
import {
  formatBytes,
  getTotalUsage,
  getUsage,
  release,
  reserve,
  userCanvasDir,
  MAX_FILE_BYTES,
  StorageQuotaError,
} from "@/utils/storageUsage";
import { sharedRateLimiter } from "@/middleware/sharedRateLimiter";
import { touchCanvasMedia } from "@/lib/workspace/storageSweep";

const router = express.Router();

// 画布文件（图片/视频/音频）存储：落在 oss 静态目录子目录下，由 /oss 中间件伺服。
// 该中间件虽然挂载早于路由级 JWT，但会用 privateMedia.canReadMedia 按
// `/canvas-files/{uid}/` 前缀校验归属 —— 不是「无需鉴权」，是「按目录判租户」。
const FILES_DIR = path.join(getPath("oss"), "canvas-files");

// 允许的扩展名（与 JWT 豁免扩展名规则对齐 + 音频）
const EXT_WHITELIST = new Set(["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mp3", "wav"]);

/** 32 位十六进制文件名 + 白名单扩展名，删除时严格校验 */
const FILE_NAME_RE = /^([a-f0-9]{32})\.(png|jpe?g|webp|gif|mp4|webm|mp3|wav)$/;

/**
 * 每用户上传频率：30 次 / 分钟（与造物 upload-quota.ts 的 UPLOADS_PER_MINUTE 同口径）。
 *
 * 原来这里是「全站同时只允许 4 个上传 + 同一用户串行」，在 Web 多用户场景下
 * 4 就是天花板，而且用户开两个标签页上传，第二个直接被 429。
 * 上传是 IO 密集而非 CPU 密集，用频率限制 + 配额就够，不需要全局信号量。
 */
const uploadLimiter = sharedRateLimiter("canvas-upload", 60_000, 30, (req) =>
  String((req as any).user?.id ?? req.ip ?? "unknown"),
);

/**
 * POST /api/canvas-files?ext=png — 二进制正文直传。
 *
 * 改成流式落盘后不再走 express.raw：128MB 全缓冲 × 并发数是内存炸弹
 * （原来 4 并发峰值约 512MB），流式只保留前 16 字节做魔数校验，峰值几十 KB。
 */
router.post("/", uploadLimiter, async (req, res) => {
  const ext = String(req.query.ext || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!EXT_WHITELIST.has(ext)) {
    return res.status(400).json({ detail: "不支持的文件类型" });
  }

  const userId = Number((req as any).user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json({ detail: "未登录" });
  const isAdmin = (req as any).user?.role === "admin";

  // 1) 磁盘水位：盘满时业务库与 new-api 会一起写不进去，这层必须先拦
  const refused = await diskRefusal();
  if (refused) return res.status(refused.status).json({ detail: refused.message });

  // 2) 配额预检：用声明的长度快速失败，避免白写一遍再删
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > 0) {
    try {
      const usage = await getUsage(userId);
      if (!isAdmin && usage.bytes + declared > usage.quotaBytes) {
        return res.status(413).json({
          detail: `空间不足：已用 ${formatBytes(usage.bytes)} / 上限 ${formatBytes(usage.quotaBytes)}，请先删除不用的素材`,
        });
      }
    } catch {
      return res.status(503).json({ detail: "存储配额暂时不可用，请稍后重试" });
    }
  }

  // 3) 流式落盘：先写 .part，全部校验通过后再原子 rename
  const directory = userCanvasDir(userId);
  await fsp.mkdir(directory, { recursive: true });
  const name = `${uuidv4().replace(/-/g, "")}.${ext}`;
  const finalPath = path.join(directory, name);
  const tempPath = `${finalPath}.${uuidv4().slice(0, 8)}.part`;

  let head = Buffer.alloc(0);
  let size = 0;
  let oversize = false;

  const meter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      size += chunk.length;
      if (size > MAX_FILE_BYTES) {
        oversize = true;
        return callback(new Error("文件超过 128MB 上限"));
      }
      if (head.length < 16) {
        head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(req, meter, fs.createWriteStream(tempPath, { flags: "wx" }));
  } catch {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    if (oversize) return res.status(413).json({ detail: "文件超过 128MB 上限" });
    return res.status(400).json({ detail: "上传中断，请重试" });
  }

  if (!size) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    return res.status(400).json({ detail: "空文件" });
  }
  // 魔数校验：扩展名是客户端给的，只有文件头能证明它真的是这个类型
  if (!isAllowedMedia(head, ext)) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    return res.status(400).json({ detail: "文件内容与媒体类型不匹配" });
  }

  // 4) 精确记账：按实际写入字节（Content-Length 可能缺失或被伪造）
  try {
    await reserve(userId, size, { scope: "canvas", isAdmin });
  } catch (e) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    if (e instanceof StorageQuotaError) return res.status(e.status).json({ detail: e.message });
    return res.status(503).json({ detail: "存储配额暂时不可用，请稍后重试" });
  }

  try {
    await fsp.rename(tempPath, finalPath);
  } catch {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    await release(userId, size).catch(() => {});
    return res.status(500).json({ detail: "保存失败，请重试" });
  }

  return res.json({ url: `/oss/canvas-files/${userId}/${name}`, bytes: size, name });
});

/**
 * DELETE /api/canvas-files/:name — 删除自己的画布素材。
 *
 * 补这个接口的原因：原来只有 POST，1GB 上限一旦打满，用户没有任何办法释放空间，
 * 上传永远 413 且不知道删什么。没有出口的配额等于没有配额。
 */
router.delete("/:name", async (req, res) => {
  const userId = Number((req as any).user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json({ detail: "未登录" });

  const match = FILE_NAME_RE.exec(String(req.params.name));
  if (!match) return res.status(400).json({ detail: "文件名无效" });

  const directory = userCanvasDir(userId);
  const target = path.join(directory, match[0]);

  try {
    // realpath 比对：防止目录里存在符号链接把别人账号的文件指过来
    const realDir = await fsp.realpath(directory);
    const realTarget = await fsp.realpath(target);
    if (realTarget !== target || !realTarget.startsWith(`${realDir}${path.sep}`)) {
      return res.status(403).json({ detail: "无权删除该文件" });
    }
    const stat = await fsp.stat(realTarget);
    if (!stat.isFile()) return res.status(400).json({ detail: "目标不是文件" });
    await fsp.unlink(realTarget);
    await release(userId, stat.size).catch(() => {});
    return res.json({ deleted: true, bytes: stat.size });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return res.status(404).json({ detail: "文件不存在" });
    return res.status(500).json({ detail: "删除失败，请重试" });
  }
});

/** GET /api/canvas-files/usage — 我的空间（用量条与清理入口） */
router.get("/usage", async (req, res) => {
  const userId = Number((req as any).user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json({ detail: "未登录" });
  try {
    const canvas = await getUsage(userId, "canvas");
    const total = await getTotalUsage(userId);
    return res.json({
      // 配额口径只算 canvas 域：这是用户能自己清的那部分
      usedBytes: canvas.bytes,
      quotaBytes: canvas.quotaBytes,
      fileCount: canvas.fileCount,
      usedRatio: canvas.quotaBytes > 0 ? Math.min(1, canvas.bytes / canvas.quotaBytes) : 0,
      // 全站口径给「我的空间」明细用：生成物不限额，但要让人看得到
      totalBytes: total.bytes,
      totalFileCount: total.fileCount,
      byScope: total.byScope,
    });
  } catch {
    return res.status(503).json({ detail: "用量暂时不可用" });
  }
});

/**
 * POST /api/canvas-files/touch — 素材续期。
 *
 * 画布项目的内容只在用户打开/保存时才会被读到。回收任务看不到「用户还想留着」这个意图，
 * 只能靠前端在打开、保存项目时把素材的 mtime 刷新成现在，回收从这一刻重新计时。
 * 不调这个接口也不会有数据风险（默认 TTL 30 天），只是长期不打开的项目素材会被清掉。
 */
router.post("/touch", async (req, res) => {
  const userId = Number((req as any).user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json({ detail: "未登录" });

  const raw = (req.body?.urls ?? req.body?.names) as unknown;
  if (!Array.isArray(raw) || raw.length > 200) return res.status(400).json({ detail: "续期列表无效（最多 200 项）" });

  const names: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    // 接受 /oss/canvas-files/{uid}/{name} 形式，也接受纯文件名
    const pathMatch = /\/canvas-files\/([1-9]\d*)\/([a-f0-9]{32}\.[a-z0-9]+)$/i.exec(item);
    if (pathMatch) {
      if (Number(pathMatch[1]) !== userId) continue; // 只续期自己的
      names.push(pathMatch[2]);
      continue;
    }
    if (FILE_NAME_RE.test(item)) names.push(item);
  }

  const touched = await touchCanvasMedia(userId, names);
  return res.json({ touched });
});

export default router;

export { FILES_DIR, EXT_WHITELIST };
