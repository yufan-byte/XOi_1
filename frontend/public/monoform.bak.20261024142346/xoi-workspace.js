// 独立于 MONOFORM 的场景数据和渲染引擎：协调布局与操作说明。
import { startKeyframeGuide } from "./xoi-keyframe-guide.js?v=20261017-1";
import { startMotionLibrary } from "./xoi-motion-library.js?v=20261020-2";
let disposeWorkspace = () => {};
export function stopWorkspace() { disposeWorkspace(); }

export function startWorkspace({ ownerId }) {
  stopWorkspace();
  const keyframeGuide = startKeyframeGuide();
  const motionLibrary = startMotionLibrary();
  const preferenceKey = `xoi-director-layout-v1:u${ownerId}`;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(preferenceKey) || "{}"); } catch {}
  const preference = {};
  for (const key of ["left", "right", "timeline"]) if (typeof saved?.[key] === "boolean") preference[key] = saved[key];
  let timelineHeight = Number(saved?.timelineHeight);
  if (!Number.isFinite(timelineHeight)) timelineHeight = 0;
  let workspace, buttons, resizeHandle, viewportObserver, viewportTarget, parentObserver, triggerObserver, observedTrigger, downloadMenu;
  let scheduled = 0, canvasResize = 0, hideLoaderTimer = 0, pointerFrame = 0;
  let ready = false, dragging = null, pendingHeight = 0;
  const loader = document.createElement("div");
  loader.id = "xoi-workspace-loading";
  loader.innerHTML = "<strong>正在准备导演工作台</strong><span>场景 · 机位 · 时间线</span>";
  document.body.append(loader);

  const persist = () => { try { localStorage.setItem(preferenceKey, JSON.stringify({ ...preference, timelineHeight })); } catch {} };
  function visible(key) { return preference[key] ?? (key === "left" ? innerWidth >= 620 : key === "right" ? innerWidth >= 920 : true); }
  function applyLayout() {
    if (!workspace) return;
    for (const key of ["left", "right", "timeline"]) {
      workspace.dataset[`xoi${key[0].toUpperCase()}${key.slice(1)}`] = String(visible(key));
      buttons?.querySelector(`[data-panel=${key}]`)?.setAttribute("aria-pressed", String(visible(key)));
    }
    if (!visible("timeline")) workspace.style.setProperty("--xoi-timeline", "0px");
    else if (timelineHeight) workspace.style.setProperty("--xoi-timeline", `${Math.max(96, Math.min(timelineHeight, innerHeight * .45, 300))}px`);
    else workspace.style.removeProperty("--xoi-timeline");
  }
  function toggle(key) {
    preference[key] = !visible(key);
    if (innerWidth < 620 && preference[key] && (key === "left" || key === "right")) preference[key === "left" ? "right" : "left"] = false;
    applyLayout(); persist();
  }
  function resizeCanvas() {
    if (canvasResize) return;
    canvasResize = requestAnimationFrame(() => { canvasResize = 0; dispatchEvent(new Event("resize")); });
  }
  function setTimelineHeight(height) {
    timelineHeight = Math.round(Math.max(96, Math.min(height, innerHeight * .45, 300)));
    applyLayout();
    resizeHandle?.setAttribute("aria-valuenow", String(timelineHeight));
  }
  function endDrag() {
    if (!dragging) return;
    if (pointerFrame) { cancelAnimationFrame(pointerFrame); pointerFrame = 0; setTimelineHeight(pendingHeight); }
    dragging = null;
    persist();
  }
  function pointerMove(event) {
    if (!dragging) return;
    pendingHeight = dragging.height + dragging.y - event.clientY;
    if (!pointerFrame) pointerFrame = requestAnimationFrame(() => { pointerFrame = 0; setTimelineHeight(pendingHeight); });
  }
  function setupControls() {
    const exports = document.querySelector(".export-actions");
    if (exports && !exports.querySelector(".xoi-download-menu")) {
      downloadMenu = document.createElement("details");
      downloadMenu.className = "xoi-download-menu";
      const toggle = document.createElement("summary");
      toggle.textContent = "导出 ▾";
      const options = document.createElement("div");
      options.className = "xoi-download-options";
      for (const native of exports.querySelectorAll(":scope > button")) {
        native.classList.add("xoi-native-export");
        const button = document.createElement("button");
        button.type = "button";
        const nativeText = native.textContent.trim();
        button.textContent = nativeText.includes("截图") || native.classList.contains("capture-image-button")
          ? "截图 PNG"
          : native.classList.contains("export-button") || nativeText.includes("MP4")
            ? "下载 MP4"
            : "导出工程";
        button.onclick = () => { downloadMenu.open = false; if (!native.disabled) native.click(); };
        options.append(button);
      }
      downloadMenu.append(toggle, options);
      downloadMenu.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); downloadMenu.open = false; toggle.focus(); } });
      exports.prepend(downloadMenu);
    }
    const target = document.querySelector(".top-actions");
    const timeline = document.querySelector(".timeline");
    if (target && !target.querySelector(".xoi-layout-controls")) {
      buttons = document.createElement("div"); buttons.className = "xoi-layout-controls";
      buttons.setAttribute("role", "group"); buttons.setAttribute("aria-label", "工作区面板");
      for (const [key, label, selector] of [["left", "素材", ".left-sidebar"], ["right", "属性", ".right-sidebar"], ["timeline", "时间线", ".timeline"]]) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.dataset.panel = key;
        button.title = `收放${label}面板`; button.setAttribute("aria-label", `收放${label}面板`);
        button.addEventListener("keydown", event => { if (event.key === " " || event.key === "Enter") event.stopPropagation(); });
        const panel = document.querySelector(selector); if (panel) { panel.id ||= `xoi-panel-${key}`; button.setAttribute("aria-controls", panel.id); }
        button.addEventListener("click", () => toggle(key)); buttons.append(button);
      }
      target.append(buttons);
    }
    if (timeline && !timeline.querySelector(".xoi-timeline-resize")) {
      resizeHandle = document.createElement("div"); resizeHandle.className = "xoi-timeline-resize"; resizeHandle.tabIndex = 0;
      resizeHandle.setAttribute("role", "separator"); resizeHandle.setAttribute("aria-orientation", "horizontal"); resizeHandle.setAttribute("aria-label", "调整时间线高度");
      resizeHandle.setAttribute("aria-valuemin", "96"); resizeHandle.setAttribute("aria-valuemax", "300");
      resizeHandle.addEventListener("pointerdown", event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); dragging = { y:event.clientY, height:timeline.getBoundingClientRect().height }; resizeHandle.setPointerCapture(event.pointerId); });
      resizeHandle.addEventListener("pointermove", pointerMove); resizeHandle.addEventListener("pointerup", endDrag); resizeHandle.addEventListener("pointercancel", endDrag);
      resizeHandle.addEventListener("keydown", event => { if (!["ArrowUp", "ArrowDown", "Home"].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); setTimelineHeight(event.key === "Home" ? 152 : timeline.getBoundingClientRect().height + (event.key === "ArrowUp" ? 16 : -16)); persist(); });
      timeline.append(resizeHandle);
    }
  }
  function syncParent() {
    if (parent === window) return;
    try {
      const host = parent.document.querySelector(".director3d-container");
      if (!host) return;
      document.documentElement.dataset.xoiEmbedded = "true";
      if (!parent.document.getElementById("xoi-director-host-style")) {
        const style = parent.document.createElement("link"); style.id = "xoi-director-host-style"; style.rel = "stylesheet";
        style.href = new URL("./xoi-host.css?v=20261020-2", import.meta.url).href; parent.document.head.append(style);
      }
      const skillsOpen = Boolean(host.querySelector(".skills-panel"));
      document.documentElement.dataset.xoiSkillsOpen = String(skillsOpen);
      const trigger=host.querySelector(".skills-trigger");
      const reserved=skillsOpen&&parent.innerWidth>1100?0:Math.ceil(trigger?.getBoundingClientRect().width||240)+24;
      document.documentElement.style.setProperty("--xoi-assistant-space",`${reserved}px`);
      if(trigger&&trigger!==observedTrigger){triggerObserver?.disconnect();observedTrigger=trigger;triggerObserver=new ResizeObserver(schedule);triggerObserver.observe(trigger);}
      const naturalWidth=selector=>{
        const element=document.querySelector(selector);if(!element)return 0;
        const children=[...element.children].filter(node=>getComputedStyle(node).display!=="none");
        return children.reduce((sum,node)=>sum+Math.max(node.getBoundingClientRect().width,node.scrollWidth),0)+(parseFloat(getComputedStyle(element).gap)||0)*Math.max(0,children.length-1);
      };
      const compact=innerWidth<180+naturalWidth(".top-actions")+naturalWidth(".export-actions")+120+reserved+48;
      document.documentElement.dataset.xoiHeaderRows=compact?"2":"1";
      const topbar = document.querySelector(".topbar");
      if (topbar) {
        const height = Math.ceil(topbar.getBoundingClientRect().height);
        host.style.setProperty("--xoi-director-header", `${height}px`);
        const brand = document.querySelector(".brand-mark"), bar = host.querySelector(".project-bar");
        if (brand && bar) { bar.style.width = `${Math.ceil(brand.getBoundingClientRect().width)}px`; bar.style.height = `${height}px`; }
      }
      if (!parentObserver) { parentObserver = new MutationObserver(onStructureChange); parentObserver.observe(host, { childList:true, subtree:true }); }
    } catch { /* 独立白模窗口不需要宿主协调。 */ }
  }
  function refresh() {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = 0;
    workspace = document.querySelector(".workspace");
    if (!workspace) return;
    setupControls(); applyLayout(); syncParent(); keyframeGuide.setup(); motionLibrary.setup();
    const watermark=document.querySelector('.owner-watermark');
    if(watermark?.getAttribute('aria-label')!=='XOi')watermark?.setAttribute('aria-label','XOi');
    const viewport = document.querySelector(".viewport-shell");
    if (viewport && viewport !== viewportTarget) { viewportObserver?.disconnect(); viewportTarget = viewport; viewportObserver = new ResizeObserver(resizeCanvas); viewportObserver.observe(viewport); }
    if (!ready && viewport?.querySelector("canvas")) {
      ready = true; loader.classList.add("is-ready"); hideLoaderTimer = setTimeout(() => loader.remove(), 180);
    }
  }
  function schedule() { if (!scheduled) scheduled = requestAnimationFrame(refresh); }
  function onStructureChange(records) {
    // 播放每帧会更新轨道与属性读数，它们由时间线自己的观察器处理。
    // 不在这些更新里重复测量整页、同步宿主布局，避免渲染与强制布局争抢主线程。
    if(ready&&buttons?.isConnected&&records.every(record=>record.target instanceof Element&&record.target.closest(".timeline,.right-sidebar,.assets-scroll,.scene-list,.shots-list,.xoi-motion-playback,.xoi-motion-preview")))return;
    if (!records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) return;
    // 首屏先接入工具和移除加载层，不依赖被遮挡 iframe 的首个动画帧。
    if (!ready || !buttons?.isConnected || workspace !== document.querySelector(".workspace")) refresh();
    else schedule();
  }
  const observer = new MutationObserver(onStructureChange); observer.observe(document.getElementById("root"), { childList:true, subtree:true });
  addEventListener("resize", schedule);
  addEventListener("pagehide", stopWorkspace, { once:true });
  schedule();
  disposeWorkspace = () => {
    keyframeGuide.dispose();
    motionLibrary.dispose();
    observer.disconnect(); viewportObserver?.disconnect(); parentObserver?.disconnect(); triggerObserver?.disconnect(); removeEventListener("resize", schedule);
    removeEventListener("pagehide", stopWorkspace);
    for (const id of [scheduled, canvasResize, pointerFrame]) if (id) cancelAnimationFrame(id);
    clearTimeout(hideLoaderTimer); loader.remove(); buttons?.remove(); resizeHandle?.remove(); downloadMenu?.remove();
    document.querySelectorAll(".xoi-native-export").forEach(button => button.classList.remove("xoi-native-export"));
  };
}
