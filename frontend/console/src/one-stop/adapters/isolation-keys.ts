/** Stable account partition, explicit project partition; never adopt unattributed legacy files. */
export function clipBlobKey(session: string, project: string, asset: string) {
  const uid = /^([1-9]\d*):/.exec(session)?.[1];
  if (!uid || !/^[A-Za-z0-9_-]{1,160}$/.test(project) || !asset || asset.length > 240)
    throw new Error("素材归属无效");
  return JSON.stringify(["v2", uid, project, asset]);
}
export function generationScope(session: string, project: string) {
  return JSON.stringify([session, project]);
}
