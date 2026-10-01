import type { CameraControlOptions } from "@/types/canvas";

export type CameraProfile = { id: string; label: string; zhName: string; shortTag: string; profilePrompt: string; bodyColor: string; accentColor: string; description: string; useCase: string };
export type LensProfile = { id: string; label: string; zhName: string; shortTag: string; profilePrompt: string; lensColor: string; ringColor: string; description: string; useCase: string };

const camera = (id: string, label: string, zhName: string, prompt: string, bodyColor: string, accentColor: string, description: string, useCase: string): CameraProfile => ({ id, label, zhName, shortTag: label, profilePrompt: prompt, bodyColor, accentColor, description, useCase });
const lens = (id: string, label: string, zhName: string, prompt: string, lensColor: string, ringColor: string, description: string, useCase: string): LensProfile => ({ id, label, zhName, shortTag: label, profilePrompt: prompt, lensColor, ringColor, description, useCase });

export const CAMERA_PROFILES: CameraProfile[] = [
    camera("panavision_dxl2", "Panavision DXL2", "潘那维申 DXL2", "shot on Panavision DXL2 with large-format Monstro 8K VV sensor, organic highlight rolloff, rich filmic texture", "#2a2a2a", "#e2a84f", "好莱坞顶级院线电影机，8K 大画幅传感器，质感油润。", "剧情长片、奢华广告、顶级商业片"),
    camera("arri_alexa_mini_lf", "ARRI Alexa Mini LF", "阿莱 Mini LF", "shot on ARRI Alexa Mini LF with ALEV III large-format sensor, gorgeous skin tones, buttery highlight rolloff", "#3a3a3a", "#d4d4d4", "行业基准院线电影机，肤色渲染公认最佳。", "剧情片、人像叙事、品牌广告"),
    camera("red_komodo_6k", "RED Komodo 6K", "RED 科莫多 6K", "shot on RED Komodo 6K with global-shutter sensor, crisp modern digital detail, clean shadows", "#8b2b2b", "#ff3b3b", "紧凑全局快门 6K，无果冻效应。", "动作片、FPV、穿越机、无人机"),
    camera("red_v_raptor_8k", "RED V-Raptor 8K", "RED V-Raptor 8K", "shot on RED V-Raptor 8K VV with 8K Vista Vision sensor, razor-sharp resolution, vivid yet natural color", "#701f1f", "#ff5555", "RED 旗舰 8K Vista Vision，极致清晰度。", "科幻大片、高分辨率 VFX 场景"),
    camera("sony_venice_2", "Sony Venice 2", "索尼 Venice 2", "shot on Sony Venice 2 with full-frame cinema sensor, clean shadows, refined modern color science", "#2d3a4d", "#4d90d0", "全画幅双原生 ISO，弱光表现极佳。", "高端广告、纪录片、夜景戏剧"),
    camera("sony_fx6", "Sony FX6", "索尼 FX6", "shot on Sony FX6 with full-frame cinema sensor, clean low-light performance, documentary-friendly modern look", "#2d2d36", "#ff9000", "轻量全画幅 Cinema Line，手持纪录片常用。", "纪录片、单兵采访、轻量剧情"),
    camera("blackmagic_ursa_12k", "Blackmagic URSA 12K", "黑魔法 URSA 12K", "shot on Blackmagic URSA Cine 12K with rich filmic tones, indie-cinema aesthetic", "#2e2e2e", "#ffb820", "独立电影人宠儿，12K 高分辨率性价比机。", "独立电影、音乐短片、实验影像"),
    camera("canon_c500_mk2", "Canon C500 Mk II", "佳能 C500 Mk II", "shot on Canon C500 Mark II with warm natural skin tones, premium broadcast and feature-film character", "#332a22", "#e8c070", "佳能色彩科学，暖调肤色，广播级电影机。", "广告、电视剧、婚礼电影"),
];

export const LENS_PROFILES: LensProfile[] = [
    lens("arri_signature_prime", "ARRI Signature Prime", "阿莱大师定焦", "ARRI Signature Prime lens, creamy organic bokeh, gentle contrast, smooth highlight rolloff", "#2a2a2a", "#c4a060", "顶级大画幅定焦头，奶油虚化。", "人物叙事、顶级商业片"),
    lens("cooke_s7i", "Cooke S7/i", "库克 S7/i", "Cooke S7/i lens, legendary Cooke Look, warm color bias, soft rounded bokeh", "#26231d", "#d0a060", "传奇 Cooke Look，暖调讨喜肤色。", "古典人像、时代感叙事"),
    lens("zeiss_supreme_prime", "Zeiss Supreme Prime", "蔡司至尊定焦", "Zeiss Supreme Prime lens, neutral modern color, high micro-contrast, clean bokeh", "#1e1e22", "#4d90d0", "中性现代色彩，锐利而不硬。", "科技感广告、现代剧情"),
    lens("canon_sumire_prime", "Canon Sumire Prime", "佳能 Sumire 定焦", "Canon Sumire Prime lens, soft organic character, warm gentle color rendering, dreamy rounded bokeh", "#2c241c", "#e0b070", "柔和梦幻肤色镜，暖调柔焦。", "爱情片、梦境、人物特写"),
    lens("anamorphic_cooke", "Anamorphic (Cooke)", "Cooke 变形宽银幕", "Cooke anamorphic lens, oval bokeh, horizontal blue streak flares, wide cinematic framing", "#1a1a24", "#6a9ed6", "宽银幕变形镜，椭圆虚化与水平蓝色光晕。", "科幻大片、太空戏、夜戏"),
    lens("anamorphic_atlas", "Anamorphic (Atlas)", "Atlas Orion 变形", "Atlas Orion anamorphic lens, oval bokeh, cyan horizontal flares, clean center and subtle edge blur", "#1b2228", "#40c0e0", "现代变形镜，青色光晕，中心清晰边缘柔。", "音乐 MV、风格化广告"),
    lens("vintage_leica_r", "Vintage Leica R", "徕卡 R 老镜", "vintage Leica R prime lens, rich saturation, slight highlight glow, nostalgic cinema character", "#3a2f1f", "#d04040", "上世纪老镜，高光微透溢，复古怀旧味。", "年代戏、怀旧 MV、文艺片"),
    lens("macro_100mm", "Macro 100mm", "100mm 微距", "macro 100mm prime lens, extremely shallow depth of field, razor-thin focus plane, detail-rich close-up rendering", "#1f1f1f", "#60d090", "微距特写专用，细节惊人，景深极浅。", "美食广告、珠宝、昆虫、细节"),
];

export const FOCAL_LENGTHS = [14, 18, 24, 35, 40, 50, 65, 85, 100, 135, 200] as const;
export const APERTURES = [1.2, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16] as const;
export const FOCAL_LENGTH_META: Record<number, { zhName: string; description: string; useCase: string }> = { 14: { zhName: "超广角", description: "空间被极度拉伸", useCase: "建筑内景、风景全景" }, 24: { zhName: "广角", description: "环境感强烈", useCase: "风光、大场面" }, 35: { zhName: "小广角", description: "经典叙事焦段", useCase: "纪实、环境叙事" }, 50: { zhName: "标准", description: "空间感自然", useCase: "人像、日常" }, 85: { zhName: "中长焦", description: "经典人像焦段", useCase: "特写人像" }, 135: { zhName: "长焦", description: "电影专用长焦", useCase: "剧情特写" }, 200: { zhName: "超长焦", description: "极致背景压缩", useCase: "戏剧感特写" } };
export const APERTURE_META: Record<number, { zhName: string; description: string; useCase: string }> = { 1.2: { zhName: "大光圈", description: "虚化极致，景深极薄", useCase: "梦幻人像、暗光" }, 2.8: { zhName: "大光圈", description: "景深适中、虚化柔和", useCase: "群像、叙事" }, 4: { zhName: "中光圈", description: "主体清晰，背景轻微虚化", useCase: "群像、电视剧" }, 8: { zhName: "小光圈", description: "前后皆清晰", useCase: "风光、建筑、全景" }, 16: { zhName: "小光圈", description: "超大景深，星芒出现", useCase: "日光风光" } };

export function applyCameraPrompt(prompt: string, control?: CameraControlOptions) {
    if (!control?.enabled) return prompt;
    const selectedCamera = CAMERA_PROFILES.find((item) => item.id === control.camera) || CAMERA_PROFILES[0];
    const selectedLens = LENS_PROFILES.find((item) => item.id === control.lens) || LENS_PROFILES[0];
    return [prompt, "virtual camera direction, do not render camera equipment in the frame", selectedCamera.profilePrompt, selectedLens.profilePrompt, `${control.focalLength}mm cinematic perspective`, `shot at f/${control.aperture}, depth of field consistent with the aperture`, `[camera: ${selectedCamera.shortTag} · lens: ${selectedLens.shortTag} · focal: ${control.focalLength}mm · aperture: f/${control.aperture}]`].filter(Boolean).join(", ");
}
