<template>
  <!-- 流水线「下一步」吸底条：把「做完这步要回侧栏找下一步」变成一次点击。
       固定左下角（右下角留给角景的交付托盘），浅色玻璃卡，与工作台其它浮层同风格。 -->
  <div class="pipelineNextBar" v-if="currentStep">
    <div class="pnbLeft">
      <span class="pnbBadge">第 {{ stepNo }} / {{ stepTotal }} 步</span>
      <span class="pnbStep">{{ currentStep.label }}</span>
      <span v-if="status" class="pnbStatus" :class="`tone-${statusTone}`">
        <i class="pnbDot"></i>{{ status }}
      </span>
    </div>
    <div class="pnbRight">
      <slot name="secondary"></slot>
      <t-button
        v-if="nextStep"
        class="pnbMain"
        theme="primary"
        :loading="pending"
        :disabled="disabled"
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
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
const { project } = storeToRefs(projectStore());

const projectType = computed(() => project.value?.projectType);
const currentStep = computed(() => getStep(props.current));
const stepNo = computed(() => getStepNo(props.current, projectType.value));
const stepTotal = computed(() => getStepTotal(projectType.value));
const nextStep = computed(() => getNextStep(props.current, projectType.value));

const pending = ref(false);

async function handleNext() {
  if (props.disabled || pending.value) return;
  const target = props.nextTo ?? (nextStep.value ? { path: nextStep.value.path } : null);
  if (!target) return;

  if (props.beforeNext) {
    pending.value = true;
    try {
      const ok = await props.beforeNext();
      if (!ok) return;
    } finally {
      pending.value = false;
    }
  }
  emit("next", target);
  router.push(target);
}
</script>

<style scoped>
.pipelineNextBar {
  position: fixed;
  left: 24px;
  bottom: 24px;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: calc(100vw - 48px);
  padding: 11px 14px 11px 18px;
  border: 1px solid rgba(103, 94, 143, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 14px 40px rgba(42, 39, 58, 0.14);
}

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
  color: #2ba471;
}

.pnbStatus.tone-warn {
  color: #d98b1f;
}

.pnbRight {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.pnbArrow {
  margin-left: 4px;
}

.pnbDone {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 4px;
  color: #2ba471;
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
    left: 12px;
    right: 12px;
    bottom: 12px;
    max-width: none;
    gap: 10px;
  }

  .pnbStatus {
    display: none;
  }
}
</style>
