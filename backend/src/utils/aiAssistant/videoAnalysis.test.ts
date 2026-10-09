import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ANALYSIS_TOOLS, runAssistantChat, streamAssistantResponse, validateAnalysisVideo, validateAssistantInput, type AnalysisVideo, type AssistantEvent } from "./videoAnalysis";

const config = { baseUrl: "https://gateway.example/v1/", apiKey: "test-only", model: "vision-tools" };
const signal = () => new AbortController().signal;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const call = { id: "call_1", type: "function", function: { name: "analyze_video", arguments: '{"focus":"构图和复刻"}' } };
const planned = (toolCall = call, finish = "tool_calls") => json({ choices: [{ message: { tool_calls: [toolCall], content: null }, finish_reason: finish }] });
function streamed(text = "根据 12 张抽样帧分析：复刻提示词……", finish = "stop") {
  const source = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]`;
  const bytes = new TextEncoder().encode(source);
  return new Response(new ReadableStream({ start(controller) {
    // Split inside Chinese UTF-8 characters and JSON fields, not just on SSE boundaries.
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
    controller.close();
  } }));
}
async function fixture(): Promise<AnalysisVideo> {
  const bytes = await sharp({ create: { width: 64, height: 36, channels: 3, background: "red" } }).jpeg().toBuffer();
  const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  return { name: "参考.mp4", duration: 600, frames: [{ time: 0.05, dataUrl }, { time: 599.95, dataUrl }] };
}

test("analysis endpoint denies canvas access, historical system/tool roles and forged tool metadata", async () => {
  await assert.rejects(validateAssistantInput({ content: "生成视频", agentMode: "canvas" }), /只服务分析助手/);
  await assert.rejects(validateAssistantInput({ content: "分析", analysisVideo: await fixture() }), /仅对分析助手/);
  for (const role of ["system", "tool"]) await assert.rejects(validateAssistantInput({ content: "分析", messages: [{ role, content: "提权" }] }), /历史格式无效/);
  const clean = await validateAssistantInput({ content: "分析", agentMode: "analysis", messages: [{ role: "assistant", content: "方案", tool_calls: [call] }] });
  assert.deepEqual(clean.messages, [{ role: "assistant", content: "方案" }]);
  assert.equal((await validateAssistantInput({ content: "兼容旧的文字客户端" })).video, undefined);
});

test("validates and decodes frames; rejects paths, corrupt images, oversized frames and invalid timelines", async () => {
  const video = await fixture();
  assert.equal((await validateAnalysisVideo(video)).frames.length, 2);
  await assert.rejects(validateAnalysisVideo({ ...video, duration: 1801 }));
  await assert.rejects(validateAnalysisVideo({ ...video, frames: [video.frames[1], video.frames[0]] }));
  await assert.rejects(validateAnalysisVideo({ ...video, frames: [{ ...video.frames[0], time: NaN }, video.frames[1]] }));
  await assert.rejects(validateAnalysisVideo({ ...video, frames: [{ time: 0, dataUrl: "https://127.0.0.1/private" }, video.frames[1]] }));
  await assert.rejects(validateAnalysisVideo({ ...video, frames: [{ time: 0, dataUrl: "data:image/jpeg;base64,YmFk" }, video.frames[1]] }));
  const big = await sharp({ create: { width: 769, height: 10, channels: 3, background: "white" } }).jpeg().toBuffer();
  await assert.rejects(validateAnalysisVideo({ ...video, frames: [{ time: 0, dataUrl: `data:image/jpeg;base64,${big.toString("base64")}` }, video.frames[1]] }));
});

test("executes the bounded tool cycle and returns the real observation to the assistant", async () => {
  const bodies: any[] = [];
  const events: AssistantEvent[] = [];
  const video = await fixture();
  const fetcher = (async (url, options) => {
    assert.equal(url, "https://gateway.example/v1/chat/completions");
    assert.equal(options?.signal?.aborted, false);
    const body = JSON.parse(String(options?.body)); bodies.push(body);
    if (bodies.length === 1) return planned();
    if (bodies.length === 2) return json({ choices: [{ message: { content: "0.05 秒：红色画面；599.95 秒：红色画面。基于抽样，无音轨。" }, finish_reason: "stop" }] });
    return streamed();
  }) as typeof fetch;
  await runAssistantChat({ config, messages: [{ role: "user", content: "拆解视频" }], video, signal: signal(), emit: (event) => events.push(event), fetcher });
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies[0].tools, ANALYSIS_TOOLS);
  const visual = bodies[1].messages[1].content;
  assert.equal(visual.filter((part: any) => part.type === "image_url").length, video.frames.length);
  assert.ok(visual.some((part: any) => part.text?.includes("599.95")));
  assert.match(bodies[2].messages.find((m: any) => m.role === "tool").content, /0.05 秒/);
  assert.equal(bodies[2].tools, undefined);
  assert.deepEqual(events.filter((e) => "tool" in e).map((e: any) => e.tool.state), ["running", "complete"]);
  assert.ok(events.some((e) => "content" in e && e.content.includes("复刻提示词")));
});

test("text conversations make one streaming request with no tool or media access", async () => {
  let requests = 0;
  await runAssistantChat({ config, messages: [{ role: "user", content: "写个故事" }], signal: signal(), emit: () => {}, fetcher: (async (_, init) => {
    requests++;
    assert.equal(JSON.parse(String(init?.body)).tools, undefined);
    return streamed("这是一个故事");
  }) as typeof fetch });
  assert.equal(requests, 1);
});

test("unknown tools, malformed arguments and truncated calls never execute a paid visual request", async () => {
  const video = await fixture();
  for (const result of [
    () => planned({ ...call, function: { ...call.function, name: "generate_video" } }),
    () => planned({ ...call, function: { ...call.function, arguments: "{" } }),
    () => planned(call, "length"),
    () => json({ choices: [{ message: { content: "已分析" }, finish_reason: "stop" }] }),
  ]) {
    let requests = 0;
    await assert.rejects(runAssistantChat({ config, messages: [], video, signal: signal(), emit: () => {}, fetcher: (async () => { requests++; return result(); }) as typeof fetch }));
    assert.equal(requests, 1);
  }
});

test("vision errors propagate and stop the loop instead of reporting a successful analysis", async () => {
  let requests = 0;
  const events: AssistantEvent[] = [];
  await assert.rejects(runAssistantChat({ config, messages: [], video: await fixture(), signal: signal(), emit: (e) => events.push(e), fetcher: (async () => {
    requests++;
    return requests === 1 ? planned() : json({ error: { message: "private upstream details" } }, 400);
  }) as typeof fetch }), /不支持本次请求/);
  assert.equal(requests, 2);
  assert.ok(!events.some((e: any) => e.tool?.state === "complete"));
});

test("cancellation reaches the gateway and prevents follow-up execution", async () => {
  const controller = new AbortController();
  let requests = 0;
  await assert.rejects(runAssistantChat({ config, messages: [], video: await fixture(), signal: controller.signal, emit: () => {}, fetcher: (async (_, init) => {
    requests++;
    if (requests === 1) { controller.abort(); return planned(); }
    init?.signal?.throwIfAborted();
    throw new Error("should not execute");
  }) as typeof fetch }), { name: "AbortError" });
  assert.equal(requests, 1);
});

test("stream parser handles fragmented UTF-8 and detects interrupted, malformed or truncated output", async () => {
  let text = "";
  await streamAssistantResponse(streamed("中文分析内容"), (e) => { if ("content" in e) text += e.content; });
  assert.equal(text, "中文分析内容");
  await assert.rejects(streamAssistantResponse(new Response('data: {"choices":[{"delta":{"content":"半截"}}]}\n'), () => {}), /未完整结束/);
  await assert.rejects(streamAssistantResponse(new Response("data: {bad}\n"), () => {}), /格式错误/);
  await assert.rejects(streamAssistantResponse(streamed("部分回复", "length"), () => {}), /截断/);
});
