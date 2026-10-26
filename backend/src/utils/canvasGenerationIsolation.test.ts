import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import { MediaRequestLinks, exactRecoveredImage } from "../lib/workspace/mediaRequestLinks";
import { canvasVideoRequest } from "./canvasVideoRequest";
import { queueRequest } from "../lib/workspace/queueRequest";
import { runWithGatewayUser, getGatewayRequestContext } from "../lib/gateway/context";

test("30s/480p/ratio/audio and every reference survive browser → route → persistent queue", () => {
  const request = canvasVideoRequest({ model: "seedance2.5-line1-xoi", seconds: 30, resolution: "480p", aspect_ratio: "21:9", generate_audio: "false", images: ["https://fixture.invalid/1.png"], videos: [{url:"https://fixture.invalid/1.mp4"}], audios: ["https://fixture.invalid/1.mp3"] });
  const queued = queueRequest("video", request);
  assert.equal(queued.duration, 30); assert.equal(queued.resolution, "480p"); assert.equal(queued.aspect_ratio, "21:9"); assert.equal(queued.generate_audio, false);
  assert.equal(queued.images.length, 1); assert.equal(queued.videos.length, 1); assert.equal(queued.audios.length, 1);
  assert.equal(canvasVideoRequest({video_generate_audio:"true",video_watermark:"false",seconds:-1}).duration, -1);
  assert.equal(canvasVideoRequest({video_generate_audio:"true",video_watermark:"false"}).generate_audio, true);
  assert.equal(canvasVideoRequest({video_generate_audio:"true",video_watermark:"false"}).watermark, false);
  const scoped = canvasVideoRequest({}, {"x-video-task-source-id":"canvas-one","x-video-task-node-id":"video-node"});
  assert.equal(scoped.source_id,"canvas-one"); assert.equal(scoped.node_id,"video-node");
});

test("identical prompts cannot claim another request's image", () => {
  const items = ["other", "mine"].map(request_id => ({request_id,model:"fixture",status:"success",prompt:"相同提示词",images:[{url:`https://fixture.invalid/${request_id}.png`}]}));
  assert.equal(exactRecoveredImage(items, ["mine"], "newapi:fixture"), "https://fixture.invalid/mine.png");
  assert.equal(exactRecoveredImage(items, [], "fixture"), null);
  assert.equal(exactRecoveredImage(items, ["missing"], "fixture"), null);
  assert.equal(exactRecoveredImage(items, ["mine"], "other-model"), null);
  assert.equal(exactRecoveredImage([...items,items[1]], ["mine"], "fixture"), null);
});

test("request correlation is isolated by account, task and kind", async t => {
  const db = knex({client:"better-sqlite3",connection:{filename:":memory:"},useNullAsDefault:true,pool:{min:1,max:1}});
  t.after(() => db.destroy());
  await db.schema.createTable("xoi_generation_tasks", table => {table.integer("user_id");table.string("kind");table.string("task_id");});
  await db("xoi_generation_tasks").insert([{user_id:1,kind:"image",task_id:"one"},{user_id:2,kind:"image",task_id:"two"}]);
  const links = new MediaRequestLinks(db);
  await Promise.all([links.record(1,"image","one","r1"),links.record(2,"image","two","r2")]);
  await links.record(2,"image","one","malicious");
  assert.deepEqual(await links.list(1,"image","one"), ["r1"]);
  assert.deepEqual(await links.list(2,"image","one"), []);
  assert.deepEqual(await links.list(1,"video","one"), []);
});

test("concurrent asynchronous requests retain their own account and billing context", async () => {
  const jobs = Array.from({length:40},(_,index) => runWithGatewayUser(index+1, async () => {
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(getGatewayRequestContext()?.userId,index+1);
    assert.equal(getGatewayRequestContext()?.billingId,`billing-${index}`);
  },`billing-${index}`));
  await Promise.all(jobs); assert.equal(getGatewayRequestContext(),undefined);
});
