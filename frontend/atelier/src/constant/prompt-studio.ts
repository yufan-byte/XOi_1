export type PromptStudioValues = Record<string, string>;

export type PromptStudioField = {
    key: string;
    label: string;
    placeholder: string;
    options?: string[];
    wide?: boolean;
};

export type PromptStudioSection = {
    id: string;
    title: string;
    shortTitle: string;
    description: string;
    fields: PromptStudioField[];
};

export const CHARACTER_DEFAULTS: PromptStudioValues = {
    identity: "原创短剧女主",
    age: "25岁左右",
    gender: "女性",
    temperament: "成熟、清冷、安静、克制，有距离感但不冷漠",
    shot: "胸像特写定妆照",
    style: "真人写实、高级商业摄影",
    faceShape: "偏窄鹅蛋脸",
    contour: "脸部轮廓干净，骨相利落自然",
    cheekbones: "颧骨有轻微存在感，不过分外扩",
    jawline: "下颌线清晰但不锋利",
    chin: "下巴略收，比例自然，不尖削",
    midfaceRatio: "轻微长中庭，呈现成熟、冷静的气质",
    lowerFaceRatio: "下庭比例自然",
    eyeSpacing: "眼距略窄，眼神集中而克制",
    browEyeSpacing: "眉眼距离适中",
    cheeks: "面中干净，面颊饱满度自然",
    featureFocus: "眼睛是唯一主要记忆点，鼻子和嘴唇作为辅助，不抢戏",
    eyes: "眼型偏细长，眼尾轻微上扬，眼神安静、沉稳、有故事感",
    nose: "鼻梁自然挺直，鼻头精致但不尖锐，不过度高挺",
    lips: "唇形干净，嘴角自然放松，不做夸张表情",
    brows: "眉毛略平直，毛流自然，边缘不过度锐利",
    expression: "整体表情自然、安静、放松，不微笑，不露齿",
    gaze: "镜头平视，眼神明亮但克制，不刻意卖甜",
    hairstyle: "深棕色长发，轻微层次，发丝自然垂落",
    hairState: "有空气感和少量自然碎发，不油腻，不像假发",
    makeup: "低饱和自然妆面，底妆清透，保留真实皮肤纹理",
    lipColor: "柔和裸色，低饱和",
    wardrobe: "简洁深色针织上衣，只露出肩颈与胸口上方",
    fabric: "面料真实，有细腻织物纹理，造型服务角色气质",
    accessories: "无夸张配饰，不让配饰抢走面部重点",
    palette: "深棕、裸色与中性灰，整体低饱和",
    background: "浅灰到中性灰影棚背景，干净无杂物",
    lighting: "整体曝光明亮通透，左前上方柔和主光，右侧脸颊保留轻微伦勃朗三角阴影，弱补光保留暗部细节",
    camera: "平视机位，85mm 人像镜头，面部占画面主要面积",
    depth: "浅景深，人物与背景有轻微分离",
    quality: "真实皮肤纹理，毛孔自然，发丝清晰，五官协调，面部结构稳定",
    original: "yes",
    noSmile: "yes",
    brightStudio: "yes",
    stableIdentity: "yes",
    negative: "明星脸，网红脸，撞脸，真实人物相似脸，过度磨皮，塑料皮肤，油腻高光，AI 假脸，锥子脸，眼睛过大，鼻子过尖，嘴唇过厚，妆容廉价，影楼风，卡通，脸部变形，多人同框，背景杂乱，文字，水印",
};

export const CHARACTER_SECTIONS: PromptStudioSection[] = [
    {
        id: "basic",
        title: "角色基调",
        shortTitle: "基调",
        description: "先确定谁出现在画面里。所有选项都能直接输入自己的描述。",
        fields: [
            { key: "identity", label: "角色身份", placeholder: "如：原创短剧女主、品牌虚拟人", options: ["原创短剧女主", "原创短剧男主", "职场新人", "古风嫡女", "未来战士", "品牌虚拟人", "克制反派"] },
            { key: "age", label: "年龄感", placeholder: "如：25岁左右、30岁出头", options: ["20岁左右", "25岁左右", "30岁左右", "35岁左右", "40岁左右"] },
            { key: "gender", label: "性别表达", placeholder: "女性、男性或自定义", options: ["女性", "男性", "中性"] },
            { key: "temperament", label: "角色气质", placeholder: "把气质写成可视觉化的描述", options: ["成熟、清冷、安静、克制", "亲和、干净、明亮、自然", "英气、利落、坚定", "温柔、松弛、书卷气", "理性、疏离、未来感"], wide: true },
            { key: "shot", label: "画面类型", placeholder: "胸像、半身、全身或自定义构图", options: ["胸像特写定妆照", "半身定妆照", "全身白底定妆照", "电影感人物近景", "角色三视图"] },
            { key: "style", label: "视觉风格", placeholder: "真人写实、商业摄影或自定义", options: ["真人写实、高级商业摄影", "电影感写实", "古装影视剧定妆照", "时尚杂志摄影", "自然生活感摄影"] },
            { key: "basicExtra", label: "补充设定", placeholder: "补充人物背景、性格、身份冲突等，完全自定义", wide: true },
        ],
    },
    {
        id: "structure",
        title: "脸型与比例",
        shortTitle: "结构",
        description: "先控制骨相和三庭五眼，再谈五官精致，避免每张脸都长成同一个模板。",
        fields: [
            { key: "faceShape", label: "脸型", placeholder: "如：偏窄鹅蛋脸", options: ["偏窄鹅蛋脸", "短圆鹅蛋脸", "柔和圆脸", "自然长脸", "轮廓清晰的方脸", "心形脸但不尖下巴"] },
            { key: "contour", label: "外轮廓", placeholder: "轮廓线条与整体骨相", options: ["脸部轮廓干净，骨相利落自然", "轮廓柔和，过渡圆润", "骨相清晰，有力量感但不过分硬朗"], wide: true },
            { key: "cheekbones", label: "颧骨", placeholder: "颧骨存在感与宽窄", options: ["颧骨有轻微存在感，不过分外扩", "颧骨柔和低存在感", "颧骨清晰但不过高"] },
            { key: "jawline", label: "下颌线", placeholder: "清晰、圆润或自定义", options: ["下颌线清晰但不锋利", "下颌线圆润自然", "下颌线干净，有轻微力量感"] },
            { key: "chin", label: "下巴", placeholder: "长短、尖圆与比例", options: ["下巴略收，比例自然，不尖削", "下巴短而干净", "下巴自然偏方，成熟稳重"] },
            { key: "midfaceRatio", label: "中庭比例", placeholder: "长度及其带来的气质", options: ["轻微长中庭，成熟冷静", "中庭偏短，年轻亲和", "中庭比例自然"] },
            { key: "lowerFaceRatio", label: "下庭比例", placeholder: "下庭长短与年龄感", options: ["下庭比例自然", "下庭略短，增加年轻感", "下庭略长，增加成熟感"] },
            { key: "eyeSpacing", label: "眼距", placeholder: "宽窄及视觉感受", options: ["眼距略窄，眼神集中而克制", "眼距略宽，松弛柔和", "眼距自然"] },
            { key: "browEyeSpacing", label: "眉眼间距", placeholder: "自然、偏近或偏远", options: ["眉眼距离适中", "眉眼距离自然放松", "眉眼距离略近，有轻微压迫感"] },
            { key: "cheeks", label: "面颊与面中", placeholder: "饱满度与面部状态", options: ["面中干净，面颊饱满度自然", "面中柔和，面颊轻微饱满", "面中平整，面颊线条克制"] },
            { key: "structureExtra", label: "补充结构", placeholder: "补充额头、鼻梁比例、头肩比等自定义结构", wide: true },
        ],
    },
    {
        id: "features",
        title: "五官与表情",
        shortTitle: "五官",
        description: "遵循“一个强项，两个辅助”。只留一个主要记忆点，其他五官协调配合。",
        fields: [
            { key: "featureFocus", label: "主要记忆点", placeholder: "哪个五官最强，其他如何辅助", options: ["眼睛是唯一主要记忆点，鼻子和嘴唇作为辅助，不抢戏", "眉眼神情是主要记忆点，其他五官收敛", "嘴唇是主要记忆点，眼鼻保持自然克制"], wide: true },
            { key: "eyes", label: "眼睛", placeholder: "眼型、眼尾、眼神与辨识度", options: ["眼型偏细长，眼尾轻微上扬，眼神安静沉稳", "眼型偏圆但不过大，眼神明亮真诚", "眼型利落，眼神坚定，有轻微压迫感"], wide: true },
            { key: "nose", label: "鼻子", placeholder: "鼻梁、鼻头与辅助关系", options: ["鼻梁自然挺直，鼻头精致但不尖锐", "鼻梁柔和，鼻头圆润自然", "鼻梁线条清晰，成熟但不夸张"] },
            { key: "lips", label: "嘴唇", placeholder: "唇形、厚薄与嘴角", options: ["唇形干净，嘴角自然放松", "唇形饱满但不过度，嘴角自然平直", "唇形清晰，厚薄适中，表情克制"] },
            { key: "brows", label: "眉形", placeholder: "眉形、毛流与浓淡", options: ["眉毛略平直，毛流自然", "眉形柔和，边缘自然", "眉峰轻微清晰，英气但不过度锐利"] },
            { key: "expression", label: "表情", placeholder: "不要只写微笑，写具体面部状态", options: ["自然、安静、放松，不微笑，不露齿", "自然放松，眼神真诚，不刻意微笑", "嘴角平直，面部收紧，表情干净"], wide: true },
            { key: "gaze", label: "眼神方向", placeholder: "看镜头、看向侧面或自定义", options: ["镜头平视，眼神明亮但克制", "视线略偏向画面一侧，有故事感", "正视镜头，眼神坚定"] },
            { key: "featuresExtra", label: "补充五官", placeholder: "补充睫毛、肤质、面部小特征等自定义内容", wide: true },
        ],
    },
    {
        id: "styling",
        title: "发型与妆造",
        shortTitle: "妆造",
        description: "妆造服务人物气质，不改变已经确定的脸型和比例，也不抢走面部重点。",
        fields: [
            { key: "hairstyle", label: "发型发色", placeholder: "长度、颜色、轮廓", options: ["深棕色长发，轻微层次", "黑色自然直发，低饱和", "深棕色利落短发", "黑色盘发，留少量自然碎发"] },
            { key: "hairState", label: "发丝状态", placeholder: "蓬松、垂落、碎发等", options: ["有空气感和少量自然碎发，不油腻，不像假发", "发丝柔软，有轻微蓬松感", "发丝整齐但有真实毛流"] },
            { key: "makeup", label: "妆面", placeholder: "底妆、眼妆与整体妆感", options: ["低饱和自然妆面，底妆清透，保留真实皮肤纹理", "清透自然妆，淡淡腮红，眼妆轻薄", "低饱和哑光妆面，眼妆干净克制"], wide: true },
            { key: "lipColor", label: "唇色", placeholder: "裸色、豆沙色或自定义", options: ["柔和裸色，低饱和", "自然豆沙色", "低饱和砖红色", "浅粉裸色"] },
            { key: "wardrobe", label: "服装与领口", placeholder: "服装类型与入镜区域", options: ["简洁深色针织上衣，只露出肩颈与胸口上方", "极简衬衫领口，面料挺括", "柔软浅色针织衫，干净日常", "质感外套领口，整体造型克制"], wide: true },
            { key: "fabric", label: "面料质感", placeholder: "针织、丝绸、棉麻或自定义", options: ["面料真实，有细腻织物纹理", "棉麻质地自然，有轻微褶皱", "挺括羊毛面料，细节真实"] },
            { key: "accessories", label: "配饰", placeholder: "无、耳饰、眼镜或自定义", options: ["无夸张配饰，不让配饰抢走面部重点", "小巧金属耳饰，造型简洁", "细框眼镜，理性克制"] },
            { key: "palette", label: "整体色彩", placeholder: "主色、辅色和饱和度", options: ["深棕、裸色与中性灰，整体低饱和", "米白、浅棕与柔和豆沙色", "黑色、冷灰与少量金属色"] },
            { key: "stylingExtra", label: "补充妆造", placeholder: "补充美甲、纹身、服装纹样等自定义细节", wide: true },
        ],
    },
    {
        id: "image",
        title: "构图与光线",
        shortTitle: "画面",
        description: "把构图、镜头和光线写成模型能执行的约束，而不是“高级、好看”这类空词。",
        fields: [
            { key: "background", label: "背景", placeholder: "影棚、场景、颜色与杂物控制", options: ["浅灰到中性灰影棚背景，干净无杂物", "纯白影棚背景，人物与背景轻微分离", "低饱和电影感场景，背景简洁", "纯色背景，无生活化杂物"], wide: true },
            {
                key: "lighting",
                label: "光线",
                placeholder: "方向、软硬、曝光、阴影与补光",
                options: ["整体曝光明亮通透，柔和主光配轻微伦勃朗阴影，弱补光保留暗部细节", "柔和均匀主光，弱阴影，整体明亮干净", "侧前方主光，保留面部结构阴影，暗部有细节", "自然窗光，侧逆光勾勒发丝与轮廓"],
                wide: true,
            },
            { key: "camera", label: "机位与镜头", placeholder: "视角、焦段、主体占比", options: ["平视机位，85mm 人像镜头，面部占画面主要面积", "平视机位，50mm 人像镜头，自然透视", "略低机位，85mm 镜头，人物有力量感"] },
            { key: "depth", label: "景深与分离", placeholder: "浅景深、全景深或自定义", options: ["浅景深，人物与背景有轻微分离", "中等景深，面部和服装细节清晰", "全景深，角色三视图各区域清晰"] },
            { key: "quality", label: "画面质量", placeholder: "肤质、发丝、结构等真实要求", options: ["真实皮肤纹理，毛孔自然，发丝清晰，五官协调，面部结构稳定", "细节清晰，肤质真实，不过度锐化，色彩自然"], wide: true },
            { key: "imageExtra", label: "补充画面", placeholder: "补充画幅、姿态、手部、后期质感等自定义要求", wide: true },
        ],
    },
    {
        id: "constraints",
        title: "一致性与负面约束",
        shortTitle: "约束",
        description: "把不希望出现的内容明确写出来。正向描述与负面约束会一起进入最终提示词。",
        fields: [
            { key: "negative", label: "负面提示词", placeholder: "输入要避免的内容，用逗号分隔，可完全改写", wide: true },
            { key: "constraintsExtra", label: "额外硬约束", placeholder: "如：不改变参考图服装、只能一个人、不能出现手部", wide: true },
        ],
    },
];

export function createCharacterPreset(overrides: PromptStudioValues = {}): PromptStudioValues {
    return { ...CHARACTER_DEFAULTS, ...overrides };
}

export const CHARACTER_PRESETS = [
    { id: "cool-lead", name: "成熟清冷女主", description: "长中庭、细长眼、低饱和妆面，明亮影棚中带轻微结构阴影", values: createCharacterPreset() },
    {
        id: "gentle-youth",
        name: "亲和少女角色",
        description: "短中庭、略宽眼距、柔和面中，清透亮眼神但不默认微笑",
        values: createCharacterPreset({
            age: "20岁左右的成年角色",
            temperament: "亲和、干净、明亮、自然，有轻微甜感但不过度幼态",
            faceShape: "短圆鹅蛋脸",
            contour: "脸部轮廓柔和，过渡圆润",
            cheekbones: "颧骨柔和低存在感",
            jawline: "下颌线圆润自然",
            chin: "下巴短而干净",
            midfaceRatio: "中庭偏短，呈现年轻、亲和的气质",
            lowerFaceRatio: "下庭略短，增加年轻感",
            eyeSpacing: "眼距略宽，松弛柔和",
            cheeks: "面中柔和，面颊轻微饱满",
            eyes: "眼型偏圆但不过大，眼神明亮、放松、真诚",
            nose: "鼻梁柔和，鼻头圆润自然，不抢戏",
            lips: "唇形饱满但不过度，嘴角自然平直，不做明显微笑",
            brows: "眉形柔和，边缘自然",
            expression: "自然放松，不刻意微笑，不夸张，不卖萌",
            makeup: "清透自然妆，淡淡腮红，眼妆轻薄",
            lipColor: "自然豆沙色或浅粉裸色",
            wardrobe: "浅色针织衫，只露出肩颈和胸口上方",
            palette: "米白、浅棕与柔和豆沙色",
            lighting: "柔和均匀主光，弱阴影，整体曝光明亮干净",
        }),
    },
    {
        id: "heroic-professional",
        name: "英气职场角色",
        description: "利落骨相、坚定眼神、平直眉与挺括面料，强调可靠和执行力",
        values: createCharacterPreset({
            identity: "原创职场女主",
            age: "30岁左右",
            temperament: "英气、理性、利落、可靠，有执行力但不刻薄",
            faceShape: "轮廓清晰的柔和方脸",
            jawline: "下颌线干净，有轻微力量感",
            midfaceRatio: "中庭比例自然略长，成熟理性",
            eyes: "眼型利落，眼尾自然，眼神坚定",
            brows: "眉峰轻微清晰，英气但不过度锐利",
            expression: "嘴角平直，面部干净，神情专注",
            gaze: "正视镜头，眼神坚定",
            hairstyle: "深棕色利落中短发",
            makeup: "低饱和哑光妆面，眼妆干净克制",
            wardrobe: "深灰极简西装与挺括衬衫领口",
            fabric: "挺括羊毛面料，细节真实",
            palette: "深灰、冷棕与少量金属色",
            camera: "平视机位，85mm 人像镜头，肩部线条利落",
        }),
    },
    {
        id: "gentle-period",
        name: "温柔古风角色",
        description: "柔和骨相、书卷气、自然盘发，古装但避免廉价影楼感",
        values: createCharacterPreset({
            identity: "原创古风嫡女",
            temperament: "温柔、端庄、松弛，有书卷气和分寸感",
            style: "古装影视剧定妆照，真人写实",
            faceShape: "自然鹅蛋脸",
            contour: "脸部轮廓柔和，骨相清秀",
            eyes: "眼型自然偏长，眼尾平缓，眼神温和有故事感",
            expression: "面部放松，嘴角自然，不刻意微笑",
            hairstyle: "黑色低盘发，发髻简洁，留少量自然碎发",
            makeup: "低饱和古典妆面，底妆清透，眉形柔和",
            lipColor: "低饱和豆沙色",
            wardrobe: "低饱和古装交领，只露出肩颈与胸口上方，纹样克制",
            fabric: "细腻丝棉面料，有真实柔光与织纹",
            accessories: "小巧玉石耳饰，无夸张头饰",
            palette: "月白、黛青与柔和玉石色",
            background: "低饱和纯色影棚背景，无复杂场景",
            negative: CHARACTER_DEFAULTS.negative + "，夸张头饰，廉价古装，复杂影楼布景",
        }),
    },
];

function text(values: PromptStudioValues, key: string): string {
    return (values[key] || "").trim();
}

function sentence(parts: (string | boolean)[]): string {
    return parts.filter(Boolean).join("，");
}

export function composeCharacterNegative(values: PromptStudioValues): string {
    const items = [text(values, "negative")];
    if (text(values, "original") === "yes") items.push("真实人物、明星、网红或影视角色相似脸");
    if (text(values, "noSmile") === "yes") items.push("微笑，露齿笑，甜笑，夸张笑容，刻意卖萌");
    if (text(values, "brightStudio") === "yes") items.push("暗调，低曝光，压黑，强烈电影暗光，硬阴影，阴影过重");
    if (text(values, "shot").includes("胸像")) items.push("全身照，七分身，半身过远，腰部入镜，腿部入镜");
    return [
        ...new Set(
            items
                .join("，")
                .split(/[，,]/)
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    ].join("，");
}

export function composeCharacterPrompt(values: PromptStudioValues): string {
    const paragraphs = [
        sentence([text(values, "shot") || "原创角色定妆照", text(values, "style"), text(values, "background"), "画面重点集中在面部比例、五官结构和角色气质表达"]),
        sentence([
            text(values, "identity") && `角色为${text(values, "identity")}`,
            text(values, "age"),
            text(values, "gender"),
            text(values, "temperament") && `气质为${text(values, "temperament")}`,
            text(values, "original") === "yes" && "必须是不参考任何真实人物、明星、网红或影视角色的原创面孔",
            text(values, "basicExtra"),
        ]),
        sentence([text(values, "faceShape") && `脸型为${text(values, "faceShape")}`, text(values, "contour"), text(values, "cheekbones"), text(values, "jawline"), text(values, "chin"), text(values, "structureExtra")]),
        sentence([text(values, "midfaceRatio") && `面部比例为${text(values, "midfaceRatio")}`, text(values, "lowerFaceRatio"), text(values, "eyeSpacing"), text(values, "browEyeSpacing"), text(values, "cheeks")]),
        sentence([
            text(values, "featureFocus") && `五官遵循一个强项、两个辅助：${text(values, "featureFocus")}`,
            text(values, "eyes") && `眼睛：${text(values, "eyes")}`,
            text(values, "nose") && `鼻子：${text(values, "nose")}`,
            text(values, "lips") && `嘴唇：${text(values, "lips")}`,
            text(values, "brows") && `眉形：${text(values, "brows")}`,
            text(values, "featuresExtra"),
        ]),
        sentence([text(values, "expression") && `表情：${text(values, "expression")}`, text(values, "gaze") && `眼神：${text(values, "gaze")}`]),
        sentence([
            text(values, "hairstyle") && `发型为${text(values, "hairstyle")}`,
            text(values, "hairState"),
            text(values, "makeup") && `妆容为${text(values, "makeup")}`,
            text(values, "lipColor") && `唇色为${text(values, "lipColor")}`,
            text(values, "stylingExtra"),
        ]),
        sentence([text(values, "wardrobe") && `服装为${text(values, "wardrobe")}`, text(values, "fabric"), text(values, "accessories"), text(values, "palette") && `整体色彩为${text(values, "palette")}`]),
        sentence([
            text(values, "camera"),
            text(values, "depth"),
            text(values, "lighting") && `光线为${text(values, "lighting")}`,
            text(values, "quality"),
            text(values, "imageExtra"),
            text(values, "stableIdentity") === "yes" && "后续同一角色创作保持脸型、比例、五官主次、发型与服装一致",
            text(values, "constraintsExtra"),
        ]),
    ].filter(Boolean);
    return `${paragraphs.join("。\n\n")}。\n\n负面提示词：${composeCharacterNegative(values)}。`;
}
