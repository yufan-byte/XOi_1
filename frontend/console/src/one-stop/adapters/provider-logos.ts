// 一站式工作区的模型品牌 logo：与主站 components/modelSelect.vue 同一套识别规则，
// 直接引用主站 assets/providers 下的图标（构建时一并打进 /one-stop/assets）。
import deepseek from "../../../../src/assets/providers/deepseek.webp";
import anthropic from "../../../../src/assets/providers/anthropic.webp";
import volcengine from "../../../../src/assets/providers/volcengine.webp";
import jimeng from "../../../../src/assets/providers/jimeng.webp";
import kling from "../../../../src/assets/providers/kling.webp";
import zhipu from "../../../../src/assets/providers/zhipu.webp";
import chatglm from "../../../../src/assets/providers/chatglm.webp";
import qwen from "../../../../src/assets/providers/qwen.webp";
import openai from "../../../../src/assets/providers/openai.webp";
import gemini from "../../../../src/assets/providers/gemini.webp";
import minimax from "../../../../src/assets/providers/minimax.webp";
import hailuo from "../../../../src/assets/providers/hailuo.webp";
import vidu from "../../../../src/assets/providers/vidu.webp";
import moonshot from "../../../../src/assets/providers/moonshot.webp";
import kimi from "../../../../src/assets/providers/kimi.webp";
import hunyuan from "../../../../src/assets/providers/hunyuan.webp";
import wenxin from "../../../../src/assets/providers/wenxin.webp";
import spark from "../../../../src/assets/providers/spark.webp";
import baichuan from "../../../../src/assets/providers/baichuan.webp";
import yi from "../../../../src/assets/providers/yi.webp";
import stepfun from "../../../../src/assets/providers/stepfun.webp";
import meta from "../../../../src/assets/providers/meta.webp";
import mistral from "../../../../src/assets/providers/mistral.webp";
import grok from "../../../../src/assets/providers/grok.webp";
import sora from "../../../../src/assets/providers/sora.webp";
import runway from "../../../../src/assets/providers/runway.webp";
import pika from "../../../../src/assets/providers/pika.webp";
import luma from "../../../../src/assets/providers/luma.webp";
import pixverse from "../../../../src/assets/providers/pixverse.webp";
import flux from "../../../../src/assets/providers/flux.webp";
import midjourney from "../../../../src/assets/providers/midjourney.webp";
import stability from "../../../../src/assets/providers/stability.webp";

const logos: Record<string, string> = {
  deepseek,
  anthropic,
  volcengine,
  jimeng,
  kling,
  zhipu,
  chatglm,
  qwen,
  openai,
  gemini,
  minimax,
  hailuo,
  vidu,
  moonshot,
  kimi,
  hunyuan,
  wenxin,
  spark,
  baichuan,
  yi,
  stepfun,
  meta,
  mistral,
  grok,
  sora,
  runway,
  pika,
  luma,
  pixverse,
  flux,
  midjourney,
  stability,
};

// 与主站 modelProviderRules 同源的精简版：按「系列 / 名称 / 模型 id」依次匹配
const rules: Array<{ pattern: RegExp; logo: string }> = [
  { pattern: /gpt|o1|o3|o4|openai|chatgpt/i, logo: logos.openai },
  { pattern: /claude|anthropic/i, logo: logos.anthropic },
  { pattern: /deep[-_ ]?seek/i, logo: logos.deepseek },
  { pattern: /gemini|veo/i, logo: logos.gemini },
  { pattern: /qwen|qwq|tongyi|通义|wanx|万相|wan/i, logo: logos.qwen },
  { pattern: /cog[-_ ]?view|cog[-_ ]?video|glm|chatglm|zhipu|智谱/i, logo: logos.chatglm },
  { pattern: /doubao|see[-_ ]?dream|see[-_ ]?dance|seedream|seedance|volc|火山|豆包/i, logo: logos.volcengine },
  { pattern: /kling|可灵/i, logo: logos.kling },
  { pattern: /jimeng|即梦/i, logo: logos.jimeng },
  { pattern: /vidu/i, logo: logos.vidu },
  { pattern: /grok|xai/i, logo: logos.grok },
  { pattern: /mini[-_ ]?max|abab/i, logo: logos.minimax },
  { pattern: /hai[-_ ]?luo|海螺/i, logo: logos.hailuo },
  { pattern: /moon[-_ ]?shot|kimi|月之暗面/i, logo: logos.moonshot },
  { pattern: /step[-_ ]?fun|阶跃/i, logo: logos.stepfun },
  { pattern: /spark|星火|讯飞/i, logo: logos.spark },
  { pattern: /hun[-_ ]?yuan|混元|腾讯/i, logo: logos.hunyuan },
  { pattern: /ernie|文心|wen[-_ ]?xin/i, logo: logos.wenxin },
  { pattern: /bai[-_ ]?chuan|百川/i, logo: logos.baichuan },
  { pattern: /零一|\byi\b|yi-/i, logo: logos.yi },
  { pattern: /mistral|mixtral|codestral/i, logo: logos.mistral },
  { pattern: /llama|meta/i, logo: logos.meta },
  { pattern: /stable[-_ .]?diffusion|stability|sdxl|sd3/i, logo: logos.stability },
  { pattern: /luma|dream[-_ .]?machine/i, logo: logos.luma },
  { pattern: /runway|gen-[23]/i, logo: logos.runway },
  { pattern: /pika/i, logo: logos.pika },
  { pattern: /sora/i, logo: logos.sora },
  { pattern: /flux/i, logo: logos.flux },
  { pattern: /mid[-_ ]?journey|\bmj\b/i, logo: logos.midjourney },
  { pattern: /pix[-_ ]?verse/i, logo: logos.pixverse },
];

/** 依次用 系列 → 名称 → 模型 id 匹配品牌 logo；认不出来返回空串，调用方回落到分类图标 */
export function providerLogoFor(series?: string, name?: string, id?: string): string {
  for (const source of [series || "", name || "", id || ""]) {
    const text = source.trim();
    if (!text) continue;
    const hit = rules.find((rule) => rule.pattern.test(text));
    if (hit && hit.logo) return hit.logo;
  }
  return "";
}
