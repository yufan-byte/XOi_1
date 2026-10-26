import assert from 'node:assert/strict';
import { build } from '../atelier/node_modules/esbuild/lib/main.js';
const root = new URL('..', import.meta.url).pathname;
async function moduleAt(entry, plugin) {
  const built = await build({ entryPoints: [entry], absWorkingDir: root, bundle: true, format: 'esm', platform: 'node', write: false, plugins: plugin ? [plugin] : [] });
  return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
}
const { canvasAgentSkillKeys, buildCanvasAgentSkillPrompt, canvasAgentForbidsMediaGeneration } = await moduleAt('atelier/upstream/src/app/(user)/canvas/agent/canvas-agent-skills.ts');
const context = { project: { id: 'current', title: 'test', nodeCount: 0, connectionCount: 0 }, nodes: [], connections: [], selectedNodeIds: [], generation: {}, tasks: [], agentState: { approvedNodeIds: [], referenceNodeIds: [], pendingTaskIds: [], completedTaskIds: [], brief: '过去的宣传片、视频、音频、分镜图'.repeat(100), approvedPlan: '过去的广告视频制作'.repeat(100) } };
assert.deepEqual(canvasAgentSkillKeys('video', '你好', context), []);
assert.deepEqual(canvasAgentSkillKeys('intake', '今天星期几？', context), []);
assert.deepEqual(canvasAgentSkillKeys('intake', '为品牌制作30秒宣传片', context), ['workflow', 'script']);
assert.deepEqual(canvasAgentSkillKeys('video', '继续', context), ['video', 'workflow']);
assert.deepEqual(canvasAgentSkillKeys('references', '继续', context), ['image']);
assert.deepEqual(canvasAgentSkillKeys('intake', '整理这个画布', context), ['organize']);
assert.ok(canvasAgentForbidsMediaGeneration('只写视频提示词'));
assert.ok(canvasAgentForbidsMediaGeneration('不要生成图片，只创建方案节点'));
assert.equal(canvasAgentForbidsMediaGeneration('生成两个15秒视频'), false);
for (const phase of ['intake','concept','script','breakdown','references','storyboard','video','audio','review','complete']) {
  assert.ok(canvasAgentSkillKeys(phase, '继续制作宣传片、分镜图、视频和旁白', context).length <= 2);
}
const short = buildCanvasAgentSkillPrompt('intake', '你好', { ...context, agentState: { ...context.agentState, brief: "", approvedPlan: "" } });
assert.ok(Buffer.byteLength(short) < 7000, Buffer.byteLength(short));
const custom = buildCanvasAgentSkillPrompt('intake', '拍广告', { ...context, agentState: { ...context.agentState, brief: "", approvedPlan: "" } }, 'CUSTOM_SKILL');
assert.ok(custom.includes('CUSTOM_SKILL'));
assert.ok(!custom.includes('【品牌短片与完整制作】'));
const { brandPrompts } = await moduleAt('atelier/src/constant/prompt-library.ts', { name: 'asset-path', setup(b) { b.onResolve({ filter: /^@\/lib\/asset-url$/ }, () => ({ path: 'asset', namespace: 'asset' })); b.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export const assetUrl = x => x;' })); } });
assert.equal(brandPrompts.length, 6);
assert.equal(new Set(brandPrompts.map(p => p.id)).size, 6);
assert.equal(brandPrompts.filter(p => p.media === 'video').length, 2);
assert.ok(brandPrompts.every(p => p.prompt['zh-CN'].length >= 60 && p.prompt['en-US'].length >= 60));
const { safeConnectorLink } = await moduleAt('atelier/src/xoi/connector-links.ts');
assert.equal(safeConnectorLink('javascript:alert(1)'), '');
assert.equal(safeConnectorLink('https://user:token@example.com/package.zip'), '');
assert.equal(safeConnectorLink('https://example.com/package.zip?token=secret'), '');
assert.equal(safeConnectorLink('//evil.invalid/package.zip'), '');
assert.equal(safeConnectorLink('/downloads/xoi-canvas-agent/1.0/package.zip'), '/downloads/xoi-canvas-agent/1.0/package.zip');
assert.equal(safeConnectorLink('https://example.com/releases/1.0.zip'), 'https://example.com/releases/1.0.zip');
console.log(`PASS: phase routing, no historical keyword injection, six complete templates and safe release links; greeting system prompt ${Buffer.byteLength(short)} bytes`);
