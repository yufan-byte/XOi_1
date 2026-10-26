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

export const accountBoundary = new AccountBoundary(() => typeof localStorage === 'undefined' ? '' : localStorage.getItem('token') || '');
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
  window.addEventListener('storage', event => { if (event.key === 'token' || event.key === null) check(); });
  window.addEventListener('pageshow', check);
  window.addEventListener('focus', check);
}
