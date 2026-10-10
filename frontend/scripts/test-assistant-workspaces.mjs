// Isolated browser test of the real assistant SFC. UI wrappers/stores/router are mocked;
// Vue, the component's handlers and browser video decoding are real. No paid APIs run.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse, compileScript, compileStyleAsync } from '@vue/compiler-sfc';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const frontend = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(process.env.ASSISTANT_SFC || new URL('../src/views/aiAssistant/index.vue', import.meta.url), 'utf8');
// watch is supplied by the app's auto-import plugin in production.
const { descriptor } = parse(source.replace('<script setup lang="ts">', '<script setup lang="ts">\nimport { watch } from "vue";'));
const style = await compileStyleAsync({source: descriptor.styles[0].content, filename:frontend+'src/views/aiAssistant/index.vue', id:'assistant-workspace-test', preprocessLang:'scss'});
if (style.errors.length) throw new Error(String(style.errors));
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
const entry = `import {createApp,h} from 'vue';import Assistant from 'assistant-test';const app=createApp(Assistant);app.component('t-button',{inheritAttrs:false,setup(_,ctx){return ()=>h('button',ctx.attrs,ctx.slots.default?.())}});app.component('router-link',{props:['to'],setup(p,ctx){return ()=>h('a',{href:'#'+p.to},ctx.slots.default?.())}});app.config.warnHandler=()=>{};app.mount('#app');`;
const bundle = await build({ stdin: { contents: entry, resolveDir: frontend }, bundle: true, format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"test"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' }, plugins: [{ name: 'assistant-isolation', setup(b) {
  b.onResolve({ filter: /^assistant-test$/ }, () => ({ path: 'assistant', namespace: 'sfc' }));
  b.onLoad({ filter: /.*/, namespace: 'sfc' }, () => ({ contents: compiled.content, loader: 'ts', resolveDir: frontend }));
  b.onResolve({ filter: /.*/ }, args => {
    if (args.path === 'vue') return { path: require.resolve('vue/dist/vue.runtime.esm-bundler.js') };
    if (mocks[args.path]) return { path: args.path, namespace: 'mock' };
    if (args.path === '@/utils/referenceImages') return { path: frontend + 'src/utils/referenceImages.ts' };
    if (args.path === '@/utils/videoFrames') return { path: frontend + 'src/utils/videoFrames.ts' };
    if (args.path.startsWith('@/assets/')) return { path: args.path, namespace: 'asset' };
  });
  b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: frontend }));
  b.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default "data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\"/>";', loader: 'js' }));
} }] });
const server = createServer((req,res) => {
  if (req.url === '/test.js') {res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if (req.url?.includes('catalog.json')) {res.setHeader('Content-Type','application/json');res.end('{"data":[]}');return;}
  if (req.url === '/') {res.setHeader('Content-Type','text/html');res.end('<style>body{margin:0;font-family:system-ui,sans-serif;}#app{height:100vh;}.modelSlot select{width:100%;border:0;background:transparent;font-size:12px;}'+style.code+'</style><div id="app"></div><script src="/test.js"></script>');return;}
  res.writeHead(404);res.end();
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = process.env.VIDEO_FIXTURE;
if (!fixture) throw new Error('Set VIDEO_FIXTURE to a local MP4/WebM');
const sharedBrowser = Boolean(process.env.BROWSER_CDP_URL);
const browser = sharedBrowser ? await chromium.connectOverCDP(process.env.BROWSER_CDP_URL) : await chromium.launch({headless:true,args:['--disable-gpu']});
const context = await browser.newContext();
const failures=[];
try {
  const page=await context.newPage();
  page.setDefaultTimeout(60000);
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
  const editor=page.locator('textarea');
  const send=page.getByRole('button',{name:'发送',exact:true});
  const videoChip=page.locator('.editorSkills button').filter({hasText:/mp4|webm/});
  await editor.waitFor();
  assert.equal(await page.getByRole('button',{name:/画布创作|分析助手/}).count(),0,'One composer, no mode switch');
  await page.getByLabel('测试模型').selectOption('newapi:vision-model');
  await page.locator('.skillButton').click();
  await page.locator('.skillOption').filter({hasText:'影视分镜'}).click();
  assert.equal(requests.length,0,'Choosing skills and models must not invoke a model');
  if(process.env.SCREENSHOT_DIR) {
    await page.setViewportSize({width:1440,height:900});
    await page.screenshot({path:process.env.SCREENSHOT_DIR+'/desktop.png'});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:process.env.SCREENSHOT_DIR+'/mobile.png'});
    await page.setViewportSize({width:1440,height:900});
  }
  // A reference-only request runs real browser video extraction automatically.
  await page.locator('input[type="file"]').setInputFiles(fixture);
  assert.equal(await send.isEnabled(),true);
  await send.click();
  await page.locator('.analysisHandoff').waitFor();
  assert.equal(requests.length,1);
  assert.equal(requests[0].model,'newapi:vision-model');
  assert.equal(requests[0].skills[0],'builtin-film');
  assert.equal(requests[0].analysisVideo.frames.length,12);
  assert.equal(await videoChip.count(),0);
  await page.locator('.videoAnalysisPreview summary').click();
  assert.equal(await page.locator('.analysisFrameStrip img').count(),12);
  await editor.fill('节奏再快一点');
  await send.click();
  await page.waitForFunction(()=>document.querySelectorAll('.analysisHandoff').length===2);
  assert.deepEqual(requests[1].messages.map(m=>m.role),['user','assistant']);
  assert.equal(requests[1].analysisVideo,undefined);

  // Returning to the page resumes the active conversation and its selected skill.
  await page.waitForTimeout(450);
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('.messageWrapper').length===4);
  assert.equal(await page.locator('.skillCount').innerText(),'1');
  await editor.fill('设计一段开场');
  await page.locator('input[type="file"]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64')});
  await send.click();
  await page.waitForFunction(()=>document.querySelectorAll('.analysisHandoff').length===3);
  assert.equal(requests[2].messages.length,4);
  assert.equal(requests[2].analysisImages.length,1);
  assert.match(requests[2].analysisImages[0].dataUrl,/^data:image\/jpeg;base64,/);

  outcome='hold';
  await editor.fill('等待中的请求');
  await send.click();
  await page.waitForFunction(()=>document.querySelector('.stopButton'));
  assert.equal(await page.getByLabel('新建对话').isDisabled(),true);
  assert.equal(await page.locator('.analysisHandoff').first().isDisabled(),true);
  await page.getByRole('button',{name:'停止',exact:true}).click();
  release?.();
  await send.waitFor();

  outcome='error';
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await send.click();
  await page.getByText('请求失败: 视觉模型错误',{exact:true}).waitFor();
  assert.equal(await videoChip.count(),1,'A failed reference stays available for retry');
  await editor.fill('不要让这条未发送草稿混入交接');
  await page.locator('.analysisHandoff').first().click();
  await page.waitForURL(/#\/canvas/);
  const handoff=await page.evaluate(()=>JSON.parse(localStorage.getItem('xoi_canvas_handoff_v1')));
  assert.match(handoff.prompt,/复刻提示词/);
  assert.doesNotMatch(handoff.prompt,/未发送草稿/);
  assert.equal(handoff.assets.length,0);
  assert.equal(handoff.model,'newapi:vision-model','One chosen model is carried into the plan handoff');
  assert.match(page.url(),/source=xoi&handoff=1/);
  await page.evaluate(()=> {localStorage.setItem('token','test.'+btoa(JSON.stringify({id:2}))+'.signature');window.__testUserId.value=2});
  await page.waitForFunction(()=>document.querySelectorAll('.messageWrapper').length===0);
  assert.equal(await editor.inputValue(),'');
  assert.equal(await videoChip.count(),0);
  // An in-flight response from a previous account must not enter the new account's conversation.
  outcome='hold';
  await editor.fill('上一账号的进行中回复');
  await send.click();
  await page.waitForFunction(()=>document.querySelector('.stopButton'));
  await page.waitForTimeout(100);
  await page.evaluate(()=>{localStorage.setItem('token','test.'+btoa(JSON.stringify({id:3}))+'.signature');window.__testUserId.value=3});
  release?.();
  await page.waitForFunction(()=>document.querySelectorAll('.messageWrapper').length===0);
  assert.equal(await send.count(),1);
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({passed:true,chatRequests:requests.length,checks:['single composer','automatic video extraction','reference-only send','real image rasterization','same conversation follow-up','active conversation resume','busy/stop','failed attachment retry','explicit plan handoff','account isolation']}));
} finally { await context.close(); if (!sharedBrowser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
