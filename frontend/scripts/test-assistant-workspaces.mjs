// Isolated browser test of the real assistant SFC. UI wrappers/stores/router are mocked;
// Vue, the component's handlers and browser video decoding are real. No paid APIs run.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse, compileScript } from '@vue/compiler-sfc';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const frontend = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(process.env.ASSISTANT_SFC || new URL('../src/views/aiAssistant/index.vue', import.meta.url), 'utf8');
// watch is supplied by the app's auto-import plugin in production.
const { descriptor } = parse(source.replace('<script setup lang="ts">', '<script setup lang="ts">\nimport { watch } from "vue";'));
const compiled = compileScript(descriptor, { id: 'assistant-workspace-test', inlineTemplate: true });
const mocks = {
  'vue-router': `import {reactive} from 'vue'; export const useRoute=()=>reactive({query:{}}); export const useRouter=()=>({push:path=>{location.hash=path}});`,
  'pinia': `export const storeToRefs=s=>s;`,
  'tdesign-vue-next': `const toast=s=>{const el=document.createElement('p');el.textContent=s;document.body.append(el)};export const MessagePlugin={info:toast,warning:toast,error:toast,success:toast};`,
  '@/stores/setting': `import {ref} from 'vue';export default ()=>({baseUrl:ref(location.origin+'/api')});`,
  '@/stores/uiPrefs': `export default ()=>({aiAssistantChromeVisible:false,toggleAiAssistantChrome(){}});`,
  '@/stores/user': `import {ref} from 'vue';const userId=ref(1);window.__testUserId=userId;export default ()=>({userId});`,
  '@/utils/axios': `export default {post:async()=>({data:[]}),get:async()=>({data:{items:[],installedIds:[]}})};`,
  '@/utils/pointsToast': `export const showPointsToast=()=>{};`,
  '@/components/ModelCostHint.vue': `export default {render:()=>null};`,
  '@/components/modelSelect.vue': `import {h} from 'vue'; export default {props:['modelValue','label'],emits:['update:modelValue','update:label','change'],setup(p,{emit}){return ()=>h('select',{'aria-label':'测试模型',value:p.modelValue,onChange:e=>{emit('update:modelValue',e.target.value);emit('update:label',e.target.value);emit('change',e.target.value)}},['newapi:canvas-model','newapi:vision-model'].map(v=>h('option',{value:v},v)))}};`,
};
const entry = `import {createApp,h} from 'vue';import Assistant from 'assistant-test';const app=createApp(Assistant);app.component('t-button',{inheritAttrs:false,setup(_,ctx){return ()=>h('button',ctx.attrs,ctx.slots.default?.())}});app.config.warnHandler=()=>{};app.mount('#app');`;
const bundle = await build({ stdin: { contents: entry, resolveDir: frontend }, bundle: true, format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"test"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' }, plugins: [{ name: 'assistant-isolation', setup(b) {
  b.onResolve({ filter: /^assistant-test$/ }, () => ({ path: 'assistant', namespace: 'sfc' }));
  b.onLoad({ filter: /.*/, namespace: 'sfc' }, () => ({ contents: compiled.content, loader: 'ts', resolveDir: frontend }));
  b.onResolve({ filter: /.*/ }, args => {
    if (args.path === 'vue') return { path: require.resolve('vue/dist/vue.runtime.esm-bundler.js') };
    if (mocks[args.path]) return { path: args.path, namespace: 'mock' };
    if (args.path === '@/utils/videoFrames') return { path: frontend + 'src/utils/videoFrames.ts' };
    if (args.path.startsWith('@/assets/')) return { path: args.path, namespace: 'asset' };
  });
  b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: frontend }));
  b.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default "data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\"/>";', loader: 'js' }));
} }] });
const server = createServer((req,res) => {
  if (req.url === '/test.js') {res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if (req.url?.includes('catalog.json')) {res.setHeader('Content-Type','application/json');res.end('{"data":[]}');return;}
  if (req.url === '/') {res.setHeader('Content-Type','text/html');res.end('<div id="app"></div><script src="/test.js"></script>');return;}
  res.writeHead(404);res.end();
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = process.env.VIDEO_FIXTURE;
if (!fixture) throw new Error('Set VIDEO_FIXTURE to a local MP4/WebM');
const browser = await chromium.launch({channel:'chrome',headless:true});
const failures=[];
try {
  const page=await browser.newPage();
  await page.addInitScript(() => {
    window.__testBlobUrls=[];
    const create=URL.createObjectURL.bind(URL);
    URL.createObjectURL=(file)=>{const url=create(file);window.__testBlobUrls.push(url);return url};
  });
  page.on('pageerror',err=>failures.push(err.message));
  let outcome='success', release;
  const requests=[];
  await page.route('**/api/**',async route=> {
    if (!route.request().url().includes('/chat/stream')) {await route.fulfill({json:{chat_model:'canvas-model'}});return;}
    const body=route.request().postDataJSON();requests.push(body);
    if (outcome==='hold') await new Promise(resolve=>{release=resolve});
    await route.fulfill({contentType:'text/event-stream',body:outcome==='error' ? 'data: {"error":"视觉模型错误"}\n\n' : 'data: {"content":"分析完成：复刻提示词"}\n\ndata: [DONE]\n\n'}).catch(()=>{});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const canvas=page.getByRole('button',{name:'▧ 画布创作',exact:true});
  const analysis=page.getByRole('button',{name:'◉ 分析助手',exact:true});
  const editor=page.locator('textarea');
  const videoChip=page.locator('.editorSkills button').filter({hasText:/mp4|webm/});
  await canvas.waitFor();
  await editor.fill('画布的未发送草稿');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByLabel('测试模型').selectOption('newapi:canvas-model');
  await page.locator('.skillButton').click();
  await page.locator('.skillOption').filter({hasText:'影视分镜'}).click();
  await analysis.click();
  assert.equal(await editor.inputValue(),'');
  assert.equal(await videoChip.count(),0,'Plain switching must not transfer video');
  assert.equal(await page.locator('.skillCount').count(),0,'Skill selection belongs to the workspace');
  await editor.fill('分析助手的未发送草稿');
  await page.getByLabel('测试模型').selectOption('newapi:vision-model');
  await canvas.click();
  assert.equal(await editor.inputValue(),'画布的未发送草稿');
  assert.equal(await videoChip.count(),1);
  assert.equal(await page.getByLabel('测试模型').inputValue(),'newapi:canvas-model');
  assert.equal(await page.locator('.skillCount').innerText(),'1');
  assert.equal(requests.length,0,'Switching never calls a model');

  // The explicit action transfers a copy and performs real browser frame extraction.
  await page.getByRole('button',{name:'◉ 抽帧分析',exact:true}).click();
  await page.locator('.analysisHandoff').waitFor();
  assert.equal(requests.length,1);
  assert.equal(requests[0].model,'newapi:vision-model');
  assert.match(requests[0].content,/分析助手的未发送草稿/);
  assert.match(requests[0].content,/画布的未发送草稿/);
  assert.equal(requests[0].analysisVideo.frames.length,12);
  assert.equal(await videoChip.count(),0);
  await editor.fill('分析的下一轮草稿');
  await canvas.click();
  assert.equal(await editor.inputValue(),'画布的未发送草稿');
  assert.equal(await videoChip.count(),1,'Consuming analysis copy must preserve canvas video');
  // Ensure the original Blob remains valid after the analysis copy is removed.
  assert.equal(await page.evaluate(async ()=>(await fetch(window.__testBlobUrls[0])).ok),true,'Original video must remain readable after consuming the analysis copy');
  await page.waitForFunction(()=>document.querySelectorAll('.messageWrapper').length===0);
  await analysis.click();
  assert.equal(await editor.inputValue(),'分析的下一轮草稿');
  await page.locator('.messageWrapper').first().waitFor();
  assert.equal(await page.locator('.messageWrapper').count(),2);
  assert.equal(await page.locator('.analysisFrameStrip img').count(),12,'Switches preserve sampled-frame previews');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.analysisHandoff').length===2);
  assert.deepEqual(requests[1].messages.map(m=>m.role),['user','assistant'],'Follow-ups retain context');
  assert.equal(requests[1].analysisVideo,undefined);

  // Busy switches cannot mutate the session; explicit Stop makes switching available.
  outcome='hold';
  await editor.fill('等待中的请求');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.assistantModeBar button').disabled);
  assert.equal(await canvas.isDisabled(),true);
  assert.equal(await analysis.isDisabled(),true);
  assert.equal(await page.locator('.analysisHandoff').first().isDisabled(),true);
  await page.getByRole('button',{name:'停止',exact:true}).click();
  release?.();
  await page.waitForFunction(()=>!document.querySelector('.assistantModeBar button').disabled);

  outcome='error';
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('button',{name:'◉ 抽帧分析',exact:true}).click();
  await page.getByText('请求失败: 视觉模型错误',{exact:true}).waitFor();
  assert.equal(await videoChip.count(),1,'Failure leaves video available for retry');
  await canvas.click();
  await page.getByRole('button',{name:'◉ 抽帧分析',exact:true}).click();
  await page.getByText('已切到分析助手并保留原草稿，请先处理已有附件，再添加本轮视频',{exact:true}).waitFor();
  assert.equal(requests.length,4,'Existing analysis attachment must not be silently replaced or trigger a call');
  assert.equal(await videoChip.count(),1);
  await page.locator('.analysisHandoff').first().click();
  await page.waitForURL(/#\/canvas/);
  const handoff=await page.evaluate(()=>JSON.parse(localStorage.getItem('xoi_canvas_handoff_v1')));
  assert.match(handoff.prompt,/复刻提示词/);
  assert.equal(handoff.assets.length,0,'Report handoff must exclude unrelated draft/failed attachments');
  assert.equal(handoff.model,'newapi:canvas-model','Analysis vision model must not override canvas model');
  await page.evaluate(()=> {localStorage.setItem('token','test.'+btoa(JSON.stringify({id:2}))+'.signature');window.__testUserId.value=2});
  await page.waitForFunction(()=>document.querySelectorAll('.messageWrapper').length===0);
  assert.equal(await editor.inputValue(),'');
  assert.equal(await videoChip.count(),0);
  await canvas.click();
  assert.equal(await editor.inputValue(),'');
  assert.equal(await videoChip.count(),0,'Changing accounts must clear both workspace drafts');
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({passed:true,chatRequests:requests.length,checks:['independent drafts/assets/skills/models','no calls on switch','explicit frame analysis','preserved conversation and previews','busy/stop boundary','preserved existing analysis attachments','report-only canvas handoff','account isolation']}));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
