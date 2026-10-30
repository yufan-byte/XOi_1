import axios from "axios";
import settingStore from "@/stores/setting";
import { MAX_OUTPUT_ARCHIVE_BYTES } from "../../../shared/outputArchivePolicy";
import { authHeaders, sessionSignal } from "./session";

/** Uploading media never authorizes a model call. Bind the whole upload to its original session. */
export async function uploadOutputArchive(ownerId: string, token: string, blob: Blob): Promise<string> {
  const assertOwner = () => {
    if (!/^[1-9]\d*$/.test(ownerId) || !token || localStorage.getItem("userId") !== ownerId || sessionSignal() !== token) throw new Error("账号已变化，已停止自动归档");
  };
  assertOwner();
  if (blob.size <= 0 || blob.size > MAX_OUTPUT_ARCHIVE_BYTES) throw new Error("成片为空或超过 128MB 归档上限");
  try {
    const response = await axios.post(`${settingStore().baseUrl.replace(/\/$/, "")}/canvas-files?ext=mp4`, blob, {
      headers: { ...authHeaders(), "Content-Type": "application/octet-stream" }, timeout: 120000,
    });
    assertOwner();
    const url = response.data?.url;
    if (typeof url !== "string" || !new RegExp(`^/oss/canvas-files/${ownerId}/[a-f0-9]{32}\\.mp4$`).test(url)) throw new Error("上传未返回有效的成片地址");
    return url;
  } catch (error: any) {
    throw new Error(error.response?.data?.detail || error.response?.data?.message || error.message || "成片上传失败");
  }
}
