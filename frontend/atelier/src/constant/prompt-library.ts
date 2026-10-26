import { assetUrl } from "@/lib/asset-url";

export type PromptLibraryLocale = "zh-CN" | "en-US";
export type PromptCategoryId = "all" | "product" | "portrait" | "cinema" | "space" | "graphic" | "commerce" | "social" | "comic" | "film" | "motion";

type LocalizedText = Record<PromptLibraryLocale, string>;

export type BrandPrompt = {
    id: string;
    category: Exclude<PromptCategoryId, "all">;
    /** 素材类型：image=生图提示词，video=生视频提示词（画布弹窗的「图片/视频」标签就来自它） */
    media?: "image" | "video";
    /** 追加标签（弹窗「标签」行，配合 media 一起筛） */
    tags?: string[];
    coverUrl?: string;
    title: LocalizedText;
    summary: LocalizedText;
    prompt: LocalizedText;
};

export const promptCategories: { id: PromptCategoryId; label: LocalizedText }[] = [
    {
        "id": "all",
        "label": {
            "zh-CN": "全部",
            "en-US": "All"
        }
    },
    {
        "id": "product",
        "label": {
            "zh-CN": "产品主图",
            "en-US": "Product"
        }
    },
    {
        "id": "portrait",
        "label": {
            "zh-CN": "人物设定",
            "en-US": "Character"
        }
    },
    {
        "id": "cinema",
        "label": {
            "zh-CN": "场景设定",
            "en-US": "Scene"
        }
    },
    {
        "id": "film",
        "label": {
            "zh-CN": "故事板",
            "en-US": "Storyboard"
        }
    },
    {
        "id": "motion",
        "label": {
            "zh-CN": "视频运镜",
            "en-US": "Video"
        }
    }
];

/** Six editable starting points; no model/channel-specific presets or automatic generation. */
export const brandPrompts: BrandPrompt[] = [
    {
        "id": "product-sculpted-light",
        "category": "product",
        "media": "image",
        "coverUrl": assetUrl("/prompt-covers/01.webp"),
        "title": {
            "zh-CN": "产品主图",
            "en-US": "Product Hero"
        },
        "summary": {
            "zh-CN": "先填产品与卖点，再补充真实参考",
            "en-US": "Define the product and add real references"
        },
        "prompt": {
            "zh-CN": "为【产品】制作一张主视觉。保留参考图中真实的外形、结构、颜色与包装，突出【已确认卖点或细节】；置于【场景或背景】，采用【构图】和【光线】，材质与接触阴影自然。为后期标题预留【位置】，不添加未提供的品牌、功效、价格或水印。",
            "en-US": "Create one hero image of [product]. Preserve its referenced structure, color and packaging; highlight [confirmed feature]. Use [setting], [composition] and [lighting], realistic materials and contact shadows. Leave [area] for later typography; add no invented brand claims, price or watermark."
        }
    },
    {
        "id": "portrait-character-sheet",
        "category": "portrait",
        "media": "image",
        "coverUrl": assetUrl("/prompt-covers/comic.svg"),
        "title": {
            "zh-CN": "人物设定",
            "en-US": "Character Reference"
        },
        "summary": {
            "zh-CN": "固定外观与服装，方便后续镜头复用",
            "en-US": "Lock appearance for later shots"
        },
        "prompt": {
            "zh-CN": "角色【姓名或身份】，年龄段【年龄段】，外形特征【特征】，服装配饰【服装】。以【风格】呈现，背景简洁、光线均匀；按需展示【正面/侧面/背面或指定视图】，各视图保持同一张脸、发型、体型与服装。已有参考时以参考为准，不额外生成文字或水印。",
            "en-US": "Character [name or role], [age range], [appearance], wearing [costume]. Render in [style] against a simple evenly lit background. Show only [requested views], keeping the face, hair, proportions and clothing consistent with supplied references. No labels or watermark."
        }
    },
    {
        "id": "cinema-daylight-story",
        "category": "cinema",
        "media": "image",
        "coverUrl": assetUrl("/prompt-covers/film.svg"),
        "title": {
            "zh-CN": "场景设定",
            "en-US": "Scene Reference"
        },
        "summary": {
            "zh-CN": "明确空间与道具，保持镜头间连续",
            "en-US": "Establish space, props and continuity"
        },
        "prompt": {
            "zh-CN": "场景【地点与时间】，氛围【氛围】。明确前景【内容】、主体区域【内容】和背景【内容】；固定门窗、通道、桌椅与主要道具的位置，保留合理的人物活动空间。使用【光源与色调】、【景别与机位】，空间比例、透视和材质可信；不加入无关角色、文字或水印。",
            "en-US": "Establish [location and time] with [mood]. Define [foreground], [main area] and [background]; keep doors, paths, furniture and key props spatially consistent, with room for actors to move. Use [lighting and palette] and [framing], believable scale and perspective; no unrelated characters, text or watermark."
        }
    },
    {
        "id": "film-commercial-board",
        "category": "film",
        "media": "image",
        "coverUrl": assetUrl("/prompt-covers/film.svg"),
        "title": {
            "zh-CN": "品牌故事板",
            "en-US": "Brand Storyboard"
        },
        "summary": {
            "zh-CN": "按已确认镜头生成一张清晰分镜板",
            "en-US": "One storyboard from approved shots"
        },
        "prompt": {
            "zh-CN": "为【品牌主题/剧情】制作一张【镜头数】格的分镜板。严格依照【已确认分镜内容】按顺序呈现，每格只表达一个主要画面节拍；保持人物、产品、服装、道具、场景布局与光线连续。用景别与机位变化表达【情绪或叙事变化】，各格边界清晰，不生成文字说明、对白或水印。",
            "en-US": "Create one [panel count]-panel storyboard for [brand or story] following [approved shot list] in order. Show one main beat per panel, keeping characters, product, clothing, props, layout and light consistent. Vary framing to express [narrative or emotion], with clear panel boundaries and no labels, dialogue or watermark."
        }
    },
    {
        "id": "motion-t2v-base",
        "category": "motion",
        "media": "video",
        "coverUrl": assetUrl("/prompt-covers/motion.svg"),
        "title": {
            "zh-CN": "单镜头运镜",
            "en-US": "Single Shot"
        },
        "summary": {
            "zh-CN": "一个主要动作，一种清楚的运镜",
            "en-US": "One action and one clear camera move"
        },
        "prompt": {
            "zh-CN": "【场景与主体】。主体从【开始状态】连续完成【主要动作】，结束于【结束状态】；摄影机从【起始景别与位置】进行【运动方向、速度与路径】，最终停在【结束构图】。保持人物/产品外观、空间方向与光线一致，动作和镜头运动符合物理关系。声音为【对白/环境音或无声】，不出现未要求的字幕、水印或额外切镜。",
            "en-US": "[Setting and subject]. The subject moves continuously from [start state] through [main action] to [end state]. The camera moves from [initial position and framing] along [direction, pace and path], ending on [final composition]. Preserve appearance, spatial orientation and lighting, with believable motion. Sound: [dialogue, ambience or silence]. No unwanted captions, watermark or extra cuts."
        }
    },
    {
        "id": "motion-i2v-first-frame",
        "category": "motion",
        "media": "video",
        "coverUrl": assetUrl("/prompt-covers/motion.svg"),
        "title": {
            "zh-CN": "参考图转视频",
            "en-US": "Animate a Reference"
        },
        "summary": {
            "zh-CN": "保留参考外观，重点描述变化",
            "en-US": "Preserve the reference and describe motion"
        },
        "prompt": {
            "zh-CN": "以所选参考图为【起始画面/主体外观/构图】依据，保留【必须保持的外观与空间关系】。画面中【主体】完成【动作及节奏】，摄影机【运动方式】；从参考中的状态自然过渡到【结束画面】，不突然换脸、换衣、改变产品结构或增加无关物体。声音为【声音要求】。如另有预演视频，只把它用作【动作或运镜】参考。",
            "en-US": "Use the selected image for [first frame, appearance or composition], preserving [fixed appearance and spatial relationships]. [Subject] performs [action and pace] as the camera [moves]. Transition naturally to [ending frame], without changing identity, costume, product structure or adding unrelated objects. Sound: [requirements]. Use any supplied previz video only for [motion or camera guidance]."
        }
    },
];

export function getPromptLocale(locale?: string): PromptLibraryLocale {
    return locale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}
