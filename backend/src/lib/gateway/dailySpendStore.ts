import type {Knex} from 'knex';
import {withSecuritySchemaLock} from '@/utils/securitySchema';
import {QUOTA_PER_YUAN} from '@/utils/creditUnits';
import {dailySpendWindow,shouldWarnDaily} from '@/utils/dailySpendPolicy';
/** Injected connection: tests never import the application's runtime DB or model clients. */
export class DailySpendStore {
 private ready?:Promise<unknown>;
 constructor(private db:Knex,private clock=Date.now){}
 private ensure(){return this.ready ||= withSecuritySchemaLock(this.db,async trx=>{
  await trx.raw('CREATE TABLE IF NOT EXISTS xoi_billing_preferences(user_id bigint PRIMARY KEY,daily_warning_cents bigint NOT NULL DEFAULT 2000 CHECK(daily_warning_cents>=0),updated_at bigint NOT NULL)');
  await trx.raw('CREATE TABLE IF NOT EXISTS xoi_daily_spend_notices(user_id bigint NOT NULL,day date NOT NULL,threshold_cents bigint NOT NULL,created_at bigint NOT NULL,PRIMARY KEY(user_id,day,threshold_cents))');
 }).catch(e=>{this.ready=undefined;throw e;});}
 async status(userId:number){
  await this.ensure();const window=dailySpendWindow(this.clock());
  const pref=(await this.db.raw('SELECT daily_warning_cents FROM xoi_billing_preferences WHERE user_id=?',[userId])).rows[0];
  const cents=Number(pref?.daily_warning_cents??2000);
  const sum=(await this.db.raw('SELECT COALESCE(SUM(GREATEST(quota,0)),0) amount FROM logs WHERE user_id=? AND type=2 AND created_at>=? AND created_at<?',[userId,window.start,window.end])).rows[0];
  const yuan=Number(sum.amount)/QUOTA_PER_YUAN;
  return {day:window.day,timezone:'Asia/Shanghai',dailyWarningYuan:cents/100,todayYuan:yuan,todayPoints:yuan*10,shouldRemind:shouldWarnDaily(yuan,cents/100),blocking:false};
 }
 async save(userId:number,yuan:number){
  if(!Number.isSafeInteger(userId)||userId<1||!Number.isFinite(yuan)||yuan<0||yuan>100000)throw Error('提醒参数无效');
  await this.ensure();await this.db.raw('INSERT INTO xoi_billing_preferences(user_id,daily_warning_cents,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET daily_warning_cents=excluded.daily_warning_cents,updated_at=excluded.updated_at',[userId,Math.round(yuan*100),this.clock()]);return this.status(userId);
 }
 async claim(userId:number){
  const status=await this.status(userId);if(!status.shouldRemind)return {...status,claimed:false};
  const inserted=await this.db.raw('INSERT INTO xoi_daily_spend_notices(user_id,day,threshold_cents,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING RETURNING day',[userId,status.day,Math.round(status.dailyWarningYuan*100),this.clock()]);return {...status,claimed:inserted.rows.length===1};
 }
}
