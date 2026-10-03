/**
 * 资产库三 Tab 共享的小工具：作品/画布素材 → 项目素材（o_assets）的桥接动作。
 *
 * 「存入项目素材」走既有 POST /assets/uploadClip（base64 落 oss + 写 o_assets/o_image），
 * 这样不用新开后端路由，作品和画布素材都能以「拷贝」语义进入项目的生产要素体系。
 */
import axios from "@/utils/axios";
import { MessagePlugin } from "tdesign-vue-next";

/** 远端/本地 URL → base64 DataURL（同源 /oss 与 blob: 都可 fetch） */
export async function urlToBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`资源读取失败 HTTP ${resp.status}`);
  const blob = await resp.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("base64 转换失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 把一张图/一段音视频存为当前项目的「素材」类资产。
 * @returns 新建资产 id（失败抛错）
 */
export async function saveAssetToProject(
  projectId: number,
  url: string,
  name: string,
  type: string = "clip",
): Promise<number> {
  const base64Data = await urlToBase64(url);
  if (!/^data:[^;]+;base64,/.test(base64Data)) throw new Error("不是可入库的媒体资源");
  const res: any = await axios.post("/assets/uploadClip", { projectId, base64Data, type, name });
  if (res?.data && res.data.success === false) throw new Error(res.data.message || "存入失败");
  MessagePlugin.success(`已存入项目素材：${name}`);
  return Number(res?.data?.data?.id) || 0;
}

/** 触发浏览器下载（同源/跨源均可，跨源走 fetch→blob 兜底） */
export async function downloadUrl(url: string, filename: string) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch {
    // fetch 失败（跨源限制等）退化为直接跳转
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/** 时间戳/ISO → 「2026/10/2」短日期 */
export function shortDate(input: string | number | undefined): string {
  if (input === undefined || input === null || input === "") return "";
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
