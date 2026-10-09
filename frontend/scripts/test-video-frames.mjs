import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename } from "node:path";
import { transformSync } from "esbuild";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
if (!process.env.VIDEO_FIXTURE) throw new Error("Set VIDEO_FIXTURE to a browser-decodable local video");
const code = transformSync(await readFile(new URL("../src/utils/videoFrames.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const file = (await readFile(process.env.VIDEO_FIXTURE)).toString("base64");
const outputDir = process.env.TEST_OUTPUT_DIR || "/tmp/xoi-video-analysis-test";
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<html><body><h1>视频抽帧验收</h1><div id="frames"></div></body></html>');
  const result = await page.evaluate(async ({ code, file, name }) => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    try {
      const { extractAnalysisFrames } = await import(url);
      const bytes = Uint8Array.from(atob(file), (c) => c.charCodeAt(0));
      const video = new File([bytes], name, { type: /\.webm$/i.test(name) ? "video/webm" : "video/mp4" });
      const result = await extractAnalysisFrames({ name, source: video }, new AbortController().signal);
      for (const frame of result.frames) {
        const img = new Image(); img.src = frame.dataUrl; img.width = 160;
        document.querySelector("#frames").append(img);
      }
      const cancelled = new AbortController(); cancelled.abort();
      let aborted = false;
      try { await extractAnalysisFrames({ name, source: video }, cancelled.signal); }
      catch (e) { aborted = e.name === "AbortError"; }
      return { video: result, aborted };
    } finally { URL.revokeObjectURL(url); }
  }, { code, file, name: basename(process.env.VIDEO_FIXTURE) });
  assert.equal(result.video.frames.length, 12);
  assert.ok(result.video.frames[0].time < result.video.duration * 0.1);
  assert.ok(result.video.frames.at(-1).time > result.video.duration * 0.9);
  assert.equal(result.aborted, true);
  await writeFile(`${outputDir}/browser-frames.json`, JSON.stringify(result.video));
  await page.screenshot({ path: `${outputDir}/frames-verified.png` });
  console.log(JSON.stringify({ passed: true, frames: result.video.frames.length, duration: result.video.duration, aborted: result.aborted, outputDir }));
} finally { await browser.close(); }
