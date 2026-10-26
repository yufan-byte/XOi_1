import path from "node:path";
import { CanvasFiles } from "./canvasFiles";
import { CanvasDatabase } from "./canvasDatabase";
import { db } from "@/utils/db";
import { verifyCanvasImports } from "./canvasMigration";
const production=["prod","production"].includes(process.env.NODE_ENV||"");
const mode=process.env.XOI_CANVAS_STORAGE||(production?"postgres":"files");
if(!["files","postgres"].includes(mode))throw Error("XOI_CANVAS_STORAGE 只支持 files/postgres");
export const canvasFiles = mode==="postgres"?new CanvasDatabase(db):new CanvasFiles(path.join(process.cwd(),"data/canvases"));
export async function verifyCanvasStorage() {
  if(mode==="postgres")await verifyCanvasImports(db,path.join(process.cwd(),"data/canvases"));
}
