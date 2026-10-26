/** Isolated browser with real local APIs, paid model requests blocked at the client. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import { readFile, writeFile } from "node:fs/promises";
import { billableOperation } from "../../shared/billableOperations";
import assert from "node:assert/strict";
const db = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL });
let browser: any;
let authToken = "";
const base = "http://localhost:12121";
const events: any[] = [];
const budgets: string[] = [];
async function main() {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
  await db.connect();
  const user = (await db.query('SELECT id,session_version FROM o_user WHERE id=1')).rows[0];
  const secret = (await db.query('SELECT value FROM o_setting WHERE key=$1', ["tokenKey"])).rows[0].value;
  const token = jwt.sign({ id: Number(user.id), session_version: Number(user.session_version || 0) }, secret, { expiresIn: 3600 });
  authToken = token;
  const agents = (await db.query('SELECT "modelName" FROM "o_agentDeploy"')).rows;
  if (agents.some(a => !/^newapi:agnes/.test(a.modelName))) throw new Error("拒绝非免费Agent配置");
  const catalog = await (await fetch(base + "/api/model-catalog", { headers: { Authorization: `Bearer ${token}` } })).json();
  if (!catalog.data.some((m: any) => m.modelName === "agnes-2.5-flash" && m.price?.yuan === 0)) throw new Error("免费模型价格验证失败");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.addInitScript((jwtToken: string) => {
    localStorage.setItem("token", "Bearer " + jwtToken);
    localStorage.setItem("userId", "1");
    localStorage.setItem("setting", JSON.stringify({ baseUrl: "/api" }));
    for (const owner of ["1", "current"]) localStorage.setItem(`xoi.platform-welcome.v1:${owner}`, "done");
  }, token);
  await context.route("**/*", async (route: any) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    const op = billableOperation(url.pathname, request.method());
    if (op) {
      let input: any; try { input = request.postDataJSON(); } catch { return route.abort(); }
      const model = String(input?.model || input?.modelName || "").replace(/^newapi:/, "");
      if (model && !/^agnes/.test(model)) { events.push({ blockedPaid: true, path: url.pathname, model }); return route.abort(); }
      events.push({ submitted: true, path: url.pathname, model });
      if (events.filter(e => e.submitted).length > 4) return route.abort();
    }
    if (url.pathname === "/api/billing/preview") {
      const input = request.postDataJSON();
      const model = String(input.body?.model || input.body?.modelName || "").replace(/^newapi:/, "");
      if (model && !/^agnes/.test(model)) { events.push({ blockedPaidPreview: true, model }); return route.fulfill({ status: 400, json: { message: "验收仅允许Agnes免费模型" } }); }
    }
    if (url.pathname === "/api/billing/authorize" && Number(request.postDataJSON()?.points) > .01) return route.fulfill({ status: 400, json: { message: "验收预算限制为0.01积分" } });
    if (url.pathname === "/api/project/addProject") return route.abort();
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(18000);
  page.on("pageerror", (error: any) => events.push({ pageError: error.message }));
  page.on("response", async (response: any) => {
    if (new URL(response.url()).pathname === "/api/billing/authorize" && response.ok()) {
      const data = await response.json(); if (data.data?.id) budgets.push(data.data.id);
    }
  });
  await page.goto(base + "/#/aiAssistant");
  await page.getByText("先把想法讲清楚", { exact: false }).waitFor();
  console.log((await page.locator("body").innerText()).slice(-5500));
  console.log(JSON.stringify(await page.locator("input,textarea,button,[contenteditable=true]").evaluateAll((nodes: any[]) => nodes.map(n => ({ tag: n.tagName, text: n.innerText?.slice(0, 50), placeholder: n.getAttribute("placeholder"), aria: n.getAttribute("aria-label"), role: n.getAttribute("role") }))), null, 2));
  await page.screenshot({ path: "/tmp/xoi-free-ui-inspect.png" });
  if (process.argv.includes("--inspect-models") || process.argv.includes("--run-free")) {
    await page.getByRole("combobox").click();
    console.log("MODEL MENU", (await page.locator("body").innerText()).slice(-3600));
    console.log(JSON.stringify(await page.locator('input,[role="option"], [role="listbox"]').evaluateAll((nodes: any[]) => nodes.map(n => ({ tag: n.tagName, text: n.innerText?.slice(0, 100), placeholder: n.getAttribute("placeholder"), aria: n.getAttribute("aria-label"), role: n.getAttribute("role") }))), null, 2));
  }
  if (!process.argv.includes("--run-free")) return;
  await page.getByRole("textbox", { name: "搜索模型", exact: true }).fill("agnes-2.5-flash");
  await page.locator('[data-model-key="newapi:agnes-2.5-flash"]').click();
  await page.waitForFunction(() => document.querySelector('[role="combobox"]')?.textContent?.includes("agnes-2.5-flash"));
  events.push({ operation: "首页选择的模型", model: await page.getByRole("combobox").innerText() });
  const prompt = "验收测试20261014：只用文字给我15秒雨天咖啡店广告的三个镜头提纲，每镜头一句，阿禾给小雨递伞。不要生成图片、视频、音频，不要联网。";
  await page.getByRole("textbox", { name: "描述创作目标，或让我继续操作画布" }).fill(prompt);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const canvasFrame = page.frameLocator('iframe[src*="atelier-canvas"]');
  const dialog = canvasFrame.getByRole("dialog", { name: "模型调用费用确认" });
  try { await dialog.waitFor({ timeout: 15000 }); }
  catch (error) {
    if (!events.some(e => e.blockedPaidPreview)) throw error;
    events.push({ operation: "首页到画布模型传递失败", error: "首页选择Agnes，但画布请求付费型号，测试保护已拦截，无实际模型请求" });
    const frame = page.frames().find((f: any) => f.url().includes("atelier-canvas"));
    if (!frame) throw new Error("画布frame未加载");
    events.push({ operation: "错误模型的画布界面", text: (await frame.locator("body").innerText()).slice(-4000) });
    await frame.locator("body").screenshot({ path: "/tmp/xoi-free-ui-handoff-error.png" });
    // Diagnose the delivered fee guard independently, without claiming the handoff passed.
    const begin = () => frame.evaluate((jwtToken: string) => {
      (window as any).__auditDone = false;
      void fetch("/api/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + jwtToken, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "agnes-2.5-flash", stream: false, max_tokens: 250, messages: [{ role: "user", content: "给我雨天咖啡店广告的3个镜头，每镜头一句中文，80字以内。" }] }) })
        .then(r => r.json()).then(data => { (window as any).__auditResult = data; (window as any).__auditDone = true; })
        .catch(error => { (window as any).__auditResult = error.message; (window as any).__auditDone = true; });
    }, token);
    await begin();
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await frame.waitForFunction(() => (window as any).__auditDone);
    assert.equal(events.filter(e => e.submitted).length, 0);
    events.push({ operation: "取消后真实模型请求", count: 0 });
    await begin(); await dialog.waitFor();
    assert.match(await dialog.innerText(), /0 积分（¥0）/);
    await dialog.getByRole("spinbutton", { name: "本轮预算上限（积分）" }).fill("0.01");
    await dialog.getByRole("button", { name: "确认并调用", exact: true }).click();
    await frame.waitForFunction(() => (window as any).__auditDone, { timeout: 60000 });
    const result = await frame.evaluate(() => (window as any).__auditResult);
    events.push({ operation: "费用拦截层独立真实免费测试", result });
    await canvasFrame.locator("#xoi-billing-notice").getByText(/账单已记录消耗 0 积分/).waitFor({ timeout: 45000 });
    await canvasFrame.getByRole("button", { name: "停止后续调用", exact: true }).click();
    await canvasFrame.locator("#xoi-billing-notice").getByText(/已停止后续模型调用/).waitFor();
    events.push({ operation: "用户停止后续调用", passed: true });
    console.log(JSON.stringify({ handoffPassed: false, isolatedFeeGuardPassed: true, paidRequests: 0, actualSubmitted: events.filter(e => e.submitted).length }));
    return;
  }
  const confirmation = await dialog.innerText();
  assert.match(confirmation, /0 积分（¥0）/);
  events.push({ operation: "免费模型费用提示", confirmation });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(events.filter(e => e.submitted).length, 0);
  events.push({ operation: "取消后真实模型请求", count: 0 });
  const editor = canvasFrame.getByRole("textbox", { name: "描述创作目标，或让我继续操作画布" });
  await editor.fill(prompt); await editor.press("Enter");
  await dialog.waitFor();
  await dialog.getByRole("spinbutton", { name: "本轮预算上限（积分）" }).fill("0.01");
  await dialog.getByRole("button", { name: "确认并调用", exact: true }).click();
  await canvasFrame.locator("#xoi-billing-notice").getByText(/账单已记录消耗 0 积分/).waitFor({ timeout: 90000 });
  const frame = page.frames().find((f: any) => f.url().includes("atelier-canvas"));
  if (frame) {
    events.push({ operation: "画布页面完成后", text: (await frame.locator("body").innerText()).slice(-6500) });
    await frame.locator("body").screenshot({ path: "/tmp/xoi-free-ui-canvas.png" });
  }
  await canvasFrame.getByRole("button", { name: "停止后续调用", exact: true }).click();
  await canvasFrame.locator("#xoi-billing-notice").getByText(/已停止后续模型调用/).waitFor();
  events.push({ operation: "用户停止后续调用", passed: true });
  // New browser storage must recover the saved canvas from the account API.
  const projects = await (await fetch(base + "/api/v1/canvas/projects", { headers: { Authorization: `Bearer ${token}` } })).json();
  const saved = projects.data?.filter((p: any) => String(p.title).includes("验收测试20261014"));
  events.push({ operation: "账号保存的验收画布", count: saved?.length, ids: saved?.map((p: any) => p.id) });
  const pinned=saved?.find((p:any)=>p.agentConfig?.textModel==="agnes-2.5-flash");
  assert.ok(pinned,"免费文字模型必须随具体画布保存在服务端");
  const fresh=await browser.newContext({viewport:{width:1440,height:1050}});
  await fresh.addInitScript((jwtToken:string)=>{localStorage.setItem("token","Bearer "+jwtToken);localStorage.setItem("userId","1");localStorage.setItem("setting",JSON.stringify({baseUrl:"/api"}));},token);
  let unexpectedFreshGeneration=0;
  await fresh.route("**/*",(route:any)=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base)return route.abort();if(billableOperation(url.pathname,request.method())){unexpectedFreshGeneration++;return route.abort();}return route.continue();});
  const restored=await fresh.newPage();await restored.goto(base+"/atelier-canvas/index.html#/canvas/"+pinned.id);
  await restored.getByRole("textbox",{name:"描述创作目标，或让我继续操作画布"}).waitFor({timeout:30000});
  await restored.getByText(/Agent 思考/).first().waitFor();
  assert.equal(unexpectedFreshGeneration,0);
  events.push({operation:"全新浏览器恢复验收画布",passed:true,pinnedModel:pinned.agentConfig.textModel,automaticGeneration:0});
  await restored.screenshot({path:"/tmp/xoi-free-canvas-restored.png"});await fresh.close();
  for (const id of budgets) {
    const receipt = await (await fetch(base + "/api/billing/receipt/" + id, { headers: { Authorization: `Bearer ${token}` } })).json();
    events.push({ operation: "真实页面费用回执", data: receipt.data });
    assert.equal(receipt.data?.points, 0);
  }
  assert.equal(events.filter(e => e.blockedPaid).length, 0);
  console.log(JSON.stringify({ passed: true, actualSubmitted: events.filter(e => e.submitted).length, cancelled: 0, budgets: budgets.length, report: "/tmp/xoi-free-ui-audit-20261014.json" }));
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  for (const id of budgets) {
    const receipt = await (await fetch(base + "/api/billing/receipt/" + id, { headers: { Authorization: "Bearer " + authToken } })).json();
    events.push({ budget: id, receipt: receipt.data });
    await fetch(base + "/api/billing/budget/" + id + "/stop", { method: "POST", headers: { Authorization: "Bearer " + authToken } });
  }
  await writeFile("/tmp/xoi-free-ui-audit-20261014.json", JSON.stringify(events, null, 2));
  await browser?.close(); await db.end();
});
