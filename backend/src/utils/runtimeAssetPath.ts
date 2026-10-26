import path from "node:path";

/** Writable data stays in ./data. Only program assets may resolve to an immutable release. */
export function runtimeAssetPath(fileName?: string[] | string, releaseDir = process.env.XOI_RELEASE_DIR, cwd = process.cwd()) {
  const data = path.join(cwd, "data");
  const parts = Array.isArray(fileName) ? fileName : fileName ? fileName.split(/[\\/]/) : [];
  const immutable = new Set(["web", "fonts", "serve"]);
  const useRelease = Boolean(releaseDir && parts.length && immutable.has(parts[0]));
  if (releaseDir && !path.isAbsolute(releaseDir)) throw Error("XOI_RELEASE_DIR 必须是绝对路径");
  const root = useRelease ? path.join(releaseDir!, parts[0]) : data;
  const target = path.resolve(root, ...(useRelease ? parts.slice(1) : parts));
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw Error("路径逃逸错误，路径必须在指定目录内");
  return target;
}
