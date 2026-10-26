<template>
  <div v-if="displayText" class="modelCostHint" :class="{ compact }" role="status" :title="estimate?.note">
    <span class="dot" aria-hidden="true"></span>
    <span>{{ displayText }}</span>
    <span v-if="showFormula && estimate" class="conversion">{{ formatYuan(estimate.yuan) }} × 10 = {{ formatPointsFromYuan(estimate.yuan) }}</span>
    <span v-if="showBasis && estimate && type === 'text'" class="basis">按当前输入 + 预计 {{ outputTokens }} 个输出 Token 估算；上下文与工具调用另计</span>
    <button v-if="loadError" type="button" class="retry" @click="load">重试</button>
    <span v-if="estimate?.referenceVideoAdjustment" class="referenceFee">参考视频 ×{{ estimate.referenceVideoAdjustment.multiplier.toLocaleString('zh-CN', { maximumFractionDigits: 3 }) }} · 已计入</span>
    <span class="note">最终按实际用量结算</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import axios from "@/utils/axios";
import { formatPointsFromYuan, formatYuan, isValidYuan } from "@/utils/points";
import { pricingFailure, queryPricing } from "@/utils/pricingRequest";
const props = withDefaults(defineProps<{
  model?: string; type?: "text" | "image" | "video" | "audio";
  inputLength?: number; outputTokens?: number; duration?: number; compact?: boolean;
  resolution?: string; quality?: string; count?: number; input?: string;
  hasReferenceVideo?: boolean;
  showFormula?: boolean; showBasis?: boolean;
}>(), { type: "text", inputLength: 0, outputTokens: 800, duration: 5, compact: false, count: 1 });
const estimate = ref<{ yuan: number; points: number; note: string; referenceVideoAdjustment?: { multiplier: number } | null } | null>(null);
const loadError = ref("");
const loading = ref(false);
let controller: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let version = 0;
const displayText = computed(() => estimate.value
  ? `预计 ${formatPointsFromYuan(estimate.value.yuan)}（${formatYuan(estimate.value.yuan)}）`
  : props.model ? loadError.value || (loading.value ? "正在估算积分…" : "") : "");
async function load() {
  const ticket = ++version;
  controller?.abort();
  const requestController = new AbortController();
  controller = requestController;
  estimate.value = null;
  loadError.value = "";
  loading.value = !!props.model;
  if (!props.model) return;
  try {
    const model = props.model.replace(/^newapi:/, "");
    const body = { model, params: {
      inputLength: props.inputLength, outputTokens: props.outputTokens, seconds: props.duration,
      resolution: props.resolution, quality: props.quality, n: props.count, input: props.input,
      hasReferenceVideo: props.hasReferenceVideo === true,
    } };
    const response = await queryPricing(signal => axios.post("/model-catalog/quote", body, { signal }), requestController.signal);
    if (!isValidYuan(response.data?.yuan)) throw new Error("暂无可靠报价，请重试");
    if (ticket === version) estimate.value = response.data;
  } catch (error) { if (ticket === version && !requestController.signal.aborted) loadError.value = pricingFailure(error).message; }
  finally { if (ticket === version) loading.value = false; }
}
function schedule() { version++; controller?.abort(); estimate.value = null; loadError.value = ""; loading.value = !!props.model; clearTimeout(timer); timer = setTimeout(load, 300); }
function resume() { if (loadError.value && document.visibilityState === "visible") void load(); }
onMounted(() => { void load(); window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume); });
watch(() => [props.model, props.type, props.inputLength, props.outputTokens, props.duration, props.resolution, props.quality, props.count, props.input, props.hasReferenceVideo], schedule);
onUnmounted(() => { version++; controller?.abort(); clearTimeout(timer); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); });
</script>

<style scoped>
.modelCostHint { display:inline-flex; align-items:center; gap:6px; min-width:0; color:#756d78; font-size:11px; line-height:1.4; }
.modelCostHint .dot { width:6px; height:6px; flex:none; border-radius:50%; background:#ed873a; box-shadow:0 0 0 3px rgba(237,135,58,.12); }
.modelCostHint strong { color:#c45d2b; }
.modelCostHint .note { color:#aaa3aa; }
.modelCostHint .referenceFee { padding:2px 6px; border-radius:5px; color:#a65f30; background:#fff4e8; font-size:10px; }
.modelCostHint.compact { gap:5px; font-size:10px; }
.modelCostHint.compact .note { display:none; }
.modelCostHint .retry { border:0; background:none; color:#c45d2b; font:inherit; text-decoration:underline; cursor:pointer; padding:2px; flex:none; }
.modelCostHint .conversion,.modelCostHint .basis{flex-basis:100%;color:#8a817a;font-size:11px;line-height:1.6}
.modelCostHint:has(.conversion),.modelCostHint:has(.basis){flex-wrap:wrap}
</style>
