import { Request, Response, NextFunction } from "express";
import { z, ZodTypeAny } from "zod";

import { zhCN } from "zod/locales";

z.config(zhCN());

export function validateFields(
  shape: Record<string, ZodTypeAny>,
  source: "body" | "query" | "params" = "body", // 默认校验 body
) {
  const schema = z.object(shape);

  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    for (const [field, min, max] of [["page", 1, 100000], ["limit", 1, 200], ["concurrentCount", 1, 10], ["groupSize", 1, 50]] as const) {
      if (!(field in shape) || data?.[field] == null) continue;
      if (!Number.isSafeInteger(data[field]) || data[field] < min || data[field] > max) {
        return res.status(400).json({ message: `${field} 必须是 ${min}~${max} 的整数` });
      }
    }
    const parseResult = schema.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => `字段 ${issue.path.join(".")} ${issue.message}`);
      console.error(errors);
      return res.status(400).json({ message: "参数错误", errors });
    }
    // Use the parsed object: refinements, coercion, defaults and unknown-field removal must reach handlers.
    if (source === "query") Object.defineProperty(req, "query", { value: parseResult.data, configurable: true, writable: true });
    else (req as any)[source] = parseResult.data;
    next();
  };
}
