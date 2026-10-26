// 语音合成模型的音色表：音频页的音色库、视频页的「用文案配音」共用这一份，
// 保证界面上能选的音色就是提交时会被上游接受的音色。
import voices from "../../../../../shared/oneStopVoicePresets.json";
import type { CatalogModel } from "@/lib/models";
interface VoiceItem {id:string;name:string;gender?:string;language?:string;styles?:string[];description?:string}

/** 参考站 GT 语音合成的音色说明 */
export const OPENAI_DESC: Record<string, [string[], string]> = {
  alloy: [["Versatile"], "中性百搭声线, 万金油定位, 旁白对话都能稳定胜任"], echo: [["Calm"], "平静沉着的男声, 不疾不徐, 适合理性叙述与稳重角色"],
  fable: [["British", "Storyteller"], "带英伦腔的说书人男声, 富有故事感, 适合童话与传奇叙述"], onyx: [["Deep", "Authoritative"], "深沉浑厚的低音男声, 自带权威感, 适合预告片与领袖角色"],
  nova: [["Warm"], "温暖明亮的女声, 友好自然, 适合主角配音与温情场景"], shimmer: [["Soft"], "轻柔细腻的女声, 气息柔和, 适合治愈系内容与温柔角色"],
};
interface Preset { id: string; name: string; family: string; gender?: string; language?: string; styles?: string[] }
const PRESETS = ((voices as unknown as { data: Preset[] }).data ?? []);

export function voiceFamily(m: CatalogModel) { return /doubao/i.test(m.id) ? "doubao" : /minimax|speech|voice/i.test(m.id) ? "minimax" : /gemini|gm-/i.test(m.id) ? "gemini" : "openai"; }

/** schema 的音色是自由填写的字符串、没给枚举时（豆包语音 2.0：「从音色库选择」，音色库只在上游），
 *  描述里举的音色 id 是唯一确定上游认的值（如 zh_female_vv_uranus_bigtts）。
 *  以前这种模型落到 openai 音色表，提交 voice=alloy，上游直接报音色不存在，作品必失败 */
export function describedVoices(m: Pick<CatalogModel, "paramSchema">): string[] {
  const f = m.paramSchema.voice; if (!f || f.enum?.length || f.options?.length) return [];
  return [...new Set((f.description ?? "").match(/\b[a-z]{2}_[a-z0-9]+(?:_[a-z0-9]+)+\b/gi) ?? [])];
}

/** 音色库里要列的音色（带名称、性别、风格）。schema 给了音色枚举就以它为准 */
export function voiceLibraryOf(m: CatalogModel): VoiceItem[] {
  const sc = m.paramSchema; const fam = voiceFamily(m);
  // 豆包语音 2.0 的音色是自由填写的字符串，音色库只在上游：2026-10-03 起把上游音色库的 36 个豆包音色收进
  // voice_presets.json（family=doubao），有这一族的预置表就用它；描述里举的那一个 id 只在没有预置表时兜底
  const familyPresets = fam === "doubao" ? PRESETS.filter((p) => p.family === fam) : [];
  if (familyPresets.length && !sc.voice?.enum?.length && !sc.voice?.options?.length) return familyPresets.map((p) => ({ id: p.id, name: p.name, gender: p.gender, language: p.language, styles: p.styles }));
  const described = !/gpt|tts-1|openai/i.test(m.id) ? describedVoices(m) : [];
  const schemaVoices = (sc.voice?.options?.map((o) => String(o.value)) ?? sc.voice?.enum)?.map(String) ?? (described.length ? described : undefined);
  if (fam === "openai" || schemaVoices) return (schemaVoices ?? Object.keys(OPENAI_DESC)).map((id) => {
    const p = PRESETS.find((x) => x.id === id); const d = OPENAI_DESC[id];
    if (described.includes(id)) return { id, name: id, gender: /female/i.test(id) ? "female" : /male/i.test(id) ? "male" : undefined, language: id.slice(0, 2).toLowerCase() };
    return { id, name: sc.voice?.options?.find((o) => String(o.value) === id)?.label ?? (id[0].toUpperCase() + id.slice(1)), gender: p?.gender, language: p?.language, styles: d?.[0] ?? p?.styles, description: d?.[1] };
  });
  return PRESETS.filter((p) => p.family === fam).map((p) => ({ id: p.id, name: p.name, gender: p.gender, language: p.language, styles: p.styles }));
}

/** 这个模型实际可用的音色 id（和界面音色库同源）。提交时必须按它校验：
 *  界面显示的是海螺音色，却默认发 openai 的 "alloy"，上游会直接报「音色不存在」，作品必失败。 */
export function voicesOf(m: CatalogModel): string[] { return voiceLibraryOf(m).map((v) => v.id); }

/** 取一个当前模型认的值：用户选过且仍然合法就用它，否则回落到 schema 默认 / 第一个合法值 */
export function validOf(list: string[] | undefined, picked: string | undefined, def: string | undefined) {
  if (picked && (!list?.length || list.includes(picked))) return picked;
  if (def && (!list?.length || list.includes(def))) return def;
  return list?.[0];
}
