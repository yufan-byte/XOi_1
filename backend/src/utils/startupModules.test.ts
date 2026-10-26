import test from "node:test";
import assert from "node:assert/strict";
import { StartupModules } from "./startupModules";
test("transient module initialization recovers before accepting production traffic",async()=>{
  const modules=new StartupModules(["agent","team"]);let calls=0;
  assert.equal(modules.ready(),false);
  await modules.start("agent",async()=>{if(++calls<2)throw Error("temporary");},{pause:async()=>{}});
  assert.equal(calls,2);assert.equal(modules.ready(),false);
  await modules.start("team",async()=>{});assert.equal(modules.ready(),true);
});
test("permanent failure stays unready and does not leak a database error",async()=>{
  const modules=new StartupModules(["agent"]);let calls=0;
  await assert.rejects(modules.start("agent",async()=>{calls++;throw Error("secret DSN");},{pause:async()=>{}}),/agent 初始化失败/);
  assert.equal(calls,3);assert.equal(modules.ready(),false);assert.deepEqual(modules.snapshot(),{agent:"failed"});
});
