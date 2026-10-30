import axios from "axios";
import { requireDb } from "@/lib/agent/db";
import { getOptions, putOption, adminApi } from "@/lib/agent/newapi-admin";
import { clearModelCatalogCache, type PricingRow } from "./index";
import { metadataFromCards, type ModelMetadataMap } from "./cards";
import { buildPricingOptions, unsupportedNewTaskModel } from "./sync-options";
import type { PoolClient } from "pg";

type ChannelSource = {
  channel: any;
  source: PricingRow[];
  cards: ModelMetadataMap;
  upstreamFactor: number;
  upstreamGroup: string;
  unsupportedModels: string[];
};
type FailedChannel = { id: number; name: string; error: string };
type SyncResult = { models: number; channels: number; changed: number; syncedAt: string; unsupportedModels: string[]; failedChannels: FailedChannel[] };

let running: Promise<SyncResult> | null = null;

/** Older imports reused tag=zaowu-all for every fixed group; the channel name is authoritative there. */
export function upstreamGroupForChannel(channel: { tag?: unknown; name?: unknown }): string {
  const tagGroup = String(channel.tag || "").replace(/^zaowu-/, "").trim();
  const nameGroup = String(channel.name || "").replace(/^zaowu-/, "").trim();
  if (tagGroup && tagGroup !== "all") return tagGroup;
  if (nameGroup && !["all", "default"].includes(nameGroup)) return nameGroup;
  return process.env.XOI_UPSTREAM_BILLING_GROUP || "default";
}

function upstreamFactorOverrides(): Record<string, number> {
  try {
    const parsed = JSON.parse(process.env.XOI_UPSTREAM_GROUP_RATIOS || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([group, value]) => {
      const factor = Number(value);
      return Number.isFinite(factor) && factor > 0 ? [[group, factor]] : [];
    }));
  } catch { throw new Error("XOI_UPSTREAM_GROUP_RATIOS 必须是有效的 JSON 倍率映射"); }
}

function channelError(channel: any, action: string, error: unknown): Error {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return new Error(`${channel.name || channel.tag || channel.id} ${action}${status ? `返回 HTTP ${status}` : "失败"}`);
}

/** Synchronize every enabled Zaowu group as one atomic pricing catalog. */
export async function syncUpstreamPricing(policy: { quarantineExistingUnsupported?: boolean } = {}) {
  if (running) return running;
  let lockClient: PoolClient | undefined;
  let attemptedChannelIds: number[] = [];
  let syncBusy = false;
  running = (async (): Promise<SyncResult> => {
    const db = requireDb();
    const configured = Number(process.env.XOI_UPSTREAM_CHANNEL_ID || 0);
    const result = configured
      ? await db.query("SELECT id,name,tag,base_url,key,models FROM channels WHERE id=$1 AND status=1", [configured])
      : await db.query("SELECT id,name,tag,base_url,key,models FROM channels WHERE tag LIKE 'zaowu-%' AND status=1 ORDER BY id");
    if (!result.rows.length) throw new Error("尚未配置造物上游渠道");
    attemptedChannelIds = result.rows.map(row => Number(row.id));
    const factorOverrides = upstreamFactorOverrides();

    // Public catalog/card requests are shared per upstream URL; /v1/models remains token-scoped.
    const pricingCache = new Map<string, Promise<any>>();
    const cardCache = new Map<string, Promise<any>>();
    const settled = await Promise.allSettled(result.rows.map(async channel => {
      const url = String(channel.base_url || "").replace(/\/+$/, "").replace(/\/v1$/, "");
      if (!/^https?:\/\//.test(url)) throw new Error(`造物渠道 ${channel.name || channel.id} 地址无效`);
      const headers = { Authorization: `Bearer ${String(channel.key).startsWith("sk-") ? channel.key : `sk-${channel.key}`}` };
      if (!pricingCache.has(url)) pricingCache.set(url, axios.get(`${url}/api/pricing`, { timeout: 25_000 }));
      if (!cardCache.has(url)) cardCache.set(url, axios.get(`${url}/api/catalog/logical`, { timeout: 25_000 }).catch(() => null));
      let pricing: any, modelResponse: any, cardResponse: any;
      try { pricing = await pricingCache.get(url)!; }
      catch (error) { throw channelError(channel, "读取价格目录", error); }
      try { modelResponse = await axios.get(`${url}/v1/models`, { headers, timeout: 25_000 }); }
      catch (error) { throw channelError(channel, "读取模型目录", error); }
      cardResponse = await cardCache.get(url)!;
      const rows = pricing.data?.data as PricingRow[];
      if (!Array.isArray(rows) || !rows.length || !Array.isArray(modelResponse.data?.data)) {
        throw new Error(`造物渠道 ${channel.name || channel.id} 目录不完整，已保留现有配置`);
      }
      const names = new Set<string>(modelResponse.data.data.map((model: any) => String(model.id)));
      let cards: ModelMetadataMap = {};
      if (Array.isArray(cardResponse?.data?.models)) cards = metadataFromCards(cardResponse.data, names);
      else {
        try {
          const previous = await db.query("SELECT snapshot FROM xoi_upstream_pricing_sync WHERE channel_id=$1", [channel.id]);
          cards = previous.rows[0]?.snapshot?.cards || {};
        } catch { /* A fresh installation has no previous capability cards. */ }
        console.warn(`[upstream-sync] ${channel.name || channel.id} 参数目录暂不可用，保留最近参数`);
      }
      const source = rows.filter(row => names.has(row.model_name));
      if (!names.size) throw new Error(`造物渠道 ${channel.name || channel.id} 的令牌没有返回可用模型，已保留现有配置`);
      if (!source.length) throw new Error(`造物渠道 ${channel.name || channel.id} 的令牌可见 ${names.size} 个模型，但公开价格目录未包含这些型号；已保留现有目录与价格，专线价格需通过账号核对`);
      const upstreamGroup = upstreamGroupForChannel(channel);
      const upstreamFactor = Number(pricing.data.group_ratio?.[upstreamGroup] ?? factorOverrides[upstreamGroup]);
      if (!Number.isFinite(upstreamFactor) || upstreamFactor <= 0) {
        throw new Error(`造物渠道 ${channel.name || channel.id} 的 ${upstreamGroup} 进货倍率无效`);
      }
      return { channel, source, cards, upstreamFactor, upstreamGroup, unsupportedModels: [] };
    }));
    const sources: ChannelSource[] = [];
    const failedChannels: FailedChannel[] = [];
    settled.forEach((entry, index) => {
      const channel = result.rows[index];
      if (entry.status === "fulfilled") sources.push(entry.value);
      else failedChannels.push({ id: Number(channel.id), name: String(channel.name || channel.tag || channel.id), error: String(entry.reason?.message || "目录读取失败").slice(0, 300) });
    });
    if (!sources.length) throw new Error(failedChannels.map(item => item.error).join("；") || "没有可同步的造物渠道");
    // If a model is accidentally exposed by more than one purchasing group, the
    // most expensive factor wins so a channel reorder cannot create a loss.
    sources.sort((left, right) => left.upstreamFactor - right.upstreamFactor || Number(left.channel.id) - Number(right.channel.id));

    lockClient = await db.connect();
    const locked = await lockClient.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", ["xoi:upstream-pricing-options"]);
    if (!locked.rows[0].locked) {
      syncBusy = true;
      lockClient.release();
      lockClient = undefined;
      throw new Error("已有价格同步正在运行，请稍后重试");
    }

    const options = await getOptions();
    const existingNames = new Set(sources.flatMap(item => String(item.channel.models || "").split(",").filter(Boolean)));
    let changes: [string, Record<string, any>][] = [];
    await db.query("CREATE TABLE IF NOT EXISTS xoi_upstream_pricing_sync (channel_id bigint PRIMARY KEY, snapshot jsonb NOT NULL, previous_options jsonb NOT NULL, synced_at timestamptz NOT NULL DEFAULT now())");
    const failedAt = new Date().toISOString();
    for (const failure of failedChannels) {
      await db.query(
        `INSERT INTO xoi_upstream_pricing_sync(channel_id,snapshot,previous_options) VALUES($1,$2,'{}'::jsonb)
         ON CONFLICT(channel_id) DO UPDATE SET snapshot=xoi_upstream_pricing_sync.snapshot || (EXCLUDED.snapshot - 'rows' - 'status')`,
        [failure.id, JSON.stringify({ status: "failed", lastAttemptStatus: "failed", lastAttemptAt: failedAt, lastError: failure.error, rows: [] })],
      );
    }

    for (;;) {
      // Each purchasing group uses its own factor while retaining all prior groups in the maps.
      let working = options;
      let maps: Record<string, Record<string, any>> = {};
      for (const item of sources) {
        maps = buildPricingOptions(working, item.source, item.upstreamFactor);
        working = Object.fromEntries(Object.entries(maps).map(([key, value]) => [key, JSON.stringify(value)]));
      }
      /**
       * 写之前先按**本实例已装插件**的真实能力过滤表达式（详见 plugin-usage.ts）。
       *
       * 上游表达式是给造物自家插件写的（billing_aspect_ratio / billing_resolution …），
       * 而我们这边同一个模型可能还由官方插件服务（只声明 seconds / resolution …）。
       * 只要有一条表达式不被某个插件接受，整份 billing_expr 就被 400 打回，
       * 连带 ModelRatio 与参数卡片一起停止更新 —— 这就是此前目录长期不同的原因。
       */
      // 计费表达式/模式不参与本轮同步（实测结论，见 plugin-usage.ts 顶部注释）：
      // 网关只接受「模式与表达式成对、且对每个服务该模型的插件都合法」的状态，
      // 而这两项只能一个一个 key 地 PUT，无法原子成对修改 —— 只要有一条历史脏数据，
      // 连 ModelRatio 都会被 400 拒掉，整个目录永久停更。
      // 表达式由维护脚本处理（backend/scripts/fix-gateway-billing.ts），
      // 这里只保证「价格倍率 + 模型目录 + 参数卡片」能稳定同步。
      delete maps["billing_setting.billing_expr"];
      delete maps["billing_setting.billing_mode"];

      changes = Object.entries(maps)
        .filter(([key, value]) => JSON.stringify(value) !== (options[key] || "{}"))
        // 顺序很重要：先写 billing_mode、再写 billing_expr。
        // 表达式先写的话，中间态里「模式还是 tiered_expr、表达式已经没了」会被网关判成
        // "billing expression is required"，整批同样写不进去。
        .sort(([a], [b]) =>
          Number(b === "billing_setting.billing_mode") - Number(a === "billing_setting.billing_mode") ||
          Number(b === "billing_setting.billing_expr") - Number(a === "billing_setting.billing_expr"));
      const previousOptions = JSON.stringify(Object.fromEntries(changes.map(([key]) => [key, options[key] || "{}"])));
      for (const item of sources) {
        await db.query(
          "INSERT INTO xoi_upstream_pricing_sync(channel_id,snapshot,previous_options) VALUES($1,$2,$3) ON CONFLICT(channel_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,previous_options=EXCLUDED.previous_options",
          [item.channel.id, JSON.stringify({ rows: item.source, cards: item.cards, upstreamFactor: item.upstreamFactor, upstreamGroup: item.upstreamGroup, status: "pending" }), previousOptions],
        );
      }

      const applied: string[] = [];
      const updatedChannels: ChannelSource[] = [];
      try {
        for (const [key, value] of changes) {
          try { await putOption(key, JSON.stringify(value)); applied.push(key); }
          catch (error) { throw new Error(`同步 ${key} 失败：${(error as Error).message}`); }
        }
        // NewAPI rebuilds abilities itself after each partial channel update.
        for (const item of sources) {
          const modelNames = item.source.map(row => row.model_name).sort().join(",");
          const existing = String(item.channel.models || "").split(",").filter(Boolean).sort().join(",");
          if (modelNames === existing) continue;
          try {
            await adminApi("/api/channel/", { method: "PUT", body: { id: Number(item.channel.id), models: modelNames } });
            updatedChannels.push(item);
          } catch (error) { throw new Error(`${item.channel.name || item.channel.id} 模型目录更新失败：${(error as Error).message}`); }
        }
      } catch (error) {
        let rollbackFailed = false;
        for (const item of updatedChannels.reverse()) {
          try { await adminApi("/api/channel/", { method: "PUT", body: { id: Number(item.channel.id), models: String(item.channel.models || "") } }); }
          catch { rollbackFailed = true; console.error(`[upstream-sync] 回滚渠道 ${item.channel.id} 目录失败`); }
        }
        for (const key of applied.reverse()) {
          try { await putOption(key, options[key] || "{}"); }
          catch { rollbackFailed = true; console.error(`[upstream-sync] 回滚 ${key} 失败，请从 xoi_upstream_pricing_sync 恢复`); }
        }
        if (rollbackFailed) throw new Error("价格同步回滚未完成，请管理员检查备份");
        const allRows = sources.flatMap(item => item.source);
        const unsupported = unsupportedNewTaskModel(error, existingNames, allRows, policy.quarantineExistingUnsupported === true);
        const unsupportedCount = sources.reduce((sum, item) => sum + item.unsupportedModels.length, 0);
        if (unsupported && unsupportedCount < 20) {
          for (const item of sources) if (item.source.some(row => row.model_name === unsupported)) {
            item.unsupportedModels.push(unsupported);
            item.source = item.source.filter(row => row.model_name !== unsupported);
            delete item.cards[unsupported];
          }
          console.warn(`[upstream-sync] 型号 ${unsupported} 的计费字段暂不兼容，将暂不上架`);
          continue;
        }
        throw error;
      }
      break;
    }

    const syncedAt = new Date().toISOString();
    for (const item of sources) {
      await db.query("UPDATE xoi_upstream_pricing_sync SET snapshot=$2,synced_at=now() WHERE channel_id=$1", [
        item.channel.id,
        JSON.stringify({ rows: item.source, cards: item.cards, upstreamFactor: item.upstreamFactor, upstreamGroup: item.upstreamGroup, unsupportedModels: item.unsupportedModels, status: "synced", lastAttemptStatus: "synced", lastAttemptAt: syncedAt, lastError: null }),
      ]);
    }
    clearModelCatalogCache();
    const unsupportedModels = [...new Set(sources.flatMap(item => item.unsupportedModels))];
    return {
      models: new Set(sources.flatMap(item => item.source.map(row => row.model_name))).size,
      channels: sources.length,
      changed: changes.length,
      syncedAt,
      unsupportedModels,
      failedChannels,
    };
  })().catch(async error => {
    if (attemptedChannelIds.length && !syncBusy) {
      for (const channelId of attemptedChannelIds) {
        try {
          await requireDb().query("UPDATE xoi_upstream_pricing_sync SET snapshot=snapshot || $2::jsonb WHERE channel_id=$1", [channelId, JSON.stringify({ lastAttemptStatus: "failed", lastAttemptAt: new Date().toISOString(), lastError: String(error.message || "价格同步失败").slice(0, 500) })]);
        } catch { /* Preserve prior snapshot if failure metadata cannot be written. */ }
      }
    }
    throw error;
  }).finally(async () => {
    try {
      if (lockClient) {
        try { await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", ["xoi:upstream-pricing-options"]); }
        catch { console.warn("[upstream-sync] 同步锁连接已断开"); }
        finally { lockClient.release(); }
      }
    } finally { running = null; }
  });
  return running;
}

export function startUpstreamPricingSync() {
  if (process.env.XOI_UPSTREAM_PRICE_SYNC === "0") return;
  const run = () => {
    void syncUpstreamPricing()
      .then(result => console.log(`[upstream-sync] 已同步 ${result.channels} 个造物分组、${result.models} 个模型价格，更新 ${result.changed} 项${result.failedChannels.length ? `；${result.failedChannels.length} 个分组保留现有配置：${result.failedChannels.map(item => item.name).join("、")}` : ""}`))
      .catch(error => console.warn("[upstream-sync] 保留当前价格：", error.message));
  };
  run();
  setInterval(run, 15 * 60_000).unref();
}
