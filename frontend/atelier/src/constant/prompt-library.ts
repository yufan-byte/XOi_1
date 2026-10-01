import { assetUrl } from "@/lib/asset-url";

export type PromptLibraryLocale = "zh-CN" | "en-US";
export type PromptCategoryId = "all" | "product" | "portrait" | "cinema" | "space" | "graphic" | "commerce" | "social" | "comic" | "film";

type LocalizedText = Record<PromptLibraryLocale, string>;

export type BrandPrompt = {
    id: string;
    category: Exclude<PromptCategoryId, "all">;
    coverUrl?: string;
    title: LocalizedText;
    summary: LocalizedText;
    prompt: LocalizedText;
};

export const promptCategories: { id: PromptCategoryId; label: LocalizedText }[] = [
    { id: "all", label: { "zh-CN": "全部", "en-US": "All" } },
    { id: "product", label: { "zh-CN": "产品摄影", "en-US": "Product" } },
    { id: "portrait", label: { "zh-CN": "人物肖像", "en-US": "Portrait" } },
    { id: "cinema", label: { "zh-CN": "电影场景", "en-US": "Cinema" } },
    { id: "space", label: { "zh-CN": "建筑空间", "en-US": "Space" } },
    { id: "graphic", label: { "zh-CN": "视觉设计", "en-US": "Graphic" } },
    { id: "commerce", label: { "zh-CN": "电商广告", "en-US": "Commerce" } },
    { id: "social", label: { "zh-CN": "小红书内容", "en-US": "Social Content" } },
    { id: "comic", label: { "zh-CN": "漫剧制作", "en-US": "Comic Drama" } },
    { id: "film", label: { "zh-CN": "影视分镜", "en-US": "Film Storyboard" } },
];

export const brandPrompts: BrandPrompt[] = [
    {
        id: "social-xhs-cover",
        category: "social",
        title: { "zh-CN": "小红书种草封面", "en-US": "XHS Discovery Cover" },
        summary: { "zh-CN": "清晰、真实、适合后期排版的内容封面", "en-US": "Clear, authentic cover for later layout" },
        prompt: { "zh-CN": "小红书内容封面，主题为【主题】。一个明确的主体位于画面中心，配合生活化场景和自然光，构图干净，主体与背景有清晰层次，顶部和左侧预留标题空间，色彩轻松可信，不生成任何文字、Logo、虚假数据或夸张承诺。", "en-US": "A clean social content cover about [topic], with one clear subject in a believable everyday scene, natural light, readable depth, open space at the top and left for later typography, approachable colors, no generated text, logos, fabricated data, or exaggerated claims." },
    },
    {
        id: "social-lifestyle-series",
        category: "social",
        title: { "zh-CN": "生活方式系列配图", "en-US": "Lifestyle Series Set" },
        summary: { "zh-CN": "统一风格的三张内容配图", "en-US": "Three images with a consistent style" },
        prompt: { "zh-CN": "生活方式内容系列配图三张，围绕【主题】分别呈现环境、细节和使用场景；保持同一色彩、光线、镜头和道具逻辑，真实自然，有适度留白，不出现人物敏感信息、品牌 Logo、文字水印或不实效果。", "en-US": "A three-image lifestyle content set about [topic]: environment, detail and use case. Keep color, lighting, lens and prop logic consistent, natural and believable, with moderate negative space and no private information, brand logos, text watermarks or unsupported claims." },
    },
    {
        id: "comic-character-sheet",
        category: "comic",
        title: { "zh-CN": "漫剧角色设定表", "en-US": "Comic Character Sheet" },
        summary: { "zh-CN": "保证连续剧集中角色外观一致", "en-US": "Keep character appearance consistent" },
        prompt: { "zh-CN": "漫剧角色设定表：角色【角色名】、年龄段【年龄段】、身份【身份】。展示正面、四分之三侧面、侧面和背面，补充三种符合剧情的表情；统一脸型、发型、服装、配饰、体型和配色，浅色背景、均匀光线、整齐排版，不生成说明文字或水印。", "en-US": "A comic character sheet for [character], [age range], [role], showing front, three-quarter, profile and back views plus three story-appropriate expressions. Keep face, hair, costume, accessories, body shape and palette consistent, with a light background, even lighting and orderly layout; no labels or watermark." },
    },
    {
        id: "comic-storyboard-grid",
        category: "comic",
        title: { "zh-CN": "漫剧连续分镜", "en-US": "Comic Storyboard Grid" },
        summary: { "zh-CN": "从剧情动作到镜头节奏的九宫格", "en-US": "Nine-panel narrative storyboard" },
        prompt: { "zh-CN": "九宫格漫剧分镜，剧情概要为【剧情】。按起因、行动、冲突、反应和结果组织画面，明确景别、人物动作、视线和场景连续性；角色外观、服装、道具和光线保持一致，画面之间有清晰阅读顺序，不生成对白文字和气泡。", "en-US": "A nine-panel comic storyboard for [story], organized around setup, action, conflict, reaction and result. Make shot scale, gestures, eyelines and continuity clear; keep character appearance, wardrobe, props and lighting consistent, with a readable sequence and no generated dialogue text or speech bubbles." },
    },
    {
        id: "film-commercial-board",
        category: "film",
        title: { "zh-CN": "影视广告分镜", "en-US": "Commercial Film Board" },
        summary: { "zh-CN": "适合产品广告和品牌短片前期策划", "en-US": "For product ads and brand shorts" },
        prompt: { "zh-CN": "影视广告分镜板，产品或主题为【主题】，时长【时长】秒。拆成六个关键镜头，分别说明景别、机位、运动、人物动作、光线、声音和转场；建立清楚的开场、中段展示和结尾记忆点，画面具有电影感但可执行，不生成文字水印。", "en-US": "A six-shot commercial storyboard for [topic], [duration] seconds. Specify shot scale, camera position and movement, action, lighting, sound and transition for each shot; create a clear opening, product/story reveal and memorable ending, cinematic but executable, with no text watermark." },
    },
    {
        id: "film-shot-prompt",
        category: "film",
        title: { "zh-CN": "电影感单镜头", "en-US": "Cinematic Single Shot" },
        summary: { "zh-CN": "把一个创意转成可拍摄的镜头描述", "en-US": "Turn an idea into a shootable shot" },
        prompt: { "zh-CN": "电影感单镜头：地点【地点】、人物【人物】、动作【动作】、情绪【情绪】。使用明确的景别、焦段、机位高度、镜头运动、主光与环境光，说明前中后景和画面节奏，保留真实物理关系和可执行性，不添加用户未提供的品牌事实。", "en-US": "A cinematic single shot at [location] with [character] performing [action] in a [mood] mood. Define shot scale, focal length, camera height, movement, key and ambient light, foreground/midground/background and rhythm, preserving physical realism and adding no unsupported brand facts." },
    },
    {
        id: "product-sculpted-light",
        category: "product",
        coverUrl: assetUrl("/prompt-covers/01.webp"),
        title: { "zh-CN": "雕塑光产品主图", "en-US": "Sculpted Light Hero" },
        summary: { "zh-CN": "适合数码、香氛与高端消费品", "en-US": "For tech, fragrance, and premium goods" },
        prompt: {
            "zh-CN":
                "一张高端商业产品主视觉，主体产品位于画面中央偏下，三分之四视角，使用大面积柔光与一道轮廓硬光塑造清晰边缘，背景为干净的中性摄影棚空间，材质纹理真实可见，克制的高光，精确阴影，85mm 商业摄影镜头，画面简洁、现代、有高级感，保留足够留白，不出现文字与水印。",
            "en-US":
                "Premium commercial product hero, product centered slightly below the frame in a three-quarter view, broad soft key light with a crisp rim light sculpting the silhouette, clean neutral studio environment, realistic material texture, controlled highlights, precise shadow, 85mm commercial photography, modern minimal composition with generous negative space, no text or watermark.",
        },
    },
    {
        id: "product-material-study",
        category: "product",
        coverUrl: assetUrl("/prompt-covers/02.webp"),
        title: { "zh-CN": "材质细节研究", "en-US": "Material Detail Study" },
        summary: { "zh-CN": "突出玻璃、金属、织物或包装细节", "en-US": "Reveal glass, metal, textile, or packaging" },
        prompt: {
            "zh-CN": "微距产品材质研究摄影，聚焦主体最有辨识度的结构与材质交界，玻璃折射、金属拉丝、纸张纤维或织物纹理清晰自然，侧逆光形成精细高光，浅景深但品牌结构保持锐利，真实光学质感，色彩准确，构图克制，超高细节，不出现文字与额外物体。",
            "en-US":
                "Macro product material study focused on the most distinctive structural junction, natural glass refraction, brushed metal, paper fiber or textile texture, delicate side backlight, shallow depth of field while the signature structure remains sharp, authentic optical rendering, accurate color, restrained composition, ultra fine detail, no text or extra objects.",
        },
    },
    {
        id: "portrait-editorial-window",
        category: "portrait",
        coverUrl: assetUrl("/prompt-covers/03.webp"),
        title: { "zh-CN": "窗边编辑肖像", "en-US": "Window Editorial Portrait" },
        summary: { "zh-CN": "自然、克制、带杂志质感", "en-US": "Natural, restrained, and editorial" },
        prompt: {
            "zh-CN": "编辑杂志风人物肖像，人物靠近大面积窗户，柔和自然光从侧前方进入，皮肤纹理真实，神态平静且有故事感，服装剪裁简洁，背景空间低饱和并轻微虚化，50mm 镜头，眼睛精准对焦，色彩层次细腻，保留暗部细节，不做过度磨皮，不出现文字与水印。",
            "en-US":
                "Editorial magazine portrait near a large window, soft natural light entering from the front side, authentic skin texture, calm expression with narrative depth, clean tailored wardrobe, subdued softly blurred interior, 50mm lens with precise eye focus, nuanced color separation and retained shadow detail, no excessive retouching, no text or watermark.",
        },
    },
    {
        id: "portrait-character-sheet",
        category: "portrait",
        coverUrl: assetUrl("/prompt-covers/04.webp"),
        title: { "zh-CN": "角色一致性设定", "en-US": "Character Consistency Sheet" },
        summary: { "zh-CN": "用于后续分镜与系列画面", "en-US": "For storyboards and image sequences" },
        prompt: {
            "zh-CN": "同一角色的一致性设定图，干净浅灰背景，包含正面、四分之三侧面、侧面和背面四个完整视角，另附三个清晰表情近景；保持脸型、发型、服装、配饰、体型和颜色完全一致，均匀摄影棚光线，比例准确，排版整齐，角色之间不重叠，不出现说明文字与水印。",
            "en-US":
                "Consistency sheet for one character on a clean light-gray background, full-body front, three-quarter, profile and back views plus three clear facial-expression closeups; identical face, hair, wardrobe, accessories, proportions and colors across every view, even studio lighting, accurate anatomy, orderly spacing, no overlaps, labels, or watermark.",
        },
    },
    {
        id: "cinema-rain-night",
        category: "cinema",
        coverUrl: assetUrl("/prompt-covers/05.webp"),
        title: { "zh-CN": "雨夜叙事镜头", "en-US": "Rainy Night Narrative" },
        summary: { "zh-CN": "带前中后景的电影宽画幅", "en-US": "Cinematic widescreen with layered depth" },
        prompt: {
            "zh-CN": "电影宽画幅叙事镜头，雨夜街道，前景有被雨水打湿的玻璃与虚化反光，中景人物停在路灯边，远景城市灯光延伸出空间层次，冷色环境光与少量暖色实景光形成对比，雨滴和薄雾自然，35mm 电影镜头，低机位，细腻胶片颗粒，真实曝光，不出现文字与水印。",
            "en-US":
                "Cinematic widescreen narrative shot on a rainy street at night, wet glass and defocused reflections in the foreground, a figure paused beside a streetlight in the midground, distant city lights creating deep spatial layers, cool ambient light contrasted with sparse warm practicals, natural rain and light mist, low-angle 35mm cinema lens, subtle film grain, realistic exposure, no text or watermark.",
        },
    },
    {
        id: "cinema-daylight-story",
        category: "cinema",
        coverUrl: assetUrl("/prompt-covers/06.webp"),
        title: { "zh-CN": "自然光故事场景", "en-US": "Daylight Story Scene" },
        summary: { "zh-CN": "适合生活化剧情与广告分镜", "en-US": "For grounded stories and ad boards" },
        prompt: {
            "zh-CN": "生活化电影场景，清晨室内，人物正在完成一个明确但自然的动作，阳光经过窗帘形成柔和光带，环境中保留真实生活痕迹，前景遮挡建立观察视角，中景承载人物动作，背景提供故事线索，色彩温和但不过度复古，28mm 镜头，真实布光和电影级构图。",
            "en-US":
                "Grounded cinematic scene in a morning interior, subject performing one clear natural action, sunlight filtered through curtains into soft bands, authentic traces of daily life, foreground occlusion creating an observational viewpoint, action in the midground and story clues in the background, warm restrained color without heavy nostalgia, 28mm lens, realistic lighting and cinematic composition.",
        },
    },
    {
        id: "space-quiet-interior",
        category: "space",
        coverUrl: assetUrl("/prompt-covers/07.webp"),
        title: { "zh-CN": "静谧室内空间", "en-US": "Quiet Interior Space" },
        summary: { "zh-CN": "清晰表达结构、材质和自然光", "en-US": "Clear structure, materials, and daylight" },
        prompt: {
            "zh-CN": "当代室内建筑摄影，空间结构清晰，天然石材、木材与金属的材质关系准确，午后自然光沿墙面移动形成柔和明暗节奏，镜头高度接近人眼，垂直线严格校正，24mm 移轴镜头，陈设克制且具有真实使用感，色温自然，细节完整，不出现人物与文字。",
            "en-US":
                "Contemporary interior architecture photography with legible spatial structure and accurate relationships between natural stone, wood and metal, afternoon daylight moving softly across walls, eye-level camera, strictly corrected verticals, 24mm tilt-shift lens, restrained furnishings with believable signs of use, natural white balance, complete detail, no people or text.",
        },
    },
    {
        id: "space-future-pavilion",
        category: "space",
        coverUrl: assetUrl("/prompt-covers/08.webp"),
        title: { "zh-CN": "未来公共建筑", "en-US": "Future Civic Pavilion" },
        summary: { "zh-CN": "强调尺度、结构与人在空间中的关系", "en-US": "Scale, structure, and human presence" },
        prompt: {
            "zh-CN": "未来感公共建筑外观，结构逻辑可建造，清晰的大跨度构件与半透明表皮，傍晚蓝调时刻，室内暖光透出，少量人物作为尺度参照，广场有轻微雨后反射，广角但不夸张变形，建筑可视化与真实摄影之间的质感，细节精确，天空自然。",
            "en-US":
                "Future-facing civic pavilion with believable construction logic, clear long-span structure and translucent skin, blue hour with warm interior light glowing through, sparse people for scale, subtle post-rain reflections on the plaza, wide angle without exaggerated distortion, finish between architectural visualization and real photography, precise detail and natural sky.",
        },
    },
    {
        id: "graphic-kinetic-poster",
        category: "graphic",
        coverUrl: assetUrl("/prompt-covers/09.webp"),
        title: { "zh-CN": "动态感图形海报", "en-US": "Kinetic Graphic Poster" },
        summary: { "zh-CN": "高对比、强节奏的主视觉底稿", "en-US": "High-contrast key visual foundation" },
        prompt: {
            "zh-CN": "竖版图形设计海报底稿，使用明确网格组织大块几何形与高速运动留下的方向性残影，黑白为结构色，加入珊瑚橙、湖蓝和柠檬黄作为少量高对比色，视觉重心清晰，留出标题与信息区域但不要生成任何文字，边缘锐利，印刷质感细腻，构图大胆且秩序严谨。",
            "en-US":
                "Vertical graphic poster foundation organized on a clear grid, large geometric forms with directional traces of fast motion, black and white as structural colors with restrained coral, lake blue and lemon accents, strong focal hierarchy, reserved zones for title and information but generate no text, crisp edges, refined print texture, bold composition with rigorous order.",
        },
    },
    {
        id: "graphic-brand-system",
        category: "graphic",
        coverUrl: assetUrl("/prompt-covers/10.webp"),
        title: { "zh-CN": "品牌视觉系统板", "en-US": "Brand Visual System Board" },
        summary: { "zh-CN": "探索图形、材质和配色关系", "en-US": "Explore form, texture, and color relations" },
        prompt: {
            "zh-CN": "品牌视觉系统探索板，以一个核心几何母题发展出六种不同尺度和裁切方式，搭配两种纸张纹理、一个金属表面与四组协调色块，布局像专业设计工作室的提案板，间距精确，层级清晰，整体统一但变化丰富，不生成品牌名称、说明文字、样机水印和虚假数据。",
            "en-US":
                "Brand visual-system exploration board developing one core geometric motif across six scales and crops, paired with two paper textures, one metal surface and four coordinated color groups, arranged like a professional design-studio proposal, precise spacing and hierarchy, cohesive with meaningful variation, no brand names, labels, mockup watermarks, or fabricated data.",
        },
    },
    {
        id: "commerce-floating-product",
        category: "commerce",
        coverUrl: assetUrl("/prompt-covers/11.webp"),
        title: { "zh-CN": "悬浮电商主视觉", "en-US": "Floating Commerce Hero" },
        summary: { "zh-CN": "适合大促、上新和社交媒体封面", "en-US": "For launches, campaigns, and social covers" },
        prompt: {
            "zh-CN":
                "电商活动主视觉，主体产品以可信的轻微悬浮姿态占据画面中心，周围仅保留三到五个与产品成分或功能相关的物体，动势从左下指向右上，珊瑚橙、湖蓝与明黄形成明快但受控的配色，阴影与反射符合物理规律，画面适合后期排版，预留顶部和右侧文案空间，不生成文字。",
            "en-US":
                "E-commerce campaign key visual with the product in a believable subtle floating pose at center, surrounded by only three to five objects tied to its ingredients or function, motion flowing from lower left to upper right, bright but controlled coral, lake blue and yellow palette, physically coherent shadows and reflections, composed for later typography with open space at top and right, generate no text.",
        },
    },
    {
        id: "commerce-clean-catalog",
        category: "commerce",
        coverUrl: assetUrl("/prompt-covers/12.webp"),
        title: { "zh-CN": "纯净目录组合", "en-US": "Clean Catalog Set" },
        summary: { "zh-CN": "用于同系列多产品统一展示", "en-US": "Consistent presentation for a product family" },
        prompt: {
            "zh-CN": "同系列三件产品的目录摄影，产品按高低错落但不遮挡关键信息，镜头角度、光源方向与透视关系完全一致，柔和无缝背景，使用一个低饱和主色与两个小面积对比色，真实接触阴影，包装边缘清晰，适合电商详情页头图，画面整洁，不增加道具、文字与标识。",
            "en-US":
                "Catalog photograph of three products from one family, varied heights without obscuring key features, fully consistent camera angle, light direction and perspective, soft seamless background, one subdued primary color with two small contrasting accents, realistic contact shadows, crisp packaging edges, suitable for an e-commerce detail-page header, clean frame with no props, text, or added marks.",
        },
    },
];

export function getPromptLocale(locale?: string): PromptLibraryLocale {
    return locale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}
