import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import express from "express";
import { once } from "node:events";
import {
  assertNativeDirectorProject,
  assertDirectorReference,
} from "../../../shared/directorProject";
import { directorReferenceGraph } from "../../../shared/directorCanvas";
import { createDirectorSceneRouter } from "../lib/workspace/directorRouter";
const camera = {
    position: [0, 2, 6],
    rotation: [0, 0, 0],
    focalLength: 35,
    aspectRatio: "16:9",
  },
  actor = {
    id: "lead",
    name: "主角",
    type: "person",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  shot = {
    id: "shot-1",
    name: "镜头1",
    fps: 24,
    durationSeconds: 5,
    objects: [actor],
    camera,
    keyframes: [],
    objectKeyframes: {},
    lighting: {},
    reference: {},
  };
const project = {
  version: 16,
  settings: { fps: 24, durationSeconds: 5 },
  activeShotId: shot.id,
  shots: [shot],
  objects: [actor],
  camera,
  keyframes: [],
  objectKeyframes: {},
};
const reference = {
  schemaVersion: 1 as const,
  link: {
    schemaVersion: 1 as const,
    sceneId: "director3d-u501-test",
    shotId: shot.id,
    revision: 3,
    sceneName: "场景1",
    shotName: shot.name,
    fps: 24,
    durationSeconds: 5,
    aspectRatio: "16:9",
    frame: 48,
  },
  snapshot: project,
};
test("portable reference keeps one confirmed shot, version, frame and original snapshot", () => {
  assertNativeDirectorProject(project);
  assertDirectorReference(reference, 501);
  assert.throws(() => assertDirectorReference(reference, 502));
  assert.throws(() =>
    assertDirectorReference(
      { ...reference, link: { ...reference.link, shotId: "missing" } },
      501,
    ),
  );
  const before = JSON.stringify(reference),
    graph = directorReferenceGraph(reference, {
      url: "/oss/canvas-files/501/fixture.png",
      width: 1280,
      height: 720,
    });
  assert.equal(JSON.stringify(reference), before);
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edges.length, 3);
  assert.equal(graph.nodes[0].type, "director");
  assert.equal((graph.nodes[0].data.directorProject as any).link.revision, 3);
  assert.ok(!("prompt" in graph));
  assert.ok(!("prompt" in graph.nodes[3].data));
  assert.equal(graph.nodes[3].data.duration, 5);
  for (const n of graph.nodes)
    assert.deepEqual(n.data.directorSource, {
      sceneId: reference.link.sceneId,
      shotId: shot.id,
      revision: 3,
      frame: 48,
    });
});
test("corrupt geometry and ambiguous projects are rejected before native restoration", () => {
  for (const mutate of [
    (p: any) => (p.objects[0].position = [NaN, 0, 0]),
    (p: any) => p.shots.push({ ...p.shots[0] }),
    (p: any) => (p.activeShotId = "absent"),
    (p: any) => (p.shots[0].durationSeconds = -1),
  ]) {
    const p = structuredClone(project);
    mutate(p);
    assert.throws(() => assertNativeDirectorProject(p));
  }
});
test("scene API persists across clients, isolates owners, rejects stale saves and tombstones explicit deletions", async (t) => {
  const db = knex({
    client: "better-sqlite3",
    connection: { filename: ":memory:" },
    useNullAsDefault: true,
  });
  await db.schema.createTable("xoi_workspace_documents", (s) => {
    s.increments("id");
    s.integer("user_id");
    s.string("kind");
    s.string("document_id");
    s.string("title");
    s.integer("revision");
    s.bigInteger("updated_at");
    s.text("payload");
    s.unique(["user_id", "kind", "document_id"]);
  });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    (req as any).user = { id: Number(req.get("x-fixture-owner")) };
    next();
  });
  app.use("/api/director-scenes", await createDirectorSceneRouter(db, false));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.destroy();
  });
  const call = (method: string, path = "", body?: unknown, owner = 501) =>
    fetch(`http://127.0.0.1:${port}/api/director-scenes${path}`, {
      method,
      headers: {
        "x-fixture-owner": String(owner),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const id = "/director3d-u501-test";
  assert.equal((await call("GET", id, undefined, 0)).status, 401);
  assert.equal((await call("GET", id, undefined, 502)).status, 404);
  const input = {
    revision: 0,
    title: "云端原稿",
    payload: { schemaVersion: 1, project },
  };
  assert.equal((await call("PUT", id, input)).status, 200);
  let value = await (await call("GET", id)).json();
  assert.equal(value.data.revision, 1);
  assert.deepEqual(value.data.payload.project, project);
  assert.equal((await (await call("GET")).json()).data.length, 1);
  assert.equal((await call("PUT", id, input)).status, 409);
  assert.equal(
    (
      await call("PUT", id, {
        ...input,
        revision: 1,
        payload: { schemaVersion: 1, project: {} },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("PUT", id, { ...input, revision: 1 }, 502)).status,
    404,
  );
  const concurrent = await Promise.all([
    call("PUT", id, { ...input, revision: 1, title: "客户端A" }),
    call("PUT", id, { ...input, revision: 1, title: "客户端B" }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await call("DELETE", id, { revision: 1 })).status, 409);
  assert.equal((await call("DELETE", id, { revision: 2 })).status, 200);
  assert.equal((await call("GET", id)).status, 410);
  assert.equal((await (await call("GET")).json()).data.length, 0);
  assert.equal((await call("PUT", id, input)).status, 410);
  assert.equal((await call("GET", id, undefined, 502)).status, 404);
    const raceId = '/director3d-u501-delete-race';
    assert.equal((await call('PUT', raceId, input)).status, 200);
    const racing = await Promise.all([call('DELETE', raceId, {revision:1}), call('PUT', raceId, input)]);
    assert.equal(racing[0].status, 200);
    assert.ok([409,410].includes(racing[1].status));
    assert.equal((await call('GET', raceId)).status, 410);

});
