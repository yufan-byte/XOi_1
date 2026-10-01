import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// 画布数据存储目录
const CANVAS_DIR = path.join(__dirname, "../../data/canvases");

// 确保目录存在
if (!fs.existsSync(CANVAS_DIR)) {
  fs.mkdirSync(CANVAS_DIR, { recursive: true });
}

// 当前时间戳（毫秒）
function nowMs(): number {
  return Date.now();
}

// 画布文件路径
function canvasPath(canvasId: string): string {
  const cleaned = /[^a-zA-Z0-9_-]/.test(canvasId) ? "" : canvasId;
  if (!cleaned) throw new Error("无效的画布 ID");
  return path.join(CANVAS_DIR, `${cleaned}.json`);
}

// 保存画布
function saveCanvas(canvas: any): void {
  canvas.updated_at = nowMs();
  const filePath = canvasPath(canvas.id);
  fs.writeFileSync(filePath, JSON.stringify(canvas, null, 2), "utf-8");
}

// 加载画布（未删除的）
function loadCanvas(canvasId: string): any {
  const filePath = canvasPath(canvasId);
  if (!fs.existsSync(filePath)) return null;
  const canvas = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (canvas.deleted_at) return null;
  return canvas;
}

// 加载画布（包括已删除的）
function loadCanvasAny(canvasId: string): any {
  const filePath = canvasPath(canvasId);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// 画布记录（轻量级，不含 nodes/connections）
function canvasRecord(data: any): any {
  return {
    id: data.id,
    title: data.title || "未命名画布",
    icon: data.icon || "layers",
    kind: data.kind || "classic",
    // atelier 引擎画布以 settings.atelier 打标，供新画布前端列表过滤自身格式（旧引擎画布为 legacy）
    format: data.settings?.atelier ? "atelier" : "legacy",
    owner: data.owner || "",
    color: data.color || "",
    pinned: !!data.pinned,
    userId: data.userId || null,
    created_at: data.created_at || 0,
    updated_at: data.updated_at || 0,
  };
}

// 新建画布
function newCanvas(title?: string, icon?: string, kind?: string): any {
  const timestamp = nowMs();
  const canvasKind = (kind || "").trim().toLowerCase() === "smart" ? "smart" : "classic";
  const canvas = {
    id: uuidv4().replace(/-/g, ""),
    title: (title || (canvasKind === "smart" ? "智能画布" : "未命名画布")).slice(0, 80),
    icon: (icon || (canvasKind === "smart" ? "sparkles" : "layers")).slice(0, 32),
    kind: canvasKind,
    owner: "",
    color: "",
    pinned: false,
    created_at: timestamp,
    updated_at: timestamp,
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, scale: 1 },
    logs: [],
    settings: {},
  };
  saveCanvas(canvas);
  return canvas;
}

// 列出所有画布记录（按用户过滤）
function listCanvasRecords(includeDeleted = false, userId?: number): any[] {
  if (!fs.existsSync(CANVAS_DIR)) return [];
  const files = fs.readdirSync(CANVAS_DIR).filter((f) => f.endsWith(".json"));
  const records: any[] = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CANVAS_DIR, file), "utf-8"));
      if (!includeDeleted && data.deleted_at) continue;
      // 按用户过滤：只返回属于当前用户的画布
      // 如果画布没有 userId（旧数据），则归属给 admin 用户（userId=1）
      const canvasUserId = data.userId || 1;
      if (userId && canvasUserId !== userId) continue;
      records.push(canvasRecord(data));
    } catch {
      // 跳过损坏的文件
    }
  }
  return records.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updated_at || 0) - (a.updated_at || 0);
  });
}

// ========== 画布管理路由 ==========

// GET /api/canvases — 列出未删除画布（按用户隔离）
router.get("/", (req, res) => {
  const userId = (req as any).user?.id;
  res.json({ canvases: listCanvasRecords(false, userId) });
});

// GET /api/canvases/trash — 列出已删除画布（按用户隔离）
router.get("/trash", (req, res) => {
  const userId = (req as any).user?.id;
  res.json({ canvases: listCanvasRecords(true, userId).filter((r) => loadCanvasAny(r.id)?.deleted_at), retention_days: 30 });
});

// POST /api/canvases — 创建新画布（记录 userId）
router.post("/", (req, res) => {
  const { title, icon, kind } = req.body || {};
  const userId = (req as any).user?.id;
  const canvas = newCanvas(title, icon, kind);
  if (userId) {
    canvas.userId = userId;
    saveCanvas(canvas);
  }
  res.json({ canvas });
});

// GET /api/canvases/:id — 获取单个画布
router.get("/:id", (req, res) => {
  const canvas = loadCanvas(req.params.id);
  if (!canvas) {
    res.status(404).json({ detail: "画布不存在或已在回收站" });
    return;
  }
  res.json({ canvas });
});

// PUT /api/canvases/:id — 更新画布
router.put("/:id", (req, res) => {
  const canvas = loadCanvas(req.params.id);
  if (!canvas) {
    res.status(404).json({ detail: "画布不存在" });
    return;
  }
  const { title, icon, nodes, connections, viewport, logs, settings, base_updated_at } = req.body || {};

  // 版本冲突检查
  if (base_updated_at && canvas.updated_at && base_updated_at < canvas.updated_at) {
    res.status(409).json({
      detail: "画布已被其他页面更新，已拒绝旧版本覆盖。",
      canvas,
      updated_at: canvas.updated_at,
    });
    return;
  }

  canvas.title = (title || canvas.title || "未命名画布").slice(0, 80);
  canvas.icon = (icon || canvas.icon || "layers").slice(0, 32);
  canvas.nodes = nodes ?? canvas.nodes;
  canvas.connections = connections ?? canvas.connections;
  canvas.viewport = viewport ?? canvas.viewport;
  canvas.logs = (logs ?? canvas.logs ?? []).slice(-500);
  canvas.settings = settings ?? canvas.settings ?? {};

  saveCanvas(canvas);
  res.json({ canvas });
});

// DELETE /api/canvases/:id — 软删除
router.delete("/:id", (req, res) => {
  const canvas = loadCanvasAny(req.params.id);
  if (!canvas) {
    res.status(404).json({ detail: "画布不存在" });
    return;
  }
  if (!canvas.deleted_at) {
    canvas.deleted_at = nowMs();
    saveCanvas(canvas);
  }
  res.json({ ok: true });
});

// POST /api/canvases/:id/restore — 恢复已删除画布
router.post("/:id/restore", (req, res) => {
  const canvas = loadCanvasAny(req.params.id);
  if (!canvas) {
    res.status(404).json({ detail: "画布不存在" });
    return;
  }
  if (canvas.deleted_at) {
    delete canvas.deleted_at;
    saveCanvas(canvas);
  }
  res.json({ canvas });
});

// DELETE /api/canvases/:id/purge — 永久删除
router.delete("/:id/purge", (req, res) => {
  const filePath = canvasPath(req.params.id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  res.json({ ok: true });
});

// GET /api/canvases/:id/meta — 获取元数据
router.get("/:id/meta", (req, res) => {
  const canvas = loadCanvas(req.params.id);
  if (!canvas) {
    res.status(404).json({ detail: "画布不存在" });
    return;
  }
  res.json({
    id: canvas.id,
    updated_at: canvas.updated_at || 0,
    title: canvas.title || "未命名画布",
    icon: canvas.icon || "layers",
    kind: canvas.kind || "classic",
  });
});

// POST /api/canvases/:id/meta — 更新元数据
router.post("/:id/meta", (req, res) => {
  const canvas = loadCanvas(req.params.id);
  if (!canvas) {
    res.status(404).json({ detail: "画布不存在" });
    return;
  }
  const { title, icon, owner, color, pinned } = req.body || {};
  if (title !== undefined) canvas.title = (title || canvas.title || "未命名画布").slice(0, 80);
  if (icon !== undefined) canvas.icon = (icon || "layers").slice(0, 32);
  if (owner !== undefined) canvas.owner = String(owner).trim().slice(0, 40);
  if (color !== undefined) canvas.color = String(color || "").trim().toLowerCase();
  if (pinned !== undefined) canvas.pinned = !!pinned;

  // 直接写文件，不更新 updated_at（避免置顶/标签把画布顶到最前）
  const filePath = canvasPath(canvas.id);
  fs.writeFileSync(filePath, JSON.stringify(canvas, null, 2), "utf-8");
  res.json({ canvas: canvasRecord(canvas) });
});

// POST /api/canvases/:id/touch — 更新时间戳
router.post("/:id/touch", (req, res) => {
  const canvas = loadCanvas(req.params.id);
  if (!canvas) {
    res.status(404).json({ detail: "画布不存在" });
    return;
  }
  saveCanvas(canvas);
  res.json({ canvas: canvasRecord(canvas), updated_at: canvas.updated_at });
});

export default router;
