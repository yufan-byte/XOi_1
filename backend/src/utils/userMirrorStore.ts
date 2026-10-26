import type {Knex} from 'knex';
import {randomInt} from 'node:crypto';

type MirrorInput={id:number;name:string;role:string;status:string;email:string|null;user_group:string};
/** Registration/login can reach this concurrently on different nodes. No find-then-insert race. */
export function upsertUserMirror(db:Knex,input:MirrorInput,now=new Date().toISOString(),candidate=()=>String(randomInt(100000,1000000))){
  if(!Number.isSafeInteger(input.id)||input.id<=0)throw Error('无效的网关用户编号');
  return db.transaction(async trx=>{
    await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',[`xoi:user-mirror:${input.id}`]);
    const existing=await trx('o_user').where({id:input.id}).first();
    if(existing){
      await trx('o_user').where({id:input.id}).update({...input,email:input.email??existing.email??null,last_login_at:now});
    }else{
      let displayId='';
      for(let attempt=0;attempt<32;attempt++){
        // Do not loop forever as the user base grows. Older six-digit display IDs stay valid.
        const value=attempt<8?candidate():String(randomInt(1000000,1000000000));
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',[`xoi:display-id:${value}`]);
        if(!await trx('o_user').where({display_id:value}).first()){displayId=value;break;}
      }
      if(!displayId)throw Error('展示编号分配繁忙，请稍后登录；账号与余额未修改');
      await trx('o_user').insert({...input,password:'__external__',session_version:0,display_id:displayId,newapi_uid:input.id,created_at:now,last_login_at:now});
    }
    return trx('o_user').where({id:input.id}).first();
  });
}
