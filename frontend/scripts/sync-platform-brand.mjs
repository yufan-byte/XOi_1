// Mechanical build assets only: resize the existing mark; never redraw or alter the source.
import {readFile,mkdir,writeFile,stat} from "node:fs/promises";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import path from "node:path";
import crypto from "node:crypto";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const config=JSON.parse(await readFile(path.join(root,"shared/platform-brand.json"),"utf8"));
const source=await readFile(path.join(root,"frontend/src/assets/XOI_logo.png"));
if(crypto.createHash("sha256").update(source).digest("hex")!==config.sourceSha256)throw Error("平台Logo源文件已变化，请更新品牌清单并重新生成图标，不能混用旧资源");
const destinations=["frontend/public","frontend/console/public"];
const outputs=Object.fromEntries(["logo","favicon","touch"].map(kind=>{
  const relative=config[kind].replace(/^\//,"");
  if(!new RegExp(`^brand/xoi-${kind}-${config.sourceSha256.slice(0,12)}\\.png$`).test(relative))throw Error("品牌资源名称与版本校验不一致");
  return [kind,relative];
}));
if(process.argv.includes("--check")){
  for(const relative of Object.values(outputs)){
    const files=await Promise.all(destinations.map(dest=>readFile(path.join(root,dest,relative))));
    if(!files[0].equals(files[1])||files[0].length>150000)throw Error("管理台与主站品牌资源不一致或过大，请重新生成");
  }
  console.log("XOi 主站、管理台品牌资源一致，原图校验通过");
}else{
  const require=createRequire(path.join(root,"backend/package.json"));
  const sharp=require("sharp");
  const reports=[];
  for(const [kind,relative] of Object.entries(outputs)){
    const image=sharp(source);
    const bytes=await (kind==="logo"?image.resize({width:256,withoutEnlargement:true}):image.resize({width:kind==="favicon"?64:192,height:kind==="favicon"?64:192,fit:"contain",background:{r:0,g:0,b:0,alpha:0},withoutEnlargement:true})).png({compressionLevel:9}).toBuffer();
    for(const dest of destinations){const file=path.join(root,dest,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);}
    reports.push({kind,bytes:bytes.length});
  }
  console.log(JSON.stringify({sourceBytes:(await stat(path.join(root,"frontend/src/assets/XOI_logo.png"))).size,outputs:reports,sourcePreserved:true}));
}
