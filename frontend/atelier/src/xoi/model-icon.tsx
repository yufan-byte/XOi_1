import { useState } from "react";
import { Cpu } from "lucide-react";
import openai from "../../../src/assets/providers/openai.webp";
import gemini from "../../../src/assets/providers/gemini.webp";
import doubao from "../../../src/assets/providers/doubao.webp";
import jimeng from "../../../src/assets/providers/jimeng.webp";
import claude from "../../../src/assets/providers/claude.webp";
import deepseek from "../../../src/assets/providers/deepseek.webp";
import grok from "../../../src/assets/providers/grok.webp";
import zhipu from "../../../src/assets/providers/zhipu.webp";
import qwen from "../../../src/assets/providers/qwen.webp";
import kling from "../../../src/assets/providers/kling.webp";
import vidu from "../../../src/assets/providers/vidu.webp";
import flux from "../../../src/assets/providers/flux.webp";
import minimax from "../../../src/assets/providers/minimax.webp";
import suno from "../../../src/assets/providers/suno.webp";
import midjourney from "../../../src/assets/providers/midjourney.webp";
import moonshot from "../../../src/assets/providers/moonshot.webp";
import pixverse from "../../../src/assets/providers/pixverse.webp";
import luma from "../../../src/assets/providers/luma.webp";
import runway from "../../../src/assets/providers/runway.webp";
import stability from "../../../src/assets/providers/stability.webp";

// Asset imports are bundled under /atelier-canvas/assets/, not the host's /icons/.
// Keep model matching independent of channel names (e.g. "openai::seedream").
const brands = [
    { match: /seedance|see[-_ ]?dance|jimeng|即梦/i, name: "即梦", src: jimeng },
    { match: /seedream|see[-_ ]?dream|doubao|豆包/i, name: "豆包", src: doubao },
    { match: /gemini|google|veo|nano[-_ ]?banana/i, name: "Google Gemini", src: gemini },
    { match: /gpt|openai|dall[\W_]?e|sora|^o[134](?:[-.]|$)/i, name: "OpenAI", src: openai },
    { match: /claude|anthropic/i, name: "Claude", src: claude },
    { match: /deep[-_ ]?seek/i, name: "DeepSeek", src: deepseek },
    { match: /grok|xai/i, name: "Grok", src: grok },
    { match: /glm|zhipu|cogview|cogvideo|智谱/i, name: "智谱", src: zhipu },
    { match: /qwen|qwq|tongyi|wanx|^wan(?:[-_ .\d]|$)|通义|万相/i, name: "通义", src: qwen },
    { match: /kling|可灵/i, name: "可灵", src: kling },
    { match: /vidu/i, name: "Vidu", src: vidu },
    { match: /flux|\bfx[-_ ]?kontext/i, name: "FLUX", src: flux },
    { match: /minimax|mini[-_ ]?max|hailuo|海螺/i, name: "MiniMax", src: minimax },
    { match: /suno/i, name: "Suno", src: suno },
    { match: /midjourney|^mj(?:[-_ .]|$)/i, name: "Midjourney", src: midjourney },
    { match: /moonshot|kimi/i, name: "Kimi", src: moonshot },
    { match: /pixverse/i, name: "PixVerse", src: pixverse },
    { match: /luma|dream[-_ ]?machine/i, name: "Luma", src: luma },
    { match: /runway|^gen-[234]/i, name: "Runway", src: runway },
    { match: /stability|stable[-_ .]?diffusion|sdxl|^sd3/i, name: "Stability", src: stability },
];

export function resolveModelBrand(model: string) {
    const name = (model.split("::").pop() || "").replace(/^newapi:/i, "");
    return brands.find(brand => brand.match.test(name));
}

/** One small, theme-safe badge for both picker rows and the selected model. */
export function ModelIcon({ model, className = "size-5" }: { model: string; className?: string }) {
    const brand = resolveModelBrand(model);
    const [failedSrc, setFailedSrc] = useState("");
    const loaded = brand && failedSrc !== brand.src;
    return <span data-model-icon={brand?.name || "generic"} title={brand?.name || "平台模型"}
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ${loaded ? "bg-white" : "bg-muted/60 text-muted-foreground"} ${className}`}>
        {loaded ? <img src={brand.src} alt="" width={24} height={24} decoding="async"
            className="h-full w-full object-contain" onError={() => setFailedSrc(brand.src)} />
            : <Cpu aria-hidden="true" className="size-4" />}
    </span>;
}
