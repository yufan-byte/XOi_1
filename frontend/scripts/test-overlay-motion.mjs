// Real TDesign, Ant Design and Radix portals: enter/leave, positioning, focus,
// rapid reopen, and reduced motion. No application API or model calls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const shared=await readFile(root+'shared/styles/overlay-motion.css','utf8');
const tdesign=await readFile(root+'node_modules/tdesign-vue-next/es/style/index.css','utf8');
const vue=`import {createApp,h,ref} from 'vue';import {Dialog,Drawer,Popup} from 'tdesign-vue-next';const dialog=ref(false),drawer=ref(false),popup=ref(false);window.openDialog=()=>dialog.value=true;window.closeDialog=()=>dialog.value=false;window.openDrawer=()=>drawer.value=true;window.closeDrawer=()=>drawer.value=false;window.openPopup=()=>popup.value=true;window.closePopup=()=>popup.value=false;createApp({setup(){return ()=>h('div',[h('button',{id:'trigger',onClick:window.openDialog},'Open'),h(Dialog,{visible:dialog.value,'onUpdate:visible':v=>dialog.value=v,header:'Project',placement:'center',onClose:window.closeDialog},{default:()=>h('input',{id:'field'})}),h(Drawer,{visible:drawer.value,'onUpdate:visible':v=>drawer.value=v,onClose:window.closeDrawer},{default:()=>h('input')}),h(Popup,{visible:popup.value,'onUpdate:visible':v=>popup.value=v,placement:'bottom',content:'Menu'},()=>h('button',{id:'anchor'},'Anchor'))])}}).mount('#root');`;
const ant=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider,Modal,Popover,Drawer} from 'antd';import {getAntThemeConfig} from '${root}atelier/src/lib/app-theme.ts';function Test(){const[d,sd]=useState(false),[p,sp]=useState(false),[r,sr]=useState(false);window.openDialog=()=>sd(true);window.closeDialog=()=>sd(false);window.openPopup=()=>sp(true);window.closePopup=()=>sp(false);window.openDrawer=()=>sr(true);window.closeDrawer=()=>sr(false);return <><button id="trigger" onClick={window.openDialog}>Open</button><Modal title="Project" centered open={d} onCancel={window.closeDialog}><input id="field"/></Modal><Popover content="Menu" placement="bottom" open={p} onOpenChange={sp}><button id="anchor">Anchor</button></Popover><Drawer open={r} onClose={window.closeDrawer}>Contents</Drawer></>};createRoot(document.getElementById('root')).render(<ConfigProvider theme={getAntThemeConfig(false)}><Test/></ConfigProvider>);`;
const radix=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import * as D from '@radix-ui/react-dialog';function Test(){const[d,sd]=useState(false);window.openDialog=()=>sd(true);window.closeDialog=()=>sd(false);return <D.Root open={d} onOpenChange={sd}><D.Trigger id="trigger">Open</D.Trigger><D.Portal><D.Overlay className="xoi-dialog-mask"/><D.Content className="xoi-dialog-surface"><D.Title>Project</D.Title><D.Description>Dialog</D.Description><input id="field"/><D.Close>Close</D.Close></D.Content></D.Portal></D.Root>};createRoot(document.getElementById('root')).render(<Test/>);`;
const bundles={};
for(const [name,code,resolveDir]of [['vue',vue,root],['ant',ant,root+'atelier'],['radix',radix,root+'console']]){
 const out=await build({stdin:{contents:code,loader:'tsx',resolveDir},bundle:true,loader:{'.css':'empty'},jsx:'automatic',write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});bundles[name]=out.outputFiles[0].text;
}
const server=createServer((req,res)=>{const name=req.url.split('/')[1];if(req.url.endsWith('.js')){res.setHeader('content-type','text/javascript');res.end(bundles[name])}else{res.end(`<style>${shared}\n${name==='vue'?tdesign:''}\nbody{margin:0}#root{padding:80px} .xoi-dialog-mask{position:fixed;inset:0;background:#0003}.xoi-dialog-surface{position:fixed;left:50%;top:50%;translate:-50% -50%;width:400px;background:white;padding:24px}</style><div id="root"></div><script src="/${name}/test.js"></script>`)}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
try{
 for(const name of ['vue','ant','radix']){
  const page=await browser.newPage({viewport:{width:1200,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',()=>{throw Error('No API calls allowed')});
  await page.goto(`http://127.0.0.1:${server.address().port}/${name}/`);await page.locator('#trigger').waitFor();
  const surface=name==='vue'?'.t-dialog':name==='ant'?'.ant-modal':'.xoi-dialog-surface';
  const enter=await page.evaluate(async selector=>{window.openDialog();await new Promise(r=>setTimeout(r,75));const el=document.querySelector(selector),s=getComputedStyle(el),a=el.getAnimations()[0];return {name:s.animationName,duration:s.animationDuration,frames:a?.effect.getKeyframes().map(f=>f.transform),rect:{left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}}},surface);
  assert.equal(enter.name,'xoi-dialog-in',name+' dialog opening');assert.equal(enter.duration,'0.24s');assert.ok(enter.rect.left>0&&enter.rect.right<1200,name+' remains centered');assert.ok(enter.frames[0].includes('0.98'),'Gentle scale replaces point expansion');
  await page.locator('#field').fill('Draft retained');
  const leave=await page.evaluate(async selector=>{window.closeDialog();await new Promise(r=>setTimeout(r,75));const el=document.querySelector(selector);return el?{name:getComputedStyle(el).animationName,duration:getComputedStyle(el).animationDuration}:null},surface);
  assert.equal(leave?.name,'xoi-dialog-out',name+' closing stays mounted');assert.equal(leave.duration,'0.16s');
  await page.locator(surface).waitFor({state:'hidden'});
  await page.locator('#trigger').click();await page.locator('#field').waitFor();await page.waitForTimeout(330);await page.keyboard.press('Escape');await page.locator(surface).waitFor({state:'hidden'});
  if(name==='radix')assert.equal(await page.evaluate(()=>document.activeElement.id),'trigger','Focus returns to the trigger');
  await page.evaluate(()=>window.openDialog());await page.waitForTimeout(100);await page.evaluate(()=>window.closeDialog());await page.waitForTimeout(40);await page.evaluate(()=>window.openDialog());await page.waitForTimeout(350);assert.equal(await page.locator(surface).isVisible(),true,name+' interrupted leave reopens cleanly');await page.evaluate(()=>window.closeDialog());await page.locator(surface).waitFor({state:'hidden'});
  if(name!=='radix'){
   const pop=name==='vue'?'.t-popup':'.ant-popover';
   const popEnter=await page.evaluate(async ({pop,name})=>{window.openPopup();await new Promise(r=>setTimeout(r,75));const el=document.querySelector(pop);return getComputedStyle(name==='vue'?el.querySelector('.t-popup__content'):el).animationName},{pop,name});assert.equal(popEnter,'xoi-popup-in',name+' popup uses the shared entrance');await page.locator(pop).waitFor();await page.waitForTimeout(200);const anchor=await page.locator('#anchor').boundingBox(),box=await page.locator(pop).boundingBox();assert.ok(box.y>=anchor.y+anchor.height-2,'Popup retains its anchor position');
   await page.evaluate(()=>window.closePopup());await page.locator(pop).waitFor({state:'hidden'});
   await page.evaluate(()=>window.openDrawer());const drawer=name==='vue'?'.t-drawer__content-wrapper':'.ant-drawer-content-wrapper';await page.locator(drawer).waitFor();assert.equal(await page.locator(drawer).evaluate(el=>getComputedStyle(el).transitionDuration.includes('0.28s')),true);await page.evaluate(()=>window.closeDrawer());await page.waitForTimeout(350);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await page.evaluate(async selector=>{window.openDialog();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return getComputedStyle(document.querySelector(selector)).getPropertyValue('--xoi-motion-dialog').trim()},surface);assert.equal(reduced,'1ms');await page.waitForTimeout(330);await page.evaluate(()=>window.closeDialog());await page.locator(surface).waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);await page.close();console.log('PASS: '+name+' real portal enter/leave, positioning, Escape, quick reopen, reduced motion'+(name==='radix'?', focus restoration':''));
 }
}finally{await browser.close();server.close()}
