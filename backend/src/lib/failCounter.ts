/**
 * 登录/注册凭据失败滑动窗计数器 · 进程级内存双簿(SOFT-HOLD 默认开启)
 * ====================================================================
 * 主轴 byComboKey=`${ip}|${loweredName|"__anon__"}` ── 堵「针对单一账号慢速爆破」
 * 总线 byIpOnly=`${ip}`                              ── 堵「同一 IP 打遍各异账号分散扫描」
 *
 * 任一维度越阈即对该 combo/ip 启动 softHold:
 *   在 FAIL_WINDOW_MS 余命期内对所有相关提交恒置 require=true 直至一次成功过码伴随成功业务方告解除.
 *   (防止攻方"凑满 N 次换号绕过阈值后重新免码")
 *
 * 工程形态与 middleware/rateLimiter.ts 共用 Map+setInterval 心智模型便于维护者一致认知.
 */

interface CounterCell {
  count: number;
  windowStartMs: number;
  holdUntilMs: number; // >0 表示处软持守态需验码直至自然超窗或 releaseHolds 清零
}

export const FAIL_WINDOW_MS = 900_000; // 统计滑窗 15 分钟
export const COMBO_FAIL_TRIG = 3; // 组合键越阈
export const IP_TOTAL_TRIG = 12; // 单 IP 越阈
export const SOFT_HOLD = true;

const comboStore = new Map<string, CounterCell>();
const ipStore = new Map<string, CounterCell>();

if (!process.env.DISABLE_FAILCOUNTER_SWEEPER) {
  const sweeperTimer = setInterval(() => {
    const now = Date.now();
    for (const m of [comboStore, ipStore]) {
      for (const [k, cell] of m) {
        const expireAt = Math.max(
          cell.windowStartMs + FAIL_WINDOW_MS,
          cell.holdUntilMs,
        );
        if (expireAt <= now) m.delete(k);
      }
    }
  }, 60_000);
  sweeperTimer.unref?.();
}

function getOrCreate(map: Map<string, CounterCell>, key: string): CounterCell {
  let cell = map.get(key);
  const now = Date.now();
  if (!cell) {
    cell = { count: 0, windowStartMs: now, holdUntilMs: 0 };
    map.set(key, cell);
  }
  // 窗口已滚出新周期则归零重计(holdUntilMs 的判定交由 needsCaptchaNow 自理)
  if (cell.windowStartMs + FAIL_WINDOW_MS <= now) {
    cell.count = 0;
    cell.windowStartMs = now;
  }
  return cell;
}

function anonIfEmpty(name?: string | null): string {
  if (!name) return "__anon__";
  const s = String(name).trim().toLowerCase();
  return s.length > 0 ? s : "__anon__";
}

export function makeComboKey(ip: string, name?: string | null): string {
  return `${ip}|${anonIfEmpty(name)}`;
}

/** 业务侧任一凭据类失败回调一次以累加计数并视情况启动持守 */
export function markFailure(comboKey: string, ip: string): void {
  const cCombo = getOrCreate(comboStore, comboKey);
  cCombo.count += 1;
  const cIp = getOrCreate(ipStore, ip);
  cIp.count += 1;

  if (SOFT_HOLD && (cCombo.count >= COMBO_FAIL_TRIG || cIp.count >= IP_TOTAL_TRIG)) {
    const until = Math.max(cCombo.windowStartMs, cIp.windowStartMs) + FAIL_WINDOW_MS;
    cCombo.holdUntilMs = Math.max(cCombo.holdUntilMs, until);
    cIp.holdUntilMs = Math.max(cIp.holdUntilMs, until);
  }
}

export type NeedReason = "FAIL_THRESHOLD" | "IP_BUSY";

/** 判此刻该提交是否必须附带有效验码才予受理 */
export function needsCaptchaNow(
  comboKey: string,
  ip: string,
): { required: boolean; reason: NeedReason | null } {
  const now = Date.now();
  const cCombo = comboStore.get(comboKey);
  const cIp = ipStore.get(ip);

  if (SOFT_HOLD) {
    if (cCombo && cCombo.holdUntilMs > now)
      return { required: true, reason: "FAIL_THRESHOLD" };
    if (cIp && cIp.holdUntilMs > now)
      return { required: true, reason: "IP_BUSY" };
  }
  if (cCombo && cCombo.count >= COMBO_FAIL_TRIG)
    return { required: true, reason: "FAIL_THRESHOLD" };
  if (cIp && cIp.count >= IP_TOTAL_TRIG)
    return { required: true, reason: "IP_BUSY" };
  return { required: false, reason: null };
}

/** 成功的业务路径应调用以解除该账号/ip 的持守,令下一轮正常免码回归基线体验 */
export function releaseHolds(comboKey: string, ip: string): void {
  const cCombo = comboStore.get(comboKey);
  const cIp = ipStore.get(ip);
  if (cCombo) {
    cCombo.count = 0;
    cCombo.windowStartMs = Date.now();
    cCombo.holdUntilMs = 0;
  }
  if (cIp) {
    cIp.count = 0;
    cIp.windowStartMs = Date.now();
    cIp.holdUntilMs = 0;
  }
}

/** 测试辅助快照 */
export function snapshotForTest() {
  return {
    combo: [...comboStore.entries()],
    ip: [...ipStore.entries()],
  };
}
