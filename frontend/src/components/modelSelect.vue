<template>
  <t-select
    :size="props.size"
    v-model="selectValue"
    :placeholder="props.placeholder ?? $t('components.modelSelect.placeholder')"
    @change="onChange"
    @popup-visible-change="onPopupVisibleChange">
    <t-option-group v-for="(list, index) in optionsData" :key="index" :label="list.group">
      <t-option v-for="item in list.children" :key="item.id" :value="`${item.id}:${item.value}`" :label="item.label">
        <div class="optionItem">
          <div class="optionMain">
            <t-avatar
              v-if="getProviderLogoByModel(item.label, item.value)"
              size="24px"
              shape="round"
              :image="getProviderLogoByModel(item.label, item.value)!" />
            <t-avatar v-else size="24px" shape="round" class="fallbackAvatar">{{ getFallbackText(item.label) }}</t-avatar>
            <div class="optionLabel">{{ item.label }}</div>
          </div>
          <div class="optionMeta">
            <span class="optionPrice" v-if="getPriceText(item.value)">{{ getPriceText(item.value) }}</span>
            <span class="optionType">{{ item.type }}</span>
          </div>
        </div>
      </t-option>
    </t-option-group>
    <!-- 无可用模型：模型统一由 new-api 网关接管，主站不再提供本地配置入口 -->
    <template #empty>
      <div class="emptyActionWrap">
        <span class="emptyActionButton">{{ $t("components.modelSelect.noModel", "暂无可用模型，请联系管理员在网关配置线路") }}</span>
      </div>
    </template>
  </t-select>
  <div v-if="selectedPriceText" class="modelCostHint" role="status">
    <span class="modelCostDot" aria-hidden="true"></span>
    <span>本模型参考价：<strong>{{ selectedPriceText }}</strong></span>
    <span class="modelCostNote">实际按 NewAPI 用量结算</span>
  </div>
</template>

<script setup lang="ts">
import { providersLogo, modelProviderRules } from "@/utils/providersLogo";
import settingStore from "@/stores/setting";

import axios from "@/utils/axios";
interface VendorChild {
  id: number;
  label: string;
  value: string;
  vendorId: number;
  type: string;
}

interface VendorOption {
  group: string;
  id: number;
  children: VendorChild[];
}
interface PricingRow {
  model_name: string;
  model_ratio?: number;
  model_price?: number;
  quota_type?: number;
  billing_mode?: string;
  billing_expr?: string;
}
const selectValue = defineModel({
  type: String,
  default: "",
});

const selectValueLabel = defineModel("label");

const props = defineProps({
  type: {
    type: String as () => "text" | "image" | "all" | "video",
    default: "all",
  },
  size: {
    type: String as () => "small" | "medium" | "large",
    default: "medium",
  },
  placeholder: {
    type: String,
  },
  changeConfig: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits<{
  change: [value: string, data?: any];
}>();

const pricingRows = ref<PricingRow[]>([]);
const pricingLoaded = ref(false);
const priceByModel = computed(() => new Map(pricingRows.value.map((row) => [row.model_name, row])));

function formatYuan(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  const digits = value >= 1 ? 2 : 4;
  return `¥${value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function priceText(modelName: string) {
  const row = priceByModel.value.get(modelName);
  if (!row) return "";
  const expr = row.billing_expr || "";
  // 计费表达式来自 NewAPI：图片/音频的 param()/p* 形态使用 1e6 缩放，
  // 视频常见的 u("seconds")*X 直接就是元/秒。
  const floor = /tier\("[^\"]+",\s*u\("seconds"\)\s*<\s*[\d.]+\s*\?\s*[\d.]+\s*:\s*u\("seconds"\)\s*\*\s*([\d.]+)/.exec(expr);
  const tier = /tier\("(?:default|flat|[^\"]+)",\s*(?:u\("seconds"\)\s*\*\s*)?([\d.]+)/.exec(expr);
  const perChar = /tier\("[^\"]+",\s*p\s*\*\s*([\d.]+)/.exec(expr);
  if (perChar) return `${formatYuan(Number(perChar[1]) / 1e6 * 1000)} / 千字起`;
  if (floor) return `${formatYuan(Number(floor[1]))} / 秒起`;
  if (tier) {
    const scaled = expr.includes("param(") || /tier\("flat"/.test(expr);
    const value = scaled ? Number(tier[1]) / 1e6 : Number(tier[1]);
    return `${formatYuan(value)} / ${/seconds/.test(expr) ? "秒起" : "次起"}`;
  }
  if (Number(row.model_price) > 0) return `${formatYuan(Number(row.model_price))} / ${props.type === "video" ? "秒" : "次"}`;
  if (Number(row.model_ratio) > 0) return `${formatYuan(Number(row.model_ratio) * 2)} / 1M tokens`;
  return "";
}

function getPriceText(modelName: string) {
  return priceText(modelName);
}

const selectedPriceText = computed(() => {
  const modelName = String(selectValue.value || "").split(/:(.+)/)[1] || "";
  return modelName ? priceText(modelName) : "";
});

async function loadPricing() {
  if (pricingLoaded.value) return;
  pricingLoaded.value = true;
  try {
    const response = await fetch("/api/pricing", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    pricingRows.value = Array.isArray(body?.data) ? body.data : [];
  } catch {
    // 价格表不可用不阻塞模型选择；生成仍由网关按实际用量结算。
  }
}

async function onChange(value: any, { option }: any) {
  selectValue.value = value;
  selectValueLabel.value = option.label;
  if (props.changeConfig) {
    const { data } = await axios.post("/modelSelect/getModelDetail", {
      modelId: value,
    });
    emit("change", value, data);
  } else {
    emit("change", value);
  }
}
const optionsData = ref<VendorOption[]>([]);
onMounted(() => {
  void loadPricing();
  handleModelChange();
});

function onPopupVisibleChange(visible: boolean) {
  if (visible) {
    void loadPricing();
    handleModelChange();
  }
}
const titleMap = {
  image: $t("components.modelSelect.type.image"),
  text: $t("components.modelSelect.type.text"),
  video: $t("components.modelSelect.type.video"),
};
//获取模型选择API数据
function handleModelChange() {
  axios
    .post("/modelSelect/getModelList", { type: props.type })
    .then((response) => {
      const groupMap = new Map<string, VendorOption>();
      response.data.forEach((item: any) => {
        const groupKey = item.id;
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            group: item.name,
            id: item.id,
            children: [],
          });
        }
        groupMap.get(groupKey)!.children.push({
          id: item.id,
          label: item.label,
          value: item.value,
          vendorId: item.vendorId,
          type: titleMap[item.type as "image" | "text" | "video"],
        });
      });
      optionsData.value = Array.from(groupMap.values());

      if (
        optionsData.value
          .map((i) => i.children)
          .flat()
          .every((i) => `${i.id}:${i.value}` !== selectValue.value)
      ) {
        selectValue.value = "";
      }
    })
    .catch((error) => {
      console.error($t("components.modelSelect.msg.fetchModelFailed"), error);
    });
}

function getProviderLogoByModel(label?: string, value?: string) {
  const source = `${label || ""} ${value || ""}`.trim();
  if (!source) return null;
  const matchedRule = modelProviderRules.find((rule) => rule.pattern.test(source));
  return matchedRule ? providersLogo[matchedRule.provider] : null;
}

function getFallbackText(label: string) {
  return label?.slice(0, 1)?.toUpperCase() || "M";
}
</script>

<style lang="scss" scoped>
.optionItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.optionMain {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.optionLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.optionType {
  color: var(--td-text-color-secondary);
  flex-shrink: 0;
}

.optionMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.optionPrice {
  color: #f57400;
  font-size: 12px;
  white-space: nowrap;
}

.modelCostHint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 24px;
  margin-top: 5px;
  padding: 0 2px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}

.modelCostHint strong { color: #f57400; font-weight: 650; }
.modelCostDot { width: 6px; height: 6px; border-radius: 50%; background: #f57400; }
.modelCostNote { color: var(--td-text-color-placeholder); }

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
