"use client";
// 用 IndexedDB 存素材文件与成片，localStorage 放不下视频
const DB = "mc-clip", STORE = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => { const t = db.transaction(STORE, mode); const q = fn(t.objectStore(STORE));
    // 以事务完成为准：配额超限常常是请求 success 之后事务才 abort，只看 q.onsuccess 会误报「已存」
    t.oncomplete = () => { db.close(); res(q.result); }; t.onabort = t.onerror = () => { db.close(); rej(t.error ?? q.error); }; }));
}
export const blobStore = {
  /** 返回是否存成功：配额满 / 隐私模式没有 IndexedDB 时为 false，调用方据此提示「关掉页面后素材会丢」 */
  put: (key: string, blob: Blob) => tx<IDBValidKey>("readwrite", (s) => s.put(blob, key)).then(() => true, () => false),
  get: (key: string) => tx<Blob | undefined>("readonly", (s) => s.get(key)).catch(() => undefined),
  del: (key: string) => tx<undefined>("readwrite", (s) => s.delete(key)).catch(() => undefined),
};
