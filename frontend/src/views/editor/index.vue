<template>
  <editorWorkbench />
</template>

<script setup lang="ts">
/**
 * 剪辑工作台（/editor）。
 *
 * 之前剪辑是「画布节点 → 全屏弹窗 → 第 3 个 Tab」的第三层，用户要四步才碰得到；
 * 现在从分镜台 / 成片节点一步直达，且进入即按分镜顺序铺好初稿。
 *
 * 两种明确模式：
 * · /editor?mode=standalone：纯本地草稿，不读取当前项目、剧本、分镜和项目素材。
 * · /editor?episode=<id>：项目内剪辑，读取该分集素材并自动装配初稿。
 */
import editorWorkbench from "@/views/production/components/workbench/editVideo/index.vue";
</script>

<style scoped>
:deep(.editor) {
  height: 100%;
}
</style>
