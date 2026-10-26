// Native 3D + Vue + React browser integration. All accounts, cloud writes and uploads are isolated fixtures.
import assert from "node:assert/strict";
const {PNG}=await import(process.env.XOI_PNGJS_MODULE||"pngjs");
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
const { chromium } = await import(process.env.XOI_PLAYWRIGHT_MODULE || "playwright");
const root = process.env.XOI_FRONTEND_DIST_DIR || "/tmp/xoi-previz-web",
  atelier = process.env.XOI_ATELIER_DIST_DIR || "/tmp/xoi-previz-atelier",
  out = process.env.XOI_DIRECTOR_QA_DIR || "/tmp/xoi-previz-qa";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.XOI_HEADED !== "1",
  executablePath:
    process.env.XOI_BROWSER_PATH || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined),
  args: process.env.XOI_REAL_GPU === "1" ? [] : ["--enable-unsafe-swiftshader"],
});
const scenes = new Map(),
  media = new Map(),
  canvases = new Map(),
  contexts = [],
  errors = [],
  report = [],
  network = {},
  traffic = { model: 0, authorize: 0, save: 0, upload: 0 };
let failSave = false,
  failVideoUpload = false;
const base = process.env.XOI_BASE_URL || "http://localhost:12121";
const id = "director3d-u501-link-test";
async function context(seed = false) {
  const c = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
  contexts.push(c);
  await c.addInitScript(
    ({ seed, id }) => {
      localStorage.setItem("token", "Bearer fixture-owner-501");
      localStorage.setItem("userId", "501");
      localStorage.setItem("xoi.platform-welcome.v1:501", "done");
      if (seed) {
        localStorage.setItem("director3d-projects-v2:u501", JSON.stringify([{ id, name: "单镜头交接验证", createdAt: Date.now() }]));
        localStorage.setItem("director3d-active-project-v2:u501", id);
      }
    },
    { seed, id },
  );
  await c.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      p = u.pathname;
    if (p.startsWith("/socket.io/")) return route.abort();
    if (p.startsWith("/api/")) {
      const label=req.method()+" "+p.replace(/\/director-scenes\/[^/]+/,"/director-scenes/:id");network[label]=(network[label]||0)+1;
      if (req.method() === "POST" && /chat\/completions|\/director\/(plan|compose)|\/images\/generations|\/videos$/.test(p)) traffic.model++;
      if (p === "/api/billing/authorize") traffic.authorize++;
      if (p === "/api/auth/me") return route.fulfill({ json: { user: { id: 501, name: "隔离测试" } } });
      if (p === "/api/director-scenes")
        return route.fulfill({
          json: {
            data: [...scenes].filter(([, d]) => !d.deleted).map(([id, { title, revision, updatedAt }]) => ({ id, title, revision, updatedAt })),
          },
        });
      if (p.startsWith("/api/director-scenes/")) {
        const sid = decodeURIComponent(p.split("/").at(-1)),
          old = scenes.get(sid);
        if (req.method() === "GET")
          return route.fulfill({
            status: old?.deleted ? 410 : old ? 200 : 404,
            json: old && !old.deleted ? { data: old } : { message: "场景不存在" },
          });
        if (req.method() === "PUT") {
          if (failSave) return route.fulfill({ status: 503, json: { message: "模拟保存失败" } });
          const b = req.postDataJSON();
          if ((old?.revision || 0) !== b.revision) return route.fulfill({ status: 409, json: { message: "版本冲突" } });
          traffic.save++;
          const d = { id: sid, title: b.title, payload: b.payload, revision: b.revision + 1, updatedAt: Date.now() };
          scenes.set(sid, d);
          return route.fulfill({ json: { data: { revision: d.revision, updatedAt: d.updatedAt } } });
        }
      }
      if (p === "/api/canvas-files") {
        if (u.searchParams.get("ext") === "mp4" && failVideoUpload) return route.fulfill({ status: 503, json: { detail: "模拟视频上传失败" } });
        traffic.upload++;
        const ext = u.searchParams.get("ext");
        const url = `/oss/canvas-files/501/${String(traffic.upload).padStart(32, "0")}.${ext}`;
        if (ext === "mp4") await writeFile(join(out, "真实5秒白模预演.mp4"), req.postDataBuffer());
        media.set(url, req.postDataBuffer());
        return route.fulfill({ json: { url, bytes: req.postDataBuffer().length } });
      }
      if (p === "/api/canvases")
        return route.fulfill({
          json: req.method() === "GET" ? { canvases: [] } : { canvas: { id: "fixture-canvas-" + Date.now(), updated_at: Date.now() } },
        });
      if (p.startsWith("/api/canvases/"))
        return route.fulfill({
          json: { canvas: { id: p.split("/").at(-1), ...(req.method() === "GET" ? {} : req.postDataJSON()), updated_at: Date.now() } },
        });
      if (p === "/api/v1/user-config")
        return route.fulfill({ json: { code: 0, data: { syncCapabilities: { userData: true, assets: true, workflows: true } } } });
      if (p === "/api/v1/canvas/projects") {
        if (req.method() === "GET") return route.fulfill({ json: { code: 0, data: [...canvases.values()] } });
        const { data } = req.postDataJSON(),
          old = canvases.get(data.id);
        if ((old?.cloudRevision || 0) !== (data.cloudRevision || 0)) return route.fulfill({ status: 409, json: { message: "画布冲突" } });
        const saved = { ...data, cloudRevision: (old?.cloudRevision || 0) + 1 };
        canvases.set(data.id, saved);
        return route.fulfill({ json: { code: 0, data: saved } });
      }
      if (p === "/api/config") return route.fulfill({ json: { chat_models: [], image_models: [], video_models: [] } });
      return route.fulfill({ json: { code: 200, data: p === "/api/login/self" ? { id: 501, name: "隔离测试", balance: 100 } : [] } });
    }
    if (media.has(p)) return route.fulfill({ body: media.get(p), contentType: p.endsWith(".mp4") ? "video/mp4" : "image/png" });
    if (!["localhost", "127.0.0.1"].includes(u.hostname)) return route.abort();
    const a = p.startsWith("/atelier-canvas/"),
      r = a ? atelier : root,
      path = resolve(r, "." + (a ? p.slice("/atelier-canvas".length) : p === "/" ? "/index.html" : p));
    try {
      return route.fulfill({
        body: await readFile(path),
        contentType:
          {
            ".js": "text/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".glb": "model/gltf-binary",
            ".png": "image/png",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".woff2": "font/woff2",
          }[extname(path)] || "application/octet-stream",
      });
    } catch {
      return route.abort();
    }
  });
  return c;
}

const page = await (await context(true)).newPage();
page.setDefaultTimeout(90000);
page.on("pageerror", (e) => errors.push(e.message));page.on("console",msg=>{if(msg.type()==="error"||msg.text().includes("createRoot"))console.log("BROWSER",msg.type(),msg.text());});
let renderer;
let downloads=0;page.on("download",()=>downloads++);
const native = page.frameLocator(".director3d-iframe");
async function ready(frame) {
  await frame.locator(".xoi-clear-camera").waitFor({ timeout: 120000 });
  await frame.locator("#xoi-workspace-loading").waitFor({ state: "hidden" });
  await frame.locator(".xoi-handoff-menu").waitFor();
}
async function current(frame) {
  return frame.locator("body").evaluate(() => {
    [...document.querySelectorAll(".top-actions button")].find((b) => b.textContent.trim() === "保存").click();
    return JSON.parse(localStorage.getItem("monoform-project-" + new URL(location.href).searchParams.get("key")));
  });
}
async function sendVideo(frame) {
  const starts = await frame.owner().evaluate(iframe => {
    const host = iframe.ownerDocument.defaultView;
    host.__qaTransferStarts ||= 0;
    if (!host.__qaTransferObserver) {
      host.__qaTransferObserver = new host.MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.matches?.(".xoi-previz-transfer")) host.__qaTransferStarts++;
        }
      });
      host.__qaTransferObserver.observe(host.document.body, { childList: true });
    }
    return host.__qaTransferStarts;
  });
  await frame.locator(".xoi-handoff-menu summary").click();
  await frame.getByRole("button", { name: "预演视频带到画布", exact: true }).click();
  await frame.owner().evaluate(async (iframe, starts) => {
    const host = iframe.ownerDocument.defaultView;
    const deadline = Date.now() + 10000;
    while (host.__qaTransferStarts <= starts) {
      if (Date.now() > deadline) throw Error("handoff did not start");
      await new Promise(r => setTimeout(r, 10));
    }
  }, starts);
}
const pass = (name, detail = {}) => {
  report.push({ name, ...detail });
  console.log("PASS", name, detail);
};
try {
  await page.goto(base + "/#/director3d?scene=" + id);await ready(native);
  await page.locator('.skills-trigger').click();
  const panel=page.locator('.skills-panel');
  const tabs=panel.getByRole('group',{name:'导演助理工作方式'});
  assert.deepEqual(await tabs.locator('button').allTextContents(),['1 搭场景','2 人物走位','3 镜头运镜']);
  await panel.locator('.starter-grid button').filter({hasText:'桌边对谈'}).click();
  await panel.getByRole('button',{name:'使用桌边对谈（本地免费）',exact:true}).click();
  await panel.locator('.director-applied-state').getByText('场景已更新',{exact:false}).waitFor();
  await page.locator('.director-skills-entry[data-busy=false]').waitFor();
  const source=await current(native),people=source.objects.filter(o=>o.type==='person');
  assert.equal(source.objects.length,5);assert.equal(people.length,2);
  pass('three ordered stages; table preset updates the current scene');
  const idle=async()=>page.locator('.director-skills-entry[data-busy=false]').waitFor();
  const edit=async()=>{
    await panel.getByRole('button',{name:'返回编辑',exact:true}).click();
    await native.locator('.viewport-label strong').filter({hasText:'编辑视角'}).waitFor();
    await native.locator('.monitor-canvas canvas').waitFor();
    const until=Date.now()+15000;
    let visible=false;
    while(Date.now()<until){
      const {data}=PNG.sync.read(await native.locator('.monitor-canvas canvas').screenshot());
      let body=0;for(let i=0;i<data.length;i+=4)if(data[i]>140&&data[i]-data[i+2]>8)body++;
      if(body>100){visible=true;break;}
      await page.waitForTimeout(100);
    }
    assert.ok(visible,'actual monitor screenshot contains white-model geometry');
    await page.waitForTimeout(300);
  };
  const apply=async(name)=>{await panel.getByRole('button',{name,exact:true}).click();await native.locator('.play-button.is-playing').waitFor();await idle();};
  await tabs.getByRole('button',{name:'3 镜头运镜',exact:true}).click();
  await panel.locator('.motion-field select').first().selectOption(people[0].id);
  await panel.locator('.motion-target-state').filter({hasText:people[0].name}).waitFor();
  await panel.locator('.framing-cards g.subject text').first().filter({hasText:people[0].name}).waitFor();
  await apply('应用运镜并试播');await edit();const a=await current(native);
  assert.equal(a.activeShotId,source.activeShotId);assert.equal(a.shots.length,source.shots.length);
  await panel.locator('.motion-field select').first().selectOption(people[1].id);
  await panel.locator('.framing-cards g.subject text').first().filter({hasText:people[1].name}).waitFor();
  await apply('应用运镜并试播');await edit();const b=await current(native);
  assert.notDeepEqual(a.keyframes[0].rotation,b.keyframes[0].rotation);
  assert.equal(b.shots.length,source.shots.length);assert.equal(b.activeShotId,source.activeShotId);
  assert.deepEqual(b.objects,source.objects);
  pass('changing A to B updates the framing draft and the actual camera; no duplicate shots or actor changes');
  await panel.getByRole('button',{name:'撤销运镜更改',exact:true}).click();await idle();
  assert.deepEqual((await current(native)).keyframes,a.keyframes);
  pass('undo restores the previous camera framing');
  await panel.locator('.motion-preset-grid button').filter({hasText:'前后跟随'}).click();
  await panel.getByRole('button',{name:'设置走位并跟拍',exact:true}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'设置走位并跟拍',exact:true}).isEnabled(),true);
  await apply('设置走位并跟拍');
  const animated=await current(native);
  const travel=keys=>Math.hypot(...keys.at(-1).position.map((v,i)=>v-keys[0].position[i]));
  assert.ok(travel(animated.objectKeyframes[people[1].id])>1.9);
  assert.ok(travel(animated.keyframes)>1.9);
  assert.equal(animated.objectKeyframes[people[0].id]?.length||0,0);
  assert.equal(animated.shots.length,source.shots.length);assert.equal(animated.activeShotId,source.activeShotId);
  const pixels1=await native.locator('.viewport-canvas-layer canvas').screenshot();
  await page.waitForTimeout(900);const pixels2=await native.locator('.viewport-canvas-layer canvas').screenshot();
  assert.notDeepEqual(pixels1,pixels2);
  await edit();
  await page.screenshot({path:join(out,'01-静止人物一键走位跟拍.png')});
  pass('stationary follow applies actor and camera travel together, rendered camera frames visibly change');
  await tabs.getByRole('button',{name:'2 人物走位',exact:true}).click();
  await panel.locator('.actor-blocking select').first().selectOption(people[0].id);
  await panel.locator('.actor-blocking select').nth(1).selectOption('left');
  const beforeBlocking=await current(native);
  await apply('设置走位并试播');await edit();const walking=await current(native);
  assert.ok(travel(walking.objectKeyframes[people[0].id])>1.9);
  assert.deepEqual(walking.keyframes,beforeBlocking.keyframes);
  assert.deepEqual(walking.objectKeyframes[people[1].id],beforeBlocking.objectKeyframes[people[1].id]);
  assert.equal(walking.shots.length,source.shots.length);
  await page.screenshot({path:join(out,'02-人物走位与独立运镜.png')});
  pass('blocking edits the selected actor only and preserves the camera and the other actor route');
  await panel.getByRole('button',{name:'人物走位好了，选择运镜 →',exact:true}).click();
  await panel.getByRole('button',{name:'用 AI 描述运镜（可选）',exact:true}).click();
  await panel.getByText('基于已有场景，用文字描述怎么拍。AI 生成相机路线供你选择；不会添加人物、改布景或设置人物走位。',{exact:true}).waitFor();
  assert.equal(await tabs.getByRole('button',{name:'3 镜头运镜',exact:true}).getAttribute('aria-pressed'),'true');
  await tabs.getByRole('button',{name:'1 搭场景',exact:true}).click();
  await panel.getByRole('button',{name:'用 AI 修改已有布景',exact:true}).click();
  assert.equal(await tabs.getByRole('button',{name:'1 搭场景',exact:true}).getAttribute('aria-pressed'),'true');
  pass('AI camera planning and scene editing live under the correct step, without triggering a model');
  assert.equal(traffic.model,0);assert.equal(traffic.authorize,0);assert.deepEqual(errors,[]);
  await writeFile(join(out,'report.json'),JSON.stringify({report,traffic,network,errors},null,2));
} catch(error){console.log('ERROR',error);console.log('PANEL',await page.locator('.skills-panel').innerText().catch(()=>''));console.log('NATIVE',await native.locator('body').innerText().catch(()=>''));await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});throw error;}
finally{for(const c of contexts)await c.close();await browser.close();}
