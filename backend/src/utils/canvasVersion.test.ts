import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CanvasFiles } from "../lib/workspace/canvasFiles";
test("canvas CAS rejects missing/stale versions, isolates owners and prevents deleted resurrection", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xoi-canvas-cas-"));
  const store = new CanvasFiles(directory);
  try {
    const first = await store.create(
      {
        id: "fixture",
        title: "原始",
        created_at: 1,
        settings: { atelier: { project: { id: "fixture", title: "原始" } } },
      },
      1,
    );
    assert.equal(first.revision, 1);
    assert.equal(first.settings.atelier.project.cloudRevision, 1);
    assert.equal(await store.get("fixture", 2), null);
    await assert.rejects(
      () => store.update("fixture", 2, { revision: 1 }, (v) => v),
      (e: any) => e.status === 404,
    );
    await assert.rejects(
      () => store.update("fixture", 1, {}, (v) => v),
      (e: any) => e.status === 409,
    );
    const concurrent = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        store.update("fixture", 1, { revision: 1 }, (v) => ({
          ...v,
          title: "新版本",
        })),
      ),
    );
    assert.equal(concurrent.filter((v) => v.status === "fulfilled").length, 1);
    assert.equal((await store.get("fixture", 1)).revision, 2);
    await store.command("fixture", 1, (v) => ({
      ...v,
      deleted_at: Date.now(),
    }));
    await assert.rejects(() =>
      store.update("fixture", 1, { revision: 2 }, (v) => v),
    );
    await assert.rejects(() => store.create({ id: "fixture" }, 1));
    await store.command(
      "fixture",
      1,
      (v) => {
        delete v.deleted_at;
        return v;
      },
      true,
    );
    assert.equal((await store.get("fixture", 1)).revision, 4);
    await store.command(
      "fixture",
      1,
      (v) => ({ id: v.id, userId: 1, purged: true, deleted_at: Date.now() }),
      true,
    );
    assert.equal(await store.get("fixture", 1, true), null);
    await assert.rejects(() => store.create({ id: "fixture" }, 1));
    assert.equal((await store.list(1, true)).length, 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("legacy files migrate their revision on first valid owner save, preserving original files", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "xoi-canvas-legacy-"),
  );
  try {
    await fs.writeFile(
      path.join(directory, "legacy.json"),
      JSON.stringify({
        id: "legacy",
        userId: 1,
        updated_at: 100,
        title: "旧作品",
      }),
    );
    const store = new CanvasFiles(directory);
    const saved = await store.update("legacy", 1, { timestamp: 100 }, (v) => ({
      ...v,
      title: "更新",
    }));
    assert.equal(saved.revision, 1);
    assert.equal(
      (await new CanvasFiles(directory).get("legacy", 1)).title,
      "更新",
    );
    await assert.rejects(() =>
      store.update("legacy", 1, { timestamp: 100 }, (v) => v),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
