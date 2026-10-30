/** Real upload router with synthetic auth, in-memory DB/files, and loopback HTTP only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { once } from "node:events";
import express from "express";
import knex from "knex";
import { transform } from "sucrase";
import { withSecuritySchemaLock } from "./securitySchema";
import { isAllowedMedia } from "./mediaSecurity";
import { uploadTransferScope } from "./uploadTransferScope";
import { expectedAccount } from "../middleware/expectedAccount";

test("upload route isolates users and desktop channels, validates file bytes and accepts 12 MiB base64 envelopes", async()=>{
  const db=knex({client:"better-sqlite3",connection:{filename:":memory:"},useNullAsDefault:true,pool:{min:1,max:1}});
  const writes=new Map<string,number>(), module={exports:{} as any};
  const source=fs.readFileSync(path.resolve(__dirname,"../routes/one-stop-uploads.ts"),"utf8");
  vm.runInNewContext(transform(source,{transforms:["typescript","imports"]}).code,{
    module,exports:module.exports,Buffer,crypto,console,
    require:(name:string)=>{
      switch(name){
        case "express": return express;
        case "@/utils": return {oss:{writeFile:async(p:string,b:Buffer)=>{writes.set(p,b.length);}}};
        case "@/utils/db": return {db};
        case "@/utils/securitySchema": return {withSecuritySchemaLock};
        case "@/utils/mediaSecurity": return {isAllowedMedia};
        case "@/utils/uploadTransferScope": return {uploadTransferScope};
        default: throw Error("Unexpected live dependency: "+name);
      }
    },
  });
  const app=express();
  app.use((req,_res,next)=>{if(req.get("x-fixture-user"))(req as any).user={id:Number(req.get("x-fixture-user"))};next();});
  app.use(expectedAccount);
  app.use("/uploads",express.json({limit:16*1024*1024+512*1024}),module.exports.default);
  const server=app.listen(0,"127.0.0.1");await once(server,"listening");
  const base=`http://127.0.0.1:${(server.address() as any).port}/uploads`;
  const a=crypto.randomUUID(),b=crypto.randomUUID();
  const png=Buffer.from([137,80,78,71,13,10,26,10]);
  const dataUrl="data:image/png;base64,"+png.toString("base64");
  const call=async(user:number|undefined,body?:any,query="",expected?:string)=>{
    const r=await fetch(base+query,{method:body===undefined?"GET":"POST",headers:{...(user?{"x-fixture-user":String(user)}:{}),...(expected===undefined?{}:{"x-xoi-expected-user":expected}),...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json() as any,cache:r.headers.get("cache-control")};
  };
  try{
    assert.equal((await call(undefined,{transfer:a,dataUrl})).status,401);
    assert.equal((await call(1,{dataUrl})).status,400);assert.equal(writes.size,0);
    // Browser cookie can change before the other tab receives its storage event.
    assert.equal((await call(2,{transfer:a,dataUrl},"","1")).status,409);
    assert.equal((await call(1,{transfer:a,dataUrl},"","2")).status,409);
    assert.equal((await call(1,{transfer:a,dataUrl},"","NaN")).status,409);assert.equal(writes.size,0);
    for(const [user,transfer,name] of [[1,a,"mine"],[1,b,"another project"],[2,a,"another account"]] as const){
      assert.equal((await call(user,{name,dataUrl,transfer,user_id:999},"",String(user))).status,200);
    }
    const mine=await call(1,undefined,"?transfer="+a);assert.equal(mine.cache,"no-store");assert.deepEqual(mine.body.data.items.map((x:any)=>x.name),["mine"]);
    assert.deepEqual((await call(2,undefined,"?transfer="+a)).body.data.items.map((x:any)=>x.name),["another account"]);
    assert.equal((await call(1)).status,400);
    assert.equal((await call(1,{transfer:a,dataUrl:"data:image/png;base64,"+Buffer.from("<html>forged image</html>").toString("base64")})).status,400);
    assert.equal(writes.size,3);
    // Previously the parent 13mb parser rejected a legitimate 12 MiB file after base64 expansion.
    const large=Buffer.alloc(12*1024*1024);png.copy(large);
    const accepted=await call(1,{transfer:a,name:"large",dataUrl:"data:image/png;base64,"+large.toString("base64")});
    assert.equal(accepted.status,200);assert.equal(accepted.body.data.bytes,large.length);
    assert.equal(writes.size,4);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.destroy();}
});
