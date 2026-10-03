import express from "express";
import fs from "fs";
import path from "path";

/**
 * atelier 上游编辑器的账号同步协议兼容层。
 *
 * 上游组件固定调用 /api/v1/user-config 与 /api/v1/canvas/projects；XOi 的
 * 正式画布存储则位于 /api/canvases。这里把上游项目原文嵌入同一份画布 JSON，
 * 从而保留完整字段，又让主站资产/回收站仍能识别这些画布。
 */
const router = express.Router();
const CANVAS_DIR = path.join(__dirname, "../../data/canvases");

const ok = (res: express.Response, data: unknown) => res.json({ code: 0, msg: "", data });
const fail = (res: express.Response, status: number, msg: string) => res.status(status).json({ code: status, msg, data: null });

function userIdOf(req: express.Request): number {
  return Number((req as any).user?.id) || 0;
}

function safeId(value: unknown): string {
  const id = String(value || "").trim();
  return id && !/[^a-zA-Z0-9_-]/.test(id) ? id : "";
}

function filePath(id: string): string {
  return path.join(CANVAS_DIR, `${id}.json`);
}

function readStored(id: string): any | null {
  const clean = safeId(id);
  if (!clean) return null;
  const target = filePath(clean);
  if (!fs.existsSync(target)) return null;
  try { return JSON.parse(fs.readFileSync(target, "utf8")); } catch { return null; }
}

function writeStored(project: any, userId: number): any {
  const id = safeId(project?.id);
  const createdAt = String(project?.createdAt || "").trim();
  const updatedAt = String(project?.updatedAt || "").trim();
  if (!id || !createdAt || !updatedAt) throw new Error("画布项目数据无效");

  fs.mkdirSync(CANVAS_DIR, { recursive: true });
  const previous = readStored(id);
  if (previous && Number(previous.userId || 1) !== userId) throw new Error("画布项目不存在");
  const stored = {
    ...(previous || {}),
    id,
    title: String(project.title || "未命名画布").slice(0, 80),
    icon: previous?.icon || "atelier",
    kind: previous?.kind || "classic",
    userId,
    created_at: Number.isFinite(Date.parse(createdAt)) ? Date.parse(createdAt) : Date.now(),
    updated_at: Number.isFinite(Date.parse(updatedAt)) ? Date.parse(updatedAt) : Date.now(),
    nodes: Array.isArray(project.nodes) ? project.nodes : [],
    connections: Array.isArray(project.connections) ? project.connections : [],
    viewport: project.viewport || { x: 0, y: 0, k: 1 },
    settings: {
      ...(previous?.settings || {}),
      atelier: { ...(previous?.settings?.atelier || {}), project },
    },
  };
  delete stored.deleted_at;
  const target = filePath(id);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(stored, null, 2), "utf8");
  fs.renameSync(temp, target);
  return project;
}

function listProjects(userId: number): any[] {
  if (!fs.existsSync(CANVAS_DIR)) return [];
  return fs.readdirSync(CANVAS_DIR)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const stored = JSON.parse(fs.readFileSync(path.join(CANVAS_DIR, name), "utf8"));
        const project = stored?.settings?.atelier?.project;
        return !stored.deleted_at && Number(stored.userId || 1) === userId && project ? [project] : [];
      } catch { return []; }
    })
    .sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
}

router.get("/user-config", (_req, res) => {
  ok(res, { syncCapabilities: { userData: true, workflows: false, assets: false } });
});

router.get("/canvas/projects", (req, res) => ok(res, listProjects(userIdOf(req))));

router.post("/canvas/projects", (req, res) => {
  try { ok(res, writeStored(req.body?.data, userIdOf(req))); }
  catch (error) { fail(res, 400, (error as Error).message); }
});

router.post("/canvas/projects/sync", (req, res) => {
  try {
    const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
    for (const project of projects) writeStored(project, userIdOf(req));
    ok(res, listProjects(userIdOf(req)));
  } catch (error) { fail(res, 400, (error as Error).message); }
});

router.post("/canvas/projects/delete", (req, res) => {
  const userId = userIdOf(req);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(safeId).filter(Boolean) : [];
  if (!ids.length) return fail(res, 400, "画布项目参数无效");
  for (const id of ids) {
    const stored = readStored(id);
    if (!stored || Number(stored.userId || 1) !== userId) continue;
    stored.deleted_at = Date.now();
    stored.updated_at = Date.now();
    fs.writeFileSync(filePath(id), JSON.stringify(stored, null, 2), "utf8");
  }
  return ok(res, { deleted: true });
});

// 生成任务由 XOi 的计费任务表自行过期；项目删除时这里只需确认清理请求，避免上游反复重试。
router.post("/canvas/tasks/delete", (_req, res) => ok(res, { deleted: true }));

export default router;
