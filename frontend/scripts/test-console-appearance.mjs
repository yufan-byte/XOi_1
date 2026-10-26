// Visual/interaction regression via web-access CDP Proxy. All API calls stay in a fixture server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const proxy = process.env.CDP_PROXY || "http://localhost:3456";
const fixture = spawn(process.execPath, [fileURLToPath(new URL("./preview-console-appearance.mjs", import.meta.url))], { stdio: ["ignore", "pipe", "inherit"] });
const tabs = [];
const output = await mkdtemp(join(tmpdir(), "xoi-console-appearance-"));
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
async function endpoint(path, code) {
  const r = await fetch(proxy + path, { method: code === undefined ? "GET" : "POST", ...(code === undefined ? {} : { body: code }), signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  if (!text) throw Error("Browser target unavailable");
  const result = JSON.parse(text);
  if (result.error) throw Error(result.error);
  return result;
}
async function evaluate(tab, code) { return (await endpoint(`/eval?target=${tab}`, code)).value; }
async function until(tab, code) {
  for (let n = 0; n < 80; n++) { if (await evaluate(tab, code)) return; await pause(); }
  throw Error(`Timed out: ${code}`);
}
async function newTab(url) {
  const result = await endpoint("/new", url); assert.ok(result.targetId); tabs.push(result.targetId); return result.targetId;
}
try {
  const line = await new Promise((resolve, reject) => {
    let data = "";
    const timer = setTimeout(() => reject(Error("Fixture did not start")), 10000);
    fixture.stdout.on("data", chunk => { data += chunk; if (data.includes("\n")) { clearTimeout(timer); resolve(data.split("\n")[0]); } });
    fixture.once("error", reject);
  });
  const url = JSON.parse(line).url;
  const origin = new URL(url).origin;
  const tab = await newTab(url);
  await until(tab, "!!document.querySelector('.xoi-admin-shell main h1')");
  assert.equal(await evaluate(tab, "getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), "#b94b18");
  assert.equal(await evaluate(tab, "document.documentElement.scrollWidth<=innerWidth"), true);
  await endpoint(`/screenshot?target=${tab}&file=${encodeURIComponent(join(output, "overview-light.png"))}`);
  await evaluate(tab, "document.querySelector('[aria-label=\"切换主题\"]').click()");
  await until(tab, "document.documentElement.classList.contains('dark')");
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(await evaluate(tab, "getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), "#f0a071");
  await endpoint(`/screenshot?target=${tab}&file=${encodeURIComponent(join(output, "overview-dark.png"))}`);
  await endpoint(`/clickAt?target=${tab}`, '[aria-label^="用户菜单"]');
  await until(tab, "!!document.querySelector('[role=menu]')");
  assert.equal(await evaluate(tab, "getComputedStyle(document.querySelector('[role=menu]')).getPropertyValue('--primary').trim()"), "#f0a071");
  await evaluate(tab, "document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await endpoint(`/navigate?target=${tab}`, url);
  await until(tab, "!!document.querySelector('.xoi-admin-shell') && document.documentElement.classList.contains('dark')");
  await evaluate(tab, "document.querySelector('[aria-label=\"切换主题\"]').click()");
  await until(tab, "!document.documentElement.classList.contains('dark')");
  await new Promise(resolve => setTimeout(resolve, 250));
  await evaluate(tab, "document.querySelector('aside a[href=\"/console/reseller/models\"]').click()");
  await until(tab, "!!document.querySelector('[role=tablist][aria-label=\"模型管理标签\"]')");
  await evaluate(tab, "[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='定价设置').click()");
  await until(tab, "!!document.querySelector('main table tbody tr')");
  assert.equal(await evaluate(tab, "document.documentElement.scrollWidth<=innerWidth"), true);
  await endpoint(`/screenshot?target=${tab}&file=${encodeURIComponent(join(output, "model-pricing.png"))}`);
  await evaluate(tab, "document.querySelector('[aria-label=\"Collapse sidebar\"]').click()");
  await until(tab, "document.querySelector('aside').getBoundingClientRect().width<100");
  await evaluate(tab, "document.querySelector('aside [aria-label=\"平台运营\"]').click()");
  await until(tab, "document.querySelector('aside').getBoundingClientRect().width>150 && document.querySelector('aside [aria-label=\"平台运营\"]').getAttribute('aria-expanded')==='true'");
  await evaluate(tab, "document.querySelector('aside a[href=\"/console/reseller/team-space\"]').click()");
  await until(tab, "!!document.querySelector('.xoi-team-workspace h1') && document.body.innerText.includes('演示协作团队')");
  assert.equal(await evaluate(tab, "document.documentElement.classList.contains('xoi-management')&&!document.documentElement.classList.contains('dark')"), true);
  assert.equal(await evaluate(tab, "getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), "#b94b18");
  await endpoint(`/screenshot?target=${tab}&file=${encodeURIComponent(join(output, "team-owner.png"))}`);
  await evaluate(tab, "[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='成员与额度').click()");
  await until(tab, "!!document.querySelector('.xoi-team-workspace tbody tr')");
  await evaluate(tab, "[...document.querySelectorAll('button')].find(e=>e.textContent==='添加成员').click()");
  await until(tab, "!!document.querySelector('[role=dialog]')");
  assert.equal(await evaluate(tab, "getComputedStyle(document.querySelector('[role=dialog]')).getPropertyValue('--primary').trim()"), "#b94b18");
  await endpoint(`/screenshot?target=${tab}&file=${encodeURIComponent(join(output, "team-member-dialog.png"))}`);
  await evaluate(tab, "document.querySelector('[role=dialog] [aria-label=\"关闭\"]').click()");
  await evaluate(tab, "[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='消费明细').click()");
  await until(tab, "!!document.querySelector('.xoi-team-workspace tbody tr')");
  await evaluate(tab, "document.querySelector('[aria-label=\"切换主题\"]').click()");
  await until(tab, "document.documentElement.classList.contains('dark')");
  await evaluate(tab, "document.querySelector('aside a[href=\"/console/reseller/overview\"]').click()");
  await until(tab, "!!document.querySelector('.xoi-admin-shell')&&document.documentElement.classList.contains('dark')");
  assert.equal(await evaluate(tab, "getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), "#f0a071");
  await evaluate(tab, "document.querySelector('[aria-label=\"切换主题\"]').click()");
  await until(tab, "!document.documentElement.classList.contains('dark')");
  const member = await newTab(origin + "/console/team?fixtureTeam=member");
  await until(member, "!!document.querySelector('.xoi-team-shell tbody tr')");
  assert.equal(await evaluate(member, "!!document.querySelector('main a[href=\"/console/reseller/overview\"]')"), false);
  assert.equal(await evaluate(member, "document.body.innerText.includes('成员与额度')"), false);
  assert.equal(await evaluate(member, "getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), "#b94b18");
  const freshTeam = await newTab(origin + "/console/reseller/team-space?fixtureTeam=none&fixtureFresh=1");
  await until(freshTeam, "document.querySelector('.xoi-team-workspace h1')?.textContent==='创建团队空间'");
  assert.equal(await evaluate(freshTeam, "document.documentElement.classList.contains('dark')"), false);
  const teamMobile = await newTab(origin + "/__test/mobile?page=team");
  await until(teamMobile, "!!document.querySelector('iframe')?.contentDocument?.querySelector('.xoi-team-shell tbody tr')");
  assert.equal(await evaluate(teamMobile, "(()=>{const f=document.querySelector('iframe');return f.contentWindow.innerWidth===390&&f.contentDocument.documentElement.scrollWidth<=390})()"), true);
  const mobile = await newTab(origin + "/__test/mobile");
  await until(mobile, "!!document.querySelector('iframe')?.contentDocument?.querySelector('.xoi-admin-shell')");
  assert.equal(await evaluate(mobile, "(()=>{const f=document.querySelector('iframe');return f.contentWindow.innerWidth===390&&f.contentDocument.documentElement.scrollWidth<=390})()"), true);
  await evaluate(mobile, "document.querySelector('iframe').contentDocument.querySelector('[aria-label=\"打开后台导航\"]').click()");
  await until(mobile, "!!document.querySelector('iframe').contentDocument.querySelector('[aria-label=\"关闭后台导航\"]')");
  await endpoint(`/screenshot?target=${mobile}&file=${encodeURIComponent(join(output, "mobile-navigation.png"))}`);
  await evaluate(mobile, "document.querySelector('iframe').contentDocument.querySelector('aside a[href=\"/console/reseller/models\"]').click()");
  await until(mobile, "document.querySelector('iframe').contentWindow.location.pathname.endsWith('/models')&&!document.querySelector('iframe').contentDocument.querySelector('[aria-label=\"关闭后台导航\"]')");
  await evaluate(tab, "localStorage.setItem('theme','system');window.dispatchEvent(new Event('xoi:theme-change'))");
  await until(tab, "document.documentElement.classList.contains('dark')===matchMedia('(prefers-color-scheme: dark)').matches");
  await evaluate(tab, "history.pushState(null,'','/console/login?stay=1');dispatchEvent(new PopStateEvent('popstate'))");
  await until(tab, "!document.documentElement.classList.contains('xoi-management')&&!!document.querySelector('input[autocomplete=username]')");
  assert.notEqual(await evaluate(tab, "getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), "#b94b18");
  const requests = await (await fetch(origin + "/__test/requests")).json();
  assert.ok(requests.every(r => r.method === "GET"));
  assert.ok(requests.every(r => !/generat|completions|payment|sync-upstream/.test(r.path)));
  console.log(JSON.stringify({ passed: true, fixtureOnly: true, checks: ["light/dark palette", "no horizontal overflow", "portal palette", "theme survives reload", "pricing table", "collapsed group expands", "390px mobile navigation", "system theme", "login palette isolation", "admin/team shared palette", "team member dialog", "team members and records", "dark team return to admin", "member without admin permission", "fresh team defaults light", "390px team page"], paidRequests: 0, apiWrites: 0, screenshots: output }));
} finally {
  for (const tab of tabs) { try { await endpoint(`/close?target=${tab}`); } catch {} }
  fixture.kill("SIGTERM");
}
