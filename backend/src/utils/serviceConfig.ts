import defaults from "../../../shared/runtime-defaults.json";

export function servicePort(value: string | undefined = process.env.PORT) {
  const port = value === undefined || value === "" ? defaults.port : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("PORT 必须是 1024–65535 的整数");
  return port;
}

/** Public build identity only. Never expose environment, commit path or credentials. */
export function serviceIdentity(env: NodeJS.ProcessEnv = process.env) {
  const release = env.XOI_RELEASE_ID || "development";
  if(["prod","production"].includes(env.NODE_ENV||"")&&["development","unversioned"].includes(release))throw Error("生产必须设置明确的 XOI_RELEASE_ID 发布版本标签");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(release)) throw Error("XOI_RELEASE_ID 格式无效");
  return { product: defaults.product, release };
}

export function localHealthIdentity(env: NodeJS.ProcessEnv = process.env) {
  return { status: "ok", ...serviceIdentity(env), ...(env.XOI_LOCAL_INSTANCE ? { instance: env.XOI_LOCAL_INSTANCE } : {}) };
}
