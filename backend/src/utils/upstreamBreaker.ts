import { setTimeout as wait } from "node:timers/promises";

/**
 * 上游熔断器。
 *
 * 解决的具体现象：某个上游（尤其是免费额度的 agnes key）被打到速率限制后持续返回
 * 429，我们这边每个用户的新请求仍然照样打过去 —— 打一次错一次，用户看到的是
 * 「当前分组上游负载已饱和」，而实际上这一次请求根本没必要发出去。
 *
 * 规则：
 *  - 只把 **429 / 5xx** 记为失败。400/401/403 是我们自己的配置或参数问题，
 *    402 是余额问题——把它们计入熔断会让一次配置失误变成永久不可用。
 *  - 同一 key 连续失败 5 次 → 熔断 30 秒；期间直接快速失败，不提交上游、不计费。
 *  - 到期后放行 1 个探针请求，成功即恢复，再失败则重新计时。
 *
 * 实现放在进程内存：多副本时各自熔断，效果是「每个副本各自感知上游不健康」，
 * 已经足够保护上游；换来的是零 DB 往返。若将来做全局熔断，把 store 换成
 * PG 表即可，对外接口不变。
 */

export class UpstreamBusyError extends Error {
  code = "UPSTREAM_BUSY";
  status = 503;
  constructor(message: string) {
    super(message);
  }
}

const FAIL_THRESHOLD = 5;
const OPEN_MS = 30_000;
/** 单 key 连续失败多久没新事件就忘掉（防止长尾 key 无限堆积） */
const FORGET_MS = 10 * 60_000;

interface Entry {
  failures: number;
  openedAt: number;
  /** 半开状态：已放行一个探针，正在等结果 */
  probing: boolean;
  lastAt: number;
}

const store = new Map<string, Entry>();

function expire() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.lastAt > FORGET_MS && now - entry.openedAt > OPEN_MS) store.delete(key);
  }
}
setInterval(expire, 60_000).unref();

/**
 * 熔断 key = 上游主机。
 *
 * 不区分模型：429 几乎总是整个 key 的速率限制，与模型无关。一个模型把上游打到
 * 限流后，同一台上游的其它模型也不该继续打 —— 粒度粗反而是对的。
 */
export function upstreamKey(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    /* 相对地址：退化成用原始字符串前 80 个字符 */
    return url.slice(0, 80);
  }
}

function isOverload(status: number) {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * 提交上游之前调用。熔断中直接抛错 —— 调用方要保证在 acquire 之后的 catch 里
 * 不要把这种情况当成「已产生费用」。
 */
export function assertUpstreamOpen(key: string): void {
  const entry = store.get(key);
  if (!entry || entry.failures < FAIL_THRESHOLD) return;
  const elapsed = Date.now() - entry.openedAt;
  if (elapsed < OPEN_MS) {
    const seconds = Math.ceil((OPEN_MS - elapsed) / 1000);
    throw new UpstreamBusyError(
      `上游服务暂时不稳定，已暂停 ${seconds} 秒；本次未提交上游、未产生费用，请稍后重试`,
    );
  }
  if (!entry.probing) {
    // 半开：只放一个探针进去，其余继续按熔断处理
    entry.probing = true;
    return;
  }
  throw new UpstreamBusyError("上游服务正在恢复中，本次未提交上游、未产生费用，请稍后重试");
}

/** 请求结束后调用。只对 429/5xx 记失败。 */
export function recordUpstreamResult(key: string, status: number | null, error?: unknown): void {
  const now = Date.now();
  const entry = store.get(key) ?? { failures: 0, openedAt: 0, probing: false, lastAt: now };
  entry.lastAt = now;

  const failed = status == null ? true : isOverload(status);
  if (!failed) {
    store.delete(key);
    return;
  }

  entry.failures++;
  entry.probing = false;
  if (entry.failures >= FAIL_THRESHOLD) entry.openedAt = now;
  store.set(key, entry);

  if (error) {
    console.warn(`[upstream-breaker] ${key} 连续失败 ${entry.failures} 次`);
  }
}

/** 控制台/健康检查用 */
export function breakerSnapshot() {
  const now = Date.now();
  return [...store.entries()]
    .filter(([, entry]) => entry.failures >= FAIL_THRESHOLD)
    .map(([key, entry]) => ({
      key,
      failures: entry.failures,
      openSeconds: Math.max(0, Math.ceil((OPEN_MS - (now - entry.openedAt)) / 1000)),
    }));
}

/** 仅测试用 */
export function _resetBreaker() {
  store.clear();
}

export { FAIL_THRESHOLD, OPEN_MS };
