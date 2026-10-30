import { assertNativeDirectorProject, ownedDirectorSceneId, type DirectorReferenceProject } from "../../../shared/directorProject";
import { exportNativePreviz, restoreAfterPreviz, videoTransferControls } from "./directorPreviz";
import { directorReferenceGraph } from "../../../shared/directorCanvas";
import { sessionSignal } from "./session";
export interface DirectorCheckpoint {
  project: Record<string, any>;
  revision: number;
  title: string;
  frame: number;
}
function account(owner: string, token: string) {
  if (sessionSignal() !== token || !ownedDirectorSceneId(`director3d-u${owner}-check`, owner))
    throw new Error("账号已切换，请重新打开导演台");
}
export async function checkpointDirector(iframe: HTMLIFrameElement | null, sceneId: string, owner: string): Promise<DirectorCheckpoint> {
  const token = sessionSignal() || "";
  account(owner, token);
  if (
    !token ||
    !ownedDirectorSceneId(sceneId, owner) ||
    !iframe?.contentWindow ||
    new URL(iframe.src, location.href).origin !== location.origin ||
    new URL(iframe.src, location.href).searchParams.get("key") !== sceneId
  )
    throw new Error("导演台身份或场景不匹配");
  const api = (iframe.contentWindow as any).xoiDirectorScene;
  if (!api) throw new Error("场景同步尚未准备好，请稍后重试");
  const frozen = iframe.hasAttribute("inert");
  iframe.setAttribute("inert", "");
  iframe.blur();
  try {
    const result = await api.checkpoint();
    account(owner, token);
    assertNativeDirectorProject(result.project);
    if (!Number.isSafeInteger(result.revision) || result.revision < 1) throw new Error("云端保存尚未确认，当前草稿保留");
    return result;
  } finally {
    if (!frozen) iframe.removeAttribute("inert");
  }
}
async function captureShotPackage(
  iframe: HTMLIFrameElement | null,
  sceneId: string,
  owner: string,
  sceneName: string,
  prompt?: string,
  controls?: ReturnType<typeof videoTransferControls>,
) {
  const token = sessionSignal() || "",
    saved = await checkpointDirector(iframe, sceneId, owner),
    doc = iframe!.contentDocument!;
  controls?.signal.throwIfAborted();
  const restore = doc.querySelector<HTMLButtonElement>('.monitor-head-actions button[title="恢复摄像机窗口"]');
  restore?.click();
  let image: Blob,
    width = 0,
    height = 0;
  try {
    await new Promise((r) => setTimeout(r, 180));
    account(owner, token);
    const canvas = doc.querySelector<HTMLCanvasElement>(".monitor-canvas canvas");
    if (!canvas || canvas.width < 16 || canvas.height < 16) throw new Error("摄影机画面尚未就绪");
    width = canvas.width;
    height = canvas.height;
    image = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("截图为空"))), "image/png"));
  } finally {
    if (restore) doc.querySelector<HTMLButtonElement>('.monitor-head-actions button[title="最小化摄像机窗口"]')?.click();
  }
  account(owner, token);
  const shot = saved.project.shots.find((s: any) => s.id === saved.project.activeShotId)!;
  // Save callback above freezes the project; abort if another edit raced the capture.
  const current = localStorage.getItem(`monoform-project-${sceneId}`);
  if (current && JSON.stringify(JSON.parse(current)) !== JSON.stringify(saved.project)) throw new Error("截图期间场景已变化，请重新带入；原场景保留");
  const requestId = crypto.randomUUID();
  let transfer = false;
  try {
    if (controls) {
      (iframe!.contentWindow as any).xoiDirectorScene.beginTransfer(requestId);
      transfer = true;
    }
    const clip = controls ? await exportNativePreviz(iframe!, saved, controls.signal, controls.update) : undefined;
    async function upload(blob: Blob, ext: string) {
      account(owner, token);
      if (!iframe!.isConnected) throw new Error("导演台已关闭，已停止交接");
      controls?.signal.throwIfAborted();
      const response = await fetch("/api/canvas-files?ext=" + ext, {
        method: "POST",
        // F3：凭据走 httpOnly cookie；token 只做「交接期间账号没被切换」的比对
        credentials: "same-origin",
        headers: { "X-Xoi-Expected-User": owner, "Content-Type": "application/octet-stream" },
        body: blob,
        signal: controls ? AbortSignal.any([controls.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(30000),
      });
      account(owner, token);
      const uploaded = await response.json();
      if (!response.ok) throw new Error(uploaded.message || uploaded.detail || "参考素材上传失败，场景已保存，可重试");
      if (typeof uploaded.url !== "string" || !uploaded.url.startsWith(`/oss/canvas-files/${owner}/`)) throw new Error("参考素材归属未确认");
      return uploaded.url;
    }
    controls?.update("校验通过，正在保存参考素材…");
    const uploaded = { url: await upload(image!, "png") };
    const video = clip ? { ...clip.metadata, url: await upload(clip.blob, "mp4"), requestId } : undefined;
    const reference: DirectorReferenceProject = {
      schemaVersion: 1,
      link: {
        schemaVersion: 1,
        sceneId,
        shotId: shot.id,
        revision: saved.revision,
        sceneName: saved.title || sceneName,
        shotName: shot.name || "当前镜头",
        durationSeconds: shot.durationSeconds,
        fps: shot.fps,
        aspectRatio: saved.project.camera.aspectRatio || "16:9",
        frame: saved.frame,
      },
      snapshot: saved.project,
    };
    return { graph: directorReferenceGraph(reference, { url: uploaded.url, width, height }, prompt, video), reference };
  } finally {
    if (transfer) {
      controls?.update("正在恢复编辑场景与播放头…");
      await restoreAfterPreviz(iframe!, sceneId, saved, token);
    }
    controls?.signal.throwIfAborted();
  }
}

export async function directorShotPackage(
  iframe: HTMLIFrameElement | null,
  sceneId: string,
  owner: string,
  sceneName: string,
  prompt?: string,
  options?: { mode?: "image" | "video" },
) {
  if (!iframe) throw new Error("导演台尚未打开");
  const controls = options?.mode === "video" ? videoTransferControls() : undefined;
  controls?.update("正在保存并核对本镜头…");
  const frozen = iframe.hasAttribute("inert");
  iframe.setAttribute("inert", "");
  iframe.blur();
  try {
    return await captureShotPackage(iframe, sceneId, owner, sceneName, prompt, controls);
  } finally {
    if (!frozen) iframe.removeAttribute("inert");
    controls?.close();
  }
}
