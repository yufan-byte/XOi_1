import "dotenv/config";
import path from "node:path";
import knex from "knex";
import { migrateCanvasFiles } from "../src/lib/workspace/canvasMigration";

async function main() {
  const args=process.argv.slice(2);
  if(args.some(x=>!["--apply","--writers-stopped"].includes(x)))throw Error("仅支持 --apply --writers-stopped，默认只读预检");
  const apply=args.includes("--apply");
  if(apply&&!args.includes("--writers-stopped"))throw Error("先停止所有旧画布写入实例，再显式传入 --writers-stopped");
  const connection=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;
  if(!connection)throw Error("缺少数据库配置");
  const db=knex({client:"pg",connection,pool:{min:0,max:1},acquireConnectionTimeout:10000});
  try {console.log(JSON.stringify(await migrateCanvasFiles(db,path.join(process.cwd(),"data/canvases"),apply),null,2));}
  finally {await db.destroy();}
}
main().catch(error=>{console.error("画布迁移未完成：",error?.canvasMigration||error?.status?error.message:"数据库或文件校验失败（私有内容与连接信息已隐藏）");process.exitCode=1;});
