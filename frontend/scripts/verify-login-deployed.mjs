// Isolated, anonymous browser; read-only public page/config requests, never submit credentials.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.XOI_TEST_BASE || "http://localhost:12121";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  let scenes = 0, credentialRequests = 0;
  page.on("request", request => {
    if (request.url().includes("orbit-scene-")) scenes++;
    if (new URL(request.url()).pathname === "/api/login/login") credentialRequests++;
  });
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('[role="dialog"] input[autocomplete="username"]')) {
        window.formReadyMs = performance.now(); observer.disconnect();
      }
    });
    observer.observe(document, { subtree: true, childList: true });
  });
  await page.goto(base + "/console/login?next=/%23/project", { waitUntil: "domcontentloaded" });
  await page.getByRole("dialog").waitFor();
  const result = await page.evaluate(() => ({
    path: location.pathname + location.search,
    target: JSON.parse(sessionStorage.getItem("xoi.login-return.v1") || "null")?.target,
    formReadyMs: Math.round(window.formReadyMs),
    initialScriptBytes: performance.getEntriesByType("resource").filter(r => /\/assets\/index-.*\.js$/.test(r.name)).reduce((sum, r) => sum + r.encodedBodySize, 0),
    referrerPolicy: document.querySelector('meta[name="referrer"]')?.content,
  }));
  assert.equal(result.path, "/console/login");
  assert.equal(result.target, "/#/project");
  assert.equal(result.referrerPolicy, "same-origin");
  assert.equal(scenes, 0);
  assert.equal(credentialRequests, 0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("xoi.login-return.v1")).target), "/#/project");
  console.log(JSON.stringify({ passed: true, ...result, directForm: true, no3DDownload: true, survivesReload: true, realLoginRequests: credentialRequests, paidRequests: 0 }));
} finally { await browser.close(); }
