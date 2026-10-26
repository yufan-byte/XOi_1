import assert from 'node:assert/strict';
import { build } from '../atelier/node_modules/esbuild/lib/main.js';
const stub = `export const mimoTextModels=[]; export const isGeminiConfig=()=>false; export const channelProtocolForConfig=()=> 'openai'; export const localChannelForActiveModel=()=>undefined; export const aiApiUrl=()=> 'https://fixture.invalid/chat/completions'; export const aiHeaders=()=>({}); export const refreshRemoteUser=()=>{}; export const calibrateCanvasAgentTokenEstimate=()=>{}; export const imageToDataUrl=()=>{}; export const dataUrlToGeminiInlineData=()=>{}; export const geminiActionUrl=()=>{}; export const geminiDirectHeaders=()=>{}; export const geminiErrorMessage=()=>{};`;
const compiled=await build({entryPoints:['atelier/upstream/src/services/api/canvas-agent.ts'],absWorkingDir:new URL('..',import.meta.url).pathname,bundle:true,format:'esm',platform:'node',write:false,plugins:[{name:'isolated-dependencies',setup(b){b.onResolve({filter:/^@\//},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js'}));}}]});
const {requestCanvasAgentTurn}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const config={model:'deepseek-v4.1-flash',systemPrompts:{text:''},systemPrompt:''};
const input={config,systemPrompt:'Operate the canvas',messages:[{role:'user',content:'Create one node'}],tools:[],toolMode:'native'};
let calls=[];
globalThis.fetch=async(_url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'',reasoning_content:'thinking'}}],usage:{completion_tokens:2048}}));};
await assert.rejects(requestCanvasAgentTurn(input),/未自动重复调用/);
assert.equal(calls.length,1,'A potentially billed successful response must never be silently retried');
assert.deepEqual(calls[0].thinking,{type:'disabled'});
assert.equal(calls[0].reasoning_effort,'none','Zaowu V4.1 explicitly disables its default high reasoning');
assert.equal(calls[0].stream,true);
assert.deepEqual(calls[0].stream_options,{include_usage:true});
assert.equal(calls[0].max_tokens,2048);
globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:null,tool_calls:[{id:'one',function:{name:'create_text_node',arguments:'{"content":"a storyboard"}'}}]}}]}));
const result=await requestCanvasAgentTurn(input);
assert.equal(result.toolCalls.length,1,'A valid native tool call remains usable when content is empty');
assert.equal(result.toolCalls[0].arguments.content,'a storyboard');
const dsml='<｜｜DSML｜｜ calls><｜｜DSML｜｜ invoke name="generate_video"><｜｜DSML｜｜ parameter name="prompt" string="true">a &lt; b</｜｜DSML｜｜ parameter><｜｜DSML｜｜ parameter name="seconds" string="false">15</｜｜DSML｜｜ parameter></｜｜DSML｜｜ invoke></｜｜DSML｜｜ calls>';
globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:dsml}}]}));
const dsmlResult=await requestCanvasAgentTurn({...input,tools:[{type:'function',function:{name:'generate_video',parameters:{type:'object',properties:{}}}}]});
assert.equal(dsmlResult.content,'');
assert.equal(dsmlResult.toolCalls[0].name,'generate_video');
assert.deepEqual(dsmlResult.toolCalls[0].arguments,{prompt:'a < b',seconds:15});
await assert.rejects(requestCanvasAgentTurn(input),/未允许/);
globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:dsml.slice(0,-24)}}]}));
await assert.rejects(requestCanvasAgentTurn(input),/不完整/);
globalThis.fetch=async()=>new Response([
  'data: '+JSON.stringify({choices:[],usage:{prompt_tokens:100}}),
  'data: '+JSON.stringify({choices:[{index:0,delta:{tool_calls:[{index:0,id:'stream-call',function:{name:'create_text_node',arguments:'{"content":'}}]}}]}),
  'data: '+JSON.stringify({choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:'"from stream"}'}}]},finish_reason:'tool_calls'}]}),
  'data: [DONE]'
].join('\n\n'),{headers:{'content-type':'text/event-stream'}});
const streamed=await requestCanvasAgentTurn(input);
assert.equal(streamed.toolCalls[0].arguments.content,'from stream');
// Event-prefixed SSE and usage-only tails must retain the actual choice.
globalThis.fetch=async()=>new Response('\uFEFFevent: message\r\ndata: '+JSON.stringify({choices:[{index:0,delta:{content:'正常'},finish_reason:'stop'}]})+'\r\n\r\nevent: usage\r\ndata: '+JSON.stringify({choices:[],usage:{prompt_tokens:300,completion_tokens:1}})+'\r\n\r\ndata: [DONE]\r\n\r\n');
assert.equal((await requestCanvasAgentTurn(input)).content,'正常');
// A disconnected stream can contain valid arguments but must never execute them.
globalThis.fetch=async()=>new Response('data: '+JSON.stringify({choices:[{delta:{tool_calls:[{index:0,function:{name:'create_text_node',arguments:'{}'}}]}}]})+'\n\n');
await assert.rejects(requestCanvasAgentTurn(input),/流式响应不完整/);
for(const payload of [{choices:[],usage:{prompt_tokens:14000,completion_tokens:0}},{choices:[{message:{content:'',reasoning_content:'hidden thinking'},finish_reason:'stop'}]}]){
 let count=0;
 globalThis.fetch=async()=>{count++;return new Response(JSON.stringify(payload));};
 await assert.rejects(requestCanvasAgentTurn(input),e=>e.code==='empty_model_output'&&/未自动重试/.test(e.message));
 assert.equal(count,1,'Empty HTTP 200 must not trigger context compaction and another billed call');
}
globalThis.fetch=async()=>new Response('event: error\ndata: '+JSON.stringify({error:{message:'upstream stream failed',code:'upstream_error'}})+'\n\n');
await assert.rejects(requestCanvasAgentTurn(input),/upstream stream failed/);
globalThis.fetch=async()=>new Response(JSON.stringify({message:'网关暂不可用'}),{status:502});
await assert.rejects(requestCanvasAgentTurn(input),/网关暂不可用/);
// Headers alone are not completion: the existing deadline must abort a stalled body.
const realSetTimeout=globalThis.setTimeout;
globalThis.setTimeout=(fn,ms,...args)=>realSetTimeout(fn,ms===150000?10:ms,...args);
globalThis.fetch=async(_url,init)=>new Response(new ReadableStream({start(c){init.signal.addEventListener('abort',()=>c.error(new DOMException('aborted','AbortError')),{once:true});}}));
try {await assert.rejects(requestCanvasAgentTurn(input),/150 秒内未完成响应/);} finally {globalThis.setTimeout=realSetTimeout;}
const toolsCompiled=await build({entryPoints:['atelier/upstream/src/app/(user)/canvas/agent/canvas-agent-tools.ts'],absWorkingDir:new URL('..',import.meta.url).pathname,bundle:true,format:'esm',platform:'node',write:false});
const {normalizeCanvasAgentAction}=await import('data:text/javascript;base64,'+Buffer.from(toolsCompiled.outputFiles[0].text).toString('base64'));
assert.deepEqual(
  normalizeCanvasAgentAction('generate_video',{prompt:'scene',sourceNodeIds:['image-1'],videoSeconds:15,videoSize:'992x432',videoGenerateAudio:false}).arguments,
  {prompt:'scene',sourceNodeIds:['image-1'],size:'992x432',seconds:15,generateAudio:false},
  'Video generation accepts config-style aliases returned by the model',
);
assert.equal(normalizeCanvasAgentAction('generate_video',{prompt:'scene',sourceNodeIds:[],duration:15}).arguments.seconds,15);
assert.throws(()=>normalizeCanvasAgentAction('generate_video',{prompt:'scene',sourceNodeIds:[],seconds:15,duration:5}),/时长参数互相冲突/);
let jsonBody;
globalThis.fetch=async(_url,init)=>{jsonBody=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"actions":[],"reply":"ready"}'}}]}));};
await requestCanvasAgentTurn({...input,toolMode:'structured-json',tools:[{type:'function',function:{name:'create_text_node',parameters:{type:'object',properties:{}}}}],messages:[{role:'assistant',toolCalls:[{id:'old',name:'create_text_node',arguments:{content:'kept'}}]},{role:'tool',toolCallId:'old',content:'{"ok":true,"nodeId":"saved"}'},{role:'user',content:'continue'}]});
assert.equal(jsonBody.tools,undefined);
assert.ok(jsonBody.messages.every(m=>m.role!=='tool'&&!m.tool_calls),'JSON fallback must convert native tool history too');
assert.match(jsonBody.messages[2].content,/saved/);
console.log('PASS: explicit DeepSeek thinking off; stable output reserve; no billed empty-output retries; native tools preserved');
