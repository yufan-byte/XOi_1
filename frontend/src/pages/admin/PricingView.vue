<template>
  <t-loading :loading="loading">
    <div class="pricingWrap">
      <!-- 页头 -->
      <div class="pageHead pricing-hero">
        <div class="phLeft">
          <div class="titleBadge">价</div>
          <div>
            <h2 class="pageTitle">{{ $t("workbench.menu.pricing") }}</h2>
            <p class="pageSub">为不同供应商或模型配置倍率，系统会在基础价格上自动计算实际扣费。</p>
          </div>
        </div>
        <div class="actions">
          <t-button variant="outline" size="small" class="ghostBtn" @click="loadData">
            <i class="i-refresh"></i><span>刷新</span>
          </t-button>
          <t-button theme="primary" size="small" class="solidBtn" @click="openCreate">
            <i class="i-add"></i><span>新增规则</span>
          </t-button>
        </div>
      </div>

      <!-- 提示带 -->
      <div class="hintBar">
        <span class="hintDot"></span>
        实际扣费 = 基础积分 × 计费倍率；没有规则时，系统默认按 ×1.00 的基础价格结算。
      </div>

      <!-- 统计卡 -->
      <div class="kpiRow" v-if="rows.length">
        <div class="kpiTile kpi-rules">
          <div class="kpiIcon">规则</div>
          <div class="kpiBody"><div class="kpiNum">{{ stats.total }}</div><div class="kpiLabel">生效规则数</div></div>
        </div>
        <div class="kpiTile kpi-vendors">
          <div class="kpiIcon">供应</div>
          <div class="kpiBody"><div class="kpiNum">{{ stats.vendors }}</div><div class="kpiLabel">涉及供应商</div></div>
        </div>
        <div class="kpiTile kpi-rate">
          <div class="kpiIcon">倍率</div>
          <div class="kpiBody"><div class="kpiNum">{{ stats.avgRate }}</div><div class="kpiLabel">平均倍率</div></div>
        </div>
        <div class="kpiTile kpi-wild">
          <div class="kpiIcon">通配</div>
          <div class="kpiBody"><div class="kpiNum">{{ stats.wild }}</div><div class="kpiLabel">通配档位</div></div>
        </div>
      </div>

      <!-- 表格卡片 -->
      <div class="tableCard">
        <div class="ruleTableHead">
          <div>
            <h3>差异化规则</h3>
            <p>倍率变更会在失焦或按下 Enter 后保存，并立即影响后续扣费。</p>
          </div>
          <span class="ruleCount">{{ rows.length }} 条规则</span>
        </div>
        <t-empty v-if="rows.length === 0 && !loading" description="还没有差异化计费规则 · 点右上角「新增规则」配置第一条" />
        <t-table
          v-else
          :data="rows"
          :columns="columns"
          row-key="id"
          size="medium"
          :show-sort-column-bg="false"
          :stripe="false"
          max-height="calc(100vh - 380px)"
        >
          <!-- ID -->
          <template #id="{ row }"><span class="cellId">#{{ row.id }}</span></template>

          <!-- 供应商 -->
          <template #vendor_id="{ row }">
            <span class="vchip" :style="chipStyle(row.vendor_id)" :title="`${displayName({ id: row.vendor_id })} · ${row.vendor_id}`">
              {{ shortName(displayName({ id: row.vendor_id }), 13) }}
            </span>
          </template>

          <!-- 操作动作 -->
          <template #base_action="{ row }">
            <span class="actionTag">
              <i class="dot" :style="{ background: actionToneOf(row.base_action) }"></i>{{ row.base_action }}
            </span>
            <p v-if="row.base_description" class="actDesc">{{ row.base_description }}</p>
          </template>

          <!-- 型号 -->
          <template #model_name="{ row }">
            <span v-if="row.model_name" class="modelName" :title="row.model_name">{{ shortName(row.model_name, 15) }}</span>
            <span v-else class="wildCard"><i>★</i>通配整档</span>
          </template>

          <!-- 倍率 ↔ 实算 -->
          <template #multiplier="{ row }">
            <div class="rateCell">
              <div class="rateRow">
                <t-input-number
                  v-model="row.multiplier"
                  theme="normal"
                  size="small"
                  :min="0"
                  :step="0.1"
                  :decimal-places="2"
                  class="numInput"
                  @blur="saveRow(row)"
                  @enter="saveRow(row)"
                />
                <span class="effLine">
                  {{ basePointsOf(row) }}<em>×</em>{{ fmt(row.multiplier) }}<em>=</em>
                  <b class="effNum">{{ effPoints(row) }}</b>
                </span>
              </div>
              <div class="miniBar">
                <div class="barFill" :class="barClass(Number(row.multiplier))" :style="{ width: barWidthPct(Number(row.multiplier)) + '%' }"></div>
                <span class="barRef"></span><!-- 100% 即 ×1 参考线 -->
              </div>
              <span class="effHint">基{{ basePointsOf(row) }}分　·　实扣<b>{{ effPoints(row) }}</b>积分</span>
            </div>
          </template>

          <!-- 操作 -->
          <template #op="{ row }">
            <button class="opBtn" title="删除该差异化规则" @click="removeRow(row)">删除规则</button>
          </template>
        </t-table>
      </div>

      <!-- 新增弹窗 -->
      <t-dialog
        v-model:visible="createVisible"
        header="新增差异化计费规则"
        width="540px"
        :footer="false"
      >
        <t-form :data="form" label-align="top" @submit.prevent="submitCreate">
          <t-form-item label="供应商" name="vendor_id" required-mark>
            <t-select v-model="form.vendor_id" placeholder="选择启用的模型服务" filterable clearable>
              <t-option
                v-for="v in vendors"
                :key="v.id"
                :value="v.id"
                :label="`${displayName(v)} (${v.id})${enableText(v.enable)}`"
              />
            </t-select>
          </t-form-item>
          <t-form-item label="操作动作" name="base_action" required-mark>
            <t-select v-model="form.base_action" placeholder="关联的基础价行" filterable clearable>
              <t-option
                v-for="a in actions"
                :key="a.action"
                :value="a.action"
                :label="`${a.action}（基 ${a.points} 分）${a.description ? '· ' + a.description : ''}`"
              />
            </t-select>
          </t-form-item>
          <t-form-item label="具体型号（留空＝该供应商下全体适用）" name="model_name">
            <t-input v-model.trim="form.model_name" placeholder="例 doubao-xl；留空即通配整档" clearable />
          </t-form-item>
          <t-form-item label="倍率 multiplier" name="multiplier" required-mark>
            <t-input-number
              v-model="form.multiplier"
              theme="column"
              :min="0"
              :step="0.1"
              :decimal-places="2"
              style="width: 100%"
            />
            <p class="tip-line">×1 为原价；＜1 打折优惠；＞1 溢价加收。</p>
          </t-form-item>
          <t-form-item label="备注说明" name="description">
            <t-textarea v-model.trim="form.description" :autosize="{ minRows: 2 }" maxlength="200" />
          </t-form-item>
          <div class="dlg-foot">
            <t-space>
              <t-button theme="default" variant="base" @click="createVisible = false">取消</t-button>
              <t-button theme="primary" :loading="creating" @click="submitCreate">保存规则</t-button>
            </t-space>
          </div>
        </t-form>
      </t-dialog>
    </div>
  </t-loading>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import axios from "@/utils/axios";
import { MessagePlugin, DialogPlugin } from "tdesign-vue-next";

interface OverrideRow {
  id?: number;
  base_action: string;
  vendor_id: string;
  model_name: string | null;
  multiplier: number;
  description?: string | null;
  base_points?: number;
  base_description?: string;
}
interface Vendor {
  id: string;
  name?: string;
  author?: string;
  enable?: number | boolean;
}
interface PriceAction {
  action: string;
  points: number;
  description?: string;
}

const loading = ref(false);
const creating = ref(false);
const rows = ref<OverrideRow[]>([]);
const vendors = ref<Vendor[]>([]);
const actions = ref<PriceAction[]>([]);
const createVisible = ref(false);
const form = ref<{ vendor_id: string; base_action: string; model_name: string; multiplier: number; description: string }>({
  vendor_id: "",
  base_action: "",
  model_name: "",
  multiplier: 1,
  description: "",
});

// 列宽策略：# / 操作 分别左·右钉住常驻可视；动作用 mono 较短故收紧；
//           倍率为弹性主列 minWidth 吃满余空，再多供应商也不会互相挤压，
//           极端情况下由 .tableCard 横向滚动兜底（配合 fixed 双侧锚）。
const columns: any[] = [
  { colKey: "id", title: "#", width: 58, fixed: "left" },
  { colKey: "vendor_id", title: "供应商", width: 154 },
  { colKey: "base_action", title: "操作动作", width: 162 },
  { colKey: "model_name", title: "型号匹配", width: 128 },
  { colKey: "multiplier", title: "倍率 ↔ 实算扣费", minWidth: 224 },
  { colKey: "op", title: "", width: 82, fixed: "right" },
];

// ===== 汇总统计 =====
const stats = computed(() => {
  const list = rows.value;
  const total = list.length;
  const vendorsSet = new Set(list.map((r) => r.vendor_id));
  const sumMult = list.reduce((s, r) => s + Number(r.multiplier ?? 0), 0);
  return {
    total,
    vendors: vendorsSet.size,
    avgRate: total ? "×" + (sumMult / total).toFixed(2) : "×1.00",
    wild: list.filter((r) => !r.model_name).length,
  };
});

function displayName(v: Vendor): string {
  return v.name || v.author || v.id || "?";
}
// 长 vendor 名只显短形防 chip 爆框，鼠标悬浮经 title 看完整标识
function shortName(full?: string | null, cap = 13): string {
  const n = String(full ?? "");
  return n.length > cap ? n.slice(0, Math.max(cap - 2, 3)) + "…" : n || "-";
}
function enableText(enable?: number | boolean): string {
  if (enable === undefined || enable === null) return "";
  if (typeof enable === "boolean") return enable ? "" : " · 未启用";
  return Number(enable) >= 1 ? "" : " · 未启用";
}
function fmt(n: number | undefined): string {
  return Number(n ?? 1).toFixed(2);
}
function basePointsOf(row: OverrideRow): number {
  return typeof row.base_points === "number" ? row.base_points : 0;
}
function effPoints(row: OverrideRow): number {
  const b = basePointsOf(row);
  return Math.round(b * Number(row.multiplier ?? 1) * 100) / 100;
}

// ===== 供应商彩签哈希取色（与头像同款范式，偏紫粉蓝绿暖五组协调色阶）=====
const VENDOR_PALETTE: Array<[string, string]> = [
  ["#667eea", "#764ba2"], // 默认紫蓝 —— xoi 这类默认中转走这条最贴主题
  ["#f472b6", "#ec4899"], // 粉
  ["#60a5fa", "#2563eb"], // 蓝
  ["#34d399", "#059669"], // 绿青
  ["#fbbf24", "#f59e0b"], // 暖琥珀
];
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function chipStyle(vendorId?: string) {
  const idx = hashStr(vendorId || "?") % VENDOR_PALETTE.length;
  const [a, b] = VENDOR_PALETTE[idx];
  return { backgroundImage: `linear-gradient(135deg, ${a}, ${b})`, boxShadow: `0 3px 8px ${a}59` };
}

// ===== 动作家族色调小圆点 =====
function actionToneOf(action?: string): string {
  switch ((action || "").toLowerCase()) {
    case "image_generate":
      return "#34d399";
    case "video_generate":
      return "#f472b6";
    case "text_generate":
      return "#7c83ff"; // 紫蓝柔光
    case "prompt_optimize":
      return "#fbbf24";
    case "audio_generate":
    case "script_generate":
      return "#22d3ee";
    default:
      return "#94a3b8";
  }
}

// ===== 倍率迷你进度条映射（0~2x 区间成 0~100%，超出封顶；≥1 与 ＜1 两态着不同色让一眼看出加价还是打折）=====
function barWidthPct(mult: number): number {
  const m = Math.max(0, Math.min(Number(mult ?? 1), 2));
  return Math.round(m * 50);
}
function barClass(mult: number): string {
  const m = Number(mult ?? 1);
  if (m > 1.001) return "is-premium"; // 加价红橙
  if (m < 0.999 && m >= 0) return "is-discount"; // 打折绿
  return "is-base"; // ≈1 中性紫
}

// 单独捕获每个并发源，便于定位到底哪条挂掉；任一失败不影响其余渲染
function trace<T>(p: Promise<T>, label: string): Promise<{ ok: true; data: T } | { ok: false; label: string; err: any }> {
  return p.then(
    (d): { ok: true; data: T } => ({ ok: true, data: d }),
    (err): { ok: false; label: string; err: any } => ({ ok: false, label, err }),
  );
}

async function loadData() {
  loading.value = true;
  try {
    const results = await Promise.all([
      trace(axios.get<any>("/setting/pointsConfig/overrides"), "overrides"),
      trace(axios.post<any>("/setting/vendorConfig/getVendorList"), "vendors"),
      trace(axios.get<any>("/setting/pointsConfig/prices"), "actions"),
    ]);

    const failures = results.filter((r) => !r.ok);
    if (failures.length) {
      failures.forEach(({ label, err }) => {
        const st = err?.response?.status ?? "?";
        const body = err?.response?.data;
        console.error("[PricingView.load]", label, "http=" + st, body || err?.message);
      });
      MessagePlugin.warning(
        "部分来源拉取失败：" +
          failures.map((f) => `${f.label}(${f.err?.response?.status})`).join("，") +
          "；详见控制台",
      );
    }

    type ResR = (typeof results)[number];
    const pickList = (r: ResR): any[] => {
      if (!r.ok) return [];
      const body = (r as Extract<ResR, { ok: true }>).data as any;
      return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : body?.data ? [body.data].flat() : [];
    };
    // 兜底按主键 id 升序展示 —— 抵消后端 GET 按 vendor_id 分组带来的次序错位，
    // 保证 #1 / #2 … 按“创建先后”自上而下排列；新建规则因 id 最大会落到末尾，亦直觉一致。
    rows.value = (pickList(results[0]) as OverrideRow[]).slice().sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
    vendors.value = pickList(results[1]);
    actions.value = pickList(results[2]);
  } catch (e: any) {
    MessagePlugin.error("整体异常：" + (e.message || ""));
  }
  loading.value = false;
}

async function saveRow(row: OverrideRow) {
  try {
    await axios.patch(`/setting/pointsConfig/overrides/${row.id}`, {
      multiplier: Number(row.multiplier),
      description: row.description ?? null,
    });
    MessagePlugin.success(`倍率已更新 · 当前实算 ${effPoints(row)} 积分`);
  } catch (e: any) {
    MessagePlugin.error("更新失败：" + e.response?.data?.error || e.message);
    loadData();
  }
}

async function removeRow(row: OverrideRow) {
  const dlg = DialogPlugin.confirm({
    header: "删除差异化规则",
    body: `${row.vendor_id}/${row.base_action}/${row.model_name || "*"} 将被永久移除`,
    confirmBtn: { content: "确认删除", theme: "danger" },
    onConfirm: async () => {
      try {
        await axios.delete(`/setting/pointsConfig/overrides/${row.id}`);
        MessagePlugin.success("删除成功");
        loadData();
      } catch (e: any) {
        MessagePlugin.error("删除失败：" + e.response?.data?.error || e.message);
      }
      dlg.destroy();
    },
  });
}

function openCreate() {
  Object.assign(form.value, { vendor_id: "", base_action: "", model_name: "", multiplier: 1, description: "" });
  createVisible.value = true;
}

async function submitCreate() {
  if (!form.value.vendor_id) return MessagePlugin.warning("请先选择供应商");
  if (!form.value.base_action) return MessagePlugin.warning("请先关联一个操作动作");
  creating.value = true;
  try {
    await axios.post("/setting/pointsConfig/overrides", {
      ...form.value,
      model_name: form.value.model_name || null,
    });
    MessagePlugin.success("创建成功");
    createVisible.value = false;
    loadData();
  } catch (e: any) {
    MessagePlugin.error(e.response?.data?.msg || e.response?.data?.error || e.message);
  }
  creating.value = false;
}

onMounted(loadData);
</script>

<style lang="scss" scoped>
.pricingWrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px clamp(16px, 3vw, 32px);
  color: var(--td-text-color-primary);
}

/* 统一为低饱和、以数据为中心的运营台视觉 */
.pricingWrap .titleBadge {
  background: #eef0ff;
  color: #5965cc;
  box-shadow: none;
  transform: none;
  font-size: 18px;
  font-weight: 800;
}
.pricingWrap .pageTitle {
  background: none;
  -webkit-text-fill-color: initial;
  color: #182033;
}
.pricingWrap .kpiIcon {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .02em;
}
.pricingWrap .kpiTile {
  box-shadow: 0 3px 16px rgba(15, 23, 42, .045);
}
.pricingWrap .hintBar {
  color: rgba(24, 32, 51, .65);
  background: #f8f9ff;
  border-color: rgba(102, 116, 216, .14);
}

/* ========== 页头 ========== */
.pageHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;

  .phLeft {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .titleBadge {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    font-size: 21px;
    display: grid;
    place-items: center;
    background-image: linear-gradient(135deg, #f472b6, #a78bfa, #60a5fa, #34d399);
    box-shadow: 0 8px 18px rgba(167, 139, 250, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.45);
    transform: rotate(-3deg);
  }
  .pageTitle {
    margin: 0;
    line-height: 1.15;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.01em;
    background-image: linear-gradient(120deg, #764ba2, #667eea 55%, #7c83ff);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .pageSub {
    margin: 3px 0 0;
    font-size: 12.5px;
    color: rgba(15, 23, 42, 0.52);
    letter-spacing: 0.02em;
  }

  .actions {
    display: flex;
    gap: 9px;
    flex-shrink: 0;
  }
  /* 按钮 ── 延续 userManage 全局苹果风 */
  :deep(.ghostBtn.t-button),
  :deep(.solidBtn.t-button) {
    border-radius: 11px !important;
    height: 33px !important;
    padding: 0 15px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1) !important;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    i {
      font-size: 14px;
      font-style: normal;
    }
    &:hover:not(:disabled) {
      transform: translateY(-1px);
    }
  }
  :deep(.ghostBtn.t-button) {
    border-color: transparent !important;
    background: #fff !important;
    color: #4c54cc !important;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06) inset, 0 0 0 1px rgba(102, 126, 234, 0.18) !important;
    &:hover:not(:disabled) {
      box-shadow: 0 6px 14px rgba(102, 126, 234, 0.18), 0 0 0 1px rgba(102, 126, 234, 0.28) !important;
    }
  }
  :deep(.solidBtn.t-button) {
    border: none !important;
    background-image: linear-gradient(135deg, #667eea, #764ba2) !important;
    color: #fff !important;
    box-shadow: 0 6px 14px rgba(118, 75, 162, 0.36) !important;
    &:hover:not(:disabled) {
      box-shadow: 0 9px 20px rgba(118, 75, 162, 0.46) !important;
    }
  }
}

/* ========== 提示带 ========== */
.hintBar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 15px;
  border-radius: 10px;
  font-size: 12.5px;
  color: rgba(82, 88, 124, 0.92);
  background: linear-gradient(90deg, rgba(167, 139, 250, 0.08), rgba(96, 165, 250, 0.06));
  border: 1px solid rgba(167, 139, 250, 0.18);

  .hintDot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #a78bfa;
    box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.25);
    animation: pulse-dot 2.2s ease-in-out infinite;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    padding: 1px 6px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.65);
    color: #5c63cf;
  }
}

/* ========== KPI 卡 ========== */
.kpiRow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}
.kpiTile {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 17px 19px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.85);
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.26s ease;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 3px;
    background: linear-gradient(#667eea, #764ba2);
  }
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 22px rgba(102, 126, 234, 0.13);
  }

  .kpiIcon {
    width: 40px;
    height: 40px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    font-size: 19px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: #fff;
    box-shadow: 0 4px 10px rgba(102, 126, 234, 0.28);
    flex-shrink: 0;
  }
  .kpiNum {
    font-size: 23px;
    font-weight: 800;
    line-height: 1.06;
    letter-spacing: -0.02em;
    color: #0f1729;
  }
  .kpiLabel {
    margin-top: 3px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(15, 23, 42, 0.48);
  }

  &.kpi-vendors::before,
  &.kpi-vendors .kpiIcon {
    background: linear-gradient(135deg, #60a5fa, #2563eb);
    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.27);
  }
  &.kpi-rate::before,
  &.kpi-rate .kpiIcon {
    background: linear-gradient(135deg, #34d399, #059669);
    box-shadow: 0 4px 10px rgba(5, 150, 105, 0.26);
  }
  &.kpi-wild::before,
  &.kpi-wild .kpiIcon {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    box-shadow: 0 4px 10px rgba(245, 158, 11, 0.3);
  }
}

/* ========== 表格卡片 ========== */
.tableCard {
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.07);
  box-shadow: 0 6px 28px rgba(15, 23, 42, 0.06);

  /* 宽度溢出时启用横向滚动，配合下方 fixed 左右双锚列保关键位常驻 */
  :deep(.t-table__content),
  :deep(.t-table__body),
  :deep(.t-enhanced-table__content) {
    overflow-x: auto !important;
    scrollbar-width: thin;
    scrollbar-color: var(--sb-thumb) transparent;
    &::-webkit-scrollbar {
      height: 9px;
    }
    &::-webkit-scrollbar-track {
      background: linear-gradient(to bottom, transparent, rgba(148, 163, 184, 0.08));
      border-radius: 999px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--sb-thumb);
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: padding-box;
      transition: background 0.18s ease;
      &:hover {
        background: var(--sb-thumb-hover);
        background-clip: padding-box;
        border: 2px solid transparent;
      }
    }
  }
  /* fixed 右键操作列左侧叠一层淡影提示“此处还有未滑出的右栏”，引导感更强 */
  :deep(.t-table__footer--fixed::before),
  :deep(tr > td:last-child.is-last-fixed-right-column)::before,
  :deep(.t-affix-right-shadow-cell) {
    box-shadow: -10px 0 16px -10px rgba(15, 23, 42, 0.25);
  }

  :deep(.t-empty) {
    padding: 56px 0;
  }
  :deep(.t-table) {
    background: transparent;
  }
  :deep(.t-table__header th) {
    padding: 14px 16px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(15, 23, 42, 0.5);
    background: #fafbff;
    border-bottom: 1px solid rgba(102, 126, 234, 0.18);
  }
  :deep(.t-table__body tr) {
    transition: background-color 0.18s ease;
    td {
      padding: 14px 16px;
      font-size: 13px;
      vertical-align: middle;
      color: rgba(15, 23, 42, 0.84);
      border-bottom: 1px solid rgba(15, 23, 42, 0.05);
    }
    &:last-of-type td {
      border-bottom: none;
    }
    &:hover td {
      background: rgba(102, 126, 234, 0.04) !important;
    }
  }

  /* ID 徽章 */
  .cellId {
    display: inline-block;
    min-width: 38px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(102, 126, 234, 0.09);
    color: #5566d4;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }

  /* 供应商彩签 */
  .vchip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 64px;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: #fff;
    white-space: nowrap;
  }

  /* 动作名标 */
  .actionTag {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    font-weight: 600;
    color: #20243a;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      box-shadow: 0 0 0 3px currentColor;
      opacity: 0.95;
      filter: brightness(1.05);
    }
  }
  .actDesc {
    margin: 4px 0 0 15px;
    font-size: 11px;
    color: rgba(15, 23, 42, 0.42);
    line-height: 1.4;
  }

  /* 型号显示 */
  .modelName {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    font-weight: 600;
    color: #394158;
    padding: 2px 9px;
    border-radius: 7px;
    background: rgba(148, 163, 184, 0.14);
  }
  .wildCard {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    font-weight: 600;
    color: #b5831b;
    padding: 2px 10px 2px 8px;
    border-radius: 999px;
    background: rgba(251, 191, 36, 0.14);
    border: 1px dashed rgba(245, 158, 11, 0.45);
    i {
      font-style: normal;
      color: #fbbf24;
    }
  }

  /* 倍率单元 */
  .rateCell {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 200px;
  }
  .rateRow {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  :deep(.numInput.t-input-number),
  :deep(.numInput.t-input) {
    width: 86px !important;
    border-radius: 8px !important;
    background: #f6f7fc !important;
    border: none !important;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    .t-input__inner {
      height: 30px !important;
      line-height: 30px !important;
      font-weight: 600 !important;
      text-align: center !important;
    }
    &:focus-within,
    &.t-is-focused {
      background: #fff !important;
      box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2), 0 2px 8px rgba(15, 23, 42, 0.05) !important;
    }
  }
  .effLine {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-size: 12.5px;
    color: rgba(15, 23, 42, 0.62);
    em {
      font-style: normal;
      color: rgba(15, 23, 42, 0.32);
      margin: 0 1px;
    }
    b.effNum {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.02em;
      background-image: linear-gradient(120deg, #764ba2, #667eea);
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-left: 2px;
    }
  }

  /* 迷你进度条 */
  .miniBar {
    position: relative;
    height: 6px;
    border-radius: 99px;
    background: rgba(148, 163, 184, 0.18);
    overflow: visible;
    max-width: 220px;
  }
  .barFill {
    height: 100%;
    border-radius: 99px;
    transition: width 0.36s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease;
    &.is-base {
      background: linear-gradient(90deg, #667eea, #764ba2);
    }
    &.is-discount {
      background: linear-gradient(90deg, #34d399, #059669);
    }
    &.is-premium {
      background: linear-gradient(90deg, #fbbf24, #ef4444);
    }
  }
  .barRef {
    position: absolute;
    left: 50%;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: rgba(15, 23, 42, 0.18);
    border-radius: 2px;
  }
  .effHint {
    font-size: 10.5px;
    color: rgba(15, 23, 42, 0.4);
    letter-spacing: 0.02em;
    b {
      color: #5c63cf;
      font-weight: 700;
    }
  }

  /* 删除按钮 */
  .opBtn {
    appearance: none;
    cursor: pointer;
    border: none;
    background: transparent;
    font-size: 12px;
    font-weight: 600;
    color: rgba(225, 29, 72, 0.78);
    padding: 4px 11px;
    border-radius: 999px;
    transition: all 0.2s ease;
    &:hover {
      background: rgba(239, 68, 68, 0.1);
      color: #dc2626;
      box-shadow: 0 3px 8px rgba(239, 68, 68, 0.18);
    }
  }
}

/* ========== 横向滚动兜底美化（数据极多时不致关键字段丢失）==========
   fixed:left/right 两列在内部滚动时仍贴边常驻，中部随需平移；
   滚动条染色贴合主题紫蓝系。放在独立顶层段以便命中组件深层节点。*/
:deep(.pricingWrap),
.pricingWrap {
  --sb-track: rgba(148, 163, 184, 0.14);
  --sb-thumb: rgba(124, 131, 255, 0.35);
  --sb-thumb-hover: rgba(118, 75, 162, 0.55);
}

/* 弹窗内提示与底栏 */
.tip-line {
  margin: 5px 0 0;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}
.dlg-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.3); }
}

/* ========== 响应式降级 ========== */
@media (max-width: 900px) {
  .pricingWrap {
    padding: 14px 14px 30px;
    gap: 12px;
  }
  .pageHead {
    .titleBadge { width: 38px; height: 38px; font-size: 18px; }
    .pageTitle { font-size: 18px; }
    .pageSub { display: none; }
  }
  .hintBar { font-size: 11.5px; }
  .tableCard {
    :deep(.t-table__body tr td) { padding-top: 10px; padding-bottom: 10px; }
    .rateCell { min-width: 170px; }
  }
}
@media (max-width: 720px) {
  .pageHead .actions { width: 100%; }
  :deep(.numInput.t-input-number) { width: 74px !important; }
}

/* 商用后台视觉覆盖：更紧凑的运营控制台布局 */
.pricingWrap {
  background: #f7f8fa;
  min-height: 100%;
  padding-top: 28px;
  .pricing-hero {
    padding: 0 0 22px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    border-bottom: 1px solid #e4e7ec;
  }
  .titleBadge { width: 38px; height: 38px; border-radius: 10px; background: #e8f0ff !important; color: #1d5fd1 !important; box-shadow: none !important; transform: none !important; font-size: 16px !important; font-weight: 800; }
  .pageTitle { font-size: 24px; color: #182033 !important; background: none !important; -webkit-text-fill-color: initial !important; }
  .pageSub { color: #697586 !important; max-width: 610px; font-size: 13px; }
  :deep(.solidBtn.t-button) { height: 36px !important; background: #1d5fd1 !important; box-shadow: none !important; }
  :deep(.ghostBtn.t-button) { height: 36px !important; background: #fff !important; border: 1px solid #d9dee7 !important; color: #344054 !important; box-shadow: none !important; }
  .hintBar { padding: 10px 14px; background: #eff6ff; border-color: #d9eaff; color: #385574; }
  .hintDot { background: #3b82f6; box-shadow: none; animation: none; }
  .kpiRow { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .kpiTile { min-height: 86px; padding: 14px; border-color: #e2e6ed; border-radius: 10px; box-shadow: none; background: #fff; }
  .kpiTile:hover { transform: none; box-shadow: 0 4px 12px rgba(16,24,40,.05); }
  .kpiTile::before { width: 3px; background: #1d5fd1; }
  .kpiTile .kpiIcon { width: 36px; height: 36px; border-radius: 8px; background: #e8f0ff; color: #1d5fd1; box-shadow: none; font-size: 10px; font-weight: 800; }
  .kpiTile .kpiNum { font-size: 22px; color: #172033; }
  .kpiTile .kpiLabel { color: #667085; }
  .kpiTile.kpi-vendors::before { background: #12a594; }.kpiTile.kpi-vendors .kpiIcon { background: #e6f7f4; color: #0d887b; }
  .kpiTile.kpi-rate::before { background: #e89b20; }.kpiTile.kpi-rate .kpiIcon { background: #fff6df; color: #b76e00; }
  .kpiTile.kpi-wild::before { background: #8a63d2; }.kpiTile.kpi-wild .kpiIcon { background: #f2edff; color: #7351b7; }
  .tableCard { border-color: #e2e6ed; border-radius: 12px; box-shadow: none; }
  .ruleTableHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 17px 18px; border-bottom: 1px solid #e9ecf1; h3 { margin: 0; color: #182033; font-size: 15px; } p { margin: 4px 0 0; color: #7a8495; font-size: 12px; } }
  .ruleCount { padding: 4px 9px; color: #526174; background: #f2f4f7; border-radius: 6px; font-size: 12px; white-space: nowrap; }
  :deep(.t-table__header th) { background: #fafbfc; border-bottom-color: #e6eaf0; color: #667085; }
  :deep(.t-table__body tr:hover td) { background: #f7faff !important; }
  .cellId { color: #1d5fd1; background: #e8f0ff; }
  .vchip { box-shadow: none !important; }
  .effLine b.effNum { color: #1d5fd1; background: none; -webkit-text-fill-color: initial; }
  .opBtn { color: #c2414a; }
  @media (max-width: 900px) { .kpiRow { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 520px) { .kpiRow { grid-template-columns: 1fr; } .ruleTableHead { align-items: flex-start; flex-direction: column; } }
}
</style>
