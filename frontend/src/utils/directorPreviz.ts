import { readDirectorMP4, assertDirectorVideo } from "../../../shared/directorPreviz";
import type { DirectorCheckpoint } from "./directorHandoff";

export function videoTransferControls() {
  const controller = new AbortController(),
    panel = document.createElement("section");
  panel.className = "xoi-previz-transfer";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "预演视频交接");
  panel.setAttribute("aria-modal", "true");
  const previousFocus = document.activeElement as HTMLElement | null;
  panel.style.cssText =
    "position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-end;justify-content:center;padding:24px;box-sizing:border-box;background:transparent;color:#eee9e4;font:14px system-ui";
  const box = document.createElement("div");
  box.style.cssText =
    "width:min(480px,90vw);padding:16px 20px;border:1px solid #5a4c40;border-radius:8px;background:#2c2927;box-shadow:0 8px 24px #0004";
  const title = document.createElement("strong");
  title.textContent = "预演带到画布";
  const status = document.createElement("p");
  status.style.cssText = "margin:10px 0;line-height:1.5;color:#cdbfb3";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const track = document.createElement("progress");
  track.max = 100;
  track.style.cssText = "display:block;width:100%;height:4px;margin:10px 0;accent-color:#ed955f";
  track.setAttribute("aria-label", "预演准备进度");
  const note = document.createElement("p");
  note.textContent = "本地处理 · 不扣积分 · 不会自动生成";
  note.style.cssText = "font-size:12px;color:#bcaea2;margin:8px 0";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消并返回编辑";
  cancel.style.cssText =
    "margin-top:12px;padding:9px 14px;border:1px solid #947157;border-radius:7px;background:#3b3029;color:inherit;cursor:pointer";
  cancel.onclick = () => {
    cancel.disabled = true;
    cancel.textContent = "正在恢复编辑…";
    controller.abort(new DOMException("已取消准备，原场景保留", "AbortError"));
  };
  box.append(title, status, track, note, cancel);
  panel.append(box);
  document.body.append(panel);
  cancel.focus();
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel.click();
    } else if (event.key === "Tab") {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel.focus();
    }
  };
  window.addEventListener("keydown", keyboard, true);
  const hidden = () => {
    if (document.hidden) controller.abort(new DOMException("页面已进入后台，已停止准备；原场景保留", "AbortError"));
  };
  document.addEventListener("visibilitychange", hidden);
  const activity = (event: MessageEvent) => {
    if (
      event.origin === location.origin &&
      event.source === window.parent &&
      event.data?.type === "xoi:workspace-active" &&
      event.data.active === false
    )
      controller.abort(new DOMException("已离开画布，已停止准备；原场景保留", "AbortError"));
  };
  window.addEventListener("message", activity);
  const initialRoute = window.parent.location.hash;
  const routeChanged = () => {
    if (window.parent.location.hash !== initialRoute) controller.abort(new DOMException("已离开工作区，已停止准备；原场景保留", "AbortError"));
  };
  window.parent.addEventListener("hashchange", routeChanged);
  return {
    signal: controller.signal,
    update: (text: string) => {
      if (status.textContent !== text) status.textContent = text;
      const percent = text.match(/(\d+)%/);
      if (percent) track.value = Number(percent[1]);
      else track.removeAttribute("value");
    },
    close: () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("message", activity);
      window.parent.removeEventListener("hashchange", routeChanged);
      window.removeEventListener("keydown", keyboard, true);
      panel.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
    },
  };
}
export async function exportNativePreviz(iframe: HTMLIFrameElement, saved: DirectorCheckpoint, signal: AbortSignal, onProgress: (s: string) => void) {
  signal.throwIfAborted();
  const win = iframe.contentWindow!,
    doc = iframe.contentDocument!,
    button = doc.querySelector<HTMLButtonElement>(".export-actions .export-button");
  if (!button || button.disabled || doc.querySelector('.app-shell[aria-busy="true"]')) throw new Error("请等待当前导出完成后重试");
  if (typeof (win as any).VideoEncoder === "undefined") throw new Error("当前浏览器不支持本地预演编码，请使用支持视频编码的 Chrome 或 Edge");
  if (document.hidden) throw new Error("请在前台页面准备预演视频");
  const shot = saved.project.shots.find((s: any) => s.id === saved.project.activeShotId)!;
  if (shot.durationSeconds > 60) throw new Error("单次预演交接支持 60 秒以内，请先缩短本镜头时长");
  const initialToast = doc.querySelector(".toast")?.textContent;
  onProgress("正在逐帧导出 0%…");
  const blob = await new Promise<Blob>((resolve, reject) => {
    let timer: ReturnType<typeof setInterval>,
      done = false,
      seenBusy = false,
      received: Blob | undefined,
      idleAt = 0,
      lastProgress = "",
      progressedAt = Date.now();
    const deadline = Date.now() + Math.min(360000, 60000 + shot.durationSeconds * 5000);
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      window.removeEventListener("message", message, true);
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve(received!);
    };
    const abort = () => finish(signal.reason || new DOMException("已取消准备", "AbortError"));
    const message = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== win ||
        event.data?.source !== "monoform" ||
        event.data?.type !== "export" ||
        event.data?.kind !== "video"
      )
        return;
      event.stopImmediatePropagation();
      if (!(event.data.blob instanceof Blob)) return finish(new Error("导出没有返回有效视频"));
      received = event.data.blob;
    };
    window.addEventListener("message", message, true);
    signal.addEventListener("abort", abort, { once: true });
    timer = setInterval(() => {
      if (!iframe.isConnected || iframe.contentDocument !== doc) return finish(new Error("导演台已关闭或切换，已停止交接"));
      if (Date.now() > deadline) return finish(new Error("预演处理超时，原场景保留；请重试或先带入静态图"));
      if (Date.now() - progressedAt > 18000) return finish(new Error("预演编码已停止推进，已结束本次导出；原场景保留，可重试或带入静态图"));
      const toast = doc.querySelector(".toast")?.textContent?.trim();
      if (toast && toast !== initialToast && !toast.startsWith("工程") && !toast.startsWith("MP4 已导出") && !received)
        return finish(new Error(toast));
      const busy = doc.querySelector('.app-shell[aria-busy="true"]');
      if (busy) {
        seenBusy = true;
        idleAt = 0;
        const progress = button.textContent?.match(/\d+%/)?.[0];
        if (progress && progress !== lastProgress) {
          lastProgress = progress;
          progressedAt = Date.now();
          onProgress(progress === "100%" ? "正在封装预演视频…" : "正在处理镜头 " + progress);
        }
      } else if (received) finish();
      else if (seenBusy) {
        if (!idleAt) idleAt = Date.now();
        if (Date.now() - idleAt > 500) finish(new Error("本地视频导出失败，原场景已恢复；请检查浏览器编码支持后重试"));
      }
    }, 150);
    try {
      button.click();
    } catch (error) {
      finish(error as Error);
    }
  });
  signal.throwIfAborted();
  onProgress("正在校验实际时长、帧数与画幅…");
  const metadata = await readDirectorMP4(blob);
  signal.throwIfAborted();
  assertDirectorVideo(metadata, { fps: shot.fps, durationSeconds: shot.durationSeconds, aspectRatio: saved.project.camera.aspectRatio });
  return { blob, metadata };
}
/** Dispose before navigation so native pagehide cannot save a temporary export camera. */
export async function restoreAfterPreviz(iframe: HTMLIFrameElement, sceneId: string, saved: DirectorCheckpoint, token: string) {
  if (!iframe.isConnected || localStorage.getItem("token") !== token || new URL(iframe.src, location.href).searchParams.get("key") !== sceneId)
    return;
  (iframe.contentWindow as any)?.xoiDirectorScene?.prepareRestore();
  localStorage.setItem("monoform-project-" + sceneId, JSON.stringify(saved.project));
  const url = new URL(iframe.src, location.href);
  url.searchParams.set("resumeFrame", String(saved.frame));
  const oldDocument = iframe.contentDocument;
  iframe.src = url.href;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (!iframe.isConnected || localStorage.getItem("token") !== token) return;
    const doc = iframe.contentDocument;
    if (
      doc &&
      doc !== oldDocument &&
      doc.querySelector(".xoi-handoff-actions") &&
      Number(doc.querySelector(".time-readout strong")?.textContent) === saved.frame
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("场景已保存，编辑器恢复尚未完成；请重新打开本场景继续编辑");
}
