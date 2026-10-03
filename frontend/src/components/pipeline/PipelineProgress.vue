<template>
  <!-- 流水线进度带：把「项目卡在第几步」画出来。
       5 段按数据维度（素材/剧本/角色场景/分镜/成片），数据来自后端 getProject 的 progress 聚合。
       灰=未开始 / 半橙=进行中 / 实橙=已完成。 -->
  <div class="pipelineProgress" :class="[`size-${size}`, { 'is-compact': compact }]">
    <div v-for="seg in segments" :key="seg.id" class="ppSeg" :class="`state-${stateOf(seg.id)}`" :title="seg.hint">
      <span class="ppDot"></span>
      <span class="ppLabel">{{ seg.label }}</span>
      <span v-if="!compact" class="ppCount">{{ countText(seg.id) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { PROGRESS_SEGMENTS, type ProgressCounter, type ProgressSegmentId } from "./pipelineSteps";

const props = withDefaults(
  defineProps<{
    /** 后端 getProject 返回的进度聚合；缺段按「未开始」渲染 */
    progress?: Partial<Record<ProgressSegmentId, ProgressCounter>> | null;
    /** compact：只留圆点 + 名称（用于项目卡小尺寸） */
    compact?: boolean;
    size?: "sm" | "md";
    /** 剧本创作型项目没有「素材」这一段，传进来就自动隐藏 */
    projectType?: string | null;
  }>(),
  { size: "md", compact: false, progress: null, projectType: null },
);

const segments = computed(() => (props.projectType === "script" ? PROGRESS_SEGMENTS.filter((seg) => seg.id !== "material") : PROGRESS_SEGMENTS));

type SegState = "idle" | "doing" | "done";

function counterOf(id: ProgressSegmentId): ProgressCounter | undefined {
  const c = props.progress?.[id];
  if (!c || typeof c.done !== "number") return undefined;
  return { done: c.done, total: typeof c.total === "number" ? c.total : 0 };
}

function stateOf(id: ProgressSegmentId): SegState {
  const c = counterOf(id);
  if (!c || c.done <= 0) return "idle";
  if (c.total > c.done) return "doing";
  return "done";
}

function countText(id: ProgressSegmentId): string {
  const c = counterOf(id);
  if (!c || c.done <= 0) return "未开始";
  return `${c.done}/${c.total}`;
}
</script>

<style scoped>
.pipelineProgress {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ppSeg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border: 1px solid rgba(120, 102, 82, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #8a847a;
  font-size: 12px;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}

.ppDot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #d9d3ca;
}

.ppLabel {
  font-weight: 600;
}

.ppCount {
  color: #a29a90;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* 进行中 */
.ppSeg.state-doing {
  border-color: rgba(255, 136, 71, 0.3);
  background: linear-gradient(135deg, rgba(255, 136, 71, 0.1), rgba(242, 100, 50, 0.06));
  color: #c25a22;
}

.ppSeg.state-doing .ppDot {
  background: linear-gradient(135deg, #ff9b61, #f26432);
}

.ppSeg.state-doing .ppCount {
  color: #c9773f;
}

/* 已完成 */
.ppSeg.state-done {
  border-color: rgba(43, 164, 113, 0.28);
  background: rgba(43, 164, 113, 0.08);
  color: #24835b;
}

.ppSeg.state-done .ppDot {
  background: #2ba471;
}

.ppSeg.state-done .ppCount {
  color: #3e9a74;
}

/* 项目卡里的紧凑形态：更小的胶囊、无数字 */
.pipelineProgress.is-compact {
  gap: 5px;
}

.pipelineProgress.is-compact .ppSeg {
  gap: 4px;
  padding: 3px 8px;
  font-size: 11px;
}

.pipelineProgress.is-compact .ppDot {
  width: 6px;
  height: 6px;
}

.pipelineProgress.size-sm .ppSeg {
  padding: 4px 9px;
  font-size: 11px;
}
</style>
