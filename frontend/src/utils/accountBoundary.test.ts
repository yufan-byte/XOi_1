import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountBoundary} from './accountBoundary';

test('late A success or 401 cannot update B state or clear B credentials',()=>{
  let token='A',state='B',cleared=false;
  const boundary=new AccountBoundary(()=>token),owner=boundary.capture();
  token='B';
  assert.throws(()=>{boundary.assert(owner);state='A';},e=>(e as Error).name==='AbortError');
  assert.throws(()=>{boundary.assert(owner);cleared=true;},e=>(e as Error).name==='AbortError');
  assert.equal(state,'B');assert.equal(cleared,false);
});
test('A→B→A still invalidates old chats, draft callbacks and confirmations',()=>{
  let token='A',closed=0;
  const boundary=new AccountBoundary(()=>token),owner=boundary.capture();
  const detach=boundary.subscribe(()=>closed++);
  token='B';boundary.capture();token='A';boundary.capture();
  assert.equal(boundary.current(owner),false);assert.equal(closed,2);
  assert.equal(boundary.current(boundary.capture()),true);
  detach();token='C';boundary.capture();assert.equal(closed,2);
});
test('same-account requests do not clear stores on every response',()=>{
  const boundary=new AccountBoundary(()=> 'same'),owner=boundary.capture();
  boundary.subscribe(()=>assert.fail('must not reset a stable session'));
  for(let i=0;i<1000;i++)boundary.assert(owner);
});
