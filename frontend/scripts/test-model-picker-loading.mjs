// Read-only UI smoke test on the local, already-authenticated site. Never submits a project or generation.
import assert from "node:assert/strict";
const proxy = "http://localhost:3456";
let target;
async function evaluate(code) {
  const result = await (await fetch(`${proxy}/eval?target=${target}`, { method: "POST", body: code })).json();
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result.value;
}
async function until(code) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const result = await evaluate(code);
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${code}`);
}
try {
  ({ targetId: target } = await (await fetch(`${proxy}/new`, { method: "POST", body: "http://localhost:12121/#/project" })).json());
  await until(`[...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='新建项目')`);
  await evaluate(`(() => {
    window.__pickerRequests = 0;
    window.__blockedMutations = [];
    const permit = (method,url) => {
      const path = new URL(String(url), location.href).pathname;
      if (!['GET','HEAD','OPTIONS'].includes(String(method).toUpperCase()) &&
        !['/api/modelSelect/getModelList','/api/modelSelect/getModelDetail','/api/project/getVisualManual','/api/project/queryDirectorManual'].includes(path)) {
        window.__blockedMutations.push(path); throw new Error('Read-only test blocked a write');
      }
    };
    const fetchOriginal = window.fetch;
    window.fetch = function(input,init) { permit(init?.method || input?.method || 'GET',input?.url || input); return fetchOriginal.call(this,input,init); };
    const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method,url,...args) { permit(method,url); this.__pickerCatalog = String(url).includes('/modelSelect/getModelList'); return open.call(this,method,url,...args); };
    XMLHttpRequest.prototype.send = function(...args) { if(this.__pickerCatalog) window.__pickerRequests++; return send.apply(this,args); };
    [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='新建项目').click();
  })()`);
  await until(`document.querySelectorAll('.modelSelectControl').length === 2 && window.__pickerRequests === 1`);
  // Wait for the shared first response to reach both components, without making any model call.
  await until(`performance.getEntriesByType('resource').some(x=>x.name.includes('/modelSelect/getModelList') && x.duration>0)`);
  const results = [];
  for (let i = 0; i < 6; i++) {
    const result = await evaluate(`(async()=>{
      const start = performance.now();
      document.querySelectorAll('.modelSelectControl')[${i % 2}].click();
      for(let tick=0;tick<12;tick++) await Promise.resolve();
      return {ms:Math.round((performance.now()-start)*10)/10,rows:document.querySelectorAll('.modelPanelOption').length,
        requests:window.__pickerRequests, loading:document.querySelector('.modelPanelList')?.textContent.includes('正在加载模型'),
        zero:document.querySelector('.optionPrice')?.textContent.includes('0 积分')};
    })()`);
    assert.ok(result.rows > 0, "warm open must immediately show models");
    assert.equal(result.requests, 1, "opening either model kind must reuse the shared request");
    assert.equal(result.loading, false, "warm catalog must not flash empty/loading");
    assert.equal(result.zero, true, "local free test model remains genuinely zero-priced");
    results.push(result);
    await evaluate(`document.querySelector('.modelPanelClose').click()`);
  }
  assert.deepEqual(await evaluate('window.__blockedMutations'), [], 'opening model pickers must not attempt a write');
  console.log(JSON.stringify({ passed: true, sharedRequestsForTwoPickers: 1, warmOpens: results, generationCalls: 0, blockedMutations: 0 }, null, 2));
} finally {
  if (target) await fetch(`${proxy}/close?target=${target}`);
}
