/**
 * 代理专属域名：站长给代理分配一个域名，在该域名上注册的用户自动归到这个代理名下。
 * 移植自造物引擎 src/lib/agent-domain.ts（纯函数，与框架无关，逐字保留）。
 * 注册接口、IP 证书按需签发的问询、站长分配域名三处共用。
 */

/** 主站自己的域名，不能分给代理：分出去等于把主站全部新注册都算到一个代理头上。
 *  部署时用 MAIN_HOSTS（逗号分隔）配置；造物线上是写死它自己的域名，
 *  XOi 这边**不写死**（站点域名由运营决定，且代理商中心里已经能改品牌域名），
 *  没配就等于「没有保留域名」，站长可自行分配任意域名。 */
export function mainHosts(): string[] {
  return (process.env.MAIN_HOSTS ?? "").split(",").map(normalizeHost).filter(Boolean);
}

/** 把 Host 头或用户输入的域名规范成「小写、无协议、无端口、无路径、无末尾点」。
 *  Host 头在直连带端口时形如 "a.b:10588"，浏览器地址栏允许大写和末尾点 ——
 *  不规范化会让同一个域名查不到代理。 */
export function normalizeHost(raw: string | null | undefined): string {
  let h = (raw ?? "").trim().toLowerCase();
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  h = h.split(/[/?#]/)[0] ?? "";
  h = h.replace(/:\d*$/, "").replace(/\.+$/, "");
  return h;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export type DomainCheck = { ok: true; domain: string } | { ok: false; message: string };

/** 站长分配域名时的校验。空串 = 清除分配（调用方单独处理），这里视为不合法。 */
export function validateAgentDomain(raw: string, reserved: string[] = mainHosts()): DomainCheck {
  const domain = normalizeHost(raw);
  if (!domain) return { ok: false, message: "请填写域名" };
  if (domain.length > 253) return { ok: false, message: "域名太长" };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain) || domain.includes(":")) return { ok: false, message: "请填写域名，不能用 IP 地址" };
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return { ok: false, message: "域名格式不正确，例如 abc.example.com" };
  if (/^\d+$/.test(labels[labels.length - 1])) return { ok: false, message: "域名格式不正确，例如 abc.example.com" };
  if (reserved.map(normalizeHost).includes(domain)) return { ok: false, message: "这是主站域名，不能分配给代理" };
  return { ok: true, domain };
}
