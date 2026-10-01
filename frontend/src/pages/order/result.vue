<template>
  <div class="order-result-page">
    <!-- 加载中 -->
    <div v-if="phase === 'loading'" class="state-card">
      <t-loading size="48px" />
      <h3>正在查询订单状态…</h3>
      <p class="muted">订单号 {{ trade || "-" }}</p>
    </div>

    <!-- 等待支付 -->
    <div v-else-if="phase === 'pending'" class="state-card pending">
      <svg viewBox="0 0 64 64" width="72" height="72" fill="none">
        <circle cx="32" cy="32" r="28" stroke="#0052d9" stroke-width="2" opacity=".25" />
        <path d="M32 18v14l10 6" stroke="#0052d9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <h3>等待支付完成</h3>
      <p v-if="detail?.amount != null" class="amount">¥{{ Number(detail.amount).toFixed(2) }}</p>
      <p v-if="detail?.packageName" class="pkg">{{ detail.packageName }}</p>
      <p class="muted">请回到支付页面扫码付款，系统检测到回调后将自动到账。</p>

      <transition name="fade">
        <p v-if="countdownText && !expiredLocal" class="hint">订单将在 {{ countdownText }} 后过期</p>
        <p v-else-if="expiredLocal" class="hint danger">该订单已过期，可重新发起购买</p>
      </transition>

      <button type="button" class="btn primary" @click="manualRefresh">立即刷新</button>
      <button type="button" class="btn ghost" @click="$router.push('/myPoints')">查看积分明细</button>
    </div>

    <!-- 支付成功 -->
    <div v-else-if="phase === 'success'" class="state-card success">
      <svg viewBox="0 0 52 52" width="80" height="80">
        <circle cx="26" cy="26" r="25" fill="none" stroke="#00a870" stroke-width="2" />
        <path d="M14 27l8 8 16 -16" fill="none" stroke="#00a870" stroke-width="5"
          stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:50;animation:draw .55s ease forwards;"/>
      </svg>
      <h3>支付成功 · 权益已生效</h3>
      <div v-if="summaryRows.length" class="summary-grid">
        <template v-for="(r, i) in summaryRows" :key="i">
          <span class="k">{{ r.k }}</span><span class="v">{{ r.v }}</span>
        </template>
      </div>
      <p class="balance-row">
        当前积分余额：
        <b>{{ currentPoints }}</b>
      </p>
      <div class="cta-group">
        <button type="button" class="btn ghost" @click="$router.push('/myPoints')">查看积分明细 / 会员状态</button>
        <button type="button" class="btn primary" @click="$router.push('/project')">返回创作台</button>
      </div>
    </div>

    <!-- 失败/过期/不存在 -->
    <div v-else class="state-card fail">
      <svg viewBox="0 0 56 56" width="76" height="76">
        <circle cx="28" cy="28" r="27" fill="none" stroke="#e34d59" stroke-width="2" opacity=".25"/>
        <path d="M16 16 L40 40 M40 16 L16 40" stroke="#e34d59" stroke-width="4" stroke-linecap="round"/>
      </svg>
      <h3>{{ phase === 'expired' ? '订单已过期' : '未找到此订单' }}</h3>
      <p class="muted">{{ errorMsg }}</p>
      <div class="cta-group">
        <button type="button" class="btn primary" @click="$router.push('/project')">返回创作台</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import axios from "@/utils/axios";
import userStore from "@/stores/user";

const route = useRoute();
const usStore = userStore();

const trade = computed(() => String(route.params.trade || ""));
type Phase = "loading" | "pending" | "success" | "fail" | "expired" | "missing";
const phase = ref<Phase>("loading");
const detail = ref<any>(null);
const errorMsg = ref("");
const expiredLocal = ref(false);

const nowTick = ref(Date.now());
let pollTimer: ReturnType<typeof setInterval> | undefined;
let tickTimer: ReturnType<typeof setInterval> | undefined;

const summaryRows = computed(() => {
  if (!detail.value) return [];
  const rows: Array<{ k: string; v: string }> = [];
  const pkgName: string =
    detail.value.package_name ||
    detail.value.packageName ||
    detail.value.subject ||
    "";
  if (pkgName) rows.push({ k: "商品", v: String(pkgName) });
  if (detail.value.amount != null)
    rows.push({ k: "金额", v: `¥${Number(detail.value.amount).toFixed(2)}` });
  if (detail.value.points_total)
    rows.push({ k: "积分", v: `${Number(detail.value.points_total)} 分` });
  return rows;
});

/* 当前积分：优先使用 store 刚被 refreshProfile 更新的权威值 */
const currentPoints = ref<number>(usStore.userPoints ?? 0);


async function fetchDetail(): Promise<void> {
  try {
    const res: any = await axios.get(`/pay/status/${encodeURIComponent(trade.value)}`);
    detail.value = res?.data || ({});
    const st: unknown = res?.data?.status;
    if (st === "paid") { phase.value = "success"; await refreshBalance(); stopTimers(); return; }
    if (st === "pending") { phase.value = "pending"; startPollingIfNeeded(); recomputeExpiryTick(); return; }
    if (st === "refunded") { phase.value = "fail"; errorMsg.value = String(res.data?.reason || "已退款"); stopTimers(); return; }
    if (st === "expired") { phase.value = "expired"; errorMsg.value = "超时未支付"; stopTimers(); return; }
    // 无明确状态或订单不存在：统一落到 missing 态供用户回退操作
    phase.value = "missing";
    errorMsg.value = "可能链接不正确或已被清理";
    stopTimers();
  } catch (e:any) {
    console.error("[result] 查询失败", e);
    phase.value = "missing";
    errorMsg.value = e?.message || "网络异常";
    stopTimers();
  }
}

async function refreshBalance(): Promise<void> {
  try {
    void usStore.refreshProfile().then(() => {
      currentPoints.value = usStore.userPoints ?? 0;
    });
  } catch {}
}

async function manualRefresh() {
  pollingPaused = false;
  void fetchDetail();
}

let pollingPaused = false;

function startPollingIfNeeded() {
  stopPollTimer();
  if (pollingPaused) return;
  pollTimer = setInterval(async () => {
    if (pollingPaused) return;
    pollingPaused = true;
    try {
      await fetchDetail();
    } finally {
      pollingPaused = false;
    }
  }, 3000);
}
function stopPollTimer() {
  if (pollTimer !== undefined) clearInterval(pollTimer);
  pollTimer = undefined;
}

function stopTimers() {
  stopPollTimer();
  if (tickTimer !== undefined) clearInterval(tickTimer);
  tickTimer = undefined;
}

// 倒计时文本（基于 expires_at）
const expiresMs = computed<number>(() => {
  if (detail.value?.expiresAt || detail.value?.expires_at) {
    const ms = new Date(detail.value.expiresAt || detail.value.expires_at).getTime();
    if (!isNaN(ms)) return ms;
  }
  return Date.now(); // 无信息视为已到期隐藏倒计时
});
const countdownText = computed<string>(() => {
  const remain = Math.max(0, expiresMs.value - nowTick.value);
  const sec = Math.floor(remain / 1000);
  if (sec <= 0) {
    expiredLocal.value = true;
    return "";
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
});
function recomputeExpiryTick() {
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
}

onMounted(async () => {
  nowTick.value = Date.now();
  await refreshBalance();
  await fetchDetail();
});
onUnmounted(stopTimers);
</script>

<style lang="scss" scoped>
.order-result-page{
  min-height:60vh;display:flex;align-items:center;justify-content:center;padding:32px 24px;
}
.state-card{
  width:min(520px,100%);background:#fff;border-radius:20px;border:1px solid rgba(0,0,0,.06);
  box-shadow:0 12px 36px rgba(0,0,0,.06);padding:44px 32px;display:flex;flex-direction:column;
  align-items:center;text-align:center;gap:10px;
  h3{font-size:22px;font-weight:700;color:#1a1a1a;margin:6px 0;}
  .amount{font-size:34px;font-weight:700;color:#ff9a5c;line-height:1.2;margin-top:-4px;}
  .pkg{font-size:13px;color:#666;font-weight:500;}
  .muted{font-size:13px;color:#999;line-height:1.7;margin-top:4px;max-width:380px;}
  .hint{margin-top:10px;font-size:13px;color:#666;&.danger{color:#e34d59;}}

  &.pending svg,&.pending h3 + *{ color:#0052d9;}

  /* 成功页摘要 */
  .summary-grid{
    margin:18px auto 4px;width:88%;display:grid;grid-template-columns:auto 1fr;gap:8px 24px;padding:16px 22px;background:rgba(102,126,234,.05);border-radius:12px;
    span.k{text-align:left;font-size:13px;color:#888;}
    span.v{text-align:right;font-size:15px;font-weight:600;color:#333;}
  }

  .balance-row{margin:6px 0 4px;font-size:14px;color:#666;b{color:#667eea;font-weight:700;font-size:18px;}}
  .cta-group{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:18px;}
}

.btn{
  height:42px;padding:0 22px;border:none;border-radius:11px;font-size:14px;font-weight:600;cursor:pointer;transition:.25s;
}
.btn.primary{background:linear-gradient(135deg,#0052d9,#0066ff);color:#fff;box-shadow:0 6px 16px rgba(0,82,217,.25);&:hover:not(:disabled){box-shadow:0 8px 20px rgba(0,82,217,.35);transform:translateY(-1px);}}
.btn.ghost{background:rgba(0,0,0,.04);color:#555;border:1px solid rgba(0,0,0,.08)!important;&:hover{background:rgba(0,0,0,.08);}}


@keyframes draw{from{stroke-dashoffset:50}to{stroke-dashoffset:0}}
.fade-enter-active,.fade-leave-active{transition:opacity .3s ease;}
.fade-enter-from,.fade-leave-to{opacity:0;}
</style>

