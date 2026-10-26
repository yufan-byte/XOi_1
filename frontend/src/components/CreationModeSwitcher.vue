<template>
  <nav class="creation-modes" aria-label="创作模式">
    <RouterLink :to="quickTarget" title="快速创作：一站式故事工作区">
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m11 2-7 9h5l-1 7 8-10h-5l1-6Z" /></svg>
      <span>快速创作</span>
    </RouterLink>
    <RouterLink to="/project" class="active" aria-current="page" title="导演创作：剧本、角色、分镜逐项制作">
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 7h14v10H3zM3 7V3h14v4M6 3l3 4m3-4 3 4M6 11h8m-8 3h5" /></svg>
      <span>导演创作</span>
    </RouterLink>
  </nav>
</template>
<script setup lang="ts">
import { inject, ref, type Ref } from "vue";
import { RouterLink } from "vue-router";
// 宿主保留同一账号上次打开的快速项目位置；不复制或转换项目。
const quickTarget = inject<Ref<string>>("scriptQuickDestination", ref("/script/one-stop"));
</script>
<style scoped>
/* 分段式创作模式切换：等宽两段 + 滑动指示器（:has 感知激活段），像相机模式拨杆 */
.creation-modes {
  position: relative;
  display: flex;
  gap: 0;
  padding: 3px;
  background: linear-gradient(180deg, #f1ece5, #ebe4db);
  border: 1px solid #e3d8ca;
  border-radius: 12px;
  box-shadow: inset 0 1px 2px rgba(62, 48, 38, 0.05);
  flex: none;
}
.creation-modes::before {
  content: "";
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: 9px;
  background: linear-gradient(180deg, #fffefc, #fff7ef);
  box-shadow:
    0 1px 3px rgba(62, 48, 38, 0.1),
    0 4px 10px rgba(224, 100, 31, 0.08),
    inset 0 1px 0 #fff;
  transform: translateX(0);
  transition: transform 0.32s cubic-bezier(0.3, 1.2, 0.4, 1);
}
/* 激活段切到「导演创作」时，指示器滑到右半段；不支持 :has 的浏览器回落到各自背景高亮 */
@supports selector(:has(*)) {
  .creation-modes:has(a:last-child.active)::before {
    transform: translateX(100%);
  }
}
.creation-modes a {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 92px;
  padding: 8px 14px;
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 550;
  letter-spacing: 0.01em;
  white-space: nowrap;
  text-decoration: none;
  color: #9a8b7a;
  transition:
    color 0.2s,
    background 0.2s;
}
.creation-modes svg {
  width: 15px;
  height: 15px;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
  transition: transform 0.2s;
}
.creation-modes a:hover {
  color: #6b5545;
}
.creation-modes a:hover svg {
  transform: translateY(-1px);
}
.creation-modes a.active {
  color: #c25a22;
  font-weight: 650;
}
.creation-modes a.active svg {
  stroke: #e0641f;
}
/* 无 :has 回落：激活段自身带背景 */
@supports not selector(:has(*)) {
  .creation-modes a.active {
    background: #fff;
    box-shadow: 0 1px 3px rgba(62, 48, 38, 0.12);
  }
}
.creation-modes a:focus-visible {
  outline: 2px solid #e9986a;
  outline-offset: 2px;
}
@media (max-width: 600px) {
  .creation-modes a {
    min-width: 82px;
    padding: 8px 10px;
    font-size: 11.5px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .creation-modes::before {
    transition: none;
  }
  .creation-modes a,
  .creation-modes svg {
    transition: none;
  }
}
</style>
