/** Navigation hints only, never authorization. All destination APIs must still authenticate. */
export const LOGIN_RETURN_KEY = "xoi.login-return.v1";
export const LOGIN_RETURN_TTL = 30 * 60 * 1000;
export const DEFAULT_LOGIN_TARGET = "/#/aiAssistant";
const mainRoutes = new Set(["project", "task", "novel", "script", "scriptAgent", "cornerScape", "production", "editor", "assets", "director3d", "canvas", "aiAssistant", "square", "viral-replicate", "skills"]);
const consoleRoutes = /^(?:reseller(?:\/[A-Za-z0-9_-]+)*|agent-apply|topup|usage|team)$/;

export function normalizeLoginTarget(raw: unknown): string {
  if (typeof raw !== "string" || !raw || raw.length > 4096 || raw !== raw.trim()) return DEFAULT_LOGIN_TARGET;
  let decoded = raw;
  try {
    for (let i = 0; i < 4; i++) {
      if (/[\\\u0000-\u0020\u007f]/.test(decoded) || !/^\/(?!\/)/.test(decoded)) return DEFAULT_LOGIN_TARGET;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (i === 3) return DEFAULT_LOGIN_TARGET;
    }
    const url = new URL(raw, "https://navigation.invalid");
    if (url.origin !== "https://navigation.invalid") return DEFAULT_LOGIN_TARGET;
    // URL normalizes dot segments: disallow rather than silently reinterpret them.
    if (/(?:^|\/)\.{1,2}(?:\/|[?#]|$)/.test(decoded)) return DEFAULT_LOGIN_TARGET;
    if (url.pathname === "/" && url.hash.startsWith("#/")) {
      const hashPath = url.hash.slice(2).split(/[?#]/, 1)[0];
      return mainRoutes.has(hashPath) && !url.search ? "/" + url.hash : DEFAULT_LOGIN_TARGET;
    }
    if (url.hash) return DEFAULT_LOGIN_TARGET;
    const path = url.pathname.replace(/^\/console\//, "/").slice(1);
    if (consoleRoutes.test(path)) return `/console/${path}${url.search}`;
    if (mainRoutes.has(path)) return `/#/${path}${url.search}`;
  } catch { /* Malformed input always falls back to the workspace. */ }
  return DEFAULT_LOGIN_TARGET;
}

type NavigationWindow = Pick<Window, "location" | "history" | "sessionStorage">;
function save(target: string, win: NavigationWindow): boolean {
  try {
    win.sessionStorage.setItem(LOGIN_RETURN_KEY, JSON.stringify({ target, at: Date.now() }));
    return true;
  } catch { return false; }
}

/** This tab only. Storage-blocked browsers retain a validated query fallback. */
export function createLoginUrl(raw: string, options: { expired?: boolean; signup?: boolean } = {}, win: NavigationWindow = window): string {
  const target = normalizeLoginTarget(raw);
  const params = new URLSearchParams();
  if (!save(target, win)) params.set("next", target);
  if (options.expired) params.set("expired", "1");
  return `/console/${options.signup ? "signup" : "login"}${params.size ? "?" + params : ""}`;
}

/** Migrate bookmarks before mounting the router; preserve referral/account-switch flags. */
export function prepareLoginReturn(win: NavigationWindow = window): void {
  if (!/^\/console\/(login|signup)\/?$/.test(win.location.pathname)) return;
  const url = new URL(win.location.href);
  if (!url.searchParams.has("next")) return;
  const target = normalizeLoginTarget(url.searchParams.get("next"));
  if (!save(target, win)) return;
  url.searchParams.delete("next");
  win.history.replaceState(win.history.state, "", url.pathname + url.search + url.hash);
}

export function readLoginReturn(win: NavigationWindow = window): string {
  const query = new URLSearchParams(win.location.search);
  if (query.has("next")) return normalizeLoginTarget(query.get("next"));
  try {
    const item = JSON.parse(win.sessionStorage.getItem(LOGIN_RETURN_KEY) || "null");
    const age = Date.now() - item?.at;
    if (typeof item?.at === "number" && Number.isFinite(age) && age >= 0 && age < LOGIN_RETURN_TTL) return normalizeLoginTarget(item.target);
    win.sessionStorage.removeItem(LOGIN_RETURN_KEY);
  } catch { /* Workspace is the safe default. */ }
  return DEFAULT_LOGIN_TARGET;
}

export function consumeLoginReturn(win: NavigationWindow = window): string {
  const target = readLoginReturn(win);
  try { win.sessionStorage.removeItem(LOGIN_RETURN_KEY); } catch { /* optional storage */ }
  return target;
}
