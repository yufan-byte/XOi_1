import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from '../atelier/node_modules/esbuild/lib/main.js';
const base=path.resolve(new URL('../atelier/upstream/src',import.meta.url).pathname);
const stubs=`export const mimoTextModels=[]; export const isGeminiConfig=()=>false; export const channelProtocolForConfig=()=> 'openai'; export const localChannelForActiveModel=()=>undefined; export const aiApiUrl=()=> 'https://fixture.invalid/chat/completions'; export const aiHeaders=()=>({}); export const refreshRemoteUser=()=>{}; export const imageToDataUrl=()=>{}; export const dataUrlToGeminiInlineData=()=>{}; export const geminiActionUrl=()=>{}; export const geminiDirectHeaders=()=>{}; export const geminiErrorMessage=()=>{}; export const isGlmTtsModel=()=>false; export const isGrok2APITtsConfig=()=>false; export const isGeminiTtsModel=()=>false; export const supportsVideoAudioGeneration=()=>false;`;
const result=await build({entryPoints:[base+'/app/(user)/canvas/agent/canvas-agent-runtime.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'no-network-fixture',setup(b){b.onResolve({filter:/^@\//},args=>{
 if(args.path==='@/services/api/canvas-agent'||args.path==='@/app/(user)/canvas/agent/canvas-agent-memory')return {path:path.join(base,args.path.slice(2)+'.ts')};
 return {path:'fixture',namespace:'fixture'};
});b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stubs,loader:'js'}));}}]});
const {runCanvasAgent,createCanvasAgentState}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
let calls=0;
globalThis.fetch=async (_url,init)=>{
 calls++; const body=JSON.parse(init.body);
 assert.ok(Buffer.byteLength(init.body)<48_000);
 assert.ok(body.messages[0].content.includes('当前画布'));
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"actions":[],"reply":"ready"}'}}]}));
};
const state=createCanvasAgentState();
const ctx={project:{id:'one',title:'test',nodeCount:0,connectionCount:0},agentState:state,selectedNodeIds:[],nodes:[],connections:[],generation:{textModel:'deepseek'},tasks:[]};
const input={config:{model:'deepseek',textModel:'deepseek',systemPrompts:{text:''},systemPrompt:''},initialState:state,protocolMessages:[],references:[],getContext:()=>ctx,executeAction:()=>{throw Error('No actions allowed in test')}};
for(const userText of ['你好','根据素材规划30秒宣传片，包含分镜图和视频','生成两个15秒视频']) {
 const response=await runCanvasAgent({...input,userText}); assert.equal(response.reply,'ready');
}
assert.equal(calls,3,'Built-in manuals must not block even an empty canvas');
await assert.rejects(runCanvasAgent({...input,userText:'完整长稿'.repeat(20000)}),/调用前停止/);
assert.equal(calls,3,'Oversized current input must stop before making a paid request');
// Populated canvases and a long conversation must fit after at most one summary.
let project;
if(process.env.XOI_CANVAS_QA_PROJECT){const {readFile}=await import('node:fs/promises');project=JSON.parse(await readFile(process.env.XOI_CANVAS_QA_PROJECT,'utf8')).value;}
const session=project?.chatSessions[0];
const richState=session?.agentState||{...state,phase:'video',brief:'两段15秒，复用已成功分镜图，不重复提交任务。',approvedPlan:'保留现有成果'};
const richContext={...ctx,agentState:richState,generation:{textModel:'deepseek-v4.1-flash',imageModel:'doubao-seedream',videoModel:'seedance2.0',videoSeconds:'15',videoQuality:'480'},nodes:(project?.nodes||Array.from({length:7},(_,i)=>({id:'node-'+i,type:i<2?'text':'image',title:'已有制作节点',metadata:{content:'已确定的分镜正文'.repeat(200),prompt:'复用现有分镜图'.repeat(100),status:'success'}}))).map(n=>({id:n.id,type:n.type,title:n.title,text:n.type==='text'?n.metadata.content:undefined,prompt:n.metadata.prompt,status:n.metadata.status,hasMedia:!!n.metadata.content})),selectedNodeIds:[]};
const history=session?.protocolMessages||Array.from({length:20},()=>[{role:'user',content:'保留既定型号、两段15秒和480p，继续完成。'.repeat(100)},{role:'assistant',content:'已记录用户要求，保留现有成果。'}]).flat();
for(const userText of ['只读验收：读取画布和模型配置，不要生成任何媒体。','只制作一个15秒480p视频，复用成功的图片，不要重做图片。']){
 let summaryCalls=0,turnCalls=0;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(init.body);
  assert.equal(body.model,'deepseek-v4.1-flash');
  assert.ok(Buffer.byteLength(init.body)<48_000);
  const summary=body.messages[0].content.includes('生成画布长期对话检查点');
  if(summary)summaryCalls++;else turnCalls++;
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:summary?'保留已有分镜图、两段15秒、480p、禁止重复收费。'.repeat(40):'{"actions":[],"reply":"ready"}'}}]}));
 };
 const response=await runCanvasAgent({...input,config:{...input.config,model:'gpt-image-2',textModel:'deepseek-v4.1-flash',systemPrompts:{text:'通用长期说明'.repeat(500)}},initialState:richState,protocolMessages:history,contextCheckpoint:session?.contextCheckpoint||'已有工程的型号、数量和预算约束。',getContext:()=>richContext,userText}).catch(error=>{throw new Error(userText+': '+error.message)});
 assert.equal(response.reply,'ready');assert.equal(turnCalls,1);assert.ok(summaryCalls<=1,'Never buy summaries repeatedly because a static manual is too large');
}
let blockedExecutions=0;
globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"actions":[{"tool":"create_text_node","arguments":{"title":"unwanted","content":"must not write"}}],"reply":""}'}}]}));
await assert.rejects(runCanvasAgent({...input,userText:'只读检查，不创建任何节点',executeAction:()=>{blockedExecutions++;return {ok:true}}}),/本轮未开放的工具/);
assert.equal(blockedExecutions,0,'Historical or hallucinated actions cannot bypass this request’s read-only tool scope');
console.log('PASS: empty and populated DeepSeek canvases fit; text model used consistently; long history bounded; latest request retained; oversized input and out-of-scope writes stop before execution');
