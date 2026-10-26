import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright");
const base=process.env.LOCAL_UI_URL||"http://localhost:12121";
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
  for (const path of ["/#/aiAssistant","/atelier-canvas/index.html"]) {
    const context=await browser.newContext();let calls=0,free=false;
    await context.addInitScript(()=>{localStorage.setItem('token','fixture-no-account');localStorage.setItem('userId','1');localStorage.setItem('setting',JSON.stringify({baseUrl:'/api'}));for(const owner of ['1','current'])localStorage.setItem(`xoi.platform-welcome.v1:${owner}`,'done');});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();
      if(!url.pathname.startsWith('/api/'))return route.continue();
      if(url.pathname==='/api/billing/preview')return route.fulfill({json:{data:{label:'图片生成',model:'测试模型',modelId:'fixture',free,count:1,quote:{yuan:free?0:.75},budget:{defaultPoints:free?.001:10,maxPoints:100,maxCalls:20,maxOutputTokens:4096,minutes:30}}}});
      if(url.pathname==='/api/billing/authorize'){const body=route.request().postDataJSON();if(free){assert.equal(body.freeOnly,true);assert.equal(body.points,.001);}return route.fulfill({json:{data:{id:crypto.randomUUID(),limitPoints:free?.001:10,freeOnly:free}}});}
      if(url.pathname.startsWith('/api/billing/receipt/'))return route.fulfill({json:{data:{status:'recorded',points:free?0:7.5}}});
      if(url.pathname==='/api/v1/images/generations'){calls++;assert.match(route.request().headers()['x-xoi-billing-id'],/^[0-9a-f-]{36}$/);return route.fulfill({json:{data:[]}});}
      if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:1,name:'测试',username:'fixture',quota:500000},success:true}});
      if(url.pathname==='/api/login/self')return route.fulfill({json:{data:{id:1,name:'测试',balance:1}}});
      if(url.pathname==='/api/config')return route.fulfill({json:{chat_model:'fixture',model_catalog:[],api_providers:[],chat_models:[],image_models:[],video_models:[]}});
      return route.fulfill({json:{code:200,data:[],message:'success'}});
    });
    const page=await context.newPage();await page.goto(base+path);await page.waitForFunction(()=>window.__xoiBillingGuard);
    const start=()=>page.evaluate(()=>{window.billingDone=false;void fetch('/api/v1/images/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'fixture',prompt:'test'})}).then(()=>window.billingDone=true).catch(()=>window.billingDone=true)});
    await start();await page.getByRole('dialog',{name:'模型调用费用确认'}).getByText(/7.5 积分/).waitFor();await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForFunction(()=>window.billingDone);assert.equal(calls,0);
    await start();assert.equal(await page.getByRole('spinbutton').isVisible(),false);await page.getByRole('button',{name:'确认并调用'}).click();await page.waitForFunction(()=>window.billingDone);assert.equal(calls,1);
    await page.locator('#xoi-billing-notice').getByText(/已消耗 7.5 积分/).waitFor();
    assert.equal(await page.locator('#xoi-billing-notice').evaluate(node=>node.classList.contains('is-compact')),true);
    free=true;await start();await page.waitForFunction(()=>window.billingDone);assert.equal(calls,2);assert.equal(await page.getByRole('dialog',{name:'模型调用费用确认'}).count(),0);
    await page.locator('#xoi-billing-notice').getByText(/免费模型 · 0 积分/).waitFor();
    console.log(JSON.stringify({path,passed:true,fixtureCalls:calls,freeWithoutDialog:true,paidDefaultOneClick:true,upstreamPaidRequests:0}));await context.close();
  }
} finally {await browser.close();}
