import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeWorkflowLayout} from '../../../frontend/atelier/src/xoi/graph-layout';
test('legacy workflow configuration expands without overlapping neighbours or losing grouping and media',()=>{
 const input=[{id:'text',type:'text',position:{x:0,y:0},width:320,height:150,metadata:{content:'完整原文',groupId:'group'}},{id:'config',type:'config',position:{x:400,y:0},width:200,height:120,metadata:{generationMode:'image',model:'保留模型',groupId:'group'}},{id:'image',type:'image',position:{x:700,y:0},width:320,height:200,metadata:{content:'/original.png',groupId:'group'}},{id:'config2',type:'config',position:{x:400,y:210},width:200,height:120,metadata:{generationMode:'video'}},{id:'group',type:'group',position:{x:-24,y:-48},width:1070,height:300,metadata:{}}];
 const raw=JSON.stringify(input),next=normalizeWorkflowLayout(input),get=(id:string)=>next.find(n=>n.id===id)!;
 assert.equal(JSON.stringify(input),raw);assert.equal(next.length,input.length);assert.deepEqual(get('config').metadata,input[1].metadata);assert.deepEqual(get('image').metadata,input[2].metadata);
 assert.equal(get('config').width,560);assert.equal(get('config').height,360);assert.ok(get('image').position.x>=get('config').position.x+560+48);assert.ok(get('config2').position.y>=get('config').position.y+360+56);
 assert.ok(get('group').position.x+get('group').width>=get('image').position.x+get('image').width);assert.deepEqual(normalizeWorkflowLayout(next),next);
});
