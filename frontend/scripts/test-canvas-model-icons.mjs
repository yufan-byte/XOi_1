// Isolated UI regression: every API is mocked; no account or generation requests.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = "http://localhost:12121";
const fixtureModels = [
  ["doubao-seedream-5-0", "豆包 Seedream 5.0", "image", .1854],
  ["gpt-image-2", "GPT Image 2", "image", .12],
  ["gemini-3.1-flash-image", "Gemini 3.1 Flash Image", "image", .1],
  ["agnes-image-2.5-flash", "agnes-image-2.5-flash", "image", 0],
  ["flux-kontext", "FLUX Kontext", "image", .2],
  ["seedance2.5-fast", "即梦 Fast", "video", .39],
  ["gpt-5", "GPT 5", "text", .01],
];
const catalog = fixtureModels.map(([modelName, name, type, yuan], i) => ({
  modelName, name, type, series: name, description: "界面测试，不会调用模型",
  recommended: i < 3, recommendation: "推荐", recommendationRank: 10 - i,
  billingUnit: "per_request", price: { yuan, unit: "次" },
}));
const project = {
  id: "icon-fixture", title: "模型图标检查", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  nodes: [], connections: [], chatSessions: [], activeChatId: null, agentConfig: null,
  autoTitlePending: false, backgroundMode: "lines", showImageInfo: false,
  viewport: { x: 0, y: 0, k: 1 },
  sidePanel: { open: false }, agentPanel: { open: true, width: 440 },
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
let generationAttempts = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.addInitScript(() => {
    localStorage.setItem("token", "fixture-no-account");
    localStorage.setItem("userId", "1");
    localStorage.setItem("setting", JSON.stringify({ baseUrl: "/api" }));
  });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith("/api/")) {
      if (process.env.ATELIER_BUILD_DIR && url.pathname.startsWith("/atelier-canvas/")) {
        const file = resolve(process.env.ATELIER_BUILD_DIR, decodeURIComponent(url.pathname.slice("/atelier-canvas/".length)));
        if (!file.startsWith(resolve(process.env.ATELIER_BUILD_DIR) + "/")) return route.abort();
        try {
          const body = await readFile(file);
          const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".webp": "image/webp", ".svg": "image/svg+xml" }[extname(file)];
          return route.fulfill({ body, contentType: mime || "application/octet-stream" });
        } catch { return route.fulfill({ status: 404 }); }
      }
      return route.continue();
    }
    if (/generation|generate|chat\/completions|responses/.test(url.pathname) && route.request().method() === "POST") {
      generationAttempts++; return route.abort();
    }
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: { id: 1, name: "界面测试", quota: 500000 } } });
    if (url.pathname === "/api/config") return route.fulfill({ json: {
      image_models: fixtureModels.filter(m => m[2] === "image").map(m => m[0]),
      video_models: ["seedance2.5-fast"], chat_models: ["gpt-5"], audio_models: [], api_providers: [],
    } });
    if (url.pathname === "/api/model-catalog") return route.fulfill({ json: { data: catalog } });
    if (url.pathname === "/api/v1/user-config") return route.fulfill({ json: { code: 0, data: { syncCapabilities: { userData: true } } } });
    if (url.pathname === "/api/v1/canvas/projects") return route.fulfill({ json: { code: 0, data: [project] } });
    return route.fulfill({ json: { code: 0, data: [], msg: "success" } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => console.error(error.message));
  await page.goto(base + "/atelier-canvas/index.html#/canvas/icon-fixture");
  await page.getByRole("button", { name: "模型与积分", exact: true }).click();
  await page.getByRole("button", { name: /选择模型：即梦 Fast/ }).locator('[data-model-icon="即梦"] img').waitFor();
  await page.getByRole("button", { name: /选择模型：GPT Image 2/ }).click();
  const panel = page.locator("[data-model-picker-panel]");
  for (const name of ["豆包", "OpenAI", "Google Gemini"]) {
    await panel.locator(`[data-model-icon="${name}"] img`).waitFor();
  }
  await page.waitForFunction(() => [...document.querySelectorAll("[data-model-picker-panel] [data-model-icon] img")].every(img => img.complete && img.naturalWidth > 0));
  assert.match(await panel.innerText(), /1\.854 积分/);
  assert.match(await panel.innerText(), /1\.2 积分/);
  assert.equal(await panel.locator('img[src^="/icons/"]').count(), 0);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await panel.screenshot({ path: "/tmp/xoi-canvas-icons-light.png" });
  // A missing resource must never leave the browser's broken-image placeholder.
  await panel.locator('[data-model-icon="OpenAI"] img').evaluate(img => img.dispatchEvent(new Event("error")));
  await panel.locator('[data-model-icon="OpenAI"] svg').waitFor();
  assert.equal(await panel.locator('[data-model-icon="OpenAI"] img').count(), 0);
  await panel.getByRole("option", { name: /GPT Image 2/ }).click();
  const selected = page.getByRole("button", { name: /选择模型：GPT Image 2/ });
  await selected.locator('[data-model-icon="OpenAI"] img').waitFor();
  await selected.click();
  await panel.getByRole("button", { name: /全部模型/ }).click();
  await panel.locator('[data-model-icon="FLUX"] img').waitFor();
  await panel.locator('[data-model-icon="generic"] svg').waitFor();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForFunction(() => [...document.querySelectorAll("[data-model-picker-panel] img")].every(img => img.complete && img.naturalWidth > 0));
  assert.equal(await panel.locator('[data-model-icon="Google Gemini"] img').evaluate(img => getComputedStyle(img).filter), "none");
  await panel.screenshot({ path: "/tmp/xoi-canvas-icons-dark.png" });
  assert.equal(generationAttempts, 0);
  console.log(JSON.stringify({ passed: true, generationAttempts, verified: ["brand logos", "subpath assets", "price unchanged", "broken-image fallback", "selected-model logo", "unknown-model fallback", "dark theme"] }));
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) { await page.screenshot({ path: "/tmp/xoi-canvas-icons-error.png" }); console.error((await page.locator("body").innerText()).slice(0, 2000)); }
  throw error;
} finally { await browser.close(); }
