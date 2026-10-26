import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {siteSchema,skinSchema} from "../lib/reseller/site-settings";
import {publicSiteBrand,safeBrandImage,DEFAULT_SITE_BRAND} from "../../../shared/siteBrand";
import {validConfigKey,completeConfig} from "../lib/reseller/pg-store";
test("brand validation rejects executable, external-protocol and oversized images",()=>{
  for(const image of ["javascript:alert(1)","//evil.test/img.png","data:text/html;base64,PHNjcmlwdD4=","data:image/svg+xml;base64,PHN2Zz4=","http://evil.test/img.png","https://user:pass@evil.test/a.png","/\\evil.test/img","x".repeat(2800001)]){
    assert.equal(safeBrandImage(image),"");assert.equal(siteSchema.safeParse({...DEFAULT_SITE_BRAND,logo:image}).success,false);
  }
  for(const image of ["/brand/logo.png","https://assets.example.org/logo.png","data:image/png;base64,aGVsbG8="])assert.ok(siteSchema.safeParse({...DEFAULT_SITE_BRAND,logo:image}).success);
});
test("public identity is whitelisted, bounded, typed and separate from accounting",()=>{
  assert.deepEqual(publicSiteBrand({name:"  XOi  ",subtitle:"test",hideSubtitle:"true",logo:"javascript:1",footer:"ok",adminToken:"secret",models:{markupPct:100}}),{name:"XOi",subtitle:"test",hideSubtitle:false,logo:"",footer:"ok"});
  assert.equal(siteSchema.safeParse({...DEFAULT_SITE_BRAND,name:"A"}).success,false);
  assert.equal(siteSchema.safeParse({...DEFAULT_SITE_BRAND,hideSubtitle:"false"}).success,false);
  assert.equal(siteSchema.safeParse({...DEFAULT_SITE_BRAND,quota:999}).success,false);
  assert.equal(skinSchema.safeParse("madeup").success,false);
});
test("legacy completion preserves all business sections and config keys cannot traverse paths",()=>{
  const d=completeConfig({site:{name:"Legacy"} as any,agreementSignedAt:123,customers:{"9":{note:"keep",tags:[]}}});
  assert.equal(d.site.name,"Legacy");assert.equal(d.site.logo,"");assert.equal(d.agreementSignedAt,123);assert.equal(d.customers["9"].note,"keep");
  for(const key of ["../platform","agent-1/..","platform/..","agent-x",""])assert.throws(()=>validConfigKey(key));
  validConfigKey("platform");validConfigKey("agent-9");
});
test("only completed settings are routed and menu exposes no domain or login-theme application",async()=>{
  const root=path.resolve(__dirname,"../../..");
  const menu=await fs.readFile(path.join(root,"frontend/console/src/components/reseller-menu.ts"),"utf8");
  const page=await fs.readFile(path.join(root,"frontend/console/src/components/reseller/site/site-info.tsx"),"utf8");
  assert.ok(menu.includes('label: "站点设置"'));assert.ok(!menu.includes('href: "/reseller/theme/login-page"'));
  assert.ok(!page.includes("DomainTab"));assert.ok(!page.includes("LoginVideoList"));assert.ok(page.includes("expectedValue:saved.site"));assert.ok(page.includes("未展示可保存的默认值"));
});
