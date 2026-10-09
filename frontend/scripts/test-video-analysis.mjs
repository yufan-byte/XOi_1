// Run against a local Vite server. Every API call is intercepted; no account or paid model is used.
// VIDEO_FIXTURE must be a browser-decodable local video. PLAYWRIGHT_MODULE can point to a bundled runtime.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const fixture = process.env.VIDEO_FIXTURE;
if (!fixture) throw new Error("Set VIDEO_FIXTURE to a local MP4 / WebM file");
const outputDir = process.env.TEST_OUTPUT_DIR || "/tmp/xoi-video-analysis-test";
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
let testPage;
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 1050 } });
  await context.addInitScript(() => localStorage.setItem("token", "fixture-only-token"));
  let outcome = "success";
  const requests = [];
  const page = await context.newPage();
  testPage = page;
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/aiAssistant/chat/stream")) {
      const body = route.request().postDataJSON();
      requests.push(body);
      const events = outcome === "success" ? [
        { tool: { name: "analyze_video", state: "running", message: "正在分析抽样帧" } },
        { tool: { name: "analyze_video", state: "complete", message: "已完成视觉分析" } },
        { content: "**视觉分析**：红绿蓝测试画面。基于抽样帧，未读取音轨。复刻提示词：彩色几何图形。<img src=x onerror=alert(1)>" },
      ] : [{ error: "当前模型不支持看图，请选择视觉模型" }];
      await route.fulfill({ contentType: "text/event-stream", body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + (outcome === "success" ? "data: [DONE]\n\n" : "") });
      return;
    }
    let data = [];
    if (pathname === "/api/config") {
      await route.fulfill({ json: { chat_model: "fixture-vision-tools", chat_models: ["fixture-vision-tools"] } }); return;
    }
    if (pathname === "/api/pricing") { await route.fulfill({ json: { success: true, data: [] } }); return; }
    if (pathname === "/api/skills") data = { items: [], installedIds: [] };
    if (pathname.endsWith("/login/self")) data = { id: 1, name: "测试", balance: 100 };
    await route.fulfill({ json: { code: 200, data, message: "success" } });
  });
  page.setDefaultTimeout(60_000);
  await page.goto(`${process.env.LOCAL_UI_URL || "http://localhost:50188"}/#/aiAssistant`, { waitUntil: "commit", timeout: 120_000 });
  await page.getByRole("button", { name: "◉ 分析助手", exact: true }).waitFor();
  await page.getByRole("button", { name: "◉ 分析助手", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole("button", { name: "◉ 抽帧分析", exact: true }).click();
  await page.locator(".analysisHandoff").waitFor({ timeout: 45_000 });
  assert.equal(requests.length, 1);
  const body = requests[0];
  assert.equal(body.agentMode, "analysis");
  assert.equal(body.analysisVideo.frames.length, 12);
  assert.ok(body.analysisVideo.frames.at(-1).time > body.analysisVideo.duration * 0.9);
  assert.ok(body.analysisVideo.frames[0].time < body.analysisVideo.duration * 0.1);
  assert.ok(body.analysisVideo.frames.every((f) => f.dataUrl.startsWith("data:image/jpeg;base64,")));
  assert.equal(await page.locator(".analysisFrameStrip img").count(), 12);
  assert.equal(await page.locator(".messageContent img").count(), 0, "Model HTML must render as text");
  await page.screenshot({ path: `${outputDir}/analysis-desktop.png`, fullPage: true });

  // Ordinary follow-ups keep the complete preceding dialogue and do not resend the video.
  await page.locator("textarea").fill("帮我整理三条改进建议");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".analysisHandoff").length === 2);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].analysisVideo, undefined);
  assert.deepEqual(requests[1].messages.map((m) => m.role), ["user", "assistant"]);

  // A failed vision request is visible as an error, not a completed analysis.
  outcome = "error";
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole("button", { name: "◉ 抽帧分析", exact: true }).click();
  await page.getByText("请求失败: 当前模型不支持看图，请选择视觉模型", { exact: true }).waitFor({ timeout: 45_000 });
  assert.equal(await page.locator(".analysisHandoff").count(), 2);
  assert.equal(await page.locator(".messageWrapper.assistant").last().locator(".typingIndicator").count(), 0);

  // Mode switches archive text-only history, and mobile composer controls stay usable.
  await page.getByRole("button", { name: "▧ 画布创作", exact: true }).click();
  await page.getByRole("button", { name: "◉ 分析助手", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const collapse = page.getByRole("button", { name: "收起侧栏", exact: true });
  if (await collapse.isVisible()) await collapse.click();
  const modeBounds = await page.locator(".assistantModeBar").boundingBox();
  assert.ok(modeBounds && modeBounds.x + modeBounds.width <= 390, "Mobile controls must fit beside the collapsed navigation");
  await page.screenshot({ path: `${outputDir}/analysis-mobile.png`, fullPage: true });
  const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("xo_assistant_sessions")).map(([, value]) => value).join(""));
  assert.ok(!stored.includes("data:image/jpeg;base64"), "Do not persist sampled images in conversation history");

  // Remove the failed video's chip before transferring the successful report to canvas.
  await page.setViewportSize({ width: 1365, height: 1050 });
  await page.getByRole("button", { name: "分析历史", exact: true }).click();
  await page.locator(".conversationList li").first().click();
  await page.locator(".editorSkills button").filter({ hasText: /mp4|webm/ }).click();
  await page.locator(".analysisHandoff").first().click();
  await page.waitForURL(/#\/canvas/);
  const handoff = await page.evaluate(() => JSON.parse(localStorage.getItem("xoi_canvas_handoff_v1")));
  assert.match(handoff.prompt, /复刻提示词/);
  assert.equal(handoff.assets.length, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, chatRequests: requests.length, frameCount: body.analysisVideo.frames.length, outputDir }));
} catch (e) {
  console.error("Browser errors:", errors);
  if (testPage) {
    await testPage.screenshot({ path: `${outputDir}/failure.png`, fullPage: true }).catch(() => {});
    console.error((await testPage.locator("body").innerText().catch(() => "")).slice(0, 2000));
  }
  throw e;
} finally { await browser.close(); }
