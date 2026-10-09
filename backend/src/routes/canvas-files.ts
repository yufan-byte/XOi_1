import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import getPath from "@/utils/getPath";
import { isAllowedMedia } from "@/utils/mediaSecurity";

const router = express.Router();

// 画布文件（图片/视频/音频）存储：落在 oss 静态目录子目录下，
// 由既有的 /oss 静态中间件伺服 —— 该中间件挂载先于 JWT 校验，且图片/视频扩展名
// 本就在豁免名单里，<img>/<video> 标签无需带 token 即可加载，与旧画布静态图契约一致。
const FILES_DIR = path.join(getPath("oss"), "canvas-files");
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

// 允许的扩展名（与 JWT 豁免扩展名规则对齐 + 音频）
const EXT_WHITELIST = new Set(["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mp3", "wav"]);

// POST /api/canvas-files?ext=png — 二进制正文直传，JWT 由全局中间件强制（此路径无扩展名豁免）
let uploadsInFlight = 0;
const activeUploadUsers = new Set<number>();
router.post("/", (_req, res, next) => {
  const userId = Number((_req as any).user?.id);
  if (activeUploadUsers.has(userId)) return res.status(429).json({ detail: "请等待当前上传完成" });
  if (uploadsInFlight >= 4) return res.status(429).json({ detail: "上传繁忙，请稍后重试" });
  uploadsInFlight++;
  activeUploadUsers.add(userId);
  let released = false;
  const release = () => { if (!released) { released = true; uploadsInFlight--; activeUploadUsers.delete(userId); } };
  res.once("finish", release);
  res.once("close", release);
  next();
}, express.raw({ type: "*/*", limit: "128mb" }), async (req, res) => {
  const ext = String(req.query.ext || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!EXT_WHITELIST.has(ext)) {
    res.status(400).json({ detail: "不支持的文件类型" });
    return;
  }
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({ detail: "空文件" });
    return;
  }
  if (!isAllowedMedia(req.body, ext)) return res.status(400).json({ detail: "文件内容与媒体类型不匹配" });
  const userId = Number((req as any).user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json({ detail: "未登录" });
  const directory = path.join(FILES_DIR, String(userId));
  await fs.promises.mkdir(directory, { recursive: true });
  const files = await fs.promises.readdir(directory, { withFileTypes: true });
  const sizes = await Promise.all(files.filter((file) => file.isFile()).map(async (file) => (await fs.promises.stat(path.join(directory, file.name))).size));
  if (files.length >= 5000 || sizes.reduce((total, size) => total + size, req.body.length) > 1024 * 1024 * 1024) {
    return res.status(413).json({ detail: "画布上传空间已达 1GB 上限" });
  }
  const name = `${uuidv4().replace(/-/g, "")}.${ext}`;
  await fs.promises.writeFile(path.join(directory, name), req.body, { flag: "wx" });
  res.json({ url: `/oss/canvas-files/${userId}/${name}`, bytes: req.body.length });
});

export default router;
