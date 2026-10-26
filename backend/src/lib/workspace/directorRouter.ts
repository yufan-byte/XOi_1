import express from "express";
import type { Knex } from "knex";
import { WorkspaceDocuments } from "./documents";
import { ensureWorkspaceTables } from "./schema";
import {
  assertNativeDirectorProject,
  ownedDirectorSceneId,
} from "../../../../shared/directorProject";
/** Mounted after login middleware. Scenes are never looked up without their owner. */
export async function createDirectorSceneRouter(db: Knex, initialize = true) {
  if (initialize) await ensureWorkspaceTables(db);
  const docs = new WorkspaceDocuments(db),
    router = express.Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    const id = Number((req as any).user?.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(401).json({ message: "请先登录" });
    next();
  });
  const owner = (req: any) => Number(req.user.id);
  // Serialize deletes and creates for the same account, including stale clients that still send revision 0.
  const mutate = <T>(
    userId: number,
    work: (trx: Knex.Transaction) => Promise<T>,
  ) =>
    db.transaction(async (trx) => {
      if (db.client.config.client === "pg")
        await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [
          `xoi:documents:${userId}`,
        ]);
      return work(trx);
    });
  router.get("/", async (req, res) => {
    try {
      const offset = Number(req.query.offset || 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 200)
        throw Object.assign(new Error("无效分页"), { status: 400 });
      res.json({ data: await docs.list(owner(req), "director", offset) });
    } catch (e: any) {
      res
        .status(e.status || 503)
        .json({ message: e.status ? e.message : "场景目录暂不可用" });
    }
  });
  router.get("/:id", async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!ownedDirectorSceneId(id, owner(req)))
        return res.status(404).json({ message: "场景不存在" });
      const data = await docs.get(owner(req), "director", id);
      if (!data) {
        const deleted = await db("xoi_workspace_documents")
          .where({
            user_id: owner(req),
            kind: "director-deleted",
            document_id: id,
          })
          .first("id");
        return res
          .status(deleted ? 410 : 404)
          .json({
            message: deleted ? "该场景已删除，本机副本保留" : "场景不存在",
          });
      }
      res.json({ data });
    } catch (e: any) {
      res
        .status(e.status || 503)
        .json({ message: e.status ? e.message : "场景暂不可用，本机草稿保留" });
    }
  });
  router.put("/:id", async (req, res) => {
    try {
      const id = String(req.params.id),
        b = req.body;
      if (!ownedDirectorSceneId(id, owner(req)))
        return res.status(404).json({ message: "场景不存在" });
      if (!b || b.payload?.schemaVersion !== 1)
        throw Object.assign(new Error("不支持的场景格式"), { status: 400 });
      try {
        assertNativeDirectorProject(b.payload.project);
      } catch (e: any) {
        throw Object.assign(e, { status: 400 });
      }
      const data = await mutate(owner(req), async (trx) => {
        if (
          await trx("xoi_workspace_documents")
            .where({
              user_id: owner(req),
              kind: "director-deleted",
              document_id: id,
            })
            .first("id")
        )
          throw Object.assign(new Error("该场景已删除，不能覆盖恢复"), {
            status: 410,
          });
        return new WorkspaceDocuments(trx).save(
          owner(req),
          "director",
          id,
          b.revision,
          b.title,
          b.payload,
        );
      });
      res.json({ data });
    } catch (e: any) {
      res
        .status(e.status || 503)
        .json({ message: e.status ? e.message : "场景保存失败，本机草稿保留" });
    }
  });
  router.delete("/:id", async (req, res) => {
    try {
      const id = String(req.params.id),
        revision = req.body?.revision;
      if (!ownedDirectorSceneId(id, owner(req)))
        return res.status(404).json({ message: "场景不存在" });
      if (!Number.isSafeInteger(revision) || revision < 1)
        return res.status(400).json({ message: "请先核对场景版本" });
      const count = await mutate(owner(req), (trx) =>
        trx("xoi_workspace_documents")
          .where({
            user_id: owner(req),
            kind: "director",
            document_id: id,
            revision,
          })
          .update({
            kind: "director-deleted",
            revision: revision + 1,
            updated_at: Date.now(),
          }),
      );
      if (!count)
        return res
          .status(409)
          .json({ message: "场景版本已变化，请重新确认删除" });
      res.json({ data: { deleted: true } });
    } catch {
      res.status(503).json({ message: "云端删除未确认，本机工程保留" });
    }
  });
  return router;
}
