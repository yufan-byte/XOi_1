<template>
  <div class="studioParameters" aria-label="视频生成参数">
    <label class="parameterPill parameterModel">
      <span>模型</span>
      <modelSelect v-model="modelParmas.model" type="video" size="small" :show-price-hint="false" />
    </label>
    <label class="parameterPill">
      <span>清晰度</span>
      <select v-model="modelParmas.resolution" @change="normalizeDuration">
        <option v-for="r in resolutions" :key="r" :value="r">{{ r }}</option>
      </select>
    </label>
    <label class="parameterPill">
      <span>时长</span>
      <select :value="modelParmas.duration" @change="updateDuration(Number(($event.target as HTMLSelectElement).value))">
        <option v-for="d in durations" :key="d" :value="d">{{ d }} 秒</option>
      </select>
    </label>
    <button
      v-if="modeOptions.audio"
      type="button"
      class="parameterAudio"
      :disabled="modeOptions.audio !== 'optional'"
      :aria-pressed="modelParmas.audio"
      @click="modelParmas.audio = !modelParmas.audio">
      <i-volume-notice v-if="modelParmas.audio" size="15" />
      <i-volume-mute v-else size="15" />
      {{ modelParmas.audio ? "声音开" : "声音关" }}
    </button>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import "@/views/production/components/workbench/type/type";
import axios from "@/utils/axios";
const props = defineProps<{ modeOptions: VideoModel; trackId?: number }>();
const modelParmas = defineModel<ModelSetting>({ required: true });
const emit = defineEmits<{ "duration-change": [id: number, duration: number] }>();
const resolutions = computed(() =>
  [...new Set(props.modeOptions.durationResolutionMap.flatMap((row) => row.resolution || []))].length
    ? [...new Set(props.modeOptions.durationResolutionMap.flatMap((row) => row.resolution || []))]
    : [modelParmas.value.resolution],
);
const durations = computed(() => {
  const rows = props.modeOptions.durationResolutionMap.filter(
    (row) => !row.resolution?.length || row.resolution.includes(modelParmas.value.resolution),
  );
  const values = [...new Set(rows.flatMap((row) => row.duration || []))].sort((a, b) => a - b);
  return values.length ? values : [modelParmas.value.duration];
});
function updateDuration(duration: number) {
  const trackId = props.trackId;
  modelParmas.value.duration = duration;
  if (trackId)
    void axios
      .post("/production/workbench/updateVideoDuration", { id: trackId, duration })
      .then(() => emit("duration-change", trackId, duration))
      .catch(() => window.$message.error("时长保存失败，请重试"));
}
function normalizeDuration() {
  if (!durations.value.includes(modelParmas.value.duration))
    updateDuration(durations.value.reduce((a, b) => (Math.abs(b - modelParmas.value.duration) < Math.abs(a - modelParmas.value.duration) ? b : a)));
}
</script>
<style scoped lang="scss">
.studioParameters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 2px;
}
.studioParameters > label {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}
.parameterPill,
.parameterAudio {
  min-height: 34px;
  box-sizing: border-box;
  padding: 2px 9px;
  border: 1px solid var(--studio-line);
  border-radius: 999px;
  background: var(--studio-bg);
}
.studioParameters > label > span {
  font-size: 11px;
  color: var(--studio-muted);
  white-space: nowrap;
}
.parameterModel :deep(.modelSelectField) {
  width: 185px;
  max-width: 100%;
}
.parameterModel :deep(.modelSelectControl) {
  height: 28px !important;
  min-height: 28px !important;
  padding: 0 4px !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: transparent !important;
  color: var(--studio-text) !important;
  box-shadow: none !important;
  font-size: 12px !important;
}
.studioParameters select {
  max-width: 200px;
  height: 28px;
  min-width: 58px;
  box-sizing: border-box;
  padding: 2px 3px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  font-size: 12px;
}
.parameterAudio {
  display: flex;
  gap: 5px;
  align-items: center;
  height: 34px;
  padding: 3px 11px;
  color: var(--studio-muted);
  font-size: 11px;
  cursor: pointer;
}
.parameterAudio:disabled {
  cursor: default;
}
.parameterAudio[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--studio-accent) 35%, var(--studio-line));
  color: var(--studio-accent);
}
@media (max-width: 1000px) {
  .studioParameters {
    gap: 9px;
  }
  .parameterModel :deep(.modelSelectField) {
    width: 165px;
  }
}
@media (max-width: 760px) {
  .studioParameters select {
    font-size: 13px;
  }
  .parameterModel :deep(.modelSelectField) {
    width: 175px;
  }
}
</style>
