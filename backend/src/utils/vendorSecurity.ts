import fs from "node:fs";
import path from "node:path";

export const SECRET_MASK = "••••••••";
export function vendorCodePath(root: string, id: string | number): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(id))) throw new Error("供应商 ID 格式不合法");
  const target = path.resolve(root, String(id) + ".ts");
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error("供应商文件不能是符号链接");
  return target;
}
export function isSecretInput(key: string, inputs: Array<{key: string; type?: string}> = []): boolean {
  return /key|secret|password|token|credential/i.test(key) || inputs.some((input) => input.key === key && input.type === "password");
}
export function maskInputs(values: Record<string, string>, inputs: Array<{key: string; type?: string}> = []) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value && isSecretInput(key, inputs) ? SECRET_MASK : value]));
}
export function mergeInputs(previous: Record<string, string>, incoming: Record<string, string>) {
  const result = { ...previous };
  for (const [key, value] of Object.entries(incoming)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("配置字段不合法");
    if (value !== SECRET_MASK) result[key] = value;
  }
  return result;
}
