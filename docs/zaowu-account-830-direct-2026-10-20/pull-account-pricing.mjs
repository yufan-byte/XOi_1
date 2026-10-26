#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PROXY = "http://localhost:3456";
const EXPECTED_HOST = "zwyq.ccdan.live";
const EXPECTED_UID = 830;
const EXPECTED_EMAIL = "3225449809@qq.com";
const OUTPUT_DIR = path.dirname(new URL(import.meta.url).pathname);

const targets = await fetch(`${PROXY}/targets`).then((response) => response.json());
const target = targets.find((item) => {
  try {
    return new URL(item.url).hostname === EXPECTED_HOST;
  } catch {
    return false;
  }
});

if (!target) {
  throw new Error(`没有找到已登录的 ${EXPECTED_HOST} 浏览器标签页`);
}

const expression = String.raw`
(async () => {
  const auth = JSON.parse(localStorage.getItem("mc.auth") || "null");
  if (!auth?.accessToken || !auth?.user?.id) {
    throw new Error("浏览器中没有可用的造物登录态");
  }
  if (auth.user.id !== ${EXPECTED_UID} || auth.user.email !== ${JSON.stringify(EXPECTED_EMAIL)}) {
    throw new Error("当前登录账号与预期账号不一致");
  }

  const headers = {
    Authorization: "Bearer " + auth.accessToken,
    "New-Api-User": String(auth.user.id),
  };

  const get = async (url) => {
    const sep = url.includes("?") ? "&" : "?";
    const response = await fetch(url + sep + "_=" + Date.now(), { method: "GET", headers, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(url + " 返回 HTTP " + response.status);
    }
    return body;
  };

  const [self, pricing, logical, sources, autoGroups, groupRatios, tokens, priceFactor, channels] = await Promise.all([
    get("/api/user/self"),
    get("/api/pricing"),
    get("/api/catalog/logical"),
    get("/api/catalog/sources"),
    get("/api/token/auto-groups"),
    get("/api/catalog/group-ratios"),
    get("/api/token/?p=1&size=100"),
    get("/api/agent/price-factor"),
    get("/api/channel/?p=1&page_size=100"),
  ]);

  const user = self?.data || self;
  const tokenItems = tokens?.data?.items || tokens?.data || [];
  const safeTokens = tokenItems.map((token) => ({
    id: token.id,
    name: token.name,
    status: token.status,
    group: token.group,
    unlimited_quota: token.unlimited_quota,
    remain_quota: token.remain_quota,
    used_quota: token.used_quota,
    model_limits_enabled: token.model_limits_enabled,
    model_limits: token.model_limits,
    expired_time: token.expired_time,
  }));
  const channelItems = channels?.data?.items || channels?.data || [];
  const safeChannels = channelItems.map((channel) => ({
    id: channel.id,
    name: channel.name,
    status: channel.status,
    type: channel.type,
    group: channel.group,
    models: channel.models,
    base_url: channel.base_url,
    model_mapping: channel.model_mapping,
    priority: channel.priority,
    weight: channel.weight,
    remark: channel.remark,
    tag: channel.tag,
    setting: channel.setting,
    param_override: channel.param_override,
    used_quota: channel.used_quota,
    test_time: channel.test_time,
    response_time: channel.response_time,
  }));

  return {
    captured_at: new Date().toISOString(),
    source: location.origin,
    account: {
      id: user.id,
      email: user.email,
      username: user.username,
      group: user.group,
      quota: user.quota,
      used_quota: user.used_quota,
      request_count: user.request_count,
      status: user.status,
    },
    tokens: safeTokens,
    auto_groups: autoGroups,
    group_ratios: groupRatios,
    agent_price_factor: priceFactor,
    pricing,
    catalog_logical: logical,
    catalog_sources: sources,
    upstream_channels: {
      total: channels?.data?.total ?? safeChannels.length,
      items: safeChannels,
    },
  };
})()
`;

const response = await fetch(`${PROXY}/eval?target=${encodeURIComponent(target.targetId)}`, {
  method: "POST",
  headers: { "content-type": "text/plain; charset=utf-8" },
  body: expression,
});
const envelope = await response.json();
if (!response.ok || envelope.error) {
  throw new Error(envelope.error || `CDP eval 返回 HTTP ${response.status}`);
}

const snapshot = envelope.value;
const pricingRows = snapshot.pricing?.data || [];
const logicalModels = snapshot.catalog_logical?.models || [];
const logicalById = new Map(logicalModels.map((model) => [model.id, model]));
const sourceById = snapshot.catalog_sources || {};
const channelRows = snapshot.upstream_channels?.items || [];
const channelGroups = channelRows.flatMap((row) => String(row.group || "").split(",").map((group) => group.trim()).filter(Boolean));

const unionGroups = new Set([
  snapshot.account.group,
  ...(snapshot.auto_groups?.data?.groups || []),
  ...Object.keys(snapshot.group_ratios?.groups || {}),
  ...Object.keys(snapshot.pricing?.group_ratio || {}),
  ...Object.keys(snapshot.pricing?.usable_group || {}),
  ...channelGroups,
  ...pricingRows.flatMap((row) => row.enable_groups || []),
]);

const groupSummary = [...unionGroups]
  .filter(Boolean)
  .sort()
  .map((group) => ({
    group,
    ratio: group === "default" ? 1 : snapshot.group_ratios?.groups?.[group] ?? null,
    relative_ratio: snapshot.pricing?.group_ratio?.[group] ?? null,
    label: snapshot.pricing?.usable_group?.[group] || group,
    model_count: pricingRows.filter((row) => (row.enable_groups || []).includes(group)).length,
    channel_count: channelRows.filter((row) => String(row.group || "").split(",").map((item) => item.trim()).includes(group)).length,
    is_account_default: group === snapshot.account.group,
    is_auto_group: (snapshot.auto_groups?.data?.groups || []).includes(group),
  }));

const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join("|") : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const columns = [
  "model_name",
  "display_name_zh",
  "category",
  "provider",
  "catalog_group",
  "catalog_group_item",
  "source_tag",
  "source_label",
  "description",
  "billing_mode",
  "billing_expr",
  "enable_groups",
  "supported_endpoint_types",
  "quota_type",
  "model_ratio",
  "model_price",
  "completion_ratio",
  "cache_ratio",
  "create_cache_ratio",
  "available",
];

const flatRows = pricingRows
  .map((row) => {
    const logical = logicalById.get(row.model_name) || {};
    const source = sourceById[row.model_name] || {};
    return {
      model_name: row.model_name,
      display_name_zh: logical.display_name_zh || "",
      category: logical.category || "",
      provider: logical.provider || "",
      catalog_group: logical.group || "",
      catalog_group_item: logical.group_item || "",
      source_tag: source.tag || "",
      source_label: source.label || "",
      description: row.description || logical.description_zh || "",
      billing_mode: row.billing_mode || "ratio",
      billing_expr: row.billing_expr || "",
      enable_groups: row.enable_groups || [],
      supported_endpoint_types: row.supported_endpoint_types || [],
      quota_type: row.quota_type,
      model_ratio: row.model_ratio,
      model_price: row.model_price,
      completion_ratio: row.completion_ratio,
      cache_ratio: row.cache_ratio,
      create_cache_ratio: row.create_cache_ratio,
      available: logical.available,
    };
  })
  .sort((a, b) => a.model_name.localeCompare(b.model_name));

const csv = [
  columns.join(","),
  ...flatRows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\n");

const seedanceRows = flatRows.filter((row) => /seedance/i.test(row.model_name));
const seedanceCsv = [
  columns.join(","),
  ...seedanceRows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\n");

const channelColumns = [
  "id", "name", "status", "type", "group", "models", "model_count", "base_url", "model_mapping",
  "priority", "weight", "remark", "tag", "setting", "param_override", "used_quota", "test_time", "response_time",
];
const flatChannels = channelRows
  .map((row) => ({ ...row, model_count: String(row.models || "").split(",").filter(Boolean).length }))
  .sort((a, b) => Number(a.id) - Number(b.id));
const channelCsv = [
  channelColumns.join(","),
  ...flatChannels.map((row) => channelColumns.map((column) => csvCell(row[column])).join(",")),
].join("\n");

const groupColumns = ["group", "label", "relative_ratio", "ratio", "channel_count", "model_count", "is_account_default", "is_auto_group"];
const groupCsv = [
  groupColumns.join(","),
  ...groupSummary.map((row) => groupColumns.map((column) => csvCell(row[column])).join(",")),
].join("\n");

const accountDirect = {
  captured_at: snapshot.captured_at,
  source: snapshot.source,
  account: snapshot.account,
  tokens: snapshot.tokens,
  auto_groups: snapshot.auto_groups,
  group_ratios: snapshot.group_ratios,
  agent_price_factor: snapshot.agent_price_factor,
  group_summary: groupSummary,
};

await mkdir(OUTPUT_DIR, { recursive: true });
await Promise.all([
  writeFile(path.join(OUTPUT_DIR, "account-and-groups.sanitized.json"), `${JSON.stringify(accountDirect, null, 2)}\n`),
  writeFile(path.join(OUTPUT_DIR, "pricing.raw.json"), `${JSON.stringify(snapshot.pricing, null, 2)}\n`),
  writeFile(path.join(OUTPUT_DIR, "catalog-logical.raw.json"), `${JSON.stringify(snapshot.catalog_logical, null, 2)}\n`),
  writeFile(path.join(OUTPUT_DIR, "catalog-sources.raw.json"), `${JSON.stringify(snapshot.catalog_sources, null, 2)}\n`),
  writeFile(path.join(OUTPUT_DIR, "upstream-channels.sanitized.json"), `${JSON.stringify(snapshot.upstream_channels, null, 2)}\n`),
  writeFile(path.join(OUTPUT_DIR, "all-model-prices.csv"), `${csv}\n`),
  writeFile(path.join(OUTPUT_DIR, "seedance-model-prices.csv"), `${seedanceCsv}\n`),
  writeFile(path.join(OUTPUT_DIR, "upstream-channels.csv"), `${channelCsv}\n`),
  writeFile(path.join(OUTPUT_DIR, "groups-and-channel-counts.csv"), `${groupCsv}\n`),
]);

console.log(JSON.stringify({
  captured_at: snapshot.captured_at,
  source: snapshot.source,
  uid: snapshot.account.id,
  email: snapshot.account.email,
  model_count: pricingRows.length,
  logical_model_count: logicalModels.length,
  seedance_model_count: seedanceRows.length,
  upstream_channel_count: channelRows.length,
  xoi_channel_count: channelRows.filter((row) => /(^|,)xoi(,|$)/i.test(String(row.group || "")) || /xoi/i.test(String(row.models || ""))).length,
  groups: groupSummary,
  pricing_version: snapshot.pricing?.pricing_version || pricingRows[0]?.pricing_version || null,
}, null, 2));
