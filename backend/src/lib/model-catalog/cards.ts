/** Public capability metadata only. Never persist upstream costs, vendors or credentials. */
export type ModelMetadata = {
  name?: string; type?: string; provider?: string; description?: string; available?: boolean;
  /** Upstream merchandising only. XOi's local presentation table always wins. */
  featured?: boolean; recommendationRank?: number;
  capabilities?: string[]; defaults?: Record<string, any>; enums?: Record<string, any[]>;
  paramSchema?: Record<string, any>; referenceLimits?: { images: number; videos: number; audios: number };
};
export type ModelMetadataMap = Record<string, ModelMetadata>;

export function metadataFromCards(raw: unknown, allowed: Set<string>): ModelMetadataMap {
  const cards = (raw as { models?: unknown })?.models;
  if (!Array.isArray(cards)) return {};
  const out: ModelMetadataMap = {};
  for (const card of cards) {
    if (!card || typeof card !== "object") continue;
    const ids = [card.id, card.public_id].filter((id): id is string => typeof id === "string" && allowed.has(id));
    if (!ids.length) continue;
    const paramSchema: Record<string, any> = {}, defaults: Record<string, any> = {}, enums: Record<string, any[]> = {};
    for (const [key, rawField] of Object.entries(card.param_schema || {})) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || !rawField || typeof rawField !== "object") continue;
      const field = rawField as Record<string, any>, safe: Record<string, any> = {};
      for (const name of ["type", "description", "default", "min", "max", "required", "max_items", "authoritative"]) {
        if (["string", "number", "boolean"].includes(typeof field[name])) safe[name] = field[name];
      }
      if (field.label && typeof field.label.zh === "string") safe.label = { zh: field.label.zh };
      const values = Array.isArray(field.enum) ? field.enum : Array.isArray(field.options) ? field.options.map((v: any) => v?.value) : [];
      const clean = values.filter((v: any) => typeof v === "string" || typeof v === "number" || typeof v === "boolean").slice(0, 100);
      if (clean.length) { safe.enum = clean; enums[key] = clean; }
      if (safe.default !== undefined) defaults[key] = safe.default;
      paramSchema[key] = safe;
    }
    const referenceLimits = Object.fromEntries(["images", "videos", "audios"].map(key => [key, Math.min(100, Math.max(0, Number(paramSchema[key]?.max_items) || 0))])) as NonNullable<ModelMetadata["referenceLimits"]>;
    const capabilities: string[] = Array.isArray(card.capabilities) ? (card.capabilities as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 30) : [];
    if (referenceLimits.images > 0) capabilities.push("参考图");
    if (referenceLimits.videos > 0) capabilities.push("参考视频");
    if (referenceLimits.audios > 0) capabilities.push("参考音频");
    const meta: ModelMetadata = {
      name: typeof card.display_name_zh === "string" ? card.display_name_zh : undefined,
      type: card.category === "chat" ? "text" : ["text", "image", "video", "audio"].includes(card.category) ? card.category : undefined,
      provider: typeof card.provider === "string" ? card.provider : undefined,
      description: typeof card.description_zh === "string" ? card.description_zh : undefined,
      available: typeof card.available === "boolean" ? card.available : undefined,
      featured: card.featured === true || (Array.isArray(card.tags) && card.tags.includes("primary")) || Number.isFinite(Number(card.pin)),
      recommendationRank: Number.isFinite(Number(card.pin)) ? Math.max(1, 50 - Number(card.pin)) : card.featured === true || (Array.isArray(card.tags) && card.tags.includes("primary")) ? 35 : undefined,
      capabilities: [...new Set(capabilities)], defaults, enums, paramSchema, referenceLimits,
    };
    for (const id of ids) out[id] = meta;
  }
  return out;
}
