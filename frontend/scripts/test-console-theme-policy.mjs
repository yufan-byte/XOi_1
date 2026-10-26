// Run: node --experimental-strip-types frontend/scripts/test-console-theme-policy.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { consoleSurface } from "../console/src/lib/console-appearance.ts";

const html = await readFile(new URL("../console/index.html", import.meta.url), "utf8");
const boot = html.match(/<script>([\s\S]*?)<\/script>/)[1].replaceAll("%BASE_URL%", "/console/");
const cases = [
  ["/console/reseller/overview", "", null, false, false],
  ["/console/team", "", null, false, false],
  ["/console/team/", "", "dark", false, true],
  ["/console/topup", "", null, false, false],
  ["/console/usage", "", "dark", false, true],
  ["/console/agent-apply", "", null, false, false],
  ["/console/login", "", null, false, true],
  ["/console/signup/", "", "light", false, false],
  ["/console/", "", "system", true, true],
  ["/console/usage", "?embed=1&theme=light", "dark", true, false],
  ["/console/topup", "?embed=1&theme=dark", "light", false, true],
  ["/console/topup", "?theme=dark", "light", false, false],
  ["/console/team", "?embed=1&theme=dark", "light", false, false],
  ["/console/usage", "?embed=1&theme=invalid", "dark", false, true],
  ["/console/team", "", "invalid", true, false],
];
let callbacks;
function bootstrap([pathname, search, saved, systemDark, expectedDark], storageBlocked = false) {
  const classes = new Set();
  const root = { dataset: {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } };
  callbacks = {};
  const elements = { "xoi-boot-message": { textContent: "正在打开 XOi…" }, "xoi-boot-retry": { hidden: true }, "xoi-boot-status": { setAttribute: (key, value) => { elements.role = [key, value]; } } };
  runInNewContext(boot, {
    document: { documentElement: root, readyState: "complete", getElementById: name => elements[name], addEventListener: () => {} },
    location: { pathname, search }, URLSearchParams,
    localStorage: { getItem: () => { if (storageBlocked) throw Error("Storage blocked"); return saved; }, setItem: () => { throw Error("Bootstrap must not write theme preferences"); } },
    matchMedia: () => ({ matches: systemDark }), addEventListener: (name, cb) => { callbacks[name] = cb; },
  });
  const policy = consoleSurface(pathname, search, "/console/");
  assert.equal(classes.has("xoi-management"), !policy.authentication);
  assert.equal(classes.has("xoi-embed"), policy.embedded);
  assert.equal(classes.has("dark"), expectedDark);
  assert.equal(root.dataset.xoiSurface, policy.authentication ? "auth" : "workspace");
  return elements;
}
for (const scenario of cases) bootstrap(scenario);
bootstrap(["/console/topup", "?embed=1&theme=dark", null, false, true], true);
bootstrap(["/console/agent-apply", "", null, false, false], true);
const elements = bootstrap(cases[0]);
callbacks.error({ target: { tagName: "IMG" } });
assert.equal(elements["xoi-boot-retry"].hidden, true);
callbacks.error({ target: { tagName: "SCRIPT", type: "module" } });
assert.equal(elements["xoi-boot-retry"].hidden, false);
assert.deepEqual(elements.role, ["role", "alert"]);
assert.match(elements["xoi-boot-message"].textContent, /加载失败/);
delete elements["xoi-boot-message"];
assert.doesNotThrow(() => callbacks.error({ target: { tagName: "SCRIPT", type: "module" } }));
console.log(JSON.stringify({ passed: true, routeScenarios: 17, moduleFailureRecovery: true, themePreferenceWrites: 0 }));
