import {test} from "node:test";
import assert from "node:assert/strict";
import {canvasAudioRequest,readAudioBody} from "./canvasAudioRequest";
test("wrapped audio requests are normalized and secrets/unknown fields stripped",()=>{
  assert.deepEqual(canvasAudioRequest({endpoint:"/audio/speech",request:{model:"newapi:tts-1",input:"你好",voice:"alloy",apiKey:"secret"}}),{model:"tts-1",input:"你好",voice:"alloy",response_format:"mp3"});
  assert.throws(()=>canvasAudioRequest({endpoint:"/other",request:{}}));
  assert.throws(()=>canvasAudioRequest({request:{model:"tts-1",input:"你好",voice_clone:true}}));
  assert.throws(()=>canvasAudioRequest({model:"tts-1",input:"x".repeat(10001)}));
});
test("audio output is nonempty binary and bounded; no paid requests",async()=>{
  assert.equal((await readAudioBody(new Response(new Uint8Array([73,68,51]),{headers:{"content-type":"audio/mpeg"}}))).length,3);
  await assert.rejects(readAudioBody(new Response('{}',{headers:{"content-type":"application/json"}})),/未返回音频/);
  await assert.rejects(readAudioBody(new Response(new Uint8Array(12),{headers:{"content-type":"audio/wav"}}),5),/超过/);
});
