import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveOutputAsset } from "./outputArchive";
import { MAX_OUTPUT_ARCHIVE_BYTES } from "../../../shared/outputArchivePolicy";

test("large uploaded MP4s archive without another base64 allocation, only for their owner", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "xoi-output-archive-"));
  const filename = "a".repeat(32) + ".mp4";
  const url = `/oss/canvas-files/7/${filename}`;
  const target = path.join(root, "canvas-files/7", filename);
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const header = Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex");
    await fs.writeFile(target, header);
    // Sparse file models a normal-sized short film without allocating it in the test runner.
    await fs.truncate(target, 30 * 1024 * 1024);
    const file = await resolveOutputAsset(root, 7, url);
    assert.equal(file.size, 30 * 1024 * 1024);
    assert.equal(file.filePath, `/canvas-files/7/${filename}`);
    await assert.rejects(resolveOutputAsset(root, 8, url), /当前账号/);
    for (const invalid of ["https://example.com" + url, url + "?token=x", url.replace("/7/", "/7/../7/"), url.replace(".mp4", ".html"), "/oss/canvas-files/7/" + "f".repeat(32) + ".mp4"]) {
      await assert.rejects(resolveOutputAsset(root, 7, invalid));
    }
    await fs.truncate(target, MAX_OUTPUT_ARCHIVE_BYTES + 1);
    await assert.rejects(resolveOutputAsset(root, 7, url), /归档上限/);
    await fs.writeFile(target, "<html>invalid media</html>");
    await assert.rejects(resolveOutputAsset(root, 7, url), /不是 MP4/);
    await fs.unlink(target);
    const outside = path.join(root, "outside.mp4"); await fs.writeFile(outside, header);
    await fs.symlink(outside, target);
    await assert.rejects(resolveOutputAsset(root, 7, url), /路径无效/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
