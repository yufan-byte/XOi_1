import seriesPrefix from "@/data/model-series.json";

/** aicost 线路的「系列 + 渠道编号」推导。
 *
 * 必须用上游名（如 seedance2.0-hs-1080p）推导，不能用售卖 id：id 里的
 * -discount / -official / -guan 是本仓库自己加的后缀，aicost 上游并不存在，
 * 用它切会切出 480p-discount 这种假编号。
 *
 * 编号原样保留，不翻译、不省略、不美化——hs / md / v3 / 900 / 100% 都是
 * aicost 的真实渠道编号，界面上必须能对应回上游线路。
 */
export interface SeriesInfo {
  /** 展示用系列名，如 "Seedance 2.0" */
  series: string;
  /** 上游名去掉系列前缀后的渠道编号，如 "hs-1080p" */
  code: string;
}

// 前缀表存放在 src/data/model-series.json，与 ops/model-sync/tests/test_frontend_cards.py
// 共用同一份数据，避免两处定义漂移。**不要在这里再写一份硬编码的表。**
// 顺序有语义：sora-2.0- 必须排在 sora- 之前，否则前者永远匹配不到；JSON 数组保序，
// 且这个顺序由 test_sora_official_code_keeps_only_the_channel_part 钉住。
const SERIES_PREFIX = seriesPrefix as unknown as ReadonlyArray<readonly [string, string]>;

export function seriesOfUpstream(upstream: string): SeriesInfo | null {
  for (const [prefix, series] of SERIES_PREFIX) {
    if (upstream.startsWith(prefix)) return { series, code: upstream.slice(prefix.length) };
  }
  // 兜底：表里还没有的新一代（seedance3.0-*、minimax-h4-*）按「家族 + 版本号」识别。
  // 不是第二份前缀表——已知系列仍只走上面的 JSON；这里只让同步脚本自动上新的新一代线路
  // 在补表之前也能正常归组、命名（如「seedance3.0 · hs-720p」），而不是退化成原始 id 排到最后。
  const m = /^(seedance)-?(\d+(?:\.\d+)?)-(.+)$/i.exec(upstream) ?? /^(minimax-h)(\d+)-(.+)$/i.exec(upstream);
  if (m) return { series: `${m[1].toLowerCase()}${m[2]}`, code: m[3] };
  return null;
}
