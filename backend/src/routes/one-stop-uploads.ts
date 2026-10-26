/**
 * 扫码上传中转（/api/one-stop-uploads）
 * 手机扫码打开 /one-stop/#/upload 选文件 → POST 到这里（dataURL）→ 落 OSS；
 * 桌面的「扫码上传」弹窗轮询 GET ?since= 把新到的素材一键加进参考上传格。
 * 与 one-stop 文档路由分开挂：这里的媒体体积上限是 12MB，不是文档的 8MiB。
 */
import express from "express";
import u from "@/utils";
import { db } from "@/utils/db";

const router = express.Router();
const MAX_BYTES = 12 * 1024 * 1024;
const DATA_URL = /^data:(image|video|audio)\/[a-z0-9.+-]+;base64,/i;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg",
};

let tableReady: Promise<void> | null = null;
function ensureTable() {
  tableReady ??= (async () => {
    await db.schema.hasTable("o_one_stop_uploads").then(async (has) => {
      if (!has) {
        await db.schema.createTable("o_one_stop_uploads", (t) => {
          t.string("id", 40).primary();
          t.integer("user_id").notNullable().index();
          t.string("name", 200).notNullable();
          t.string("kind", 10).notNullable();
          t.string("url", 500).notNullable();
          t.integer("bytes").notNullable().defaultTo(0);
          t.bigInteger("created_at").notNullable();
        });
      }
    });
  })();
  return tableReady;
}

const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

router.use(express.json({ limit: MAX_BYTES + 1024 * 512 }));
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  const id = (req as express.Request & { user?: { id?: unknown } }).user?.id;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId < 1) return res.status(401).json({ success: false, message: "请先登录" });
  next();
});

/** POST { name, dataUrl } → { id, url, kind, bytes, createdAt } */
const DAILY_UPLOADS = 200;
router.post("/", async (req, res) => {
  try {
    const userId = Number((req as any).user.id);
    await ensureTable();
    const used = await db("o_one_stop_uploads").where({ user_id: userId }).andWhere("created_at", ">", Date.now() - 86400_000).count("id as n").first();
    if (Number(used?.n ?? 0) >= DAILY_UPLOADS) return res.status(429).json({ success: false, message: "今天的扫码上传已达上限（200 个/天），请明天再试或直接在电脑端上传" });
    const m = DATA_URL.exec(String(req.body?.dataUrl || ""));
    const mime = m?.[1] && m[0] ? m[0].slice(5, m[0].indexOf(";")) : "";
    if (!m || !mime) return res.status(400).json({ success: false, message: "只收图片 / 视频 / 音频文件" });
    const base64 = String(req.body.dataUrl).slice(m[0].length);
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes < 1) return res.status(400).json({ success: false, message: "文件是空的" });
    if (bytes > MAX_BYTES) return res.status(413).json({ success: false, message: `超过 ${Math.round(MAX_BYTES / 1048576)}MB 上限，请先压缩或裁短` });
    const ext = EXT[mime] ?? "bin";
    const id = uid();
    const path = `/one-stop-uploads/${userId}/${id}.${ext}`;
    await u.oss.writeFile(path, Buffer.from(base64, "base64"));
    const row = { id, user_id: userId, name: String(req.body?.name || `素材.${ext}`).slice(0, 200), kind: m[1], url: `/oss${path}`, bytes, created_at: Date.now() };
    await ensureTable();
    await db("o_one_stop_uploads").insert(row);
    res.json({ success: true, data: row });
  } catch (e: any) {
    console.error("[one-stop-uploads] 保存失败:", e?.message || e);
    res.status(500).json({ success: false, message: "上传失败，请重试" });
  }
});

/** GET ?since=毫秒 → { items: [...] }（本人最近的扫码上传，桌面端轮询用） */
router.get("/", async (req, res) => {
  try {
    const userId = Number((req as any).user.id);
    const since = Number(req.query.since) || 0;
    await ensureTable();
    const items = await db("o_one_stop_uploads")
      .where({ user_id: userId })
      .andWhere("created_at", ">", since)
      .orderBy("created_at", "desc")
      .limit(30)
      .select("id", "name", "kind", "url", "bytes", "created_at");
    res.json({ success: true, data: { items } });
  } catch (e: any) {
    console.error("[one-stop-uploads] 列表失败:", e?.message || e);
    res.status(500).json({ success: false, message: "暂时读不到上传记录，请稍后重试" });
  }
});

export default router;
