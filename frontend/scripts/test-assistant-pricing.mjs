// Isolated browser fixtures only: no model requests, no real user tokens, no external traffic.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.LOCAL_UI_URL || "http://localhost:50188", out = "/tmp/xoi-assistant-pricing";
await mkdir(out, { recursive: true });
const models = [
  { modelName: "fixture-text", name: "测试思考模型", type: "text", price: { yuan: 2, unit: "百万输入 Token" }, outputPrice: { yuan: 4 } },
  { modelName: "fixture-text-other", name: "测试文本备选", type: "text", price: { yuan: 3, unit: "百万输入 Token" }, outputPrice: { yuan: 6 } },
  { modelName: "fixture-image", name: "测试生图", type: "image", price: { yuan: .1854, unit: "次" } },
  { modelName: "fixture-video", name: "测试视频", type: "video", price: { yuan: 2.5, unit: "5 秒示例" }, rates: [{ resolution: "720p", yuan: .5, points: .5, unit: "秒" }] },
].map(row => ({ ...row, id: "newapi", value: row.modelName, label: row.name, series: "测试", recommended: true, displayPrice: "旧价格，未换算" }));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await context.addInitScript(() => {
  localStorage.setItem("token", "fixture-no-account"); localStorage.setItem("userId", "1");
  localStorage.setItem("setting", JSON.stringify({ baseUrl: "/api" }));
  for (const owner of ["1", "current"]) localStorage.setItem(`xoi.platform-welcome.v1:${owner}`, "done");
});
let paidRequests = 0, quotes = 0; const errors = [];
await context.route("**/*", async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== new URL(base).origin) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  const path = url.pathname;
  if (/\/v1\/(chat|images|videos|audio)/.test(path) || /canvas-(image|video)/.test(path)) { paidRequests++; return route.abort(); }
  if (path === "/api/config") return route.fulfill({ json: { chat_model: "fixture-text", image_model: "fixture-image", video_model: "fixture-video", model_catalog: models } });
  if (path === "/api/modelSelect/getModelList") return route.fulfill({ json: { data: models.filter(model => model.type === request.postDataJSON().type) } });
  if (path === "/api/model-catalog/quote") { quotes++; const { model } = request.postDataJSON(); const yuan = model === "fixture-video" ? 2.5 : model === "fixture-image" ? .1854 : model === "fixture-text-other" ? .02 : .006; return route.fulfill({ json: { data: { yuan, points: yuan, note: "模拟旧 points 字段，必须以 yuan 换算" } } }); }
  if (path === "/api/login/self") return route.fulfill({ json: { data: { id: "1", name: "测试账号", balance: 1 } } });
  return route.fulfill({ json: { code: 200, data: [], message: "success" } });
});
const page = await context.newPage(); page.setDefaultTimeout(60000); page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto(`${base}/#/aiAssistant`);
  await page.locator(".composerBillingBar").getByText(/0.06 积分/).waitFor();
  assert.match(await page.locator(".composerBillingBar").innerText(), /1 元 = 10 积分/);
  assert.equal(await page.locator(".billingGuideCard").count(), 0);
  const input = page.getByRole("textbox", { name: "描述创作目标，或让我继续操作画布" });
  for (const [category, title] of [["品牌设计", "品牌视觉"], ["影视创意", "电影感分镜"], ["电商广告", "商品主图"], ["游戏创意", "角色设定"], ["网页设计", "品牌官网"]]) {
    await page.getByRole("tab", { name: category, exact: true }).click();
    await input.fill("");
    await page.locator(".composerExamples").getByRole("button", { name: new RegExp(title) }).click();
    assert.ok((await input.inputValue()).length > 20); assert.equal(paidRequests, 0);
  }
  await input.fill("保留我正在编辑的内容"); await page.getByRole("tab", { name: "影视创意", exact: true }).click();
  assert.equal(await input.inputValue(), "保留我正在编辑的内容");
  await input.fill(""); await input.press("Tab"); assert.match(await input.inputValue(), /城市夜景/);
  await input.fill("");
  assert.equal(await page.locator(".creationExamples").count(), 0);
  assert.equal(await page.locator(".composerExamples").count(), 1);
  assert.ok(await page.locator(".composerExamples").evaluate(element => element.getBoundingClientRect().height < 36));
  assert.ok(await page.locator(".creationDockMascot").evaluate(element => Math.abs(element.getBoundingClientRect().bottom - element.parentElement.getBoundingClientRect().top) < 12));
  assert.equal(await page.locator(".toolbarLeft .skillButton").isVisible(), true);
  assert.equal(await page.locator(".toolbarLeft .composerSetting").count(), 2);
  await page.getByRole("button", { name: /计费说明/ }).click();
  await page.locator(".billingCalculation").getByText(/¥0.006 × 10 = 0.06 积分/).waitFor();
  await page.locator(".billingGuide").getByText(/1.854 积分/).waitFor();
  await page.locator(".billingGuide").getByText(/25 积分/).waitFor();
  await page.locator(".modelSlot").getByRole("combobox").click();
  await page.getByRole("option", { name: /测试思考模型/ }).getByText(/输入 20 \/ 输出 40 积分/).waitFor();
  await page.getByRole("option", { name: /测试文本备选/ }).click();
  await page.locator(".composerBillingBar").getByText(/0.2 积分/).waitFor();
  await page.getByRole("button", { name: /收起说明/ }).click();
  await page.locator(".billingGuide").waitFor({ state: "hidden" });
  await page.locator(".creationDock").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".creationDock").scrollIntoViewIfNeeded();
  const overflow = await page.locator(".aiAssistant").evaluate(element => ({ scroll: element.scrollWidth, width: element.clientWidth, escaping: [...element.querySelectorAll("*")].filter(child => child.getBoundingClientRect().right > innerWidth + 2 && getComputedStyle(child).position !== "absolute").slice(0,10).map(child => ({ cls: child.className, width: child.getBoundingClientRect().width })) }));
  assert.ok(overflow.scroll <= overflow.width + 2, JSON.stringify(overflow));
  assert.ok(await page.locator(".upstreamComposer").evaluate(element => element.getBoundingClientRect().right <= innerWidth + 2));
  await page.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  assert.deepEqual(errors, []); assert.equal(paidRequests, 0);
  console.log(JSON.stringify({ passed: true, categories: 5, quotes, externalPaidRequests: 0, out }));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ errors, paidRequests, quotes, body: (await page.locator("body").innerText()).slice(-3000) }));
  throw error;
} finally { await context.close(); await browser.close(); }
