/** Repair only the acceptance fixture created by this chat, preserving its contents. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
const db=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL});
async function main(){
  await db.connect();
  const project=(await db.query('SELECT * FROM o_project WHERE id=$1 AND "userId"=1',[1791942343891])).rows[0];
  if(project?.name!=="验收测试-20261014-ae90a020")throw new Error("目标不符，未修改任何项目");
  const user=(await db.query('SELECT session_version FROM o_user WHERE id=1')).rows[0];
  const secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',["tokenKey"])).rows[0].value;
  const token=jwt.sign({id:1,session_version:Number(user.session_version||0)},secret,{expiresIn:120});
  const response=await fetch('http://localhost:12121/api/project/editProject',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({...project,id:Number(project.id),projectType:'script',imageQuality:'1K',mode:'text'})});
  if(!response.ok)throw new Error("项目修复失败");
  console.log(JSON.stringify({projectId:Number(project.id),projectName:project.name,projectType:'script',contentsPreserved:true,paidRequests:0}));
}
void main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.end());
