import test from "node:test";
import assert from "node:assert/strict";
import { configuredPort, isOurHealth, ownedProcess } from "./local-service.mjs";
test("separate default port, explicit override and invalid values",()=>{
  assert.equal(configuredPort({}),12121);assert.equal(configuredPort({PORT:"10689"}),10689);
  for(const value of ["0","80","65536","NaN","12121.1"])assert.throws(()=>configuredPort({PORT:value}));
});
test("foreign or mismatched health replies are never adopted",()=>{
  assert.equal(isOurHealth({status:"ok"},"own"),false);
  assert.equal(isOurHealth({product:"OtherApp",status:"ok",instance:"own"},"own"),false);
  assert.equal(isOurHealth({product:"XOi",status:"ok",instance:"other"},"own"),false);
  assert.equal(isOurHealth({product:"XOi",status:"ok",instance:"own"},"own"),true);
});
test("never kill self, invalid PID, or an unrelated process",()=>{
  assert.equal(ownedProcess(process.pid),false);assert.equal(ownedProcess(1),false);assert.equal(ownedProcess(-1),false);assert.equal(ownedProcess(NaN),false);
});
