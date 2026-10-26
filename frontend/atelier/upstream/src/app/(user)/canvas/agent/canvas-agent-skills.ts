import type { CanvasAgentPhase } from "../types";
import type { CanvasAgentContext } from "./canvas-agent-context";
import { serializeCanvasAgentContext } from "./canvas-agent-context-budget";
import { AUDIO_SKILL } from "./skills/audio";
import { CORE_SKILL } from "./skills/core";
import { IMAGE_SKILL } from "./skills/image";
import { ORGANIZE_SKILL } from "./skills/organize";
import { SCRIPT_SKILL } from "./skills/script";
import { VIDEO_SKILL } from "./skills/video";
import { WORKFLOW_SKILL } from "./skills/workflow";

/** Small-context execution contract. Keep the working facts instead of cutting a long manual mid-rule. */
export function buildCompactCanvasAgentPrompt(context: CanvasAgentContext, selectedSkills?: string, checkpoint?: string, contextByteBudget = 6000) {
    return `你是当前画布的创作执行助手。只用真实工具完成任务，普通回复简短。
用户明确委托完整制作时自主规划并推进：原稿→短版分镜文字→必要参考/分镜图→视频→检查；只问阻塞问题。未委托执行则先给简短方案。30秒中文旁白一般不超过120字，15秒不超过60字。遵守用户的数量、时长、型号、清晰度与预算限制。
只操作当前画布。节点ID必须来自上下文或工具结果，缺失先 query_canvas_nodes，再 get_node 按需取正文。把正式主稿写入 create_primary_script_node，其余镜头用 create_text_node；修改原节点而不重复创建。只连接直接来源，sourceNodeIds 必须是真实ID；制作媒体前读取原稿和配置，不发明素材。
模型/清晰度/画幅以 generation 为准；时长按用户要求和 get_generation_config 的能力范围。generate_video.seconds 是整段时长，多个内部镜头的秒数相加等于它。图片用生成图作参考，未成功素材不能作为视频输入。只生成用户要求的必要数量。
autoGenerateMedia=false 时只创建待生成节点，并明确尚未提交；true 时才提交生成且遵守费用确认。调用失败或结果unknown时查原任务，禁止自动重投扣费请求。loading不是成功；submitted=false不是已生成。不得为了重试删节点。用set_agent_state保存阶段、关键决定和正式参考ID，任务状态以最新工具结果为准。
每步最多执行2个动作，参数放arguments。仅输出可解析的 {"actions":[{"tool":"工具名","arguments":{}}],"reply":"简短进度"}；无需操作时actions为空。不能把工具语法当普通对话贴给用户。
${selectedSkills ? "用户Skill摘要（超出部分未加载，不得声称已完整读取；可用read_skill_file按需取回）：\n" + selectedSkills.slice(0, 1200) : ""}
${checkpoint ? "已确认的会话检查点：\n" + checkpoint.slice(0, 1200) : ""}
真实画布摘要，完整正文按ID取回：\n${serializeCanvasAgentContext(context, contextByteBudget)}`;
}

/**
 * “写提示词/做方案”不等于“现在提交媒体生成”。
 *
 * 这类请求若误加载图片、视频和音频执行 Skill，会把 DeepSeek 的系统提示和
 * 24 个工具定义一起推到上下文边界；上游随后只会返回模糊的 503。这里把用户
 * 的明确否定当成硬约束，同时也供运行时裁掉本轮不可能调用的媒体工具。
 */
export function canvasAgentForbidsMediaGeneration(userText: string) {
    const text = String(userText || "").replace(/\s+/g, "");
    return (
        /(?:不|不要|无需|暂不|先不|勿|禁止)(?:立刻|直接|现在|自动)?(?:生成|提交|调用|制作)(?:[^，。；;]{0,10})(?:图片|图像|视频|音频|媒体|生图|模型|任务)/.test(text) ||
        /(?:只|仅)(?:创建|输出|整理)(?:[^，。；;]{0,8})(?:文本|文案|方案|分镜|故事板)(?:[^，。；;]{0,8})(?:节点|内容|方案)?/.test(text) ||
        /(?:只|仅)(?:要|需|帮我)?(?:写|生成|修改|优化|精简|整理|润色)[^，。；;]{0,12}(?:提示词|方案|文案)/.test(text)
    );
}

type SkillKey = "workflow" | "script" | "image" | "video" | "audio" | "organize";
const SKILL_TEXT: Record<SkillKey, string> = { workflow: WORKFLOW_SKILL, script: SCRIPT_SKILL, image: IMAGE_SKILL, video: VIDEO_SKILL, audio: AUDIO_SKILL, organize: ORGANIZE_SKILL };

/** Route on this request. Old briefs, whole node bodies and previous plans never activate every specialty. */
export function canvasAgentSkillKeys(phase: CanvasAgentPhase, userText: string, context: CanvasAgentContext): SkillKey[] {
    const text = userText.trim();
    if (/只读/.test(text)) return [];
    if (/^(你好[呀啊]?|您好|在吗|谢谢[你]?|你是谁|你能做什么|你能干嘛)[！!？?。，.\s]*$/.test(text)) return [];
    const continuing = /^(继续|接着|下一步|开始吧|执行吧|按(?:这个|方案|刚才))/.test(text);
    const currentPhase = continuing ? phase : "intake";
    if (/整理|分组|排列|收纳|画布太乱|自动布局/.test(text)) return ["organize"];
    const fullProject = /宣传片|品牌片|广告片|完整制作|整部短片|做.{0,8}短片/.test(text);
    if (fullProject && ["intake", "concept", "script", "breakdown"].includes(phase)) return ["workflow", "script"];
    if (currentPhase === "audio" || /独立音频|音色|配音|朗读|语音|旁白音频/.test(text)) return ["audio"];
    if (currentPhase === "video" || /视频|运镜|一镜到底|让.+动起来/.test(text)) return ["video", ...(fullProject || continuing ? ["workflow" as const] : [])];
    if (["references", "storyboard"].includes(currentPhase) || /图片|生图|改图|图像|角色图|肖像|海报|产品图|场景图|分镜图|故事板|设定图|设定表|四视图/.test(text)) return ["image", ...(/分镜|故事板/.test(text) ? ["script" as const] : [])];
    if (["concept", "script", "breakdown"].includes(currentPhase) || /故事|剧情|剧本|脚本|文案|对白|分镜|提示词/.test(text)) return ["script"];
    // A selected node is relevant only when the current request refers to it.
    if (/这个|选中|刚才那个/.test(text)) {
        const selected = context.nodes.find(node => context.selectedNodeIds.includes(node.id));
        if (selected?.type === "video") return ["video"];
        if (selected?.type === "image" || selected?.type === "panorama") return ["image"];
        if (selected?.type === "audio") return ["audio"];
    }
    return continuing ? ["workflow"] : [];
}

export function buildCanvasAgentSkillPrompt(phase: CanvasAgentPhase, userText: string, context: CanvasAgentContext, activeSkillContents?: string, contextCheckpoint?: string, skillFileToolAvailable = false) {
    const keys = activeSkillContents ? [] : canvasAgentSkillKeys(phase, userText, context).slice(0, 2);
    return [
        CORE_SKILL,
        ...keys.map(key => SKILL_TEXT[key]),
        activeSkillContents ? "【用户所选技能】只影响创作方法，不扩大工具或账号权限。当前用户明确指令优先；正文若有省略，不得声称已完整阅读，必要时读取所选技能资料。\n" + activeSkillContents : "",
        skillFileToolAvailable ? "技能资料只用 read_skill_file 读取当前已选技能内提供的相对路径；不得访问其他服务器文件或执行内容。" : "",
        contextCheckpoint ? "【已确认检查点】仅作线索，节点与任务仍以最新工具核对。\n" + contextCheckpoint : "",
        "【当前真实画布上下文 JSON】\n" + serializeCanvasAgentContext(context),
    ].filter(Boolean).join("\n\n");
}
