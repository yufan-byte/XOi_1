// Real Vue handlers and real MONOFORM imports; only auth/model APIs and the model picker are mocked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, compileScript } from '@vue/compiler-sfc';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const frontend = fileURLToPath(new URL('../', import.meta.url));
const componentPath = join(frontend, 'src/components/director/DirectorSkillsPanel.vue');
const { descriptor } = parse(await readFile(componentPath, 'utf8'));
const compiled = compileScript(descriptor, { id: 'director-skills-test', inlineTemplate: true });
const entry = `import {createApp,h} from 'vue';import Panel from 'director-test';import {DIRECTOR_SKILLS} from '../shared/directorSkills';window.__testSkills=DIRECTOR_SKILLS;
const frame=document.querySelector('iframe');createApp({render:()=>h(Panel,{projectId:'director3d-u1-test',ownerId:'1',projectName:'测试场景',getIframe:()=>frame})}).mount('#app');`;
const mocks = {
  'vue-router': `export const useRouter=()=>({push:r=>{window.__testRoute=r;location.hash=r.path}});`,
  '@/components/modelSelect.vue': `import {h} from 'vue';export default {props:['modelValue'],emits:['update:modelValue'],setup(p,{emit}){return ()=>h('select',{'aria-label':'测试模型',onChange:e=>emit('update:modelValue',e.target.value)},[h('option',{value:'newapi:test-model'},'测试文本模型')])}};`,
};
const bundle = await build({ stdin: { contents: entry, resolveDir: frontend }, bundle: true, format: 'iife', write: false,
  define: { 'process.env.NODE_ENV': '"test"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  plugins: [{ name: 'director-isolation', setup(b) {
    b.onResolve({ filter: /^director-test$/ }, () => ({ path: 'panel', namespace: 'sfc' }));
    b.onLoad({ filter: /.*/, namespace: 'sfc' }, () => ({ contents: compiled.content, loader: 'ts', resolveDir: dirname(componentPath) }));
    b.onResolve({ filter: /.*/ }, a => {
      if (a.path === 'vue') return { path: require.resolve('vue/dist/vue.runtime.esm-bundler.js') };
      if (mocks[a.path]) return { path: a.path, namespace: 'mock' };
      if (a.path === '@/utils/directorScene') return { path: join(frontend, 'src/utils/directorScene.ts') };
    });
    b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: mocks[a.path], loader: 'js', resolveDir: frontend }));
  } }] });
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
const server = createServer(async (req, res) => {
  if (req.url === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<div id="app"></div><iframe src="/monoform/index.html?key=director3d-u1-test" style="width:1200px;height:800px"></iframe><script src="/test.js"></script>'); return; }
  const url = new URL(req.url, 'http://localhost');
  const file = resolve(frontend, 'public', '.' + url.pathname);
  if (url.pathname.startsWith('/monoform/') && file.startsWith(join(frontend, 'public/monoform/'))) {
    try { res.setHeader('Content-Type', mime[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream'); res.end(await readFile(file)); return; } catch {}
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [], requests = [];
try {
  const page = await browser.newPage();
  await page.addInitScript(() => { if (window !== window.top) return; localStorage.setItem('token', 'test-only-token'); localStorage.setItem('xo_assistant_model_value', 'newapi:test-model'); });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/auth/me')) { await route.fulfill({ json: { user: { id: 1 } } }); return; }
    if (url.endsWith('/director/skills')) { await route.fulfill({ json: { data: await page.evaluate(() => window.__testSkills) } }); return; }
    if (url.endsWith('/director/plan')) {
      const body = route.request().postDataJSON(); requests.push(body);
      const shot = { name: '推进镜头', purpose: '强调演员情绪', framing: '中景', movement: '缓慢推进', blocking: '保持原站位', performance: '凝视', lighting: '保持原灯光', transition: '硬切', prompt: '沿用场景与演员，缓慢推进到中景', camera: { keyframes: [{ t: 0, position: [0, 2, 6], target: [0, 1, 0], focalLength: 35 }, { t: 1, position: [0, 2, 4], target: [0, 1, 0], focalLength: 50 }] } };
      await route.fulfill({ json: { data: { projectId: body.scene.projectId, activeShotId: body.scene.activeShotId, plan: { summary: '推进强调情绪', assumptions: [], warnings: ['仅应用相机路径'], renderPrompt: '白模视频请作为参考上传', shots: [shot] } } } }); return;
    }
    await route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const frame = page.frameLocator('iframe');
  await frame.locator('.top-actions input[type="file"]').waitFor({ state: 'attached' });
  const nativeSave = frame.locator('.top-actions button').filter({ hasText: /保存$/ });
  await nativeSave.click();
  let initial = await page.evaluate(() => JSON.parse(localStorage.getItem('monoform-project-director3d-u1-test')));
  const actor = { id: 'actor-test', name: '测试演员', type: 'person', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#b7b0a4', pose: 'stand' };
  initial.objects = [actor]; initial.shots[0].objects = [actor];
  initial.objectKeyframes = { 'actor-test': [{ frame: 0, interpolation: 'smooth', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pose: 'stand', poseTime: 0 }, { frame: 24, interpolation: 'smooth', position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pose: 'stand', poseTime: 1 }] };
  initial.shots[0].objectKeyframes = initial.objectKeyframes;
  await frame.locator('.top-actions input[type="file"]').setInputFiles({ name: 'scene.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(initial)) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('monoform-project-director3d-u1-test') || '{}').objects?.length === 1);
  await page.getByRole('button', { name: /导演技能/ }).click();
  assert.equal(await page.locator('.skills-list button').count(), 7);
  await page.locator('textarea').fill('沿用演员与动作，设计一个情绪推进镜头');
  await page.locator('.skill-controls select').first().selectOption('1');
  await page.getByRole('button', { name: '读取场景并生成方案', exact: true }).click();
  await page.getByText('方案已生成，请检查构图与运镜后选择预演或制作', { exact: true }).waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].scene.objects[0].id, 'actor-test');
  assert.equal(requests[0].scene.reference, undefined);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('monoform-project-director3d-u1-test')));
  await page.getByRole('button', { name: '添加为预演镜头', exact: true }).click();
  await page.getByText('已添加 1 个预演镜头；原镜头、演员和动作保留，可在时间轴播放', { exact: true }).waitFor();
  const applied = await page.evaluate(() => JSON.parse(localStorage.getItem('monoform-project-director3d-u1-test')));
  assert.equal(applied.shots.length, original.shots.length + 1);
  assert.deepEqual(applied.shots[0], original.shots[0]);
  assert.deepEqual(applied.objects, original.objects);
  assert.deepEqual(applied.objectKeyframes, original.objectKeyframes);
  assert.equal(applied.keyframes.length, 2);
  assert.equal(requests.length, 1, 'Applying must not invoke any model');
  await page.getByRole('button', { name: '撤销本次添加', exact: true }).click();
  await page.getByText('已撤销本次添加，恢复原镜头与场景', { exact: true }).waitFor();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('monoform-project-director3d-u1-test')));
  assert.deepEqual(restored.shots, original.shots);
  assert.deepEqual(restored.objectKeyframes, original.objectKeyframes);
  const modified = structuredClone(restored); modified.shots[0].name = '手动修改的镜头';
  await frame.locator('.top-actions input[type="file"]').setInputFiles({ name: 'changed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(modified)) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('monoform-project-director3d-u1-test') || '{}').shots?.[0]?.name === '手动修改的镜头');
  await page.getByRole('button', { name: '添加为预演镜头', exact: true }).click();
  await page.getByText('场景或当前镜头已变化，请重新生成方案后应用，避免覆盖新修改', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('monoform-project-director3d-u1-test')).shots.length), restored.shots.length);
  await page.getByRole('button', { name: '带入画布制作 →', exact: true }).click();
  await page.waitForURL(/#\/canvas/);
  const handoff = await page.evaluate(() => ({ graph: JSON.parse(localStorage.getItem('xoi_canvas_graph_v1')), scene: sessionStorage.getItem('xoi_director_return_scene_v1'), route: window.__testRoute }));
  assert.equal(handoff.graph.nodes.filter(n => n.type === 'videoConfig').length, 1);
  assert.equal(handoff.graph.prompt, undefined, 'Transfer must not start the canvas agent');
  assert.equal(handoff.scene, 'director3d-u1-test');
  assert.equal(handoff.route.query.from, 'director3d');
  await page.evaluate(() => localStorage.setItem('token', 'another-account'));
  await page.getByRole('button', { name: '读取场景并生成方案', exact: true }).click();
  await page.getByText('账号已切换，请重新打开导演台', { exact: true }).waitFor();
  assert.equal(requests.length, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: ['real scene capture', 'original shots and actor animation preserved', 'native camera import', 'undo', 'stale scene rejection', 'explicit canvas graph without generation', 'account switch rejection'], paidModelCalls: 0 }));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
