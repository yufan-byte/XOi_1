// Only uses an isolated loopback fixture and web-access CDP Proxy. Never submits forms.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const proxy = process.env.CDP_PROXY || "http://localhost:3456";
const fixture = spawn(process.execPath, [fileURLToPath(new URL("./preview-console-appearance.mjs", import.meta.url))], { stdio: ["ignore", "pipe", "inherit"] });
const tabs = new Set();
const output = await mkdtemp(join(tmpdir(), "xoi-account-surfaces-"));
const pause = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));
async function command(path, body) {
  const response = await fetch(proxy + path, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(15000) });
  const raw = await response.text();
  if (!raw) throw Error("Browser tab unavailable");
  const result = JSON.parse(raw);
  if (result.error) throw Error(result.error);
  return result;
}
const evaluate = async (tab, code) => (await command(`/eval?target=${tab}`, code)).value;
async function until(tab, code) {
  for (let n = 0; n < 80; n++) { if (await evaluate(tab, code)) return; await pause(); }
  throw Error(`Timed out: ${code}`);
}
async function open(url) { const { targetId } = await command("/new", url); assert.ok(targetId); tabs.add(targetId); return targetId; }
async function close(tab) { await command(`/close?target=${tab}`); tabs.delete(tab); }
const screenshot = (tab, name) => command(`/screenshot?target=${tab}&file=${encodeURIComponent(join(output, name + ".png"))}`);
const preference = (tab, value) => evaluate(tab, `localStorage.setItem('theme',${JSON.stringify(value)});dispatchEvent(new Event('xoi:theme-change'))`);
const activePalette = "getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()";

try {
  const url = await new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(() => reject(Error("Fixture startup timeout")), 10000);
    fixture.stdout.on("data", chunk => { text += chunk; if (text.includes("\n")) { clearTimeout(timer); resolve(JSON.parse(text.split("\n")[0]).url); } });
    fixture.once("error", reject);
  });
  const origin = new URL(url).origin;
  const admin = await open(url);
  await until(admin, "!!document.querySelector('.xoi-admin-shell')");
  await until(admin, "!!document.querySelector('[aria-label^=\"用户菜单\"]')");
  // Use Radix's pointer event binding in the background tab; viewport fitting can
  // move physical click coordinates. The general appearance suite tests clickAt too.
  await evaluate(admin, "(()=>{const button=document.querySelector('[aria-label^=\"用户菜单\"]');button.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,pointerType:'mouse'}));button.dispatchEvent(new PointerEvent('pointerup',{button:0,bubbles:true,pointerType:'mouse'}));return true})()");
  await until(admin, "!!document.querySelector('[role=menu]')");
  await evaluate(admin, "[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('资料与安全')).dataset.auditTarget='profile'");
  await evaluate(admin, "document.querySelector('[data-audit-target=\"profile\"]').click()");
  await until(admin, "!!document.querySelector('[role=dialog]')");
  assert.equal(await evaluate(admin, "[...document.querySelector('[role=dialog]').querySelectorAll('button')].filter(e=>e.textContent==='保存').every(e=>getComputedStyle(e).backgroundImage==='none')"), true);
  await screenshot(admin, "profile-light");
  await evaluate(admin, "[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='安全').click()");
  assert.equal(await evaluate(admin, "[...document.querySelector('[role=dialog]').querySelectorAll('button')].every(e=>getComputedStyle(e).backgroundImage==='none')"), true);
  await evaluate(admin, "document.querySelector('[role=dialog] [aria-label=\"关闭\"]').click()");

  for (const path of ["topup", "usage", "agent-apply"]) {
    const tab = await open(origin + `/console/${path}?fixtureFresh=1&fixtureRole=user`);
    await until(tab, path === "agent-apply" ? "!!document.querySelector('h1')" : "!!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate(tab, activePalette), "#b94b18");
    assert.equal(await evaluate(tab, "getComputedStyle(document.body).backgroundColor"), "rgb(247, 247, 245)");
    assert.equal(await evaluate(tab, "document.documentElement.scrollWidth<=innerWidth"), true);
    await screenshot(tab, path + "-light");
    await close(tab);
  }
  let frames = 0;
  for (const saved of ["dark", "light", "system"]) {
    await preference(admin, saved);
    const expectedDark = saved === "system" ? await evaluate(admin, "matchMedia('(prefers-color-scheme: dark)').matches") : saved === "dark";
    await until(admin, `document.documentElement.classList.contains('dark')===${expectedDark}`);
    for (const path of ["topup", "usage"]) for (const theme of ["light", "dark"]) {
      const tab = await open(origin + `/console/${path}?embed=1&theme=${theme}`);
      await until(tab, "!!document.querySelector('[role=dialog]')");
      await pause(200);
      assert.equal(await evaluate(tab, activePalette), theme === "light" ? "#b94b18" : "#f0a071");
      assert.equal(await evaluate(tab, "getComputedStyle(document.body).backgroundColor"), "rgba(0, 0, 0, 0)");
      assert.equal(await evaluate(tab, "getComputedStyle(document.querySelector('.xoi-dialog-mask')).backgroundColor"), "rgba(0, 0, 0, 0)");
      assert.equal(await evaluate(tab, "getComputedStyle(document.querySelector('.xoi-dialog-mask')).backdropFilter"), "none");
      assert.equal(await evaluate(tab, "localStorage.getItem('theme')"), saved);
      assert.equal(await evaluate(admin, "document.documentElement.classList.contains('dark')"), expectedDark);
      if (saved === "dark") await screenshot(tab, `${path}-embedded-${theme}`);
      if (frames === 0) {
        await evaluate(tab, "history.pushState(null,'','/console/team');dispatchEvent(new PopStateEvent('popstate'))");
        await until(tab, "!!document.querySelector('.xoi-team-workspace')");
        assert.equal(await evaluate(tab, "document.documentElement.classList.contains('xoi-embed')"), false);
        assert.notEqual(await evaluate(tab, "getComputedStyle(document.body).backgroundColor"), "rgba(0, 0, 0, 0)");
      }
      await close(tab); frames++;
    }
  }
  await preference(admin, "dark");
  const direct = await open(origin + "/console/usage?theme=light");
  await until(direct, "!!document.querySelector('[role=dialog]')");
  assert.equal(await evaluate(direct, activePalette), "#f0a071");
  assert.equal(await evaluate(direct, "localStorage.getItem('theme')"), "dark");
  await close(direct);
  await preference(admin, "light");

  const cold = await open(origin + "/console/team?fixtureHoldModule=1");
  await until(cold, "!!document.querySelector('#xoi-boot-status')");
  assert.equal(await evaluate(cold, "getComputedStyle(document.body).backgroundColor"), "rgb(247, 247, 245)");
  assert.equal(await evaluate(cold, "document.querySelector('#xoi-boot-message').textContent"), "正在打开 XOi…");
  await screenshot(cold, "cold-start");
  await close(cold);
  const failed = await open(origin + "/console/team?fixtureFailModule=1");
  await until(failed, "document.querySelector('#xoi-boot-status')?.getAttribute('role')==='alert'");
  assert.equal(await evaluate(failed, "document.querySelector('#xoi-boot-retry').hidden"), false);
  assert.equal(await evaluate(failed, "getComputedStyle(document.body).backgroundColor"), "rgb(247, 247, 245)");
  await screenshot(failed, "module-failure");
  await close(failed);
  const crash = await open(origin + "/console/reseller/team-space?fixtureCrash=1");
  await until(crash, "document.querySelector('[role=alert]')?.textContent.includes('页面暂时未能打开')");
  assert.equal(await evaluate(crash, "getComputedStyle(document.querySelector('[role=alert]')).backgroundColor"), "rgb(247, 247, 245)");
  assert.equal(await evaluate(crash, "document.body.innerText.includes('days.map')"), false);
  await screenshot(crash, "render-error");
  await close(crash);
  const requests = await (await fetch(origin + "/__test/requests")).json();
  assert.ok(requests.every(r => r.method === "GET"));
  assert.ok(requests.every(r => !/generat|completions|payment|sync-upstream/.test(r.path)));
  console.log(JSON.stringify({ passed: true, standalonePages: 3, frameThemeCases: frames, profileAndSecurity: true, transparencyRestoredOnNavigation: true, directPageHonorsPreference: true, coldStart: true, moduleFailure: true, renderError: true, themePreferenceLeak: false, paidRequests: 0, apiWrites: 0, screenshots: output }));
} finally {
  for (const tab of tabs) { try { await command(`/close?target=${tab}`); } catch {} }
  fixture.kill("SIGTERM");
}
