import test from "node:test";
import assert from "node:assert/strict";
import {productionSecurityBlockers} from "./productionSecurityPolicy";
import {releaseWhenResponseEnds} from "./modelConcurrency";
test("production origin/cache/proxy gates do not modify local testing",()=>{
  assert.deepEqual(productionSecurityBlockers({NODE_ENV:"dev"}),[]);
  assert.ok(productionSecurityBlockers({NODE_ENV:"production"}).length);
  assert.ok(productionSecurityBlockers({NODE_ENV:"prod",XOI_ALLOWED_ORIGINS:"*",XOI_TRUST_PROXY:"0.0.0.0/0"}).length>=2);
  assert.ok(productionSecurityBlockers({NODE_ENV:"prod",XOI_ALLOWED_ORIGINS:"https://studio.example.com",XOI_NEWAPI_REDIS_ENABLED:"1"}).length);
  assert.deepEqual(productionSecurityBlockers({NODE_ENV:"prod",XOI_ALLOWED_ORIGINS:"https://studio.example.com",XOI_TRUST_PROXY:"loopback",XOI_NEWAPI_QUOTA_MODE:"sync"}),[]);
});
test("streaming capacity is retained until body completion and released on cancellation",async()=>{
  let releases=0,source:any;const original=new Response(new ReadableStream({start(c){source=c;}}),{headers:{"content-type":"text/event-stream"}});
  const wrapped=releaseWhenResponseEnds(original,async()=>{releases++;});assert.equal(releases,0);
  source.enqueue(new TextEncoder().encode("data: hello\n\n"));source.close();assert.match(await wrapped.text(),/hello/);assert.equal(releases,1);
  const pending=releaseWhenResponseEnds(new Response(new ReadableStream({start(){}})),async()=>{releases++;});await pending.body!.cancel();assert.equal(releases,2);
});
