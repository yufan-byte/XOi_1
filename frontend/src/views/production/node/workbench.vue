<template>
  <t-card class="workbench" :class="{ fluid: standalone }">
    <div class="titleBar" :class="{ dragHandle: !standalone, pr: !standalone }">
      <DirectorNodeHeading node-id="workbench" step="06" label="EDITING" title="分镜与视频" description="先预览本集画面，再自主选择方式生成视频" />
      <Handle v-if="!standalone" :id="props.handleIds!.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
      <Handle v-if="!standalone" :id="props.handleIds!.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>
    <div class="videoPreview" @click.stop="openWorkbench('preview')">
      <div class="videoPlaceholder" :style="{ background: workbenchData?.gradient }">
        <t-image v-if="workbenchData?.cover" :src="workbenchData.cover" fit="cover" class="videoCover" />
        <div class="playButton">
          <i-video theme="outline" size="48" />
        </div>
        <div class="previewHint">点击进入工作台</div>
    </div>
    <div class="workbenchMeta">
      <span><i-check-one size="13" /> 已选镜头后即可开始</span>
      <t-button size="small" theme="primary" @click.stop="openWorkbench('preview')">打开工作台</t-button>
    </div>
    <!-- <div class="videoInfo">
        <div class="videoName">{{ workbenchData?.name }}</div>
        <div class="videoMeta">
          <span>{{ workbenchData?.duration }}</span>
          <span class="divider">|</span>
          <span>{{ workbenchData?.resolution }}</span>
          <span class="divider">|</span>
          <span>{{ workbenchData?.fps }}</span>
        </div>
      </div> -->
    </div>
    <workbench ref="workbenchRef" v-model:visible="visible" v-if="visible" />
  </t-card>
</template>

<script setup lang="ts">
import DirectorNodeHeading from "./DirectorNodeHeading.vue";
import workbench from "../components/workbench/index.vue";
import { Handle, Position } from "@vue-flow/core";
import productionAgentStore from "@/stores/productionAgent";

const visible = ref(false);
watch(visible, (open, wasOpen) => { if (!open && wasOpen) void productionAgentStore().getFlowData(); });
const workbenchRef = ref<{ setActiveMenu?: (menu: string) => void }>();

function openWorkbench(tab = "generate") {
  window.dispatchEvent(new CustomEvent("production:open-studio", {detail:{tab}}));
}

function focusWorkbench(event: Event) {
  const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab;
  if (!tab) return;
  openWorkbench(tab);
}

onMounted(() => window.addEventListener("production:focus-workbench", focusWorkbench));
onUnmounted(() => window.removeEventListener("production:focus-workbench", focusWorkbench));

interface WorkbenchData {
  name?: string;
  duration?: string;
  resolution?: string;
  fps?: string;
  cover?: string;
  gradient?: string;
  videoList?: unknown[];
}

const props = defineProps<{
  id?: string;
  handleIds?: {
    target: string;
    source: string;
  };
  standalone?: boolean;
}>();

const workbenchData = defineModel<WorkbenchData>({ required: true });
</script>

<style lang="scss" scoped>
.workbench {
  cursor: pointer;
  min-width: 280px;
  user-select: text;
  transition: filter 0.1s;

  &.fluid {
    width: 100%;
    min-width: 0;
  }
  &:hover {
    .playButton {
      transform: scale(1.1);
    }
  }
  &:active {
    filter: brightness(0.9);
  }

  .titleBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    cursor: grab;
    user-select: none;
  }

  .title {
    background-color: #000;
    width: fit-content;
    padding: 5px 10px;
    color: #fff;
    border-radius: 8px 0;
    font-size: 16px;
  }
  .titleHint { margin-top: 5px; color: #9a96a3; font-size: 11px; }

  .workbenchMeta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #8a8691;
    font-size: 11px;
    :deep(.i-icon) { margin-right: 4px; color: #f57400; vertical-align: -2px; }
  }

  .videoPreview {
    margin-bottom: 12px;
    cursor: pointer;
  }

  .videoPlaceholder {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    /* 墨黑封面 + 一点暖色氛围光，替代旧的紫蓝渐变 */
    background:
      radial-gradient(120% 90% at 82% 12%, rgba(255, 155, 69, 0.22), transparent 55%),
      linear-gradient(135deg, #34313a 0%, #232028 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .videoCover {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .playButton {
    position: absolute;
    color: rgba(255, 255, 255, 0.92);
    filter: drop-shadow(0 4px 14px rgba(255, 155, 69, 0.35));
    transition: transform 0.2s;
  }

  .previewHint {
    position: absolute;
    left: 10px;
    bottom: 8px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(20, 18, 24, 0.55);
    backdrop-filter: blur(4px);
    color: rgba(255, 255, 255, 0.85);
    font-size: 10px;
    letter-spacing: 0.02em;
  }

  .videoInfo {
    margin-top: 8px;
  }

  .videoName {
    font-size: 14px;
    font-weight: 600;
    color: var(--td-text-color-primary, #333);
    margin-bottom: 4px;
  }

  .videoMeta {
    font-size: 12px;
    color: var(--td-text-color-secondary, #666);

    .divider {
      margin: 0 6px;
      color: var(--td-border-level-1-color, #ddd);
    }
  }
}
</style>
