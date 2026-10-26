import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {TEAM_WORKSPACE_PATH,formatTeamQuota,teamQuotaPoints,teamPointsToYuan,teamMemberRole,csvTeamCell,teamMonths,teamResetText} from "../../../frontend/console/src/lib/team-presentation";
test("team display and submission share the one-yuan-ten-points rule",()=>{
  assert.equal(formatTeamQuota(500000),"10 积分");assert.equal(teamQuotaPoints(1000000),20);
  assert.equal(teamPointsToYuan("10"),1);assert.equal(teamPointsToYuan("0"),0);assert.equal(teamPointsToYuan("1.5"),.15);
  assert.equal(teamPointsToYuan(String(teamQuotaPoints(750000))),1.5);
  for(const value of [""," ","1..5","NaN","Infinity","1e9","-1","90071992547409910","0.000001"])assert.equal(teamPointsToYuan(value),null);
});
test("team periods follow Beijing backend periods, not the viewer's device timezone",()=>{
  const now=Date.parse("2026-12-31T16:01:00Z");
  assert.equal(teamMonths(now)[0],"2027-01");assert.equal(teamMonths(now)[1],"2026-12");assert.equal(teamMonths(now).length,12);
  assert.equal(teamResetText("month",now),"2027年2月1日（北京时间）");assert.equal(teamResetText("total",now),"不自动重置");
});
test("viewer role is never labeled admin; CSV names cannot execute spreadsheet formulas",()=>{
  assert.equal(teamMemberRole(true),"消费查看者");assert.equal(teamMemberRole(false),"团队成员");
  for(const s of ["=1+1","+SUM(1)","@cmd"," -1+2","\n=1"])assert.ok(csvTeamCell(s).startsWith("'"));
  assert.equal(csvTeamCell("成员一"),"成员一");assert.equal(csvTeamCell(-2),"-2");
});
test("admin menu uses embedded team route, ordinary member entry keeps its separate gate",async()=>{
  const root=path.resolve(__dirname,"../../..");
  const menu=await fs.readFile(path.join(root,"frontend/console/src/components/reseller-menu.ts"),"utf8");
  const routes=await fs.readFile(path.join(root,"frontend/console/src/components/reseller/admin-routes.tsx"),"utf8");
  const team=await fs.readFile(path.join(root,"frontend/console/src/components/team/team-page.tsx"),"utf8");
  const main=await fs.readFile(path.join(root,"frontend/console/src/main.tsx"),"utf8");
  assert.ok(menu.includes(`href: "${TEAM_WORKSPACE_PATH}"`));assert.ok(!menu.includes('label: "团队空间", href: "/team"'));
  assert.ok(routes.includes('<ResellerShell><TeamWorkspaceContent embedded/></ResellerShell>'));assert.ok(routes.includes('path="/reseller/team-space"'));
  assert.ok(team.includes('if(embedded)return <section'));assert.ok(main.includes('<Route path="/team" element={<ResellerShell><TeamPage embedded /></ResellerShell>} />'));
  assert.ok(team.includes('teamPointsToYuan(form.limit)'));assert.ok(team.includes('submitting.current=true'));assert.ok(team.includes('window.confirm(`确认将'));
});
