import express from "express";
import { boundedInteger, queryText } from "@/utils/adminQuery";
import { requireAdmin } from "@/middleware/requireAdmin";
import { success, error } from "@/lib/responseFormat";
import {db} from "@/utils/db";

const router = express.Router();
router.use(requireAdmin);
/** Operational counters only; no credentials or arbitrary quota-write/release actions. */
router.get("/security",async(_req,res)=>{
  try{
    const [negative,pending,leases,tasks,budgets]=await Promise.all([
      db("users").where("quota","<",0).count("id as count").first(),
      db("xoi_quota_operations").whereIn("state",["processing","unknown"]).select("state").count("operation_key as count").groupBy("state"),
      db("xoi_model_leases").where("expires_at",">",Date.now()).count("id as count").first(),
      db("xoi_generation_tasks").whereIn("status",["running","unknown"]).select("status").count("id as count").groupBy("status"),
      db("xoi_model_budgets").where("reserved_quota",">",0).where("state","stopped").count("billing_id as count").first(),
    ]);
    res.setHeader("Cache-Control","private, no-store");res.send(success({negativeBalances:Number(negative?.count||0),pendingQuotaChanges:pending,activeModelRequests:Number(leases?.count||0),mediaTasks:tasks,stoppedBudgetsWithReservations:Number(budgets?.count||0),note:"预留不是扣款；待核对记录不能直接自动退款或重复入账"}));
  }catch{res.status(503).send(error("安全审计暂不可用"));}
});

/** Read authoritative model budgets. Amounts here are ceilings/holds, never implied refunds. */
router.get("/",async(req,res)=>{
 try{
  const page=boundedInteger(req.query.page,1,10000),limit=boundedInteger(req.query.limit,20,100),status=queryText(req.query.status),search=queryText(req.query.search);
  const base=db("xoi_model_budgets as b").leftJoin("o_user as u","b.user_id","u.id");
  if(status)base.where("b.state",status);
  if(search)base.where(q=>q.where("u.name","ilike","%"+search+"%").orWhere("b.operation_path","ilike","%"+search+"%"));
  const [rows,total]=await Promise.all([base.clone().select("b.billing_id as id","b.user_id","b.operation_path as scene","b.state as status","b.limit_quota","b.reserved_quota","b.calls","b.max_calls","b.created_at","b.expires_at","b.stop_reason","b.free_only","u.name as user_name").orderBy("b.created_at","desc").limit(limit).offset((page-1)*limit),base.clone().count("b.billing_id as count").first()]);
  res.setHeader("Cache-Control","private, no-store");
  res.send(success({reservations:rows.map((r:any)=>({...r,points:Number(r.limit_quota)/50000,reserved_points:Number(r.reserved_quota)/50000,charged_points:null})),pagination:{page,limit,total:Number(total?.count||0)},statusStats:[],note:"仅显示预算授权和占用；实际扣费请核对 NewAPI 日志，不可把预算当退款金额。"}));
 }catch(e){console.error("[admin/billing]",e);res.status(503).send(error("计费记录暂不可用"));}
});
/** Retired compatibility action must never claim a no-op was a successful refund. */
router.post("/:id/release",(_req,res)=>res.status(410).send(error("旧预扣释放功能已停用，未执行退款。请先核对真实账单，再通过受审计的额度发放流程处理。")));

export default router;
