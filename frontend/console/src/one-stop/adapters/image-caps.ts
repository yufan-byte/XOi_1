/** Capability helper only. No image submission/client is imported into this standalone preview. */
export const CCDAN_MAX_REFS=16;
const MODELS=new Set(["gpt-image-2","gpt-image-2.5-flare","gpt-image-2.5-sunburst"]);
export const isCcdanImage=(model:{id:string;source?:string})=>MODELS.has(model.id)||model.source==="ccdan";
