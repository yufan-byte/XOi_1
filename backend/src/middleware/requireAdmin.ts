import { Request, Response, NextFunction } from "express";

// 管理员权限校验中间件
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== "admin" || user.status === "banned") {
    return res.status(403).send({ message: "权限不足，仅管理员可操作" });
  }
  next();
};
