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
let simulatedComposeMode="safe";
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
      localStorage.setItem("xo_assistant_model_value","fixture-free-text");
      localStorage.setItem("xo_assistant_model_label","隔离测试文本模型");
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
      if(p==="/api/billing/authorize")return route.fulfill({json:{data:{id:crypto.randomUUID(),limitPoints:.001,freeOnly:true}}});
      if(p.startsWith("/api/billing/receipt/"))return route.fulfill({json:{data:{status:"recorded",points:0,budget:{state:"active",calls:1}}}});
      if(p==="/api/billing/preview")return route.fulfill({json:{code:0,data:{label:"AI 场景搭建与调整",model:"fixture-free-text",modelId:"fixture-free-text",free:true,count:1,quote:{yuan:0},budget:{defaultPoints:1,maxPoints:10,maxCalls:1,maxOutputTokens:4096,minutes:30}}}});
      if(p==="/api/aiAssistant/director/compose"){
        const body=req.postDataJSON();assert.equal(body.task,"adjust");assert.ok(body.intent.startsWith("只设置现有人物"));
        const actor=body.scene.objects.find(o=>o.id===body.subjectId),start=actor.position,end=[start[0]+1,start[1],start[2]];
        const actions=simulatedComposeMode==="safe"?[{kind:"animate",objectId:actor.id,pose:"walk",points:[{t:0,position:start},{t:1,position:end}]}]:[{kind:"move",objectId:body.scene.objects.find(o=>o.type==="table").id,position:[3,0,0]}];
        return route.fulfill({json:{data:{projectId:body.scene.projectId,activeShotId:body.scene.activeShotId,plan:{name:"AI 人物走位",summary:"只移动选定人物",warnings:[],durationSeconds:body.durationSeconds,actions}}}});
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
  await native.locator('.xoi-download-menu summary').click();
  assert.deepEqual(await native.locator('.xoi-download-options button').allTextContents(),['导出工程','截图 PNG','下载 MP4']);
  await native.locator('.xoi-download-menu summary').click();
  pass('compact export menu has one project export, one PNG screenshot and one MP4 download');
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
  assert.equal(await panel.getByRole('group',{name:'镜头远近'}).getByRole('button',{name:'中景',exact:true}).getAttribute('aria-pressed'),'true');
  assert.match(await panel.locator('.motion-target-state').innerText(),/中景[\s\S]*5\.5 米/);
  await panel.getByRole('group',{name:'镜头远近'}).getByRole('button',{name:'全景',exact:true}).click();
  assert.match(await panel.locator('.motion-target-state').innerText(),/全景[\s\S]*8 米/);
  await panel.getByRole('group',{name:'镜头远近'}).getByRole('button',{name:'中景',exact:true}).click();
  pass('camera motion defaults to a comfortable medium shot and exposes close, medium and wide controls');
  await panel.locator('.motion-field select').first().selectOption(people[0].id);
  await panel.locator('.motion-target-state').filter({hasText:people[0].name}).waitFor();
  await panel.locator('.framing-cards g.subject text').first().filter({hasText:people[0].name}).waitFor();
  await native.locator('body').evaluate(async(_,name)=>{const until=Date.now()+10000;while(document.querySelector('.inspector-name-input')?.value!==name){if(Date.now()>until)throw Error('subject selection was not reflected in the inspector: '+name);await new Promise(r=>setTimeout(r,25));}},people[0].name);
  await apply('应用运镜并试播');await edit();const a=await current(native);
  await native.locator('.timeline button[aria-label="回到开头"]').click();await native.locator('.toast').waitFor({state:'hidden'});await page.waitForTimeout(150);
  await native.locator('.monitor-canvas canvas').screenshot({path:join(out,'拍谁-A.png')});
  assert.equal(a.activeShotId,source.activeShotId);assert.equal(a.shots.length,source.shots.length);
  await panel.locator('.motion-field select').first().selectOption(people[1].id);
  await panel.locator('.framing-cards g.subject text').first().filter({hasText:people[1].name}).waitFor();
  await native.locator('body').evaluate(async(_,name)=>{const until=Date.now()+10000;while(document.querySelector('.inspector-name-input')?.value!==name){if(Date.now()>until)throw Error('subject selection was not reflected in the inspector: '+name);await new Promise(r=>setTimeout(r,25));}},people[1].name);
  await apply('应用运镜并试播');await edit();const b=await current(native);
  await native.locator('.timeline button[aria-label="回到开头"]').click();await native.locator('.toast').waitFor({state:'hidden'});await page.waitForTimeout(150);
  await native.locator('.monitor-canvas canvas').screenshot({path:join(out,'拍谁-B.png')});
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
  assert.ok(animated.objectKeyframes[people[1].id].every(key=>key.pose==='walk'&&key.continuousMotion));
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
  await apply('设置走位并试播');
  const layout=await native.locator('body').evaluate(()=>{const camera=document.querySelector('.camera-monitor').getBoundingClientRect(),bar=document.querySelector('.xoi-motion-playback').getBoundingClientRect();return{overlap:Math.max(0,Math.min(camera.right,bar.right)-Math.max(camera.left,bar.left))*Math.max(0,Math.min(camera.bottom,bar.bottom)-Math.max(camera.top,bar.top)),inTimeline:!!document.querySelector('.timeline-controls .xoi-motion-playback'),headerHeight:document.querySelector('.monitor-head strong').getBoundingClientRect().height,captionBottom:document.querySelector('.xoi-current-subject').getBoundingClientRect().bottom,referenceTop:document.querySelector('.reference-panel').getBoundingClientRect().top};});
  assert.equal(layout.overlap,0);assert.equal(layout.inTimeline,true);assert.ok(layout.headerHeight<25);assert.ok(layout.captionBottom<layout.referenceTop);
  await page.screenshot({path:join(out,'人物预演-摄像机完整可见.png')});
  await edit();const walking=await current(native);
  assert.ok(travel(walking.objectKeyframes[people[0].id])>1.9);
  assert.ok(walking.objectKeyframes[people[0].id].every(key=>key.pose==='walk'&&key.continuousMotion));
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
  await panel.getByRole('button',{name:'用 AI 描述场景（可选）',exact:true}).click();
  await panel.getByRole('button',{name:'修改已有布景',exact:true}).click();
  assert.equal(await tabs.getByRole('button',{name:'1 搭场景',exact:true}).getAttribute('aria-pressed'),'true');
  pass('AI camera planning and scene editing live under the correct step, without triggering a model');
  assert.equal(traffic.model,0);assert.equal(traffic.authorize,0);
  await tabs.getByRole('button',{name:'2 人物走位',exact:true}).click();
  await panel.getByRole('button',{name:'用 AI 描述走位（可选）',exact:true}).click();
  const beforeAI=await current(native);
  await panel.locator('#director-skill-request').fill(`让${people[0].name}再向右走1米`);
  await panel.getByRole('button',{name:'生成人物走位方案',exact:true}).click();
  await panel.getByRole('button',{name:'应用走位并试播',exact:true}).waitFor({timeout:20000});
  assert.deepEqual((await current(native)).objectKeyframes,beforeAI.objectKeyframes);
  await apply('应用走位并试播');await edit();const afterAI=await current(native);
  assert.deepEqual(afterAI.keyframes,beforeAI.keyframes);assert.notDeepEqual(afterAI.objectKeyframes[people[0].id],beforeAI.objectKeyframes[people[0].id]);
  assert.deepEqual(afterAI.objectKeyframes[people[1].id],beforeAI.objectKeyframes[people[1].id]);
  pass('AI walking method generates a reviewable plan and only changes the chosen actor after application');
  simulatedComposeMode='unsafe';
  await panel.locator('#director-skill-request').fill(`让${people[0].name}走远一点`);
  await panel.getByRole('button',{name:'生成人物走位方案',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'走位方案修改了所选人物以外的对象'}).waitFor();
  assert.deepEqual((await current(native)).objectKeyframes,afterAI.objectKeyframes);
  assert.equal(traffic.model,2);assert.equal(traffic.authorize,2);assert.deepEqual(errors,[]);
  pass('AI plan that moves scenery is rejected without applying it or retrying automatically');
  await writeFile(join(out,'report.json'),JSON.stringify({report,traffic,network,errors,realModelRequests:0,simulatedModelRequests:2},null,2));
} catch(error){console.log('ERROR',error);console.log('PANEL',await page.locator('.skills-panel').innerText().catch(()=>''));console.log('NATIVE',await native.locator('body').innerText().catch(()=>''));await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});throw error;}
finally{for(const c of contexts)await c.close();await browser.close();}
