import assert from "node:assert/strict";
import http from "node:http";
import {build} from "esbuild";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright");
const built=await build({stdin:{contents:"export {safeAssistantMarkup} from './src/utils/safeAssistantMarkup';export {safeMarkdownHtml} from './src/utils/safeMarkdownHtml';export {MdPreview} from './src/utils/markdown';export {createApp,h} from 'vue';",resolveDir:process.cwd(),loader:"ts"},bundle:true,format:"esm",platform:"browser",write:false});
const server=http.createServer((req,res)=>{
  if(req.url==="/safe.js"){res.setHeader("content-type","application/javascript");res.end(built.outputFiles[0].text);return;}
  res.end(`<html><body><script type="module">import {safeAssistantMarkup,safeMarkdownHtml,MdPreview,createApp,h} from '/safe.js';window.ready=true;window.render=(mode,text)=>{document.querySelector('#result').innerHTML=(mode==='chat'?safeAssistantMarkup:safeMarkdownHtml)(text)};window.mountPreview=()=>{window.mountedApp=createApp({render:()=>h(MdPreview,{modelValue:'XSS preview <img src=x onerror="window.stolen=true">',noHighlight:true,noMermaid:true,noKatex:true,noEcharts:true})});window.mountedApp.mount('#mounted')};</script><div id="result"></div><div id="mounted"></div></body></html>`);
});await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const page=await browser.newPage();await page.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin);await page.waitForFunction(()=>window.ready);
  const payloads=['<img src=x onerror="window.stolen=true">','<svg onload="window.stolen=true"></svg>','<iframe srcdoc="<script>parent.stolen=true</script>"></iframe>','<a href="javascript:window.stolen=true">link</a>','```<img src=x onerror="window.stolen=true">```'];
  for(const mode of ['chat','markdown'])for(const text of payloads){await page.evaluate(({mode,text})=>window.render(mode,text),{mode,text});assert.equal(await page.evaluate(()=>!!window.stolen),false);assert.equal(await page.locator('#result [onerror],#result [onload],#result iframe,#result svg,#result script,#result a[href^="javascript:"]').count(),0);}
  await page.evaluate(()=>window.render('markdown','<table><tr><td>正常表格</td></tr></table><pre class="language-js"><code>hello</code></pre>'));assert.equal(await page.locator('#result table td').innerText(),'正常表格');assert.equal(await page.locator('#result pre').getAttribute('class'),'language-js');
  await page.evaluate(()=>window.mountPreview());await page.locator('#mounted').getByText('XSS preview',{exact:false}).waitFor();assert.equal(await page.locator('#mounted [onerror]').count(),0);assert.equal(await page.evaluate(()=>!!window.stolen),false);
  console.log(JSON.stringify({passed:true,maliciousPayloads:10,chatEscaped:true,markdownSanitized:true,actualMdPreviewSanitized:true,normalTablesAndCodePreserved:true,paidRequests:0}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
