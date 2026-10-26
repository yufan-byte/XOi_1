import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink,copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import http from "node:http";
import { inspectLayout, inspectService } from "./release-preflight.mjs";
const entry=resolve("docker-entrypoint.sh");
test("main-only publishing cannot release staged team or canvas bundles",async()=>{
  const root=await mkdtemp(join(tmpdir(),"xoi-main-publish-"));
  try{
    const files={"frontend/dist/index.html":"new-main","frontend/dist/assets/new.js":"new","frontend/dist/console/index.html":"do-not-release-team","frontend/dist/one-stop/index.html":"do-not-release-one-stop","backend/data/web/one-stop/index.html":"unchanged-one-stop","frontend/dist/atelier-canvas/index.html":"do-not-release-canvas","frontend/dist/announcements.json":"do-not-overwrite","backend/data/web/index.html":"old-main","backend/data/web/assets/old.js":"old","backend/data/web/console/index.html":"unchanged-console","backend/data/web/atelier-canvas/index.html":"unchanged-canvas","backend/data/announcements.json":"operator-content"};
    for(const [file,value] of Object.entries(files)){
      await mkdir(join(root,file,".."),{recursive:true});await writeFile(join(root,file),value);
    }
    await mkdir(join(root,"frontend/scripts"),{recursive:true});
    await copyFile(resolve("frontend/scripts/sync-backend-web.mjs"),join(root,"frontend/scripts/publish.mjs"));
    execFileSync(process.execPath,[join(root,"frontend/scripts/publish.mjs"),"--main-only"],{stdio:"pipe"});
    for(const [file,value] of Object.entries({"index.html":"new-main","assets/old.js":"old","assets/new.js":"new","console/index.html":"unchanged-console","one-stop/index.html":"unchanged-one-stop","atelier-canvas/index.html":"unchanged-canvas"}))assert.equal(await readFile(join(root,"backend/data/web",file),"utf8"),value);
    assert.equal(await readFile(join(root,"backend/data/announcements.json"),"utf8"),"operator-content");
  }finally{await rm(root,{recursive:true,force:true});}
});
test("console-only publishing preserves main, canvas, announcements and existing hashed assets",async()=>{
  const root=await mkdtemp(join(tmpdir(),"xoi-console-publish-"));
  try{
    for(const [file,value] of Object.entries({"frontend/public/console/index.html":"new-console","frontend/public/console/assets/new.js":"new","backend/data/web/console/index.html":"old-console","backend/data/web/console/assets/old.js":"old","backend/data/web/index.html":"unchanged-main","backend/data/web/atelier-canvas/index.html":"unchanged-canvas","backend/data/announcements.json":"operator-content"})){
      await mkdir(join(root,file,".."),{recursive:true});await writeFile(join(root,file),value);
    }
    await mkdir(join(root,"frontend/scripts"),{recursive:true});
    await copyFile(resolve("frontend/scripts/sync-backend-web.mjs"),join(root,"frontend/scripts/publish.mjs"));
    execFileSync(process.execPath,[join(root,"frontend/scripts/publish.mjs"),"--console-only"],{stdio:"pipe"});
    for(const [file,value] of Object.entries({"console/index.html":"new-console","console/assets/old.js":"old","console/assets/new.js":"new","index.html":"unchanged-main","atelier-canvas/index.html":"unchanged-canvas"}))assert.equal(await readFile(join(root,"backend/data/web",file),"utf8"),value);
    assert.equal(await readFile(join(root,"backend/data/announcements.json"),"utf8"),"operator-content");
  }finally{await rm(root,{recursive:true,force:true});}
});
test("one-stop-only publishing cannot release staged director, team or canvas pages",async()=>{
  const root=await mkdtemp(join(tmpdir(),"xoi-one-stop-publish-"));
  try{
    const files={"frontend/public/one-stop/index.html":"new-one-stop","frontend/public/one-stop/assets/new.js":"new","backend/data/web/one-stop/index.html":"old-one-stop","backend/data/web/one-stop/assets/old.js":"old","backend/data/web/index.html":"director","backend/data/web/console/index.html":"team","backend/data/web/atelier-canvas/index.html":"canvas","backend/data/announcements.json":"operator"};
    for(const [file,value] of Object.entries(files)){await mkdir(join(root,file,".."),{recursive:true});await writeFile(join(root,file),value);}
    await mkdir(join(root,"frontend/scripts"),{recursive:true});await copyFile(resolve("frontend/scripts/sync-backend-web.mjs"),join(root,"frontend/scripts/publish.mjs"));
    execFileSync(process.execPath,[join(root,"frontend/scripts/publish.mjs"),"--one-stop-only"],{stdio:"pipe"});
    for(const [file,value] of Object.entries({"one-stop/index.html":"new-one-stop","one-stop/assets/new.js":"new","one-stop/assets/old.js":"old","index.html":"director","console/index.html":"team","atelier-canvas/index.html":"canvas"}))assert.equal(await readFile(join(root,"backend/data/web",file),"utf8"),value);
    assert.equal(await readFile(join(root,"backend/data/announcements.json"),"utf8"),"operator");
  }finally{await rm(root,{recursive:true,force:true});}
});
test("container and proxy defaults follow the independent XOi port and include clean-build dependencies",async()=>{
  assert.match(await readFile(resolve("backend/src/core.ts"),"utf8"),/"one-stop"/);
  const defaults=JSON.parse(await readFile(resolve("shared/runtime-defaults.json"),"utf8"));
  const docker=await readFile(resolve("Dockerfile"),"utf8");
  assert.ok(docker.includes(`EXPOSE ${defaults.port}`));assert.ok(docker.includes('CMD ["node", "/app/release/serve/app.js"]'));
  const consoleStage=docker.split("AS console-build")[1].split("AS frontend-build")[0];
  assert.ok(consoleStage.includes("COPY shared/ /app/shared/"));assert.ok(consoleStage.includes("frontend/src/utils/points.ts"));
  assert.ok(consoleStage.includes("npm run build:one-stop"));assert.ok(docker.includes("COPY --from=console-build /app/frontend/public/one-stop public/one-stop"));
  for(const file of ["ops/server-deploy/compose.prod.example.yml","ops/nginx-single-node.conf.example","frontend/console/vite.config.ts","frontend/vite.config.ts"]){const content=await readFile(resolve(file),"utf8");assert.ok(content.includes(String(defaults.port)),file);assert.equal(content.includes("10588")||content.includes("10688"),false,file);}
});
async function releaseFixture(root) {
  for(const [file,content] of Object.entries({"web/one-stop/index.html":'<html><script src="/one-stop/assets/main.js"></script></html>',"web/one-stop/assets/main.js":"one-stop"})) {await mkdir(join(root,"release",file,".."),{recursive:true});await writeFile(join(root,"release",file),content);}
  for(const [file,content] of Object.entries({"serve/app.js":"immutable-program","web/index.html":'<html><script src="/assets/main.js"></script></html>',"web/assets/main.js":"main","web/console/index.html":'<html><script src="/console/assets/main.js"></script></html>',"web/console/assets/main.js":"console","web/atelier-canvas/index.html":'<html><script src="/atelier-canvas/assets/main.js"></script></html>',"web/atelier-canvas/assets/main.js":"canvas","fonts/Comismsh.ttf":"font"})) {
    await mkdir(join(root,"release",file,".."),{recursive:true});await writeFile(join(root,"release",file),content);
  }
  await mkdir(join(root,"assets-seed/skills"),{recursive:true});
  await writeFile(join(root,"assets-seed/skills/script_agent_decision.md"),"built-in skill");
}
test("new release never overwrites code or customer data inside a legacy volume",async()=>{
  const root=await mkdtemp(join(tmpdir(),"xoi-commercial-entry-"));
  try {
    await releaseFixture(root);
    for(const [file,value] of Object.entries({"serve/app.js":"old-program","web/index.html":"old-web","oss/customer.txt":"private-media","canvases/customer.json":"private-canvas","skills/script_agent_decision.md":"customized"})) {
      await mkdir(join(root,"data",file,".."),{recursive:true});await writeFile(join(root,"data",file),value);
    }
    const env={...process.env,XOI_RELEASE_DIR:join(root,"release"),XOI_ASSET_SEED_DIR:join(root,"assets-seed"),XOI_RUNTIME_DATA_DIR:join(root,"data")};
    execFileSync("sh",[entry,"true"],{env,stdio:"pipe"});
    for(const [file,value] of Object.entries({"serve/app.js":"old-program","web/index.html":"old-web","oss/customer.txt":"private-media","canvases/customer.json":"private-canvas","skills/script_agent_decision.md":"customized"}))assert.equal(await readFile(join(root,"data",file),"utf8"),value);
    assert.ok((await inspectLayout(root,true)).every(check=>check.ok));
    await rm(join(root,"release/web/console/assets/main.js"));
    assert.ok((await inspectLayout(root,true)).some(check=>!check.ok));
  }finally{await rm(root,{recursive:true,force:true});}
});
test("missing releases and symlink data roots cannot modify arbitrary directories",async()=>{
  const root=await mkdtemp(join(tmpdir(),"xoi-commercial-guard-"));
  try {
    await releaseFixture(root);await mkdir(join(root,"outside"));await symlink(join(root,"outside"),join(root,"data"));
    const env={...process.env,XOI_RELEASE_DIR:join(root,"release"),XOI_ASSET_SEED_DIR:join(root,"assets-seed"),XOI_RUNTIME_DATA_DIR:join(root,"data")};
    assert.throws(()=>execFileSync("sh",[entry,"true"],{env,stdio:"pipe"}));
    await rm(join(root,"data"));await mkdir(join(root,"data"));await rm(join(root,"release/serve/app.js"));
    assert.throws(()=>execFileSync("sh",[entry,"true"],{env,stdio:"pipe"}));
  }finally{await rm(root,{recursive:true,force:true});}
});
test("preflight only reads and refuses a different app or release",async()=>{
  const methods=[];let product="OtherApp",release="v1";
  const server=http.createServer((req,res)=>{
    methods.push(req.method);
    if(req.url==="/api/healthz")return res.end(JSON.stringify({product,status:"ok"}));
    if(req.url==="/api/version")return res.end(JSON.stringify({product,release}));
    if(req.url==="/api/readyz")return res.end(JSON.stringify({status:"ready"}));
    res.setHeader("Content-Type","text/html");res.end("<html>fixture</html>");
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await inspectService(base))[0].ok,false);
    product="XOi";
    assert.ok((await inspectService(base,"v2")).some(check=>!check.ok));
    release="v2";assert.ok((await inspectService(base,"v2")).every(check=>check.ok));
    assert.ok(methods.every(method=>method==="GET"));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
