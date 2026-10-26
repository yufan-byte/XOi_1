/** Explicit local Agnes-only image/video smoke. No paid fallback or pricing mutations. */
import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";
const db = new pg.Client({
  connectionString:
    process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL,
  connectionTimeoutMillis: 5000,
});
async function main() {
  assert.equal(process.env.XOI_RUN_FREE_ONE_STOP_SMOKE, "1");
  for (const value of [
    process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL,
    process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000",
  ])
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value!).hostname),
    );
  await db.connect();
  const user = (await db.query("SELECT session_version FROM o_user WHERE id=1"))
    .rows[0];
  assert.ok(user);
  const secret = (
    await db.query("SELECT value FROM o_setting WHERE key=$1", ["tokenKey"])
  ).rows[0].value;
  const authorization =
    "Bearer " +
    jwt.sign(
      { id: 1, session_version: Number(user.session_version || 0) },
      secret,
      { expiresIn: 1200 },
    );
  const api = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch("http://localhost:12121/api" + path, {
      method,
      headers: { authorization, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
    const value = (await r.json()) as any;
    if (!r.ok || value.success === false)
      throw Error(
        `${method} ${path}: HTTP ${r.status}: ${value.message || "request failed"}`,
      );
    return value.data;
  };
  const catalog = await api("/model-catalog");
  const names = {
    chat: "agnes-2.5-flash",
    image: "agnes-image-2.5-flash",
    video: process.env.XOI_FREE_VIDEO_MODEL || "agnes-video-2.5-flash",
  };
  assert.match(names.video,/^agnes-video-2\.5(?:-flash)?$/);
  for (const name of Object.values(names))
    assert.ok(
      catalog.some((m: any) => m.modelName === name && m.price?.yuan === 0),
      `No explicit zero pricing for ${name}; abort without generation`,
    );
  const id = crypto.randomUUID(),
    p = {
      id,
      name: "[验收]Agnes免费图片视频链路",
      idea: "青衣少年在仙山云海之上御剑启程。",
      description: "仅免费测试账号，两次独立生成，无收费模型",
      kind: "premium",
      style: "精致国漫",
      ratio: "16:9",
      region: "国产剧 · 中文",
      episodeCount: 1,
      episodeSeconds: 5,
      fixedShotSec: 5,
      spec: "默认",
      schedule: "渐进式",
      voice: "alloy",
      models: names,
      assets: [],
      done: {
        input: true,
        intent: true,
        direction: true,
        outline: true,
        novel: true,
        script: true,
        assets: true,
      },
      log: [],
      stage: "storyboard",
      status: "进行中",
      createdAt: Date.now(),
      script: {
        title: "仙山启程",
        synopsis: "青衣少年御剑",
        episodes: [
          {
            title: "启程",
            scenes: [
              {
                id: "e1s1",
                location: "仙山",
                time: "清晨",
                characters: ["少年"],
                action: "青衣少年御剑飞过云海，镜头缓慢向前推进",
                dialogue: "",
                shotPrompt:
                  "电影构图，青衣少年背对镜头站在云海山巅，精致国漫，柔和晨光，无文字无水印",
              },
            ],
          },
        ],
      },
    };
  const reuse=process.env.XOI_FREE_KEYFRAME_PROJECT;
  if(reuse){
    const original=await api('/one-stop/documents/'+reuse+'?collection=comic');assert.match(original.payload.description,/真实免费渠道验收/);
    const frame=original.payload.script?.episodes?.[0]?.scenes?.[0];assert.ok(frame?.imageUrl?.startsWith('/oss/one-stop/1/'));
    p.name='[验收]Agnes 2.5 AI视频通路';p.description='真实免费渠道验收：复用已生成分镜，仅验证另一个零价视频型号';
    p.script={title:'仙山晨光·AI视频验收',synopsis:'仅免费AI视频测试',episodes:[{title:'晨光',scenes:[{...frame,id:'e1s1',videoUrl:undefined,videoTaskId:undefined,videoStatus:undefined,videoSource:undefined,chainFrom:undefined}]}]};
  }
  await api("/one-stop/documents/" + id, "PUT", {
    collection: "comic",
    revision: 0,
    title: p.name,
    payload: p,
  });
  console.log(
    JSON.stringify({ projectId: id, phase: "created", paidRequests: 0 }),
  );
  const results = [];
  for (const operation of (reuse?["scene-video"]:["storyboard-image", "scene-video"])) {
    const request = { projectId: id, operation, target: "e1s1" },
      quote = await api("/one-stop/generation/quote", "POST", request);
    assert.equal(quote.free, true, "Authoritative free-only quote required");
    assert.ok(
      quote.quotes.every((q: any) => q.points === 0 && /^agnes-/.test(q.model)),
    );
    const job = await api("/one-stop/generation/jobs", "POST", {
      request,
      revision: quote.revision,
      points: 0.001,
      automatic:true,
      clientId: crypto.randomUUID(),
    });
    console.log(
      JSON.stringify({
        phase: "submitted",
        operation,
        taskId: job.id,
        freeOnly: true,
      }),
    );
    let task: any;
    for (let i = 0; i < 180; i++) {
      task = await api("/one-stop/generation/jobs/" + job.id);
      if (!["queued", "running"].includes(task.status)) break;
      if (i % 12 === 0)
        console.log(
          JSON.stringify({
            phase: "waiting",
            operation,
            status: task.status,
            elapsedSeconds: i * 4,
          }),
        );
      await new Promise((r) => setTimeout(r, 4000));
    }
    if (task.status !== "succeeded")
      throw Error(
        JSON.stringify({
          projectId: id,
          taskId: job.id,
          operation,
          status: task.status,
          error: task.error || "Still running; not retried",
        }),
      );
    const budget = (
      await db.query(
        "SELECT calls,free_only FROM xoi_model_budgets WHERE user_id=1 AND billing_id=$1",
        [job.billingId],
      )
    ).rows[0];
    assert.equal(budget.free_only, true);
    assert.equal(budget.calls, 1);
    const receipt = await api(
      "/one-stop/generation/jobs/" + job.id + "/receipt",
    );
    assert.equal(receipt.receipt.points, 0);
    assert.match(
      task.result.url,
      new RegExp(
        "^/oss/one-stop/1/[a-f0-9-]+\\." +
          (operation === "scene-video" ? "mp4" : "png") +
          "$",
      ),
    );
    const media = await fetch("http://localhost:12121" + task.result.url, {
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(media.status, 200);
    const bytes = Buffer.from(await media.arrayBuffer());
    assert.ok(bytes.length > 1000);
    if (operation === "scene-video")
      assert.ok(bytes.subarray(0, 100).includes(Buffer.from("ftyp")));
    else
      assert.ok(
        bytes.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71])) ||
          bytes[0] === 255,
      );
    results.push({
      operation,
      url: task.result.url,
      receiptPoints: 0,
      bytes: bytes.length,
    });
    console.log(JSON.stringify({ phase: "passed", ...results.at(-1) }));
  }
  const row = await api("/one-stop/documents/" + id + "?collection=comic");
  const scene = row.payload.script.episodes[0].scenes[0];
  assert.ok(scene.imageUrl && scene.videoUrl && row.revision >= (reuse?2:3));
  console.log(
    JSON.stringify({
      passed: true,
      projectId: id,
      realFreeMediaCalls: reuse?1:2,
      paidRequests: 0,
      serverRestore: true,
      results,
      testProjectRetained: true,
    }),
  );
}
void main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
