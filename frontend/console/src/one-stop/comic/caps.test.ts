import { test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogModel } from "@/lib/models";
import type { MfVideoCaps } from "../multiframe/video-caps";
import { aspectOf, groupByVoice, imageRefCap, joinPcm, parseDialogue, resolutionOf, sampleLine, shotSeconds, speakerVoice, videoBillParams, videoRefLimit } from "./caps";
import { priceTiers } from "@/lib/models";
import { unitCost } from "@/lib/estimate";

const caps = (over: Partial<MfVideoCaps> = {}): MfVideoCaps => ({ frame: "first-frame", durations: [], resolutions: [], ratios: [], sendMode: false, ...over });
const model = (over: Partial<CatalogModel>) => ({ id: "m", name: "M", paramSchema: {}, ...over }) as unknown as CatalogModel;

test("每镜时长：对齐到线路档位，固定时长优先", () => {
  const c = caps({ durations: [5, 10] });
  assert.equal(shotSeconds({}, {}, c), 5);
  assert.equal(shotSeconds({}, { videoSeconds: 8 }, c), 10);
  assert.equal(shotSeconds({}, { videoSeconds: 12 }, c), 10);
  assert.equal(shotSeconds({ fixedShotSec: 4 }, { videoSeconds: 10 }, c), 5);
  assert.equal(shotSeconds({}, { videoSeconds: 8 }, caps()), 8); // 线路没写档位时用老选项 4/5/8/10
  assert.equal(shotSeconds({}, { videoSeconds: 8 }), 8);
});

test("清晰度：线路没列就不发；老项目的 默认/高清 迁移到 720p/1080p，做不到取第一档", () => {
  assert.equal(resolutionOf({ spec: "默认" }, caps()), undefined);
  assert.equal(resolutionOf({ spec: "默认" }, caps({ resolutions: ["480p", "720p", "1080p"] })), "720p");
  assert.equal(resolutionOf({ spec: "高清" }, caps({ resolutions: ["480p", "720p", "1080p"] })), "1080p");
  assert.equal(resolutionOf({ spec: "高清" }, caps({ resolutions: ["720p"] })), "720p");
  assert.equal(resolutionOf({ spec: "高清", resolution: "1080p" }, caps({ resolutions: ["720p", "1080p"] })), "1080p");
  assert.equal(resolutionOf({ spec: "默认", resolution: "480p" }, caps({ resolutions: ["480p", "720p", "1080p"] })), "480p");
  // 抽屉选了 1080p 之后又在「输入」那一步改回「默认」：以后改的为准
  assert.equal(resolutionOf({ spec: "默认", resolution: "1080p" }, caps({ resolutions: ["720p", "1080p"] })), "720p");
  assert.equal(resolutionOf({ spec: "高清", resolution: "720p" }, caps({ resolutions: ["720p", "1080p"] })), "1080p");
  assert.equal(resolutionOf({ spec: "默认", resolution: "4k" }, caps({ resolutions: ["1080p"] })), "1080p");
});

test("清晰度：「高清」做不到 1080p 时取线路最高的一档，不是第一档（Seedance line1 / Grok 只有 480p、720p）", () => {
  assert.equal(resolutionOf({ spec: "高清" }, caps({ resolutions: ["480p", "720p"] })), "720p");
  assert.equal(resolutionOf({ spec: "高清", resolution: "720p" }, caps({ resolutions: ["480p", "720p"] })), "720p");
  assert.equal(resolutionOf({ spec: "高清" }, caps({ resolutions: ["720p", "2k", "480p"] })), "2k");
  assert.equal(resolutionOf({ spec: "默认" }, caps({ resolutions: ["480p", "720p"] })), "720p");
  assert.equal(resolutionOf({ spec: "默认", resolution: "480p" }, caps({ resolutions: ["480p", "720p"] })), "480p");
});

// 线上 seedance2.5-line1（2026-10-04）：720p ¥0.91/秒、480p（default 档）¥0.588/秒、带参考视频另有加价档
const LINE25 = `(!(u("billing_resolution") in ["720p"]) && u("billing_ref_video") == "true") ? tier("480p|true", u("seconds") * 0.9408) : ((u("billing_resolution") == "720p" && !(u("billing_ref_video") in ["true"])) ? tier("720p|false", u("seconds") * 0.91) : ((u("billing_resolution") == "720p" && u("billing_ref_video") == "true") ? tier("720p|true", u("seconds") * 1.456) : (tier("default", u("seconds") * 0.588))))`;
test("漫剧视频报价参数与视频页同一套：按实际发出的清晰度取档，ref_video 记 false", () => {
  const c = caps({ resolutions: ["480p", "720p"] });
  assert.deepEqual(videoBillParams({ spec: "默认" }, c), { resolution: "720p", ref_video: "false" });
  assert.deepEqual(videoBillParams({ spec: "默认" }, caps()), { ref_video: "false" });   // 线路没列清晰度：不发，网关走 default
  const m = model({ billingUnit: "per_second", priceUsd: 0.588, priceTiers: priceTiers(LINE25, false) });
  assert.ok(Math.abs(unitCost(m, 5, videoBillParams({ spec: "默认" }, c))! - 4.55) < 1e-9);
  assert.ok(Math.abs(unitCost(m, 5, videoBillParams({ spec: "默认", resolution: "480p" }, c))! - 2.94) < 1e-9);
});

test("比例：线路不认项目画幅时取它的第一项", () => {
  assert.equal(aspectOf("9:16", caps({ ratios: ["16:9", "9:16"] })), "9:16");
  assert.equal(aspectOf("1:1", caps({ ratios: ["16:9", "9:16"] })), "16:9");
  assert.equal(aspectOf("1:1", caps()), "1:1");
});

test("图片模型参考图上限：有字段按 max_items（默认 4）、有卡片无字段为 0、无卡片的老线路按 4、未知模型 undefined", () => {
  assert.equal(imageRefCap(undefined), undefined);
  assert.equal(imageRefCap(model({ paramSchema: {} })), 4);
  assert.equal(imageRefCap(model({ paramSchema: { size: {} } })), 0);
  assert.equal(imageRefCap(model({ paramSchema: { images: { max_items: 10 } } })), 10);
  assert.equal(imageRefCap(model({ paramSchema: { image: {} } })), 4);
});

test("视频参考图张数：只有参考图模式的线路才带定妆图", () => {
  assert.equal(videoRefLimit(undefined), 0);
  assert.equal(videoRefLimit(model({ paramSchema: {} })), 0); // 老线路按首帧
  assert.equal(videoRefLimit(model({ aicost: { images: 9, firstFrame: false, durations: [], ratios: [] } as never })), 9);
  assert.equal(videoRefLimit(model({ aicost: { images: 1, firstFrame: true, durations: [], ratios: [] } as never })), 0);
  assert.equal(videoRefLimit(model({ paramSchema: { mode: { enum: ["reference"] }, images: { max_items: 6 } } })), 6);
});

test("台词按行拆角色，舞台提示去掉，旁白没有角色", () => {
  assert.deepEqual(parseDialogue("林晚（冷笑）：你终于来了。\n\n沈舟: 我一直都在\n远处传来钟声\n路人：  "), [
    { speaker: "林晚", text: "你终于来了。" }, { speaker: "沈舟", text: "我一直都在" }, { text: "远处传来钟声" },
  ]);
  assert.deepEqual(parseDialogue(""), []);
});

test("说话人匹配角色资产的音色", () => {
  const assets = [{ kind: "character", name: "林晚（少女）", voice: "nova" }, { kind: "scene", name: "沈舟", voice: "echo" }, { kind: "character", name: "老周" }];
  assert.equal(speakerVoice(assets, "林晚"), "nova");
  assert.equal(speakerVoice(assets, "沈舟"), undefined); // 场景资产不算
  assert.equal(speakerVoice(assets, "老周"), undefined); // 没设音色
  assert.equal(speakerVoice(assets, undefined), undefined);
});

test("相邻同音色合并成一次合成", () => {
  assert.deepEqual(groupByVoice([{ voice: "a", text: "1" }, { voice: "a", text: "2" }, { voice: "b", text: "3" }, { voice: "a", text: "4" }]), [{ voice: "a", text: "1\n2" }, { voice: "b", text: "3" }, { voice: "a", text: "4" }]);
});

test("多段配音首尾拼接，段间留停顿", () => {
  const out = joinPcm([new Float32Array([0.5, 0.5]), new Float32Array([-0.5])], 4, 0.5);
  assert.deepEqual(Array.from(out), [0.5, 0.5, 0, 0, -0.5]);
  assert.equal(joinPcm([], 22050).length, 0);
});

test("试听短句按剧集语言", () => {
  assert.equal(sampleLine("中文", "林晚"), "你好，我是林晚。");
  assert.equal(sampleLine("英文", "Ava"), "Hi, I'm Ava.");
  assert.equal(sampleLine("未知语言", "林晚"), "你好，我是林晚。");
});
