import { transform } from "sucrase";
import fs from "fs";
import path from "path";
import getPath from "./getPath";
import vm from "./vm";
import db from "./db";
import { vendorCodePath } from "./vendorSecurity";
import { isNewApiOnly } from "@/lib/gateway/newapi";

/**
 * ⚠️ RCE 闸门（纵深防御）：vm 执行的是 o_vendorConfig 里存的供应商代码——node:vm 不是安全沙箱，
 * 等同于在服务器进程内执行任意代码。写入路径（vendorConfig 路由）已随旧积分体系删除，
 * 此闸门保证「生产（NEWAPI_ONLY）只允许执行 NewAPI 官方适配器」——即使未来有人恢复写入路径
 * 或表被写入恶意代码，非 newapi 供应商也无法进入执行。
 */
function assertVmAllowed(id: string | number): void {
  if (isNewApiOnly() && String(id) !== "newapi") {
    throw new Error(`生产环境只允许 NewAPI 供应商，已拒绝执行供应商 ${id} 的代码`);
  }
}

export function writeCode(id: string | number, tsCode: string) {
  const rootDir = getPath("vendor")
  fs.mkdirSync(rootDir, { recursive: true })
  fs.writeFileSync(vendorCodePath(rootDir, id), tsCode);
}

export function getCode(id: string): string {
  assertVmAllowed(id);
  const rootDir = getPath("vendor");
  const targetFile = vendorCodePath(rootDir, id);
  if (!fs.existsSync(targetFile)) return "";
  return fs.readFileSync(targetFile, "utf-8");
}

export async function getModelList(id: string): Promise<Array<any>> {
  if (id === "newapi") {
    const { getGatewayModels } = await import("@/lib/model-catalog");
    return getGatewayModels();
  }
  const models = await db("o_vendorConfig").where("id", id).select("models").first();
  if (!models || !models.models) return [];
  const code = getCode(id);
  const jsCode = transform(code, { transforms: ["typescript"] }).code;
  const vendorData = vm(jsCode);
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
  assertVmAllowed(id);
    if (!code) return { text: [], image: [], video: [] };

    const jsCode = transform(code, { transforms: ["typescript"] }).code;
    const vendorData = vm(jsCode);

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
  assertVmAllowed(id);
  const jsCode = transform(code, { transforms: ["typescript"] }).code;
  const vendorData = vm(jsCode);
  return vendorData.vendor;
}
