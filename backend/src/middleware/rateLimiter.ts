import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const stores = new Set<Map<string, RateLimitEntry>>();

// 定期清理过期条目，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const store of stores) for (const [key, entry] of store.entries()) {
    if (now > entry.resetTime) {
      store.delete(key);
    }
  }
}, 60000).unref(); // 每分钟清理一次

interface RateLimiterOptions {
  windowMs: number;  // 时间窗口（毫秒）
  max: number;       // 最大请求数
  message?: string;  // 超限提示信息
  keyGenerator?: (req: Request) => string; // 自定义key生成器
}

/**
 * 内存速率限制中间件
 * 用于登录、注册等敏感接口的暴力破解防护
 */
export function rateLimiter(options: RateLimiterOptions) {
  const store = new Map<string, RateLimitEntry>();
  stores.add(store);
  const { windowMs, max, message = "请求过于频繁，请稍后再试", keyGenerator } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator ? keyGenerator(req) : (req.ip || req.socket.remoteAddress || "unknown");
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || now > entry.resetTime) {
      if (store.size >= 10000 && !entry) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ message });
      }
      entry = { count: 1, resetTime: now + windowMs };
      store.set(key, entry);
      return next();
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ message });
    }

    next();
  };
}

/**
 * 登录限流：同一IP每分钟最多10次登录尝试
 */
export const loginLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 10,
  message: "登录尝试次数过多，请1分钟后再试",
});

/**
 * 注册限流：同一IP每小时最多5次注册
 */
export const registerLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 5,
  message: "注册次数过多，请1小时后再试",
});
