"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "从超级智能体开始", body: "把目标说清楚就行——它自己拆解步骤、调用工具，直接给出成果：文档、图片、视频、网页都能做。点「下一步」带你进去看看。", target: "[data-tour=super-agent]" },
  { title: "模型可以自己选，也可以交给它", body: "在左侧列表挑一个模型；拿不准就用「稳定优先」策略——发送时它按任务自动挑可用渠道。图片 / 视频 / 音频模型同理。", target: "[data-tour=model-list]" },
  { title: "需要时挂一个 Skill", body: "Skill 是一套现成的做事方法。挂上之后它按这套方法处理你的需求，省去每次反复描述要求。", target: "[data-tour=skills]" },
  { title: "要最新资料就开联网", body: "默认关着。涉及实时行情、今天的新闻、刚发布的资料时打开它，它会先联网搜再动手。", target: "[data-tour=web]" },
  { title: "作品和项目在这里管", body: "顶栏「我的作品」集中了图片 / 视频 / 音频作品；各智能体的项目在各自工作台的历史记录里。", target: "[data-tour=works]" },
  { title: "试着发第一条", body: "在输入框写一句需求再发送。就从这一条开始。", target: "[data-tour=composer]" },
];
const KEY = "mc.tour.done";
const PAD = 10; // 高亮框相对目标的外扩
const CARD_W = 320;

type Box = { top: number; left: number; width: number; height: number };

/** 新手引导（6 步）：参考站样式——描边高亮 + 9999px 暗色投影遮罩 + 320px 气泡卡片 */
export function OnboardingTour() {
  const path = usePathname(); const [step, setStep] = useState<number>(-1); const [box, setBox] = useState<Box | null>(null); const [cardH, setCardH] = useState(200);
  useEffect(() => {
    if (path !== "/chat") return;
    try { const v = localStorage.getItem(KEY); if (v === "done" || (v && Number(v) > Date.now())) return; } catch {}
    // 等公告等弹窗关闭后再开始引导
    const t0 = Date.now();
    const id = setInterval(() => { if (Date.now() - t0 > 2600 && !document.querySelector("[role=dialog]")) { clearInterval(id); document.documentElement.dataset.onboarding = "1"; setStep(0); } }, 800);
    return () => clearInterval(id);
  }, [path]);
  useLayoutEffect(() => {
    if (step < 0) return;
    const measure = () => {
      const el = document.querySelector(STEPS[step].target);
      if (!el) { setBox(null); return; }
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      // 元素存在但不可见（移动端侧栏收起、display:none）时 rect 全是 0，
      // 高亮框就会打在左上角的空白处；这时按「没有目标」处理，只显示说明卡。
      if (r.width < 1 || r.height < 1) { setBox(null); return; }
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    measure();
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step]);
  if (step < 0) return null;
  const s = STEPS[step];
  const done = (today?: boolean) => { delete document.documentElement.dataset.onboarding; try { localStorage.setItem(KEY, today ? String(Date.now() + 86400000) : "done"); } catch {} setStep(-1); };
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth; const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  let card: { top: number; left: number };
  if (box) {
    const below = box.top + box.height + 4; const above = box.top - cardH - 4;
    card = { top: below + cardH <= vh - 8 || above < 8 ? Math.min(below, vh - cardH - 8) : above, left: Math.min(vw - CARD_W - 8, Math.max(8, box.left + PAD)) };
  } else card = { top: vh / 2 - cardH / 2, left: vw / 2 - CARD_W / 2 };
  const last = step === STEPS.length - 1;
  return (
    // 根节点不接事件：它铺满全屏，接了就会把引导之外的所有点击都吞掉（用户以为页面卡死）。
    // 遮罩和卡片各自开启自己的事件；Esc 关闭。
    <div role="dialog" aria-modal="true" aria-label={s.title} data-tour-overlay className="pointer-events-none fixed inset-0 z-[1000]"
      onKeyDown={(e) => { if (e.key === "Escape") done(true); }}>
      {box ? (
        <div aria-hidden className="pointer-events-none fixed rounded-xl outline-2 outline-primary transition-all duration-200 [outline-style:solid]" style={{ ...box, boxShadow: "0 0 0 9999px rgba(8,8,20,0.55)" }} />
      ) : <div className="pointer-events-auto fixed inset-0 bg-[rgba(8,8,20,0.55)]" onClick={() => done(true)} />}
      <div ref={(n) => { if (n && Math.abs(n.offsetHeight - cardH) > 1) setCardH(n.offsetHeight); }} tabIndex={-1} className="pointer-events-auto fixed z-[1001] rounded-[14px] border border-border/60 bg-card p-4 text-card-foreground shadow-2xl" style={{ width: `min(${CARD_W}px, 100vw - 1rem)`, ...card }}>
        <button type="button" aria-label="跳过" onClick={() => done(false)} className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        <div className="mb-1 text-[11px] font-semibold tracking-wide text-primary">{step + 1} / {STEPS.length}</div>
        <h3 className="pr-6 text-[15px] font-semibold leading-snug text-foreground">{s.title}</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-card-foreground/85">{s.body}</p>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-1.5" aria-hidden>{STEPS.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30")} />)}</div>
          <div className="flex items-center gap-1.5">
            {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground">上一步</button>
              : <button type="button" onClick={() => done(false)} className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground">跳过</button>}
            <button type="button" onClick={() => (last ? done(false) : setStep(step + 1))} className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90">{last ? "完成" : "下一步"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
