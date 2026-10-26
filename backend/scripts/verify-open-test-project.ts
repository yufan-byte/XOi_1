import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
import {billableOperation} from "../../shared/billableOperations";
async function main(){
  const db=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL});await db.connect();
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);let browser:any;
  try{
    const user=(await db.query('SELECT session_version FROM o_user WHERE id=1')).rows[0];
    const secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',['tokenKey'])).rows[0].value;
    const token=jwt.sign({id:1,session_version:Number(user.session_version||0)},secret,{expiresIn:600});
    browser=await chromium.launch({channel:'chrome',headless:true});
    let blocked=0;
    for(const direct of [false,true]){
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      await context.addInitScript((token:string)=>{localStorage.setItem('token','Bearer '+token);localStorage.setItem('userId','1');localStorage.setItem('setting',JSON.stringify({baseUrl:'/api'}));for(const owner of ['1','current'])localStorage.setItem(`xoi.platform-welcome.v1:${owner}`,'done');},token);
      await context.route('**/*',(route:any)=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin!=='http://localhost:12121')return route.abort();
        if(billableOperation(url.pathname,request.method())){blocked++;return route.abort();}
        return route.continue();
      });
      const page=await context.newPage();page.setDefaultTimeout(25000);
      if(direct)await page.goto('http://localhost:12121/#/script?projectId=1791942343891');
      else{await page.goto('http://localhost:12121/#/project');await page.getByText('验收测试-20261014-ae90a020',{exact:true}).click();}
      await page.waitForURL('**/#/script?projectId=1791942343891');
      await page.getByText('验收测试-20261014-ae90a020-第1集',{exact:true}).first().waitFor();
      assert.equal(await page.getByText('404',{exact:true}).count(),0);
      await page.screenshot({path:`/tmp/xoi-project-open-${direct?'fresh':'card'}.png`});
      console.log(JSON.stringify({projectOpen:true,freshBrowser:direct,url:page.url()}));await context.close();
    }
    assert.equal(blocked,0);
  }finally{await browser?.close();await db.end();}
}
void main().catch(error=>{console.error(error.message);process.exitCode=1});
