"use client";
// 用 IndexedDB 存素材文件与成片，localStorage 放不下视频
import { assertAccountSession } from "../adapters/request";
import { clipBlobKey } from "../adapters/isolation-keys";
const DB = "xoi-clip-v2", STORE = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(owner: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  assertAccountSession(owner);
  return open().then((db) => new Promise<T>((res, rej) => {
    try { assertAccountSession(owner); } catch(e) { db.close(); rej(e); return; }
    const t = db.transaction(STORE, mode); const q = fn(t.objectStore(STORE));
    // 以事务完成为准：配额超限常常是请求 success 之后事务才 abort，只看 q.onsuccess 会误报「已存」
    t.oncomplete = () => { db.close(); try { assertAccountSession(owner); res(q.result); } catch(e) { rej(e); } }; t.onabort = t.onerror = () => { db.close(); rej(t.error ?? q.error); }; }));
}
export const blobStore = {
  forProject(project: string) {
    const owner = assertAccountSession();
    const key = (asset: string) => clipBlobKey(owner, project, asset);
    return {
  /** 返回是否存成功：配额满 / 隐私模式没有 IndexedDB 时为 false，调用方据此提示「关掉页面后素材会丢」 */
      put: (asset: string, blob: Blob) => tx<IDBValidKey>(owner, "readwrite", (s) => s.put(blob, key(asset))).then(() => true, () => false),
      get: (asset: string) => tx<Blob | undefined>(owner, "readonly", (s) => s.get(key(asset))).catch(() => undefined),
      del: (asset: string) => tx<undefined>(owner, "readwrite", (s) => s.delete(key(asset))),
    };
  },
};
