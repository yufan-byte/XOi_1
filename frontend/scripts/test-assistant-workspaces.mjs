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
  const requests=[];
  await page.route('**/api/**',async route=> {
    requests.push(route.request().url());
    await route.fulfill({json:{chat_model:'canvas-model'}});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const editor=page.locator('textarea');
  await editor.waitFor();
  assert.equal(await page.locator('.creativeWorkspace, .assistantModeBar, .analysisHandoff').count(),0);
  assert.equal(await page.locator('.bannerStage').count(),1,'Restore original creation carousel');
  assert.equal(await page.locator('.creationTabs button').count(),5);
  assert.equal(await page.locator('.mainScrollArea .creationTabs').count(),0,'Categories must not move back under the carousel');
  assert.equal(await page.locator('.creationDock .creationTabs').count(),1,'Restore user placement immediately above composer');
  assert.equal(await page.locator('.composerBillingBar').count(),1,'Keep the model and cost controls');
  assert.equal(await page.locator('.sendButtonLabel').innerText(),'进入画布');
  const dockPosition=await page.evaluate(()=>{const dock=document.querySelector('.creationDock'), composer=document.querySelector('.upstreamComposer');const a=dock.getBoundingClientRect(),b=composer.getBoundingClientRect();return {adjacent:dock.nextElementSibling===composer,gap:b.top-a.bottom,active:getComputedStyle(dock.querySelector('button.active')).backgroundImage};});
  assert.equal(dockPosition.adjacent,true);
  assert.ok(dockPosition.gap>=0 && dockPosition.gap<=20,'Categories sit beside the composer without a viewport-height gap');
  assert.match(dockPosition.active,/linear-gradient/,'Keep the user’s light selected tab style');
  await page.getByLabel('测试模型').selectOption('newapi:vision-model');
  await page.locator('.skillButton').click();
  await page.locator('.skillOption').filter({hasText:'影视分镜'}).click();
  await page.locator('.skillButton').click();
  await page.locator('input[type="file"]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64')});
  await page.locator('.editorSkills button').filter({hasText:'reference.png'}).waitFor();
  await editor.fill('设计一段产品开场');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  assert.match(await page.evaluate(()=>location.hash),/canvas\?source=xoi&handoff=1/);
  const handoff=await page.evaluate(()=>JSON.parse(localStorage.getItem('xoi_canvas_handoff_v1')));
  assert.equal(handoff.prompt,'设计一段产品开场');
  assert.equal(handoff.model,'newapi:vision-model');
  assert.equal(handoff.skills[0].path,'builtin-film');
  assert.equal(handoff.assets[0].name,'reference.png');
  assert.equal(requests.filter(url=>url.includes('/chat/stream')).length,0,'Homepage must route to the original canvas Agent');
  assert.deepEqual(failures,[]);
  console.log('PASS: restored user-designed homepage; categories beside composer; light selected tab; billing controls; original canvas handoff; no standalone analysis call');
} finally {
  await context.close();
  if (!sharedBrowser) await browser.close();
  server.close();
}
