export function pricingFailure(error: any): { message: string; retryable: boolean } {
  const status = Number(error?.status || error?.response?.status || 0);
  const detail = String(error?.response?.data?.message || error?.response?.data?.error || error?.message || error?.error || "");
  if (status === 401 || status === 403 || /登录|账号已切换|身份/.test(detail)) return { message: "登录状态已失效，请重新登录后查看价格", retryable: false };
  if ((status >= 400 && status < 500 && status !== 408 && status !== 429) || (!status && /暂无可靠预估|不可用|参数|未配置/.test(detail))) return { message: detail || "当前模型或参数暂无可靠报价，请重新选择", retryable: false };
  return { message: "价格服务暂时连接不上，请重试", retryable: true };
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Bound the wait even when an adapter ignores AbortSignal. Late results are observed but discarded. */
function readWithDeadline<T>(request: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (ok: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (ok) resolve(value as T); else reject(value);
    };
    const abort = () => {
      finish(false, signal.reason ?? new DOMException("Aborted", "AbortError"));
      controller.abort(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    timer = setTimeout(() => {
      const error = new DOMException("读取模型价格超时，请重试", "TimeoutError");
      finish(false, error);
      controller.abort(error);
    }, timeoutMs);
    try {
      Promise.resolve(request(controller.signal)).then(value => finish(true, value), error => finish(false, error));
    } catch (error) { finish(false, error); }
  });
}

/** Only for read-only catalog/quote operations: bounded retry, timeout and lifecycle cancellation. */
export async function queryPricing<T>(request: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, delays = [1000, 3000], timeoutMs = 10000): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("价格请求超时必须是正数");
  if (delays.some(delay => !Number.isFinite(delay) || delay < 0)) throw new RangeError("价格重试间隔必须是非负数");
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      const value = await readWithDeadline(request, signal, timeoutMs);
      signal.throwIfAborted();
      return value;
    } catch (error) {
      signal.throwIfAborted();
      if (attempt >= delays.length || !pricingFailure(error).retryable) throw error;
    }
    await pause(delays[attempt], signal);
  }
}
