import type {RequestHandler} from 'express';
import type {Knex} from 'knex';
import type {Identity} from '../utils/authIdentity';
import {resolveIdentity} from '../utils/authIdentity';
import {canReadMedia,mediaPath,parseMediaGrant,mediaTokenHint} from '../utils/privateMedia';
import fs from 'node:fs/promises';
import path from 'node:path';

function cookie(header:string,name:string){
  const value=header.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1);
  return value?decodeURIComponent(value):'';
}
/** JWT cookies authorize media GET/HEAD only. API writes never accept cookie authentication. */
export function privateMedia(db:Knex,root:string,secret:()=>Promise<string>,loadUser:(id:number)=>Promise<Identity|undefined>):RequestHandler{
  return async(req,res,next)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');
    if(!['GET','HEAD'].includes(req.method))return res.status(405).end();
    try{
      const p=mediaPath(req.path),shared=/^\/artStyle\/[A-Za-z0-9-]+\.(png|jpg|jpeg|webp)$/i.test(p);
      let user:Identity|undefined;
      if(!shared){
        const key=await secret();
        if(!key)throw Error('素材授权未就绪');
        if(typeof req.query.xoi_m==='string'){
          const grant=parseMediaGrant(key,p,req.query.xoi_m);user=await loadUser(grant.id);
          if(!user||user.status==='banned'||Number(user.session_version||0)!==grant.version)throw Error('素材授权已失效');
        }else{
          const header=req.headers.authorization,hint=cookie(req.headers.cookie||'','xoi_media_owner');
          const match=/^([1-9]\d{0,15}):([a-f0-9]{64})$/.exec(hint);
          // Separate cookie names prevent a late A bootstrap response overwriting B's cookie.
          const session=match?cookie(req.headers.cookie||'',`xoi_media_session_${match[1]}`):'';
          if(!header&&(!session||mediaTokenHint(session)!==match?.[2]))throw Error('请先登录');
          user=await resolveIdentity(header||session,key,loadUser);
        }
      }
      if(!await canReadMedia(db,user,p))return res.status(403).end();
      // Static servers otherwise follow symlinks, including a link into another tenant's folder.
      const realRoot=await fs.realpath(root),expected=path.resolve(realRoot,'.'+p),actual=await fs.realpath(expected);
      if(actual!==expected||!actual.startsWith(realRoot+path.sep))return res.status(403).end();
      return next();
    }catch(error){
      if((error as NodeJS.ErrnoException).code==='ENOENT')return res.status(404).end();
      return res.status(403).end();
    }
  };
}
