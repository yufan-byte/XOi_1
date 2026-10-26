import * as ONNX_WEB from "onnxruntime-web";
import { pipeline, env as transformersEnv, FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "path";
import fs from "fs";
import getPath from "@/utils/getPath";
import db from "@/utils/db";
import type {Knex} from 'knex';

// ── 模型配置 ──
// const modelOnnxFile = ["all-MiniLM-L6-v2", "onnx", "model_fp16.onnx"]; // 模型文件路径
// const modelDtype = "fp16" as const; // 量化类型：fp32
let extractor: FeatureExtractionPipeline | null = null;
let initializing: Promise<void> | undefined;

export async function initEmbedding(connection:Knex=db): Promise<void> {
  if (extractor) return;
  if(initializing)return initializing;
  initializing=(async()=>{

  // XOi 修复：`db("o_setting")` 返回的是 o_setting 的**行数组**（{key, value}[]），不是键值对象。
  // 原来写成 `Object.entries(数组)`，拿到的是 ["0", 第0行] ["1", 第1行] 这种下标键，
  // 于是 modelObj.modelOnnxFile / modelObj.modelDtype **永远是 undefined** ——
  // 配置里设的 embedding 模型一直被静默忽略，永远回落成硬编码的默认值。
  const modelConfigData = await connection("o_setting").whereIn("key", ["modelOnnxFile", "modelDtype"]);
  const modelObj: Record<string, string> = {};
  for (const row of modelConfigData) {
    if (row.key != null) modelObj[row.key] = String(row.value ?? "");
  }
  let modelOnnxFile = modelObj?.modelOnnxFile ? JSON.parse(modelObj.modelOnnxFile) : ["all-MiniLM-L6-v2", "onnx", "model_fp16.onnx"]; // 模型文件路径
  let modelDtype = modelObj?.modelDtype ?? ("fp16" as const); // 量化类型：fp32
  const onnxPath = path.join(getPath("models"), ...modelOnnxFile);
  if (!fs.existsSync(onnxPath)) {
    throw new Error(`Embedding 模型文件不存在: ${onnxPath}`);
  }

  transformersEnv.allowRemoteModels = false;
  transformersEnv.allowLocalModels = true;
  transformersEnv.localModelPath = getPath("models").replace(/\\/g, "/") + "/";

  const modelFolder = modelOnnxFile[0];
  // @ts-ignore - pipeline 重载联合类型过于复杂
  extractor = await pipeline("feature-extraction", modelFolder, { dtype: modelDtype });
  })();
  try{await initializing;}finally{initializing=undefined;}
}

export async function getEmbedding(text: string,connection:Knex=db): Promise<number[]> {
  if (!extractor) await initEmbedding(connection);
  const output = await extractor!(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  return a.reduce((dot, v, i) => dot + v * b[i], 0);
}

export async function disposeEmbedding(): Promise<void> {
  await extractor?.dispose?.();
  extractor = null;
}
