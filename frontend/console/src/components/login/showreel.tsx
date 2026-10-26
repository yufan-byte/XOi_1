"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import gallery from "@/data/gallery_works.json";

export const SHOWREEL = [
  { eyebrow: "音乐与影像", title: "MV 动态字幕", sub: "节拍、文字与镜头的交织。" },
  { eyebrow: "角色与世界", title: "联机游戏开场", sub: "角色、场景与动作的共同表达。" },
  { eyebrow: "视觉叙事", title: "剪纸拼贴讲解", sub: "用拼贴画面展开一段讲述。" },
  { eyebrow: "材质与运动", title: "纸艺定格动画", sub: "纸雕布景中的逐帧变化。" },
  { eyebrow: "光影与镜头", title: "创意影像集", sub: "画面、文字与光影的连续呈现。" },
] as const;

type Work = { id: string; title: string; cover_url: string; cover_kind: string };
const WORKS = ((gallery as unknown as { data: Work[] }).data ?? []);

/**
 * 本地展映素材。
 *
 * 为什么不用造物那份 `gallery_works.json` 里的 `/api/media/x/<id>`：
 *   那个地址是**造物服务端的转发端点**，靠 `src/data/external-media-map.json`（2596 条）
 *   把 24 位 id 映射到上游图床；不在表里一律 404，而且必须有造物实例在跑才有效。
 *   结果是本地/生产都拿不到图，展映只剩渐变底。
 *
 * 所以这里改成**一次性把素材下载进本项目**（`public/showreel/reel-1..5.mp4`，
 * 共约 18MB，5 个都是视频，与展映固定挑 5 个媒体正好对齐），运行时零外部依赖。
 * 上游地址由上面那张表反查得到。
 *
 * ⚠️ 这 5 条是**造物站内用户的作品**，只适合做开发期占位。
 *    上线前必须换成 XOi 自己的作品，否则等于在替别家站做宣传。
 *
 * 用 BASE_URL 拼前缀（不是写死 `/console/`）：dev 与 prod 的 public 目录挂载点不同，
 * 只有 BASE_URL 两端都对。详见 README「静态资源路径规则」。
 */
const REEL_COUNT = 5;
// ?v=2 缓存击穿：reel-3/4/5 于 2026-10-02 重编码（补 bt709/tv 色彩标签 + 横版化），
// Chrome 对视频会启发式强缓存，换文件必须换 URL 才能拉到新的。
const REEL_VER = 2;
const LOCAL_REEL: { src: string; kind: "video" | "image" }[] = Array.from({ length: REEL_COUNT }, (_, i) => ({
    src: `${import.meta.env.BASE_URL}showreel/reel-${i + 1}.mp4?v=${REEL_VER}`,
    kind: "video" as const,
}));

/** 兜底：从公开作品里挑 5 个媒体（优先视频封面，不够时用图片封面补齐） */
const REMOTE_REEL: { src: string; kind: "video" | "image" }[] = (() => {
    const seen = new Set<string>();
    const out: { src: string; kind: "video" | "image" }[] = [];
    for (const w of [...WORKS.filter((w) => w.cover_kind === "video"), ...WORKS.filter((w) => w.cover_kind !== "video")]) {
        if (out.length >= SHOWREEL.length || !w.cover_url || seen.has(w.cover_url)) continue;
        seen.add(w.cover_url);
        out.push({ src: w.cover_url, kind: w.cover_kind === "video" ? "video" : "image" });
    }
    return out;
})();

/** 展映实际用的媒体：本地优先，本地素材缺失时回落到 `/api/media/x/<id>` */
export const REEL_MEDIA: { src: string; kind: "video" | "image" }[] = LOCAL_REEL.length ? LOCAL_REEL : REMOTE_REEL;

export const REEL_INTERVAL = 6000;
const pad = (n: number) => String(n + 1).padStart(2, "0");

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); const f = () => setR(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return r;
}

function Media({ i, active }: { i: number; active: boolean }) {
  const m = REEL_MEDIA[i % Math.max(1, REEL_MEDIA.length)];
  if (!m) return <div className="h-full w-full bg-gradient-to-br from-[#2a2350] to-[#0b0c14]" />;
  if (m.kind === "video") return <video key={m.src} src={m.src} muted loop playsInline autoPlay={active} preload="metadata" className="h-full w-full object-cover" aria-label={SHOWREEL[i].title} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={m.src} alt={SHOWREEL[i].title} className="h-full w-full object-cover" loading="lazy" />;
}

/** 作品展映：舞台内的作品轮播（左下字幕 + 右下计数 + 滚轮/方向键/按钮翻页）。
 *  media3d=true 时媒体由三维场景渲染（orbit-scene 的视频弧面卡，参考站同款），
 *  这里只保留舞台背景与字幕层；false 时用 DOM 卡片兜底（手机 / 减少动态 / 无 WebGL） */
export function Showreel({ index, onNext, onPrev, reduced, media3d = false }: { index: number; onNext: () => void; onPrev: () => void; reduced: boolean; media3d?: boolean }) {
  const n = SHOWREEL.length; const next = (index + 1) % n; const prev = (index - 1 + n) % n; const cur = SHOWREEL[index];
  const tilt = reduced ? "none" : "perspective(1400px) rotateY(-6deg) rotateX(2deg)";
  const grid = useMemo(() => Array.from({ length: 9 }, (_, i) => i), []);
  // 交叉淡出：记录上一个作品，主卡换内容时旧媒体以 key 触发一次 reel-crossfade 动画
  const lastRef = useRef(index);
  const [fadeFrom, setFadeFrom] = useState<number | null>(null);
  useEffect(() => {
    if (lastRef.current === index) return;
    setFadeFrom(lastRef.current); lastRef.current = index;
  }, [index]);
  return (
    <div className="absolute inset-0 overflow-hidden" data-stage-panel="work">
      {/* 曲面网格暗场（仅 DOM 兜底模式；3D 模式的背景由 WebGL 场景自绘，叠 DOM 层会灰蒙蒙） */}
      {!media3d && (
        <>
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,rgba(124,92,255,0.18),rgba(6,7,12,0)_60%)]" />
          <div aria-hidden className="absolute inset-x-[-30%] bottom-[-10%] h-[70%] [transform:perspective(900px)_rotateX(62deg)] [transform-origin:50%_100%] opacity-40" style={{ backgroundImage: "linear-gradient(rgba(180,170,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(180,170,255,0.18) 1px, transparent 1px)", backgroundSize: "88px 88px", maskImage: "radial-gradient(ellipse at 50% 100%, #000 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 100%, #000 30%, transparent 75%)" }} />
          <svg aria-hidden className="absolute inset-0 h-full w-full opacity-40" viewBox="0 0 1600 900" preserveAspectRatio="none">{grid.map((i) => <path key={i} d={`M0 ${120 + i * 80} Q 800 ${40 + i * 80} 1600 ${120 + i * 80}`} fill="none" stroke="rgba(190,180,255,0.35)" strokeWidth="1" />)}</svg>
        </>
      )}

      {!media3d && (
        <>
          {/* 候场卡（右侧 = 下一件） */}
          <div className="absolute left-1/2 top-1/2 z-10 w-[min(34vw,540px)]" style={{ transform: reduced ? "translate(52%,-50%) scale(.8)" : "translate(52%,-50%) scale(.8) perspective(1400px) rotateY(-18deg)" }}>
            <button type="button" onClick={onNext} aria-label={`下一件：${SHOWREEL[next].title}`} className="block aspect-video w-full overflow-hidden rounded-[22px] border border-white/10 bg-black/60 opacity-60 shadow-[0_30px_80px_rgba(0,0,0,0.6)] outline-none transition-opacity duration-500 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white/60">
              <Media i={next} active={false} />
            </button>
          </div>

          {/* 候场卡（左侧 = 上一件，与右侧镜像） */}
          <div className="absolute left-1/2 top-1/2 z-10 w-[min(34vw,540px)]" style={{ transform: reduced ? "translate(-152%,-50%) scale(.8)" : "translate(-152%,-50%) scale(.8) perspective(1400px) rotateY(18deg)" }}>
            <button type="button" onClick={onPrev} aria-label={`上一件：${SHOWREEL[prev].title}`} className="block aspect-video w-full overflow-hidden rounded-[22px] border border-white/10 bg-black/60 opacity-60 shadow-[0_30px_80px_rgba(0,0,0,0.6)] outline-none transition-opacity duration-500 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white/60">
              <Media i={prev} active={false} />
            </button>
          </div>

          {/* 主卡：外层负责定位与透视倾斜，内层做入场动画（pop-in 会重置 transform，不能放在同一层） */}
          <div className="absolute left-1/2 top-1/2 z-20 w-[min(50vw,800px)] transition-transform duration-700" style={{ transform: `translate(-58%,-52%) ${tilt}` }}>
            <div key={index} className="pop-in relative aspect-video w-full overflow-hidden rounded-[24px] border border-white/15 bg-black shadow-[0_40px_120px_rgba(0,0,0,0.75)]" onClick={onNext} role="button" tabIndex={0} aria-label={`${cur.title}，点击查看下一件`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNext(); } }}>
              <Media i={index} active />
              {fadeFrom !== null && fadeFrom !== index && <div key={`fade-${index}`} aria-hidden className="reel-crossfade pointer-events-none absolute inset-0"><Media i={fadeFrom} active={false} /></div>}
              <span aria-hidden className="absolute left-4 top-4 h-3.5 w-3.5 rounded-[4px] bg-[#b9f0ec] shadow-[0_0_18px_rgba(185,240,236,0.9)]" />
              <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
          </div>
        </>
      )}

      {media3d && (
        /* 3D 模式：媒体在 WebGL 里，DOM 只留点击层——
           点主卡/画面任意空白处 = 下一件；左贴边 = 上一件；右贴边 = 下一件 */
        <div className="absolute inset-0 z-10">
          <button type="button" onClick={onNext} aria-label={`下一件：${SHOWREEL[next].title}`} className="absolute inset-0 cursor-pointer outline-none" />
          <button type="button" onClick={onPrev} aria-label={`上一件：${SHOWREEL[prev].title}`} className="group absolute inset-y-0 left-0 w-[13vw] max-w-[190px] cursor-pointer outline-none">
            <span className="absolute left-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/35 text-white/70 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"><ChevronLeft size={20} /></span>
          </button>
          <button type="button" onClick={onNext} aria-label={`下一件：${SHOWREEL[next].title}`} className="group absolute inset-y-0 right-0 w-[13vw] max-w-[190px] cursor-pointer outline-none">
            <span className="absolute right-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/35 text-white/70 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"><ChevronRight size={20} /></span>
          </button>
        </div>
      )}

      {/* 左下字幕 */}
      <div key={`cap-${index}`} className="pop-in pointer-events-none absolute bottom-24 left-8 z-30 max-w-[min(70vw,520px)] md:left-12" aria-live="polite">
        <div className="text-xs tracking-[0.2em] text-white/55">{cur.eyebrow}</div>
        <h2 className="mt-2 text-3xl font-bold leading-tight md:text-5xl">{cur.title}</h2>
        <p className="mt-2 text-sm text-white/70 md:text-base">{cur.sub}</p>
      </div>

      {/* 右下计数 + 进度 */}
      <div className="pointer-events-none absolute bottom-24 right-8 z-30 w-40 text-right md:right-12" aria-hidden="true">
        <div className="text-sm tabular-nums text-white/85"><b className="text-2xl font-semibold text-white">{pad(index)}</b><span className="mx-1 text-white/40">/</span>{pad(n - 1)}</div>
        <div className="mt-2 h-px w-full overflow-hidden bg-white/15"><div key={index} className="h-full bg-white" style={reduced ? { width: `${((index + 1) / n) * 100}%` } : { animation: `reel-progress ${REEL_INTERVAL}ms linear forwards` }} /></div>
      </div>
      <style>{`@keyframes reel-progress { from { width: 0 } to { width: 100% } }@keyframes reel-crossfade { from { opacity: 1 } to { opacity: 0 } }.reel-crossfade { animation: reel-crossfade 700ms ease forwards }`}</style>
    </div>
  );
}
