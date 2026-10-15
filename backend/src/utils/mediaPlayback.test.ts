import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { mediaStatic } from "../middleware/mediaStatic";

test("video/audio support seeking while ranges stay bounded to a single media slice", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "xoi-media-range-"));
  const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const app = express(); app.use("/oss", mediaStatic(root));
  const server = app.listen(0, "127.0.0.1");
  try {
    for (const ext of ["mp4", "mp3", "png"]) await fs.writeFile(path.join(root, "fixture." + ext), bytes);
    if (!server.listening) await new Promise<void>(resolve => server.once("listening", resolve));
    const port = (server.address() as any).port;
    const get = (ext: string, range: string) => fetch(`http://127.0.0.1:${port}/oss/fixture.${ext}`, { headers: { Range: range } });
    for (const ext of ["mp4", "mp3"]) {
      const response = await get(ext, "bytes=16-31");
      assert.equal(response.status, 206);
      assert.equal(response.headers.get("content-range"), "bytes 16-31/256");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(16, 32));
      const suffix = await get(ext, "bytes=-8"); assert.equal(suffix.status, 206);
      assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(248));
      const outside = await get(ext, "bytes=999-1000"); assert.equal(outside.status, 416); await outside.body?.cancel();
      const multiple = await get(ext, "bytes=0-1,20-21"); assert.equal(multiple.status, 416); await multiple.body?.cancel();
    }
    const ordinary = await get("png", "bytes=0-15"); assert.equal(ordinary.status, 200);
    assert.equal((await ordinary.arrayBuffer()).byteLength, bytes.length);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
});
