<template>
  <editorWorkbench />
</template>

<script setup lang="ts">
/**
 * 剪辑成片：独立工作台（/editor）。
 *
 * 之前剪辑是「画布节点 → 全屏弹窗 → 第 3 个 Tab」的第三层，用户要四步才碰得到；
 * 现在从分镜台 / 成片节点一步直达，且进入即按分镜顺序铺好初稿。
 *
 * 编辑器本体复用 editVideo/index.vue（它自己解析项目、分集与素材，不依赖外层 props）。
 */
import editorWorkbench from "@/views/production/components/workbench/editVideo/index.vue";
</script>

<style scoped>
:deep(.editor) {
  height: 100%;
}
</style>
