import { db } from "@/utils/db";
import { z } from "zod";

export const policySchema = z.object({
  registrationOpen: z.boolean(),
  welcomePoints: z.number().int().min(0).max(100000),
  maintenance: z.boolean(),
}).strict();
export type PlatformPolicy = z.infer<typeof policySchema>;
export const defaultPolicy: PlatformPolicy = { registrationOpen: true, welcomePoints: 0, maintenance: false };
let cached: { value: PlatformPolicy; expires: number } | undefined;
let pending: Promise<PlatformPolicy> | undefined;
export function invalidatePolicy() { cached = undefined; }
export async function getPlatformPolicy(): Promise<PlatformPolicy> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const row = await db("o_setting").where("key", "platformPolicy").first();
    const value = row?.value ? policySchema.parse(JSON.parse(row.value)) : { ...defaultPolicy };
    cached = { value, expires: Date.now() + 1000 };
    return value;
  })();
  try { return await pending; } finally { pending = undefined; }
}
