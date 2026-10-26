export function productionBillingBlockers(agents: { key: string; modelName?: string | null }[], channels: { status: number | string; models?: string | null }[]) {
  const blockers: string[] = [];
  if (!agents.length) blockers.push("生产默认 Agent 尚未配置");
  for (const agent of agents) {
    const model = String(agent.modelName || "");
    if (!model.startsWith("newapi:") || /^newapi:agnes(?:-|$)/i.test(model)) blockers.push(`${agent.key} 仍为测试或非 NewAPI 模型`);
    else if (!channels.some(channel => Number(channel.status) === 1 && String(channel.models || "").split(",").includes(model.slice(7)))) blockers.push(`${agent.key} 没有可用的生产上游`);
  }
  // Agnes may remain enabled for administrator-only zero-cost smoke tests. Runtime
  // catalog and gateway admission enforce that ordinary users cannot see or call it.
  return blockers;
}

/** A prior successful snapshot cannot hide a failed or stale latest refresh. */
export function productionPricingBlockers(record: { synced_at?: string | Date; snapshot?: { status?: string; lastAttemptStatus?: string; rows?: unknown[] } } | undefined, now = Date.now()) {
  if (!record || !Array.isArray(record.snapshot?.rows) || !record.snapshot.rows.length) return ["造物价格尚未完成同步"];
  if ((record.snapshot.lastAttemptStatus || record.snapshot.status) !== "synced") return ["造物最近一次价格同步失败"];
  const synced = new Date(record.synced_at || "").getTime();
  if (!Number.isFinite(synced) || synced > now + 60_000 || now - synced > 60 * 60_000) return ["造物价格超过一小时未成功刷新"];
  return [];
}
