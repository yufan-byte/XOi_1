/** Pure route policy, shared by the appearance boundary and theme store. */
export function consoleSurface(pathname: string, search: string, base: string) {
  const prefix = base.replace(/\/$/, "");
  const path = pathname.replace(/\/+$/, "");
  const authentication = path === `${prefix}/login` || path === `${prefix}/signup`;
  const account = path === `${prefix}/topup` || path === `${prefix}/usage`;
  const query = new URLSearchParams(search);
  const embedded = account && query.get("embed") === "1";
  const requested = query.get("theme");
  const frameTheme: "light" | "dark" | null = embedded && (requested === "light" || requested === "dark") ? requested : null;
  return { authentication, embedded, frameTheme, defaultTheme: authentication ? "dark" as const : "light" as const };
}
