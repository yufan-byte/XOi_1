<template>
  <nav v-if="pageCount > 1" class="xoiPager" aria-label="分页">
    <span class="pagerMeta">共 {{ total }} {{ unit }} · 第 {{ safePage }} / {{ pageCount }} 页</span>
    <div class="pagerBtns">
      <button type="button" class="pagerBtn nav" :disabled="safePage <= 1" @click="go(safePage - 1)">上一页</button>
      <template v-for="(item, index) in windowItems" :key="`${item}-${index}`">
        <span v-if="item === 'gap'" class="pagerGap" aria-hidden="true">…</span>
        <button v-else type="button" class="pagerBtn" :class="{ active: item === safePage }" :aria-current="item === safePage ? 'page' : undefined" @click="go(item as number)">{{ item }}</button>
      </template>
      <button type="button" class="pagerBtn nav" :disabled="safePage >= pageCount" @click="go(safePage + 1)">下一页</button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * 主站通用分页条：列表一页放得下时不渲染，超过一页显示页码 + 总数。
 * 页码序列会折叠中间段（1 … 4 5 6 … 12），长列表不会把页脚撑爆。
 */
const props = withDefaults(defineProps<{
  page: number;
  total: number;
  pageSize?: number;
  unit?: string;
}>(), { pageSize: 12, unit: "项" });

const emit = defineEmits<{ (event: "update:page", value: number): void }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));
const safePage = computed(() => Math.min(Math.max(1, props.page), pageCount.value));
const windowItems = computed<Array<number | "gap">>(() => {
  const total = pageCount.value;
  const current = safePage.value;
  const picked = Array.from(new Set([1, total, current - 1, current, current + 1]))
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  picked.forEach((n, index) => {
    if (index > 0 && n - (picked[index - 1] as number) > 1) out.push("gap");
    out.push(n);
  });
  return out;
});

function go(next: number) {
  if (next < 1 || next > pageCount.value || next === safePage.value) return;
  emit("update:page", next);
}
</script>

<style scoped>
.xoiPager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid rgba(28, 25, 23, 0.07);
}
.pagerMeta { font-size: 12.5px; color: #8b8078; }
.pagerBtns { display: flex; align-items: center; gap: 6px; }
.pagerBtn {
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid rgba(28, 25, 23, 0.1);
  background: #fff;
  color: #5c5148;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.pagerBtn:hover:not(:disabled) { border-color: rgba(245, 116, 0, 0.4); color: #f57400; background: #fffaf5; }
.pagerBtn:disabled { opacity: 0.4; cursor: not-allowed; }
.pagerBtn.active { border-color: rgba(245, 116, 0, 0.5); background: rgba(245, 116, 0, 0.1); color: #f57400; }
.pagerBtn.nav { min-width: 62px; }
.pagerGap { padding: 0 2px; color: #a89e93; font-size: 12px; }
</style>
