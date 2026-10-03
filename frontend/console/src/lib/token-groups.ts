/** API 密钥分组下拉的搜索：分组名搜不到时按分组里的模型搜（用户只知道要调哪个模型，不知道它归哪个分组） */

export interface TokenGroupOption {
  value: string; label: string; ratio?: number;
  /** 该分组覆盖的模型（catalog 的 enable_groups 反查），既用于「N 个模型」也用于按模型搜索 */
  models: { id: string; name: string }[];
  count: number;
}

/** 命中的模型名；按分组名匹配时为空数组 */
export interface TokenGroupMatch extends TokenGroupOption { hits: string[] }

/** 先按分组名 / 分组 key 匹配；不中则按模型名与模型 ID 匹配，两者都不中的分组被过滤掉 */
export function matchTokenGroups(options: TokenGroupOption[], q: string): TokenGroupMatch[] {
  const kw = q.trim().toLowerCase();
  return options.flatMap((o) => {
    if (!kw || o.value.toLowerCase().includes(kw) || o.label.toLowerCase().includes(kw)) return [{ ...o, hits: [] }];
    const hits = o.models.filter((m) => m.name.toLowerCase().includes(kw) || m.id.toLowerCase().includes(kw)).map((m) => m.name);
    return hits.length ? [{ ...o, hits }] : [];
  });
}
