import { SESSION_SIGNAL_KEY, sessionSignal } from './session';

/** Credentials are never part of a cache/store name. A generation also detects A→B→A switches. */
export class AccountBoundary {
  private token: string;
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(private read: () => string) { this.token = read(); }
  capture() {
    const token = this.read();
    if (token !== this.token) {
      this.token = token; this.generation++;
      for (const notify of [...this.listeners]) notify();
    }
    return { token, generation: this.generation };
  }
  current(owner: { token: string; generation: number }) {
    const now = this.capture();
    return now.token === owner.token && now.generation === owner.generation;
  }
  assert(owner: { token: string; generation: number }) {
    if (!this.current(owner)) throw new DOMException('账号已切换，已忽略旧账号的请求结果', 'AbortError');
  }
  subscribe(notify: () => void) { this.listeners.add(notify); return () => { this.listeners.delete(notify); }; }
}

// F3：比较基准换成**非敏感会话信号**（uid:nonce）。凭据本身已进 httpOnly cookie，JS 读不到，
// 而「账号有没有被换掉」这件事仍然需要一个本地可见的信号 —— 信号就干这个。
export const accountBoundary = new AccountBoundary(() => typeof localStorage === 'undefined' ? '' : sessionSignal());
let installed = false;
/** Another tab/embedded console can change credentials without updating this tab's Pinia tree. */
export function installAccountBoundary() {
  if (installed) return;
  installed = true;
  let owner = accountBoundary.capture();
  const check = () => {
    if (accountBoundary.current(owner)) return;
    owner = accountBoundary.capture();
    // Hide old project/media immediately, before navigation or an asynchronous old response.
    document.getElementById('app')?.replaceChildren();
    window.location.reload();
  };
  // 监听新信号键；保留 token 键是为了接住控制台/画布等还没迁移过来的写入方。
  window.addEventListener('storage', event => { if (event.key === SESSION_SIGNAL_KEY || event.key === 'token' || event.key === null) check(); });
  window.addEventListener('pageshow', check);
  window.addEventListener('focus', check);
}
