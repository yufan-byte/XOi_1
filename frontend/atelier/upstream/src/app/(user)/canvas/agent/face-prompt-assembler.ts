/**
 * 人物提示词「表单 + 装配器」（方案A）。
 *
 * 设计动机：弱模型（glm-flash 档）对「输出 900 字九段长文」的结构化服从性差，
 * 必然压缩成短段落。本模块把「格式」从模型能力问题变成代码确定性问题：
 * 模型只填约 200 字的六区表单（FacePromptSpec），由 assembleFacePrompt 确定性
 * 拼装成与手工版同构的九段完整提示词（含条件化负面词）。
 *
 * 模板与 backend/data/skills/character-face-design/references/templates.md、
 * 画布人物六区控制台（prompt-studio.ts）同源，可互相校准。
 */

export type FacePromptSpec = {
    subject: string;
    age: string;
    vibe: string;
    framing: string;
    faceShape: string;
    proportions: string;
    memoryFeature: string;
    assistFeatures: string;
    expression: string;
    hairMakeup: string;
    wardrobe: string;
    lighting?: string;
    background?: string;
    extraNotes?: string;
    noSmile?: boolean;
    youthful?: boolean;
};

const REQUIRED_FIELDS: Array<keyof FacePromptSpec> = [
    "subject",
    "age",
    "vibe",
    "faceShape",
    "proportions",
    "memoryFeature",
    "assistFeatures",
    "expression",
    "hairMakeup",
    "wardrobe",
];

/** 工具 schema 里的 faceSpec 参数定义（给模型看的表单说明）。 */
export const FACE_SPEC_TOOL_PROPERTY = {
    type: "object",
    description:
        "人物/角色/肖像/定妆照生成专用表单：填本表单后系统会自动装配成完整九段结构化提示词（约900字，含三庭五眼比例、五官主次、光线与负面约束），比手写长文稳定得多。人物类生成必须优先使用本表单；prompt 字段可留空或只写补充要求。",
    properties: {
        subject: { type: "string", description: "角色身份，如：原创中国古典女性角色" },
        age: { type: "string", description: "年龄感，如：22岁左右" },
        vibe: { type: "string", description: "气质关键词，拆成视觉化短语（禁用好看/精致/高级等空泛词）" },
        framing: { type: "string", description: "构图景别与拍摄范围，如：半身胸像，只拍摄头部到腰部以上" },
        faceShape: { type: "string", description: "脸型、轮廓、颧骨、下颌线、下巴与骨相气质（下巴过尖易网红化，必须避免）" },
        proportions: { type: "string", description: "三庭五眼比例：中庭、下庭、眼距、眉眼距、鼻梁、面颊，并绑定比例带来的气质" },
        memoryFeature: { type: "string", description: "唯一的强项记忆点五官及完整描述（杏眼/剑眉/唇形等）" },
        assistFeatures: { type: "string", description: "两个辅助五官及描述（一个强项两个辅助，禁止全写强项）" },
        expression: { type: "string", description: "表情、眼神、嘴角状态，服务角色气质" },
        hairMakeup: { type: "string", description: "发型发色、发饰、妆容（底妆清透保留真实皮肤纹理、眼妆、唇色）" },
        wardrobe: { type: "string", description: "服装类型、颜色饱和度、面料质感，不抢面部重点" },
        lighting: { type: "string", description: "光线设计；留空默认明亮影棚光+右颊轻微伦勃朗三角阴影" },
        background: { type: "string", description: "背景设计；留空默认中性灰影棚背景" },
        extraNotes: { type: "string", description: "额外正向要求（可选）" },
        noSmile: { type: "boolean", description: "角色不微笑时设 true，自动追加微笑类负面词" },
        youthful: { type: "boolean", description: "亲和少女型角色设 true，自动追加幼态类负面词" },
    },
    required: ["subject", "age", "vibe", "faceShape", "proportions", "memoryFeature", "assistFeatures", "expression", "hairMakeup", "wardrobe"],
    additionalProperties: false,
} as const;

const BASE_NEGATIVES =
    "明星脸，网红脸，撞脸，真实人物相似脸，影视角色相似脸，过度磨皮，塑料皮肤，油腻高光，AI假脸，五官过度精修，锥子脸，蛇精脸，眼睛过大，鼻子过尖，妆容廉价，影楼风，二次元，卡通，低清晰度，脸部变形，表情夸张，多人同框，背景杂乱";

function clean(value: unknown): string {
    return typeof value === "string" ? value.trim().replace(/[。；;]+$/u, "") : "";
}

/** 解析并校验模型提交的表单；缺字段时抛出带字段清单的错误，供工具层回喂模型重试。 */
export function parseFacePromptSpec(input: unknown): FacePromptSpec {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("faceSpec 必须是对象表单；请按工具说明逐字段填写");
    }
    const raw = input as Record<string, unknown>;
    const spec: FacePromptSpec = {
        subject: clean(raw.subject),
        age: clean(raw.age),
        vibe: clean(raw.vibe),
        framing: clean(raw.framing) || "半身胸像，只拍摄头部到腰部以上",
        faceShape: clean(raw.faceShape),
        proportions: clean(raw.proportions),
        memoryFeature: clean(raw.memoryFeature),
        assistFeatures: clean(raw.assistFeatures),
        expression: clean(raw.expression),
        hairMakeup: clean(raw.hairMakeup),
        wardrobe: clean(raw.wardrobe),
        lighting: clean(raw.lighting) || "明亮柔和的影棚主光从左前方偏上方照射，整体曝光干净通透，右侧脸颊保留一层轻微伦勃朗三角阴影，阴影浅、干净、有层次，弱补光保留暗部细节",
        background: clean(raw.background) || "中性灰影棚背景，干净无杂物，整体明亮、高级、克制",
        extraNotes: clean(raw.extraNotes),
        noSmile: raw.noSmile === true,
        youthful: raw.youthful === true,
    };
    const missing = REQUIRED_FIELDS.filter(key => !spec[key]);
    if (missing.length) {
        throw new Error(`faceSpec 表单缺少必填字段：${missing.join("、")}；请补全后重新调用 generate_image`);
    }
    return spec;
}

/** 确定性装配九段完整提示词；extraPrompt 为模型附带的手写补充（追加为额外要求段）。 */
export function assembleFacePrompt(spec: FacePromptSpec, extraPrompt?: string): string {
    const bustShot = /胸像|特写/.test(spec.framing);
    const noSmile = spec.noSmile || /不微笑|不露齿|严肃|清冷|冷艳/.test(spec.expression);
    const youthful = spec.youthful || /少女|少女感|亲和|甜美|娇俏/.test(spec.vibe);

    const negatives: string[] = [BASE_NEGATIVES];
    if (bustShot) negatives.push("全身照，七分身，半身过远，腰部入镜，腿部入镜，身体比例展示过多");
    if (noSmile) negatives.push("微笑，露齿笑，甜笑，夸张笑容，过度甜美，刻意卖萌");
    if (youthful) negatives.push("幼态擦边，未成年感，大眼娃娃脸，鼻梁过高，下巴过尖");

    const paragraphs = [
        `生成一张${spec.subject}${spec.framing.split("，")[0]}定妆照，${spec.background}，高级商业摄影质感，真人写实风格，构图为${spec.framing}，画面重点集中在面部比例、五官结构和角色气质表达，人物面部占画面主要面积，肩颈自然入镜。`,
        `角色设定为${spec.age}左右的${spec.subject}，气质${spec.vibe}。不参考任何真实人物、明星、网红或影视角色。`,
        `脸型为${spec.faceShape}。`,
        `面部比例为${spec.proportions}。`,
        `五官组合遵循一个强项两个辅助的逻辑。主要记忆点是${spec.memoryFeature}；辅助五官：${spec.assistFeatures}。五官整体自然协调，有辨识度但不过度夸张。`,
        `表情为${spec.expression}，不要夸张表情。`,
        `发型与妆容：${spec.hairMakeup}。服装为${spec.wardrobe}，面料真实有细腻织物质感，整体造型服务角色气质，不抢面部重点。`,
        `光线为${spec.lighting}。背景为${spec.background}，干净无杂物，整体像影视角色前期定妆照，强调角色面部比例、五官主次、气质和造型统一。`,
        `画面要求：真实皮肤纹理，毛孔自然，发丝清晰，五官自然协调，面部结构稳定，高级摄影，原创角色，有辨识度，不参考任何真实人物、明星、网红或影视角色。负面约束：${negatives.join("；")}。`,
    ];
    if (spec.extraNotes) paragraphs.push(`额外要求：${spec.extraNotes}。`);
    const extra = (extraPrompt || "").trim();
    if (extra) paragraphs.push(`补充要求：${extra}。`);
    paragraphs.push("〔官方 · 捏脸九段装配，结构化模板已锁定〕");
    return paragraphs.join("\n\n");
}
