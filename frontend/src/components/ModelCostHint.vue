<template>
  <div v-if="displayText" class="modelCostHint" :class="{ compact }" role="status">
    <span class="dot" aria-hidden="true"></span>
    <span>{{ displayText }}</span>
    <span class="note">最终按实际用量结算</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

interface PricingRow {
  model_name: string;
  model_ratio?: number;
  model_price?: number;
  billing_expr?: string;
}

const props = withDefaults(
  defineProps<{
    model?: string;
    type?: "text" | "image" | "video" | "audio";
    inputLength?: number;
    outputTokens?: number;
    duration?: number;
    compact?: boolean;
  }>(),
  { type: "text", inputLength: 0, outputTokens: 800, duration: 1, compact: false },
);

const rows = ref<PricingRow[]>([]);
const loaded = ref(false);
const row = computed(() => {
  const model = String(props.model || "").trim().toLowerCase();
  return rows.value.find((item) => {
    const name = String(item.model_name || "").trim().toLowerCase();
    return name === model || name.split(/:(.+)/)[1] === model;
  });
});

function yuan(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  const digits = value >= 1 ? 2 : 4;
  return `¥${value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function rate(item: PricingRow) {
  const expr = item.billing_expr || "";
  const floor = /u\("seconds"\)\s*<\s*[\d.]+\s*\?\s*[\d.]+\s*:\s*u\("seconds"\)\s*\*\s*([\d.]+)/.exec(expr);
  const tier = /tier\("(?:default|flat|[^"]+)",\s*(?:u\("seconds"\)\s*\*\s*)?([\d.]+)/.exec(expr);
  const perChar = /tier\("[^"]+",\s*p\s*\*\s*([\d.]+)/.exec(expr);
  if (floor) return { value: Number(floor[1]), unit: "second" };
  if (perChar) return { value: Number(perChar[1]) / 1e6 * 1000, unit: "thousandChars" };
  if (tier) return { value: expr.includes("param(") || /tier\("flat"/.test(expr) ? Number(tier[1]) / 1e6 : Number(tier[1]), unit: props.type === "video" ? "second" : "request" };
  if (Number(item.model_price) > 0) return { value: Number(item.model_price), unit: props.type === "video" ? "second" : "request" };
  if (Number(item.model_ratio) > 0) return { value: Number(item.model_ratio) * 2, unit: "millionTokens" };
  return null;
}

const displayText = computed(() => {
  if (!row.value) return "";
  const item = rate(row.value);
  if (!item || !item.value) return "";
  if (item.unit === "second") return `预计 ${yuan(item.value * Math.max(1, Number(props.duration) || 1))}（${Math.max(1, Number(props.duration) || 1)} 秒）`;
  if (item.unit === "request") return `预计 ${yuan(item.value)} / 次`;
  if (item.unit === "thousandChars") return `预计 ${yuan(item.value)} / 千字`;
  const tokens = Math.max(1, Math.ceil((Number(props.inputLength) || 0) / 4) + (Number(props.outputTokens) || 0));
  const estimate = item.value * tokens / 1_000_000;
  return `预计 ${yuan(estimate)} 起 · ${yuan(item.value)} / 1M tokens`;
});

async function load() {
  if (loaded.value) return;
  loaded.value = true;
  try {
    const response = await fetch("/api/pricing", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    rows.value = Array.isArray(body?.data) ? body.data : [];
  } catch {
    // 价格服务不可用时不阻塞主流程；真实扣费仍由 NewAPI 结算。
  }
}

onMounted(load);
watch(() => props.model, load);
</script>

<style scoped>
.modelCostHint { display:inline-flex; align-items:center; gap:6px; min-width:0; color:#756d78; font-size:11px; line-height:1.4; }
.modelCostHint .dot { width:6px; height:6px; flex:none; border-radius:50%; background:#ed873a; box-shadow:0 0 0 3px rgba(237,135,58,.12); }
.modelCostHint strong { color:#c45d2b; }
.modelCostHint .note { color:#aaa3aa; }
.modelCostHint.compact { gap:5px; font-size:10px; }
.modelCostHint.compact .note { display:none; }
</style>
