import React from "react";
import ReactDOM from "react-dom/client";
import "../upstream/src/styles.css";
import "./xoi-entry.css";
import { renderRefusal, verifyIdentity } from "../xoi/identity.js";
import { startSceneStore } from "../xoi/scene-store.js";

/**
 * XOi 导演台入口。
 *
 * 与上游 `upstream/src/main.jsx` 的差异只有两件事：
 *   1. render 之前先向后端核验身份与工程归属（见 ../xoi/identity.js）
 *   2. render 之前先把云端场景 hydrate 到本地（见 ../xoi/scene-store.js）
 *
 * 顺序不能反：必须让 localStorage 里已经是云端最新版，再让 App 读它。
 * 否则 App 会先渲染本机旧草稿，然后被云端覆盖——用户会看到内容"跳一下"，
 * 更糟的情况是这段时间里的编辑被覆盖掉。
 */
async function boot() {
  const root = document.getElementById("root");
  let context;
  try {
    context = await verifyIdentity();
  } catch (error) {
    renderRefusal(root, error instanceof Error ? error.message : "请稍后重试");
    return;
  }

  // 没有 ?key=（standalone 预览）时只写本地草稿槽，不连云
  if (context.key) {
    try {
      await startSceneStore({ sceneId: context.key, userId: context.userId, token: context.token });
    } catch {
      // 云端不可用不该挡住工作台：scene-store 内部已把状态置为 offline，
      // 本机草稿仍然可编辑，恢复后会自动重推。
    }
  }

  const { default: App } = await import("../upstream/src/App.jsx");
  if (localStorage.getItem("xoi_session") !== context.token) {
    renderRefusal(root, "账号已切换，请重新打开工程");
    return;
  }
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

boot();
