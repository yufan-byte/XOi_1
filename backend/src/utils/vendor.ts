import { transform } from "sucrase";
import fs from "fs";
import path from "path";
import u from "@/utils";
import { vendorCodePath } from "./vendorSecurity";

export function writeCode(id: string | number, tsCode: string) {
  const rootDir = u.getPath("vendor")
  fs.mkdirSync(rootDir, { recursive: true })
  fs.writeFileSync(vendorCodePath(rootDir, id), tsCode);
}

export function getCode(id: string): string {
  const rootDir = u.getPath("vendor");
  const targetFile = vendorCodePath(rootDir, id);
  if (!fs.existsSync(targetFile)) return "";
  return fs.readFileSync(targetFile, "utf-8");
}

export async function getModelList(id: string): Promise<Array<any>> {
  const models = await u.db("o_vendorConfig").where("id", id).select("models").first();
  if (!models || !models.models) return [];
  const code = getCode(id);
  const jsCode = transform(code, { transforms: ["typescript"] }).code;
  const vendorData = u.vm(jsCode);
  if(!vendorData || !vendorData.vendor || !vendorData.vendor.models) return [];
  const combined = [...JSON.parse(JSON.stringify(vendorData.vendor.models)), ...JSON.parse(models?.models ?? "[]")];
  const map = new Map<string, any>();
  for (const m of combined) {
    let normalized = m;
    // 兼容旧数据：曾有前端规则将名称包含 agnes 的未知型号全部保存为视频。
    if (id === "agnes" && typeof m?.modelName === "string") {
      const modelName = m.modelName.toLowerCase();
      if (modelName.includes("image")) {
        normalized = { name: m.name, modelName: m.modelName, type: "image", mode: m.mode?.length ? m.mode : ["text"] };
      } else if (modelName.includes("video")) {
        normalized = {
          name: m.name,
          modelName: m.modelName,
          type: "video",
          mode: m.mode?.length ? m.mode : ["singleImage", "text"],
          audio: m.audio ?? false,
          durationResolutionMap: m.durationResolutionMap?.length
            ? m.durationResolutionMap
            : [{ duration: [5], resolution: ["1280x720"] }],
        };
      } else {
        normalized = { name: m.name, modelName: m.modelName, type: "text", think: m.think ?? false };
      }
    }
    map.set(m.modelName, normalized);
  }
  return [...map.values()];
}

// 获取供应商的可用模型列表（从API获取）
export async function fetchVendorModels(id: string): Promise<{ text: string[]; image: string[]; video: string[] }> {
  try {
    const code = getCode(id);
    if (!code) return { text: [], image: [], video: [] };

    const jsCode = transform(code, { transforms: ["typescript"] }).code;
    const vendorData = u.vm(jsCode);

    if (vendorData && vendorData.fetchModels) {
      const result = await vendorData.fetchModels();
      return {
        text: result?.text || [],
        image: result?.image || [],
        video: result?.video || [],
      };
    }

    return { text: [], image: [], video: [] };
  } catch (error) {
    console.error("获取供应商模型列表失败:", error);
    return { text: [], image: [], video: [] };
  }
}

export function getVendor(id: string) {
  const code = getCode(id);
  const jsCode = transform(code, { transforms: ["typescript"] }).code;
  const vendorData = u.vm(jsCode);
  return vendorData.vendor;
}
