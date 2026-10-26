// Public native bridge: only documented Save + portable project storage are used.
// No model calls, private React internals, or silently replacing a divergent draft.
export async function startSceneSync({ key, ownerId, token }) {
  const nativeKey = `monoform-project-${key}`,
    metaKey = `xoi-director-cloud-v1:${key}`,
    backupKey = `xoi-director-conflict-backup:${key}`;
  const original = Storage.prototype.setItem;
  let transferRequest = "";
  let meta = {},
    disposed = false,
    timer,
    localTimer,
    interval,
    conflict = false,
    pending,
    latestCloud = null,
    status = "loading";
  try {
    meta = JSON.parse(localStorage.getItem(metaKey) || "{}");
  } catch {}
  const check = () => {
    if (disposed || localStorage.getItem("token") !== token) throw new Error("账号或场景已切换，请重新打开");
  };
  const digest = async (raw) =>
    Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))), (n) => n.toString(16).padStart(2, "0")).join("");
  const valid = (p) =>
    p && Array.isArray(p.shots) && p.shots.length && p.shots.some((s) => s.id === p.activeShotId) && Array.isArray(p.objects) && p.camera;
  const request = async (method, body) => {
    check();
    const response = await fetch(`/api/director-scenes/${encodeURIComponent(key)}`, {
      method,
      headers: { Authorization: token, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(status === "loading" ? 3000 : 12000),
    });
    check();
    if (response.status === 404 && method === "GET") return null;
    let value;
    try {
      value = await response.json();
    } catch {
      throw new Error("场景同步服务尚未就绪，本机草稿保留");
    }
    if (!response.ok) throw Object.assign(new Error(value.message || "场景同步失败，本机草稿保留"), { status: response.status });
    if (!value.data || typeof value.data !== "object") throw new Error("场景同步结果无效，本机草稿保留");
    return value.data;
  };
  const title = () => {
    try {
      return (
        JSON.parse(localStorage.getItem(`director3d-projects-v2:u${ownerId}`) || "[]").find((p) => p.id === key)?.name ||
        latestCloud?.title ||
        new URLSearchParams(location.search).get("name") ||
        "导演场景"
      );
    } catch {
      return "导演场景";
    }
  };
  const emit = (next, message = "") => {
    status = next;
    window.parent.postMessage({ source: "monoform", type: "scene-sync", key, status: next, revision: meta.revision || 0, message }, location.origin);
    showStatus(message);
  };
  let badge;
  function showStatus(detail = "") {
    if (!badge) {
      badge = document.createElement("section");
      badge.className = "xoi-scene-sync";
      badge.setAttribute("aria-label", "场景同步状态");
      badge.setAttribute("role", "status");
      document.body.append(badge);
    }
    badge.replaceChildren();
    badge.dataset.state = status;
    const text = document.createElement("span");
    text.textContent =
      {
        loading: "正在读取场景",
        saved: `云端已保存 · v${meta.revision || 0}`,
        saving: "正在保存场景…",
        dirty: "本机草稿待同步",
        offline: "本机草稿 · 同步未完成",
        conflict: "版本冲突 · 本机草稿保留",
      }[status] || "本机草稿";
    badge.append(text);
    if (detail) badge.title = detail;
    if (status === "offline") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重试";
      retry.onclick = () => void checkpoint().catch(() => {});
      badge.append(retry);
    }
    if (status === "conflict") {
      for (const [label, handler] of [
        [
          "下载本机副本",
          () => {
            saveNative();
            const raw = localStorage.getItem(nativeKey);
            if (!raw) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
            a.download = "导演场景-本机副本.monoform.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          },
        ],
        [
          "使用云端版本",
          async () => {
            try {
              const cloud = await request("GET");
              if (!valid(cloud?.payload?.project)) throw new Error("云端工程格式无效");
              check();
              const raw = localStorage.getItem(nativeKey);
              if (raw) original.call(localStorage, backupKey, raw);
              const value = JSON.stringify(cloud.payload.project);
              original.call(localStorage, nativeKey, value);
              meta = { revision: cloud.revision, hash: await digest(value) };
              original.call(localStorage, metaKey, JSON.stringify(meta));
              location.reload();
            } catch (e) {
              badge.title = e.message;
            }
          },
        ],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.onclick = handler;
        badge.append(button);
      }
    }
  }
  // Hydrate before the native editor boots. An existing unsynced local copy wins
  // over an automatic cloud replacement; the user must resolve a true conflict.
  try {
    latestCloud = await request("GET");
    const raw = localStorage.getItem(nativeKey);
    if (latestCloud) {
      if (latestCloud.payload?.schemaVersion !== 1 || !valid(latestCloud.payload.project)) throw new Error("云端工程格式暂不支持，本机草稿保留");
      const cloudRaw = JSON.stringify(latestCloud.payload.project),
        localHash = raw ? await digest(raw) : "";
      if (!raw || raw === cloudRaw || (localHash === meta.hash && latestCloud.revision >= (meta.revision || 0))) {
        original.call(localStorage, nativeKey, cloudRaw);
        meta = { revision: latestCloud.revision, hash: await digest(cloudRaw) };
        original.call(localStorage, metaKey, JSON.stringify(meta));
        emit("saved");
      } else if (latestCloud.revision !== (meta.revision || 0)) {
        conflict = true;
        emit("conflict");
      } else emit("dirty");
    } else {
      meta = { revision: 0 };
      original.call(localStorage, metaKey, JSON.stringify(meta));
      emit("dirty");
    }
  } catch (e) {
    emit("offline", e.message);
  }
  const requestedShot = new URLSearchParams(location.search).get("shot");
  if (requestedShot) {
    try {
      const raw = localStorage.getItem(nativeKey),
        project = raw ? JSON.parse(raw) : null,
        shot = project?.shots?.find((s) => s.id === requestedShot);
      if (shot && project.activeShotId !== shot.id) {
        project.activeShotId = shot.id;
        for (const field of ["objects", "camera", "lighting", "reference", "keyframes", "objectKeyframes"])
          project[field] = structuredClone(shot[field]);
        project.settings = { ...project.settings, fps: shot.fps, durationSeconds: shot.durationSeconds, loopPlayback: shot.loopPlayback };
        original.call(localStorage, nativeKey, JSON.stringify(project));
      }
    } catch {}
  }
  async function sync() {
    check();
    if (conflict) throw new Error("本机与云端版本冲突，请先下载副本或使用云端版本");
    const raw = localStorage.getItem(nativeKey);
    if (!raw || raw.length > 8000000) throw new Error("场景尚未保存或体积过大");
    const project = JSON.parse(raw);
    if (!valid(project)) throw new Error("场景尚未就绪");
    const hash = await digest(raw);
    if (hash === meta.hash && meta.revision > 0) {
      emit("saved");
      return { project, revision: meta.revision, title: title(), frame: Number(document.querySelector(".time-readout strong")?.textContent) || 0 };
    }
    // After an uncertain save, re-read before another PUT. A late successful save
    // is acknowledged, a concurrent edit is a conflict, never a blind overwrite.
    const cloud = await request("GET");
    if (cloud && JSON.stringify(cloud.payload?.project) === raw) {
      meta = { revision: cloud.revision, hash };
      original.call(localStorage, metaKey, JSON.stringify(meta));
      emit("saved");
      return { project, revision: meta.revision, title: title(), frame: Number(document.querySelector(".time-readout strong")?.textContent) || 0 };
    }
    if ((cloud?.revision || 0) !== (meta.revision || 0)) {
      conflict = true;
      emit("conflict");
      throw new Error("场景已在另一页面更新，本机草稿保留");
    }
    emit("saving");
    let saved;
    try {
      saved = await request("PUT", { revision: meta.revision || 0, title: title(), payload: { schemaVersion: 1, project } });
    } catch (e) {
      if (e.status !== 409) throw e;
      const confirmed = await request("GET");
      if (JSON.stringify(confirmed?.payload?.project) !== raw) throw e;
      saved = confirmed;
    }
    check();
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 1) throw new Error("保存结果尚未确认");
    meta = { revision: saved.revision, hash };
    original.call(localStorage, metaKey, JSON.stringify(meta));
    emit(localStorage.getItem(nativeKey) === raw ? "saved" : "dirty");
    return { project, revision: meta.revision, title: title(), frame: Number(document.querySelector(".time-readout strong")?.textContent) || 0 };
  }
  function saveNative() {
    if (transferRequest) throw new Error("正在准备预演，请等待完成或取消");
    if (document.querySelector('.app-shell[aria-busy="true"]')) throw new Error("请等待当前导出完成");
    const button = [...document.querySelectorAll(".top-actions button")].find((b) => b.textContent.trim() === "保存");
    if (!button) throw new Error("场景尚未就绪");
    button.click();
  }
  function flushCached() {
    if (pending) return pending;
    check();
    pending = sync()
      .catch((e) => {
        if (e.status === 409) conflict = true;
        emit(conflict ? "conflict" : "offline", e.message);
        throw e;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }
  async function checkpoint() {
    check();
    document.querySelector(".play-button.is-playing")?.click();
    saveNative();
    clearTimeout(timer);
    await Promise.resolve();
    let result = await flushCached();
    if ((await digest(localStorage.getItem(nativeKey) || "")) !== meta.hash) result = await flushCached();
    check();
    return result;
  }
  function schedule() {
    clearTimeout(timer);
    if (!conflict && !disposed) timer = setTimeout(() => void flushCached().catch(() => {}), 1600);
  }
  function storageWrite(name, value) {
    if (this === localStorage && name === nativeKey && transferRequest) return;
    const previous = this === localStorage && name === nativeKey ? localStorage.getItem(name) : null;
    original.call(this, name, value);
    if (this === localStorage && name === nativeKey && previous !== String(value) && status !== "loading") {
      if (status !== "conflict" && status !== "dirty") emit("dirty");
      schedule();
    }
  }
  Storage.prototype.setItem = storageWrite;
  // Save after a user finishes an edit; never pause playback to autosave.
  function cacheAfterInteraction() {
    clearTimeout(localTimer);
    localTimer = setTimeout(() => {
      if (!disposed && !document.querySelector(".play-button.is-playing")) {
        try {
          saveNative();
        } catch {}
      }
    }, 600);
  }
  for (const event of ["input", "change", "pointerup", "keyup"]) document.addEventListener(event, cacheAfterInteraction, true);

  interval = setInterval(() => {
    if (
      !document.hidden &&
      !document.querySelector(".play-button.is-playing") &&
      !document.querySelector('.app-shell[aria-busy="true"]') &&
      document.querySelector(".top-actions")
    ) {
      try {
        saveNative();
      } catch {}
    }
  }, 12000);
  const managedDownload=(event)=>{const a=event.target?.closest?.('a[download]');if(transferRequest&&a&&/\.mp4$/i.test(a.download)&&a.href.startsWith('blob:'))event.preventDefault();};
  document.addEventListener('click',managedDownload,true);
  const api = {
    checkpoint,
    prepareRestore() {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(localTimer);
      clearInterval(interval);
      badge?.remove();
    },
    beginTransfer(requestId) {
      check();
      if (transferRequest || !requestId) throw new Error("已有预演正在准备");
      transferRequest = requestId;
      document.documentElement.dataset.xoiPrevizExport = "true";
      clearTimeout(timer);
      clearTimeout(localTimer);
    },
    get revision() {
      return meta.revision || 0;
    },
    get status() {
      return status;
    },
    dispose() {
      document.removeEventListener("click",managedDownload,true);
      disposed = true;
      clearTimeout(timer);
      clearTimeout(localTimer);
      clearInterval(interval);
      for (const event of ["input", "change", "pointerup", "keyup"]) document.removeEventListener(event, cacheAfterInteraction, true);
      if (Storage.prototype.setItem === storageWrite) Storage.prototype.setItem = original;
      badge?.remove();
    },
  };
  window.xoiDirectorScene = api;
  // Button lives in the native toolbar, using its existing responsive row layout.
  let resumed = false;
  const install = setInterval(() => {
    if (!resumed) {
      const frame = Number(new URLSearchParams(location.search).get("resumeFrame")),
        track = document.querySelector(".camera-track"),
        total = Number(document.querySelector(".time-readout span")?.textContent?.match(/\/\s*(\d+)/)?.[1]);
      if (track && total) {
        resumed = true;
        if (Number.isInteger(frame) && frame > 0 && frame <= total) {
          const rect = track.getBoundingClientRect();
          track.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true, clientX: rect.left + (rect.width * frame) / total, clientY: rect.top + rect.height / 2 }),
          );
          document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        }
      }
    }
    const actions = document.querySelector(".export-actions");
    if (!actions || actions.querySelector(".xoi-send-shot")) return;
    const button = document.createElement("button");
    button.className = "xoi-send-shot";
    button.type = "button";
    button.textContent = "带到画布制作";
    button.onclick = () => parent.postMessage({ source: "monoform", type: "send-shot", key }, location.origin);
    const wrap = document.createElement("div");
    wrap.className = "xoi-handoff-actions";
    const menu = document.createElement("details");
    menu.className = "xoi-handoff-menu";
    const toggle = document.createElement("summary");
    toggle.textContent = "▾";
    toggle.setAttribute("aria-label", "更多交接方式");
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = "预演视频带到画布";
    option.onclick = () => {
      menu.open = false;
      parent.postMessage({ source: "monoform", type: "send-shot", key, mode: "video" }, location.origin);
    };
    menu.append(toggle, option);
    wrap.append(button, menu);
    actions.append(wrap);
  }, 400);
  addEventListener(
    "pagehide",
    () => {
      try {
        if (!disposed && !transferRequest) saveNative();
      } catch {}
      clearInterval(install);
      api.dispose();
    },
    { once: true },
  );
  return api;
}
