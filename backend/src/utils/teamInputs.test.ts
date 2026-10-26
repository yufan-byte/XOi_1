import test from "node:test";
import assert from "node:assert/strict";
import {newMemberInput,memberActionInput,managementQuery,renameTeamInput} from "../lib/team/inputs";
const member={nickname:"成员",email:"person@example.test",password:"fixture-pass-123",limit:1,period:"month",canViewAll:false};
test("team inputs require explicit numeric limits and real boolean permissions",()=>{
  assert.ok(newMemberInput.safeParse(member).success);
  for(const limit of [undefined,null,"", "0",Infinity,-1,1e20])assert.equal(newMemberInput.safeParse({...member,limit}).success,false);
  for(const canViewAll of ["false","true",1,0,null])assert.equal(newMemberInput.safeParse({...member,canViewAll}).success,false);
  assert.equal(memberActionInput.safeParse({action:"update",canViewAll:"false"}).success,false);
  assert.ok(memberActionInput.safeParse({action:"update",limit:0,canViewAll:false}).success);
});
test("team settings reject ownership overrides and bound pagination",()=>{
  assert.equal(renameTeamInput.safeParse({name:"团队",expectedName:"旧团队",ownerId:99}).success,false);
  assert.equal(managementQuery.safeParse({teamId:"99"}).success,false);
  for(const page of ["0","-1","1.5","100001","abc"])assert.equal(managementQuery.safeParse({page}).success,false);
  assert.deepEqual(managementQuery.parse({}),{view:"ledger",page:1});
});
