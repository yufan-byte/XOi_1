/** Same-tab handoffs are scoped to a login, expire, and are consumed exactly once. */
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (session: string, channel: string) => {
  if (!/^[1-9]\d*:[A-Za-z0-9_-]+$/.test(session) || !/^[a-z-]+$/.test(channel)) throw new Error("请先登录后交接素材");
  return JSON.stringify(["xoi-handoff-v2", session, channel]);
};
export function writeBrowserHandoff(store: Store, session: string, channel: string, data: unknown, now = Date.now()) {
  store.setItem(key(session, channel), JSON.stringify({session, at: now, data}));
}
export function takeBrowserHandoff<T>(store: Store, session: string, channel: string, now = Date.now()): T | undefined {
  const name = key(session, channel), raw = store.getItem(name);
  store.removeItem(name);
  if (!raw) return;
  try {
    const item = JSON.parse(raw);
    if (item.session === session && Number.isFinite(item.at) && item.at <= now && now - item.at < 10 * 60_000) return item.data as T;
  } catch { /* Malformed data cannot be imported. */ }
}
