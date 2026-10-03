<template>
  <div class="atelier-canvas-wrapper">
    <iframe
      v-if="iframeSrc"
      ref="iframeRef"
      :src="iframeSrc"
      frameborder="0"
      class="atelier-canvas-iframe"
      title="无限画布"
      @load="loading = false"
    ></iframe>
    <div v-if="loading" class="canvas-loading-overlay">
      <div class="canvas-loading-spinner"></div>
      <div class="canvas-loading-text">画布加载中...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRoute } from "vue-router";

/**
 * Atelier 无限画布薄壳：
 * - React 画布源码在 frontend/atelier/，构建产物挂 /atelier-canvas/，整包跑在同源 iframe 里
 * - 认证：同源共享 localStorage.token，画布内自行附带；页面级守卫由 router 全局守卫承担
 * - 主题：App.vue 的 initIframeTheme 持续向 iframe 广播 xoi:theme，画布侧自行消费
 * - 角景/资产联动的 ?import=&source=xoi&from= 参数：从 Vue hash query 透传进 iframe src query，
 *   由画布侧启动引导消费（导入图片建画布 / 保存并返回定点回归）
 */
const iframeRef = ref<HTMLIFrameElement | null>(null);
const loading = ref(true);
const iframeSrc = ref<string>("");

onMounted(() => {
  iframeSrc.value = buildIframeSrc();
});

const route = useRoute();
/**
 * 画布是常驻组件：路由在 /canvas 内部变化（如已停在画布页再点侧栏「新建画布」）不会重挂载，
 * 所以监听 fullPath —— 只要引导参数（new=1 / import= / view=assets）变了就重建 iframeSrc，
 * 让 iframe 整包重载、atelier 侧的入口引导（建项目/导图/开资产页）重新跑一遍。
 * 重复点击同一条目由侧栏 handleClick 里的 nonce 保证 fullPath 必然变化。
 */
watch(
  () => route.fullPath,
  () => {
    if (!iframeSrc.value) return;
    const next = buildIframeSrc();
    if (next !== iframeSrc.value) {
      loading.value = true; // iframe 换 src 会整包重载，先把加载遮罩置回来
      iframeSrc.value = next;
    }
  },
);

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
      if (
        params.get("source") === "xoi" &&
        (params.get("import") || params.get("new") === "1" || params.get("graph") || params.get("handoff") === "1")
      )
        query = `?${params.toString()}`;
      else if (params.get("view") === "assets") query = "?view=assets";
      // 地址栏只留干净路由，参数已随 iframe src 带入画布
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", window.location.pathname + "#/canvas");
      }
    }
  } catch (e) {
    console.error("[canvas-shell] hash 参数解析失败:", e);
  }
  return `/atelier-canvas/index.html${query}`;
}
</script>

<style scoped>
.atelier-canvas-wrapper {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #181817;
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
  background: #181817;
  z-index: 100;
}
.canvas-loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.canvas-loading-text {
  margin-top: 16px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 14px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
