import express from "express";
import { resolveTextModelKey } from "@/utils/textModel";
import { db } from "@/utils/db";
import { getUserCatalog, quoteModel, resolveUserCatalogModel } from "@/lib/model-catalog";
import { readBillingReceipt } from "@/lib/gateway/receipts";
import { quotaToPoints } from "@/utils/creditUnits";
import { billableOperation } from "../../../shared/billableOperations";
import { createModelBudget, readModelBudget, stopModelBudget,ensureBudgetSchema } from "@/lib/gateway/budgets";
import { budgetCallLimit, BUDGET_MAX_POINTS, BUDGET_OUTPUT_TOKENS } from "@/utils/billingBudgetPolicy";
import {accountBudgetHold} from "@/utils/accountBudgetHold";
import {billingReceiptStatus} from "@/utils/billingReceiptState";
import {dailySpendStatus,setDailySpendPreference,claimDailySpendNotice} from '@/lib/gateway/dailySpend';
import {z} from 'zod';
const router = express.Router();
router.get('/preferences',async(req:any,res)=>{try{res.set('Cache-Control','private, no-store').json({data:await dailySpendStatus(Number(req.user.id))});}catch{res.status(503).json({message:'消费提醒设置暂时无法读取，不影响生成任务'});}});
router.put('/preferences',async(req:any,res)=>{const parsed=z.strictObject({dailyWarningYuan:z.number().finite().min(0).max(100000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'请填写0–100000元的今日提醒金额'});try{res.set('Cache-Control','private, no-store').json({data:await setDailySpendPreference(Number(req.user.id),parsed.data.dailyWarningYuan)});}catch{res.status(503).json({message:'提醒设置保存失败，请重试，不影响生成任务'});}});
router.post('/daily-notice/claim',async(req:any,res)=>{try{res.set('Cache-Control','private, no-store').json({data:await claimDailySpendNotice(Number(req.user.id))});}catch{res.status(503).json({message:'提醒暂时不可用，不影响生成任务'});}});
router.post("/preview", async (req: any, res) => {
  try {
    const operation = billableOperation(String(req.body?.path || ""));
    if (!operation) return res.status(400).json({ message: "该操作不是模型计费入口" });
    const input = req.body?.body || {};
    let model = operation.agent ? "" : String(input.model || input.modelName || input.textModel || "");
    // Socket selectors are actual model overrides. Legacy text helpers ignore their body model.
    if ((String(req.body.path).includes("/socket/") || String(req.body.path).includes("/aiAssistant/")) && input.model) model = String(input.model);
    if (!model && operation.agent) model = String((await db("o_agentDeploy").where("key", operation.agent).first())?.modelName || "");
    // universalAi 已退役：文本类操作没带模型时，按「项目配置 → 系统默认 → 账号可用 DeepSeek」解析
    if (!model && operation.kind === "text") {
      try {
        model = await resolveTextModelKey({ projectId: input.projectId });
      } catch {
        /* 交给下方统一报「未携带模型」 */
      }
    }
    if (!model && input.projectId) {
      const project = await db("o_project").where("id", Number(input.projectId)).first();
      if (!project || (req.user.role !== "admin" && Number(project.userId) !== Number(req.user.id))) return res.status(403).json({ message: "无权读取项目计费设置" });
      const setting: any = project;
      model = String(setting?.[operation.kind === "image" ? "imageModel" : operation.kind === "video" ? "videoModel" : "textModel"] || "");
    }
    const names = (model.split("::").pop() || "").replace(/^newapi:/, "");
    if (!names) {
      console.warn(`[billing-preview] 请求未携带模型: path=${String(req.body?.path)} bodyKeys=${Object.keys(input||{}).join(",")} projectId=${String(input?.projectId ?? "")}`);
      return res.status(400).json({ message: "请求未携带模型（画布未选择模型，或页面还在用更新前的旧配置）。请在画布里重新选择模型后再生成；若刚更新过模型列表，请刷新画布页面加载最新配置" });
    }
    let resolved;
    try { resolved = await resolveUserCatalogModel(Number(req.user.id), names, operation.kind); }
    catch {
      console.warn(`[billing-preview] 模型无效: path=${String(req.body?.path)} model=${JSON.stringify(model)} names=${JSON.stringify(names)} bodyKeys=${Object.keys(input||{}).join(",")} projectId=${String(input?.projectId ?? "")}`);
      return res.status(400).json({ message: `模型 ${names} 不在当前账号可用列表（可能已下架或未对该账号开放）。模型列表更新后会自动生效，请刷新画布页面并重新选择模型` });
    }
    const { catalog, model: item } = resolved;
    const count = [input.items,input.ids,input.assetIds,input.assetsIds,input.novelIds,input.storyboardIds,input.data,input.trackIds,input.trackData].find(Array.isArray)?.length || Math.max(1, Number(input.n || input.count || 1));
    let quote = null;
    if (item) {
      const text = String(input.prompt || input.content || input.input || "");
      const isBatch = operation.multiple === true;
      const params = { ...input, n: isBatch ? 1 : input.n || input.count || 1, inputLength: Number(input.inputLength || text.length), outputTokens:BUDGET_OUTPUT_TOKENS,
        seconds: input.seconds || input.duration || input.videoDuration || 5, resolution: input.resolution || input.size,
        hasReferenceVideo: input.hasReferenceVideo === true || (Array.isArray(input.videos) && input.videos.length > 0) };
      try { quote = quoteModel(item, params, catalog.factor); } catch { /* Honest unknown price, not zero. */ }
    }
    if (["prod", "production"].includes(process.env.NODE_ENV || "") && !quote) return res.status(422).json({ message: "当前模型／参数没有可靠报价，生产环境暂不提交，请选择已有明确报价的模型" });
    const user = await db("users").where("id",Number(req.user.id)).select("quota").first();
    await ensureBudgetSchema();
    const maxPoints = Math.max(.001,Math.min(BUDGET_MAX_POINTS,quotaToPoints(Math.max(0,Number(user?.quota||0)))));
    const free = quote?.yuan === 0 && item.pricing.quota_type === 1 && item.pricing.model_price === 0 && !item.pricing.billing_expr;
    const defaultPoints = free ? Math.min(maxPoints,.001) : Math.min(maxPoints,Math.max(10,Math.ceil((quote?.points||0)*Math.min(count,20)*2)));
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: { ...operation, model: item?.name || names || "按项目／Agent 配置", modelId: item.modelName, preferredModelId: resolved.fallback ? names : undefined, fallback: resolved.fallback, free, count, quote,
      basis: (String(req.body.path).replace(/^\/api/,"")==="/workflow/canvas-text" ? "本预算覆盖本轮连续文字规划与工具推理，累计最多20次调用；图片、视频和音频生成另行确认费用。" : operation.multiple ? "每次模型调用参考价；批量／Agent 可能多次调用文字、图片或视频模型，不能视作整次任务总价。" : "按当前输入估算；历史上下文、参考素材及工具调用可能增加费用。") + (input.hasReferenceImage ? "含图片／视频输入，视觉 Token 尚不能完整预估。" : ""),
      unknown: !quote,budget:{defaultPoints,maxPoints,maxCalls:budgetCallLimit(String(req.body.path)),maxOutputTokens:BUDGET_OUTPUT_TOKENS,minutes:30} } });
  } catch (error) { console.error("[billing-preview]", (error as Error).message); res.status(502).json({ message: `计费预估失败：${(error as Error).message || "未知错误"}（后端日志关键字 [billing-preview]）` }); }
});
router.post("/authorize",async (req:any,res)=>{
  try {
    const budget=await createModelBudget(Number(req.user.id),String(req.body?.path||""),Number(req.body?.points),String(req.body?.model||""),req.body?.freeOnly===true,undefined,req.body?.automatic===true);
    res.setHeader("Cache-Control","private, no-store");res.json({data:budget});
  } catch(error) { res.status(400).json({message:(error as Error).message}); }
});
router.post("/budget/:id/stop",async (req:any,res)=>{
  try { await stopModelBudget(Number(req.user.id),String(req.params.id));res.json({data:{stopped:true}}); }
  catch(error) {res.status(400).json({message:(error as Error).message});}
});
router.get("/receipt/:id", async (req: any, res) => {
  try {
    const receipt = await readBillingReceipt(Number(req.user.id), String(req.params.id));
    res.setHeader("Cache-Control", "private, no-store");
    const budget = await readModelBudget(Number(req.user.id),String(req.params.id));
    res.json({ data: { ...receipt, status:billingReceiptStatus(receipt.entries.length,budget),points: quotaToPoints(receipt.quota),budget } });
  } catch { res.status(503).json({ message: "费用记录暂未完成，请在积分明细中核对" }); }
});
export default router;
