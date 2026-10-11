// Native React/Ant Design UI, real video decoding and IndexedDB; no paid model requests.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const atelier=root+'atelier/';
const metadata=JSON.parse(JSON.stringify([
 ['seedance-shot-design','电影镜头设计'],['seedance-shotlist-director','导演分镜表'],['emotion-director','情绪与场面调度'],['emotion-expression-director','微表情指导'],['seedance-previz-to-render','白模预演精修'],['fpv','FPV 穿越运镜'],['seedance-seamless-stitch','镜头衔接与转场']
]));
const mocks={
 '@/stores/use-theme-store':`export const useThemeStore=selector=>selector({theme:'dark'});`,
 '@/stores/use-user-store':`import {create} from 'zustand'; export const useUserStore=create(()=>({token:'test-owner-1'}));window.__switchTestOwner=id=>{window.__testOwner=id;useUserStore.setState({token:'test-owner-'+id})};`,
 '@/xoi/owner':`export const getOwnerTag=()=>String(window.__testOwner||1); export const ownerDbName=name=>'test-canvas-'+getOwnerTag()+':'+name;`,
 '@/xoi/backend':`const entries=${JSON.stringify(metadata)}; export const backendFetch=(path,init)=>fetch(path,init); export const backendJson=async(path,init)=>{if(window.__failedSkillPath && init?.json?.path===window.__failedSkillPath)throw new Error('Skill unavailable');return ({code:200,data:path.includes('getSkillList')?['script_agent_decision.md','art_skills/style/README.md','community/installed-skill.md',...entries.flatMap(([id])=>['purchased/director/'+id+'/SKILL.md','purchased/director/'+id+'/references/helper.md'])]:'---\\nname: raw-skill-name\\n---\\nFollow this workflow.'});};`,
 '@/services/image-storage':`export const resolveImageUrl=async(key,url)=>url;export const uploadImage=async()=>({url:''});`,
 '@/stores/use-agent-skill-store':`import {create} from 'zustand';import * as service from '${atelier}src/services/api/agent-skills.ts';export const useAgentSkillStore=create((set,get)=>({systemSkills:[],userSkills:[],isLoading:false,loadSkills:async()=>{set({isLoading:true});set({systemSkills:await service.fetchSystemAgentSkills(),userSkills:await service.fetchUserAgentSkills('test'),isLoading:false})},importSkill:async file=>{const skill=await service.saveUserAgentSkill('test',{name:file.name.replace(/\\.md$/,''),content:await file.text()});set({userSkills:[skill,...get().userSkills]});return skill},updateSkill:async(id,patch)=>service.saveUserAgentSkill('test',{id,...patch}),deleteSkill:async id=>service.deleteUserAgentSkill('test',id)}));window.__skillService=service;`,
};
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {App,ConfigProvider,theme} from 'antd';import {CanvasAgentSkillPopover} from '${atelier}src/components/canvas/canvas-agent-skill-popover.tsx';import {CanvasReferenceAnalysisPopover} from '${atelier}src/components/canvas/canvas-reference-analysis-popover.tsx';function Test(){const [skills,setSkills]=useState([]);const [prompt,setPrompt]=useState('保留原来的创作草稿');return <ConfigProvider theme={{algorithm:theme.darkAlgorithm}}><App><main style={{height:'100vh',background:'#181715',color:'#f5f5f4',padding:24,display:'flex',alignItems:'flex-end'}}><div style={{width:'100%',border:'1px solid #44403c',borderRadius:16,padding:16}}><textarea aria-label="画布原输入框" value={prompt} onChange={e=>setPrompt(e.target.value)} style={{display:'block',width:'100%',background:'transparent',color:'inherit',border:0,height:80}}/><div>{skills.map(skill=><span key={skill.id} data-testid="selected-skill">{skill.name}</span>)}</div><CanvasAgentSkillPopover selectedSkills={skills} onSelect={skill=>setSkills([...skills.filter(item=>item.id!==skill.id),skill])} onDeleteSelected={id=>setSkills(skills.filter(skill=>skill.id!==id))} onInsertExample={example=>setPrompt(prompt+'\\n\\n'+example)}/><CanvasReferenceAnalysisPopover references={[]} skills={skills} model="server::vision-model" disabled={false} onInsert={report=>setPrompt(prompt+'\\n\\n'+report)}/></div></main></App></ConfigProvider>}createRoot(document.getElementById('app')).render(<Test/>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:atelier},bundle:true,jsx:'automatic',write:false,outdir:'/tmp/canvas-reference-test',format:'iife',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'canvas-isolation',setup(b){b.onResolve({filter:/.*/},args=>{if(mocks[args.path])return {path:args.path,namespace:'mock'};if(args.path.startsWith('@/'))return {path:atelier+'src/'+args.path.slice(2)+(/\.tsx?$/.test(args.path)?'': args.path.includes('/components/')?'.tsx':'.ts')};});b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'ts',resolveDir:atelier}));}}]});
const cssFile=(await readdir(root+'public/atelier-canvas/assets')).find(name=>name.endsWith('.css'));
const css=cssFile?await readFile(root+'public/atelier-canvas/assets/'+cssFile,'utf8'):'';
const server=createServer((req,res)=>{if(req.url==='/test.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles.find(file=>file.path.endsWith('.js')).text);}else{res.setHeader('Content-Type','text/html');res.end('<style>'+css+'\n'+(bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')+'</style><div id="app"></div><script src="/test.js"></script>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
let page;
try{
 page=await browser.newPage({viewport:{width:1100,height:820}});page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('BROWSER ERROR',error.stack)});page.on('console',message=>{if(message.type()==='error')console.error('CONSOLE',message.text())});
 let outcome='success',release;const requests=[];
 await page.route('**/api/aiAssistant/chat/stream',async route=>{requests.push(route.request().postDataJSON());if(outcome==='hold')await new Promise(resolve=>release=resolve);await route.fulfill({contentType:'text/event-stream',body:outcome==='error'?'data: {"error":"模型不支持视觉工具"}\n\n':'data: {"content":"镜头一：低机位推进，侧光照亮人物。"}\n\ndata: [DONE]\n\n'}).catch(()=>{});});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.getByRole('button',{name:'技能',exact:true}).click();
 await page.getByRole('button',{name:'导演与分镜',exact:true}).click();
 await page.getByRole('button',{name:/电影镜头设计.*把创意/}).waitFor();
 assert.equal(await page.locator('.canvas-skill-item').count(),7,'Show entrypoints, never supporting Markdown files');
 await page.getByRole('button',{name:/导演分镜表.*把故事/}).click();
 await page.getByRole('button',{name:'加入对话',exact:true}).click();
 assert.equal(await page.getByTestId('selected-skill').innerText(),'导演分镜表');assert.equal(requests.length,0);
 assert.equal(await page.getByRole('button',{name:'完成',exact:true}).isVisible(),true,'Selection keeps the library open for combinations');
 await page.getByRole('checkbox',{name:'选择 电影镜头设计',exact:true}).click();
 await page.getByRole('checkbox',{name:'选择 情绪与场面调度',exact:true}).click();
 await page.getByRole('checkbox',{name:'选择 微表情指导',exact:true}).click();
 await page.getByRole('checkbox',{name:'选择 FPV 穿越运镜',exact:true}).click();
 assert.equal(await page.getByTestId('selected-skill').count(),5);
 assert.equal(await page.getByRole('checkbox',{name:'选择 镜头衔接与转场',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'已选',exact:true}).click();
 assert.equal(await page.locator('.canvas-skill-item').count(),5);
 for(const name of ['电影镜头设计','情绪与场面调度','微表情指导','FPV 穿越运镜']) await page.getByRole('button',{name:'移除 '+name,exact:true}).click();
 assert.equal(await page.locator('.canvas-skill-item').count(),1);
 await page.getByRole('button',{name:'我的',exact:true}).click();
 await page.getByLabel('搜索技能',{exact:true}).fill('呼吸');
 assert.equal(await page.locator('.canvas-skill-item').count(),1,'Search spans categories and matches the task, not only skill names');
 await page.getByRole('button',{name:'全部',exact:true}).click();assert.equal(await page.locator('.canvas-skill-item').count(),13,'Internal routing documents must never appear in the canvas skill library');
 await page.getByRole('button',{name:'导演与分镜',exact:true}).click();
 await page.getByRole('button',{name:/导演分镜表.*把故事/}).click();
 await page.screenshot({path:'/tmp/xoi-restore-canvas/skill-window.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
 const box=await page.locator('.canvas-skill-library').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
 await page.screenshot({path:'/tmp/xoi-restore-canvas/skill-window-mobile.png'});
 await page.getByRole('button',{name:'填入示例需求',exact:true}).click();
 assert.match(await page.getByLabel('画布原输入框').inputValue(),/^保留原来的创作草稿\n\n把这段故事拆成/);assert.equal(requests.length,0,'An example appends to the draft and never sends');
 await page.getByRole('button',{name:'技能',exact:true}).click();await page.getByLabel('搜索技能',{exact:true}).focus();await page.keyboard.press('Escape');
 await page.waitForFunction(()=>document.querySelector('[aria-label="技能"]').getAttribute('aria-expanded')==='false');
 await page.setViewportSize({width:1100,height:820});
 await page.getByRole('button',{name:'拆解参考视频',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'填入对话',exact:true}).isDisabled(),true);
 await page.locator('input[type=file][accept="video/*"]').setInputFiles(process.env.VIDEO_FIXTURE);
 await page.getByRole('button',{name:'开始分析',exact:true}).click();
 await page.getByRole('button',{name:'填入对话',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='填入对话'&&!el.disabled));
 assert.equal(requests[0].analysisVideo.frames.length,12);assert.equal(requests[0].model,'newapi:vision-model');assert.equal(requests[0].skills[0],'purchased/director/seedance-shotlist-director/SKILL.md');
 await page.screenshot({path:'/tmp/xoi-restore-canvas/reference-window.png'});
 await page.getByRole('button',{name:'填入对话',exact:true}).click();
 assert.match(await page.getByLabel('画布原输入框').inputValue(),/^保留原来的创作草稿\n\n把这段故事拆成[\s\S]*\n\n参考视频分析/);assert.equal(requests.length,1,'Filling a report must not trigger generation');
 await page.getByRole('button',{name:'拆解参考视频',exact:true}).click();outcome='error';await page.getByRole('button',{name:'重新分析',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'模型不支持视觉工具'}).waitFor();assert.equal(await page.getByRole('button',{name:'填入对话',exact:true}).isDisabled(),true);
 outcome='hold';await page.getByRole('button',{name:'开始分析',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="视频抽帧预览"]'));
 await page.getByRole('button',{name:'停止分析',exact:true}).click();assert.equal(await page.getByRole('button',{name:'开始分析',exact:true}).isEnabled(),true);release?.();
 await page.getByRole('button',{name:'关闭参考分析',exact:true}).click();
 const partial=await page.evaluate(async()=>{window.__failedSkillPath='purchased/director/fpv/SKILL.md';const list=await window.__skillService.fetchSystemAgentSkills();delete window.__failedSkillPath;return list.map(skill=>skill.id);});assert.equal(partial.filter(id=>id.startsWith('purchased/director/')).length,6,'One unavailable skill must not discard the complete library');assert.ok(partial.includes('community/installed-skill.md'),'Installed marketplace skills remain available');assert.ok(!partial.includes('script_agent_decision.md'));
 const saved=await page.evaluate(async()=>{const s=window.__skillService;const skill=await s.saveUserAgentSkill('test',{name:'我的分镜模板',content:'保持场景和人物连续性'});return {skill,list:await s.fetchUserAgentSkills('test')};});assert.ok(saved.skill.id);assert.equal(saved.list.length,1);
 await page.evaluate(()=>window.__switchTestOwner(2));assert.equal(await page.evaluate(async()=> (await window.__skillService.fetchUserAgentSkills('test')).length),0);
 await page.evaluate(()=>window.__switchTestOwner(1));assert.equal(await page.evaluate(async()=> (await window.__skillService.fetchUserAgentSkills('test')).length),1);
 assert.deepEqual(errors,[]);console.log('PASS: curated skill entrypoints; continuous selection; five-skill limit/removal; cross-category task search; example preserves draft; Escape; mobile overlay; real 12-frame extraction; draft-preserving insertion; no automatic generation; error/stop; account-scoped skill library');
}catch(error){console.error(await page?.locator("body").innerText());await page?.screenshot({path:"/tmp/xoi-restore-canvas/canvas-test-failure.png"});throw error;}finally{await browser.close();server.close();}
