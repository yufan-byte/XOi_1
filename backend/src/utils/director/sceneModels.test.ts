import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneModels,sceneMediaOrigin,allowedSceneImageUrl} from './sceneModels';
import {mediaGrant} from '../privateMedia';
const origin='https://studio.example.com',secret='test-only-secret';
const path='/canvas-files/1/'+ 'a'.repeat(32)+'.jpg';
const signed=(user=1)=>origin+'/oss'+path+'?xoi_m='+mediaGrant(secret,path,{id:user,role:'user',status:'active'} as any);
test('scene models preserve upstream names and preflight URL-only Chinese lines',()=>{
 const model=(modelName:string,patch:any={})=>({modelName,name:'上游原名 '+modelName,type:'text',selectable:true,capabilities:['vision'],...patch}) as any;
 const input=[model('gpt-5.5'),model('qwen3.7-flash'),model('gpt-5.4-nano'),model('glm-5.3-flash'),model('qwen3.7-plus',{selectable:false}),model('qwen3.6-plus',{capabilities:[]})];
 const list=sceneModels(input,null);assert.equal(list[0].modelName,'gpt-5.4-nano');assert.equal(list.length,3);assert.equal(list.find(m=>m.modelName==='qwen3.7-flash')?.disabled,true);assert.equal(list.find(m=>m.modelName==='gpt-5.5')?.name,'上游原名 gpt-5.5');
 assert.equal(sceneModels(input,origin).find(m=>m.modelName==='qwen3.7-flash')?.disabled,false);
 for(const base of ['http://studio.example.com','https://127.0.0.1','https://localhost','https://192.168.1.1'])assert.equal(sceneMediaOrigin(base),null);
});
test('remote vision budget only accepts signed own files from the configured origin',()=>{
 const value=signed();assert.equal(allowedSceneImageUrl(value,1,secret,origin),true);
 for(const candidate of [value.replace('studio.example.com','evil.example.com'),value+'&x=1',value+'#x',value.replace('/1/','/2/'),value.replace(/.$/,'X'),signed(2)])assert.equal(allowedSceneImageUrl(candidate,1,secret,origin),false);
 assert.equal(allowedSceneImageUrl(value,2,secret,origin),false);assert.equal(allowedSceneImageUrl(value,1,'wrong',origin),false);
});
