import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile),
  root = await fs.mkdtemp(path.join(os.tmpdir(), "xoi-upgrade-fixture-"));
const seed = path.join(root, "seed"),
  data = path.join(root, "data");
try {
  for (const dir of [
    "serve",
    "web",
    "vendor",
    "skills",
    "modelPrompt",
    "models",
    "assets",
  ])
    await fs.mkdir(path.join(seed, dir), { recursive: true });
  for (const dir of ["vendor", "canvases", "oss"])
    await fs.mkdir(path.join(data, dir), { recursive: true });
  await fs.writeFile(path.join(seed, "serve", "app.js"), "program-v1");
  await fs.writeFile(path.join(seed, "vendor", "custom.ts"), "image-default");
  await fs.writeFile(path.join(data, "vendor", "custom.ts"), "operator-custom");
  await fs.writeFile(path.join(data, "oss", "user.txt"), "user-file");
  const execute = () =>
    run("sh", ["../docker-entrypoint.sh", "sh", "-c", "exit 0"], {
      env: {
        ...process.env,
        XOI_ASSET_SEED_DIR: seed,
        XOI_RUNTIME_DATA_DIR: data,
      },
    });
  await execute();
  await fs.writeFile(path.join(seed, "serve", "app.js"), "program-v2");
  await fs.writeFile(path.join(seed, "vendor", "new.ts"), "new-default");
  await execute();
  assert.equal(
    await fs.readFile(path.join(data, "serve", "app.js"), "utf8"),
    "program-v2",
  );
  assert.equal(
    await fs.readFile(path.join(data, "vendor", "custom.ts"), "utf8"),
    "operator-custom",
  );
  assert.equal(
    await fs.readFile(path.join(data, "vendor", "new.ts"), "utf8"),
    "new-default",
  );
  assert.equal(
    await fs.readFile(path.join(data, "oss", "user.txt"), "utf8"),
    "user-file",
  );
  console.log(
    JSON.stringify({
      passed: true,
      customConfigPreserved: true,
      programUpdated: true,
      userFilesPreserved: true,
      productionFilesTouched: 0,
    }),
  );
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
