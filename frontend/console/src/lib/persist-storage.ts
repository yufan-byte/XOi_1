// zustand persist 的存储层：localStorage 写满时不要把异常甩给调用方。
//
// persist 是在 set() 里同步写盘的，写失败会原地抛出去。2026-09-22 线上就是这样：
// 视频页先 addWork 记一条作品再发请求，存储写满 → addWork 抛 → 整个提交中断在按钮的
// onClick 里（没人 catch），用户看到的是「点生成没反应」，上游也确实没收到任何请求。
//
// 写满时的取舍：作品记录是可以丢的（成品本身在服务器上），但这次生成不能丢。所以先丢掉最旧的
// 一半作品再写一次，还不行就放弃落盘、只保留在内存里——页面刷新会丢记录，但请求照常发得出去。
import type { PersistStorage, StorageValue } from "zustand/middleware";

const isQuota = (e: unknown) =>
  e instanceof DOMException &&
  (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22);

let warned = false;

export function trimmingStorage<T>(onTrim?: (dropped: number) => void): PersistStorage<T> {
  return {
    getItem: (name) => {
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as StorageValue<T>) : null;
      } catch { return null; }
    },
    removeItem: (name) => { try { localStorage.removeItem(name); } catch { /* 无痕模式等 */ } },
    setItem: (name, value) => {
      const write = (v: StorageValue<T>) => localStorage.setItem(name, JSON.stringify(v));
      try { write(value); return; } catch (e) { if (!isQuota(e)) return; }
      const works = (value.state as { works?: unknown[] } | undefined)?.works;
      // 一次对半砍未必够（写满往往是别的键占着），最多砍四轮，每轮都试着落盘
      let keep = Array.isArray(works) ? works.length : 0;
      for (let i = 0; i < 4 && keep > 0; i++) {
        keep = Math.floor(keep / 2);
        try {
          write({ ...value, state: { ...value.state, works: (works as unknown[]).slice(0, keep) } });
          onTrim?.((works as unknown[]).length - keep);
          return;
        } catch (e) { if (!isQuota(e)) return; }
      }
      if (!warned) { warned = true; console.warn("[store] 本地存储写满，本次只保留在内存里"); }
    },
  };
}
