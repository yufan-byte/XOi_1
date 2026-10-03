"use client";
import { useEffect, useRef } from "react";

/** 列表内容整个换掉（切分类 / 标签页 / 搜索词）时把滚动容器拉回顶部。
 *  不加的话滚动位置停在上一个列表的中段：新列表短就是一片空白，长就是从中间开始，看着像没切过去。
 *  用法：const ref = useScrollTop<HTMLDivElement>(`${tab}|${q}`); <div ref={ref} className="overflow-y-auto"> */
export function useScrollTop<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  useEffect(() => { ref.current?.scrollTo({ top: 0 }); }, [key]);
  return ref;
}
