import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { transform } from "sucrase";

function adapter() {
  const calls: any[] = [];
  const sandbox: any = {
    exports: {}, Buffer,
    axios: {
      post: async (url: string, body: any) => { calls.push({ url, body }); return { data: { id: "offline-task" } }; },
      get: async () => ({ data: Buffer.from("offline-video") }),
    },
    pollTask: async () => ({ completed: true, data: "offline-task" }),
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../../data/vendor/newapi.ts"), "utf8");
  vm.runInNewContext(transform(source, { transforms: ["typescript"] }).code.replace(/export\s*\{\s*\};?/g, ""), sandbox);
  sandbox.exports.vendor.inputValues = { baseUrl: "https://offline.example.test", apiKey: "offline-dummy" };
  return { api: sandbox.exports, calls };
}

test("Seedance native adapter forwards every reference and has no extra mode field", async () => {
  const { api, calls } = adapter();
  const referenceList = [
    { type: "image", base64: "", url: "https://example.test/image.png" },
    { type: "video", base64: "", url: "https://example.test/video.mp4" },
    { type: "audio", base64: "", url: "https://example.test/audio.mp3" },
  ];
  await api.videoRequest({ duration: 30, resolution: "720p", aspectRatio: "9:16", prompt: "镜头", referenceList, mode: ["text"] }, { modelName: "seedance2.5-line1" });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].body)), { model: "seedance2.5-line1", prompt: "镜头", seconds: 30, aspect_ratio: "9:16", resolution: "720p", images: [referenceList[0].url], videos: [referenceList[1].url], audios: [referenceList[2].url] });
});

test("local references cannot be silently ignored and do not reach a paid endpoint", async () => {
  const { api, calls } = adapter();
  await assert.rejects(() => api.videoRequest({ duration: 5, resolution: "720p", prompt: "镜头", referenceList: [{ type: "video", base64: "bG9jYWw=" }], mode: ["text"] }, { modelName: "seedance2.0-line1" }), /公网地址/);
  assert.equal(calls.length, 0);
});

test('Seedance accepts bounded inline image references for Zaowu to host, without a public localhost URL',async()=>{
  const {api,calls}=adapter();
  const data='data:image/png;base64,aGVsbG8=';
  await api.videoRequest({duration:15,resolution:'480p',aspectRatio:'16:9',prompt:'offline image reference contract',referenceList:[{type:'image',base64:data}],mode:['singleImage']},{modelName:'seedance2.0-line1-xoi'});
  assert.equal(calls.length,1);
  assert.deepEqual(Array.from(calls[0].body.images),[data]);
  assert.equal(calls[0].body.seconds,15);
  assert.equal(calls[0].body.mode,undefined);
});

test('invalid, excessive and oversized inline references never reach a video submission',async()=>{
  for(const references of [
    [{type:'image',base64:'file:///private/photo.png'}],
    [{type:'image',base64:'data:image/svg+xml;base64,PHN2Zy8+'}],
    Array.from({length:33},()=>({type:'image',base64:'data:image/png;base64,aGVsbG8='})),
    [{type:'image',base64:'data:image/png;base64,'+Buffer.alloc(8*1024*1024+1).toString('base64')}],
  ]){
    const {api,calls}=adapter();
    await assert.rejects(()=>api.videoRequest({duration:15,resolution:'480p',prompt:'offline invalid reference',referenceList:references,mode:['singleImage']},{modelName:'seedance2.0-line1-xoi'}));
    assert.equal(calls.length,0);
  }
});

test("first/last frame intent reaches the keyframe request with ordered frames", async () => {
  const { api, calls } = adapter();
  await api.videoRequest({ duration: 5, resolution: "720p", aspectRatio: "16:9", prompt: "离线验证", referenceList: [{ type: "image", base64: "data:image/png;base64,YQ==" }, { type: "image", base64: "data:image/png;base64,Yg==" }], mode: ["startEndRequired"] }, { modelName: "fixture-keyframe" });
  assert.equal(calls[0].body.mode, "keyframe");
  assert.equal(calls[0].body.input_reference, "data:image/png;base64,YQ==");
  assert.equal(calls[0].body.end_image_url, "data:image/png;base64,Yg==");
});

test("fixed image pixel size and upstream errors survive the adapter", async () => {
  const calls: any[] = [];
  const sandbox: any = { exports: {}, Buffer, axios: { post: async (_url: string, body: any) => { calls.push(body); return { data: { data: [{ url: "https://fixture.invalid/result.png" }] } }; } } };
  const source = fs.readFileSync(path.resolve(__dirname, "../../data/vendor/newapi.ts"), "utf8");
  vm.runInNewContext(transform(source, { transforms: ["typescript"] }).code.replace(/export\s*\{\s*\};?/g, ""), sandbox);
  sandbox.exports.vendor.inputValues = { baseUrl: "https://offline.example.test", apiKey: "offline-dummy" };
  await sandbox.exports.imageRequest({ prompt: "离线验证", size: "1K", aspectRatio: "7:4", exactSize: "1792x1024", inputMode: "multi-reference" }, { modelName: "fixture-image" });
  assert.equal(calls[0].size, "1792x1024");
  assert.equal(calls[0].mode, "multi-reference");
  sandbox.axios.post = async () => { throw { message: "Request failed with status code 500", response: { status: 500, data: { error: { message: "参考图格式不支持" } } } }; };
  await assert.rejects(() => sandbox.exports.imageRequest({ prompt: "离线验证", size: "1K", aspectRatio: "1:1" }, { modelName: "fixture-image" }), /参考图格式不支持/);
});
