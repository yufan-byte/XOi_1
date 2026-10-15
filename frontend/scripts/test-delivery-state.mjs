// Exercise the production handlers with controlled async boundaries; no model or account writes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const read = p => readFile(process.env.XOI_DELIVERY_SOURCE_DIR ? `${process.env.XOI_DELIVERY_SOURCE_DIR}/${p}` : new URL(`../src/${p}`, import.meta.url), "utf8");
function between(source, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing production handler: ${from}`);
  return source.slice(start, end);
}
async function handlers(source, names, deps) {
  const { code } = await transform(source, { loader: "ts", target: "es2022" });
  return new Function(...Object.keys(deps), `${code};return {${names.join(",")}};`)(...Object.values(deps));
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const storage = () => {
  const values = new Map([["userId", "1"], ["token", "fixture-owner-one"]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test("owned projects open without generation models or an available provider", async () => {
  const source = await read("views/project/index.vue");
  for (const models of [{ imageModel: "", videoModel: "" }, { imageModel: "offline-image", videoModel: "offline-video" }]) {
    const item = { id: "101", projectType: "script", ...models };
    const navigations = [], project = { value: null }, openingProjectId = { value: null };
    const { openProject } = await handlers(between(source, "async function openProject(", "function openEdit("), ["openProject"], {
      allProject: { value: [item] }, project, openingProjectId,
      axios: { post: () => { throw new Error("Viewing must not check the generation provider"); } },
      warmPage: () => {}, router: { push: async value => navigations.push(value) },
      window: { $message: { error: () => {}, warning: () => {} } }, $t: v => v,
      openEdit: () => { throw new Error("Viewing must not require changing project settings"); },
    });
    await openProject("101");
    assert.equal(project.value, item);
    assert.deepEqual(navigations, [{ path: "/script", query: { projectId: "101" } }]);
    assert.equal(openingProjectId.value, null);
  }
});

test("late episode and history responses cannot overwrite the current episode or account", async () => {
  const source = await read("stores/productionAgent.ts");
  const pending = [], episodesId = { value: 1 }, flowData = { value: null }, messages = { value: [] }, localStorage = storage();
  const code = between(source, "    let flowRequestVersion", "    async function batchGenerateStoryboard")
    + between(source, "    const loadingHistory =", "    const thinkLevel =");
  const { getFlowData, getHistory, loadingHistory } = await handlers(code, ["getFlowData", "getHistory", "loadingHistory"], {
    axios: { post: (url, body) => { const job = deferred(); pending.push({ ...job, url, body }); return job.promise; } },
    projectId: "101", episodesId, flowData, messages, localStorage, ref: value => ({ value }), defMsg: [],
  });
  const first = getFlowData(); episodesId.value = 2; const second = getFlowData();
  pending[1].resolve({ data: { script: "episode 2" } }); await second;
  pending[0].resolve({ data: { script: "episode 1" } }); await first;
  assert.equal(flowData.value.script, "episode 2");
  const third = getFlowData(); localStorage.setItem("token", "other-account");
  pending[2].resolve({ data: { script: "old account" } }); await third;
  assert.equal(flowData.value.script, "episode 2");

  const oldHistory = getHistory(); episodesId.value = 3; const currentHistory = getHistory();
  pending[3].resolve({ data: ["episode 2 history"] }); await oldHistory;
  assert.equal(loadingHistory.value, true);
  pending[4].resolve({ data: ["episode 3 history"] }); await currentHistory;
  assert.deepEqual(messages.value, ["episode 3 history"]);
  assert.equal(loadingHistory.value, false);
  const failedHistory = getHistory(); pending[5].reject(new Error("offline"));
  await assert.rejects(failedHistory, /offline/);
  assert.equal(loadingHistory.value, false, "Errors must release the loading indicator");
});

async function exportFixture() {
  const source = await read("views/production/components/workbench/editVideo/videoPreview.vue");
  const composition = deferred(), conversion = deferred(), upload = deferred();
  const project = { id: "101", name: "原项目" }, store = { project };
  const editorRoute = { query: {} }, episodesIdRef = { value: 11 }, localStorage = storage();
  const posts = [], downloads = [], notices = [], emitted = [], binaryUploads = [];
  const code = between(source, "interface OutputArchiveContext", "interface ExportSegment")
    + between(source, "function baseFilename(", "/** 触发浏览器下载")
    + between(source, "async function exportVideo(", "/** Large films")
    + between(source, "async function archiveOutput(", "// 暴露 AVCanvas");
  const functions = await handlers(code, ["exportVideo"], {
    editorRoute, episodesIdRef, localStorage, projectStore: () => store,
    props: { canvasWidth: 1920, canvasHeight: 1080 },
    avCanvas: {}, clipSpriteMap: new Map([[1, {}]]), isPlaying: { value: false },
    playbackStore: {}, getContentDuration: () => 5e6, collectSegments: () => [{ name: "镜头1", start: 0, end: 5 }],
    composeRange: () => composition.promise, blobToBase64: () => conversion.promise,
    saveBlob: (_, filename) => downloads.push(filename), MAX_ARCHIVE_BYTES: 128 * 1024 * 1024,
    LEGACY_OUTPUT_JSON_BYTES: 18 * 1024 * 1024,
    uploadOutputArchive: async (owner, _token, file) => { binaryUploads.push({ owner, bytes: file.size }); await conversion.promise; return `/oss/canvas-files/${owner}/${"a".repeat(32)}.mp4`; },
    axios: { post: (url, body, options) => { posts.push({ url, body, options }); return upload.promise; } },
    window: { $message: { warning: text => notices.push(text), success: text => notices.push(text) } },
    emit: (...args) => emitted.push(args), $t: value => value,
  });
  return { ...functions, composition, conversion, upload, store, editorRoute, episodesIdRef, localStorage, posts, downloads, notices, emitted, binaryUploads };
}

test("export keeps its original project/episode and waits for archival completion", async () => {
  const fixture = await exportFixture();
  let settled = false;
  const exporting = fixture.exportVideo().then(value => { settled = true; return value; });
  fixture.store.project = { id: "202", name: "新项目" }; fixture.episodesIdRef.value = 22;
  fixture.composition.resolve(new Blob(["fixture"], { type: "video/mp4" }));
  await new Promise(r => setImmediate(r));
  fixture.conversion.resolve("data:video/mp4;base64,Zml4dHVyZQ==");
  await new Promise(r => setImmediate(r));
  assert.equal(fixture.posts.length, 1);
  assert.equal(fixture.posts[0].body.projectId, 101);
  assert.equal(fixture.posts[0].body.episodesId, 11);
  assert.match(fixture.posts[0].body.name, /^原项目/);
  assert.match(fixture.downloads[0], /^原项目/);
  assert.equal(settled, false, "Download is not proof of completed archival");
  fixture.upload.resolve({ data: { id: 1 } }); await exporting;
  assert.deepEqual(fixture.emitted, [], "Late completion must not refresh another project");
});

test("account changes and standalone exports never archive into a cached project", async () => {
  for (const changeAt of ["encoding", "reading", "standalone"]) {
    const fixture = await exportFixture();
    if (changeAt === "standalone") fixture.editorRoute.query.mode = "standalone";
    const exporting = fixture.exportVideo();
    if (changeAt === "encoding") fixture.localStorage.setItem("token", "other-account");
    fixture.composition.resolve(new Blob(["fixture"]));
    await new Promise(r => setImmediate(r));
    if (changeAt === "reading") fixture.localStorage.setItem("userId", "2");
    fixture.conversion.resolve("data:video/mp4;base64,Zml4dHVyZQ==");
    await exporting;
    assert.equal(fixture.posts.length, 0);
    assert.equal(fixture.downloads.length, 1, "The exported local file remains available");
  }
});

test("archive failure preserves local download and reports the failure", async () => {
  const fixture = await exportFixture();
  const exporting = fixture.exportVideo({ mode: "segments" });
  fixture.composition.resolve(new Blob(["fixture"]));
  fixture.conversion.resolve("data:video/mp4;base64,Zml4dHVyZQ==");
  await new Promise(r => setImmediate(r));
  fixture.upload.reject(new Error("network unavailable"));
  assert.equal((await exporting).files, 1);
  assert.equal(fixture.downloads.length, 1);
  assert.ok(fixture.notices.some(text => /成片未能归档/.test(text)));
  assert.deepEqual(fixture.emitted, []);
});

test("normal short films above 18 MiB use binary upload and an owned asset reference", async () => {
  const fixture = await exportFixture();
  const exporting = fixture.exportVideo();
  fixture.composition.resolve(new Blob([new Uint8Array(20 * 1024 * 1024)], { type: "video/mp4" }));
  await new Promise(r => setImmediate(r));
  assert.deepEqual(fixture.binaryUploads, [{ owner: "1", bytes: 20 * 1024 * 1024 }]);
  fixture.conversion.resolve(); await new Promise(r => setImmediate(r));
  assert.equal(fixture.posts.length, 1);
  assert.equal(fixture.posts[0].body.assetUrl, `/oss/canvas-files/1/${"a".repeat(32)}.mp4`);
  assert.equal(fixture.posts[0].body.base64Data, undefined);
  fixture.upload.resolve({ data: { id: 1 } }); await exporting;
});
