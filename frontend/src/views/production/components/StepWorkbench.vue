<!-- 步骤式制作工作台：把画布上的七个节点收进一条清晰的生产线。
     每一步只有一条主路径（手动为主、导演助理为辅），审核闸门变成「通过 → 下一步」的自然推进；
     原画布仍可通过「总览画布」进入（高级视图）。 -->
<template>
  <div class="stepWorkbench">
    <header class="stepHeader">
      <StoryWorkspaceHeader class="productionMark" current="production" :project-type="project?.projectType" title="导演准备" description="剧本、导演计划与分镜表" compact />
      <t-select
        :value="props.episodesId"
        :loading="props.episodeSwitching"
        :disabled="props.episodeSwitching"
        :placeholder="$t('workbench.production.selectPlaceholder')"
        autoWidth
        :options="props.episodesOptions"
        filterable
        @change="emit('episode-change', $event)">
        <template #label><i-document-folder size="22" /></template>
      </t-select>
      <t-tooltip placement="bottom" content="重新加载制作数据">
        <t-button class="outlineBtn" variant="outline" aria-label="重新加载制作数据" @click="emit('refresh')">
          <template #icon><i-refresh size="16" /></template>
        </t-button>
      </t-tooltip>
      <t-button variant="outline" class="canvasBtn" @click="openStudio">分镜预览 / 视频生成</t-button>
      <t-button variant="text" class="canvasBtn" @click="emit('show-canvas')"><template #icon><i-full-screen-one size="15" /></template>总览画布</t-button>
    </header>

    <nav class="stepBar" aria-label="制作步骤">
      <template v-for="(step, index) in stepList" :key="step.id">
        <button type="button" class="stepTab" :class="{ active: activeStep === step.id }" @click="selectStep(step.id)">
          <span class="stepIndex" :class="`is-${stepProgress(step.id).tone}`">
            <template v-if="stepProgress(step.id).tone === 'done'">✓</template>
            <template v-else-if="stepProgress(step.id).tone === 'warn'">!</template>
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="stepCopy">
            <strong>{{ step.label }}</strong>
            <small>{{ stepProgress(step.id).label }}</small>
          </span>
        </button>
        <span v-if="index < stepList.length - 1" class="stepArrow" :class="{ passed: stepProgress(step.id).tone === 'done' }" aria-hidden="true"></span>
      </template>
    </nav>

    <div class="stepBody">
      <main class="stepMain">
        <template v-if="activeStep === 'script'">
          <scriptNode standalone v-model="flowData.script" />
        </template>

        <template v-else-if="activeStep === 'scriptPlan'">
          <div v-if="flowData.script?.trim()" class="scriptReference">
            <button type="button" class="referenceToggle" @click="scriptExpanded = !scriptExpanded">
              {{ scriptExpanded ? "收起本集剧本" : "查看本集剧本" }}<i-chevron-down size="14" :class="{ flip: scriptExpanded }" />
            </button>
            <div v-show="scriptExpanded" class="referenceBody">
              <MdPreview :model-value="flowData.script" :theme="resolveThemeMode(themeSetting.mode)" />
            </div>
          </div>
          <scriptPlanNode standalone v-model="flowData.scriptPlan" />
        </template>

        <template v-else-if="activeStep === 'storyboardTable'">
          <storyboardTableNode standalone v-model="flowData.storyboardTable" />
        </template>

        <template v-else-if="activeStep === 'storyboard'">
          <storyboardNode standalone v-model="flowData.storyboard" :assetsData="flowData.assets" />
          <section class="stepSection">
            <div class="sectionHeading">
              <h4>角色与场景资产</h4>
              <small>生成分镜画面时自动作为参考图，保持人物与场景一致</small>
            </div>
            <assetsNode standalone v-model="flowData.assets" />
          </section>
        </template>

        <template v-else-if="activeStep === 'final'">
          <workbenchNode standalone v-model="flowData.workbench" />
          <outputNode standalone :items="flowData.output" />
        </template>
      </main>

      <aside v-if="assistantOpen" class="assistantDock open">
        <rightChatBox docked :title="props.title" @close="assistantOpen = false" />
      </aside>
    </div>

    <button v-if="!assistantOpen" type="button" class="assistantLauncher" aria-label="展开导演助理" @click="assistantOpen = true">
      <i-movie theme="outline" size="17" />
      <span>导演助理</span>
    </button>

    <footer class="stepStatus" aria-label="制作进度">
      <span class="statusMetric">分镜 <b>{{ metrics.storyboardTotal }}</b></span>
      <span class="statusMetric">图片 <b>{{ metrics.imageDone }}/{{ metrics.storyboardTotal }}</b></span>
      <span class="statusMetric">视频 <b>{{ metrics.videoDone }}/{{ metrics.videoTotal }}</b></span>
      <span class="statusMetric">成片 <b>{{ metrics.outputCount }}</b></span>
      <t-tag v-if="metrics.issueCount" theme="warning" variant="light" size="small">待处理 {{ metrics.issueCount }}</t-tag>
      <t-button v-if="failedImageIds.length" size="small" theme="warning" variant="outline" :loading="retrying" @click="retryFailed">
        重试失败图片（{{ failedImageIds.length }}）
      </t-button>
      <span class="statusHint">{{ stepProgress(activeStep).next }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import StoryWorkspaceHeader from "@/components/pipeline/StoryWorkspaceHeader.vue";
import scriptNode from "../node/script.vue";
import scriptPlanNode from "../node/scriptPlan.vue";
import storyboardTableNode from "../node/storyboardTable.vue";
import storyboardNode from "../node/storyboard.vue";
import assetsNode from "../node/assets.vue";
import workbenchNode from "../node/workbench.vue";
import outputNode from "../node/output.vue";
import rightChatBox from "./rightChatBox/index.vue";
import { getDirectorProgress, type DirectorProgress } from "../utils/directorProgress";
import { MdPreview } from "@/utils/markdown";
import { resolveThemeMode } from "@/utils/theme";
import settingStore from "@/stores/setting";
import projectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";

function openStudio() { window.dispatchEvent(new CustomEvent("production:open-studio", {detail:{tab:"preview"}})); }

const props = defineProps<{
  episodesOptions: { label: string; value: number }[];
  episodesId?: number;
  episodeSwitching?: boolean;
  title: string;
}>();
const emit = defineEmits<{ (e: "episode-change", value: unknown): void; (e: "refresh"): void; (e: "show-canvas"): void }>();

const { project } = storeToRefs(projectStore());
const { themeSetting } = storeToRefs(settingStore());
const { flowData } = storeToRefs(productionAgentStore());

const stepList = [
  { id: "script", label: "剧本" },
  { id: "scriptPlan", label: "导演计划" },
  { id: "storyboardTable", label: "分镜表" },
  { id: "storyboard", label: "镜头画面" },
  { id: "final", label: "视频与成片" },
] as const;
type StepId = (typeof stepList)[number]["id"];
const stepOrder: StepId[] = ["script", "scriptPlan", "storyboardTable", "storyboard", "final"];

const progressMap = computed(() => getDirectorProgress(flowData.value));
function stepProgress(id: StepId): DirectorProgress {
  if (id === "final") return progressMap.value.output.tone === "done" ? progressMap.value.output : progressMap.value.workbench;
  return progressMap.value[id];
}

// 未手动选步时跟随数据自动前进（只进不退）：审核通过、画面完成后自然进入下一步。
const activeStep = ref<StepId>("scriptPlan");
let userPinned = false;
function selectStep(id: StepId) {
  userPinned = true;
  activeStep.value = id;
}
function suggestStep(): StepId {
  const fd = flowData.value;
  if (!fd.script?.trim()) return "script";
  if (!fd.reviewState?.planApproved) return "scriptPlan";
  if (!fd.reviewState?.tableApproved) return "storyboardTable";
  if (progressMap.value.storyboard.tone !== "done" || progressMap.value.assets.tone === "warn") return "storyboard";
  return "final";
}
watch(
  flowData,
  () => {
    if (userPinned) return;
    const next = suggestStep();
    if (stepOrder.indexOf(next) > stepOrder.indexOf(activeStep.value)) activeStep.value = next;
  },
  { deep: true },
);

const scriptExpanded = ref(false);

const metrics = computed(() => {
  const storyboard = flowData.value.storyboard ?? [];
  const imageDone = storyboard.filter((item) => item.state === "已完成" && item.src).length;
  const videoList = Array.isArray((flowData.value.workbench as { videoList?: unknown[] })?.videoList) ? (flowData.value.workbench as { videoList: any[] }).videoList : [];
  const videoDone = flowData.value.videoProgress?.done ?? videoList.filter((item) => item.state === "已完成" || item.state === "生成成功").length;
  const videoTotal = flowData.value.videoProgress?.total ?? videoList.length;
  return {
    storyboardTotal: storyboard.length,
    imageDone,
    videoDone,
    videoTotal,
    issueCount: storyboard.filter((item) => item.state === "生成失败").length + (flowData.value.videoProgress?.failed ?? 0),
    outputCount: (flowData.value.output ?? []).length,
  };
});

const failedImageIds = computed(() => (flowData.value.storyboard ?? []).filter((item) => item.state === "生成失败" && item.id).map((item) => item.id!));
const retrying = ref(false);
async function retryFailed() {
  if (!failedImageIds.value.length) return;
  retrying.value = true;
  try {
    await productionAgentStore().batchGenerateStoryboard(failedImageIds.value, true);
  } catch {
    // 失败提示由 batchGenerateStoryboard 内部统一弹出
  } finally {
    retrying.value = false;
  }
}

// 导演助理默认宽屏展开，记住用户选择；步骤页里的「请助理起草」也会唤起它
const assistantOpen = ref((() => {
  try {
    const saved = localStorage.getItem("production.assistantDock");
    if (saved !== null) return saved === "1";
  } catch { /* localStorage 不可用时按屏幕宽度决定 */ }
  return window.innerWidth >= 1360;
})());
watch(assistantOpen, (value) => {
  try { localStorage.setItem("production.assistantDock", value ? "1" : "0"); } catch { /* 忽略隐私模式下的写入失败 */ }
});
defineExpose({ selectStep });
function openAssistant() { assistantOpen.value = true; }
onMounted(() => window.addEventListener("production:open-assistant", openAssistant));
onUnmounted(() => window.removeEventListener("production:open-assistant", openAssistant));
</script>

<style lang="scss" scoped>
.stepWorkbench {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--xoi-workspace-bg, #faf8f6);
  overflow: hidden;
}

.stepHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 2px;

  .productionMark {
    color: var(--mainColor, #e9632b);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
    padding-right: 4px;
  }

  // 统一顶栏控件规格：暖白底、暖边框、34px 高，消除控件大小与风格混杂
  :deep(.t-select .t-input) {
    height: 34px;
    border-color: #e8dccf;
    border-radius: 10px;
    background: #fff;
  }
  :deep(.t-select .t-input:hover) { border-color: #f1a27e; }

  :deep(.t-button.outlineBtn) {
    width: 34px;
    height: 34px;
    border: 1px solid #e8dccf;
    border-radius: 10px;
    background: #fff;
    color: #8d7a6c;
    box-shadow: none;
  }
  :deep(.t-button.outlineBtn:hover) {
    border-color: #f1a27e;
    background: #fff4ed;
    color: #e9632b;
  }

  .canvasBtn {
    flex: none;
    margin-left: auto;
    padding: 0 11px;
    height: 34px;
    border: 1px solid #ffdac5;
    border-radius: 9px;
    background: #f5f2ee;
    color: #f47438;
    font-size: 12px;
    font-weight: 600;
    gap: 5px;
    :deep(.t-button__icon) { display: flex; align-items: center; }
  }
  .canvasBtn:hover { background: #ffe7d6; }
}

.stepBar {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 10px 16px 12px;
  border-bottom: 1px solid #ece1d7;
  background: rgba(255, 253, 250, 0.96);
  flex-wrap: wrap;
}

.stepTab {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 12px 6px 8px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  cursor: pointer;
  text-align: left;

  &:hover { background: #f7f5f2; }

  &.active {
    border-color: #e8e0d6;
    background: #f5f2ee;
    box-shadow: none;
  }

  .stepIndex {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: none;
    border-radius: 50%;
    border: 1px solid #e8d9cc;
    background: #fff;
    color: #b09a89;
    font-size: 12px;
    font-weight: 700;

    &.is-done { border-color: #f2b58c; background: #fff3e9; color: #e07a3f; }
    &.is-warn { border-color: #f3b08c; background: #ffefe4; color: #e85c25; }
    &.is-working { border-color: #eccfae; background: #fff8ea; color: #c58a3d; animation: stepPulse 1.6s ease-in-out infinite; }
  }

  .stepCopy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;

    strong { color: #4a423b; font-size: 13px; font-weight: 650; line-height: 1.35; }
    small { color: #a5968a; font-size: 10.5px; line-height: 1.4; white-space: nowrap; }
  }

  &.active .stepCopy strong { color: #d4601f; }
}

@keyframes stepPulse {
  0%, 100% { box-shadow: 0 0 0 0 #f5c89e00; }
  50% { box-shadow: 0 0 0 4px #f5c89e33; }
}

.stepArrow {
  align-self: center;
  width: 22px;
  height: 1px;
  background: #e6d7c9;
  position: relative;
  flex: none;

  &::after {
    content: "";
    position: absolute;
    right: 0;
    top: -2.5px;
    border-left: 5px solid #e6d7c9;
    border-top: 3px solid transparent;
    border-bottom: 3px solid transparent;
  }

  &.passed { background: #f0b48c; &::after { border-left-color: #f0b48c; } }
}

.stepBody {
  flex: 1;
  min-height: 0;
  display: flex;
}

.stepMain {
  flex: 1;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 18px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  :deep(.t-card) { box-shadow:none; border:1px solid #e9e4dd; border-radius:12px; }
}

.scriptReference {
  border: 1px solid #eee3d8;
  border-radius: 12px;
  background: #fffdf9;
  overflow: hidden;

  .referenceToggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 9px 14px;
    border: 0;
    background: transparent;
    color: #a08674;
    font-size: 12px;
    cursor: pointer;

    &:hover { color: #d4601f; background: #fff6ef; }
    .flip { transform: rotate(180deg); }
  }

  .referenceBody {
    max-height: 300px;
    overflow: auto;
    padding: 0 16px 14px;
    border-top: 1px dashed #f0e4d9;
    font-size: 13px;
    line-height: 1.8;
  }
}

.stepSection {
  .sectionHeading {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 6px 2px 10px;

    h4 { margin: 0; color: #4a423b; font-size: 14px; font-weight: 650; }
    small { color: #a5968a; font-size: 11.5px; }
  }
}

.assistantDock {
  flex: none;
  display: flex;
  min-width: 0;
  position: relative;

  &.open { width: min(400px, 34vw); }
}

// 导演助理启动按钮：常规悬浮胶囊按钮（右下角），不再用竖排侧条
.assistantLauncher {
  position: absolute;
  right: 22px;
  bottom: 52px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 11px 18px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #f2803f, #e0641f);
  color: #fff;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(224, 116, 34, 0.35);

  &:hover { transform: translateY(-1px); box-shadow: 0 12px 30px rgba(224, 116, 34, 0.45); }
  &:active { transform: translateY(0); }
}

.stepStatus {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px;
  border-top: 1px solid #ece1d7;
  background: rgba(255, 253, 250, 0.96);
  font-size: 12px;
  color: #8d7f74;
  flex-wrap: wrap;

  .statusMetric {
    white-space: nowrap;
    b { color: #4a423b; font-weight: 650; }
  }

  .statusHint {
    margin-left: auto;
    color: #a5968a;
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 1100px) {
  .stepBar .stepCopy small { display: none; }
  .stepStatus .statusHint { display: none; }
}
</style>
