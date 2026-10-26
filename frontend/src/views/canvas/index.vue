<template>
  <div class="atelier-canvas-wrapper">
    <iframe
      v-if="iframeSrc"
      ref="iframeRef"
      :src="iframeSrc"
      frameborder="0"
      class="atelier-canvas-iframe"
      title="无限画布"
    ></iframe>
    <div v-if="loading" class="canvas-loading-overlay">
      <div class="canvas-loading-spinner"></div>
      <div class="canvas-loading-text">画布加载中...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";

/**
 * Atelier 无限画布薄壳：
 * - React 画布源码在 frontend/atelier/，构建产物挂 /atelier-canvas/，整包跑在同源 iframe 里
 * - 认证：同源共享 localStorage.token，画布内自行附带；页面级守卫由 router 全局守卫承担
 * - 主题：App.vue 的 initIframeTheme 持续向 iframe 广播 xoi:theme，画布侧自行消费
 * - 角景/资产联动的 ?import=&source=xoi&from= 参数：从 Vue hash query 透传进 iframe src query，
 *   由画布侧启动引导消费（导入图片建画布 / 保存并返回定点回归）
 */
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const emit = defineEmits<{ (event: "editor-state", editor: boolean): void }>();
const iframeRef = ref<HTMLIFrameElement | null>(null);
const loading = ref(true);
let frameReady=false;
let pendingEntryQuery:string|null=null;
function deliverPendingEntry(){
  if(!frameReady||pendingEntryQuery===null)return false;
  const query=pendingEntryQuery;pendingEntryQuery=null;
  iframeRef.value?.contentWindow?.postMessage({type:"xoi:canvas-entry",query},location.origin);
  return true;
}
const iframeSrc = ref<string>("");

function onCanvasReady(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.source !== iframeRef.value?.contentWindow) return;
  if (event.data?.type === "xoi:canvas-ready") { frameReady=true;if(!deliverPendingEntry()){loading.value = false;syncActivity();} }
}
onMounted(() => {
  window.addEventListener("message", onCanvasReady);
  iframeSrc.value = buildIframeSrc();
});

onUnmounted(() => window.removeEventListener("message", onCanvasReady));

const route = useRoute();
/**
 * 画布是常驻组件：路由在 /canvas 内部变化（如已停在画布页再点侧栏「新建画布」）不会重挂载，
 * 所以监听 fullPath：就绪的编辑器通过同源消息处理新建、导入与需求交接，
 * 复用已经加载的运行时；资产独立视图或尚未就绪时才更新 iframe 地址。
 * 重复点击同一条目由侧栏 handleClick 里的 nonce 保证 fullPath 必然变化。
 */
watch(
  () => route.fullPath,
  () => {
    if (route.path !== "/canvas" || !iframeSrc.value) return;
    const hasEntry = ["id", "new", "import", "graph", "handoff", "view"].some(key => route.query[key] !== undefined);
    if (!hasEntry) { syncActivity(); return; }
    const next = buildIframeSrc();
    if(route.query.view===undefined){
      // A fast paste-and-send may arrive before prewarming finishes. Queue it
      // for the existing runtime instead of discarding its in-flight load.
      loading.value=true;pendingEntryQuery=new URL(next,location.origin).search;deliverPendingEntry();
    }else if(next!==iframeSrc.value){loading.value=true;frameReady=false;pendingEntryQuery=null;iframeSrc.value=next;}

  },
);

// Only pause media that were playing, never cancel generation or save operations.
const pausedMedia = new Set<HTMLMediaElement>();
function syncActivity() {
  const frame = iframeRef.value;
  if (!frame) return;
  frame.contentWindow?.postMessage({ type: "xoi:workspace-active", active: props.active }, window.location.origin);
  try {
    if (!props.active) {
      frame.contentDocument?.querySelectorAll<HTMLMediaElement>("video, audio").forEach(media => {
        if (!media.paused) { pausedMedia.add(media); media.pause(); }
      });
    } else {
      emit("editor-state", /^#\/canvas\/[^/]+/.test(frame.contentWindow?.location.hash || ""));
      pausedMedia.forEach(media => { if (media.isConnected) void media.play().catch(() => {}); });
      pausedMedia.clear();
    }
  } catch { /* The same-origin frame may be navigating. */ }
}
watch(() => props.active, syncActivity, { flush: "post" });

/** 解析 Vue hash 路由上的 query（/#/canvas?import=...&source=xoi&from=...）透传给 iframe，并清理地址栏 */
function buildIframeSrc(): string {
  let query = "";
  try {
    const hash = window.location.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex >= 0) {
      const params = new URLSearchParams(hash.slice(qIndex + 1));
      // source=xoi 的四条引导链路原样透传：import=（角景/资产/发图）、new=1（侧栏新建画布一键直达）、
      // graph=1（灵感广场整图复刻）、handoff=1（灵感广场「带到画布生成」的提示词交接）
      const canvasId = /^([A-Za-z0-9_-]+)$/.exec(params.get("id") ?? "")?.[1] ?? "";
      if (
        params.get("source") === "xoi" &&
        (params.get("import") || params.get("new") === "1" || params.get("graph") || params.get("handoff") === "1")
      )
        query = `?${params.toString()}`;
      else if (params.get("view") === "assets") query = "?view=assets";
      else if (canvasId) query = `?id=${canvasId}`;
      // 地址栏只留干净路由；?id= 是刷新恢复锚点，保留（引导参数已随 iframe src 带入，可清）
      if (window.history && window.history.replaceState) {
        const keepId = /(^|&)id=([A-Za-z0-9_-]+)/.test(hash.slice(qIndex + 1)) ? `?id=${/id=([A-Za-z0-9_-]+)/.exec(hash.slice(qIndex + 1))?.[1] ?? ""}` : "";
        if (!keepId) window.history.replaceState({}, "", window.location.pathname + "#/canvas");
        else if (params.get("source") !== "xoi") window.history.replaceState({}, "", `${window.location.pathname}#/canvas${keepId}`);
      }
    }
  } catch (e) {
    console.error("[canvas-shell] hash 参数解析失败:", e);
  }
  // 画布中心是 iframe 的默认入口；旧的黑色品牌落地页只保留给上游独立访问，
  // 从 XOi 工作台进入时直接打开与主站一致的项目中心。引导参数仍放在 search，
  // 这样 bridge 可以在 React 启动前消费，hash 则交给 React Router。
  // 刷新恢复：宿主记录的画布内部路由（如 /canvas/35）原样带回 iframe hash，
  // 用户停在某个画布时刷新不再掉回列表页。路由形态经白名单校验，不透传任意 hash。
  let inner = "#/canvas";
  try {
    // ?id=<画布id>（来自宿主 URL 同步）优先：刷新/直链原位回到该画布
    const fromQuery = /\?id=([A-Za-z0-9_-]+)/.exec(query)?.[1] ?? "";
    const saved = sessionStorage.getItem("xoi.canvas.lastRoute") || "";
    if (fromQuery) inner = `#/canvas/${fromQuery}`;
    else if (!query && /^\/canvas\/[A-Za-z0-9_-]+$/.test(saved)) inner = `#${saved}`;
  } catch { /* 无痕模式等 sessionStorage 不可用：回列表页 */ }
  return `/atelier-canvas/index.html${query}${inner}`;
}
</script>

<style scoped>
.atelier-canvas-wrapper {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #f7f7f5;
}

.atelier-canvas-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.canvas-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f7f7f5;
  z-index: 100;
}
.canvas-loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #f57400;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.canvas-loading-text {
  margin-top: 16px;
  color: rgba(35, 35, 35, 0.65);
  font-size: 14px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
