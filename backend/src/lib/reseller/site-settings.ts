import {z} from "zod";
import {safeBrandImage} from "../../../../shared/siteBrand";
const text=(max:number)=>z.string().trim().max(max);
export const siteSchema=z.object({
  name:text(50).refine(v=>!v||v.length>=2,"站点名称至少 2 个字"),subtitle:text(60),hideSubtitle:z.boolean(),
  logo:z.string().max(2_800_000).refine(v=>!v||!!safeBrandImage(v),"Logo 仅支持本站路径、HTTPS 图片或 PNG/JPG/WebP 数据"),footer:text(200),
  icp:text(100).optional(),police:text(100).optional(),policeCode:text(100).optional(),supportPhone:text(50).optional(),supportEmail:text(254).optional(),company:text(200).optional(),
}).strict();
export const skinSchema=z.enum(["obsidian","industrial","neobrutal","motion","japanese","bento","rgbsplit","memphis","clay","pixel"]);
