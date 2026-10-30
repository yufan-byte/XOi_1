import { projectKey } from "./scene-key.js";

/**
 * 场景云同步（正式实现，替代旧的 `xoi-scene-sync.js`）。
 *
 * ## 与旧实现的差别
 *
 * 旧实现在 `public/monoform/xoi-scene-sync.js`，是「只有构建产物」时期的权宜之计：
 *  · 改 `Storage.prototype.setItem`（全局副作用，任何代码都可能被影响）
 *  · 靠 `querySelector('.top-actions button')` 找文案「保存」再 `.click()` 触发保存
 *  · 每 12 秒轮询点一次保存
 *  · 往 body 里注入状态徽标 DOM
 *
 * 上游 0.6.0 **自带 900ms 防抖的自动保存**（`App.jsx` 里 `useEffect` → `localStorage.setItem`），
 * 所以根本不需要点按钮：拦一次写入就能拿到最新工程。于是：
 *  · 只包装 `localStorage.setItem`（实例级，不动 prototype）
 *  · 不注入任何 DOM，同步状态通过 postMessage 交给宿主显示
 *  · 帧号仍然从 `.time-readout strong` 读（带回链要用，读不到就当 0）
 *
 * ## 冲突策略（与旧实现一致，这是被验证过的）
 *
 * 启动时先 GET 云端再决定要不要覆盖本地：
 *  · 本地没有 / 本地与云端逐字节相同 / 本地 hash 恰好是上次同步的结果且云端更新 → 用云端
 *  · 否则 revision 不同 → 冲突，**绝不静默覆盖**，交给用户选（下载本机副本 / 使用云端版本）
 *
 * 每次 PUT 之前再 GET 一次复核：这是为了防止「上一次保存结果未知时盲覆盖」。
 */

const SCHEMA_VERSION = 1;
/** 场景体积上限（与旧实现一致，后端也是 12MB 草案上限） */
const MAX_BYTES = 8_000_000;
/** 写入后多久推云端。上游自动保存本身有 900ms 防抖，这里再等一层避免抖动的中间态 */
const PUSH_DELAY_MS = 1_600;

const digest = async (raw) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");

/**
 * 稳定序列化：对象键排序后再 stringify。
 *
 * 为什么需要：上游 `App` 保存时是把 state 重新组装成对象再 `JSON.stringify`，
 * 字段顺序和云端存的原文往往不同。直接比字符串会得出"内容变了"的误判，
 * 于是每打开一次页面就白写一个新版本（revision 无限膨胀，冲突检测也更敏感）。
 * 按语义比较才能真正判断"是不是同一个工程"。
 */
const stableStringify = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );

const sameProject = (a, b) => {
  try {
    return stableStringify(a) === stableStringify(b);
  } catch {
    return false;
  }
};

/** 最小结构校验：一台摄像机 + 至少一个镜头且 activeShotId 指向真实镜头 */
const validProject = (p) =>
  !!p && Array.isArray(p.shots) && p.shots.length > 0 && p.shots.some((s) => s.id === p.activeShotId) && Array.isArray(p.objects) && !!p.camera;

export async function startSceneStore({ sceneId, userId, token }) {
  /** 原生的 setItem：先抓住，后面所有内部写入都走它，避免被自己的包装绕回去 */
  const originalSetItem = localStorage.setItem;
  const nativeKey = projectKey();
  const metaKey = `xoi-director-cloud-v1:${sceneId}`;
  const backupKey = `xoi-director-conflict-backup:${sceneId}`;

  let meta = {};
  try {
    meta = JSON.parse(localStorage.getItem(metaKey) || "{}");
  } catch {
    meta = {};
  }

  let status = "loading";
  let conflict = false;
  let disposed = false;
  let transferId = "";
  let timer;
  let pending;
  let latestCloud = null;

  /** 绕过自己的包装写本地（用于 hydrate / 元数据 / 备份） */
  const writeNative = (key, value) => { assertAlive(); originalSetItem.call(localStorage, key, value); };

  const assertAlive = () => {
    if (disposed || localStorage.getItem("xoi_session") !== token) {
      throw new Error("账号或场景已切换，请重新打开");
    }
  };

  const request = async (method, body) => {
    assertAlive();
    const response = await fetch(`/api/director-scenes/${encodeURIComponent(sceneId)}`, {
      method,
      credentials: "same-origin", cache: "no-store",
      headers: { "X-Xoi-Expected-User": String(userId), "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      // 首次读取要快（别让用户盯着白屏），之后的写入允许久一点
      signal: AbortSignal.timeout(status === "loading" ? 3000 : 12000),
    });
    assertAlive();
    if (response.status === 404 && method === "GET") return null;

    let value;
    try {
      value = await response.json();
    } catch {
      throw new Error("场景同步服务尚未就绪，本机草稿保留");
    }
    assertAlive();
    if (!response.ok) {
      throw Object.assign(new Error(value.message || "场景同步失败，本机草稿保留"), {
        status: response.status,
      });
    }
    if (!value.data || typeof value.data !== "object") {
      throw new Error("场景同步结果无效，本机草稿保留");
    }
    return value.data;
  };

  const sceneTitle = () => {
    try {
      const list = JSON.parse(localStorage.getItem(`director3d-projects-v2:u${userId}`) || "[]");
      return (
        list.find((p) => p.id === sceneId)?.name ||
        latestCloud?.title ||
        new URLSearchParams(location.search).get("name") ||
        "导演场景"
      );
    } catch {
      return "导演场景";
    }
  };

  /** 当前帧号：带回链接要用。读不到（DOM 变了/未挂载）就当 0，不抛错 */
  const currentFrame = () => {
    try {
      return Number(document.querySelector(".time-readout strong")?.textContent) || 0;
    } catch {
      return 0;
    }
  };

  const emit = (next, message = "") => {
    status = next;
    try {
      window.parent.postMessage(
        { source: "monoform", type: "scene-sync", key: sceneId, status: next, revision: meta.revision || 0, message },
        location.origin,
      );
    } catch {
      /* 不是 iframe 或宿主已卸载 */
    }
  };

  // ---------- 启动：先对齐云端与本机 ----------
  try {
    latestCloud = await request("GET");
    const raw = localStorage.getItem(nativeKey);

    if (latestCloud) {
      if (latestCloud.payload?.schemaVersion !== SCHEMA_VERSION || !validProject(latestCloud.payload.project)) {
        throw new Error("云端工程格式暂不支持，本机草稿保留");
      }
      const cloudRaw = JSON.stringify(latestCloud.payload.project);
      const localHash = raw ? await digest(raw) : "";

      // 本机草稿可能就是云端那台机器自己写的，只是字段顺序不同；按语义比，避免误判成改动
      let localSameAsCloud = true;
      if (raw) {
        try {
          localSameAsCloud = sameProject(JSON.parse(raw), latestCloud.payload.project);
        } catch {
          localSameAsCloud = false; // 本地是坏数据，按"有改动"处理，让上面的冲突流程兜底
        }
      }
      if (!raw || raw === cloudRaw || localSameAsCloud || (localHash === meta.hash && latestCloud.revision >= (meta.revision || 0))) {
        writeNative(nativeKey, cloudRaw);
        meta = { revision: latestCloud.revision, hash: await digest(cloudRaw) };
        writeNative(metaKey, JSON.stringify(meta));
        emit("saved");
      } else if (latestCloud.revision !== (meta.revision || 0)) {
        // 本机有未同步的改动，且云端也被别人推进过 → 冲突，双方都不动
        conflict = true;
        emit("conflict");
      } else {
        emit("dirty");
      }
    } else {
      meta = { revision: 0 };
      writeNative(metaKey, JSON.stringify(meta));
      emit("dirty");
    }
  } catch (error) {
    if (error.status === 410) conflict = true;
    emit("offline", error instanceof Error ? error.message : "云端暂不可用");
  }

  // ---------- ?shot= 打开指定镜头（带回链接用） ----------
  const requestedShot = new URLSearchParams(location.search).get("shot");
  if (requestedShot) {
    try {
      const raw = localStorage.getItem(nativeKey);
      const project = raw ? JSON.parse(raw) : null;
      const shot = project?.shots?.find((s) => s.id === requestedShot);
      if (shot && project.activeShotId !== shot.id) {
        project.activeShotId = shot.id;
        for (const field of ["objects", "camera", "lighting", "reference", "keyframes", "objectKeyframes"]) {
          if (shot[field] !== undefined) project[field] = structuredClone(shot[field]);
        }
        project.settings = {
          ...project.settings,
          fps: shot.fps,
          durationSeconds: shot.durationSeconds,
          loopPlayback: shot.loopPlayback,
        };
        writeNative(nativeKey, JSON.stringify(project));
      }
    } catch {
      /* 参数无效时按默认镜头打开 */
    }
  }

  // ---------- 同步 ----------
  async function sync() {
    assertAlive();
    if (conflict) throw new Error("本机与云端版本冲突，请先下载副本或使用云端版本");

    const raw = localStorage.getItem(nativeKey);
    if (!raw || raw.length > MAX_BYTES) throw new Error("场景尚未保存或体积过大");

    const project = JSON.parse(raw);
    if (!validProject(project)) throw new Error("场景尚未就绪");

    const hash = await digest(raw);
    if (hash === meta.hash && meta.revision > 0) {
      emit("saved");
      return { project, revision: meta.revision, title: sceneTitle(), frame: currentFrame() };
    }

    // 上一次保存结果不确定时，先读一次再决定：晚到的成功要认账，别人改过就是冲突，绝不盲写
    const cloud = await request("GET");
    // 语义相同就当已保存：本地只是把云端数据重新序列化了一遍，不是新版本
    if (cloud && sameProject(cloud.payload?.project, project)) {
      meta = { revision: cloud.revision, hash };
      writeNative(metaKey, JSON.stringify(meta));
      emit("saved");
      return { project, revision: meta.revision, title: sceneTitle(), frame: currentFrame() };
    }
    if ((cloud?.revision || 0) !== (meta.revision || 0)) {
      conflict = true;
      emit("conflict");
      throw new Error("场景已在另一页面更新，本机草稿保留");
    }

    emit("saving");
    let saved;
    try {
      saved = await request("PUT", {
        revision: meta.revision || 0,
        title: sceneTitle(),
        payload: { schemaVersion: SCHEMA_VERSION, project },
      });
    } catch (error) {
      if (error.status !== 409) throw error;
      // 409：可能是自己上一次其实写成功了，再确认一次
      const confirmed = await request("GET");
      if (JSON.stringify(confirmed?.payload?.project) !== raw) throw error;
      saved = confirmed;
    }

    assertAlive();
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 1) {
      throw new Error("保存结果尚未确认");
    }
    meta = { revision: saved.revision, hash };
    writeNative(metaKey, JSON.stringify(meta));
    emit(localStorage.getItem(nativeKey) === raw ? "saved" : "dirty");
    return { project, revision: meta.revision, title: sceneTitle(), frame: currentFrame() };
  }

  function flush() {
    if (pending) return pending;
    assertAlive();
    pending = sync()
      .catch((error) => {
        if (error.status === 409) conflict = true;
        emit(conflict ? "conflict" : "offline", error.message);
        throw error;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  function schedule() {
    clearTimeout(timer);
    if (!conflict && !disposed && !transferId) timer = setTimeout(() => void flush().catch(() => {}), PUSH_DELAY_MS);
  }

  /**
   * 拦截工程写入。
   *
   * 只包装 `localStorage.setItem` 这个实例方法，不动 `Storage.prototype`——
   * 后者会让页面里任何第三方代码的写入都经过我们，出问题很难排查。
   */
  localStorage.setItem = function (key, value) {
    const isProject = key === nativeKey;
    if (isProject) assertAlive();
    const previous = isProject ? localStorage.getItem(key) : null;
    originalSetItem.call(this, key, value);
    if (isProject && previous !== String(value) && status !== "loading") {
      if (status !== "conflict" && status !== "dirty") emit("dirty");
      schedule();
    }
  };

  const api = {
    beginTransfer(id) {
      assertAlive();if(transferId||typeof id!=="string"||!/^[\w-]{1,160}$/.test(id))throw new Error("已有交接正在进行");
      transferId=id;clearTimeout(timer);
    },
    prepareRestore() {
      assertAlive();disposed=true;clearTimeout(timer);
      // Keep this old document's guarded writer installed: its delayed autosave
      // must not overwrite the parent's restored snapshot during navigation.
    },
    /** 供宿主「带到画布」调用：确认最新工程已落盘并同步，返回可引用的快照 */
    async checkpoint() {
      assertAlive();
      // 上游的自动保存是 900ms 防抖，先等一拍让它落盘
      await new Promise((resolve) => setTimeout(resolve, 950));
      let result = await flush();
      const latest = await digest(localStorage.getItem(nativeKey) || "");
      if (latest !== meta.hash) result = await flush();
      assertAlive();
      return result;
    },
    get revision() {
      return meta.revision || 0;
    },
    get status() {
      return status;
    },
    get conflicted() {
      return conflict;
    },
    /** 冲突时把本机副本另存一份，用于人工比对 */
    backupLocalCopy() {
      const raw = localStorage.getItem(nativeKey);
      if (raw) writeNative(backupKey, raw);
      return raw;
    },
    /** 冲突时采用云端版本（本机会先备份，不会丢） */
    async useCloudVersion() {
      const cloud = await request("GET");
      if (!validProject(cloud?.payload?.project)) throw new Error("云端工程格式无效");
      const raw = localStorage.getItem(nativeKey);
      if (raw) writeNative(backupKey, raw);
      const value = JSON.stringify(cloud.payload.project);
      writeNative(nativeKey, value);
      meta = { revision: cloud.revision, hash: await digest(value) };
      writeNative(metaKey, JSON.stringify(meta));
      conflict = false;
      emit("saved");
      location.reload();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      localStorage.setItem = originalSetItem;
    },
  };

  window.xoiDirectorScene = api;

  // 离开页面前把未同步的改动推一次（不阻塞卸载）
  addEventListener(
    "pagehide",
    () => {
      if (!disposed && !conflict && !transferId) void flush().catch(() => {});
    },
    { once: true },
  );

  return api;
}
