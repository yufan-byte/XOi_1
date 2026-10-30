import type { RequestHandler } from "express";
/** Optional browser expectation; identity still comes exclusively from authenticated credentials. */
export const expectedAccount: RequestHandler = (req, res, next) => {
  const expected = req.headers["x-xoi-expected-user"];
  if (expected !== undefined && (typeof expected !== "string" || !/^[1-9]\d{0,15}$/.test(expected) ||
      expected !== String((req as typeof req & {user?: {id?: number}}).user?.id))) {
    res.set("Cache-Control", "no-store").status(409).json({success: false, message: "账号已切换，请重新打开页面；本次操作未执行"});
    return;
  }
  next();
};
