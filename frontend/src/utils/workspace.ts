import axios from "@/utils/axios";
import rawAxios from "axios";
import settingStore from "@/stores/setting";

const config = { preserveHttpError: true, timeout: 15000 } as any;
export interface CloudDocument<T = any> { id: string; title: string; revision: number; updatedAt: number; payload: T }
export function assertWorkspaceOwner(owner: string) {
  if (!owner || owner !== localStorage.getItem("userId") || !localStorage.getItem("token")) throw new Error("账号已变化，请重新打开工作台");
}
export async function getCloudDocument<T>(owner: string, kind: string, id: string): Promise<CloudDocument<T> | null> {
  assertWorkspaceOwner(owner);
  try {
    const result = await axios.get<CloudDocument<T>>(`/workspace/documents/${kind}/${encodeURIComponent(id)}`, config);
    assertWorkspaceOwner(owner); return result.data;
  } catch (error: any) { if (error.response?.status === 404) return null; throw error; }
}
export async function listCloudDocuments(owner: string, kind: string) {
  assertWorkspaceOwner(owner);
  const result = await axios.get<Omit<CloudDocument, "payload">[]>(`/workspace/documents/${kind}`, config);
  assertWorkspaceOwner(owner); return result.data;
}
export async function saveCloudDocument(owner: string, kind: string, id: string, revision: number, title: string, payload: unknown) {
  assertWorkspaceOwner(owner);
  const result = await axios.put<{ revision: number; updatedAt: number }>(`/workspace/documents/${kind}/${encodeURIComponent(id)}`, { revision, title, payload }, config);
  assertWorkspaceOwner(owner); return result.data;
}
export interface CloudAsset { url: string; name: string; type: string; bytes: number }
const uploaded = new WeakMap<File, { owner: string; pending: Promise<CloudAsset> }>();
export function rememberWorkspaceFile(owner: string, file: File, asset: CloudAsset) { uploaded.set(file, { owner, pending: Promise.resolve(asset) }); }
export async function uploadWorkspaceFile(owner: string, file: File): Promise<CloudAsset> {
  assertWorkspaceOwner(owner);
  let pending = uploaded.get(file)?.owner === owner ? uploaded.get(file)?.pending : undefined;
  if (!pending) {
    pending = (async () => {
      if (file.size > 128 * 1024 * 1024) throw new Error("素材超过 128MB，请先压缩后再上传");
      const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm" } as Record<string, string>)[file.type];
      if (!ext) throw new Error("云端素材支持 PNG / JPG / WebP / GIF / MP4 / WebM");
      const response = await rawAxios.post(`${settingStore().baseUrl.replace(/\/$/, "")}/canvas-files?ext=${ext}`, file, {
        headers: { Authorization: localStorage.getItem("token") || "", "Content-Type": "application/octet-stream" }, timeout: 120000,
      });
      assertWorkspaceOwner(owner);
      return { url: response.data.url, bytes: response.data.bytes, name: file.name, type: file.type };
    })();
    uploaded.set(file, { owner, pending });
    pending.catch(() => uploaded.delete(file));
  }
  return pending;
}
export async function downloadWorkspaceFile(owner: string, asset: CloudAsset): Promise<File> {
  assertWorkspaceOwner(owner);
  if (!/^\d+$/.test(owner) || !asset.url.startsWith(`/oss/canvas-files/${owner}/`) || !/^\/oss\/canvas-files\/\d+\/[a-f0-9]{32}\.(png|jpg|jpeg|webp|gif|mp4|webm)$/.test(asset.url)) throw new Error("无效的云端素材地址");
  const api = new URL(settingStore().baseUrl, location.origin);
  const response = await rawAxios.get(new URL(asset.url, api.origin).href, { responseType: "blob", timeout: 120000 });
  assertWorkspaceOwner(owner);
  const file = new File([response.data], asset.name, { type: asset.type });
  rememberWorkspaceFile(owner, file, asset); return file;
}
