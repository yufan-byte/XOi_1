import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import knex from "knex";
import express from "express";
import {once} from "node:events";
import {WorkspaceDocuments,workspaceError} from "../lib/workspace/documents";
import {transform} from "sucrase";
import {writeBrowserHandoff,takeBrowserHandoff} from "../../../shared/browserHandoff";
import {saveCanvasAssetResult} from "../lib/workspace/canvasAssetResult";
import replaceUrl from "./replaceUrl";
import {mediaPath} from "./privateMedia";

const storage=()=>{const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,String(v));},removeItem:(k:string)=>{data.delete(k);}};};
test("canvas handoffs isolate accounts, logins, tabs and channels; expired/anonymous payloads cannot be imported",()=>{
  const first=storage(),second=storage(),a="1:login-a",b="2:login-b";
  writeBrowserHandoff(first,a,"canvas-prompt",{secret:"A"},1000);
  assert.equal(takeBrowserHandoff(first,b,"canvas-prompt",1001),undefined);
  assert.equal(takeBrowserHandoff(first,"1:new-login","canvas-prompt",1001),undefined);
  assert.equal(takeBrowserHandoff(second,a,"canvas-prompt",1001),undefined);
  assert.equal(takeBrowserHandoff(first,a,"canvas-graph",1001),undefined);
  assert.deepEqual(takeBrowserHandoff(first,a,"canvas-prompt",1001),{secret:"A"});
  assert.equal(takeBrowserHandoff(first,a,"canvas-prompt",1002),undefined);
  writeBrowserHandoff(first,a,"canvas-result",{image:"old"},1000);
  assert.equal(takeBrowserHandoff(first,a,"canvas-result",601000),undefined);
  assert.throws(()=>writeBrowserHandoff(first,"","canvas-result",{}));
});

function directorLibraryFixture(){
  const local=storage();local.setItem("xoi_session","1:login-a");
  const route:any={query:{}},calls:{path:string;method:string}[]=[],warnings:string[]=[];
  let defer: ((response:Response)=>void)|undefined,hold=false;
  const module={exports:{} as any};
  const script=fs.readFileSync(path.resolve(__dirname,"../../../frontend/src/views/director3d/index.vue"),"utf8").split('<script setup lang="ts">')[1].split('</script>')[0].replaceAll("import.meta.env.BASE_URL","'/'");
  const push=async(value:any)=>{route.query=typeof value==="object"?value.query||{}:{};};
  const source=transform(script,{transforms:["typescript","imports"]}).code;
  vm.runInNewContext(source+"\nmodule.exports={loadDirectorIdentity,projects,activeProjectId,identityState,createProject,openDeleteProject,confirmDeleteProject,openRenameProject,confirmRenameProject,projectNameDraft};",{
    module,exports:module.exports,crypto,URL,URLSearchParams,Headers,AbortSignal,Blob,console,
    localStorage:local,sessionStorage:storage(),window:{addEventListener(){},removeEventListener(){}},
    fetch:async(url:string,init?:RequestInit)=>{calls.push({path:url,method:init?.method||"GET"});
      if(hold&&url.startsWith("/api/director-scenes/")){hold=false;return new Promise<Response>(resolve=>{defer=resolve;});}
      return url==="/api/auth/me"?new Response(JSON.stringify({user:{id:Number(local.getItem("xoi_session")!.split(":")[0])}})):url.startsWith("/api/director-scenes?")?new Response(JSON.stringify({data:[]})):new Response("{}",{status:404});},
    require:(name:string)=>{
      if(name==="vue")return {ref:(value:any)=>({value}),computed:(get:any)=>({get value(){return get();}}),watch(){},onMounted(){},onUnmounted(){}};
      if(name==="vue-router")return {useRoute:()=>route,useRouter:()=>({push,replace:push})};
      if(name==="@/utils/session")return {sessionSignal:()=>local.getItem("xoi_session")};
      if(name==="tdesign-vue-next")return {MessagePlugin:{warning:(msg:string)=>warnings.push(msg)}};
      if(name.endsWith("browserHandoff"))return {writeBrowserHandoff};
      return {};
    },
  });
  return {api:module.exports,local,route,calls,warnings,hold:()=>{hold=true;},release:(value:Response)=>defer!(value)};
}
test("3D new user sees no generated project; explicit create is isolated and the final scene can be deleted",async()=>{
  const f=directorLibraryFixture();
  f.local.setItem("director3d-projects",JSON.stringify([{id:"public",name:"legacy project"}]));
  f.local.setItem("director3d-projects-v2:u2",JSON.stringify([{id:"director3d-u2-private",name:"other user"}]));
  await f.api.loadDirectorIdentity();
  assert.equal(f.api.identityState.value,"ready");assert.equal(f.api.projects.value.length,0);assert.equal(f.api.activeProjectId.value,"");
  assert.ok(f.calls.every(call=>call.method==="GET"));
  f.api.createProject();assert.equal(f.api.projects.value.length,1);const id=f.api.activeProjectId.value;assert.match(id,/^director3d-u1-/);
  f.api.openDeleteProject(id);await f.api.confirmDeleteProject();
  assert.equal(f.api.projects.value.length,0);assert.equal(f.api.activeProjectId.value,"");assert.equal(f.local.getItem("director3d-active-project-v2:u1"),null);
  assert.equal(f.route.query.scene,undefined);assert.ok(f.local.getItem("director3d-projects-v2:u2")?.includes("other user"));
});
test("3D late rename cannot persist under the next account",async()=>{
  const f=directorLibraryFixture();await f.api.loadDirectorIdentity();f.api.createProject();
  const name=f.api.projects.value[0].name;
  f.api.openRenameProject();f.api.projectNameDraft.value="should not save";f.hold();
  const pending=f.api.confirmRenameProject();f.local.setItem("xoi_session","2:login-b");f.release(new Response("{}",{status:404}));await pending;
  assert.equal(f.api.projects.value[0].name,name);assert.equal(f.local.getItem("director3d-projects-v2:u2"),null);assert.ok(f.warnings.length);
});
test("native 3D entry uses cookie auth and a session signal; foreign or shared draft addresses are refused",async()=>{
  const source=fs.readFileSync(path.resolve(__dirname,"../../../frontend/monoform/xoi/identity.js"),"utf8");
  for(const sceneId of ["director3d-u1-own","director3d-u2-foreign",""]){
    const local=storage();local.setItem("xoi_session","1:login-a");let headers:Headers|undefined;
    const module={exports:{} as any};
    vm.runInNewContext(transform(source,{transforms:["imports"]}).code,{
      module,exports:module.exports,localStorage:local,
      require:()=>({sceneKey:()=>sceneId}),
      fetch:async(_path:string,init:RequestInit)=>{headers=new Headers(init.headers);assert.equal(init.credentials,"same-origin");return new Response(JSON.stringify({user:{id:1}}));},
      window:{addEventListener(){}},setInterval(){},document:{},location:{},
    });
    if(sceneId==="director3d-u1-own")assert.equal((await module.exports.verifyIdentity()).userId,1);
    else await assert.rejects(module.exports.verifyIdentity(),/不属于/);
    assert.equal(headers?.get("authorization"),null);assert.equal(headers?.get("x-xoi-expected-user"),"1");
  }
});
test("generic workspace routes cannot bypass director deletion/schema protection",async()=>{
  const module={exports:{} as any};
  const source=fs.readFileSync(path.resolve(__dirname,"../lib/workspace/router.ts"),"utf8");
  const noop=(_req:any,_res:any,next:any)=>next();
  vm.runInNewContext(transform(source,{transforms:["typescript","imports"]}).code,{
    module,exports:module.exports,Buffer,console,require:(name:string)=>{
      if(name==="express")return express;
      if(name==="node:crypto")return crypto;
      if(name==="node:path")return path;
      if(name==="node:fs/promises")return {};
      if(name==="@/utils/db")return {db:{}};
      if(name==="./documents")return {WorkspaceDocuments,workspaceError};
      if(name==="./uploadSessions")return {UploadSessions:class{}};
      if(name==="@/middleware/rateLimiter")return {rateLimiter:()=>noop};
      if(name==="@/middleware/sharedRateLimiter")return {sharedRateLimiter:()=>noop};
      return {};
    },
  });
  const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as any).user={id:1};next();});app.use(module.exports.default);
  const server=app.listen(0,"127.0.0.1");await once(server,"listening");const url=`http://127.0.0.1:${(server.address() as any).port}/documents/director/director3d-u1-deleted`;
  try{for(const method of ["GET","PUT"]){const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:method==="PUT"?JSON.stringify({revision:0,payload:{}}):undefined});assert.equal(response.status,400);}}
  finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test("cross-device workspace listing includes every page rather than silently stopping at 50 drafts",async()=>{
  const module={exports:{} as any},pages:number[]=[],source=fs.readFileSync(path.resolve(__dirname,"../../../frontend/src/utils/workspace.ts"),"utf8");
  vm.runInNewContext(transform(source,{transforms:["typescript","imports"]}).code,{
    module,exports:module.exports,localStorage:{getItem:()=>"1"},require:(name:string)=>{
      if(name==="@/utils/axios")return {get:async(_path:string,config:any)=>{const offset=config.params.offset;pages.push(offset);return {data:Array.from({length:offset===0?50:1},(_,i)=>({id:String(offset+i)}))};}};
      if(name==="./session")return {sessionUserId:()=>"1",sessionSignal:()=>"1:login-a"};
      return {};
    },
  });
  const rows=await module.exports.listCloudDocuments("1","viral");assert.equal(rows.length,51);assert.deepEqual(pages,[0,50]);
});
test("legacy image editor reads stored relative references through OSS and rejects another project's reference",async()=>{
  const file=fs.readFileSync(path.resolve(__dirname,"../routes/production/editImage/generateFlowImage.ts"),"utf8");
  const fn=file.slice(file.indexOf("async function urlToBase64"),file.indexOf("export default"));
  const calls:string[]=[],context:any={mediaPath,u:{replaceUrl,oss:{getImageBase64:async(p:string)=>{calls.push(p);return "data:image/png;base64,fixture";}}}};
  vm.runInNewContext(transform(fn,{transforms:["typescript"]}).code+"\nthis.readReference=urlToBase64;",context);
  for(const ref of ["21/workFlow/a.jpg","/oss/21/workFlow/a.jpg?size=20","https://app.example/oss/21/workFlow/a.jpg"])await context.readReference(ref,21);
  assert.deepEqual(calls,Array(3).fill("/21/workFlow/a.jpg"));
  await assert.rejects(context.readReference("/oss/22/private.png",21),/当前项目/);assert.equal(calls.length,3);
});
test("canvas asset return resolves trusted owners/projects, rejects foreign files before reading, and archives independently",async t=>{
  const db=knex({client:"better-sqlite3",connection:{filename:":memory:"},useNullAsDefault:true});t.after(()=>db.destroy());
  await db.schema.createTable("o_project",table=>{table.integer("id");table.integer("userId");});
  await db.schema.createTable("o_assets",table=>{table.integer("id");table.integer("projectId");table.string("type");table.integer("imageId");});
  await db.schema.createTable("o_image",table=>{table.increments("id");table.integer("assetsId");table.string("type");table.string("state");table.string("filePath");});
  await db("o_project").insert([{id:21,userId:1},{id:22,userId:1},{id:23,userId:2}]);
  await db("o_assets").insert([{id:31,projectId:21,type:"role",imageId:1},{id:32,projectId:22,type:"role",imageId:2},{id:33,projectId:23,type:"role",imageId:3}]);
  let reads=0,writes=0;
  const base={db,userId:1,assetId:31,projectId:21,filePath:"/canvas-files/1/source.png",read:async()=>{reads++;return Buffer.from("fixture");},archive:async(project:number)=>{writes++;return `/${project}/canvas-return/archived.png`;}};
  for(const patch of [{assetId:33},{assetId:32},{filePath:"/canvas-files/2/private.png"},{filePath:"/22/other-project.png"},{filePath:"/21/../23/private.png"}])await assert.rejects(saveCanvasAssetResult({...base,...patch}));
  assert.equal(reads,0);assert.equal(writes,0);
  const result=await saveCanvasAssetResult(base);assert.ok(Number.isSafeInteger(result.imageId));assert.equal(result.filePath,"/21/canvas-return/archived.png");
  assert.equal((await db("o_assets").where({id:31}).first()).imageId,result.imageId);assert.equal((await db("o_assets").where({id:32}).first()).imageId,2);
  const candidate=await saveCanvasAssetResult({...base,candidateOnly:true});
  assert.equal(candidate.candidateOnly,true);assert.notEqual(candidate.imageId,result.imageId);
  assert.equal((await db("o_assets").where({id:31}).first()).imageId,result.imageId);
  assert.equal((await db("o_image").where({id:candidate.imageId}).first()).assetsId,31);
  const candidateDuringEdit=await saveCanvasAssetResult({...base,candidateOnly:true,archive:async()=>{await db("o_assets").where({id:31}).update({imageId:777});return "/21/canvas-return/late.png";}});
  assert.equal((await db("o_assets").where({id:31}).first()).imageId,777);
  assert.equal((await db("o_image").where({id:candidateDuringEdit.imageId}).first()).assetsId,31);
  await assert.rejects(saveCanvasAssetResult({...base,archive:async()=>{await db("o_assets").where({id:31}).update({imageId:999});return "/21/canvas-return/late.png";}}),e=>(e as any).status===409);
  assert.equal((await db("o_assets").where({id:31}).first()).imageId,999);
});
