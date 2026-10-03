<template>
  <t-dialog
    body="String"
    :header="false"
    :footer="false"
    :closeBtn="false"
    v-model:visible="visible"
    attach="body"
    placement="center"
    mode="full-screen"
    dialogClassName="noFooter"
    class="fullscreenDialog">
    <div class="closure">
      <i-close-small theme="outline" size="24" fill="#4a4a4a" @click="visible = false" />
    </div>
    <div class="workbenchIntro">
      <div class="introCopy">
        <div class="eyebrow">VIDEO WORKBENCH</div>
        <div class="workbenchTitle">从分镜到成片</div>
        <div class="workbenchHint">按顺序完成，结果会自动带入下一步。</div>
      </div>
      <div class="workflowSteps" aria-label="视频制作流程">
        <button v-for="step in workflowSteps" :key="step.id" type="button" class="workflowStep" :class="{ active: activeMenu === step.id }" @click="changeMenu(step.id)">
          <span class="stepIndex">{{ step.index }}</span>
          <strong>{{ step.label }}</strong>
          <span class="stepArrow" v-if="step.id === 'editVideo'">↗</span>
          <span class="stepArrow" v-else>›</span>
        </button>
      </div>
    </div>
    <div class="content">
      <preview v-if="activeMenu === 'preview'" @go-generate="changeMenu('generate')" />
      <generate v-if="activeMenu === 'generate'" @importVideo="handleBatchDownload" v-model="extractLines" />
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { useRouter } from "vue-router";
import preview from "./preview.vue";
import generate from "./generate/index.vue";

const visible = defineModel("visible", {
  type: Boolean,
  default: false,
});

const router = useRouter();
const activeMenu = ref("preview");

/**
 * 「03 剪辑成片」不再作为弹窗里的第三个 Tab —— 剪辑是独立工作台（/editor）：
 * 画布 → 节点 → 全屏弹窗 → Tab 要四步，而剪辑本身需要整块屏幕。
 * 这里只做一个入口，点它直接跳过去。
 */
const workflowSteps = [
  { id: "preview", index: "01", label: "分镜预览", description: "检查节奏与顺序" },
  { id: "generate", index: "02", label: "生成视频", description: "配置参考与提示词" },
  { id: "editVideo", index: "03", label: "剪辑成片", description: "在独立剪辑台精剪与导出" },
];

function setActiveMenu(menu: string) {
  if (["preview", "generate"].includes(menu)) activeMenu.value = menu;
}
defineExpose({ setActiveMenu });

const episodesId = inject<Ref<number>>("episodesId", ref(0));
const extractLines = ref(false);

function changeMenu(type: string) {
  if (type === "editVideo") {
    goEditor();
    return;
  }
  activeMenu.value = type;
}

function goEditor() {
  const query = episodesId.value ? `?episode=${episodesId.value}` : "";
  visible.value = false;
  router.push(`/editor${query}`);
}

/** 02 生成视频页的「导入到剪辑台」：直达独立剪辑台，进入即按分镜顺序自动装配 */
function handleBatchDownload() {
  goEditor();
}
</script>

<style lang="scss" scoped>
:deep(.t-dialog__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}
.fullscreenDialog {
  .closure {
    position: absolute;
    top: var(--td-comp-paddingTB-xl);
    right: var(--td-comp-paddingLR-xxl);
    z-index: 9999;
    cursor: pointer;
    margin-top: 20px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 150ms ease, transform 100ms ease;
    &:hover {
      background-color: var(--td-bg-color-container-hover);
    }
    &:active {
      transform: scale(0.9);
    }
  }
  .workbenchIntro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin: 0 0 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #eceaf0;
    background: #fff;
    .introCopy { min-width: 190px; }
    .eyebrow { color: #9b8bc9; font-size: 9px; font-weight: 800; letter-spacing: .16em; }
    .workbenchTitle { margin-top: 2px; color: #282631; font-size: 17px; font-weight: 750; letter-spacing: -.02em; }
    .workbenchHint { margin-top: 3px; color: #9b97a3; font-size: 11px; }
  }
  .workflowSteps { display: flex; align-items: center; gap: 4px; }
  .workflowStep {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    border: 1px solid transparent; border-radius: 9px; background: transparent; color: #817d89;
    font-size: 12px; cursor: pointer; transition: .2s ease;
    .stepIndex { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: #f0eef5; color: #817d8d; font-size: 10px; font-weight: 700; }
    .stepArrow { margin-left: 3px; color: #b7b1bf; font-size: 17px; font-weight: 300; }
    &:hover { background: #faf9fc; }
    &.active { border-color: #d9d0f5; background: #f7f4ff; color: #5f43b2; .stepIndex { background: #7858cf; color: #fff; } }
  }
  .content {
    flex: 1;
    overflow: hidden;
    animation: fadeSlideIn 300ms ease-out;
  }

  @media (max-width: 900px) {
    .workbenchIntro { align-items: flex-start; flex-direction: column; }
    .workflowSteps { width: 100%; }
    .workflowStep { flex: 1; min-width: 0; justify-content: center; }
    .workflowStep .stepArrow { display: none; }
  }
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
