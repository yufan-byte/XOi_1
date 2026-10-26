// Real browser, isolated mocked API only. All writes are blocked by fixture server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const proxy = process.env.CDP_PROXY || "http://localhost:3456";
const fixture = spawn(process.execPath, [fileURLToPath(new URL("./preview-console-appearance.mjs", import.meta.url))], { stdio: ["ignore", "pipe", "inherit"] });
const tabs = [];
const output = await mkdtemp(join(tmpdir(), "xoi-usage-provenance-"));
async function command(path, body) {
  const response = await fetch(proxy + path, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(15000) });
  const value = await response.json(); if (value.error) throw Error(value.error); return value;
}
const evaluate = async (tab, code) => (await command(`/eval?target=${tab}`, code)).value;
async function until(tab, code) {
  for (let n = 0; n < 80; n++) { if (await evaluate(tab, code)) return; await new Promise(resolve => setTimeout(resolve, 150)); }
  throw Error(`Timed out: ${code}`);
}
try {
  const url = await new Promise((resolve, reject) => {
    let text = ""; const timer = setTimeout(() => reject(Error("Fixture startup timeout")), 10000);
    fixture.stdout.on("data", chunk => { text += chunk; if (text.includes("\n")) { clearTimeout(timer); resolve(JSON.parse(text.split("\n")[0]).url); } });
    fixture.once("error", reject);
  });
  const origin = new URL(url).origin;
  const { targetId: tab } = await command("/new", origin + "/console/usage?fixtureUsage=1&fixtureFresh=1&fixtureRole=user"); tabs.push(tab);
  await until(tab, "document.querySelectorAll('[data-usage-record]').length===4");
  const text = await evaluate(tab, "document.body.innerText");
  for (const label of ["导演 AI 助手", "画布生图", "来源未记录", "未扣积分", "已退款", "导出本页"]) assert.ok(text.includes(label), label);
  assert.equal(text.includes("稳定优先"), false);
  assert.equal(await evaluate(tab, "document.querySelector('[data-usage-record=\"21\"] summary').textContent.includes('-0')"), false);
  assert.match(await evaluate(tab, "document.querySelector('[data-usage-record=\"24\"] summary').textContent"), /\+1\s*积分/);
  assert.equal(await evaluate(tab, "document.querySelector('[data-usage-record=\"21\"]').open"), false);
  await evaluate(tab, "document.querySelector('[data-usage-record=\"21\"] summary').scrollIntoView({block:'center'})");
  await evaluate(tab, "document.querySelector('[data-usage-record=\"21\"] summary').click()");
  await until(tab, "document.querySelector('[data-usage-record=\"21\"]').open");
  assert.equal(await evaluate(tab, "document.querySelector('[data-usage-record=\"21\"]').open"), true);
  assert.ok((await evaluate(tab, "document.querySelector('[data-usage-record=\"21\"]').innerText")).includes("1880 / 输出 499"));
  await command(`/screenshot?target=${tab}&file=${encodeURIComponent(join(output, "usage-expanded.png"))}`);
  await evaluate(tab, "document.querySelector('[data-usage-record=\"21\"] summary').click();[...document.querySelectorAll('button')].find(e=>e.textContent==='钱花在哪').click()");
  await until(tab, "document.body.innerText.includes('非全量账单统计')");
  await evaluate(tab, "document.querySelector('[aria-label=\"下一页\"]').click()");
  await until(tab, "document.body.innerText.includes('生成视频提示词')");
  await evaluate(tab, "[...document.querySelectorAll('button')].find(e=>e.textContent==='使用消费').click()");
  await until(tab, "document.querySelectorAll('[data-usage-record]').length===4");
  await command(`/screenshot?target=${tab}&file=${encodeURIComponent(join(output, "usage-clean.png"))}`);
  const { targetId: mobile } = await command("/new", origin + "/__test/mobile"); tabs.push(mobile);
  await evaluate(mobile, `document.body.style.margin='0';document.body.innerHTML='<iframe title="积分明细手机验收" src="${origin}/console/usage?fixtureUsage=1&embed=1&theme=light" style="width:390px;height:844px;border:0"></iframe>'`);
  await until(mobile, "document.querySelector('iframe').contentDocument?.querySelectorAll('[data-usage-record]').length===4");
  assert.equal(await evaluate(mobile, "(()=>{const d=document.querySelector('iframe').contentDocument;return d.documentElement.scrollWidth<=390})()"), true);
  await command(`/screenshot?target=${mobile}&file=${encodeURIComponent(join(output, "usage-mobile.png"))}`);
  const requests = await (await fetch(origin + "/__test/requests")).json();
  assert.ok(requests.every(r => r.method === "GET"));
  assert.ok(requests.every(r => !/generat|completions|payment|sync-upstream/.test(r.path)));
  console.log(JSON.stringify({ passed: true, featureLabels: true, exactZeroAndRefund: true, detailsToggle: true, summaryPagination: true, mobile390: true, apiWrites: 0, paidRequests: 0, screenshots: output }));
} finally {
  for (const tab of tabs) { try { await command(`/close?target=${tab}`); } catch {} }
  fixture.kill("SIGTERM");
}
