import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = (await readFile(new URL("../public/monoform/xoi-video-runtime.js", import.meta.url), "utf8")).replace("export function", "function");
function runtime(supported = () => true) {
  class Encoder {
    static async isConfigSupported(config) { return { supported: supported(config), config }; }
    configure(config) { this.config = config; }
  }
  const document = { documentElement: { dataset: {} } }, window = { VideoEncoder: Encoder };
  runInNewContext(source + "\ninstallPrevizEncoder();", { window, document });
  return { window, document };
}
const config = { codec: "avc1.42001f", width: 1280, height: 720, bitrate: 4e6, latencyMode: "quality" };
test("ordinary MP4 downloads retain the encoder configuration", async () => {
  const { window } = runtime();
  const encoder = new window.VideoEncoder();
  encoder.configure(config);
  assert.deepEqual(encoder.config, config);
  assert.equal((await window.VideoEncoder.isConfigSupported(config)).config, config);
});
test("managed preview avoids quality buffering and preserves codec, size and bitrate", async () => {
  const { window, document } = runtime();
  document.documentElement.dataset.xoiPrevizExport = "true";
  assert.equal((await window.VideoEncoder.isConfigSupported(config)).supported, true);
  const encoder = new window.VideoEncoder();
  encoder.configure(config);
  assert.equal(encoder.config.latencyMode, "realtime");
  assert.equal(encoder.config.hardwareAcceleration, "prefer-software");
  for (const field of ["codec", "width", "height", "bitrate"]) assert.equal(encoder.config[field], config[field]);
});
test("software unavailable uses supported realtime fallback and never advertises an unsupported codec", async () => {
  const { window, document } = runtime(c => c.hardwareAcceleration !== "prefer-software" && c.codec === config.codec);
  document.documentElement.dataset.xoiPrevizExport = "true";
  assert.equal((await window.VideoEncoder.isConfigSupported(config)).supported, true);
  const encoder = new window.VideoEncoder();
  encoder.configure(config);
  assert.equal(encoder.config.latencyMode, "realtime");
  assert.equal(encoder.config.hardwareAcceleration, "no-preference");
  assert.equal((await window.VideoEncoder.isConfigSupported({ ...config, codec: "unsupported" })).supported, false);
});
