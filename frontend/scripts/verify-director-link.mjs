// Native 3D + Vue + React browser integration. All accounts, cloud writes and uploads are isolated fixtures.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
const { chromium } =
  await import(process.env.XOI_PLAYWRIGHT_MODULE || "playwright");
const root = process.env.XOI_FRONTEND_DIST_DIR || "/tmp/xoi-director-link-web",
  atelier = process.env.XOI_ATELIER_DIST_DIR || "/tmp/xoi-director-link-atelier",
  out = process.env.XOI_DIRECTOR_QA_DIR || "/tmp/xoi-director-link-qa";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.XOI_BROWSER_PATH || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined),
  args: ["--enable-unsafe-swiftshader"],
});
const scenes = new Map(),
  media = new Map(),
  canvases = new Map(),
  contexts = [],
  errors = [],
  report = [],
  traffic = { model: 0, authorize: 0, save: 0, upload: 0 };
let failSave = false;
const base = process.env.XOI_BASE_URL || "http://localhost:12121";
const id = "director3d-u501-link-test";
async function context(seed = false) {
  const c = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
  contexts.push(c);
  await c.addInitScript(
    ({ seed, id }) => {
      localStorage.setItem("token", "Bearer fixture-owner-501");
      localStorage.setItem("userId", "501");
      localStorage.setItem("xoi.platform-welcome.v1:501", "done");
      if (seed) {
        localStorage.setItem("director3d-projects-v2:u501", JSON.stringify([{ id, name: "单镜头交接验证", createdAt: Date.now() }]));
        localStorage.setItem("director3d-active-project-v2:u501", id);
      }
    },
    { seed, id },
  );
  await c.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      p = u.pathname;
    if (p.startsWith("/socket.io/")) return route.abort();
    if (p.startsWith("/api/")) {
      if (req.method() === "POST" && /chat\/completions|\/director\/(plan|compose)|\/images\/generations|\/videos$/.test(p)) traffic.model++;
      if (p === "/api/billing/authorize") traffic.authorize++;
      if (p === "/api/auth/me") return route.fulfill({ json: { user: { id: 501, name: "隔离测试" } } });
      if (p === "/api/director-scenes")
        return route.fulfill({
          json: {
            data: [...scenes].filter(([, d]) => !d.deleted).map(([id, { title, revision, updatedAt }]) => ({ id, title, revision, updatedAt })),
          },
        });
      if (p.startsWith("/api/director-scenes/")) {
        const sid = decodeURIComponent(p.split("/").at(-1)),
          old = scenes.get(sid);
        if (req.method() === "GET")
          return route.fulfill({
            status: old?.deleted ? 410 : old ? 200 : 404,
            json: old && !old.deleted ? { data: old } : { message: "场景不存在" },
          });
        if (req.method() === "PUT") {
          if (failSave) return route.fulfill({ status: 503, json: { message: "模拟保存失败" } });
          const b = req.postDataJSON();
          if ((old?.revision || 0) !== b.revision) return route.fulfill({ status: 409, json: { message: "版本冲突" } });
          traffic.save++;
          const d = { id: sid, title: b.title, payload: b.payload, revision: b.revision + 1, updatedAt: Date.now() };
          scenes.set(sid, d);
          return route.fulfill({ json: { data: { revision: d.revision, updatedAt: d.updatedAt } } });
        }
      }
      if (p === "/api/canvas-files") {
        traffic.upload++;
        const url = `/oss/canvas-files/501/${String(traffic.upload).padStart(32, "0")}.png`;
        media.set(url, req.postDataBuffer());
        return route.fulfill({ json: { url, bytes: req.postDataBuffer().length } });
      }
      if (p === "/api/canvases")
        return route.fulfill({
          json: req.method() === "GET" ? { canvases: [] } : { canvas: { id: "fixture-canvas-" + Date.now(), updated_at: Date.now() } },
        });
      if (p.startsWith("/api/canvases/"))
        return route.fulfill({
          json: { canvas: { id: p.split("/").at(-1), ...(req.method() === "GET" ? {} : req.postDataJSON()), updated_at: Date.now() } },
        });
      if (p === "/api/v1/user-config")
        return route.fulfill({ json: { code: 0, data: { syncCapabilities: { userData: true, assets: true, workflows: true } } } });
      if (p === "/api/v1/canvas/projects") {
        if (req.method() === "GET") return route.fulfill({ json: { code: 0, data: [...canvases.values()] } });
        const { data } = req.postDataJSON(),
          old = canvases.get(data.id);
        if ((old?.cloudRevision || 0) !== (data.cloudRevision || 0)) return route.fulfill({ status: 409, json: { message: "画布冲突" } });
        const saved = { ...data, cloudRevision: (old?.cloudRevision || 0) + 1 };
        canvases.set(data.id, saved);
        return route.fulfill({ json: { code: 0, data: saved } });
      }
      if (p === "/api/config") return route.fulfill({ json: { chat_models: [], image_models: [], video_models: [] } });
      return route.fulfill({ json: { code: 200, data: p === "/api/login/self" ? { id: 501, name: "隔离测试", balance: 100 } : [] } });
    }
    if (media.has(p)) return route.fulfill({ body: media.get(p), contentType: "image/png" });
    if (!["localhost", "127.0.0.1"].includes(u.hostname)) return route.abort();
    const a = p.startsWith("/atelier-canvas/"),
      r = a ? atelier : root,
      path = resolve(r, "." + (a ? p.slice("/atelier-canvas".length) : p === "/" ? "/index.html" : p));
    try {
      return route.fulfill({
        body: await readFile(path),
        contentType:
          {
            ".js": "text/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".glb": "model/gltf-binary",
            ".png": "image/png",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".woff2": "font/woff2",
          }[extname(path)] || "application/octet-stream",
      });
    } catch {
      return route.abort();
    }
  });
  return c;
}
const waitFor = async (predicate) => {
  const end = Date.now() + 60000;
  while (!predicate()) {
    if (Date.now() > end) throw Error("fixture persistence timeout");
    await new Promise((r) => setTimeout(r, 200));
  }
};
const pass = (name, details = {}) => {
  report.push({ name, ...details });
  console.log("PASS", name, details);
};
const page = await (await context(true)).newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => errors.push(e.message));
const native = page.frameLocator(".director3d-iframe");
const ready = async (frame) => {
  await frame.locator(".xoi-clear-camera").waitFor({ timeout: 90000 });
  await frame.locator("#xoi-workspace-loading").waitFor({ state: "hidden" });
};
const actor = (project) => project.objects.find((o) => o.type === "person");
async function move(frame, count) {
  await frame.locator(".panel-tabs button").filter({ hasText: "场景层级" }).click();
  await frame.locator(".scene-row").filter({ hasText: "人物 · 主角" }).click();
  for (let i = 0; i < count; i++) await frame.getByRole("slider", { name: "位置 X", exact: true }).press("ArrowRight");
}
try {
  await page.goto(base + "/#/director3d?scene=" + id);
  await ready(native);
  await native.getByRole("button", { name: "带到画布制作", exact: true }).waitFor();
  await native.locator("body").evaluate(() => window.xoiDirectorScene.checkpoint());
  await native.getByRole("button", { name: "带到画布制作", exact: true }).click();
  await page.waitForURL("**/#/canvas**");
  const canvas = page.frameLocator(".atelier-canvas-iframe");
  await canvas.locator("[data-node-id]").first().waitFor({ timeout: 90000 });
  assert.equal(await canvas.locator("[data-node-id]").count(), 4);
  const original = structuredClone(scenes.get(id));
  assert.ok(original);
  assert.ok(original.revision >= 1);
  assert.ok(actor(original.payload.project));
  assert.equal(traffic.model, 0);
  assert.equal(traffic.authorize, 0);
  const sourceNode = canvas.locator("[data-node-id]").filter({ has: canvas.getByRole("button", { name: "继续编辑这个镜头", exact: true }) });
  const sourceId = await sourceNode.getAttribute("data-node-id");
  const cover = sourceNode.locator("img");
  await cover.evaluate((el) => el.decode());
  assert.ok(await cover.evaluate((el) => el.naturalWidth > 16));
  const generate = canvas.getByRole("button", { name: "开始生成", exact: true });
  assert.ok(await generate.isVisible());
  await page.screenshot({ path: join(out, "01-镜头参考包.png") });
  pass("native shot saves to cloud, exports a real camera image and enters one editable reference group without model calls");
  await sourceNode.getByRole("button", { name: "继续编辑这个镜头", exact: true }).click();
  const editor = canvas.frameLocator('iframe[title="3D导演台"]');
  await ready(editor);
  assert.equal(new URL(await canvas.locator('iframe[title="3D导演台"]').getAttribute("src"), "http://localhost").searchParams.get("key"), id);
  const restored = await editor
    .locator("body")
    .evaluate(() => JSON.parse(localStorage.getItem("monoform-project-" + new URL(location.href).searchParams.get("key"))));
  assert.equal(restored.activeShotId, original.payload.project.activeShotId);
  assert.deepEqual(
    restored.objects.map((o) => o.id),
    original.payload.project.objects.map((o) => o.id),
  );
  await move(editor, 4);
  await canvas.getByRole("button", { name: /保存并返回/ }).click();
  await canvas.locator('iframe[title="3D导演台"]').waitFor({ state: "detached" });
  const changed = structuredClone(scenes.get(id));
  assert.ok(actor(changed.payload.project).position[0] > actor(original.payload.project).position[0]);
  assert.ok(changed.revision > original.revision);
  assert.ok((await sourceNode.innerText()).includes("参考 v" + original.revision));
  pass("canvas opens the original scene and shot; saving edits preserves the old exported reference version");
  await sourceNode.getByRole("button", { name: "继续编辑这个镜头", exact: true }).click();
  await canvas.getByRole("button", { name: "将参考版本另存为新场景", exact: true }).waitFor();
  assert.equal(await canvas.locator('iframe[title="3D导演台"]').count(), 0);
  await canvas.getByRole("button", { name: "将参考版本另存为新场景", exact: true }).click();
  await ready(editor);
  const forkScene = new URL(await canvas.locator('iframe[title="3D导演台"]').getAttribute("src"), "http://localhost").searchParams.get("key");
  assert.notEqual(forkScene, id);
  assert.deepEqual(actor(scenes.get(forkScene).payload.project).position, actor(original.payload.project).position);
  assert.deepEqual(actor(scenes.get(id).payload.project).position, actor(changed.payload.project).position);
  await editor.getByRole("button", { name: "带到画布制作", exact: true }).click();
  await canvas.locator('iframe[title="3D导演台"]').waitFor({ state: "detached" });
  await waitFor(() => [...canvases.values()].some((p) => p.nodes?.length === 8));
  const stored = [...canvases.values()].find((p) => p.nodes?.length === 8);
  assert.equal(stored.nodes.filter((n) => n.type === "director").length, 2);
  assert.equal(new Set(stored.nodes.map((n) => n.id)).size, 8);
  pass("stale reference requires an explicit choice; fork restores the original snapshot and new reference does not overwrite old results");
  const other = await (await context(false)).newPage();
  other.setDefaultTimeout(60000);
  other.on("pageerror", (e) => errors.push(e.message));
  await other.goto(base + "/#/director3d?scene=" + id);
  const otherNative = other.frameLocator(".director3d-iframe");
  await ready(otherNative);
  const remoteState = await otherNative
    .locator("body")
    .evaluate(
      (el, id) => ({
        href: location.href,
        status: window.xoiDirectorScene?.status,
        raw: localStorage.getItem("monoform-project-" + id),
        keys: Object.keys(localStorage).filter((k) => k.startsWith("monoform-project-")),
      }),
      id,
    );
  assert.equal(remoteState.status, "saved");
  const remoteRestored = JSON.parse(remoteState.raw);
  assert.deepEqual(actor(remoteRestored).position, actor(changed.payload.project).position);
  pass("fresh browser with no local project recovers scene directory and exact saved geometry from cloud");
  // Re-open the original in A, then modify it in B. A must not overwrite B.
  await page.bringToFront();
  await canvas.getByRole("button", { name: "镜头 01 导演台", exact: true }).first().click();
  const originalNode = canvas.locator(`[data-node-id="${sourceId}"]`);
  await originalNode.getByRole("button", { name: "继续编辑这个镜头", exact: true }).click();
  await canvas.getByRole("button", { name: "打开最新场景", exact: true }).click();
  await ready(editor);
  await move(editor, 1);
  failSave = true;
  const beforeFailure = structuredClone(scenes.get(id));
  await canvas.getByRole("button", { name: /保存并返回/ }).click();
  await canvas
    .getByText(/模拟保存失败/)
    .first()
    .waitFor();
  assert.equal(await canvas.locator('iframe[title="3D导演台"]').count(), 1);
  assert.deepEqual(scenes.get(id), beforeFailure);
  failSave = false;
  await canvas.getByRole("button", { name: /保存并返回/ }).click();
  await canvas.locator('iframe[title="3D导演台"]').waitFor({ state: "detached" });
  pass("failed save keeps the editor and local draft open; explicit retry saves successfully");
  await originalNode.getByRole("button", { name: "继续编辑这个镜头", exact: true }).click();
  await canvas.getByRole("button", { name: "打开最新场景", exact: true }).click();
  await ready(editor);
  // Refresh B from the latest cloud before making its independent edit.
  await other.bringToFront();
  await other.reload();
  await ready(otherNative);
  await move(otherNative, 3);
  await otherNative.locator("body").evaluate(() => window.xoiDirectorScene.checkpoint());
  const remoteNew = structuredClone(scenes.get(id));
  await page.bringToFront();
  await move(editor, 2);
  await canvas.getByRole("button", { name: /保存并返回/ }).click();
  await canvas
    .getByText(/本机.*云端|场景已在另一页面更新/)
    .first()
    .waitFor();
  assert.equal(await canvas.locator('iframe[title="3D导演台"]').count(), 1);
  assert.deepEqual(actor(scenes.get(id).payload.project).position, actor(remoteNew.payload.project).position);
  assert.ok(await editor.locator('.xoi-scene-sync[data-state="conflict"]').isVisible());
  await page.screenshot({ path: join(out, "02-冲突保留本机草稿.png") });
  await canvas.getByRole("button", { name: "保留本机草稿并返回", exact: true }).click();
  pass("simultaneous edits are rejected; original cloud version and local draft remain, and user can still return");
  await canvas.getByRole("button", { name: "镜头 01 导演台", exact: true }).last().click();
  await canvas
    .locator("[data-node-id]")
    .filter({ has: canvas.getByRole("button", { name: "继续编辑这个镜头", exact: true }) })
    .last()
    .getByRole("button", { name: "继续编辑这个镜头", exact: true })
    .click();
  await ready(editor);
  await editor.getByRole("button", { name: "运镜", exact: true }).click();
  await editor.locator(".xoi-native-motion-card").filter({ hasText: "环绕人物" }).click();
  await canvas.getByRole("button", { name: "保存并打开完整导演台", exact: true }).click();
  await page.waitForURL("**/#/director3d?scene=" + forkScene);
  await ready(native);
  assert.equal(new URL(await page.locator(".director3d-iframe").getAttribute("src"), "http://localhost").searchParams.get("key"), forkScene);
  pass("embedded motion entry saves and continues the same scene in the full director without a dead button");
  assert.deepEqual(errors, []);
  assert.equal(traffic.model, 0);
  assert.equal(traffic.authorize, 0);
  await writeFile(join(out, "report.json"), JSON.stringify({ report, traffic, errors }, null, 2));
} catch (e) {
  console.log("ERRORS", errors);
  console.log(
    "BODY",
    await page
      .locator("body")
      .innerText()
      .catch(() => ""),
  );
  console.log(
    "NATIVE",
    await native
      .locator("body")
      .innerText()
      .catch(() => ""),
  );
  console.log(
    "SYNC",
    await native
      .locator("body")
      .evaluate(() => ({
        status: window.xoiDirectorScene?.status,
        key: new URL(location.href).searchParams.get("key"),
        stored: localStorage.getItem("monoform-project-" + new URL(location.href).searchParams.get("key"))?.slice(0, 400),
      }))
      .catch(() => null),
  );
  console.log(
    "FRAME",
    await page
      .locator(".atelier-canvas-iframe")
      .evaluate((el) => el.contentDocument?.body.innerText)
      .catch(() => ""),
  );
  console.log(
    "CANVASES",
    [...canvases.values()].map((p) => ({ id: p.id, nodes: p.nodes?.length })),
  );
  console.log(
    "SCENES",
    [...scenes].map(([id, d]) => ({ id, revision: d.revision, actor: actor(d.payload.project)?.position })),
  );
  await page.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  throw e;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
