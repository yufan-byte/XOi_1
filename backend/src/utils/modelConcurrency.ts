import crypto from "node:crypto";
import type {Knex} from "knex";
import {withSecuritySchemaLock} from "./securitySchema";
import {setTimeout as wait} from 'node:timers/promises';

export class ModelCapacityError extends Error {
  code="MODEL_CAPACITY";
  constructor(){super("模型服务繁忙，本次尚未提交上游、未产生模型费用，请稍后重试");}
}
export function capacityValue(name:string,fallback:number,max:number){
  const n=Number(process.env[name]||fallback);
  if(!Number.isSafeInteger(n)||n<1||n>max)throw new Error(`${name} 必须为 1–${max} 的整数`);
  return n;
}

/**
 * 上游调用的并发闸门。
 *
 * 三个与「多账户同时生图生视频」直接相关的取舍：
 *
 * 1. **租约必须带心跳**。原来 leaseMs=6 分钟且没有续期，进程被 kill / 重启发版时
 *    残留租约会占满全部额度，接下来 6 分钟所有生成请求都排队到超时，用户看到
 *    一片「模型服务繁忙」。现在基础租约 90 秒 + 每 30 秒续期：长任务靠心跳保活，
 *    进程挂了 90 秒内自动回收。
 *
 * 2. **排队者不进锁**。原来每次 acquire 无论有没有空位都要抢
 *    `pg_advisory_xact_lock` 做一次全表 count，几十个请求排队时就是每秒上百次
 *    锁争用。现在先做一次无锁的只读 count，满了直接失败、不进事务；
 *    只有「可能成功」的请求才去抢锁复核。锁只被真正要落位的请求持有。
 *
 * 3. **退避指数化**。原来固定 600–1200ms 轮询，90 秒内一个请求能抢 100+ 次锁。
 */
export class ModelConcurrency {
  private ready?:Promise<void>;
  private readonly leaseMs:number;
  constructor(private db:Knex,private globalLimit:number,private userLimit:number,leaseMs?:number){
    const fromEnv=Number(process.env.XOI_MODEL_LEASE_MS||0);
    const chosen=leaseMs??(Number.isSafeInteger(fromEnv)&&fromEnv>=15_000&&fromEnv<=600_000?fromEnv:90_000);
    this.leaseMs=chosen;
  }
  ensure(){return this.ready ||= withSecuritySchemaLock(this.db,async trx=>{
    await trx.raw(`CREATE TABLE IF NOT EXISTS xoi_model_leases(id uuid PRIMARY KEY,user_id bigint NOT NULL,expires_at bigint NOT NULL)`);
    await trx.raw("CREATE INDEX IF NOT EXISTS xoi_model_lease_owner ON xoi_model_leases(user_id,expires_at)");
  }).catch(e=>{this.ready=undefined;throw e;});}

  /** 无锁只读判断：只数还没过期的租约。等价于事务里「先删过期再 count」。 */
  private async hasRoom(userId:number,now:number){
    const r=await this.db.raw(
      "SELECT count(*) AS total,count(*) FILTER(WHERE user_id=?) AS owned FROM xoi_model_leases WHERE expires_at > ?",
      [userId,now]);
    return Number(r.rows[0].total)<this.globalLimit&&Number(r.rows[0].owned)<this.userLimit;
  }

  async acquire(userId:number,now=Date.now()){
    if(!Number.isSafeInteger(userId)||userId<1)throw new ModelCapacityError();
    await this.ensure();
    // 快速路径：没位置就不进事务，避免排队请求反复抢 advisory lock
    if(!(await this.hasRoom(userId,now)))throw new ModelCapacityError();

    const id=crypto.randomUUID();
    await this.db.transaction(async trx=>{
      await trx.raw("select pg_advisory_xact_lock(hashtext('xoi:model-capacity'))");
      await trx("xoi_model_leases").where("expires_at","<=",now).delete();
      const count=await trx.raw("SELECT count(*) AS total,count(*) FILTER(WHERE user_id=?) AS owned FROM xoi_model_leases",[userId]);
      if(Number(count.rows[0].total)>=this.globalLimit||Number(count.rows[0].owned)>=this.userLimit)throw new ModelCapacityError();
      await trx("xoi_model_leases").insert({id,user_id:userId,expires_at:now+this.leaseMs}).returning("id");
    });

    // 心跳续期：任务跑超过 leaseMs 时不能让租约自然过期，否则并发限制会失效
    const heartbeat=setInterval(()=>{
      void this.db("xoi_model_leases").where("id",id)
        .update({expires_at:Date.now()+this.leaseMs})
        .catch(()=>{/* 续期失败就让租约自然过期，不中断任务本身 */});
    },Math.max(10_000,Math.floor(this.leaseMs/3)));
    heartbeat.unref();

    let released=false;
    return async()=>{
      if(released)return;
      released=true;
      clearInterval(heartbeat);
      await this.db("xoi_model_leases").where("id",id).delete().catch(()=>{});
    };
  }

  /** 运维/控制台看的实时水位 */
  async stats(){
    await this.ensure();
    const r=await this.db.raw(
      "SELECT count(*) FILTER(WHERE expires_at > ?) AS active,count(*) AS rows FROM xoi_model_leases",[Date.now()]);
    return {
      active:Number(r.rows[0]?.active??0),
      globalLimit:this.globalLimit,
      userLimit:this.userLimit,
      leaseMs:this.leaseMs,
    };
  }
}

/** 并发满了先排队等（批量任务里同时发多路是常态），超时才按繁忙失败。
 *  原来是直接抛 ModelCapacityError，表现就是「勾了 5 个只出 1 个，其余报模型服务繁忙」。
 *  退避改成指数 + 抖动：90 秒窗口内最多抢约 30 次，而不是 100+ 次。 */
export async function acquireWithWait(capacity: ModelConcurrency, userId: number, opts: { signal?: AbortSignal; maxWaitMs?: number } = {}) {
  const deadline = Date.now() + Math.max(0, opts.maxWaitMs ?? 90_000);
  let attempt = 0;
  for (;;) {
    opts.signal?.throwIfAborted();
    try {
      const release=await capacity.acquire(userId);
      if(opts.signal?.aborted){await release();opts.signal.throwIfAborted();}
      return release;
    }
    catch (error) {
      if (!(error instanceof ModelCapacityError)) throw error;
      if (opts.signal?.aborted) throw error;
      if (Date.now() >= deadline) throw error;
      attempt++;
      const base = Math.min(4_000, 400 * 2 ** Math.min(attempt, 4));
      await wait(Math.floor(base * (0.7 + Math.random() * 0.6)), undefined, { signal: opts.signal });
    }
  }
}

/** SSE counts as running until its body completes, not merely until response headers arrive. */
export function releaseWhenResponseEnds(response:Response,release:()=>Promise<void>){
  if(!response.body){void release().catch(()=>{});return response;}
  const reader=response.body.getReader();
  const body=new ReadableStream<Uint8Array>({async pull(controller){try{const r=await reader.read();if(r.done){await release().catch(()=>{});controller.close();}else controller.enqueue(r.value);}catch(e){controller.error(e);await release().catch(()=>{});}},async cancel(reason){try{await reader.cancel(reason);}finally{await release().catch(()=>{});}}});
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}
