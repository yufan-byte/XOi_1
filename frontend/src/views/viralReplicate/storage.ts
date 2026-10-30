import localforage from "localforage";
import {accountBoundary} from "@/utils/accountBoundary";
import { restoreShots, type ReplicateShot } from "./workflow";
import { assertWorkspaceOwner, getCloudDocument, listCloudDocuments, saveCloudDocument, uploadWorkspaceFile, downloadWorkspaceFile, rememberWorkspaceFile, type CloudAsset } from "@/utils/workspace";
export interface ReplicateDraft {
  id: string; owner: string; title: string; updatedAt: number; summary: string; stage: "analyze" | "boards" | "videos" | "done";
  shots: ReplicateShot[]; settings: { visionModel: string; imageModel: string; videoModel: string; seconds: number; resolution: string; ratio: string; stepwise: boolean };
  product?: File; video?: File;
  revision?: number;
  cloudRevision?: number;
  cloudPending?: boolean;
  productAsset?: CloudAsset; videoAsset?: CloudAsset;
  conflictCopyId?: string;
}
// IndexedDB is an account-scoped recovery cache; the server holds portable draft JSON and asset URLs.
const drafts = localforage.createInstance({ name: "xoi-viral", storeName: "drafts", driver: localforage.INDEXEDDB });
export function draftKey(owner: string, id: string) {
  if (!owner || !id) throw new Error("登录后才能保存复刻任务");
  return `${encodeURIComponent(owner)}:${encodeURIComponent(id)}`;
}
export async function saveDraft(draft: ReplicateDraft) {
  const scope=accountBoundary.capture();assertWorkspaceOwner(draft.owner);
  const key = draftKey(draft.owner, draft.id);
  const write = async () => {
    assertWorkspaceOwner(draft.owner);
    accountBoundary.assert(scope);
    const previous = await drafts.getItem<ReplicateDraft>(key);
    accountBoundary.assert(scope);
    if (previous && Number(previous.revision || 0) !== Number(draft.revision || 0)) throw new Error("任务已在其他页面更新，请重新打开草稿；不会提交生成");
    const revision = Number(draft.revision || 0) + 1;
    // Keep the latest edit locally even if the network fails. Never report it as cloud-saved.
    await drafts.setItem(key, { ...draft, cloudRevision: previous?.cloudRevision || draft.cloudRevision || 0, cloudPending: true });
    try {
      const productAsset = draft.product ? await uploadWorkspaceFile(draft.owner, draft.product) : draft.productAsset;
      const videoAsset = draft.video ? await uploadWorkspaceFile(draft.owner, draft.video) : draft.videoAsset;
      const { product, video, owner, revision: localRevision, cloudRevision, cloudPending, ...portable } = draft;
      const saved = await saveCloudDocument(owner, "viral", draft.id, previous?.cloudRevision || cloudRevision || 0, draft.title, { ...portable, productAsset, videoAsset });
      accountBoundary.assert(scope);
      await drafts.setItem(key, { ...draft, productAsset, videoAsset, revision, cloudRevision: saved.revision, cloudPending: false });
    } catch (error: any) {
      throw new Error(error.response?.status === 409 ? "云端草稿已在其他设备更新，本机修改仍保留；请重新打开并核对" : "本机已保留修改，但云端保存未完成；请检查网络后重试，不会提交生成");
    }
    localStorage.setItem(`xoi:viral-current:${draft.owner}`, draft.id);
    return revision;
  };
  if (!navigator.locks) throw new Error("浏览器不支持安全保存，请使用新版 Chrome 或 Edge");
  return navigator.locks.request(`xoi:viral-save:${key}`, write);
}
export async function loadDraft(owner: string, id: string): Promise<ReplicateDraft | null> {
  const key = draftKey(owner, id);
  // A same-device in-flight save is not a cross-device conflict. Wait for its complete checkpoint.
  if (navigator.locks) return navigator.locks.request(`xoi:viral-save:${key}`, () => loadDraftUnlocked(owner, id));
  return loadDraftUnlocked(owner, id);
}
async function loadDraftUnlocked(owner: string, id: string): Promise<ReplicateDraft | null> {
  const scope=accountBoundary.capture();assertWorkspaceOwner(owner);
  const key = draftKey(owner, id), local = await drafts.getItem<ReplicateDraft>(key);
  accountBoundary.assert(scope);
  let remote;
  try { remote = await getCloudDocument<ReplicateDraft>(owner, "viral", id); }
  catch (error) { accountBoundary.assert(scope);assertWorkspaceOwner(owner);if (local?.owner === owner) return { ...local, cloudPending: true, shots: restoreShots(local.shots) }; throw error; }
  accountBoundary.assert(scope);
  let conflictCopyId: string | undefined;
  if (local?.cloudPending && remote && remote.revision !== (local.cloudRevision || 0)) {
    // Resolve explicitly on reopen: retain edits as a separate local fork, then open the authoritative cloud version.
    conflictCopyId = `conflict-${crypto.randomUUID()}`;
    await drafts.setItem(draftKey(owner, conflictCopyId), { ...local, id: conflictCopyId, title: `${local.title}（本机未同步副本）`, revision: 0, cloudRevision: 0, cloudPending: true, updatedAt: Date.now() });
  } else if (local?.cloudPending) {
    return { ...local, shots: restoreShots(local.shots) };
  }
  if (!remote) return local?.owner === owner ? { ...local, cloudPending: true, shots: restoreShots(local.shots) } : null;
  const draft: ReplicateDraft = { ...remote.payload, id, owner, updatedAt: remote.updatedAt, revision: local?.revision || 0, cloudRevision: remote.revision, cloudPending: false, conflictCopyId };
  // Reuse local files only if they refer to the same cloud object. Do not download large source videos at page load.
  if (local?.productAsset?.url === draft.productAsset?.url) draft.product = local?.product;
  if (local?.videoAsset?.url === draft.videoAsset?.url) draft.video = local?.video;
  if (draft.product && draft.productAsset) rememberWorkspaceFile(owner, draft.product, draft.productAsset);
  if (draft.video && draft.videoAsset) rememberWorkspaceFile(owner, draft.video, draft.videoAsset);
  await drafts.setItem(key, draft);
  accountBoundary.assert(scope);
  return { ...draft, shots: restoreShots(draft.shots) };
}
export async function restoreDraftFiles(draft: ReplicateDraft) {
  if (!draft.product && draft.productAsset) draft.product = await downloadWorkspaceFile(draft.owner, draft.productAsset);
  if (!draft.video && draft.videoAsset) draft.video = await downloadWorkspaceFile(draft.owner, draft.videoAsset);
  return draft;
}
export async function listDrafts(owner: string) {
  const scope=accountBoundary.capture();assertWorkspaceOwner(owner);
  const items: { id: string; title: string; updatedAt: number; shots: number; completed: number }[] = [];
  await drafts.iterate<ReplicateDraft, void>(draft => {
    if (draft.owner === owner) items.push({ id: draft.id, title: draft.title, updatedAt: draft.updatedAt, shots: draft.shots.length, completed: draft.shots.filter(s => s.clip).length });
  });
  try {
    const remote = await listCloudDocuments(owner, "viral");
    for (const doc of remote) if (!items.some(item => item.id === doc.id)) items.push({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt, shots: 0, completed: 0 });
  } catch { /* Offline cache remains visible. Save must still fail closed before a paid submission. */ }
  accountBoundary.assert(scope);assertWorkspaceOwner(owner);return items.sort((a, b) => b.updatedAt - a.updatedAt);
}
