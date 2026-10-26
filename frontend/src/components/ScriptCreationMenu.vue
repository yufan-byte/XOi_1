<template>
  <RouterLink
    class="script-parent"
    :class="{ selected: inSection, compact: collapsed }"
    to="/project"
    aria-label="短剧工坊"
    :title="collapsed ? '短剧工坊' : undefined"
    :aria-current="inSection ? 'page' : undefined">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 8h18v12H3zM3 8V3h18v5M6 3l4 5m3-5 4 5M7 13h10m-10 3h6" /></svg>
    <span v-if="!collapsed">短剧工坊</span>
    <em v-if="!collapsed" class="script-badge">New</em>
  </RouterLink>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
defineProps<{ collapsed: boolean }>();
const route = useRoute();
const inSection = computed(() =>
  ["/project", "/project/new", "/script/one-stop", "/novel", "/script", "/scriptAgent", "/cornerScape", "/production"].includes(route.path),
);
</script>
<style scoped>
.script-parent {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  margin: 2px 0 3px;
  padding: 9px 14px;
  border-radius: 13px;
  text-decoration: none;
  color: #696762;
  transition:
    background 0.18s,
    color 0.18s;
  box-sizing: border-box;
}
.script-parent svg {
  width: 20px;
  height: 20px;
  flex: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.script-parent span {
  font-size: 14px;
  font-weight: 580;
  letter-spacing: 0.015em;
}
.script-parent:hover {
  background: #ffffffa6;
  color: #302e2b;
}
.script-parent.selected {
  background: #fff;
  color: #302e2b;
  box-shadow: 0 2px 8px #302e2b05;
}
.script-parent.selected::before {
  content: "";
  position: absolute;
  left: 0;
  top: 13px;
  bottom: 13px;
  width: 3px;
  border-radius: 3px;
  background: #f0783e;
}
.script-parent.selected svg {
  color: #e56e36;
}
.script-parent.compact {
  padding: 12px 0;
  justify-content: center;
}
.script-badge {
  margin-left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: #e8f1ff;
  color: #3d7fff;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 650;
  line-height: 1.4;
  letter-spacing: 0.01em;
}
.script-parent:focus-visible {
  outline: 2px solid #e9986a;
  outline-offset: 2px;
}
</style>
