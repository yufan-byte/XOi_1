/** Additive import. Never deletes legacy files or overwrites an existing DB row. */
import "dotenv/config";
import {promises as fs} from "node:fs";
import path from "node:path";
import {isDeepStrictEqual} from "node:util";
import {initializeResellerConfig,readLegacyData} from "../src/lib/reseller/store";
import {requireDb} from "../src/lib/agent/db";
import {completeConfig} from "../src/lib/reseller/pg-store";

async function main(){
  const pool=requireDb();
  try{
    if(process.argv.includes("--local")){
      const url=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL||"";
      if(!["localhost","127.0.0.1","[::1]"].includes(new URL(url).hostname))throw Error("--local only permits local PostgreSQL");
    }
    const base=process.env.DATA_DIR??path.join(process.cwd(),"data");
    const names=await fs.readdir(path.join(base,"reseller-agents")).catch(e=>{if(e.code==="ENOENT")return [] as string[];throw e;});
    const keys=["platform",...names.filter(n=>/^agent-\d+\.json$/.test(n)).map(n=>n.slice(0,-5))];
    const before=await Promise.all(keys.map(key=>readLegacyData(key)));
    if(!process.argv.includes("--check"))await initializeResellerConfig();
    const report=[];
    for(let i=0;i<keys.length;i++){
      const result=await pool.query("SELECT data,revision FROM xoi_reseller_config WHERE config_key=$1",[keys[i]]);
      if(!result.rowCount)throw Error(`Configuration not yet imported: ${keys[i]}`);
      const matches=isDeepStrictEqual(completeConfig(result.rows[0].data),before[i]);
      if(process.argv.includes("--require-legacy-match")&&!matches)throw Error("Legacy differs from shared DB. No DB values were overwritten; inspect before switching.");
      report.push({key:keys[i],legacyMatchesDatabase:matches,revision:Number(result.rows[0].revision)});
    }
    console.log(JSON.stringify({readOnly:process.argv.includes("--check"),legacyFilesPreserved:true,modelRequests:0,configs:report}));
  }finally{await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
