<template>
  <nav class="creation-modes" aria-label="创作入口">
    <RouterLink to="/project" class="active" aria-current="page" title="短剧工坊：剧本、角色、分镜逐项制作">
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 7h14v10H3zM3 7V3h14v4M6 3l3 4m3-4 3 4M6 11h8m-8 3h5" /></svg>
      <span>短剧工坊</span>
    </RouterLink>
    <RouterLink :to="quickTarget" title="一站式：从创意到成片的引导式工作区">
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m11 2-7 9h5l-1 7 8-10h-5l1-6Z" /></svg>
      <span>一站式</span>
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
/* XOi Mono：灰阶分段入口，主位置实底反白，无渐变、无位移动效 */
.creation-modes {
  display: flex;
  gap: 0;
  padding: 3px;
  background: var(--x-bg-3, #eeeef0);
  border: 1px solid var(--x-line, #e4e4e7);
  border-radius: 8px;
  flex: none;
}
.creation-modes a {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 92px;
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 550;
  letter-spacing: 0.01em;
  white-space: nowrap;
  text-decoration: none;
  color: var(--x-fg-2, #4f4f58);
  transition: color 0.15s, background 0.15s;
}
.creation-modes svg {
  width: 15px;
  height: 15px;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.creation-modes a:hover {
  color: var(--x-fg, #0a0a0b);
  background: var(--x-bg-4, #e4e4e8);
}
.creation-modes a.active {
  background: var(--x-fg, #0a0a0b);
  color: var(--x-fg-inv, #ffffff);
  font-weight: 650;
}
.creation-modes a:focus-visible {
  outline: 2px solid var(--x-sel, #4f5bd5);
  outline-offset: 2px;
}
@media (max-width: 600px) {
  .creation-modes a {
    min-width: 82px;
    padding: 7px 10px;
    font-size: 11.5px;
  }
}
</style>
