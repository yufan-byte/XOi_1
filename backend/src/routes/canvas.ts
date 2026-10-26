import express from "express";
import crypto from "node:crypto";
import { canvasFiles } from "@/lib/workspace/canvasStore";
const router = express.Router();
const owner = (req: express.Request) => Number((req as any).user?.id);
const record = (v: any) => ({
  id: v.id,
  title: v.title || "未命名画布",
  icon: v.icon || "layers",
  kind: v.kind || "classic",
  format: v.settings?.atelier ? "atelier" : "legacy",
  owner: v.owner || "",
  color: v.color || "",
  pinned: !!v.pinned,
  userId: v.userId,
  created_at: v.created_at,
  updated_at: v.updated_at,
  revision: v.revision,
});
const route =
  (run: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await run(req, res);
    } catch (e: any) {
      if (e.status)
        return res
          .status(e.status)
          .json({ detail: e.message, message: e.message });
      next(e);
    }
  };
const get = async (req: express.Request, deleted = false) => {
  const value = await canvasFiles.get(
    String(req.params.id),
    owner(req),
    deleted,
  );
  if (!value)
    throw Object.assign(new Error("画布不存在或已删除"), { status: 404 });
  return value;
};
router.get(
  "/",
  route(async (req, res) =>
    res.json({ canvases: (await canvasFiles.listMetadata(owner(req))).map(record) }),
  ),
);
router.get(
  "/trash",
  route(async (req, res) =>
    res.json({
      canvases: (await canvasFiles.listMetadata(owner(req), true))
        .filter((v) => v.deleted_at)
        .map(record),
      retention_days: 30,
    }),
  ),
);
router.post(
  "/",
  route(async (req, res) => {
    const body = req.body || {},
      smart = body.kind === "smart";
    const canvas = await canvasFiles.create(
      {
        id: crypto.randomUUID().replace(/-/g, ""),
        title: String(body.title || (smart ? "智能画布" : "未命名画布")).slice(
          0,
          80,
        ),
        icon: String(body.icon || (smart ? "sparkles" : "layers")).slice(0, 32),
        kind: smart ? "smart" : "classic",
        created_at: Date.now(),
        nodes: [],
        connections: [],
        viewport: { x: 0, y: 0, scale: 1 },
        logs: [],
        settings: {},
      },
      owner(req),
    );
    res.json({ canvas });
  }),
);
router.get(
  "/:id",
  route(async (req, res) => res.json({ canvas: await get(req) })),
);
router.put(
  "/:id",
  route(async (req, res) => {
    const body = req.body || {};
    const canvas = await canvasFiles.update(
      String(req.params.id),
      owner(req),
      { revision: body.base_revision, timestamp: body.base_updated_at },
      (v) => ({
        ...v,
        title: String(body.title || v.title || "未命名画布").slice(0, 80),
        icon: String(body.icon || v.icon || "layers").slice(0, 32),
        nodes: body.nodes ?? v.nodes,
        connections: body.connections ?? v.connections,
        viewport: body.viewport ?? v.viewport,
        logs: (body.logs ?? v.logs ?? []).slice(-500),
        settings: body.settings ?? v.settings,
      }),
    );
    res.json({ canvas });
  }),
);
router.delete(
  "/:id",
  route(async (req, res) => {
    await canvasFiles.command(
      String(req.params.id),
      owner(req),
      (v) => ({ ...v, deleted_at: v.deleted_at || Date.now() }),
      true,
    );
    res.json({ ok: true });
  }),
);
router.post(
  "/:id/restore",
  route(async (req, res) => {
    const canvas = await canvasFiles.command(
      String(req.params.id),
      owner(req),
      (v) => {
        delete v.deleted_at;
        return v;
      },
      true,
    );
    res.json({ canvas });
  }),
);
router.delete(
  "/:id/purge",
  route(async (req, res) => {
    await canvasFiles.command(
      String(req.params.id),
      owner(req),
      (v) => ({
        id: v.id,
        userId: v.userId,
        created_at: v.created_at,
        deleted_at: Date.now(),
        purged: true,
      }),
      true,
    );
    res.json({ ok: true });
  }),
);
router.get(
  "/:id/meta",
  route(async (req, res) => res.json(record(await get(req)))),
);
router.post(
  "/:id/meta",
  route(async (req, res) => {
    const body = req.body || {};
    const canvas = await canvasFiles.command(
      String(req.params.id),
      owner(req),
      (v) => {
        if (body.title !== undefined)
          v.title = String(body.title || "未命名画布").slice(0, 80);
        if (body.icon !== undefined)
          v.icon = String(body.icon || "layers").slice(0, 32);
        if (body.owner !== undefined)
          v.owner = String(body.owner).trim().slice(0, 40);
        if (body.color !== undefined)
          v.color = String(body.color || "")
            .trim()
            .toLowerCase();
        if (body.pinned !== undefined) v.pinned = !!body.pinned;
        if (v.settings?.atelier?.project)
          v.settings.atelier.project.title = v.title;
        return v;
      },
    );
    res.json({ canvas: record(canvas) });
  }),
);
router.post(
  "/:id/touch",
  route(async (req, res) => {
    const canvas = await canvasFiles.command(
      String(req.params.id),
      owner(req),
      (v) => v,
    );
    res.json({ canvas: record(canvas), updated_at: canvas.updated_at });
  }),
);
export default router;
