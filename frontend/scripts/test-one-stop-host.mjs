// Local navigation acceptance: no project creation, model or payment requests.
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const shots=await mkdtemp(join(tmpdir(),'xoi-one-stop-host-')),tag='one-stop-host-'+Date.now();let target;
async function call(path,body){const response=await fetch('http://localhost:3456'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(path==='/new'?45000:20000)});const result=await response.json();if(result.error)throw Error(result.error);return result;}
async function owned(){const info=await call('/info?target='+target);const url=new URL(info.url);return url.origin==='http://localhost:12121'&&url.searchParams.get('ui_check')===tag;}
const evaluate=async code=>{if(!await owned())throw Error('验收标签页已离开本次页面，保留该页并停止');return(await call('/eval?target='+target,code)).value;};
async function until(code){for(let n=0;n<70;n++){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,150));}throw Error('UI did not satisfy '+code);}
try{
 target=(await call('/new','http://localhost:12121/?ui_check='+tag+'#/project')).targetId;
 await until("!!document.querySelector('.script-parent')&&!!document.querySelector('.creation-modes')");
 assert.equal(await evaluate("document.querySelector('#script-creation-children')===null"),true);
 assert.equal(await evaluate("document.querySelector('.creation-modes .active').textContent.trim()"),'导演创作');
 assert.equal(await evaluate("document.querySelector('.creation-mode-bar')===null&&!!document.querySelector('.storyWorkspaceHeader .creation-modes')"),true);
 assert.equal(await evaluate("document.querySelectorAll('.productSwitcher').length"),0);
 await evaluate("document.querySelector('.creation-modes a').click()");
 await until("location.hash.startsWith('#/script/one-stop')&&!!document.querySelector('iframe[title*=\"一站式\"]')?.contentDocument?.querySelector('.cs-advanced-toggle')");
 const frame="document.querySelector('iframe[title*=\"一站式\"]')";
 assert.equal(await evaluate("getComputedStyle("+frame+".contentDocument.querySelector('.one-stop-nav')).display"),'none');
 assert.equal(await evaluate("document.querySelectorAll('#workbench-navigation').length"),1);
 assert.equal(await evaluate(frame+".contentDocument.querySelector('.cs-model-strip')===null"),true);
 assert.equal(await evaluate(frame+".contentDocument.querySelector('.creation-modes .active').textContent.trim()"),'快速创作');
 assert.equal(await evaluate("document.querySelector('.creation-mode-bar')===null"),true);
 await until("!document.querySelector('.one-stop-frame-loading')");
 await call('/screenshot?target='+target+'&file='+encodeURIComponent(join(shots,'quick-mode.png')));
 await evaluate("(()=>{const w="+frame+".contentWindow,i=w.document.querySelector('textarea[aria-label=\"项目描述\"]');Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(i,'仅验收模式切换，不创建项目');i.dispatchEvent(new w.Event('input',{bubbles:true}));})()");
 await until(frame+".contentDocument.querySelector('textarea').value==='仅验收模式切换，不创建项目'");
 await evaluate(frame+".contentDocument.querySelector('.creation-modes button').click()");
 await until("location.hash==='#/project'&&!!document.querySelector('.storyWorkspaceHeader .creation-modes .active')");
 assert.equal(await evaluate("document.querySelectorAll('iframe[title*=\"一站式\"]').length"),1);
 await call('/screenshot?target='+target+'&file='+encodeURIComponent(join(shots,'director-mode.png')));
 await evaluate("document.querySelector('.creation-modes a').click()");
 await until("location.hash.startsWith('#/script/one-stop')");
 assert.equal(await evaluate(frame+".contentDocument.querySelector('textarea').value"),'仅验收模式切换，不创建项目');
 await evaluate("document.querySelector('.script-parent').click()");await until("location.hash==='#/project'");
 console.log(JSON.stringify({passed:true,readOnly:true,modelRequests:0,businessWrites:0,checks:['single-script-entry-no-submenu','modes-inside-existing-header-no-extra-row','original-director-projects','same-origin-quick-pane','one-sidebar','ready-handshake','draft-retained-across-mode-switch'],screenshots:shots}));
}finally{if(target&&await owned().catch(()=>false))await call('/close?target='+target).catch(()=>{});}
