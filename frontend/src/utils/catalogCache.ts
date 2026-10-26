import { pricingFailure, queryPricing } from "./pricingRequest";

/** Memory-only display cache. Never authorize or settle a model call from these values. */
export function createCatalogCache<T>(scope: () => string, load: (signal: AbortSignal) => Promise<T>,
  options: { ttl?: number; maxAge?: number; now?: () => number } = {}) {
  const ttl = options.ttl ?? 30_000, maxAge = options.maxAge ?? 120_000, now = options.now ?? Date.now;
  let owner = "";
  let snapshot: { value: T; at: number } | undefined;
  let pending: { controller: AbortController; promise: Promise<T> } | undefined;
  let failure: { error: unknown; at: number } | undefined;
  function reset() { pending?.controller.abort(); pending = undefined; snapshot = undefined; failure = undefined; }
  function current() { const key = scope(); if (key !== owner) { reset(); owner = key; } return key; }
  return {
    peek(): T | undefined { current(); return snapshot && now() - snapshot.at < maxAge ? snapshot.value : undefined; },
    invalidate() { reset(); },
    get(force = false): Promise<T> {
      const key = current();
      if (!force && snapshot && now() - snapshot.at < ttl) return Promise.resolve(snapshot.value);
      // A picker's unmount must not cancel another picker's shared request.
      if (pending) return pending.promise;
      if (!force && failure && now() - failure.at < 3_000) return Promise.reject(failure.error);
      const controller = new AbortController();
      const request = { controller, promise: undefined as unknown as Promise<T> };
      request.promise = queryPricing(load, controller.signal, [500], 6_000).then(value => {
        if (scope() !== key || pending !== request) throw new DOMException("Account changed", "AbortError");
        snapshot = { value, at: now() }; failure = undefined;
        return value;
      }).catch(error => {
        if (scope() === key && pending === request) {
          failure = { error, at: now() };
          if (!pricingFailure(error).retryable) snapshot = undefined;
        }
        throw error;
      }).finally(() => { if (pending === request) pending = undefined; });
      pending = request;
      return request.promise;
    },
  };
}
