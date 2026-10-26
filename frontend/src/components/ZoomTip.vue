<template>
  <!-- 浏览器缩放提醒：只盯用户手动 Ctrl/Cmd +/- 造成的 devicePixelRatio 相对基线的偏移；
       系统 DPI（Windows 125%/150%）在页面加载时就被记进基线，不会误报。 -->
  <Transition name="zoom-tip">
    <div v-if="visible" class="zoomTip" role="status" aria-live="polite">
      <svg class="warnIcon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" /><path d="M12 9.8v4.4" /><circle cx="12" cy="16.9" r="0.7" fill="currentColor" stroke="none" /></svg>
      <span>检测到浏览器缩放，页面可能显示异常，建议按 <b>{{ isMac ? "⌘ + 0" : "Ctrl + 0" }}</b> 恢复</span>
      <button type="button" class="zoomTipClose" aria-label="本次会话不再提示" title="本次会话不再提示" @click="dismissForever">×</button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";

const visible = ref(false);
const isMac = /mac|iphone|ipad|ipod/i.test(navigator.userAgent);

/** 加载瞬间的 devicePixelRatio 作为基线：系统 DPI 缩放已含在基线里，之后只有
 *  用户手动 Ctrl/Cmd +/-（或浏览器菜单缩放）才会让比值偏离 1。 */
const baselineDpr = window.devicePixelRatio || 1;
let dismissed = false;
try {
  dismissed = sessionStorage.getItem("xoi_zoom_tip_dismissed") === "1";
} catch {
  /* 隐私模式等场景下 sessionStorage 不可用时退化为每次会话可提示 */
}
let lastDelta = 1;
let settleTimer: number | undefined;
let hideTimer: number | undefined;

function evaluate() {
  const dpr = window.devicePixelRatio || 1;
  const delta = dpr / baselineDpr;
  const zoomed = Math.abs(delta - 1) > 0.05; // 容忍 5% 抖动，避免边缘误报
  if (!zoomed) {
    hide(); // 回到 100%：立即收起
  } else if (!dismissed && delta !== lastDelta) {
    show(); // 出现了新的缩放动作
  }
  lastDelta = delta;
}
function show() {
  visible.value = true;
  window.clearTimeout(hideTimer);
  // 就算用户不恢复，展示一会儿也就自己退场，不长期占屏
  hideTimer = window.setTimeout(() => {
    visible.value = false;
  }, 6000);
}
function hide() {
  visible.value = false;
  window.clearTimeout(hideTimer);
}
function dismissForever() {
  dismissed = true;
  hide();
  try {
    sessionStorage.setItem("xoi_zoom_tip_dismissed", "1");
  } catch {
    /* ignore */
  }
}
function onResize() {
  // 缩放过程中的 resize 是连续的，等操作停稳再判定
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(evaluate, 250);
}

onMounted(() => {
  // 只在桌面（精细指针）设备启用；移动端捏合缩放走 visualViewport，不纳入本提示
  if (!window.matchMedia("(pointer: fine)").matches) return;
  window.addEventListener("resize", onResize);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.clearTimeout(settleTimer);
  window.clearTimeout(hideTimer);
});
</script>

<style scoped>
.zoomTip {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3200;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: min(92vw, 560px);
  padding: 9px 12px 9px 15px;
  border: 1px solid #f0b27e;
  border-radius: 999px;
  background: #fdf6ed;
  box-shadow: 0 10px 28px rgba(74, 56, 42, 0.16);
  color: #c25a22;
  font-size: 12.5px;
  line-height: 1.5;
}
.zoomTip b {
  padding: 0 2px;
  font-weight: 700;
  white-space: nowrap;
}
.zoomTip .warnIcon {
  flex: none;
  color: #e8863c;
}
.zoomTipClose {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-left: 3px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #c9885c;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.zoomTipClose:hover {
  background: #f7e4d2;
  color: #a44e1f;
}
.zoom-tip-enter-active,
.zoom-tip-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.zoom-tip-enter-from,
.zoom-tip-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}
</style>
