import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import getPath from "@/utils/getPath";

const router = express.Router();

// 画布文件（图片/视频/音频）存储：落在 oss 静态目录子目录下，
// 由既有的 /oss 静态中间件伺服 —— 该中间件挂载先于 JWT 校验，且图片/视频扩展名
// 本就在豁免名单里，<img>/<video> 标签无需带 token 即可加载，与旧画布静态图契约一致。
const FILES_DIR = path.join(getPath("oss"), "canvas-files");
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

// 允许的扩展名（与 JWT 豁免扩展名规则对齐 + 音频）
const EXT_WHITELIST = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "mp4", "webm", "mp3", "wav"]);

// POST /api/canvas-files?ext=png — 二进制正文直传，JWT 由全局中间件强制（此路径无扩展名豁免）
router.post("/", express.raw({ type: "*/*", limit: "128mb" }), (req, res) => {
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
  const name = `${uuidv4().replace(/-/g, "")}.${ext}`;
  fs.writeFileSync(path.join(FILES_DIR, name), req.body);
  res.json({ url: `/oss/canvas-files/${name}`, bytes: req.body.length });
});

export default router;
