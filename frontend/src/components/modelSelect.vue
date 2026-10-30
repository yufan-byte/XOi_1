<template>
  <div ref="fieldElement" class="modelSelectField">
    <button
      ref="triggerElement"
      type="button"
      class="modelSelectControl"
      :class="[props.size, { opened: popupVisible, rich: props.showLogo }]"
      role="combobox"
      :aria-expanded="popupVisible"
      :aria-controls="listId"
      aria-haspopup="listbox"
      @click="onPopupVisibleChange(!popupVisible)"
      @keydown.down.prevent="onPopupVisibleChange(true)">
      <span v-if="props.showLogo" class="modelControlBrand" aria-hidden="true">
        <img v-if="selectedLogo" :src="selectedLogo" alt="" />
        <span v-else>{{ getFallbackText(selectedModel?.label || selectValueLabel || selectValue) }}</span>
      </span>
      <span class="modelControlCopy" :class="{ placeholder: !selectedModel && !selectValue }">
        <strong>
          {{
            selectedModel?.label ||
            (selectValue ? selectValueLabel || selectValue.replace(/^newapi:/, "") : props.placeholder || $t("components.modelSelect.placeholder"))
          }}
        </strong>
        <small v-if="props.showChannel && selectedModel">{{ channelText(selectedModel) }}</small>
      </span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <Teleport to="body">
      <section
        v-if="popupVisible"
        ref="popupElement"
        class="xoi-model-panel"
        :class="{ 'canvas-compact': props.compact }"
        :style="popupStyle"
        :aria-label="pickerTitle"
        @keydown.esc.stop.prevent="closePicker()"
        @wheel.stop
        @pointerdown.stop>
        <header class="modelPanelHeader">
          <div class="modelPickerHeading">
            <span class="modelPickerGlyph" aria-hidden="true">✦</span>
            <span>
              <strong>{{ pickerTitle }}</strong>
              <small>按用途选模型，并查看真实渠道与基础单价</small>
            </span>
            <button type="button" class="modelPanelClose" aria-label="关闭模型选择" @click="closePicker()">×</button>
          </div>
          <div class="modelCatalogTools" @mousedown.stop>
            <div class="modelCatalogTabs">
              <button
                type="button"
                :aria-pressed="!showAll"
                :class="{ active: !showAll }"
                @click="
                  showAll = false;
                  query = '';
                ">
                为你推荐
              </button>
              <button type="button" :aria-pressed="showAll" :class="{ active: showAll }" @click="showAll = true">
                全部模型
                <span>{{ (loading || loadError) && !catalog.length ? "—" : catalog.length }}</span>
              </button>
            </div>
            <div class="modelCatalogSearch">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                ref="searchInput"
                v-model="query"
                aria-label="搜索模型"
                placeholder="搜索模型或系列，如即梦、GPT…"
                @keydown.stop="searchKeydown" />
              <button
                v-if="query"
                type="button"
                aria-label="清除搜索"
                @click="
                  query = '';
                  searchInput?.focus();
                ">
                ×
              </button>
            </div>
            <div v-if="props.type === 'video' && showAll" class="modelBillingFilters">
              <button
                v-for="filter in billingFilters"
                :key="filter.value"
                type="button"
                :aria-pressed="billingFilter === filter.value"
                :class="{ active: billingFilter === filter.value }"
                @click="billingFilter = filter.value">
                {{ filter.label }}
              </button>
            </div>
            <small v-if="loading && catalog.length" role="status">正在更新价格，可继续查看已有目录…</small>
            <small v-else-if="loadError" role="status">
              {{ loadError }}
              <button type="button" class="modelPriceRetry" @click="handleModelChange(true)">重试</button>
            </small>
          </div>
        </header>
        <div ref="listElement" :id="listId" class="modelPanelList" role="listbox" aria-label="可选模型">
          <section v-for="(list, index) in optionsData" :key="index" class="modelPanelGroup" role="group" :aria-label="list.group">
            <h3>{{ list.group }}</h3>
            <button
              v-for="item in list.children"
              :key="`${item.id}:${item.value}`"
              :id="`${listId}-${item.id}:${item.value}`"
              type="button"
              class="modelPanelOption"
              role="option"
              :aria-selected="`${item.id}:${item.value}` === selectValue"
              :class="{ modelKeyboardActive: `${item.id}:${item.value}` === activeKey }"
              :data-model-key="`${item.id}:${item.value}`"
              @click="chooseModel(item)">
              <div class="optionItem">
                <div class="optionHeading">
                  <div class="optionMain">
                    <span class="optionBrand" aria-hidden="true">
                      <img v-if="getProviderLogoByModel(item)" :src="getProviderLogoByModel(item)!" alt="" />
                      <span v-else>{{ getFallbackText(item.label) }}</span>
                    </span>
                    <div class="optionTitleBlock">
                      <div class="optionLabel">{{ item.label }}</div>
                      <div class="optionChannelLine">
                        <span>{{ providerText(item) }}</span>
                        <span>{{ billingText(item) }}</span>
                        <span v-if="isDedicatedLine(item)">XOi 专线</span>
                      </div>
                    </div>
                  </div>
                  <div class="optionBadges">
                    <span v-if="item.recommended" class="optionType">★ {{ item.recommendation || "推荐" }}</span>
                    <span v-if="`${item.id}:${item.value}` === selectValue" class="optionSelected">✓ 当前</span>
                  </div>
                </div>
                <div class="optionDescription">
                  {{ item.description || item.series }}
                  <span v-if="item.referenceLatencySeconds">· 上游参考约 {{ item.referenceLatencySeconds }} 秒</span>
                </div>
                <div v-if="item.rates?.length" class="optionRates">
                  <span v-for="rate in item.rates" :key="rate.resolution">
                    <small>{{ rate.resolution }}</small>
                    <strong>
                      {{ formatPointsFromYuan(rate.yuan, "") }}
                      <em>积分/{{ rate.unit }}</em>
                    </strong>
                    <span>= ¥{{ yuanText(rate.yuan) }}/{{ rate.unit }}</span>
                  </span>
                </div>
                <div v-else class="optionPrice" :title="item.displayPrice">{{ item.displayPrice }}</div>
                <div v-if="videoExample(item)" class="optionExample">{{ videoExample(item) }}</div>
                <div v-if="item.referenceVideoMultiplier" class="optionBillingNote">
                  以上为基础单价 · 添加参考视频 ×{{ numberText(item.referenceVideoMultiplier) }}
                </div>
              </div>
            </button>
          </section>
          <!-- 无可用模型：模型统一由 new-api 网关接管，主站不再提供本地配置入口 -->
          <div v-if="!visibleCount && !loadError">
            <div class="emptyActionWrap">
              <span class="emptyActionButton">{{ loadError || (query ? "没有匹配的模型" : loading ? "正在加载模型…" : emptyReason) }}</span>
            </div>
          </div>
        </div>
        <footer class="modelCatalogFooter">
          <span>{{ props.type === "video" ? "单价 ≠ 整段费用 · 选定规格后查看预计消耗" : "选定规格后查看本次预计消耗" }}</span>
          <span>{{ loadError && !catalog.length ? "等待价格服务" : `${visibleCount} 个可选` }}</span>
        </footer>
      </section>
    </Teleport>
    <div v-if="props.showPriceHint && selectedPriceText" class="modelCostHint" role="status">
      <span class="modelCostCopy">
        <strong :title="selectedPriceText">{{ selectedPriceText }}</strong>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { providersLogo, modelProviderRules, oneStopProviderLogoFor } from "@/utils/providersLogo";
import axios from "@/utils/axios";
import { useId, onBeforeUnmount } from "vue";
import { modelPickerLayout } from "@/utils/modelPickerLayout";
import { formatPointsFromYuan, formatCatalogPrice } from "@/utils/points";
import { pricingFailure } from "@/utils/pricingRequest";
import { modelCatalog } from "@/utils/modelCatalog";
import { canUnderstandImages, canUseReferenceImages } from "@/utils/modelCapabilities";
interface VendorChild {
  id: string;
  label: string;
  value: string;
  type: string;
  series: string;
  provider?: string;
  route?: string;
  displayPrice: string;
  recommended: boolean;
  recommendation?: string;
  description?: string;
  referenceLatencySeconds?: number;
  rates?: { resolution: string; yuan: number; points: number; unit: string }[];
  referenceVideoMultiplier?: number;
  billingUnit?: string;
  capabilities?: string[];
  mode?: string[];
  referenceLimits?: { images?: number };
  paramSchema?: Record<string, any>;
}
interface VendorOption {
  group: string;
  id: string;
  children: VendorChild[];
}
const selectValue = defineModel({ type: String, default: "" });
const selectValueLabel = defineModel<string>("label", { default: "" });
const props = defineProps({
  type: { type: String as () => "text" | "image" | "all" | "video" | "audio", default: "all" },
  size: { type: String as () => "small" | "medium" | "large", default: "medium" },
  placeholder: { type: String },
  changeConfig: { type: Boolean, default: false },
  showPriceHint: { type: Boolean, default: true },
  showLogo: { type: Boolean, default: false },
  showChannel: { type: Boolean, default: false },
  capability: { type: String as () => "vision" | "reference" | "", default: "" },
  referenceCount: { type: Number, default: 1 },
  compact: { type: Boolean, default: false },
});
const DEFAULT_TEXT_MODEL = "newapi:deepseek-v4-flash";
const DEFAULT_TEXT_MODEL_LABEL = "DeepSeek V4 Flash";
let preferDeepSeek = props.type === "text" && (!selectValue.value || /agnes/i.test(selectValue.value));
if (preferDeepSeek) {
  selectValue.value = DEFAULT_TEXT_MODEL;
  selectValueLabel.value = DEFAULT_TEXT_MODEL_LABEL;
}
const emit = defineEmits<{ change: [value: string, data?: any] }>();
const query = ref("");
const showAll = ref(false);
const billingFilter = ref("all");
const billingFilters = [
  { value: "all", label: "全部计费" },
  { value: "per_second", label: "按秒" },
  { value: "per_request", label: "按次" },
];
const catalog = ref<VendorChild[]>([]);
const availableTypeCount = ref(0);
const emptyReason = computed(() =>
  !availableTypeCount.value
    ? "当前账号暂无此类模型，请联系管理员开通"
    : props.capability === "vision"
      ? "已接入文字模型，但尚未配置看图能力；视频分析需使用支持视觉输入的模型"
      : props.capability === "reference"
        ? `已接入模型，但暂无已确认支持 ${props.referenceCount > 1 ? props.referenceCount + " 张" : ""}参考图的型号`
        : "暂无符合条件的模型",
);
const loadError = ref("");
const loading = ref(false);
let catalogController: AbortController | undefined;
const popupVisible = ref(false);
const searchInput = ref<HTMLInputElement>();
const fieldElement = ref<HTMLElement>();
const popupElement = ref<HTMLElement>();
const triggerElement = ref<HTMLButtonElement>();
const listElement = ref<HTMLElement>();
const listId = `model-list-${useId()}`;
const popupStyle = ref<Record<string, string>>({ visibility: "hidden" });
const activeIndex = ref(-1);
const titleMap: Record<string, string> = { text: "文字", image: "图片", video: "视频", audio: "音频" };
const optionsData = computed<VendorOption[]>(() => {
  const q = query.value.trim().toLowerCase();
  const hasRecommended = catalog.value.some((m) => m.recommended);
  const rows = catalog.value
    .filter((m, index) =>
      q
        ? [m.label, m.value, m.series, m.description].join(" ").toLowerCase().includes(q)
        : showAll.value || m.recommended || `${m.id}:${m.value}` === selectValue.value || (!hasRecommended && index < 3),
    )
    .filter((m) => !showAll.value || billingFilter.value === "all" || props.type !== "video" || m.billingUnit === billingFilter.value);
  const groups = new Map<string, VendorOption>();
  const pinned: VendorChild[] = [];
  for (const item of rows) {
    const billing = item.type === "video" ? (item.billingUnit === "per_second" ? " · 按秒" : " · 按次") : "";
    // 全部模型页签：重点推荐置顶成独立分组（对齐造物「重点推荐」），其余按系列分组
    if (showAll.value && !query.value && item.recommended) {
      pinned.push(item);
      continue;
    }
    const key =
      query.value || showAll.value
        ? `${titleMap[item.type]} · ${item.series}${billing}`
        : !item.recommended
          ? "当前选择"
          : item.type === "video" && item.billingUnit === "per_request"
            ? "按次备选"
            : "为你推荐";
    if (!groups.has(key)) groups.set(key, { group: key, id: key, children: [] });
    groups.get(key)!.children.push(item);
  }
  const ordered = [...groups.values()];
  if (pinned.length) ordered.unshift({ group: "✦ 重点推荐", id: "pinned-recommended", children: pinned });
  return ordered;
});
const visibleCount = computed(() => optionsData.value.reduce((sum, group) => sum + group.children.length, 0));
const visibleModels = computed(() => optionsData.value.flatMap((group) => group.children));
const activeKey = computed(() => {
  const item = visibleModels.value[activeIndex.value];
  return item ? `${item.id}:${item.value}` : "";
});
const selectedModel = computed(() => catalog.value.find((m) => `${m.id}:${m.value}` === selectValue.value));
const selectedLogo = computed(() =>
  getProviderLogoByModel(
    selectedModel.value || {
      label: selectValueLabel.value || "",
      value: selectValue.value,
      series: "",
      id: "",
      type: props.type,
      displayPrice: "",
      recommended: false,
    },
  ),
);
const selectedPriceText = computed(() =>
  selectValue.value
    ? selectedModel.value?.displayPrice || loadError.value || (loading.value ? "正在读取模型价格…" : "当前模型暂无报价，请重新选择")
    : "",
);
const pickerTitle = computed(
  () => ({ text: "选择创作模型", image: "选择图片模型", video: "选择视频模型", audio: "选择音频模型", all: "选择模型" })[props.type],
);
function numberText(value: number) {
  return value === 0 ? "0" : value < 0.001 ? "<0.001" : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
}
function yuanText(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}
function videoExample(item: VendorChild) {
  if (!/^seedance2\.[05]-line1(?:-fast)?$/.test(item.value) || !item.rates?.length) return "";
  const rate = item.rates.find((rate) => rate.resolution === "720p") || item.rates[0];
  return `${rate.resolution} · 5 秒示例：${formatPointsFromYuan(rate.yuan * 5)}（¥${yuanText(rate.yuan * 5)}），不含参考视频`;
}
function updatePlacement() {
  if (!popupVisible.value || !triggerElement.value) return;
  const anchor = triggerElement.value.getBoundingClientRect(),
    viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight,
    top = viewport?.offsetTop || 0;
  if (anchor.bottom < top || anchor.top > top + height) {
    closePicker(false);
    return;
  }
  const rect = modelPickerLayout(anchor, { width: viewport?.width || window.innerWidth, height, left: viewport?.offsetLeft || 0, top }, props.compact ? 460 : 540, props.compact ? 390 : 520);
  popupStyle.value = { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` };
}
function closePicker(restoreFocus = true) {
  popupVisible.value = false;
  if (restoreFocus) triggerElement.value?.focus({ preventScroll: true });
}
function chooseModel(item: VendorChild) {
  closePicker();
  void onChange(`${item.id}:${item.value}`, { option: item });
}
function searchKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "Escape") {
    closePicker();
    event.preventDefault();
  }
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    const length = visibleModels.value.length;
    if (!length) return;
    activeIndex.value =
      activeIndex.value < 0
        ? event.key === "ArrowDown"
          ? 0
          : length - 1
        : (activeIndex.value + (event.key === "ArrowDown" ? 1 : -1) + length) % length;
    nextTick(() => {
      const row = [...(listElement.value?.querySelectorAll<HTMLElement>("[data-model-key]") || [])].find(
        (row) => row.dataset.modelKey === activeKey.value,
      );
      row?.scrollIntoView({ block: "nearest" });
    });
  }
  if (event.key === "Enter") {
    const item = visibleModels.value[activeIndex.value < 0 ? 0 : activeIndex.value];
    if (item) {
      event.preventDefault();
      chooseModel(item);
    }
  }
}
watch([query, showAll, billingFilter], () => {
  activeIndex.value = -1;
  nextTick(() => {
    if (listElement.value) listElement.value.scrollTop = 0;
    updatePlacement();
  });
});
async function onChange(value: any, { option }: any) {
  selectValue.value = value;
  selectValueLabel.value = option?.label || catalog.value.find((m) => `${m.id}:${m.value}` === value)?.label || "";
  if (props.changeConfig && value) {
    const { data } = await axios.post("/modelSelect/getModelDetail", { modelId: value });
    emit("change", value, data);
  } else emit("change", value);
}
function applyCatalog(rows: VendorChild[]) {
  availableTypeCount.value = rows.filter((m) => props.type === "all" || m.type === props.type).length;
  catalog.value = rows
    .filter((m) => {
      if (props.type !== "all" && m.type !== props.type) return false;
      if (props.capability === "vision") return canUnderstandImages(m);
      if (props.capability === "reference") return canUseReferenceImages(m, props.referenceCount);
      return true;
    })
    .map((row) => ({ ...row, displayPrice: formatCatalogPrice(row) }));
  if (props.type === "text" && preferDeepSeek) {
    const deepseek = catalog.value
      .filter((model) => /deepseek/i.test(`${model.label} ${model.value}`))
      .sort((a, b) => Number(b.recommended) - Number(a.recommended))[0];
    const fallback = deepseek || catalog.value.find((model) => model.recommended) || catalog.value[0];
    if (fallback) {
      selectValue.value = `${fallback.id}:${fallback.value}`;
      selectValueLabel.value = fallback.label;
      preferDeepSeek = false;
    }
  }
}
async function handleModelChange(force = false) {
  catalogController?.abort();
  const controller = new AbortController();
  catalogController = controller;
  applyCatalog(modelCatalog.peek() || []);
  loading.value = true;
  loadError.value = "";
  try {
    const rows = await modelCatalog.get(force);
    if (!controller.signal.aborted) applyCatalog(rows);
    // Keep saved model selections visible while a refresh is in flight; do not silently switch models.
  } catch (error) {
    if (!controller.signal.aborted) {
      applyCatalog(modelCatalog.peek() || []);
      loadError.value = pricingFailure(error).message + (catalog.value.length ? "；当前显示上次报价，调用前会重新核价" : "");
    }
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}
function resumePricing() {
  if (loadError.value && document.visibilityState === "visible") void handleModelChange();
}
function onPopupVisibleChange(visible: boolean) {
  popupVisible.value = visible;
  if (visible) {
    window.dispatchEvent(new CustomEvent("model-picker-open", { detail: listId }));
    query.value = "";
    showAll.value = false;
    billingFilter.value = "all";
    void handleModelChange();
    nextTick(() => {
      updatePlacement();
      if (listElement.value) listElement.value.scrollTop = 0;
      searchInput.value?.focus({ preventScroll: true });
    });
  }
}
function outsidePointer(event: PointerEvent) {
  if (popupVisible.value && !fieldElement.value?.contains(event.target as Node) && !popupElement.value?.contains(event.target as Node))
    closePicker(false);
}
function closeOtherPicker(event: Event) {
  if ((event as CustomEvent<string>).detail !== listId) closePicker(false);
}
onMounted(() => {
  void handleModelChange();
  window.addEventListener("online", resumePricing);
  document.addEventListener("visibilitychange", resumePricing);
  document.addEventListener("pointerdown", outsidePointer, true);
  window.addEventListener("resize", updatePlacement);
  window.addEventListener("scroll", updatePlacement, true);
  window.addEventListener("model-picker-open", closeOtherPicker);
  window.visualViewport?.addEventListener("resize", updatePlacement);
  window.visualViewport?.addEventListener("scroll", updatePlacement);
});
onBeforeUnmount(() => {
  catalogController?.abort();
  window.removeEventListener("online", resumePricing);
  document.removeEventListener("visibilitychange", resumePricing);
  document.removeEventListener("pointerdown", outsidePointer, true);
  window.removeEventListener("resize", updatePlacement);
  window.removeEventListener("scroll", updatePlacement, true);
  window.removeEventListener("model-picker-open", closeOtherPicker);
  window.visualViewport?.removeEventListener("resize", updatePlacement);
  window.visualViewport?.removeEventListener("scroll", updatePlacement);
});
watch(
  () => props.type,
  () => handleModelChange(),
);
watch(
  () => props.capability,
  () => handleModelChange(),
);
watch(
  () => props.referenceCount,
  () => handleModelChange(),
);

function getProviderLogoByModel(item?: Partial<VendorChild>) {
  if (!item) return null;
  const latest = oneStopProviderLogoFor(item.series, item.label, item.value, item.provider);
  if (latest) return latest;
  const source = `${item.label || ""} ${item.value || ""} ${item.series || ""} ${item.provider || ""}`.trim();
  if (!source) return null;
  const matchedRule = modelProviderRules.find((rule) => rule.pattern.test(source));
  return matchedRule ? providersLogo[matchedRule.provider] : null;
}

const providerLabels: Record<string, string> = {
  BYT: "火山引擎",
  BYTEDANCE: "火山引擎",
  VOLCENGINE: "火山引擎",
  DOUBAO: "火山引擎",
  JIMENG: "火山引擎",
  OPE: "OpenAI",
  OPENAI: "OpenAI",
  GOO: "Google",
  GOOGLE: "Google",
  GEMINI: "Google",
  ALI: "阿里云",
  ALIBABA: "阿里云",
  QWEN: "阿里云",
  ANT: "Anthropic",
  ANTHROPIC: "Anthropic",
  XAI: "xAI",
  MMX: "MiniMax",
  MINIMAX: "MiniMax",
  KUA: "快手可灵",
  KLING: "快手可灵",
  KUAISHOU: "快手可灵",
  DEE: "DeepSeek",
  DEEPSEEK: "DeepSeek",
  ZHI: "智谱",
  PIX: "PixVerse",
  PIXVERSE: "PixVerse",
  MOO: "月之暗面",
  VID: "生数科技",
  VIDU: "生数科技",
};
function providerText(item: Partial<VendorChild>) {
  const provider = String(item.provider || "").trim();
  return `渠道 · ${providerLabels[provider.toUpperCase()] || provider || item.series || "平台线路"}`;
}
function billingText(item: Partial<VendorChild>) {
  return item.billingUnit === "per_second" ? "按秒" : item.billingUnit === "per_request" ? "按次" : "按量";
}
function isDedicatedLine(item: Partial<VendorChild>) {
  return /(?:^|[-_. ])xoi(?:$|[-_. ])/i.test(`${item.value || ""} ${item.label || ""}`) || /专线/.test(item.label || "");
}
function channelText(item: Partial<VendorChild>) {
  return [providerText(item), billingText(item), isDedicatedLine(item) ? "XOi 专线" : ""].filter(Boolean).join(" · ");
}

function getFallbackText(label: string) {
  return label?.slice(0, 1)?.toUpperCase() || "M";
}
</script>

<style lang="scss" scoped>
.modelPriceRetry {
  border: 0;
  background: none;
  color: #c45d2b;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
  padding: 2px 6px;
}
.modelSelectField {
  width: 100%;
  min-width: 0;
}
.modelSelectControl {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--td-border-level-2-color, #dedbd5);
  border-radius: 8px;
  background: var(--td-bg-color-container, #fff);
  color: var(--td-text-color-primary, #302d29);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.modelSelectControl.large {
  height: 40px;
}
.modelSelectControl.small {
  height: 24px;
  font-size: 12px;
}
.modelSelectControl > span {
  min-width: 0;
}
.modelSelectControl .placeholder {
  color: var(--td-text-color-placeholder, #aaa);
}
.modelSelectControl.rich {
  justify-content: flex-start;
  gap: 9px;
  height: 42px;
  padding: 4px 10px 4px 7px;
}
.modelControlBrand {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  overflow: hidden;
  border: 1px solid #ebe6df;
  border-radius: 10px;
  background: #fff;
  color: #b05b32;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 4px 12px #35241710;
}
.modelControlBrand img {
  display: block;
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.modelControlCopy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
  white-space: nowrap;
}
.modelControlCopy strong {
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 16px;
  text-overflow: ellipsis;
}
.modelControlCopy small {
  overflow: hidden;
  color: var(--td-text-color-placeholder, #928a80);
  font-size: 9px;
  font-weight: 500;
  line-height: 12px;
  text-overflow: ellipsis;
}
.modelSelectControl svg {
  width: 16px;
  height: 16px;
  flex: none;
  stroke: currentColor;
  stroke-width: 1.8;
  opacity: 0.6;
}
.modelSelectControl.opened {
  border-color: #e7a16c;
}
.modelSelectControl.opened svg {
  transform: rotate(180deg);
}
.modelSelectControl:focus-visible {
  outline: 2px solid #e9b490;
  outline-offset: 2px;
}
.xoi-model-panel {
  position: fixed;
  z-index: 6000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid #e8e3dc;
  border-radius: 16px;
  background: #fff;
  color: #302d29;
  box-shadow: 0 20px 60px #2c251f26;
  text-align: left;
}
.modelPanelHeader {
  flex: none;
  min-width: 0;
}
.modelPanelClose {
  margin-left: auto;
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: #f5f3f0;
  color: #8b8278;
  font-size: 20px;
  cursor: pointer;
}
.modelPanelList {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #cbbfb1 #f7f5f2;
  padding: 0 8px 8px;
}
.modelPanelList::-webkit-scrollbar {
  width: 6px;
}
.modelPanelList::-webkit-scrollbar-thumb {
  border-radius: 6px;
  background: #cbbfb1;
}
.modelPanelGroup h3 {
  margin: 0;
  padding: 10px 10px 6px;
  color: #9e958a;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
}
.modelPanelOption {
  display: block;
  width: 100%;
  margin: 4px 0;
  padding: 12px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.modelPanelOption:hover,
.modelPanelOption.modelKeyboardActive {
  background: #f6f3ef;
}
.modelPanelOption[aria-selected="true"] {
  background: #fff3e9;
  box-shadow: inset 0 0 0 1px #f1d5bd;
}
.modelPanelOption:focus-visible {
  outline: 2px solid #e9b490;
  outline-offset: -2px;
}
.optionExample {
  margin-left: 50px;
  color: #776d60;
  font-size: 10px;
  line-height: 16px;
}
.modelPickerHeading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px 12px;
}
.modelPickerGlyph {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 10px;
  background: #fff1e8;
  color: #e9640b;
  font-size: 13px;
}
.modelPickerHeading > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.modelPickerHeading strong {
  color: #252529;
  font-size: 13px;
  font-weight: 700;
  line-height: 18px;
}
.modelPickerHeading small {
  color: #92908c;
  font-size: 11px;
  line-height: 16px;
}
.modelCatalogTools {
  flex: none;
  padding: 0 14px 12px;
  display: grid;
  gap: 10px;
}
.modelCatalogTabs {
  display: flex;
  padding: 3px;
  gap: 3px;
  border-radius: 10px;
  background: #f2f1ee;
}
.modelCatalogTabs button {
  flex: 1;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  color: #807b75;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  transition: 0.15s ease;
}
.modelCatalogTabs button.active {
  background: #fff;
  color: #ad5428;
  box-shadow: 0 1px 4px #2820190b;
  font-weight: 650;
}
.modelCatalogTabs button span {
  margin-left: 4px;
  font-size: 10px;
  opacity: 0.7;
}
.modelCatalogSearch {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 11px;
  border: 1px solid #e9e5df;
  border-radius: 10px;
  background: #fcfbf9;
  transition: border-color 0.15s;
}
.modelCatalogSearch:focus-within {
  border-color: #e9b490;
  box-shadow: 0 0 0 3px #ed873a0b;
}
.modelCatalogSearch svg {
  width: 15px;
  height: 15px;
  flex: none;
  stroke: #a29b92;
  stroke-width: 1.7;
}
.modelCatalogSearch input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #34312d;
  font: inherit;
  font-size: 12px;
}
.modelCatalogSearch input::placeholder {
  color: #aaa39a;
}
.modelCatalogSearch button {
  flex: none;
  border: 0;
  background: transparent;
  color: #92897d;
  cursor: pointer;
  font-size: 18px;
}
.modelCatalogTools small {
  color: #a85038;
}
.modelBillingFilters {
  display: flex;
  gap: 6px;
}
.modelBillingFilters button {
  padding: 3px 9px;
  border: 1px solid #eee8df;
  border-radius: 6px;
  background: transparent;
  color: #948b7e;
  font-size: 10px;
  cursor: pointer;
}
.modelBillingFilters button.active {
  background: #fff3e7;
  color: #a65f30;
  border-color: #f0d9c1;
}
.optionBillingNote {
  margin-left: 50px;
  color: #a2927d;
  font-size: 10px;
  line-height: 15px;
}
.modelCatalogFooter {
  display: flex;
  flex: none;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid #f0ede8;
  background: #fcfbf9;
  color: #938a7e;
  font-size: 10px;
  line-height: 16px;
}
.optionItem {
  display: grid;
  width: 100%;
  gap: 6px;
  white-space: normal;
}
.optionHeading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.optionMain {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.optionBrand {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  overflow: hidden;
  border: 1px solid #ece7e0;
  border-radius: 13px;
  background: #fff;
  color: #b05b32;
  font-size: 12px;
  font-weight: 750;
  box-shadow: 0 5px 16px #39271912;
}
.optionBrand img {
  display: block;
  width: 29px;
  height: 29px;
  object-fit: contain;
}
.optionTitleBlock {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.optionLabel {
  overflow-wrap: anywhere;
  color: #302d29;
  font-size: 14px;
  font-weight: 680;
  line-height: 19px;
}
.optionChannelLine {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.optionChannelLine span {
  padding: 2px 6px;
  border: 1px solid #ece7df;
  border-radius: 999px;
  background: #fbfaf8;
  color: #8f877d;
  font-size: 9px;
  font-weight: 550;
  line-height: 13px;
  white-space: nowrap;
}
.optionDescription {
  margin-left: 50px;
  color: #999187;
  font-size: 11px;
  line-height: 17px;
}
.optionRates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: 50px;
}
.optionRates > span {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 125px;
  padding: 6px 9px;
  border-radius: 8px;
  background: #f8f5f0;
  gap: 1px;
}
.optionRates small {
  color: #9b9186;
  font-size: 10px;
}
.optionRates strong {
  color: #a6542d;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}
.optionRates em {
  font-size: 10px;
  font-style: normal;
  font-weight: 400;
}
.optionRates > span > span {
  color: #a1998f;
  font-size: 10px;
}

.optionType {
  flex-shrink: 0;
  padding: 3px 7px;
  border: 1px solid #e7b72f80;
  border-radius: 999px;
  color: #a97600;
  background: #fff9df;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
}
.optionBadges {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  flex-wrap: wrap;
}
.optionSelected {
  flex: none;
  padding: 3px 7px;
  border-radius: 999px;
  background: #fff0e5;
  color: #b85a2e;
  font-size: 9px;
  font-weight: 650;
  line-height: 14px;
}

.optionMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.optionPrice {
  margin-left: 50px;
  color: #a65c34;
  font-size: 11px;
  line-height: 17px;
  white-space: normal;
  font-variant-numeric: tabular-nums;
}

.modelCostHint {
  margin-top: 6px;
  color: var(--td-text-color-secondary);
  font-size: 11px;
  line-height: 16px;
}
.modelCostIcon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: #fff;
  color: #ed6f32;
  box-shadow: 0 3px 10px rgba(230, 105, 52, 0.12);
}
.modelCostCopy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.modelCostCopy small {
  color: var(--td-text-color-placeholder);
  font-size: 10px;
}
.modelCostHint strong {
  color: #998775;
  font-size: 10px;
  font-weight: 400;
  line-height: 15px;
  overflow-wrap: anywhere;
}
.modelCostNote {
  margin-top: 1px;
  overflow: hidden;
  color: var(--td-text-color-placeholder);
  font-size: 9px;
  line-height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fallbackAvatar {
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.emptyActionWrap {
  display: flex;
  justify-content: center;
  padding: 8px 12px;
  .emptyActionButton {
    min-width: 140px;
    color: #339af0;
  }
}
</style>
