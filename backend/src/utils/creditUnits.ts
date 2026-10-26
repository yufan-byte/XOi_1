/** Product contract: ¥1 = 10 points; only NewAPI quota is stored. */
export const POINTS_PER_YUAN = 10;
export const QUOTA_PER_YUAN = 500_000;
export const QUOTA_PER_POINT = QUOTA_PER_YUAN / POINTS_PER_YUAN;
export function quotaToPoints(quota: number) { return Number(quota) / QUOTA_PER_POINT; }
export function pointsToQuota(points: number) { return Math.round(Number(points) * QUOTA_PER_POINT); }
