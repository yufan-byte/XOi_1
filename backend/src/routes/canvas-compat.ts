import express from "express";
import { canvasFiles } from "@/lib/workspace/canvasStore";
import { canvasError } from "@/lib/workspace/canvasFiles";
const router = express.Router();
const owner = (req: express.Request) => Number((req as any).user?.id);
const ok = (res: express.Response, data: unknown) =>
  res.json({ code: 0, msg: "", data });
const fail = (res: express.Response, e: any) =>
  res
    .status(e.status || 500)
    .json({
      code: e.status || 500,
      msg: e.status ? e.message : "画布保存暂不可用，本机修改仍保留",
      data: null,
    });
const toProject = (value: any) => ({
  ...value.settings.atelier.project,
  cloudRevision: Number(value.revision || 0),
  cloudPending: false,
  cloudConflict: false,
});
async function list(uid: number) {
  return (await canvasFiles.list(uid))
    .filter((v) => v.settings?.atelier?.project)
    .map(toProject);
}
async function save(project: any, uid: number) {
  if (
    !project ||
    typeof project.id !== "string" ||
    !Number.isFinite(Date.parse(project.createdAt)) ||
    !Number.isFinite(Date.parse(project.updatedAt))
  )
    throw canvasError("画布项目数据无效", 400);
  const previous = await canvasFiles.get(project.id, uid, true);
  const change = (value: any) => ({
    ...value,
    title: String(project.title || "未命名画布").slice(0, 80),
    nodes: Array.isArray(project.nodes) ? project.nodes : [],
    connections: Array.isArray(project.connections) ? project.connections : [],
    viewport: project.viewport || { x: 0, y: 0, k: 1 },
    settings: {
      ...value.settings,
      atelier: {
        ...value.settings?.atelier,
        project: structuredClone(project),
      },
    },
  });
  const value = previous
    ? await canvasFiles.update(
        project.id,
        uid,
        { revision: project.cloudRevision },
        change,
      )
    : await canvasFiles.create(
        change({
          id: project.id,
          icon: "atelier",
          kind: "classic",
          created_at: Date.parse(project.createdAt),
          settings: {},
        }),
        uid,
      );
  return toProject(value);
}
router.get("/user-config", (_req, res) =>
  ok(res, {
    syncCapabilities: { userData: true, workflows: false, assets: false },
  }),
);
router.get("/canvas/projects", async (req, res) => {
  try {
    ok(res, await list(owner(req)));
  } catch (e) {
    fail(res, e);
  }
});
router.post("/canvas/projects", async (req, res) => {
  try {
    ok(res, await save(req.body?.data, owner(req)));
  } catch (e) {
    fail(res, e);
  }
});
router.post("/canvas/projects/sync", async (req, res) => {
  try {
    const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
    if (projects.length > 100)
      throw canvasError("单次同步最多 100 个画布，请分批保存", 413);
    for (const project of projects) await save(project, owner(req));
    ok(res, await list(owner(req)));
  } catch (e) {
    fail(res, e);
  }
});
router.post("/canvas/projects/delete", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? ([...new Set(req.body.ids.map(String))] as string[])
      : [];
    if (!ids.length || ids.length > 100)
      throw canvasError("请选择 1–100 个画布", 400);
    for (const id of ids) {
      if (await canvasFiles.get(id, owner(req), true))
        await canvasFiles.command(
          id,
          owner(req),
          (v) => ({ ...v, deleted_at: Date.now() }),
          true,
        );
    }
    ok(res, { deleted: true });
  } catch (e) {
    fail(res, e);
  }
});
router.post("/canvas/tasks/delete", (_req, res) => ok(res, { deleted: true }));
export default router;
