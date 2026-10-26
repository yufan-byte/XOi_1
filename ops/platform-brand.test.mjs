import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,mkdir,copyFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {publishPlatformBrand} from "../frontend/scripts/publish-platform-brand.mjs";
const brand=JSON.parse(await readFile(new URL("../shared/platform-brand.json",import.meta.url),"utf8"));
test("brand metadata publishes versioned icons without replacing application bundles or duplicating links",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"xoi-brand-metadata-"));
  const publicDir=path.join(directory,"public"),webDir=path.join(directory,"web");
  try{
    await mkdir(path.join(publicDir,"brand"),{recursive:true});await mkdir(path.join(webDir,"assets"),{recursive:true});
    for(const kind of ["logo","favicon","touch"])await copyFile(new URL("../frontend/public"+brand[kind],import.meta.url),path.join(publicDir,brand[kind].slice(1)));
    await writeFile(path.join(webDir,"assets/app.js"),"original-bundle");
    await writeFile(path.join(webDir,"announcements.json"),"operator-content");
    await writeFile(path.join(webDir,"index.html"),'<html><head><link rel="icon" href="/legacy.png"><link rel="shortcut icon" href="/older.ico"><link rel="apple-touch-icon" href="/old.png"><link rel="stylesheet" data-rel="icon" href="/assets/app.css"><script type="module" src="/assets/app.js"></script></head><body><div id="app"></div></body></html>');
    await publishPlatformBrand({publicDir,webDir,brand});
    const html=await readFile(path.join(webDir,"index.html"),"utf8");assert.ok(html.includes(brand.favicon));assert.ok(html.includes(brand.touch));assert.equal((html.match(/rel="icon"/g)||[]).length,2); // one favicon + untouched data-rel
    assert.equal((html.match(/<link rel="icon"/g)||[]).length,1);assert.equal(html.includes("/legacy.png"),false);assert.ok(html.includes('rel="stylesheet" data-rel="icon" href="/assets/app.css"'));assert.ok(html.includes('src="/assets/app.js"'));
    assert.equal(await readFile(path.join(webDir,"assets/app.js"),"utf8"),"original-bundle");assert.equal(await readFile(path.join(webDir,"announcements.json"),"utf8"),"operator-content");
    await publishPlatformBrand({publicDir,webDir,brand});assert.equal(await readFile(path.join(webDir,"index.html"),"utf8"),html);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test("invalid icon paths cannot change the served HTML entry",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"xoi-brand-guard-"));
  try{
    await writeFile(path.join(directory,"index.html"),"<html><head></head><body>unchanged</body></html>");
    await assert.rejects(publishPlatformBrand({publicDir:directory,webDir:directory,brand:{...brand,logo:"/../../outside.png"}}));
    assert.equal(await readFile(path.join(directory,"index.html"),"utf8"),"<html><head></head><body>unchanged</body></html>");
  }finally{await rm(directory,{recursive:true,force:true});}
});
