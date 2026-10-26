/**
 * 多项目隔离：`?key=` 由宿主注入。
 *
 * 主站 `frontend/src/views/director3d/index.vue` 的 iframeSrc 是
 * `${BASE_URL}monoform/index.html?key=${sceneId}`，sceneId 形如
 * `director3d-u{userId}-{random}`。
 *
 * 上游 0.6.0 是**单项目**设计（`PROJECT_STORAGE_KEY = 'monoform-project'` 常量），
 * 直接用它会把所有场景塌成同一份。这里把 key 补回来。
 *
 * 注意：iframe 的生命周期内 `?key=` 不会变，所以可以在模块顶层求值一次。
 */

/** 只认本平台签发过的工程号，避免任意字符串落进 localStorage */
const SCENE_ID_RE = /^(?:director3d-u\d+-[A-Za-z0-9_-]{1,120}|u\d+-canvas-[A-Za-z0-9_-]{1,120})$/;

export function sceneKey() {
  try {
    const raw = new URLSearchParams(location.search).get("key") || "";
    return SCENE_ID_RE.test(raw) ? raw : "";
  } catch {
    return "";
  }
}

/** 没有 key 时（standalone 开发/预览）退回单一草稿位，不与线上工程互相污染 */
const slot = () => sceneKey() || "draft";

/** 工程数据：与旧注入脚本 `xoi-scene-sync.js` 的 `monoform-project-${key}` 完全一致 */
export const projectKey = () => `monoform-project-${slot()}`;

/** 自定义姿势库：同样按场景隔离（姿势是人对这个场景摆出来的） */
export const poseKey = () => `monoform-custom-poses-${slot()}`;

/** 上游的历史 key，只在没有任何工程数据时用来迁移一次 */
export const legacyProjectKey = () => "stageframe-project";
