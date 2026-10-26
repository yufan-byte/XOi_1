// Isolated visual fixture server. Never connects to XOi, NewAPI or an upstream.
// Run after build:console, inspect the printed loopback URL, Ctrl-C when finished.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../public/console/", import.meta.url));
const models = { disabled: [], markupPct: 0, markupHistory: [], downstreamMarkupPct: 5 };
const split = (total, direct = total) => ({ total, direct, indirect: total - direct });
const requests = [];
const bootstrap = `<script>
if(location.pathname.startsWith('/console/') && !['/console/login','/console/signup','/console/login/','/console/signup/'].includes(location.pathname)) {
  if(new URLSearchParams(location.search).has('fixtureFresh')) localStorage.removeItem('theme');
  const payload=btoa(JSON.stringify({id:1,exp:Math.floor(Date.now()/1000)+3600}));
  localStorage.setItem('token','Bearer fixture.'+payload+'.not-a-real-signature');
  localStorage.setItem('userId','1');localStorage.setItem('role',new URLSearchParams(location.search).get('fixtureTeam')==='member'||new URLSearchParams(location.search).get('fixtureRole')==='user'?'user':'admin');
  localStorage.setItem('username','界面验收');
}
</script>`;
const teamMember = { id: 1, userId: 2, nickname: "演示成员", email: "member@example.test", status: "active", limitQuota: 50000000, period: "month", canViewAll: false, periodUsed: 1000000, monthUsed: 1000000, wallet: 5000000, over: false };
const fixtures = (url, referer) => {
  const section = url.searchParams.get("section");
  switch (url.pathname) {
    case "/api/reseller/config": return {
      site: { name: "XOi", subtitle: "创作平台", hideSubtitle: false, logo: "", footer: "" },
      theme: { skin: "obsidian", loginVideo: "", customBackground: "", customTemplate: "" },
      models, customerService: { contacts: [], groups: [] },
      settings: { minTopup: 0, allowCustomAmount: true, topupTiers: [], userInvite: false, showBecomeReseller: false },
    }[section] ?? {};
    case "/api/reseller/me": return { scope: referer.searchParams.get("fixtureRole") === "user" ? null : "platform", root: true };
    case "/api/login/self": return { id: 1, username: "界面验收", display_name: "界面验收", email: "", quota: 0, used_quota: 0, role: referer.searchParams.get("fixtureTeam") === "member" || referer.searchParams.get("fixtureRole") === "user" ? 1 : 10, group: "default" };
    case "/api/team": {
      const role = referer.searchParams.get("fixtureTeam") || "owner";
      if (role === "none") return { role: "none" };
      return { role, canViewAll: referer.searchParams.get("fixtureViewer")==="1", team: { id: 1, name: "演示协作团队", pool: 100000000, isolate: true }, monthTotal: 1000000, seats: { used: 1, max: 2000, active: 1, disabled: 0 }, overLimit: [], members: [teamMember], mine: teamMember, me: { nickname: teamMember.nickname, limitQuota: teamMember.limitQuota, period: "month", status: "active" }, days: referer.searchParams.has("fixtureCrash") ? {} : [{ day: "2026-10-15", quota: 400000 }, { day: "2026-10-16", quota: 600000 }] };
    }
    case "/api/team/records": return { items: [{ id: 1, member: "演示成员", at: 1792108800, model: "模型示例", quota: 1000000, category: "image" }], total: 1 };
    case "/api/team/management": return url.searchParams.get("view")==="operations"?{page:1,pageSize:20,total:3,items:[
      {id:"event-1",action:"team.rename",status:"confirmed",actorId:1,at:1792227780000,details:{name:"演示协作团队",previousName:"原团队名"}},
      {id:"event-2",action:"member.update",status:"needs_review",actorId:1,at:1792227700000,memberId:1,details:{nickname:"演示成员",limitQuota:500000,canViewAll:false}},
      {id:"event-3",action:"member.password",status:"started",actorId:1,at:1792227600000,memberId:1,details:{}},
    ]}:{page:1,pageSize:20,total:2,items:[
      {id:"flow-1",kind:"transfer_in",userId:1,amount:500000,poolAfter:100000000,actorId:1,at:1792227780000},
      {id:"flow-2",kind:"allocate",userId:2,nickname:"演示成员",amount:250000,poolAfter:99500000,actorId:1,at:1792227700000},
    ]};
    case "/api/user/self": return { id: 1, username: "界面验收", quota: 0, used_quota: 0, email: "", role: 1, group: "default" };
    case "/api/user/topup/info": return { enable_online_topup: true, enable_redemption: true };
    case "/api/log/self": {
      if (!referer.searchParams.has("fixtureUsage")) return { items: [], total: 0 };
      const base = { type: 2, model_name: "agnes-2.5-flash", quota: 0, prompt_tokens: 1880, completion_tokens: 499, created_at: 1792227780, use_time: 7 };
      return { items: url.searchParams.get("p") === "2" ? [{ ...base, id: 25, xoi_source: { status: "recorded", label: "生成视频提示词", kind: "text", billingId: "fe5a3ab2-23d6-41b5-8a66-57eb8e432a8e" } }] : [
        { ...base, id: 21, xoi_source: { status: "recorded", label: "导演 AI 助手", kind: "text", billingId: "fe5a3ab2-23d6-41b5-8a66-57eb8e432a8e" } },
        { ...base, id: 22, model_name: "doubao-seedream-5-0", quota: 92700, xoi_source: { status: "recorded", label: "画布生图", kind: "image", billingId: "05da3ab2-23d6-41b5-8a66-57eb8e432a8e" } },
        { ...base, id: 23, xoi_source: { status: "unknown" } },
        { ...base, id: 24, model_name: "seedance2.0-line1", quota: -50000, xoi_source: { status: "unavailable" } },
      ], total: 25 };
    }
    case "/api/log/self/stat": return { quota: 0 };
    case "/api/agent/apply": return { admin: false, status: null, apply: null, reviewNote: null, inviteCode: null };
    case "/api/reseller/overview": return {
      range: url.searchParams.get("range"), markupPct: 0, share: 0,
      totals: { income: split(1250, 980), withdrawable: 680, customers: 128, direct: 106, indirect: 22, agents: 8 },
      period: { income: split(85, 62), consume: split(246, 200), topup: split(360, 300), newUsers: 12, newDirect: 10, newIndirect: 2 },
      series: Array.from({ length: 7 }, (_, i) => ({ t: `10/${10 + i}`, income: [12, 25, 18, 42, 35, 64, 85][i], consume: [46, 68, 58, 120, 99, 186, 246][i], topup: [80, 120, 100, 180, 160, 260, 360][i] })),
      funnel: { registered: 128, paid: 76, repeat: 42, topupRate: 0.594, totalTopup: 3200, repurchaseRate: 0.553 },
      topCustomers: [{ id: 2, username: "演示客户", consume: 128 }],
      topModels: [{ model: "Seedream · 示例", consume: 96, count: 48 }],
    };
    case "/api/reseller/models": return { models, remaining: 3, defaultGroupRatio: 1, optionError: "" };
    case "/api/reseller/models/upstream-status": return { syncedAt: null, models: 0, status: "paused", canSync: false };
    case "/api/catalog/sources": return {};
    case "/api/catalog/logical": return { models: [] };
    case "/api/agent/price-factor": return { factor: 1 };
    default: return null;
  }
};
const mime = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const json = (status, value) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
  if (req.method !== "GET") { requests.push({ method: req.method, path: url.pathname }); return json(405, { success: false, message: "Visual fixture: writes blocked" }); }
  if (url.pathname === "/__test/requests") return json(200, requests);
  if (url.pathname === "/__test/missing-module.js") { res.writeHead(503, { "Content-Type": "text/javascript" }); return res.end(""); }
  if (url.pathname.startsWith("/api/")) {
    requests.push({ method: req.method, path: url.pathname });
    if(url.pathname==="/api/team/management"&&new URL(req.headers.referer||"/","http://127.0.0.1").searchParams.has("fixtureHistoryError"))return json(503,{success:false,message:"Fixture history unavailable"});
    if (url.pathname === "/api/pricing") return json(200, { success: true, data: ["gpt-4o", "doubao-seedream-5-0", "seedance2.0-line1"].map(model_name => ({ model_name, quota_type: 1, model_ratio: 1, model_price: 0.1, completion_ratio: 1, enable_groups: ["default"], supported_endpoint_types: ["openai"] })), group_ratio: { default: 1 }, usable_group: { default: "默认" } });
    const value = fixtures(url, new URL(req.headers.referer || "/", "http://127.0.0.1"));
    return value === null ? json(404, { success: false, message: `Unmocked: ${url.pathname}` }) : json(200, { success: true, data: value });
  }
  if (url.pathname === "/__test/mobile") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(`<!doctype html><body style="margin:0;background:#ddd"><iframe title="手机布局验收" src="${url.searchParams.get("page")==="team-workspace"?"/console/reseller/team-space":url.searchParams.get("page") === "team" ? "/console/team?fixtureTeam=member" : "/console/reseller/overview"}" style="width:390px;height:844px;border:0"></iframe>`); }
  let relative = url.pathname.replace(/^\/console\/?/, "");
  if (!relative || !path.extname(relative)) relative = "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(root)) return json(403, { success: false });
  try {
    let body = await readFile(file);
    if (relative === "index.html") {
      let html = body.toString().replace("<head>", "<head>" + bootstrap);
      if (url.searchParams.has("fixtureHoldModule")) html = html.replace(/<script type="module"[^>]*src="\/console\/assets\/[^\"]+"[^>]*><\/script>/, "");
      if (url.searchParams.has("fixtureFailModule")) html = html.replace(/src="\/console\/assets\/[^\"]+\.js"/, 'src="/__test/missing-module.js"');
      body = Buffer.from(html);
    }
    res.writeHead(200, { "Content-Type": relative === "index.html" ? "text/html; charset=utf-8" : mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch { json(404, { success: false, message: "Missing fixture asset" }); }
});
server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ fixtureOnly: true, url: `http://127.0.0.1:${server.address().port}/console/reseller/overview` })));
