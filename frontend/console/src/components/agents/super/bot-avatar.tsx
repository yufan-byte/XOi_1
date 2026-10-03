"use client";
// Bot 形象渲染：身形（SVG 路径）+ 颜色 + 情绪表情（眼睛 / 嘴巴 / 装饰）
import { cn } from "@/lib/utils";
import { COLOR_HEX, SHAPE_PATH, type BotColor, type BotEmotion, type BotShape } from "./bot-shapes";
import { useBot } from "./bot-store";

type Eye = "pill" | "half" | "closed" | "wide" | "arc" | "low" | "tiny";
interface Face { eyes: [Eye, Eye]; mouth?: "smile" | "grin" | "o" | "flat" | "frown" | "wavy" | "smirk" | "tongue"; brows?: "angry" | "sad" | "raise"; extra?: "zzz" | "sparkle" | "sweat" | "blush" | "tear" | "confetti" | "question" | "dots"; look?: [number, number] }

const FACE: Record<BotEmotion, Face> = {
  sleeping: { eyes: ["closed", "closed"], extra: "zzz" },
  waking: { eyes: ["half", "half"], mouth: "o", look: [0, 4] },
  idle: { eyes: ["pill", "pill"] },
  listening: { eyes: ["pill", "pill"], mouth: "smile", look: [4, 0] },
  thinking: { eyes: ["pill", "pill"], mouth: "flat", look: [8, -8], extra: "dots" },
  searching: { eyes: ["wide", "pill"], look: [-4, -2], extra: "question" },
  working: { eyes: ["low", "low"], mouth: "flat", extra: "sweat" },
  excited: { eyes: ["wide", "wide"], mouth: "grin", extra: "sparkle" },
  surprised: { eyes: ["wide", "wide"], mouth: "o", brows: "raise" },
  suspicious: { eyes: ["half", "low"], mouth: "flat" },
  angry: { eyes: ["pill", "pill"], mouth: "frown", brows: "angry" },
  drowsy: { eyes: ["low", "low"], mouth: "flat", extra: "zzz" },
  happy: { eyes: ["arc", "arc"], mouth: "smile" },
  curious: { eyes: ["wide", "pill"], mouth: "o", look: [6, -4] },
  confused: { eyes: ["pill", "half"], mouth: "wavy", extra: "question" },
  bored: { eyes: ["low", "low"], mouth: "flat", look: [6, 0] },
  proud: { eyes: ["arc", "arc"], mouth: "smirk", extra: "sparkle" },
  shy: { eyes: ["pill", "pill"], mouth: "smile", extra: "blush", look: [-6, 6] },
  sad: { eyes: ["pill", "pill"], mouth: "frown", brows: "sad", extra: "tear" },
  laughing: { eyes: ["arc", "arc"], mouth: "grin" },
  scared: { eyes: ["tiny", "tiny"], mouth: "wavy", extra: "sweat" },
  playful: { eyes: ["arc", "pill"], mouth: "tongue" },
  celebrate: { eyes: ["arc", "arc"], mouth: "grin", extra: "confetti" },
  smug: { eyes: ["half", "half"], mouth: "smirk" },
};

// 眼睛尺寸按原站：约 24×56（viewBox 单位），两眼中心相距 60
const L = 84, R = 144, EY = 104;
function EyeShape({ kind, cx, dx, dy }: { kind: Eye; cx: number; dx: number; dy: number }) {
  const x = cx + dx, y = EY + dy;
  switch (kind) {
    case "pill": return <rect x={x - 12} y={y - 28} width={24} height={56} rx={12} fill="#fff" />;
    case "half": return <rect x={x - 12} y={y - 2} width={24} height={28} rx={12} fill="#fff" />;
    case "low": return <rect x={x - 14} y={y + 8} width={28} height={18} rx={9} fill="#fff" />;
    case "closed": return <path d={`M${x - 16} ${y + 8} q16 14 32 0`} stroke="#fff" strokeWidth={8} strokeLinecap="round" fill="none" />;
    case "arc": return <path d={`M${x - 16} ${y + 8} q16 -20 32 0`} stroke="#fff" strokeWidth={8} strokeLinecap="round" fill="none" />;
    case "wide": return <><circle cx={x} cy={y} r={22} fill="#fff" /><circle cx={x + 4} cy={y + 2} r={9} fill="#111" /></>;
    case "tiny": return <circle cx={x} cy={y} r={8} fill="#fff" />;
  }
}
function Mouth({ kind }: { kind: NonNullable<Face["mouth"]> }) {
  const y = 158;
  switch (kind) {
    case "smile": return <path d={`M98 ${y} q16 14 32 0`} stroke="#fff" strokeWidth={5} strokeLinecap="round" fill="none" />;
    case "grin": return <path d={`M94 ${y - 4} q20 30 40 0 z`} fill="#fff" />;
    case "o": return <ellipse cx={114} cy={y + 2} rx={7} ry={9} fill="#fff" />;
    case "flat": return <path d={`M100 ${y + 2} h28`} stroke="#fff" strokeWidth={5} strokeLinecap="round" />;
    case "frown": return <path d={`M98 ${y + 8} q16 -14 32 0`} stroke="#fff" strokeWidth={5} strokeLinecap="round" fill="none" />;
    case "wavy": return <path d={`M96 ${y + 2} q8 -8 16 0 t16 0`} stroke="#fff" strokeWidth={5} strokeLinecap="round" fill="none" />;
    case "smirk": return <path d={`M100 ${y + 4} q14 6 28 -8`} stroke="#fff" strokeWidth={5} strokeLinecap="round" fill="none" />;
    case "tongue": return <><path d={`M98 ${y} q16 14 32 0`} stroke="#fff" strokeWidth={5} strokeLinecap="round" fill="none" /><ellipse cx={120} cy={y + 8} rx={7} ry={9} fill="#ff6a8b" /></>;
  }
}
function Extra({ kind }: { kind: NonNullable<Face["extra"]> }) {
  switch (kind) {
    case "zzz": return <text x={160} y={70} fontSize={30} fontWeight={700} fill="#fff" fontFamily="ui-sans-serif, system-ui">z<tspan fontSize={20} dy={-14}>z</tspan></text>;
    case "sparkle": return <><path d="M182 52 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="#ffd54a" /><path d="M46 60 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#ffd54a" /></>;
    case "sweat": return <path d="M176 84 q10 14 0 22 q-10 -8 0 -22z" fill="#8fd3ff" />;
    case "blush": return <><ellipse cx={62} cy={140} rx={14} ry={7} fill="#ff8fb1" opacity={0.85} /><ellipse cx={166} cy={140} rx={14} ry={7} fill="#ff8fb1" opacity={0.85} /></>;
    case "tear": return <path d="M160 134 q9 16 0 26 q-9 -10 0 -26z" fill="#8fd3ff" />;
    case "confetti": return <>{[[40, 40, "#ff6a8b"], [190, 36, "#ffd54a"], [200, 150, "#7c5cff"], [30, 150, "#00c972"], [120, 22, "#2a92fe"]].map(([x, y, c], i) => <rect key={i} x={x as number} y={y as number} width={8} height={8} rx={2} fill={c as string} transform={`rotate(${i * 37} ${x} ${y})`} />)}</>;
    case "question": return <text x={168} y={80} fontSize={36} fontWeight={700} fill="#fff" fontFamily="ui-sans-serif, system-ui">?</text>;
    case "dots": return <>{[0, 1, 2].map((i) => <circle key={i} cx={170 + i * 14} cy={60 - i * 6} r={4 + i} fill="#fff" opacity={0.9} />)}</>;
  }
}

/** 纯展示：根据 shape / color / emotion 画一个 Bot */
export function BotFace({ shape, color, emotion, size = 40, className }: { shape: BotShape; color: BotColor; emotion: BotEmotion; size?: number; className?: string }) {
  const f = FACE[emotion] ?? FACE.idle; const [dx, dy] = f.look ?? [0, 0];
  return (
    <svg viewBox="-15 -15 259 259" width={size} height={size} className={cn("shrink-0 overflow-visible", className)} aria-hidden="true">
      <path d={SHAPE_PATH[shape]} fill={COLOR_HEX[color]} />
      {f.brows === "angry" && <><path d="M64 60 l30 10" stroke="#fff" strokeWidth={7} strokeLinecap="round" /><path d="M164 60 l-30 10" stroke="#fff" strokeWidth={7} strokeLinecap="round" /></>}
      {f.brows === "sad" && <><path d="M64 70 l30 -8" stroke="#fff" strokeWidth={7} strokeLinecap="round" /><path d="M164 70 l-30 -8" stroke="#fff" strokeWidth={7} strokeLinecap="round" /></>}
      {f.brows === "raise" && <><path d="M68 58 q16 -12 32 0" stroke="#fff" strokeWidth={7} strokeLinecap="round" fill="none" /><path d="M128 58 q16 -12 32 0" stroke="#fff" strokeWidth={7} strokeLinecap="round" fill="none" /></>}
      <EyeShape kind={f.eyes[0]} cx={L} dx={dx} dy={dy} /><EyeShape kind={f.eyes[1]} cx={R} dx={dx} dy={dy} />
      {f.mouth && <Mouth kind={f.mouth} />}
      {f.extra && <Extra kind={f.extra} />}
    </svg>
  );
}

/** 读取用户保存的形象；emotion 为 auto 时按 `auto` 参数（运行状态推断）显示 */
export function BotAvatar({ size = 40, auto = "idle", className }: { size?: number; auto?: BotEmotion; className?: string }) {
  const bot = useBot((s) => s.bot);
  return <BotFace shape={bot.shape} color={bot.color} emotion={bot.emotion === "auto" ? auto : bot.emotion} size={size} className={className} />;
}
