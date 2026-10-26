// Local browser regression. All API traffic is fulfilled by fixtures; all other external traffic is blocked.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.LOCAL_UI_URL || "http://localhost:50188";
const out = process.env.TEST_OUTPUT_DIR || "/tmp/xoi-viral-regression";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await context.addInitScript(() => {
  if (!localStorage.getItem("token")) localStorage.setItem("token", "fixture-token-no-real-account");
  localStorage.setItem("setting", JSON.stringify({ baseUrl: "/api" }));
  for (const owner of ["1", "2", "current"]) localStorage.setItem(`xoi.platform-welcome.v1:${owner}`, "done");
  if (!localStorage.getItem("userId")) localStorage.setItem("userId", "1");
});
const models = [
  { modelName: "fixture-vision", type: "text", name: "测试视觉", capabilities: ["vision"] },
  { modelName: "fixture-image", type: "image", name: "测试图片", referenceLimits: { images: 3 } },
  { modelName: "fixture-video", type: "video", name: "测试视频", referenceLimits: { images: 1 }, enums: { duration: [5, 10], resolution: ["480p", "720p"], aspect_ratio: ["9:16", "16:9"] } },
].map(m => ({ ...m, id: "newapi", value: m.modelName, label: m.name, series: "测试", displayPrice: "测试报价", recommended: true }));
let imagePosts = 0, videoPosts = 0, quotePosts = 0, polls = 0, badQuote = false, boardFailure = true, pending = true;
let media = Buffer.alloc(0);
const errors = [], videoBodies = [];
const cloudDocuments = new Map();
const uploadSessions = new Map();
let assetUploads = 0;
let cloudWrites = 0;
const fixtureRoute = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== new URL(base).origin && !url.pathname.startsWith("/api/")) return route.abort();
  if (url.pathname === "/fixture.mp4") return route.fulfill({ contentType: "video/mp4", body: media });
  if (url.pathname === "/fixture.png" || url.pathname.startsWith("/oss/canvas-files/1/")) return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2J3kAAAAASUVORK5CYII=", "base64") });
  if (!url.pathname.startsWith("/api/")) return route.continue();
  const path = url.pathname;
  if (path.startsWith("/api/workspace/documents/")) {
    const user = request.headers().authorization === "fixture-other-token" ? "2" : "1";
    const parts = path.split("/"), kind = parts[4], id = parts[5], key = `${user}:${kind}:${id}`;
    if (!id) return route.fulfill({ json: { data: [...cloudDocuments.values()].filter(doc => doc.owner === user && doc.kind === kind).map(({ payload, ...doc }) => doc) } });
    const previous = cloudDocuments.get(key);
    if (request.method() === "GET") return route.fulfill({ status: previous ? 200 : 404, json: previous ? { data: previous } : { message: "草稿不存在" } });
    if (request.method() === "PUT") {
      const body = request.postDataJSON();
      if (body.revision !== (previous?.revision || 0)) return route.fulfill({ status: 409, json: { message: "草稿版本冲突" } });
      const document = { id, kind, owner: user, title: body.title, payload: body.payload, revision: body.revision + 1, updatedAt: Date.now() };
      cloudDocuments.set(key, document); cloudWrites++;
      return route.fulfill({ json: { data: { revision: document.revision, updatedAt: document.updatedAt } } });
    }
    throw new Error(`Unexpected cloud request: ${request.method()}`);
  }
  if (path === "/api/workspace/upload-sessions" && request.method() === "POST") {
    const data = { id: "a".repeat(48), expiresAt: Date.now() + 600000, files: [] };
    uploadSessions.set(data.id, data); return route.fulfill({ json: { data } });
  }
  if (path.startsWith("/api/workspace/upload-sessions/")) {
    const [, , , , id, tail] = path.split("/"), data = uploadSessions.get(id);
    if (request.method() === "DELETE") { uploadSessions.delete(id); return route.fulfill({ json: { data: null } }); }
    if (!data || data.expiresAt <= Date.now() || request.headers().authorization === "fixture-other-token") return route.fulfill({ status: 404, json: { message: "上传窗口已过期或不属于当前账号" } });
    if (tail === "files") { const file = request.postDataJSON(); data.files.push({ ...file, bytes: 67 }); return route.fulfill({ json: { data: data.files } }); }
    return route.fulfill({ json: { data } });
  }
  if (path === "/api/canvas-files") { assetUploads++; return route.fulfill({ json: { url: `/oss/canvas-files/1/${"b".repeat(32)}.png`, bytes: 67 } }); }
  if (path === "/api/model-catalog") return route.fulfill({ json: { data: models } });
  if (path.endsWith("/modelSelect/getModelList")) return route.fulfill({ json: { data: models.filter(m => m.type === request.postDataJSON().type) } });
  if (path.endsWith("/model-catalog/quote")) {
    quotePosts++;
    if (badQuote) return route.fulfill({ status: 422, json: { message: "暂无可靠报价" } });
    const { model, params } = request.postDataJSON();
    return route.fulfill({ json: { data: { yuan: model === "fixture-video" ? params.seconds * .39 : 1.1, points: 0 } } });
  }
  if (path.endsWith("/v1/images/generations")) {
    imagePosts++;
    if (boardFailure && imagePosts === 2) return route.fulfill({ status: 422, json: { message: "模拟故事板失败" } });
    return route.fulfill({ json: { data: [{ url: `${base}/fixture.png` }] } });
  }
  if (path.endsWith("/v1/videos") && request.method() === "POST") {
    videoPosts++; videoBodies.push(request.postDataJSON());
    return route.fulfill({ json: { data: { id: `fixture-task-${videoPosts}`, status: "processing" } } });
  }
  if (/\/v1\/videos\//.test(path)) { polls++; return route.fulfill({ json: { data: pending ? { status: "processing" } : { status: "completed", video_url: `${base}/fixture.mp4` } } }); }
  if (path.endsWith("/v1/chat/completions")) throw new Error("This seeded workflow must not submit a paid analysis request");
  if (path.endsWith("/login/self")) return route.fulfill({ json: { data: { id: request.headers().authorization === "fixture-other-token" ? "2" : "1", name: "离线测试", balance: 100 } } });
  return route.fulfill({ json: { code: 200, data: [], message: "success" } });
};
await context.route("**/*", fixtureRoute);
const page = await context.newPage();
page.setDefaultTimeout(120_000);
page.on("pageerror", e => errors.push(e.message));
try {
  await page.goto(`${base}/#/viral-replicate`);
  await page.getByRole("heading", { name: "爆款复刻工作台" }).waitFor();
  const welcome = page.getByRole("button", { name: "先逛逛工作台", exact: true });
  if (await welcome.isVisible()) await welcome.click();
  media = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    const mimeType = "video/mp4;codecs=avc1.42001E";
    if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error("Local test browser lacks MP4 recording support");
    const recorder = new MediaRecorder(canvas.captureStream(10), { mimeType });
    const chunks = []; recorder.ondataavailable = e => chunks.push(e.data);
    const stopped = new Promise(resolve => { recorder.onstop = resolve; }); recorder.start();
    const ctx = canvas.getContext("2d");
    for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? "#ff713f" : "#282631"; ctx.fillRect(0, 0, 320, 180); await new Promise(r => setTimeout(r, 100)); }
    recorder.stop(); await stopped;
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  }));
  await page.evaluate(async base => {
    const { saveDraft } = await import("/src/views/viralReplicate/storage.ts");
    await saveDraft({ id: "fixture-project", owner: "1", title: "模拟商品复刻", updatedAt: Date.now(), summary: "三镜头测试", stage: "boards",
      settings: { visionModel: "newapi:fixture-vision", imageModel: "newapi:fixture-image", videoModel: "newapi:fixture-video", seconds: 5, ratio: "9:16", resolution: "480p", stepwise: true },
      shots: [5, 5, 10].map((seconds, i) => ({ id: `shot-${i}`, no: i + 1, seconds, scene: "商品特写", camera: "推进", copy: "新品上市", status: i === 0 ? "视频完成" : "待生成", boardState: i === 0 ? "done" : "idle", videoState: i === 0 ? "done" : "idle", ...(i === 0 ? { board: `${base}/fixture.png`, clip: `${base}/fixture.mp4` } : {}) })) });
  }, base);
  await page.reload(); await page.locator(".shotCard").nth(2).waitFor();
  if (await welcome.isVisible()) await welcome.click();
  assert.equal(imagePosts, 0); assert.equal(videoPosts, 0);
  await page.locator(".shotCard").nth(1).locator("textarea").first().fill("修改后的商品画面");
  await page.getByRole("button", { name: "查看报价 · 生成缺少的故事板", exact: true }).click();
  await page.getByText(/预计 22 积分/).waitFor();
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  assert.equal(imagePosts, 0);
  await page.getByRole("button", { name: "查看报价 · 生成缺少的故事板", exact: true }).click();
  await page.getByRole("button", { name: "确认并提交", exact: true }).click();
  await page.locator(".shotError").getByText("模拟故事板失败", { exact: true }).waitFor();
  assert.equal(imagePosts, 2); assert.equal(videoPosts, 0);
  boardFailure = false;
  await page.getByRole("button", { name: "查看报价 · 生成缺少的故事板", exact: true }).click();
  await page.getByText(/预计 11 积分/).waitFor();
  await page.getByRole("button", { name: "确认并提交", exact: true }).click();
  await page.getByRole("button", { name: "查看报价 · 生成未完成的视频", exact: true }).waitFor();
  assert.equal(imagePosts, 3, "Only failed board should be retried");
  badQuote = true;
  await page.getByRole("button", { name: "查看报价 · 生成未完成的视频", exact: true }).click();
  await page.getByText("暂无可靠报价", { exact: true }).waitFor(); assert.equal(videoPosts, 0);
  badQuote = false;
  await page.getByRole("button", { name: "查看报价 · 生成未完成的视频", exact: true }).click();
  await page.getByText(/预计 58.5 积分/).waitFor();
  await page.screenshot({ path: `${out}/quote-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "确认并提交", exact: true }).click();
  await page.getByRole("button", { name: /查询 2 个已有任务/ }).waitFor();
  assert.equal(videoPosts, 2); assert.deepEqual(videoBodies.map(b => b.seconds), [5, 10]);
  assert.ok(videoBodies.every(b => b.resolution === "480p" && b.images.length === 1 && !b.videos));
  await page.reload(); await page.getByRole("button", { name: /查询 2 个已有任务/ }).waitFor();
  assert.equal(videoPosts, 2);
  pending = false;
  await page.getByRole("button", { name: /查询 2 个已有任务/ }).click();
  await page.getByRole("button", { name: "进入剪辑并导出完整视频", exact: true }).waitFor();
  assert.equal(videoPosts, 2);
  await page.locator(".hero").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/workflow-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector(".main").getBoundingClientRect().width <= innerWidth + 1);
  await page.locator(".hero").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/workflow-mobile.png` });
  const overflow = await page.locator(".viralPage").evaluate(el => el.scrollWidth > el.clientWidth + 2);
  assert.equal(overflow, false, "Workflow should not overflow on mobile");
  assert.ok(await page.locator(".viralPage").evaluate(el => el.getBoundingClientRect().right <= innerWidth + 2), "Page must fit the actual viewport, not just its container");
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.waitForFunction(() => document.querySelector(".main").getBoundingClientRect().width >= innerWidth - 1);
  await page.getByRole("button", { name: "进入剪辑并导出完整视频", exact: true }).click();
  await page.waitForURL(/#\/editor/, { timeout: 120_000 }); await page.getByText(/已按分镜顺序铺入 3 个镜头/).waitFor({ timeout: 60_000 });
  const editorUrl = page.url();
  await page.waitForFunction(() => !document.querySelector(".track-area")?.textContent?.includes("加载中"), undefined, { timeout: 60_000 });
  await page.screenshot({ path: `${out}/editor-handoff.png`, fullPage: true });
  await page.getByRole("button", { name: "导出成片", exact: true }).click();
  await page.getByRole("button", { name: "开始导出", exact: true }).waitFor();
  const downloading = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("button", { name: "开始导出", exact: true }).click();
  const download = await downloading;
  assert.match(download.suggestedFilename(), /\.mp4$/);
  assert.equal(await download.failure(), null);
  await download.saveAs(`${out}/local-export.mp4`);
  const exported = await readFile(`${out}/local-export.mp4`);
  assert.equal(exported.subarray(4, 8).toString(), "ftyp");
  const metadata = await page.evaluate(async bytes => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/mp4" }));
    const video = document.createElement("video");
    try {
      await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; video.src = url; });
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    } finally { URL.revokeObjectURL(url); }
  }, [...exported]);
  assert.ok(metadata.duration > 2, "Three local clips must export into one decodable MP4");
  assert.ok(Math.abs(metadata.width / metadata.height - 9 / 16) < .01, "Keep vertical output ratio");
  assert.equal(videoPosts, 2); assert.equal(imagePosts, 3);
  // Empty browser storage represents a second computer. It must restore from the shared server fixture only.
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await second.addInitScript(() => { localStorage.setItem("token", "fixture-token-no-real-account"); localStorage.setItem("userId", "1"); localStorage.setItem("setting", JSON.stringify({ baseUrl: "/api" })); for (const owner of ["1", "current"]) localStorage.setItem(`xoi.platform-welcome.v1:${owner}`, "done"); });
  await second.route("**/*", fixtureRoute);
  const secondPage = await second.newPage();
  await secondPage.goto(`${base}/#/viral-replicate`);
  await secondPage.locator(".shotCard").nth(2).waitFor();
  assert.equal(await secondPage.locator(".shotCard video").count(), 3);
  assert.equal(imagePosts, 3); assert.equal(videoPosts, 2);
  await secondPage.screenshot({ path: `${out}/cross-device-restored.png`, fullPage: true });
  const timeline = [...cloudDocuments.values()].find(doc => doc.kind === "timeline" && doc.owner === "1");
  assert.ok(timeline?.payload.tracks.length, "Editor must persist portable tracks to the server");
  assert.ok(!JSON.stringify(timeline.payload).includes('"blob:'), "Cloud timelines must not depend on local object URLs");
  await secondPage.goto(editorUrl);
  await secondPage.getByText("已恢复云端剪辑草稿", { exact: true }).waitFor();
  await secondPage.waitForFunction(() => !document.querySelector(".track-area")?.textContent?.includes("加载中"));
  assert.ok(await secondPage.locator(".clip").count() >= 3, "Empty browser must recover all three timeline clips");
  await secondPage.screenshot({ path: `${out}/cross-device-timeline.png`, fullPage: true });
  await page.goto(`${base}/#/viral-replicate`); await page.locator(".shotCard").nth(2).waitFor();
  await page.getByRole("button", { name: "手机扫码传商品图", exact: true }).click();
  await page.getByAltText("手机上传二维码").waitFor();
  await secondPage.goto(`${base}/#/phone-upload?session=${"a".repeat(48)}`);
  await secondPage.getByRole("heading", { name: "把手机图片传到电脑", exact: true }).waitFor();
  await secondPage.locator('input[type="file"]').setInputFiles({ name: "手机商品图.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2J3kAAAAASUVORK5CYII=", "base64") });
  await secondPage.getByText("已传回 1 张，请在电脑端选择使用", { exact: true }).waitFor();
  await page.bringToFront();
  console.log(JSON.stringify({ phase: "phone-receipt", files: uploadSessions.get("a".repeat(48))?.files.length, desktop: await page.evaluate(() => ({ hidden: document.hidden, dialog: !!document.querySelector(".phonePair"), url: location.href })) }));
  await page.locator(".receivedImages button").first().click();
  await page.locator(".uploadCard").getByText("手机商品图.png", { exact: true }).waitFor();
  assert.equal(assetUploads, 1); assert.equal(imagePosts, 3); assert.equal(videoPosts, 2);
  await secondPage.screenshot({ path: `${out}/phone-upload-mobile.png`, fullPage: true });
  await second.close();
  await page.evaluate(async () => { const { default: userStore } = await import("/src/stores/user.ts"); userStore().setUser({ id: "2", token: "fixture-other-token", role: "user", name: "另一个测试账号" }); });
  // Navigating to the identical hash URL doesn't remount the SPA; reload models a fresh login.
  await page.reload();
  await page.getByRole("heading", { name: "爆款复刻工作台" }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("userId")), "2");
  await page.locator(".draftToolbar [role=status]").filter({ hasText: /编辑后自动保存到账号云端/ }).waitFor();
  assert.equal(await page.locator(".shotCard").count(), 0, "Account switch must not expose another account's draft");
  assert.deepEqual(errors, []);
  assert.ok(cloudWrites > 3);
  console.log(JSON.stringify({ passed: true, imagePosts, videoPosts, quotePosts, polls, cloudWrites, assetUploads, crossDeviceRestored: true, crossDeviceTimelineRestored: true, externalPaidRequests: 0, out }));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ errors, imagePosts, videoPosts }));
  console.error((await page.locator("body").innerText()).slice(-4000)); throw error;
} finally { await context.close(); await browser.close(); }
