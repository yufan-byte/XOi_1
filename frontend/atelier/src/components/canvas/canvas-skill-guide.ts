// User-facing examples describe the workflow; they do not promise unsupported tools.
type SkillGuide = { input: string; output: string; example: string };
const directorGuides: Record<string, SkillGuide> = {
    "seedance-shot-design": { input: "故事想法、时长，以及想要的画面风格。", output: "景别、构图、光影、运镜与视频提示词。", example: "为一个雨夜回家的场景设计 3 个电影感镜头，说明景别、光线和运镜，先给方案。" },
    "seedance-shotlist-director": { input: "故事或剧本，可补充角色、场景与总时长。", output: "按顺序编排的分镜方案与逐镜提示词。", example: "把这段故事拆成 6 个镜头，列出每镜的时长、人物动作、机位和衔接方式，先给分镜方案。" },
    "emotion-director": { input: "人物处境、情绪变化，或一段剧情。", output: "情绪节奏、人物调度与可拍摄的动作描述。", example: "设计一段人物从期待转为失落的场景，用动作、节奏和机位表现情绪，先给拍摄方案。" },
    "emotion-expression-director": { input: "人物参考与目标情绪，或需要修正的表情。", output: "眼神、呼吸、眉嘴动作与表演提示词。", example: "为角色设计强忍眼泪的微表情，细化眼神、呼吸和嘴角动作，避免表情夸张，先给提示词。" },
    "seedance-previz-to-render": { input: "引用白模或预演素材，补充材质与风格参考。", output: "保留机位和调度的材质、灯光与精修方案。", example: "基于我引用的白模预演，保留机位、人物动作和空间结构，设计材质与灯光升级方案。" },
    fpv: { input: "空间参考、起点终点，以及速度与时长。", output: "连续穿越路径、速度节奏与运镜提示词。", example: "设计一个 10 秒的第一人称穿越镜头：从庭院进入走廊，再穿门到室内，说明路径与速度变化，先给方案。" },
    "seedance-seamless-stitch": { input: "引用需要衔接的素材，说明顺序和目标时长。", output: "镜头出入点、动作接续与转场提示词。", example: "为我引用的两个镜头设计自然转场，保留主体与原有风格，说明出入点和动作接续，先给方案。" },
};
const builtinGuides: Record<string, SkillGuide> = {
    "builtin-ecommerce": { input: "商品参考图、真实卖点与使用场景。", output: "主图、详情页与活动素材的视觉方案。", example: "根据商品参考图和卖点设计 3 个主图方向，保留真实产品结构，先给构图与背景方案。" },
    "builtin-xhs": { input: "笔记主题、目标读者和已有素材。", output: "封面信息层级、配图方向与系列内容方案。", example: "为这个主题设计一套笔记封面和 3 张配图，说明标题层级、画面主体与留白。" },
    "builtin-comic": { input: "角色设定、故事梗概与视觉参考。", output: "保持角色和场景连续的分镜方案。", example: "把故事拆成一组漫剧分镜，保持角色服装、发型和道具一致，先给分镜方案。" },
    "builtin-film": { input: "短片目标、故事与时长。", output: "镜头语言、时长、声音与剪辑节奏建议。", example: "为这段短片设计镜头顺序，说明景别、运动、时长与声音，先给拍摄方案。" },
    "builtin-storyboard": { input: "品牌目标、真实卖点与受众。", output: "开场、产品展示与结尾记忆点的故事板。", example: "根据品牌目标和产品卖点设计一个 30 秒宣传片故事板，先给叙事与镜头方案。" },
};
export function getCanvasSkillGuide(skill: { id: string; source: string }): SkillGuide | undefined {
    if (skill.source !== "system") return undefined;
    const directorId = skill.id.match(/^purchased\/director\/([^/]+)\/SKILL\.md$/i)?.[1];
    return directorId ? directorGuides[directorId] : builtinGuides[skill.id];
}
