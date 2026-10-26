import test from "node:test";
import assert from "node:assert/strict";
import {safeLogValue} from "./securityLogging";
test("logs do not contain API credentials, JWTs, passwords, database passwords or axios config",()=>{
  const token="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.longsignature",key="sk-abcdefghijklmnopqrstuvwxyz123456";
  const input={headers:{Authorization:"Bearer "+key},password:"plain-private",token,NEWAPI_ADMIN_TOKEN:"private-env-token",connection:"postgres://root:pg-private@localhost/db",child:{apiKey:key,key:"a".repeat(48)}};
  const text=JSON.stringify(safeLogValue(input));for(const secret of [key,token,"plain-private","pg-private","a".repeat(48)])assert.equal(text.includes(secret),false);
  const error=Object.assign(new Error("Bearer "+key),{config:input});assert.equal(JSON.stringify(safeLogValue(error)).includes(key),false);
  assert.equal(text.includes("private-env-token"),false);
  assert.equal(JSON.stringify(safeLogValue(JSON.stringify(input))).includes(key),false);
});
