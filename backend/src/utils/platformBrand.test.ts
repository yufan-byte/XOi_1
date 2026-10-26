import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {PLATFORM_BRAND,platformBrandAsset} from "../../../shared/platformBrand";
const root=path.resolve(__dirname,"../../..");
test("default workbench and management identity is derived from the same preserved source",async()=>{
  const source=await fs.readFile(path.join(root,"frontend/src/assets/XOI_logo.png"));
  assert.equal(crypto.createHash("sha256").update(source).digest("hex"),PLATFORM_BRAND.sourceSha256);
  for(const kind of ["logo","favicon","touch"] as const){
    const file=PLATFORM_BRAND[kind].slice(1);
    const main=await fs.readFile(path.join(root,"frontend/public",file));
    const consoleAsset=await fs.readFile(path.join(root,"frontend/console/public",file));
    assert.ok(main.equals(consoleAsset));assert.ok(main.length<50000);assert.equal(main.subarray(1,4).toString(),"PNG");
    assert.ok(file.includes(PLATFORM_BRAND.sourceSha256.slice(0,12)));
    assert.equal(platformBrandAsset(kind),PLATFORM_BRAND[kind]);assert.equal(platformBrandAsset(kind,"/console/"),"/console"+PLATFORM_BRAND[kind]);
  }
});
test("all requested HTML entrypoints reference versioned platform favicons, not legacy defaults",async()=>{
  const main=await fs.readFile(path.join(root,"frontend/index.html"),"utf8"),consoleHtml=await fs.readFile(path.join(root,"frontend/console/index.html"),"utf8");
  assert.ok(main.includes(PLATFORM_BRAND.favicon));assert.ok(main.includes(PLATFORM_BRAND.touch));
  assert.ok(consoleHtml.includes("%BASE_URL%"+PLATFORM_BRAND.favicon.slice(1)));assert.ok(consoleHtml.includes("%BASE_URL%"+PLATFORM_BRAND.touch.slice(1)));
  assert.equal(main.includes("photosynthesis-effect-mark"),false);assert.equal(consoleHtml.includes('href="/xoi-favicon.png"'),false);
  assert.equal((main.match(/rel="icon"/g)||[]).length,1);assert.equal((consoleHtml.match(/rel="icon"/g)||[]).length,1);
});
test("console default mark uses contain sizing and explicit white-label choice remains first",async()=>{
  const mark=await fs.readFile(path.join(root,"frontend/console/src/components/shell/brand.tsx"),"utf8");
  const provider=await fs.readFile(path.join(root,"frontend/console/src/components/shell/brand-provider.tsx"),"utf8");
  assert.ok(mark.includes('platformBrandAsset("logo",import.meta.env.BASE_URL)'));assert.ok(mark.includes("object-contain"));assert.ok(mark.includes("b.site.logo ?"));
  assert.ok(provider.includes('value.site.logo||platformBrandAsset("favicon",import.meta.env.BASE_URL)'));assert.ok(provider.includes("duplicate.remove()"));
});
