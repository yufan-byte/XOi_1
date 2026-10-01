/**
 * 数字 SVG 验证码服务 · 进程级内存簿,TTL 自销毁语义恰合短命码场景。
 * ============================================================
 * - createCaptcha():产出 {id,svg,text} 三件套;
 *     · svg 是 XML 文本串供前端 base64 内联渲染(`data:image/svg+xml;base64,...`),
 *       **全程零磁盘 IO**;
 *     · text 仅存于内部 answerStore 待 verifyAndConsume() 比对,**严禁外流到任何 HTTP 响应体**,
 *       否则前端可直接读到答案使防爆破形同虚设 —— 调用方构造 res.data 时只能挑取 id/svg 两键!
 * - 定时清扫过期残留答案(setInterval 复用 rateLimiter.ts 既例范式)。
 *
 * 进程重启即清空 → 攻击者无法跨重启 replay 陈码;对验证码场景反而是正确语义。
 */
import svgCaptcha from "svg-captcha";

const CAPTCHA_TTL_MS = 120_000; // 单张码存活窗口(2 分钟)
const CLEAN_INTERVAL_MS = 30_000; // 清扫周期
export const CAPTCHA_LEN_DEFAULT = 6;

interface CaptchaRecord {
  text: string;
  expiresTs: number;
}
const store = new Map<string, CaptchaRecord>();

let _idSeq = 0;
function newId(prefix = ""): string {
  _idSeq += 1;
  return `${prefix}${Date.now().toString(36)}-${_idSeq.toString(
    36,
  )}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// 与 rateLimiter 同款 sweeper:不阻止进程退出(unref)
if (!process.env.DISABLE_CAPTCHA_SWEEPER) {
  const sweeperTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, rec] of store) {
      if (rec.expiresTs <= now) store.delete(id);
    }
  }, CLEAN_INTERVAL_MS);
  sweeperTimer.unref?.();
}

interface CreateOptions {
  size?: number;
  noise?: number;
  background?: string;
}

/** 产出一张新鲜数字 SVG 验证码并登记进册;text 切勿外泄给前端! */
export function createCaptcha(opts: CreateOptions = {}): {
  id: string;
  svg: string;
  text: string;
} {
  const c = svgCaptcha.create({
    size: opts.size ?? CAPTCHA_LEN_DEFAULT,
    noise: opts.noise ?? 2,
    color: false,
    ignoreChars: "0O1lIioQ",
    width: 132,
    height: 44,
    fontSize: 48,
    background: opts.background ?? "#f7f6fd",
  });
  const id = newId("cap-");
  store.set(id, {
    text: String(c.text).toLowerCase(),
    expiresTs: Date.now() + CAPTCHA_TTL_MS,
  });
  return { id, svg: String(c.data), text: String(c.text) };
}

/**
 * 核验输入是否匹配指定 id 关联的正确文本;**命中与否均从册中删除**,杜绝单张码被穷举试错复用。
 */
export function verifyAndConsume(
  id: string | undefined | null | void,
  input: string | undefined | null | void,
): boolean {
  if (!id || !input || typeof input !== "string") return false;
  const rec = store.get(id);
  if (!rec) return false;
  if (rec.expiresTs <= Date.now()) {
    store.delete(id);
    return false;
  }
  const ok =
    input.trim().toLowerCase() === rec.text.toLowerCase();
  store.delete(id);
  return ok;
}

/** 测试观测用 */
export function activeCountForTest(): number {
  return store.size;
}

export default { createCaptcha, verifyAndConsume };
