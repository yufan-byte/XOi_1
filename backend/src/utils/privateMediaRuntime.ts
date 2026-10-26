import db from './db';
import {getGatewayRequestContext} from '../lib/gateway/context';
import {loadAuthUser} from './loadAuthUser';
import {canReadMedia,mediaGrant,mediaPath} from './privateMedia';

export async function assertCurrentMediaOwner(value:string){
  const id=getGatewayRequestContext()?.userId,user=id?await loadAuthUser(id):undefined;
  if(!await canReadMedia(db,user,mediaPath('/'+value.replace(/^\/+/,''))))throw Error('无权读取此素材，请使用当前账号的项目素材');
  return user;
}
/** A one-file, one-hour capability for URL-only upstream providers. Never expose a login JWT. */
export async function signedProviderMedia(value:string){
  const p=mediaPath(value.replace(/^\/oss(?=\/)/,'')),user=await assertCurrentMediaOwner(p);
  if(!user)throw Error('上游素材授权缺少用户身份');
  const row=await db('o_setting').where({key:'tokenKey'}).first();
  if(!row?.value)throw Error('素材签名未配置，未提交上游');
  return '/oss'+p+'?xoi_m='+mediaGrant(String(row.value),p,user);
}
