import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { transform } from "sucrase";
import knex from "knex";
import { authorizeMediaReference, localMediaReference } from "./mediaReferencePolicy";
import { canReadMedia } from "./privateMedia";
import { uploadTransferScope } from "./uploadTransferScope";
import { clipBlobKey, generationScope } from "../../../frontend/console/src/one-stop/adapters/isolation-keys";
import { isAllowedMedia } from "./mediaSecurity";

function clientFixture(disk = new Map<string,any>(), initialOwner = "1:session-a") {
  let owner = initialOwner, calls = 0, holdOpen = false, headers: Headers | undefined;
  const opened: Array<()=>void> = [];
  let response: () => Promise<Response> = async () => new Response(JSON.stringify({success:true,data:{private:"A"}}));
  const storage = new Map<string,string>();
  const root = path.resolve(__dirname, "../../../frontend/console/src/one-stop");
  const cache = new Map<string,any>();
  const load = (name:string):any => {
    const file=path.resolve(root,name), existing=cache.get(file);if(existing)return existing;
    const module={exports:{}};
    cache.set(file,module.exports);
    const code=transform(fs.readFileSync(file,"utf8"),{transforms:["typescript","imports"]}).code;
    const request=(name:string):any=>{
      if(name.endsWith("lib/session"))return{sessionSignal:()=>owner,authHeaders:()=>({})};
      if(name.startsWith("."))return load(path.relative(root,path.resolve(path.dirname(file),name+".ts")));
      throw Error("Unexpected dependency: "+name);
    };
    vm.runInNewContext(code,{module,exports:module.exports,require:request,Headers,AbortSignal,AbortController,
      fetch:(_path:string,init:RequestInit)=>{calls++;headers=new Headers(init.headers);return response();},
      localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},
      sessionStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},
      indexedDB: {open:()=>{
        const database={objectStoreNames:{contains:()=>true},close:()=>{},transaction:()=>{
          const t:any={objectStore:()=>({put:(blob:any,key:string)=>{disk.set(key,blob);return{result:key};},get:(key:string)=>({result:disk.get(key)}),delete:(key:string)=>{disk.delete(key);return{result:undefined};}})};
          setImmediate(()=>t.oncomplete?.());return t;
        }};
        const r:any={result:database};const done=()=>r.onsuccess?.();
        if(holdOpen)opened.push(done);else setImmediate(done);return r;
      }},Date,console},{filename:file});
    return module.exports;
  };
  const api=load("adapters/request.ts");api.bindAccountSession();
  return {api,load,storage,get calls(){return calls;},get headers(){return headers;},switch:(value:string)=>{owner=value;},respond:(fn:()=>Promise<Response>)=>{response=fn;},holdOpen:()=>{holdOpen=true;},releaseOpen:()=>{opened.splice(0).forEach(fn=>fn());}};
}

test("a stale page cannot submit using the next account or a new login of the same account", async()=>{
  for(const next of ["2:session-b","1:new-session",""]){
    const f=clientFixture();f.switch(next);
    await assert.rejects(f.api.oneStopRequest("/api/one-stop/generation/jobs",{method:"POST",body:"{}"}),/账号/);
    assert.equal(f.calls,0);
  }
});
test("late response bodies are rejected after account switch",async()=>{
  const f=clientFixture();let release!:(r:Response)=>void;
  f.respond(()=>new Promise(resolve=>{release=resolve;}));
  const pending=f.api.oneStopRequest("/api/one-stop/documents");
  assert.equal(f.headers?.get("x-xoi-expected-user"),"1");
  f.switch("2:session-b");release(new Response(JSON.stringify({success:true,data:{secret:"A"}})));
  await assert.rejects(pending,/账号/);assert.equal(f.calls,1);
});
test("stale chat/store callbacks cannot persist A messages to either account",()=>{
  const f=clientFixture(),storage=f.api.accountLocalStorage(),key=f.api.accountStorageKey("history");
  storage.setItem(key,"original");f.switch("2:session-b");
  storage.setItem(key,"late A");storage.setItem(f.api.accountStorageKey("history"),"late A");storage.removeItem(key);
  assert.equal(f.storage.get(key),"original");assert.equal(f.storage.has("history:2"),false);assert.equal(storage.getItem(key),null);
});
test("media handoff is one-use and cannot be consumed by a different login",()=>{
  const f=clientFixture(),handoff=f.load("studio/handoff.ts");
  handoff.sendToVideo("/oss/one-stop/1/fixture.png","private prompt");
  f.switch("2:session-b");assert.throws(()=>handoff.takeVideoHandoff(),/账号/);
  f.switch("1:session-a");assert.equal(handoff.takeVideoHandoff().prompt,"private prompt");assert.equal(handoff.takeVideoHandoff(),undefined);
});
test("identical project and asset ids remain separate across accounts and projects",()=>{
  const a=clipBlobKey("1:session-a","project-a","asset-same"),b=clipBlobKey("1:session-a","project-b","asset-same"),c=clipBlobKey("2:session-b","project-a","asset-same");
  const blobs=new Map([[a,"A"],[b,"B"],[c,"C"]]);blobs.delete(a);
  assert.equal(blobs.get(b),"B");assert.equal(blobs.get(c),"C");
  assert.equal(clipBlobKey("1:new-login","project-b","asset-same"),b);
  assert.notEqual(generationScope("1:session-a","same"),generationScope("2:session-b","same"));
  for(const invalid of ["../other","a\n","", "x".repeat(161)])assert.throws(()=>clipBlobKey("1:session-a",invalid,"a"));
  assert.throws(()=>clipBlobKey("anonymous","project-a","a"));
});
test("actual clip blob adapter isolates deletes and rejects stale handles after IndexedDB open",async()=>{
  const disk=new Map<string,any>(),f=clientFixture(disk),store=f.load("clip/blob-store.ts").blobStore;
  const a=store.forProject("project-a"),b=store.forProject("project-b");
  assert.equal(await a.put("asset-same","A"),true);assert.equal(await b.put("asset-same","B"),true);
  const other=clientFixture(disk,"2:session-b").load("clip/blob-store.ts").blobStore.forProject("project-a");
  assert.equal(await other.get("asset-same"),undefined);assert.equal(await other.put("asset-same","C"),true);
  await a.del("asset-same");assert.equal(await b.get("asset-same"),"B");assert.equal(await other.get("asset-same"),"C");
  f.holdOpen();const pending=b.put("late","A");f.switch("2:session-b");f.releaseOpen();
  assert.equal(await pending,false);assert.equal(disk.has(clipBlobKey("1:session-a","project-b","late")),false);
  await assert.rejects(b.del("asset-same"),/账号/);
});
test("QR pickup requires both trusted user and one transfer; no account-wide fallback", async t=>{
  const db=knex({client:"better-sqlite3",connection:{filename:":memory:"},useNullAsDefault:true});t.after(()=>db.destroy());
  await db.schema.createTable("uploads",table=>{table.integer("user_id");table.string("transfer_id");table.string("name");});
  const a="12345678-1234-4123-8123-123456789abc",b="87654321-1234-4123-8123-123456789abc";
  await db("uploads").insert([{...uploadTransferScope(1,a),name:"A"},{...uploadTransferScope(1,b),name:"other tab"},{...uploadTransferScope(2,a),name:"other user"}]);
  assert.deepEqual((await db("uploads").where(uploadTransferScope(1,a))).map(r=>r.name),["A"]);
  for(const invalid of [undefined,"",[],"%",a+"\n"])assert.throws(()=>uploadTransferScope(1,invalid));
  assert.throws(()=>uploadTransferScope(0,a));
});
test("internal local references enforce ownership before any file read, even with provider grants",async t=>{
  const db=knex({client:"better-sqlite3",connection:{filename:":memory:"},useNullAsDefault:true});t.after(()=>db.destroy());
  await db.schema.createTable("o_project",table=>{table.integer("id");table.integer("userId");});
  await db("o_project").insert([{id:91001,userId:1},{id:91002,userId:2}]);
  let reads=0;
  const authorize=async(p:string)=>{if(!await canReadMedia(db,{id:1,role:"user"},p))throw Error("foreign");};
  const read=async(value:string)=>{const p=await authorizeMediaReference(value,authorize);reads++;return p;};
  for(const value of ["/oss/one-stop/2/private.png","/oss/91002/secret.png?xoi_m=some-grant","https://app.example/oss/canvas-files/2/private.mp4","https://app.example/%6fss/one-stop/2/private.png"])
    await assert.rejects(read(value),e=>(e as any).status===403);
  assert.equal(reads,0);
  assert.equal(await read("/oss/one-stop/1/own.png"),"/one-stop/1/own.png");
  assert.equal(await read("https://app.example/oss/91001/own.png?xoi_m=old-grant"),"/91001/own.png");
  assert.equal(reads,2);
});
test("raw and encoded traversal cannot be normalized into an authorized local reference",()=>{
  for(const value of ["/oss/one-stop/1/../2/private.png","https://app.example/oss/one-stop/1/%2e%2e/2/private.png","/oss/one-stop/1/%252e%252e/2/private.png","/oss/one-stop/1/x%00.png"])
    assert.throws(()=>localMediaReference(value));
  assert.equal(localMediaReference("https://cdn.example/image.png"),undefined);
});
test("phone uploads accept signed media headers and reject HTML disguised as an image",()=>{
  const html=Buffer.from('<html><script>alert(1)</script></html>');
  for(const ext of ["png","jpg","mp4","mov","ogg"])assert.equal(isAllowedMedia(html,ext),false);
  assert.equal(isAllowedMedia(Buffer.from("OggSfixture"),"ogg"),true);
  assert.equal(isAllowedMedia(Buffer.from([0,0,0,20,102,116,121,112,113,116,32,32]),"mov"),true);
});
