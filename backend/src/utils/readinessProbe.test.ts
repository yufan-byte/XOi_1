import test from "node:test";
import assert from "node:assert/strict";
import { readinessProbe } from "./readinessProbe";
test("concurrent probes share dependency checks, and stale success is never reused indefinitely",async()=>{
  let checks=0,time=1,failing=false;
  const probe=readinessProbe(async()=>{checks++;await Promise.resolve();if(failing)throw Error("down");},{now:()=>time,ttl:100});
  assert.ok((await Promise.all(Array.from({length:2000},()=>probe()))).every(Boolean));
  assert.equal(checks,1);await probe();assert.equal(checks,1);
  time+=101;failing=true;assert.equal(await probe(),false);assert.equal(checks,2);
  failing=false;assert.equal(await probe(),false);time+=101;assert.equal(await probe(),true);
});
