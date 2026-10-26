// Targeted local metadata release. Does not rebuild or replace any application JS/CSS.
import {readFile,mkdir,copyFile,writeFile,rename,lstat,unlink} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import crypto from "node:crypto";
export async function publishPlatformBrand({publicDir,webDir,brand}){
  const index=path.join(webDir,"index.html");
  if((await lstat(index)).isSymbolicLink()||(await lstat(webDir)).isSymbolicLink())throw Error("品牌发布拒绝符号链接入口");
  const original=await readFile(index,"utf8");
  if(!/<head(?:\s[^>]*)?>/i.test(original)||!/<\/head>/i.test(original))throw Error("页面入口不是有效HTML，未改动入口");
  for(const kind of ["logo","favicon","touch"]){
    const relative=brand[kind]?.replace(/^\//,"");
    if(!/^brand\/xoi-(?:logo|favicon|touch)-[a-f0-9]{12}\.png$/.test(relative))throw Error("无效品牌资源路径");
    const source=path.join(publicDir,relative),bytes=await readFile(source);
    if(bytes.subarray(1,4).toString()!=="PNG"||bytes.length>150000)throw Error("品牌PNG资源无效");
    await mkdir(path.join(webDir,"brand"),{recursive:true});
    await copyFile(source,path.join(webDir,relative));
  }
  const tags=`<link rel="icon" type="image/png" sizes="64x64" href="${brand.favicon}" /><link rel="apple-touch-icon" href="${brand.touch}" />`;
  const next=original.replace(/<link\b(?=[^>]*\srel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'])[^>]*>/gi,"").replace(/<\/head>/i,tags+"</head>");
  const temp=index+"."+crypto.randomUUID()+".next";
  try{await writeFile(temp,next,{encoding:"utf8",flag:"wx"});await rename(temp,index);}finally{await unlink(temp).catch(()=>{});}
  return {metadataOnly:true,bundlesUnchanged:true};
}
async function main(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
  const brand=JSON.parse(await readFile(path.join(root,"shared/platform-brand.json"),"utf8"));
  console.log(JSON.stringify(await publishPlatformBrand({publicDir:path.join(root,"frontend/public"),webDir:path.join(root,"backend/data/web"),brand})));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error("品牌元信息发布失败，未执行服务重启；请检查资源与入口文件");process.exitCode=1;});
