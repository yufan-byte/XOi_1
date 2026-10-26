import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {Knex} from 'knex';
import type {Identity} from './authIdentity';

/** One decoding pass, no traversal, alternate separators, ambiguous roots or directory grants. */
export function mediaPath(value:string){
  const decoded=decodeURIComponent(value);
  if(/[\\%?#\x00-\x1f\x7f]/.test(decoded)||!decoded.startsWith('/')||decoded.endsWith('/')||decoded.split('/').slice(1).some(p=>!p||p==='.'||p==='..'))throw Error('素材路径无效');
  return decoded;
}
/**
 * 项目归属缓存。
 *
 * 一个项目页几十张图 = 几十次 canReadMedia，每次都 `select userId from o_project`
 * 会把连接池打满（XOI_DB_POOL_MAX 默认 8，媒体请求和业务查询共用同一条池）。
 * 实测思路：同一项目在 60 秒内重复读的所有权结果必然一致，缓存它。
 *
 * 失效策略只用 TTL，不主动清：项目目前没有「转让」功能，删除项目后文件已不存在，
 * 多缓存 60 秒不会让对方读到任何内容。真要做转让时再调 forgetProjectOwner。
 */
const OWNER_TTL_MS = 60_000;
const OWNER_CACHE_MAX = 5000;
const ownerCache = new Map<number, { owner: number | null; at: number }>();

export function forgetProjectOwner(id: number) {
  ownerCache.delete(id);
}

async function projectOwner(db: Knex, id: number): Promise<number | null> {
  const hit = ownerCache.get(id);
  if (hit && Date.now() - hit.at < OWNER_TTL_MS) return hit.owner;
  const record = await db("o_project").where({ id }).select("userId").first();
  const owner = record?.userId == null ? null : Number(record.userId);
  if (ownerCache.size >= OWNER_CACHE_MAX) ownerCache.clear();
  ownerCache.set(id, { owner, at: Date.now() });
  return owner;
}

export async function canReadMedia(db:Knex,user:Identity|undefined,value:string){
  const pathname=mediaPath(value),p=pathname.replace(/^\/smallImage(?=\/)/,'');
  // These are shared visual presets, not project uploads. No other OSS directory is public.
  if(/^\/artStyle\/[A-Za-z0-9-]+\.(png|jpg|jpeg|webp)$/i.test(p))return true;
  if(!user?.id||user.status==='banned')return false;
  const tenant=/^\/(?:one-stop-uploads|one-stop|canvas-files)\/([1-9]\d*)\//.exec(p)||/^\/canvas\/(?:image|video|audio)\/([1-9]\d*)\//.exec(p);
  if(tenant)return Number(tenant[1])===Number(user.id)||user.role==='admin';
  // 画布图片产物按任务号反查归属（绘图账本记录了 user_id；账本未覆盖时再查媒体任务表），否则普通用户读不到自己的出图
  if(/^\/canvas\/generated\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(p)){
    const taskId=p.slice('/canvas/generated/'.length).replace(/\.[a-z]+$/i,'');
    try{
      const row=await db('xoi_draw_logs').where({task_id:taskId}).first('user_id')
        ??await db('xoi_generation_tasks').where({kind:'image',task_id:taskId}).first('user_id');
      return (!!row&&Number(row.user_id)===Number(user.id))||user.role==='admin';
    }catch{ return user.role==='admin'; }
  }
  const project=/^\/([1-9]\d*)\//.exec(p);
  if(project){
    const id=Number(project[1]);if(!Number.isSafeInteger(id))return false;
    if(user.role==='admin')return true;
    const owner=await projectOwner(db,id);
    return owner!==null&&owner===Number(user.id);
  }
  // Unattributed legacy/test files cannot be claimed by the first person to supply a URL.
  return user.role==='admin';
}
export const mediaTokenHint=(token:string)=>createHash('sha256').update(token.replace(/^(Bearer\s+)+/i,'')).digest('hex');
export function mediaGrant(secret:string,value:string,user:Identity,now=Date.now(),ttlSeconds=3600){
  const p=mediaPath(value);if(!user.id)throw Error('素材授权缺少身份');
  const ttl=Math.min(3600,Math.max(1,ttlSeconds)),head=`${user.id}.${user.session_version||0}.${Math.floor(now/1000)+ttl}`;
  const sig=createHmac('sha256',secret).update(`xoi:media:v1:${head}:${p}`).digest('base64url');
  return `${head}.${sig}`;
}
export function parseMediaGrant(secret:string,value:string,grant:string,now=Date.now()){
  if(!/^[1-9]\d{0,15}\.\d{1,10}\.\d{1,12}\.[A-Za-z0-9_-]{43}$/.test(grant))throw Error('素材授权无效');
  const [id,version,expiry,sig]=grant.split('.'),p=mediaPath(value),expires=Number(expiry);
  if(expires<=Math.floor(now/1000)||expires>Math.floor(now/1000)+3600||!Number.isSafeInteger(Number(id)))throw Error('素材授权已过期');
  const expected=createHmac('sha256',secret).update(`xoi:media:v1:${id}.${version}.${expiry}:${p}`).digest();
  const actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('素材授权无效');
  return {id:Number(id),version:Number(version)};
}
