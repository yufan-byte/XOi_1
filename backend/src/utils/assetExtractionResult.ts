import { z } from "zod";

const name = z.string().trim().min(1).max(200);
const scriptIds = z.array(z.number().int().positive()).min(1).max(100);
export const NewExtractedAsset = z.object({ name, desc: z.string().trim().min(1).max(20000), type: z.enum(["role", "tool", "scene"]), scriptIds });
export const ExistingExtractedAsset = z.object({ name, scriptIds });
export const ExtractionToolResult = z.object({ newAssets: z.array(NewExtractedAsset).max(200), existingAssetRefs: z.array(ExistingExtractedAsset).max(200) });

/** Only an unambiguous single-script batch may repair a missing association. */
export function normalizeAssetExtraction(value: unknown, batchIds: number[]) {
  const allowed = new Set(batchIds);
  if (!allowed.size || batchIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error("素材提取批次无效");
  const raw = value as any;
  const repair = (items: unknown) => Array.isArray(items) ? items.map(item => ({ ...item,
    scriptIds: item?.scriptIds === undefined && allowed.size === 1 ? [...allowed] : item?.scriptIds,
  })) : items;
  const parsed = ExtractionToolResult.safeParse({ newAssets: repair(raw?.newAssets), existingAssetRefs: repair(raw?.existingAssetRefs) });
  if (!parsed.success) throw new Error("模型返回的素材结构不完整，请检查角色／场景／道具及其剧本关联；本批未写入");
  for (const asset of [...parsed.data.newAssets, ...parsed.data.existingAssetRefs]) {
    if (asset.scriptIds.some(id => !allowed.has(id))) throw new Error("模型返回了不属于本批剧本的素材关联，本批未写入");
    asset.scriptIds = [...new Set(asset.scriptIds)];
  }
  return parsed.data;
}
