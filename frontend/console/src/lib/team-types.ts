/**
 * 团队「批量下发」相关的共享类型。
 *
 * 单独放一个文件是为了让 team-page 与 team-batch 都能引用而不互相 import
 * （两者都需要对方的符号，循环 import 在 Vite 下会产出 undefined 模块）。
 */

/** 批量创建后只回元数据：账号名 + 昵称。密码不出现在这里。 */
export interface BatchUserSummary {
  id: number; userId: number; username: string; nickname: string; limitQuota: number; period: "day" | "month" | "total";
}

export interface BatchResult {
  teamId: number; batchId: string; expiresAt: number;
  users: BatchUserSummary[]; createdCount: number; failed: number; requiredQuota: number;
}

/** 一次批量下发批次的可导出状态（不含任何密码）。 */
export interface BatchSummary {
  batchId: string; teamId: number; count: number;
  createdAt: number; expiresAt: number; downloads: number; expired: boolean;
}

/** 单条可导出的账号凭据 —— 只存在于服务端解密后的那一刻，不经过 JSON 接口。 */
export interface BatchCredential {
  username: string; nickname: string; password: string; limitQuota: number; period: string;
}
