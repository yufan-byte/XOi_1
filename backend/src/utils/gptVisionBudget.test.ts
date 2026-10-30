import test from 'node:test';
import assert from 'node:assert/strict';
import {supportsBoundedGptVision} from './gptVisionBudget';
import {boundGatewayRequest} from './billingBudgetPolicy';
const rates={model_ratio:1,completion_ratio:2,quota_type:0};
const image={type:'image_url',image_url:{url:'data:image/jpeg;base64,/9j/2Q==',detail:'low'}};
const request=(part:any=image,model='gpt-4.1-mini')=>({model,messages:[{role:'system',content:'Only return scene JSON'},{role:'user',content:[{type:'text',text:'Room layout'},part]}]});
test('known GPT inline vision reserves image tokens without billing base64 as text',()=>{
 const input=request(),result=boundGatewayRequest('/v1/chat/completions',input,rates,1);
 assert.ok(result.quota>16000);assert.deepEqual(result.body.messages,input.messages);
 assert.equal(result.body.messages[1].content[1].image_url.detail,'low');
 assert.equal(supportsBoundedGptVision('newapi:gpt-5.4'),true);
 for(const model of ['glm-5.3','gpt-image-2','gpt-4.1-mini-unverified','gpt-future'])assert.equal(supportsBoundedGptVision(model),false);
});
test('unknown model, remote image, auto detail, extra fields and excess images remain blocked',()=>{
 for(const body of [request(image,'glm-5.3'),request({...image,image_url:{...image.image_url,detail:'auto'}}),request({...image,image_url:{url:'https://example.org/x.jpg',detail:'low'}}),request({...image,video_url:'https://example.org/x.mp4'}),{model:'gpt-4.1-mini',messages:[{role:'user',content:Array(5).fill(image)}]}])assert.throws(()=>boundGatewayRequest('/v1/chat/completions',body,rates,1));
 const body={...request(),tools:[{type:'web_search'}]};assert.throws(()=>boundGatewayRequest('/v1/chat/completions',body,rates,1));
});
test('reviewed Qwen models bound images; remote vision needs a server verified capability',()=>{
 const result=boundGatewayRequest('/v1/chat/completions',request(image,'qwen3.7-flash'),rates,1);assert.ok(result.quota>20000);
 const signed=request({...image,image_url:{url:'https://studio.example.com/own.jpg',detail:'low'}},'qwen3.7-flash');
 assert.throws(()=>boundGatewayRequest('/v1/chat/completions',signed,rates,1));
 assert.doesNotThrow(()=>boundGatewayRequest('/v1/chat/completions',signed,rates,1,1,url=>url==='https://studio.example.com/own.jpg'));
 for(const model of ['qwen3.7-omni-flash','qwen3.9-flash','qwen-future','glm-5.3-flash'])assert.throws(()=>boundGatewayRequest('/v1/chat/completions',request(image,model),rates,1));
});
