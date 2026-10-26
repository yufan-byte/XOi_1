import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { constants } from "node:fs";
import { runtimeAssetPath } from "./runtimeAssetPath";

export class AnnouncementsStore {
  constructor(private dataDir = runtimeAssetPath(), private webDir = runtimeAssetPath("web")) {}
  async preserveLegacy() {
    await fs.mkdir(this.dataDir,{recursive:true});
    try { await fs.copyFile(path.join(this.dataDir,"web","announcements.json"),path.join(this.dataDir,"announcements.json"),constants.COPYFILE_EXCL); }
    catch(error) { if(!["ENOENT","EEXIST"].includes((error as NodeJS.ErrnoException).code||""))throw error; }
  }
  async read(): Promise<{ data: unknown[]; banner: Record<string, unknown> | null }> {
    // Prefer writable content, then pre-upgrade content, then image defaults.
    for (const file of [path.join(this.dataDir,"announcements.json"),path.join(this.dataDir,"web","announcements.json"),path.join(this.webDir,"announcements.json")]) {
      let raw: string;
      try { const stat=await fs.stat(file);if(stat.size>2*1024*1024)throw Error("公告文件超过限制");raw=await fs.readFile(file,"utf8"); }
      catch(error) { if((error as NodeJS.ErrnoException).code==="ENOENT")continue;throw error; }
      const value=JSON.parse(raw);
      const data=Array.isArray(value)?value:value?.data;
      if(!Array.isArray(data))throw Error("公告文件格式无效");
      const banner=value?.banner&&typeof value.banner==="object"&&!Array.isArray(value.banner)?value.banner as Record<string,unknown>:null;
      return {data,banner};
    }
    return {data:[],banner:null};
  }
  async write(items: unknown[], banner?: unknown) {
    await fs.mkdir(this.dataDir,{recursive:true});
    // 横幅(banner)与公告同文件同生命周期：路由层始终传入「本次要落库的横幅」（可能是保留的旧值）。
    // 未传 banner（旧调用方/测试）则维持只写 {data} 的历史形状，行为不变。
    const payload:Record<string,unknown>=banner===undefined?{data:items}:{data:items,banner};
    const file=path.join(this.dataDir,"announcements.json"),temp=file+"."+crypto.randomUUID()+".tmp";
    try { await fs.writeFile(temp,JSON.stringify(payload),{encoding:"utf8",flag:"wx",mode:0o600});await fs.rename(temp,file); }
    finally { await fs.unlink(temp).catch(()=>{}); }
  }
}
