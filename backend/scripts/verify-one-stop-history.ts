// Isolated PostgreSQL schema only. No upstream calls and no customer-table writes.
import pg from 'pg';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {OneStopDocuments} from '../src/lib/oneStop/documents';
import {OneStopHistory} from '../src/lib/oneStop/history';
async function main(){
const url=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;if(!url)throw Error('数据库连接未配置');
const local=new URL(url);if(!['postgres:','postgresql:'].includes(local.protocol)||!['127.0.0.1','localhost','[::1]'].includes(local.hostname)||[...local.searchParams.keys()].some(k=>!['sslmode','application_name'].includes(k)))throw Error('隔离验证只允许本机 PostgreSQL，不能传入连接覆盖参数');
const schema='xoi_test_history_'+crypto.randomBytes(8).toString('hex');
const admin=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:5000}),pool=new pg.Pool({connectionString:url,max:4,connectionTimeoutMillis:5000,options:`-c search_path=${schema}`});
const fixture=(name:string)=>({id:'fixture',kind:'premium',name,idea:'测试，不调用模型',ratio:'16:9',episodeCount:1,assets:[],models:{chat:'fixture'},log:[],done:{outline:true},stage:'outline',outline:{title:name,episodes:[{title:'测试集',synopsis:'测试梗概'}]}});
let created=false;
try{
 await admin.query(`CREATE SCHEMA "${schema}"`);created=true;
 const documents=new OneStopDocuments(pool);await documents.initialize();
 await pool.query(`CREATE TABLE xoi_one_stop_generation_history(user_id bigint NOT NULL,project_id varchar(160) NOT NULL,revision integer NOT NULL,task_id varchar(160) NOT NULL,operation varchar(32) NOT NULL,before_payload jsonb NOT NULL,created_at bigint NOT NULL,PRIMARY KEY(user_id,project_id,revision))`);
 await pool.query('CREATE TABLE xoi_one_stop_admissions(user_id bigint NOT NULL,project_id varchar(160) NOT NULL,lease_token uuid NOT NULL,expires_at bigint NOT NULL,PRIMARY KEY(user_id,project_id))');
 await pool.query('CREATE TABLE xoi_generation_tasks(user_id bigint,kind text,status text,payload text,task_id text)');
 await documents.save(1,'comic','fixture',0,'新内容',fixture('新内容'));await documents.save(2,'comic','fixture',0,'其他用户',fixture('其他用户'));
 await documents.save(1,'comic','fixture',1,'新内容',fixture('新内容'));
 await pool.query('INSERT INTO xoi_one_stop_generation_history VALUES($1,$2,$3,$4,$5,$6,$7)',[1,'fixture',1,'fixture-task','outline',JSON.stringify({stage:'outline',value:fixture('旧内容').outline}),Date.now()]);
 const history=new OneStopHistory(pool);assert.equal((await history.list(1,'fixture')).items.length,1);
 await assert.rejects(history.get(2,'fixture',1),e=>(e as any).status===404);
 const clientId=crypto.randomUUID();await history.restore(1,'fixture',1,2,clientId);
 let row=await documents.get(1,'comic','fixture');assert.equal(row.revision,3);assert.equal((row.payload.outline as any).title,'旧内容');
 const backup=await history.get(1,'fixture',2);assert.equal((backup.value as any).title,'新内容');
 await history.restore(1,'fixture',1,2,clientId);assert.equal((await documents.get(1,'comic','fixture')).revision,3);
 const race=await Promise.allSettled([history.restore(1,'fixture',1,3,crypto.randomUUID()),history.restore(1,'fixture',1,3,crypto.randomUUID())]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 row=await documents.get(1,'comic','fixture');assert.equal(row.revision,4);
 await pool.query('INSERT INTO xoi_generation_tasks VALUES($1,$2,$3,$4,$5)',[1,'one-stop','unknown',JSON.stringify({projectId:'fixture'}),'unknown-task']);
 await assert.rejects(history.restore(1,'fixture',2,4,crypto.randomUUID()),e=>(e as any).status===409);assert.equal((await documents.get(1,'comic','fixture')).revision,4);
 await pool.query('DELETE FROM xoi_generation_tasks');
 await assert.rejects(history.restore(1,'fixture',999,4,crypto.randomUUID()),e=>(e as any).status===404);
 assert.equal(Number((await pool.query('SELECT count(*) FROM xoi_one_stop_admissions')).rows[0].count),0);
 await history.restore(1,'fixture',2,4,crypto.randomUUID());assert.equal(((await documents.get(1,'comic','fixture')).payload.outline as any).title,'新内容');
 assert.equal(((await documents.get(2,'comic','fixture')).payload.outline as any).title,'其他用户');
 console.log(JSON.stringify({passed:true,isolatedSchema:true,customerWrites:0,modelCalls:0,checks:['owner-isolation','cas-conflict','concurrent-restore-single-winner','active-unknown-task-fence','rollback-cleans-admission','idempotent-repeat','backup-undo']}));
}finally{await pool.end();if(created&&/^xoi_test_history_[a-f0-9]{16}$/.test(schema))await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'隔离验证失败');process.exitCode=1;});
