import {hasSpeech} from './oneStopSpeech';
export function defaultShotVideoPrompt(p:any,s:any,style=String(p.style||'')){
  return `${s.action||s.shotPrompt||''}${hasSpeech(s)?`，人物正在说话：${s.dialogue}`:''}。${s.camera?`运镜：${s.camera}，`:'镜头平稳缓慢推进，'}${style}风格，动作自然连贯，保持人物外貌、服装、环境布局、光线和视线方向一致。`;
}
export function assetImageGuidance(kind:string){
  return kind==='character'?'角色设定图：全身正面、服装与发型完整清晰、中性背景，保持同一角色身份，不出现其他人物。'
    :kind==='scene'?'场景设定图：环境全景、无人物，固定建筑布局、门窗位置、时代材质、光线方向，供后续镜头统一空间。'
    :'道具设定图：主体居中、素色背景，清晰展示形状、材质和比例，无人物、无文字。';
}
export function imageStylePrompt(style:string,description?:string){
  // Explicit 2D must precede the generic word “电影”; 2D电影 is not live action.
  const rules:[RegExp,string][]=[
    [/水墨/,'traditional Chinese ink wash painting, rice paper texture, flowing brush strokes'],
    [/像素/,'pixel art, retro game aesthetic, crisp pixels'],
    [/2D|三渲二|3D渲染2D|日式3D渲染2D/,'2D anime illustration, clean lineart, cel shading'],
    [/真人|写实|电影|光影|港片|古装|武侠|胶片|摄影|影棚|影视/,'photorealistic cinematic live-action film still, natural skin texture, 35mm lens, film lighting'],
    [/3D|渲染|UE5|PBR|定格|粘土|手办|积木|盲盒|微缩/,'high quality 3D animated render, volumetric lighting, detailed materials'],
    [/美式|美国|漫画/,'comic illustration, bold ink outlines, dynamic composition, halftone shading'],
    [/日式|日系|二次元|动画|国漫|神话|热血|插画/,'2D anime illustration, clean lineart, cel shading, vibrant colors'],
  ];
  return `${style} style${description?.trim()?` (${description.trim()})`:''}, ${rules.find(([re])=>re.test(style))?.[1]||'cinematic illustration'}`;
}
const languages:Record<string,string>={'English':'英文','日本語':'日语','한국어':'韩语','Español':'西班牙语','Français':'法语','Deutsch':'德语','Русский':'俄语','Bahasa Indonesia':'印尼语','Português':'葡萄牙语'};
export function storyLanguage(region:string){return Object.entries(languages).find(([key])=>region?.includes(key))?.[1]||(/海外|欧美/i.test(region)?'英文':'中文');}
export function stageCreativeGuidance(op:string,p:any){
  const lang=storyLanguage(String(p.region||''));
  const common=`叙事正文、标题与对白使用${lang}，JSON 字段名保持不变。人物姓名、关系、服装和时代背景遵守已确认设定，不擅自改写。`;
  const details:Record<string,string>={
    bible:'建立可连续复用的系列设定：时代地点与规则、固定主角的外貌身份性格关系、画面色调、每集冲突结构和结尾钩子。',
    intent:'结合原始故事提炼受众、类型、情绪、时长和差异化卖点，不把建议当作用户已确认的事实。',
    direction:'提出三个真正不同且可拍摄的叙事方向，分别说明核心冲突、人物动机和情绪基调。',
    outline:'按已选方向和系列设定设计每集起承转合、情绪升级、结尾钩子，前后集因果连续，不在每集重置人物。',
    script:'每场 action 用60–120字描述可拍摄的机位、动作和情绪；dialogue 按行写“角色：台词”，无对白用空字符串。人物名和同一地点名全篇统一，避免为同一卧室生成多个不同地点名。动作量适合镜头时长，剧本只包含故事内容，不写生成指令。',
    assets:'覆盖剧本全部出场角色，年龄、发型、服装和外貌具体稳定；同一地点去重并描述门窗布局、材质和光向；道具只提取影响剧情的关键物件。',
    shots:`每个现有镜头设计景别、运镜和80–150字画面提示词，引用资产设定中的人物外貌、服装及场景布局。相邻同场镜头保持光线、人物站位和视线轴线，按动作需要变化景别，不重复相同构图。${p.fixedShotSec?`每镜固定${p.fixedShotSec}秒，动作量适应该时长，不因台词自行延长。`:''}画面不画对白文字、字幕或水印。`,
  };
  return common+(details[op]||'');
}
