<template>
  <!-- 小浮层只占左下角，滚动区为它预留局部空间，不挤压整个工作区。 -->
  <Teleport defer to="#pipeline-dock">
  <div ref="barRef" class="pipelineNextBar" :class="{ collapsed }" v-if="currentStep">
    <button v-if="collapsed" type="button" class="pnbToggle" aria-label="展开流程提示" :aria-expanded="false" @click="toggleCollapsed"><span class="pnbBadge">{{ current === 'scriptAgent' ? '可选环节' : `第 ${stepNo} / ${stepTotal} 步` }}</span><span class="pnbStep">{{ currentStep.label }}</span><span class="pnbExpand">›</span></button>
    <template v-else>
    <div class="pnbLeft">
      <span class="pnbBadge">{{ current === 'scriptAgent' ? '可选环节' : `第 ${stepNo} / ${stepTotal} 步` }}</span>
      <span class="pnbStep">{{ currentStep.label }}</span>
      <span v-if="status" class="pnbStatus" :class="`tone-${statusTone}`">
        <i class="pnbDot"></i>{{ status }}
      </span>
    </div>
    <div class="pnbRight">
      <slot name="secondary"></slot>
      <button type="button" class="pnbCollapse" aria-label="收起流程提示" :aria-expanded="true" @click="toggleCollapsed">⌄</button>
      <t-button
        v-if="nextStep"
        class="pnbMain"
        theme="primary"
        :loading="pending"
        :disabled="disabled"
        @pointerenter="warmNext" @focus="warmNext" @touchstart.passive="warmNext"
        @click="handleNext">
        <template v-if="disabled && disabledHint">
          {{ disabledHint }}
        </template>
        <template v-else>
          {{ nextLabel || `下一步：${nextStep.label}` }}
          <span class="pnbArrow">→</span>
        </template>
      </t-button>
      <span v-else class="pnbDone"><i class="pnbDot"></i>已是最后一步</span>
    </div>
    </template>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { warmPage } from "@/router/pageLoading";
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import projectStore from "@/stores/project";
import { getNextStep, getStep, getStepNo, getStepTotal, type PipelineStepId } from "./pipelineSteps";

const props = withDefaults(
  defineProps<{
    /** 当前所在站点 */
    current: PipelineStepId;
    /** 左侧状态文案，如「12 个剧本 · 已提取 8 个」 */
    status?: string;
    statusTone?: "ok" | "warn" | "idle";
    /** 覆盖默认按钮文案 */
    nextLabel?: string;
    /** 覆盖默认下一站（用于跳过可选站，如从导入素材直达剧本整理） */
    nextTo?: { path: string; query?: Record<string, any> };
    /** 返回 false 可阻止跳转（用于「先提取资产，再前往」） */
    beforeNext?: () => boolean | Promise<boolean>;
    /** 暂不可前往（如终站前置未满足） */
    disabled?: boolean;
    /** disabled 时按钮上显示的提示文案 */
    disabledHint?: string;
  }>(),
  { statusTone: "idle" },
);

const emit = defineEmits<{ (e: "next", target: { path: string; query?: Record<string, any> }): void }>();

const router = useRouter();
const route = useRoute();
const { project } = storeToRefs(projectStore());

const projectType = computed(() => project.value?.projectType);
const currentStep = computed(() => getStep(props.current));
const stepNo = computed(() => getStepNo(props.current, projectType.value));
const stepTotal = computed(() => getStepTotal(projectType.value));
const nextStep = computed(() => getNextStep(props.current, projectType.value));

const pending = ref(false);
const barRef = ref<HTMLElement>();
let workspace: HTMLElement | null = null;
onMounted(() => {
  workspace = barRef.value?.closest<HTMLElement>(".view") ?? null;
  // 固定预留高度，而不是实时测量浮层高度：
  // 之前折叠/展开会改变这个值 → 页面 padding 变化 → 内容上下跳（"光标过去/点确认就跑"）。
  workspace?.style.setProperty("--pipeline-hint-space", "104px");
});
onUnmounted(() => { workspace?.style.removeProperty("--pipeline-hint-space"); });
const collapsed = ref((() => { try { return sessionStorage.getItem("xoi_pipeline_hint_expanded") !== "1"; } catch { return true; } })());
function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  try { sessionStorage.setItem("xoi_pipeline_hint_expanded", collapsed.value ? "0" : "1"); } catch {}
}

function warmNext() {
  if (!props.disabled) void warmPage(props.nextTo?.path ?? nextStep.value?.path ?? "");
}
let warmTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => [props.disabled, props.nextTo?.path, nextStep.value?.path], () => {
  clearTimeout(warmTimer);
  warmTimer = setTimeout(warmNext, 1200);
}, { immediate: true });
onUnmounted(() => clearTimeout(warmTimer));

async function handleNext() {
  if (props.disabled || pending.value) return;
  const target = props.nextTo ?? (nextStep.value ? { path: nextStep.value.path } : null);
  if (!target) return;
  pending.value = true;
  try {
    if (props.beforeNext && await props.beforeNext() === false) return;
    emit("next", target);
    await router.push({ path: target.path, query: { ...target.query, ...(project.value?.id ? { projectId: String(project.value.id) } : {}), ...(route.query.episode ? { episode: route.query.episode } : {}) } });
  } finally { pending.value = false; }
}

</script>

<style scoped>
.pipelineNextBar {
  position: relative;
  flex: none;
  order: 2;
  box-sizing: border-box;
  width: fit-content;
  min-width: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: min(560px, 100%);
  margin-top: 0;
  flex-wrap: wrap;
  justify-content: space-between;
  padding: 11px 14px 11px 18px;
  border: 1px solid rgba(103, 94, 143, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);

  box-shadow: 0 14px 40px rgba(42, 39, 58, 0.14);
}

.pipelineNextBar.collapsed { padding: 0; border-radius: 13px; gap: 0; box-shadow: 0 4px 14px rgba(42,39,58,.06); }
.pnbToggle { display:flex; align-items:center; gap:10px; padding:10px 12px; border:0; border-radius:13px; background:transparent; cursor:pointer; }
.pnbExpand { color:#9a8b83; font-size:19px; line-height:1; }
.pnbCollapse { display:grid; place-items:center; width:26px; height:26px; border:0; border-radius:7px; background:#f5f3f0; color:#887e74; cursor:pointer; }
.pnbToggle:focus-visible,.pnbCollapse:focus-visible { outline:2px solid #f26432; outline-offset:2px; }
.pnbLeft {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pnbBadge {
  flex: none;
  padding: 4px 9px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 136, 71, 0.14), rgba(242, 100, 50, 0.1));
  color: #df5f29;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.pnbStep {
  color: #292733;
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
}

.pnbStatus {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  color: #8d8796;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pnbDot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.75;
}

.pnbStatus.tone-ok {
  color: #bd8055;
}

.pnbStatus.tone-warn {
  color: #d98b1f;
}

.pnbRight {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  margin-left: auto;
}

.pnbArrow {
  margin-left: 4px;
}

.pnbDone {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 4px;
  color: #bd8055;
  font-size: 12px;
}

.pipelineNextBar :deep(.pnbMain.t-button--theme-primary:not(:disabled)) {
  border-color: transparent;
  background: linear-gradient(135deg, #ff8847, #f26432);
  box-shadow: 0 7px 16px rgba(239, 100, 48, 0.18);
}

.pipelineNextBar :deep(.pnbMain.t-button--theme-primary:not(:disabled) .t-button__text) {
  color: #fff;
}

@media (max-width: 720px) {
  .pipelineNextBar {
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 12px;
  }

  .pnbStatus {
    display: none;
  }
  .pnbRight { margin-left: auto; max-width: 100%; }
  .pnbMain { max-width: 100%; }
}
</style>
