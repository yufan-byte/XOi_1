import type {Knex} from "knex";
import {canReadMedia,mediaPath} from "../../utils/privateMedia";
import {workspaceError} from "./documents";
/** Resolve target and source independently; caller-supplied asset/project IDs never grant ownership. */
export async function saveCanvasAssetResult(input: {
  db: Knex; userId: number; assetId: number; projectId: number; filePath: string;
  /** 保存为历史候选图，需用户在项目中手动采用。 */
  candidateOnly?: boolean;
  read: (path: string) => Promise<Buffer>;
  archive: (projectId: number, bytes: Buffer) => Promise<string>;
}) {
  const {db,userId,assetId,projectId}=input;
  if (![userId,assetId,projectId].every(id=>Number.isSafeInteger(id)&&id>0) || typeof input.filePath!=="string") throw workspaceError("资产、项目或素材参数无效");
  const asset=await db("o_assets as a").join("o_project as p","p.id","a.projectId")
    .where({"a.id":assetId,"a.projectId":projectId,"p.userId":userId}).select("a.id","a.type","a.imageId").first();
  if(!asset)throw workspaceError("资产不存在或不属于当前项目",404);
  let source: string;
  try { source=mediaPath(input.filePath.replace(/^\/oss(?=\/)/,"")); }
  catch { throw workspaceError("素材路径无效"); }
  const sourceProject=/^\/([1-9]\d*)\//.exec(source);
  if(sourceProject&&Number(sourceProject[1])!==projectId)throw workspaceError("素材不属于当前项目",403);
  if(!/\.(png|jpe?g|webp|gif)$/i.test(source)||!await canReadMedia(db,{id:userId,role:"user"},source))throw workspaceError("无权使用该图片",403);
  const bytes=await input.read(source);
  if(!bytes.length||bytes.length>10*1024*1024)throw workspaceError("图片为空或超过 10MB",413);
  const filePath=await input.archive(projectId,bytes);
  return db.transaction(async trx=>{
    const current=await trx("o_assets").where({id:assetId,projectId}).forUpdate().first("id","imageId");
    const project=await trx("o_project").where({id:projectId,userId}).first("id");
    if(!current||!project)throw workspaceError("目标资产已变化，未覆盖原图",409);
    if(!input.candidateOnly && Number(current.imageId||0)!==Number(asset.imageId||0))throw workspaceError("资产图片已在其他页面更新，请核对后再保存",409);
    const [row]=await trx("o_image").insert({filePath,state:"已完成",assetsId:assetId,type:asset.type}).returning("id");
    const imageId=Number(typeof row==="object"?row.id:row);
    if(!Number.isSafeInteger(imageId)||imageId<1)throw workspaceError("图片保存未确认",503);
    if(!input.candidateOnly) await trx("o_assets").where({id:assetId,projectId}).update({imageId});
    return {imageId,filePath,candidateOnly:!!input.candidateOnly};
  });
}
