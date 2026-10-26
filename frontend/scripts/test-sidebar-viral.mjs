import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startSidebarViralFixture } from './preview-sidebar-viral.mjs';
const fixture = await startSidebarViralFixture();
const output = await mkdtemp(path.join(tmpdir(), 'xoi-sidebar-viral-'));
const tabs = [];
const proxy = 'http://localhost:3456';
async function evaluate(id, code) {
  const result = await (await fetch(`${proxy}/eval?target=${id}`, { method: 'POST', body: code })).json();
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result.value;
}
async function until(id, code) {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const value = await evaluate(id, code);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out: ${code}`);
}
async function open(url) {
  const { targetId } = await (await fetch(`${proxy}/new`, { method: 'POST', body: url })).json();
  tabs.push(targetId); return targetId;
}
async function shot(id, name) { await fetch(`${proxy}/screenshot?target=${id}&file=${encodeURIComponent(path.join(output, name + '.png'))}`); }
try {
  const limited = await open(`${fixture.origin}/?case=limited#/viral-replicate`);
  await until(limited, `document.querySelector('.modelReadiness')?.textContent.includes('缺少已确认支持看图')`);
  assert.equal(await evaluate(limited, `[...document.querySelectorAll('.actionBar button')].some(b=>b.disabled&&b.textContent.includes('需先配置视觉理解模型'))`), true);
  const position = await evaluate(limited, `(()=>{const b=document.querySelector('.sidebar-toggle'),r=b.getBoundingClientRect(),menu=document.querySelector('.menu').getBoundingClientRect();return {top:r.top,width:r.width,height:r.height,center:r.left+r.width/2,edge:menu.right,sidebarWidth:menu.width,logoBottom:document.querySelector('.logoBox').getBoundingClientRect().bottom,inLogo:!!b.closest('.logoBox'),inFooter:!!b.closest('.footItem'),hit:b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),rowHeight:document.querySelector('.menu .item').getBoundingClientRect().height,hero:document.querySelector('.hero').getBoundingClientRect().height};})()`);
  assert.equal(position.inLogo, false); assert.equal(position.inFooter, false);
  assert.ok(position.top >= position.logoBottom && position.top < 160);
  assert.ok(Math.abs(position.center-position.edge)<2); assert.ok(position.width>=28 && position.height>=32);
  assert.equal(position.hit,true,'edge button must not be covered'); assert.ok(position.sidebarWidth>=270); assert.ok(position.rowHeight>=52); assert.ok(position.hero<200);
  await shot(limited, 'desktop-limited');
  await fetch(`${proxy}/clickAt?target=${limited}`, {method:'POST',body:'.sidebar-toggle'});
  await until(limited, `document.querySelector('.menu')?.classList.contains('collapsed') && Math.abs(document.querySelector('.menu').getBoundingClientRect().width-72)<1 && Math.abs(document.querySelector('.sidebar-toggle').getBoundingClientRect().left+15-document.querySelector('.menu').getBoundingClientRect().right)<1`);
  assert.equal(await evaluate(limited, `(()=>{const b=document.querySelector('.sidebar-toggle'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))&&b.getAttribute('aria-label')==='展开侧栏'})()`),true);
  await shot(limited, 'desktop-collapsed');
  await fetch(`${proxy}/clickAt?target=${limited}`, {method:'POST',body:'.sidebar-toggle'});
  await until(limited, `!document.querySelector('.menu')?.classList.contains('collapsed') && Math.abs(document.querySelector('.menu').getBoundingClientRect().width-272)<1 && Math.abs(document.querySelector('.sidebar-toggle').getBoundingClientRect().left+15-document.querySelector('.menu').getBoundingClientRect().right)<1`);
  await evaluate(limited, `document.querySelectorAll('.moduleTabs button')[2].click()`);
  await until(limited, `document.querySelector('.actionBar')?.textContent.includes('本地工具 · 0 积分')`);
  assert.equal(await evaluate(limited, `!!document.querySelector('.modelReadiness')`), false);
  assert.equal(await evaluate(limited, `document.querySelector('.menu').classList.contains('collapsed')`), false,'route/tab changes must not force compact mode');

  const ready = await open(`${fixture.origin}/?case=ready#/viral-replicate`);
  await until(ready, `document.querySelectorAll('.modelSelectControl').length===3 && document.querySelector('.modelSelectControl').textContent.includes('fixture-vision') && !document.querySelector('.modelReadiness') && !document.querySelector('.settingsFieldset').disabled`);
  const before = fixture.requests.filter(r => r.path === '/api/modelSelect/getModelList').length;
  await evaluate(ready, `document.querySelector('.modelSelectControl').scrollIntoView({block:'center'}); document.querySelector('.modelSelectControl').click()`);
  assert.equal(await until(ready, `document.querySelectorAll('.modelPanelOption').length`), 1, 'eligible non-recommended vision model remains visible');
  await evaluate(ready, `document.querySelector('.modelPanelClose').click(); document.querySelectorAll('.moduleTabs button')[3].click()`);
  await until(ready, `document.querySelector('.modelSelectControl')?.textContent.includes('fixture-image-multi')`);
  await evaluate(ready, `document.querySelector('.modelSelectControl').scrollIntoView({block:'center'}); document.querySelector('.modelSelectControl').click()`);
  await until(ready, `document.querySelector('.modelPanelOption')?.textContent.includes('fixture-image-multi')`);
  assert.equal(await evaluate(ready, `document.querySelector('.modelPanelList').textContent.includes('fixture-image-single')`), false);
  assert.equal(fixture.requests.filter(r => r.path === '/api/modelSelect/getModelList').length, before);
  await evaluate(ready, `document.querySelector('.modelPanelClose').click()`);
  await shot(ready, 'desktop-ready-image');

  const mobile = await open(`${fixture.origin}/__mobile?case=ready`);
  await until(mobile, `document.querySelector('iframe')?.contentDocument.querySelector('.viralPage')`);
  const metrics = await until(mobile, `(()=>{const w=document.querySelector('iframe').contentWindow,d=w.document,b=d.querySelector('.sidebar-toggle');if(!b)return null;return {width:w.innerWidth,scrollWidth:d.documentElement.scrollWidth,bodyWidth:d.body.scrollWidth,toggleBottom:b.getBoundingClientRect().bottom,collapsed:d.querySelector('.menu').classList.contains('collapsed')}})()`);
  assert.equal(metrics.width, 390); assert.equal(metrics.collapsed, true);
  assert.ok(metrics.scrollWidth <= 391); assert.ok(metrics.bodyWidth <= 391); assert.ok(metrics.toggleBottom <= 844);
  await shot(mobile, 'mobile-390');
  const short = await open(`${fixture.origin}/__short`);
  await until(short, `document.querySelector('iframe')?.contentDocument.querySelector('.sidebar-toggle')`);
  const shortMetrics=await evaluate(short, `(()=>{const d=document.querySelector('iframe').contentDocument,b=d.querySelector('.sidebar-toggle'),r=b.getBoundingClientRect(),list=d.querySelector('.itemBox'),footer=d.querySelector('.footItem').getBoundingClientRect(),tools=d.querySelector('.tools-trigger'),tr=tools.getBoundingClientRect();return {hit:b.contains(d.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),top:r.top,bottom:r.bottom,footerBottom:footer.bottom,scrollable:list.scrollHeight>list.clientHeight,toolsVisible:tr.top>=0&&tr.bottom<620&&tools.contains(d.elementFromPoint(tr.left+tr.width/2,tr.top+tr.height/2))};})()`);
  assert.equal(shortMetrics.hit,true); assert.ok(shortMetrics.bottom<620); assert.ok(shortMetrics.footerBottom<=621); assert.equal(shortMetrics.scrollable,true,'short windows scroll navigation instead of shrinking targets');
  assert.equal(shortMetrics.toolsVisible,true,'more tools must remain visible outside the navigation scroller');
  await shot(short,'short-620');
  const failure = await open(`${fixture.origin}/?case=failure#/viral-replicate`);
  await until(failure, `document.querySelector('.modelReadiness')?.textContent.includes('无法读取当前账号的模型能力')`);
  assert.equal(await evaluate(failure, `[...document.querySelectorAll('.modelReadiness button')].some(b=>!b.disabled&&b.textContent.includes('重新检查'))`), true);
  await shot(failure, 'catalog-failure');
  const forbidden = fixture.requests.filter(r => !['GET', 'HEAD'].includes(r.method) && !['/api/modelSelect/getModelList', '/api/model-catalog/quote'].includes(r.path));
  assert.deepEqual(forbidden, [], 'UI navigation must not attempt generation or write a draft');
  console.log(JSON.stringify({ passed: true, screenshots: output, checks: ['missing-capability gating', 'compact header', 'visible edge toggle/hit test', 'real mouse collapse round-trip', 'roomy 272px/52px sidebar', 'no automatic collapse', '620px height navigation scroll', 'free local mode', 'ready catalog initialization', 'recommendation fallback', 'multi-reference limit', 'shared requests', '390px layout', 'catalog failure/retry', 'zero writes/model calls'] }, null, 2));
} catch (error) {
  console.error('Fixture screenshots:', output);
  for (const id of tabs) {
    console.error(await evaluate(id, `({url:location.href,fields:[...document.querySelectorAll('.modelSelectControl')].map(x=>({label:x.textContent,rect:x.getBoundingClientRect().toJSON()})),panel:document.querySelector('.xoi-model-panel')?.textContent,body:document.body.innerText.slice(-350)})`).catch(() => null));
    await shot(id, 'failure-' + id);
  }
  throw error;
} finally {
  await Promise.all(tabs.map(id => fetch(`${proxy}/close?target=${id}`).catch(() => {})));
  await fixture.close();
}
