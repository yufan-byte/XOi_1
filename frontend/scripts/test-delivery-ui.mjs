// Test delivered pages with isolated fixtures. Every API is intercepted; no real account/model writes.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.XOI_BASE_URL || "http://localhost:12121";
const artifacts = process.env.XOI_QA_DIR || "/tmp/xoi-delivery-ui";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [], calls = [];
const project = { id: 1790988161967, name: "离线也能打开的作品", intro: "交付体验回归", projectType: "script", imageModel: "", videoModel: "", createTime: Date.now(), videoRatio: "16:9", progress: {} };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("token", "Bearer isolated-delivery-fixture"); localStorage.setItem("userId", "501");
    localStorage.setItem("setting", JSON.stringify({ baseUrl: "/api" }));
    for (const owner of ["501", "current"]) localStorage.setItem(`xoi.platform-welcome.v1:${owner}`, "done");
  });
  let projectOffline = true;
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname.startsWith("/socket.io/")) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    calls.push({ path: url.pathname, method: request.method() });
    if (url.pathname === "/api/project/getProject") return route.fulfill(projectOffline
      ? { status: 503, json: { message: "fixture unavailable" } }
      : { json: { code: 200, data: [project] } });
    if (url.pathname === "/api/modelSelect/getModelDetail") throw new Error("Project viewing must not require a generation provider");
    if (url.pathname === "/api/login/self") return route.fulfill({ json: { code: 200, data: { id: 501, name: "交付测试", role: "user", balance: 10 } } });
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: { id: 501, name: "交付测试" } } });
    if (url.pathname === "/api/script/getScrptApi") return route.fulfill({ json: { code: 200, data: [{ id: 91, name: "第一集：离线查阅", content: "上游不可用时，已有作品仍应可查看和导出。", extractState: 1, relatedAssets: [] }] } });
    if (url.pathname === "/api/team") return route.fulfill({ json: { code: 200, data: { role: "none" } } });
    if (url.pathname === "/api/config") return route.fulfill({ json: { chat_models: [], image_models: [] } });
    return route.fulfill({ json: { code: 200, data: [], message: "fixture" } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/#/project");
  await page.getByText("项目列表暂时无法加载", { exact: true }).waitFor();
  assert.equal(await page.getByText("还没有创作项目", { exact: true }).count(), 0);
  await page.screenshot({ path: artifacts + "/project-load-recovery.png" });
  projectOffline = false;
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await page.getByText(project.name, { exact: true }).click();
  await page.waitForURL("**/#/script?projectId=" + project.id);
  await page.getByText("第一集：离线查阅", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(calls.filter(call => call.path === "/api/modelSelect/getModelDetail").length, 0);
  await page.screenshot({ path: artifacts + "/project-open-without-models.png" });
  assert.deepEqual(errors, []);
  await context.close();

  const guest = await browser.newContext();
  await guest.route("**/*", route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  const login = await guest.newPage();
  const requested = "/production?projectId=1790988161967&episode=91";
  await login.goto(base + "/#" + requested);
  await login.waitForURL("**/console/login?**");
  assert.equal(new URL(login.url()).searchParams.get("next"), "/#" + requested);
  await guest.close();
  console.log(JSON.stringify({ passed: true, listFailureNotEmpty: true, retryWorks: true, ownedProjectWithoutModels: true, loginKeepsEpisodeDeepLink: true, uncaughtErrors: errors.length, modelRequests: 0, realWrites: 0, artifacts }));
} finally { await browser.close(); }
