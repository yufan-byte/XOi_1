// Native 3D + Vue + React browser integration. All accounts, cloud writes and uploads are isolated fixtures.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
const { chromium } = await import(process.env.XOI_PLAYWRIGHT_MODULE || "playwright");
const root = process.env.XOI_FRONTEND_DIST_DIR || "/tmp/xoi-previz-web",
  atelier = process.env.XOI_ATELIER_DIST_DIR || "/tmp/xoi-previz-atelier",
  out = process.env.XOI_DIRECTOR_QA_DIR || "/tmp/xoi-previz-qa";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.XOI_HEADED !== "1",
  executablePath:
    process.env.XOI_BROWSER_PATH || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined),
  args: process.env.XOI_REAL_GPU === "1" ? [] : ["--enable-unsafe-swiftshader"],
});
const scenes = new Map(),
  media = new Map(),
  canvases = new Map(),
  contexts = [],
  errors = [],
  report = [],
  network = {},
  traffic = { model: 0, authorize: 0, save: 0, upload: 0 };
let failSave = false,
  failVideoUpload = false;
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
      const label=req.method()+" "+p.replace(/\/director-scenes\/[^/]+/,"/director-scenes/:id");network[label]=(network[label]||0)+1;
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
        if (u.searchParams.get("ext") === "mp4" && failVideoUpload) return route.fulfill({ status: 503, json: { detail: "模拟视频上传失败" } });
        traffic.upload++;
        const ext = u.searchParams.get("ext");
        const url = `/oss/canvas-files/501/${String(traffic.upload).padStart(32, "0")}.${ext}`;
        if (ext === "mp4") await writeFile(join(out, "真实5秒白模预演.mp4"), req.postDataBuffer());
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
    if (media.has(p)) return route.fulfill({ body: media.get(p), contentType: p.endsWith(".mp4") ? "video/mp4" : "image/png" });
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

const page = await (await context(true)).newPage();
page.setDefaultTimeout(90000);
page.on("pageerror", (e) => errors.push(e.message));page.on("console",msg=>{if(msg.type()==="error"||msg.text().includes("createRoot"))console.log("BROWSER",msg.type(),msg.text());});
let renderer;
let downloads=0;page.on("download",()=>downloads++);
const native = page.frameLocator(".director3d-iframe");
async function ready(frame) {
  await frame.locator(".xoi-clear-camera").waitFor({ timeout: 120000 });
  await frame.locator("#xoi-workspace-loading").waitFor({ state: "hidden" });
  await frame.locator(".xoi-handoff-menu").waitFor();
}
async function current(frame) {
  return frame.locator("body").evaluate(() => {
    [...document.querySelectorAll(".top-actions button")].find((b) => b.textContent.trim() === "保存").click();
    return JSON.parse(localStorage.getItem("monoform-project-" + new URL(location.href).searchParams.get("key")));
  });
}
async function sendVideo(frame) {
  const starts = await frame.owner().evaluate(iframe => {
    const host = iframe.ownerDocument.defaultView;
    host.__qaTransferStarts ||= 0;
    if (!host.__qaTransferObserver) {
      host.__qaTransferObserver = new host.MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.matches?.(".xoi-previz-transfer")) host.__qaTransferStarts++;
        }
      });
      host.__qaTransferObserver.observe(host.document.body, { childList: true });
    }
    return host.__qaTransferStarts;
  });
  await frame.locator(".xoi-handoff-menu summary").click();
  await frame.getByRole("button", { name: "预演视频带到画布", exact: true }).click();
  await frame.owner().evaluate(async (iframe, starts) => {
    const host = iframe.ownerDocument.defaultView;
    const deadline = Date.now() + 10000;
    while (host.__qaTransferStarts <= starts) {
      if (Date.now() > deadline) throw Error("handoff did not start");
      await new Promise(r => setTimeout(r, 10));
    }
  }, starts);
}
const pass = (name, detail = {}) => {
  report.push({ name, ...detail });
  console.log("PASS", name, detail);
};
try {
  await page.goto(base + "/#/director3d?scene=" + id);
  await ready(native);
  renderer = await native.locator("canvas").first().evaluate(canvas => {
    const gl = canvas.getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return { userAgent:navigator.userAgent, renderer:info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unavailable" };
  });
  const project = await current(native);
  const tableScene = JSON.parse(await readFile(new URL("../../docs/验证/2026-10-17导演助理恢复与场景预设/桌边对谈.monoform.json", import.meta.url), "utf8"));
  project.objects = tableScene.objects;
  project.camera = tableScene.camera;
  project.settings.durationSeconds = 5;
  project.settings.fps = 24;
  const shot = project.shots.find((s) => s.id === project.activeShotId);
  shot.camera = structuredClone(project.camera);
  shot.objects = structuredClone(project.objects);
  shot.objectKeyframes = {};
  project.objectKeyframes = {};
  shot.durationSeconds = 5;
  shot.fps = 24;
  project.keyframes = [
    {
      frame: 0,
      position: [...project.camera.position],
      rotation: [...project.camera.rotation],
      focalLength: project.camera.focalLength,
      interpolation: "linear",
    },
    {
      frame: 120,
      position: [project.camera.position[0] + 2, project.camera.position[1], project.camera.position[2] - 2],
      rotation: [...project.camera.rotation],
      focalLength: project.camera.focalLength,
      interpolation: "linear",
    },
  ];
  shot.keyframes = structuredClone(project.keyframes);
  await native
    .locator(".top-actions input[type=file]")
    .setInputFiles({ name: "5秒移动镜头.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await native.locator(".time-readout span").filter({ hasText: "/ 120" }).waitFor();
  await native.locator(".camera-track").evaluate((el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + r.width * 0.4, clientY: r.top + r.height / 2 }));
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await native.locator(".time-readout strong").filter({ hasText: "48" }).waitFor();
  const before = await native.locator("body").evaluate(() => window.xoiDirectorScene.checkpoint());
  assert.equal(before.project.objects.length,5);
  assert.equal(before.project.objects.filter(o=>o.type==="person").length,2);
  await page.evaluate(()=>{window.__qaFeedback=[];new MutationObserver(()=>{for(const el of document.querySelectorAll('.t-message__content,.xoi-previz-transfer [role=status]')){const text=el.textContent;if(text&&!window.__qaFeedback.includes(text))window.__qaFeedback.push(text);}}).observe(document.body,{childList:true,subtree:true,characterData:true});});
  await sendVideo(native);
  await native.locator(".app-shell[aria-busy=true]").waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".xoi-previz-transfer").waitFor({ state: "detached" });
  await ready(native);
  await native.locator(".time-readout strong").filter({ hasText: "48" }).waitFor();
  assert.deepEqual(await current(native), before.project);
  assert.equal(traffic.upload, 0);
  pass("cancel restores the saved scene and playhead, with no media upload or model call");
  // Reject unsupported encoders without leaving the editor inert or the fee flow locked.
  await native.locator("body").evaluate(() => {
    window.VideoEncoder = undefined;
  });
  await sendVideo(native);
  await page.locator(".xoi-previz-transfer").waitFor({ state: "detached" });
  await ready(native);
  await native.locator(".time-readout strong").filter({ hasText: "48" }).waitFor();
  assert.deepEqual(await current(native), before.project);
  await page.getByText(/当前浏览器不支持本地预演编码/).first().waitFor();
  await native.locator("body").evaluate(() => { if (typeof VideoEncoder === "undefined") throw Error("encoder unavailable after recovery"); });
  pass("unsupported encoder recovers editing and preserves the source project");
  // Reproduce the user's exact 3% stall: quality encoder accepts four frames,
  // but never signals dequeue. The UI must recover without uploading anything.
  await native.locator("body").evaluate(() => {
    const Encoder = window.VideoEncoder;
    window.VideoEncoder = class extends Encoder {
      queued = 0;
      encode() { this.queued++; }
      get encodeQueueSize() { return this.queued; }
      flush() { return new Promise(() => {}); }
    };
  });
  const stalledAt = Date.now();
  await sendVideo(native);
  await native.locator(".export-button").filter({hasText:"3%"}).waitFor({state:"attached"});
  await page.screenshot({path:join(out,"02-停滞保护与轻量进度.png")});
  await page.locator(".xoi-previz-transfer").waitFor({state:"detached",timeout:45000});
  await ready(native);
  assert.ok(Date.now()-stalledAt < 45000);
  assert.equal(traffic.upload,0);
  assert.deepEqual(await current(native),before.project);
  await page.getByText(/预演编码已停止推进/).first().waitFor();
  pass("3% encoder queue stall automatically ends and restores scene without upload or billing",{elapsedMs:Date.now()-stalledAt});
  // This run uses two seated actors, two chairs and a table, not the empty stage.
  await native.locator("body").evaluate(() => {
    const configure = window.VideoEncoder.prototype.configure;
    window.VideoEncoder.prototype.configure = function(config) {
      const result = configure.call(this,config);
      parent.__qaEncoderMode = document.documentElement.dataset.xoiPrevizEncoder;
      return result;
    };
  });
  failVideoUpload = true;
  await sendVideo(native);
  await page.locator(".xoi-previz-transfer").waitFor({ state: "detached", timeout: 300000 });
  await ready(native);
  assert.ok(page.url().includes("/#/director3d"));
  assert.equal(canvases.size, 0);
  assert.deepEqual(await current(native), before.project);
  assert.equal(traffic.model, 0);
  await page.getByText(/模拟视频上传失败/).first().waitFor();
  pass("real MP4 export followed by upload failure keeps the scene and does not create a half-finished canvas",{encoderMode:await page.evaluate(()=>window.__qaEncoderMode)});
  assert.match(await page.evaluate(()=>window.__qaEncoderMode),/^realtime\//);
  failVideoUpload = false;
  await page.getByText(/模拟视频上传失败/).first().waitFor({state:"hidden"});
  await page.screenshot({path:join(out,"03-导演台精简工具栏.png")});
  await native.locator(".xoi-download-menu summary").click();
  const downloaded = page.waitForEvent("download", {timeout:45000});
  await native.getByRole("button",{name:"下载 MP4",exact:true}).click();
  await (await downloaded).saveAs(join(out,"导出菜单-5秒预演.mp4"));
  await native.locator(".app-shell[aria-busy=true]").waitFor({state:"detached"});
  assert.deepEqual(await current(native),before.project);
  pass("local MP4 download from the compact menu works and does not add canvas nodes");
  await sendVideo(native);
  await page.waitForURL("**/#/canvas**", { timeout: 300000 });
  const canvas = page.frameLocator(".atelier-canvas-iframe");
  await canvas.locator("[data-node-id]").first().waitFor({ timeout: 120000 });
  const deadline = Date.now() + 90000;
  let stored;
  while (!(stored = [...canvases.values()].find((p) => p.nodes?.length === 5))) {
    if (Date.now() > deadline) throw Error("canvas persistence timeout");
    await new Promise((r) => setTimeout(r, 300));
  }
  const clip = stored.nodes.find((n) => n.type === "video"),
    root = stored.nodes.find((n) => n.type === "director"),
    image = stored.nodes.find((n) => n.type === "image"),
    config = stored.nodes.find((n) => n.type === "config");
  assert.ok(clip.metadata.content.endsWith(".mp4"));
  assert.equal(clip.metadata.mimeType, "video/mp4");
  assert.equal(clip.metadata.previz.frameCount, 120);
  assert.equal(clip.metadata.previz.fps, 24);
  assert.equal(clip.metadata.durationMs, 5000);
  assert.equal(clip.metadata.referenceRole, "motion");
  assert.equal(image.metadata.referenceRole, "composition");
  assert.deepEqual(clip.metadata.directorSource, root.metadata.directorSource);
  assert.equal(config.metadata.seconds, "5");
  assert.ok(stored.connections.some((c) => c.fromNodeId === clip.id && c.toNodeId === config.id));
  assert.deepEqual(root.metadata.directorProject.snapshot, before.project);
  const actual = await canvas.locator("body").evaluate(async (el, url) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    return await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => reject(Error("video decode failed"));
    });
  }, clip.metadata.content);
  assert.ok(Math.abs(actual.duration - 5) < 0.05);
  assert.equal(actual.width, clip.metadata.naturalWidth);
  assert.equal(actual.height, clip.metadata.naturalHeight);
  await page.screenshot({ path: join(out, "01-预演视频参考包.png") });
  pass("real 5 second 24 fps export decodes in canvas and stays bound to the exact scene version", {
    actual,
    frameCount: clip.metadata.previz.frameCount,
  });
  const videoUploadsBefore=[...media.keys()].filter(p=>p.endsWith(".mp4")).length;
  await canvas.getByRole('button',{name:'继续编辑这个镜头',exact:true}).click();const embedded=canvas.frameLocator('iframe[title="3D导演台"]');await ready(embedded);await sendVideo(embedded);await canvas.locator('.xoi-previz-transfer').waitFor();await page.goto(base+'/#/aiAssistant');await page.waitForURL('**/#/aiAssistant**');await page.locator('.atelier-canvas-iframe').waitFor({state:'hidden'});await page.goto(base+'/#/canvas');await page.waitForURL('**/#/canvas**');await canvas.locator('.xoi-previz-transfer').waitFor({state:'detached'});await ready(embedded);assert.equal([...media.keys()].filter(p=>p.endsWith(".mp4")).length,videoUploadsBefore);assert.ok([...canvases.values()].every(p=>p.nodes?.length===5));assert.deepEqual(await current(embedded),before.project);await canvas.getByRole('button',{name:/保存并返回/}).click();await canvas.locator('iframe[title="3D导演台"]').waitFor({state:'detached'});pass('leaving the cached canvas stops video handoff and returning restores editing without an extra video or canvas result');
  assert.equal(downloads,1);
  assert.equal(traffic.model, 0);
  assert.equal(traffic.authorize, 0);
  assert.deepEqual(errors, []);
  await writeFile(join(out, "report.json"), JSON.stringify({ report, traffic, network, downloads, errors, renderer, video: clip.metadata }, null, 2));
} catch (error) {
  console.log("PRIMARY_ERROR",error);console.log("ERRORS", errors);console.log("FEEDBACK",await page.evaluate(()=>window.__qaFeedback).catch(()=>[]));
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
  await page.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  throw error;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
