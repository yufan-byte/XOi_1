/** Use advertised input capabilities, never guess from a model's name. */
export interface CapabilityModel {
  type?: string; capabilities?: string[]; mode?: string[];
  referenceLimits?: { images?: number }; paramSchema?: Record<string, any>;
}
export function referenceImageLimit(model: CapabilityModel): number | undefined {
  const value = model.referenceLimits?.images || model.paramSchema?.images?.max_items || model.paramSchema?.images?.maxItems;
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  if (!model.paramSchema?.images && ((model.mode || []).some(mode => /^singleImage$/i.test(mode)) && !(model.mode || []).some(mode => /^multiReference$/i.test(mode)) || ["image", "image_url", "input_reference", "reference_image"].some(key => model.paramSchema?.[key]))) return 1;
  return undefined;
}
function imageInputSchema(model: CapabilityModel) {
  return ["images", "image", "image_url", "input_reference", "reference_image"].some(key => {
    const field = model.paramSchema?.[key];
    return field && typeof field === "object" && field.available !== false && field.enabled !== false;
  });
}
export function canUnderstandImages(model: CapabilityModel) {
  return model.type === "text" && (!!referenceImageLimit(model) || imageInputSchema(model) ||
    (model.capabilities || []).some(c => /vision|视觉|看图|图像理解|多模态|multimodal|image[\s_-]*(?:input|understanding)/i.test(c)));
}
export function canUseReferenceImages(model: CapabilityModel, count = 1) {
  if (model.type !== "image" && model.type !== "video") return false;
  const limit = referenceImageLimit(model);
  if (limit && count > limit) return false;
  if (count > 1 && !limit && !model.paramSchema?.images && !(model.mode || []).some(c => /^multiReference$/i.test(c))) return false;
  return !!limit || imageInputSchema(model) ||
    (model.mode || []).some(c => /^(?:singleImage|multiReference|imageReference|referenceImage|image[-_]to[-_](?:image|video)|i2[iv]|reference)$/i.test(c)) ||
    (model.capabilities || []).some(c => /参考图|图生|图像编辑|image[\s_-]*(?:input|edit|to[\s_-]*(?:image|video))|reference[\s_-]*image/i.test(c));
}
