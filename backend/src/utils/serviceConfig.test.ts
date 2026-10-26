import test from "node:test";
import assert from "node:assert/strict";
import { servicePort, serviceIdentity, localHealthIdentity } from "./serviceConfig";
import { runtimeAssetPath } from "./runtimeAssetPath";

test("XOi uses a separate validated configurable port", () => {
  assert.equal(servicePort(""),12121); assert.equal(servicePort("10689"),10689);
  for (const value of ["0","80","65536","NaN","12121.5"]) assert.throws(()=>servicePort(value));
});
test("release identity exposes only a safe public tag", () => {
  assert.deepEqual(serviceIdentity({XOI_RELEASE_ID:"20261017-r1",NEWAPI_ADMIN_TOKEN:"secret"}),{product:"XOi",release:"20261017-r1"});
  assert.throws(()=>serviceIdentity({XOI_RELEASE_ID:"../../secret"}));
  assert.throws(()=>serviceIdentity({NODE_ENV:"prod"}));
  assert.throws(()=>serviceIdentity({NODE_ENV:"production",XOI_RELEASE_ID:"unversioned"}));
  assert.equal(localHealthIdentity({XOI_LOCAL_INSTANCE:"local-nonce"}).instance,"local-nonce");
});
test("immutable code and editable user data resolve separately", () => {
  assert.equal(runtimeAssetPath("web","/app/release","/app/backend"),"/app/release/web");
  assert.equal(runtimeAssetPath(["fonts","a.ttf"],"/app/release","/app/backend"),"/app/release/fonts/a.ttf");
  assert.equal(runtimeAssetPath("oss/user/a.png","/app/release","/app/backend"),"/app/backend/data/oss/user/a.png");
  assert.equal(runtimeAssetPath("web",undefined,"/app/backend"),"/app/backend/data/web");
  assert.equal(runtimeAssetPath(undefined,"/app/release","/app/backend"),"/app/backend/data");
  for (const value of ["web/../../oss","../../etc/passwd",["web","..","serve","app.js"]]) assert.throws(()=>runtimeAssetPath(value,"/app/release","/app/backend"));
  assert.throws(()=>runtimeAssetPath("web","relative","/app/backend"));
});
