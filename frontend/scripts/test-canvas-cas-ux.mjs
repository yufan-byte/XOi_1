// Isolated store fixture with fake transport; no XOi accounts or model/pay requests.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { build } from "esbuild";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const entry = path.resolve("atelier/upstream/src/app/(user)/canvas/stores/use-canvas-store.ts");
const stubs = {
  "@/lib/localforage-storage": `export const localForageStorage={getItem:async k=>localStorage.getItem(k),setItem:async(k,v)=>localStorage.setItem(k,v),removeItem:async k=>localStorage.removeItem(k)};`,
  "@/services/api/canvas-tasks": `export const listCanvasProjects=async()=>window.remote?[window.remote]:[];export const saveCanvasProject=async(t,p)=>{window.submissions.push(structuredClone(p));await new Promise(r=>setTimeout(r,700));if(window.remote&&p.cloudRevision!==window.remote.cloudRevision)throw Object.assign(new Error('conflict'),{status:409});window.remote={...p,cloudRevision:(window.remote?.cloudRevision||0)+1,cloudPending:false,cloudConflict:false};return structuredClone(window.remote);};`,
  "@/services/api/user-config": `export const fetchUserConfig=async()=>({syncCapabilities:{userData:true}});`,
  "@/stores/use-user-store": `export const useUserStore={getState:()=>({token:'fixture'}),persist:{hasHydrated:()=>true}};`,
  "@/xoi/owner": `export const getVerifiedToken=()=> 'fixture';`,
  antd: `export const message={error:text=>window.notices.push(text)};`,
};
const bundle = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  nodePaths: [path.resolve("atelier/node_modules")],
  plugins: [
    {
      name: "fixtures",
      setup(b) {
        b.onResolve({ filter: /^(@\/|antd$)/ }, (a) => (stubs[a.path] ? { path: a.path, namespace: "fixture" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
      },
    },
  ],
});
const server = http.createServer((req, res) => {
  if (req.url === "/store.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(bundle.outputFiles[0].text);
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(
    `<script>window.submissions=[];window.notices=[];window.remote=null;</script><script type="module">import{useCanvasStore}from'/store.js';window.store=useCanvasStore;await useCanvasStore.persist.rehydrate();useCanvasStore.getState().setSyncEnabled(true);window.ready=true;</script>`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.route("**/*", (r) => (new URL(r.request().url()).origin === base ? r.continue() : r.abort()));
  await page.goto(base);
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => (window.id = window.store.getState().createProject("原始")));
  await page.waitForFunction(() => window.submissions.length === 1);
  await page.evaluate(() => window.store.getState().renameProject(window.id, "保存期间的新编辑"));
  await page.waitForFunction(() => window.submissions.length === 2);
  assert.equal(await page.evaluate(() => window.submissions[1].cloudRevision), 1);
  await page.waitForFunction(() => window.store.getState().projects[0]?.cloudRevision === 2 && !window.store.getState().projects[0]?.cloudPending);
  await page.evaluate(() => {
    window.remote.cloudRevision = 3;
    window.store.getState().renameProject(window.id, "冲突时保留的修改");
  });
  await page.waitForFunction(() => window.store.getState().projects[0].cloudConflict);
  assert.equal(await page.evaluate(() => window.store.getState().projects[0].title), "冲突时保留的修改");
  assert.equal(await page.evaluate(() => window.remote.title), "保存期间的新编辑");
  await page.waitForTimeout(500);
  await page.evaluate(() => window.store.getState().syncWithRemote("fixture", true));
  const copies = await page.evaluate(() => window.store.getState().projects.map((p) => ({ title: p.title, id: p.id, conflict: p.cloudConflict })));
  assert.equal(copies.length, 2);
  assert.match(copies[0].title, /本机未同步副本/);
  assert.notEqual(copies[0].id, copies[1].id);
  console.log(
    JSON.stringify({
      passed: true,
      inFlightEditPreserved: true,
      revisionChained: true,
      conflictKeptLocal: true,
      remoteNotOverwritten: true,
      conflictCopyCreated: true,
      paidRequests: 0,
    }),
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
