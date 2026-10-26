import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {requestBodyGuard} from "../middleware/requestBodyGuard";
test("anonymous and compressed bodies are refused before parsing; large body lanes release once",()=>{
  const guard=requestBodyGuard(1);
  function submit(patch:any){let status=0,called=false;const res=Object.assign(new EventEmitter(),{setHeader(){},status(n:number){status=n;return this;},json(){}});guard({path:"/api/v1/chat/completions",method:"POST",headers:{"content-type":"application/json",authorization:"fixture", "content-length":"3000000"},...patch} as any,res as any,()=>{called=true;});return{res,get status(){return status;},get called(){return called;}};}
  assert.equal(submit({headers:{"content-type":"application/json"}}).status,401);
  assert.equal(submit({path:"/API/V1/CHAT/COMPLETIONS",headers:{"content-type":"application/json"}}).status,401);
  assert.equal(submit({method:"GET"}).status,400);
  assert.equal(submit({headers:{authorization:"fixture","content-encoding":"gzip"}}).status,415);
  const first=submit({});assert.equal(first.called,true);assert.equal(submit({}).status,429);
  assert.equal(submit({headers:{authorization:"fixture","content-type":"application/json","content-length":"100"}}).called,true);
  first.res.emit("finish");first.res.emit("close");assert.equal(submit({}).called,true);
});
