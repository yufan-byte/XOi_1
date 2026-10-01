/**
 * Canvas 墨水擦除彩蛋 —— 共享 composable
 * ------------------------------------------------------------
 * 鼠标划过 hero 容器即在覆盖其上的画布里擦出半透雾纱孔洞,
 * 孔洞随时间径向扩散并淡出;每帧以低浓度(约三分之一)雾纱
 * 重铺底面,既保证擦痕可消、又避免整屏被近乎纯白涂层刷平致发闷。
 *
 * 经多轮校参定型的参数(MASK_ALPHA=.34 等)直接作为默认值,
 * 登录/注册两侧共用此一份,杜绝分叉维护。
 *
 * @param hero   监听鼠标事件的容器元素(canvas 尺寸据此 resize)
 * @param canvas 绘制雾纱的画布元素(CSS 中应置 pointer-events:none 以免阻断前景交互)
 * @param options 可选微调项(一般留默认即可)
 * @returns cleanup 函数 —— 组件卸载时调用以移除监听并停掉 RAF
 */
export interface InkMaskOptions {
  /** 雾纱底色 RGB 字符串 */
  mask?: string;
  /** 雾纱浓度 (0~1);过低则擦痕过曝露出底层过多,过高发闷奶白;默认 .34 */
  maskAlpha?: number;
  /** 单点起始半径(px) */
  rStart?: number;
  /** 单点最大半径上限基准(px) */
  rEnd?: number;
  /** 最大半径随机扰动幅度比 */
  rVary?: number;
  /** 单个擦痕生命周期(ms) */
  lifetime?: number;
  /** 连续轨迹打点的最小间距阈值(px) */
  stampStep?: number;
  /** 同时在场的最大打点数 */
  maxStamps?: number;
}

interface InkStamp {
  born: number;
  rmax: number;
  seed: number;
  x: number;
  y: number;
}

const _noop = (): void => {};

/**
 * 取得一个带默认值的墨水遮罩实例。
 * 当 hero 或 canvas 为空时返回空操作 cleanup,保证挂载期 ref 尚未就绪时不报错。
 */
export function useInkMask(
  hero: HTMLElement | null | undefined,
  canvas: HTMLCanvasElement | null | undefined,
  options: InkMaskOptions = {},
): () => void {
  if (!hero || !canvas) return _noop;

  // 经上方早退式 guard 收口后,rawContext 与 canvas 此刻必非空,
  // 但 TS 的 control-flow narrowing 默认不向下方「嵌套函数」体内传播 ──
  // 故再借两枚显式标注恒非空的具名常量承接,resize/carveInk/loop 等闭包内
  // 引用的 declared type 即确定为 non-null,绕过跨函数边界收窄丢失之限。
  // （参照本函数已有的 heroEl 别名范式,symmetric 补齐 canvas 与 ctx 两路。）
  const rawContext: CanvasRenderingContext2D | null = canvas.getContext("2d");
  if (!rawContext) return _noop;
  const ctx: CanvasRenderingContext2D = rawContext;
  const hostEl: HTMLCanvasElement = canvas;

  const {
    mask = "252, 250, 248",
    maskAlpha = 0.34,
    rStart = 8,
    rEnd = 128,
    rVary = 0.45,
    lifetime = 520,
    stampStep = 12,
    maxStamps = 160,
  } = options;

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  let raf = 0;
  let running = false;
  let lastX: number | null = null;
  let lastY: number | null = null;
  const stamps: InkStamp[] = [];

  const heroEl = hero as HTMLElement;

  function resize(): void {
    const rect = heroEl.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width <= 0 || height <= 0) return;
    // eslint-disable-next-line no-param-reassign
    hostEl.width = Math.round(width * DPR);
    // eslint-disable-next-line no-param-reassign
    hostEl.height = Math.round(height * DPR);
    hostEl.style.width = `${width}px`;
    hostEl.style.height = `${height}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${mask}, ${maskAlpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  function addStamp(x: number, y: number): void {
    stamps.push({
      born: performance.now(),
      rmax: rEnd * (1 - rVary / 2 + Math.random() * rVary),
      seed: Math.random() * 1000,
      x,
      y,
    });
    if (stamps.length > maxStamps) stamps.shift();
  }

  function stampAlong(x: number, y: number): void {
    if (lastX == null || lastY == null) {
      addStamp(x, y);
    } else {
      const dx = x - lastX;
      const dy = y - lastY;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / stampStep));
      for (let i = 1; i <= steps; i += 1) {
        addStamp(lastX + (dx * i) / steps, lastY + (dy * i) / steps);
      }
    }
    lastX = x;
    lastY = y;
  }

  function carveInk(
    x: number,
    y: number,
    r: number,
    alpha: number,
    seed: number,
  ): void {
    const gradient = ctx.createRadialGradient(x, y, r * 0.25, x, y, r);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gradient.addColorStop(0.58, `rgba(0,0,0,${alpha * 0.9})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    const segments = 32;
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const wobble =
        1 +
        Math.sin(angle * 3.1 + seed) * 0.08 +
        Math.sin(angle * 7.3 + seed * 0.37) * 0.045;
      const radius = r * wobble;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function loop(): void {
    const now = performance.now();
    const width = hostEl.width / DPR;
    const height = hostEl.height / DPR;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${mask}, ${maskAlpha})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-out";

    for (let i = stamps.length - 1; i >= 0; i -= 1) {
      const t = (now - stamps[i].born) / lifetime;
      if (t >= 1) {
        stamps.splice(i, 1);
        continue;
      }
      const ease = 1 - Math.pow(1 - t, 3);
      const radius = rStart + (stamps[i].rmax - rStart) * ease;
      const alpha = 1 - t * t;
      carveInk(stamps[i].x, stamps[i].y, radius, alpha, stamps[i].seed);
    }

    if (running || stamps.length) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = 0;
    }
  }

  function start(): void {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function onMouseEnter(event: MouseEvent): void {
    running = true;
    const rect = heroEl.getBoundingClientRect();
    lastX = event.clientX - rect.left;
    lastY = event.clientY - rect.top;
    stampAlong(lastX, lastY);
    start();
  }

  function onMouseMove(event: MouseEvent): void {
    const rect = heroEl.getBoundingClientRect();
    stampAlong(event.clientX - rect.left, event.clientY - rect.top);
    start();
  }

  function onMouseLeave(): void {
    running = false;
    lastX = null;
    lastY = null;
    start();
  }

  resize();
  window.addEventListener("resize", resize);
  heroEl.addEventListener("mouseenter", onMouseEnter);
  heroEl.addEventListener("mousemove", onMouseMove);
  heroEl.addEventListener("mouseleave", onMouseLeave);

  return () => {
    window.cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    heroEl.removeEventListener("mouseenter", onMouseEnter);
    heroEl.removeEventListener("mousemove", onMouseMove);
    heroEl.removeEventListener("mouseleave", onMouseLeave);
  };
}

export default useInkMask;
