import express from "express";
import { z } from "zod";
import { BillingBudgetError } from '@/utils/billingBudgetPolicy';
import {
  ONE_STOP_COLLECTIONS, ONE_STOP_ID, ONE_STOP_MAX_BYTES, OneStopError,
  validateOneStopPage, type OneStopDocuments,
} from "./documents";

const collection = z.enum(ONE_STOP_COLLECTIONS);
const revision = z.number().int().min(0).max(2147483646);
const positiveQuery = (fallback: string) => z.string().regex(/^[1-9][0-9]{0,4}(?![\s\S])/).default(fallback).transform(Number);
const listQuery = z.strictObject({ collection, page: positiveQuery("1"), pageSize: positiveQuery("50") });
const itemQuery = z.strictObject({ collection });
const noQuery = z.strictObject({});
const putBody = z.strictObject({ collection, revision, title: z.string().max(160), payload: z.record(z.string(), z.unknown()) });
const deleteBody = z.strictObject({ collection, revision: revision.min(1) });
type Store = Pick<OneStopDocuments, "list" | "get" | "save" | "delete">;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new OneStopError("请求格式不正确，请检查集合、版本及字段");
  return result.data;
}

function fail(res: express.Response, error: unknown) {
  const status = error instanceof OneStopError ? error.status : error instanceof BillingBudgetError ? 402 : 503;
  return res.status(status).json({ success: false, message: error instanceof OneStopError || error instanceof BillingBudgetError ? error.message : "服务暂不可用，请稍后重试；若已提交生成，请先核对原任务" });
}

/** Mounted after authentication. The getter may lazily resolve the application's pool. */
export function createOneStopRouter(getStore: () => Store | Promise<Store>, generation?: {
  quote:(owner:number,input:unknown)=>Promise<unknown>;submit:(owner:number,input:any)=>Promise<unknown>;
  get:(owner:number,id:string)=>Promise<unknown>;list:(owner:number,projectId:string)=>Promise<unknown>;
  stop:(owner:number,id:string)=>Promise<unknown>;receipt:(owner:number,id:string)=>Promise<unknown>;
  active:(owner:number,projectId:string)=>Promise<unknown>;
  capabilities?:()=>unknown;
  recover?:(owner:number,id:string)=>Promise<unknown>;acknowledge?:(owner:number,id:string,confirmed:boolean)=>Promise<unknown>;
},history?:{
  list:(owner:number,id:string,page:number)=>Promise<unknown>;
  get:(owner:number,id:string,version:number)=>Promise<unknown>;
  restore:(owner:number,id:string,version:number,revision:number,clientId:string)=>Promise<unknown>;
}) {
  const router = express.Router();
  const owner = (req: express.Request) => {
    const id = (req as express.Request & { user?: { id?: unknown } }).user?.id;
    return typeof id === "number" || (typeof id === "string" && /^[1-9][0-9]{0,15}(?![\s\S])/.test(id)) ? Number(id) : NaN;
  };
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    const id = owner(req);
    if (!Number.isSafeInteger(id) || id < 1) return fail(res, new OneStopError("请先登录", 401));
    const size = Number(req.get("content-length") || 0);
    if (size > ONE_STOP_MAX_BYTES) return fail(res, new OneStopError("文档超过 8 MiB，请减少素材内容", 413));
    next();
  });
  router.use(express.json({ limit: ONE_STOP_MAX_BYTES, strict: true, inflate: false }));
  router.use((req, res, next) => {
    // The host application may already have parsed JSON with a larger limit.
    if (req.body !== undefined) {
      try {
        if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > ONE_STOP_MAX_BYTES) {
          return fail(res, new OneStopError("文档超过 8 MiB，请减少素材内容", 413));
        }
      } catch {
        return fail(res, new OneStopError("请求内容必须是有效 JSON"));
      }
    }
    next();
  });
  const route = (run: (req: express.Request) => Promise<unknown>): express.RequestHandler => async (req, res) => {
    try {
      res.json({ success: true, data: await run(req) });
    } catch (error) {
      fail(res, error);
    }
  };
  const documentId = (req: express.Request) => {
    const id = req.params.id;
    if (typeof id !== "string" || !ONE_STOP_ID.test(id)) throw new OneStopError("文档编号格式不正确");
    return id;
  };
  if(generation){
    if(generation.capabilities)router.get('/generation/capabilities',route(async()=>generation.capabilities!()));
    router.post('/generation/quote',route(req=>generation.quote(owner(req),req.body)));
    router.post('/generation/jobs',route(req=>generation.submit(owner(req),req.body)));
    router.get('/generation/jobs',route(req=>generation.list(owner(req),String(req.query.projectId||''))));
    router.get('/generation/jobs/:id',route(req=>generation.get(owner(req),documentId(req))));
    router.post('/generation/jobs/:id/stop',route(req=>generation.stop(owner(req),documentId(req))));
    router.get('/generation/jobs/:id/receipt',route(req=>generation.receipt(owner(req),documentId(req))));
    if(generation.recover)router.post('/generation/jobs/:id/recover',route(req=>generation.recover!(owner(req),documentId(req))));
    if(generation.acknowledge)router.post('/generation/jobs/:id/acknowledge',route(req=>generation.acknowledge!(owner(req),documentId(req),req.body?.confirmed===true)));
  }

  if(history){
    const version=(req:express.Request)=>parse(z.coerce.number().int().min(1).max(2147483646),req.params.version);
    router.get('/documents/:id/history',route(req=>{const q=parse(z.strictObject({page:positiveQuery('1')}),req.query);validateOneStopPage(q.page,20);return history.list(owner(req),documentId(req),q.page);}));
    router.get('/documents/:id/history/:version',route(req=>{parse(noQuery,req.query);return history.get(owner(req),documentId(req),version(req));}));
    router.post('/documents/:id/history/:version/restore',route(req=>{
      parse(noQuery,req.query);const b=parse(z.strictObject({revision:revision.min(1),clientId:z.string().regex(/^[A-Za-z0-9_-]{16,100}$/)}),req.body);
      return history.restore(owner(req),documentId(req),version(req),b.revision,b.clientId);
    }));
  }
  router.get("/documents", route(async req => {
    const q = parse(listQuery, req.query);
    validateOneStopPage(q.page, q.pageSize);
    return (await getStore()).list(owner(req), q.collection, q.page, q.pageSize);
  }));
  router.get("/documents/:id", route(async req => {
    const q = parse(itemQuery, req.query), id = documentId(req);
    return (await getStore()).get(owner(req), q.collection, id);
  }));
  router.put("/documents/:id", route(async req => {
    parse(noQuery, req.query);
    const b = parse(putBody, req.body), id = documentId(req);
    if(b.collection==='comic'&&generation&&await generation.active(owner(req),id))throw new OneStopError('此项目正在生成或结果待核对，暂不能修改；已有本机修改会保留，请先查看任务',409);
    return (await getStore()).save(owner(req), b.collection, id, b.revision, b.title, b.payload);
  }));
  router.delete("/documents/:id", route(async req => {
    parse(noQuery, req.query);
    const b = parse(deleteBody, req.body), id = documentId(req);
    if(b.collection==='comic'&&generation&&await generation.active(owner(req),id))throw new OneStopError('请先停止并核对生成任务，再删除项目',409);
    return (await getStore()).delete(owner(req), b.collection, id, b.revision);
  }));
  router.use((_req, res) => fail(res, new OneStopError("文档接口不存在", 404)));
  const errors: express.ErrorRequestHandler = (error, _req, res, _next) => {
    const tooLarge = error?.type === "entity.too.large";
    fail(res, new OneStopError(tooLarge ? "文档超过 8 MiB，请减少素材内容" : "请求内容格式不正确", tooLarge ? 413 : 400));
  };
  router.use(errors);
  return router;
}
