import { AsyncLocalStorage } from "node:async_hooks";

interface GatewayRequestContext {
  userId: number;
  billingId?: string;
  mediaQueue?: {kind:string;taskId:string;leaseToken:string;workerId:string;signal?:AbortSignal};
}

const storage = new AsyncLocalStorage<GatewayRequestContext>();

/** 让深层 AI 调用可以拿到当前请求对应的 new-api 用户，而不把 userId 传遍所有 Agent。 */
export function runWithGatewayUser<T>(userId: number, fn: () => T, billingId?: string,mediaQueue?:GatewayRequestContext["mediaQueue"]): T {
  const context: GatewayRequestContext = { userId };
  if (billingId !== undefined) context.billingId = billingId;
  if (mediaQueue !== undefined) context.mediaQueue = mediaQueue;
  return storage.run(context, fn);
}
export function getGatewayRequestContext() { return storage.getStore(); }

export function requireGatewayUserId(): number {
  const userId = storage.getStore()?.userId;
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0) {
    throw new Error("当前 AI 请求缺少用户身份，已拒绝使用平台公共令牌");
  }
  return Number(userId);
}
