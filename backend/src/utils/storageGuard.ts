import fs from "node:fs/promises";
import path from "node:path";
import getPath from "@/utils/getPath";

/**
 * 磁盘水位熔断。
 *
 * 为什么必须有：oss 素材、业务库 WAL、new-api 的日志与它自己的缓存共用同一块盘。
 * 盘写满时 new-api 的磁盘保护会对**每一个** API 请求回 503 —— 不只是上传，
 * 连登录和对话都会挂。造物 2026-10-04 就是这么整站挂掉的（其 media-store.ts:270
 * 的注释留了这句教训），我们目前完全没有这层保护。
 *
 * 两条取舍，与造物一致：
 *  1. 查询失败按「不熔断」处理。监控本身出问题不能把正常上传一起拒掉；
 *  2. 结果缓存 30 秒。statfs 很便宜，但每个上传请求都打一次没必要，
 *     而且盘满是一个持续状态，30 秒的滞后不会造成实际影响。
 */

/** 剩余空间低于这个值就熔断 */
const MIN_FREE_BYTES = 10 * 1024 * 1024 * 1024;
/** 或者低于总容量的这个比例（小盘机器上 10GB 可能本身就不现实） */
const MIN_FREE_RATIO = 0.05;
/** 硬下限：低于 2GB 无论比例如何都拒绝写入 */
const HARD_FLOOR_BYTES = 2 * 1024 * 1024 * 1024;
const CACHE_MS = 30_000;

const cache = new Map<string, { at: number; low: boolean; free: number; total: number }>();

export interface DiskSpace {
  low: boolean;
  free: number;
  total: number;
}

/** 检查某个目录所在分区的水位。dir 默认 oss 根目录。 */
export async function diskSpace(dir?: string): Promise<DiskSpace> {
  const target = dir ?? getPath("oss");
  const hit = cache.get(target);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;

  let result: DiskSpace = { low: false, free: Number.MAX_SAFE_INTEGER, total: 0 };
  try {
    await fs.mkdir(target, { recursive: true });
    const st = await fs.statfs(target);
    const free = Number(st.bavail) * Number(st.bsize);
    const total = Number(st.blocks) * Number(st.bsize);
    const threshold = Math.max(HARD_FLOOR_BYTES, Math.min(MIN_FREE_BYTES, total * MIN_FREE_RATIO));
    result = { low: free < threshold, free, total };
  } catch {
    // 查不到就按充足处理：宁可放过一次上传，也不要因为监控异常把站停掉
  }
  cache.set(target, { at: Date.now(), ...result });
  return result;
}

/** 给上传入口用的一句话判断：需要拒绝时返回可直接回给用户的信息。 */
export async function diskRefusal(dir?: string): Promise<{ status: number; message: string } | null> {
  const space = await diskSpace(dir);
  if (!space.low) return null;
  const gb = (space.free / 1024 ** 3).toFixed(1);
  return {
    status: 507,
    message: `服务器存储空间不足（剩余 ${gb}GB），暂时不能上传，请稍后再试或联系管理员`,
  };
}

/** 仅测试用：清掉缓存，让下一次调用重新 statfs */
export function _resetDiskCache() {
  cache.clear();
}

/** 给运维/控制台看的一行摘要 */
export async function diskSummary(dir?: string) {
  const space = await diskSpace(dir);
  return {
    freeBytes: space.free,
    totalBytes: space.total,
    freeGb: Number((space.free / 1024 ** 3).toFixed(2)),
    totalGb: Number((space.total / 1024 ** 3).toFixed(2)),
    low: space.low,
  };
}

/** 上传/写盘前统一闸门：水位不足或配额不足都从这里出。 */
export async function assertStorageWritable(dir?: string) {
  const refused = await diskRefusal(dir);
  if (refused) {
    const error = new Error(refused.message) as Error & { status: number };
    error.status = refused.status;
    throw error;
  }
}

export { MIN_FREE_BYTES, MIN_FREE_RATIO, HARD_FLOOR_BYTES };
