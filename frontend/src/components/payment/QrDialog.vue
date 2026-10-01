<template>
  <teleport to="body">
    <transition name="qr-fade">
      <div v-if="modelValue" class="pay-overlay" @click.self="handleBackdropClick">
        <transition name="qr-scale" appear>
          <div v-if="modelValue" class="pay-modal">
            <!-- 关闭 -->
            <div class="pay-close" @click="handleCancel">×</div>

            <!-- 商品摘要 -->
            <div class="qr-summary">
              <div v-if="packageName" class="pkg-name">{{ packageName }}</div>
              <div v-if="displayAmount !== ''" class="amt">¥{{ displayAmount }}</div>
              <span v-if="channelLabel" class="channel-tag">{{ channelLabel }}</span>
            </div>

            <!-- 二维码区 -->
            <div class="qr-wrap">
              <img v-if="qrImgSrc" :src="qrImgSrc" alt="收款二维码" />
              <p v-show="!paid && !expired && !qrImgSrc && rendering" class="rendering">生成中…</p>
              <transition name="qr-fade">
                <div v-if="paid" class="paid-mask">
                  <svg viewBox="0 0 52 52" width="60" height="60">
                    <circle cx="26" cy="26" r="25" fill="none" stroke="#00a870" stroke-width="2" />
                    <path fill="none" stroke="#00a870" stroke-width="4" stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M14 27l8 8 16 -16"
                      style="stroke-dasharray:48;stroke-dashoffset:48;animation:dashdraw .55s ease forwards;" />
                  </svg>
                  <span>支付成功</span>
                </div>
              </transition>
              <transition name="qr-fade">
                <div v-if="expired && !paid" class="expired-mask">订单已过期</div>
              </transition>
            </div>

            <!-- 状态提示 -->
            <div v-if="!paid && !expired" class="status-line">{{ statusLine }}</div>

            <!-- 倒计时进度条 -->
            <div v-if="!paid && !expired" class="countdown-row">
              <div class="progress-track"><i :style="{ width: progressPct + '%' }"></i></div>
              <span>剩余 {{ mmss }}</span>
            </div>

            <!-- 操作按钮 -->
            <div class="actions">
              <button
                v-if="isAdmin && isSimulate && !paid && !expired"
                type="button"
                class="btn-dev"
                :disabled="triggering || polling || paid || expired"
                @click="manualTriggerSimPay"
              >
                {{ triggering ? "处理中…" : "[开发] 模拟已付款" }}
              </button>
              <button
                type="button"
                class="btn-refresh"
                :disabled="polling || paid || triggering || expired"
                @click="pollOnce(true)"
              >
                {{ polling ? "查询中…" : "我已完成支付" }}
              </button>
              <button type="button" class="btn-cancel" @click="handleCancel">取消</button>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import QRCode from "qrcode";
import axios from "@/utils/axios";
import { MessagePlugin } from "tdesign-vue-next";
import userStore from "@/stores/user";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    outTradeNo: string;
    qrContent?: string;
    channel?: string;
    expiresAt?: string | null;
    amount?: number | string | null;
    packageName?: string;
  }>(),
  {
    qrContent: "",
    channel: "simulate",
    expiresAt: null,
    amount: "",
    packageName: "",
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "paid", payload: any): void;
  (e: "cancel"): void;
}>();

const usStore = userStore();
const isAdmin = computed(() => usStore.role === "admin");

/* ── 二维码渲染：qrcode 库把渠道返回的内容串编码成 dataURL 图片 ── */
const qrImgSrc = ref("");
const rendering = ref(false);
async function renderQR(): Promise<void> {
  if (!props.qrContent) {
    rendering.value = false;
    return;
  }
  rendering.value = true;
  try {
    qrImgSrc.value = await QRCode.toDataURL(props.qrContent, {
      margin: 1,
      width: 240,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch (err) {
    console.error("[QrDialog] renderQR 失败:", err);
    MessagePlugin.error("二维码生成失败，请重试");
  } finally {
    rendering.value = false;
  }
}

/* ── 渠道文案与金额展示 ── */
const CHANNEL_LABELS: Record<string, string> = {
  simulate: "模拟支付",
  alipay: "支付宝",
  wechat: "微信支付",
  aggr: "聚合收款",
};
const channelLabel = computed(() => CHANNEL_LABELS[props.channel] || "");
const isSimulate = computed(() => props.channel === "simulate");
const displayAmount = computed(() => {
  const a = props.amount as unknown as number | string | null | undefined;
  if (a == null || a === "") return "";
  const n = Number(a);
  return Number.isNaN(n) ? String(a) : n.toFixed(2);
});
const statusLine = computed(() => {
  if (isSimulate.value)
    return isAdmin.value
      ? "请使用下方 [开发] 模拟已付款 按钮触发放款"
      : "等待系统确认支付（演示模式）";
  return `请使用 ${channelLabel.value} 扫描上方二维码完成支付`;
});

/* ── 倒计时（基于 expires_at，缺省按下单后15分钟兜底）── */
const TOTAL_MS = 15 * 60 * 1000;
const nowTick = ref(Date.now());
// setInterval 的返回类型在 DOM 与 @types/node 并存时重载不一致，统一用 any 兜底规避类型冲突
let tickTimer: any = undefined;

function startTick(): void {
  stopTick();
  nowTick.value = Date.now();
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
}
function stopTick(): void {
  if (tickTimer !== undefined) clearInterval(tickTimer);
  tickTimer = undefined;
}

const expireMs = computed<number>(() => {
  const ex = props.expiresAt;
  if (typeof ex === "string" && ex) {
    const ms = new Date(ex).getTime();
    if (!Number.isNaN(ms)) return Math.max(ms, Date.now());
  }
  return Date.now() + TOTAL_MS;
});
const remainingSec = computed(() =>
  Math.max(0, Math.floor((expireMs.value - nowTick.value) / 1000)),
);
const mmss = computed(() => {
  const t = remainingSec.value;
  const m = String(Math.max(0, Math.floor(t / 60))).padStart(2, "0");
  const s = String(((t % 60) + 60) % 60).padStart(2, "0");
  return `${m}:${s}`;
});
const progressPct = computed(() => {
  const remain = Math.max(0, Math.min(TOTAL_MS, expireMs.value - nowTick.value));
  const elapsed = TOTAL_MS - remain;
  return Math.min(100, Math.max(0, Math.round((elapsed / TOTAL_MS) * 100)));
});
const expired = ref(false);

/* ── 轮询订单状态兜底(socket 未接时仍能拿到最终态) ── */
let pollTimer: any = undefined;
const polling = ref(false);
const triggering = ref(false);
const paid = ref(false);

// expired 翻转成 true 时执行一次性收尾与提醒（paid 场景由 handlePaid 单独处理）
watch(
  () => expired.value,
  (v:boolean) => {
    if (v && !paid.value) {
      stopPollTimer();
      stopTick();
      MessagePlugin.warning("订单已超时未付，可重新发起购买");
    }
  },
);

function detectExpiredSnapshot(): boolean {
  // 每秒由 nowTick 变化驱动计算属性自动收敛；这里仅补第一帧边界态
  if (!paid.value && expireMs.value - Date.now() <= 0) {
    expired.value = true;
    return true;
  }
  return false;
}

async function fetchStatus(): Promise<void> {
  try {
    const res: any = await axios.get(`/pay/status/${encodeURIComponent(props.outTradeNo)}`);
    const st: unknown = res?.data?.status;
    if (st === "paid") {
      handlePaid((res?.data ?? {}) as Record<string, unknown>);
    }
  } catch (err) {
    console.error("[QrDialog] 查询订单状态失败:", err);
  }
}

async function pollOnce(manual=false): Promise<void> {
  if (polling.value || paid.value || expired.value) return;
  polling.value = true;
  try {
    await fetchStatus();
    if (!paid.value && manual) {
      MessagePlugin.info("尚未收到支付完成回调，请稍候或检查扫码是否成功");
    }
  } finally {
    polling.value = false;
  }
}

async function loopPoll(): Promise<void> {
  stopPollTimer();
  await pollOnce(false).catch(()=>{ /* 忽略首查瞬时网络抖动 */ });
  if (!paid.value && !expired.value) {
    pollTimer = setInterval(pollOnce, 2500);
  }
}
function stopPollTimer(): void {
  if (pollTimer !== undefined) clearInterval(pollTimer);
  pollTimer = undefined;
}

/* 到账处理：停止轮询 / 倒计时、刷新全局角标、延迟 emit 让用户看到对勾动画 */
function handlePaid(payload: Record<string, unknown>): void {
  if (paid.value) return;
  paid.value = true;
  stopPollTimer();
  stopTick();
  const amtRaw = payload.amount;
  const amtStr =
    amtRaw != null && amtRaw !== "" && !Number.isNaN(Number(amtRaw))
      ? ` · ¥${Number(amtRaw).toFixed(2)}`
      : "";
  MessagePlugin.success(`支付成功${amtStr} · 权益已下发`);
  try { void usStore.refreshProfile(); } catch {}
  setTimeout(() => emit("paid", payload), 1200);
}

/* 开发者手工触发模拟付款(admin only)：直连 _dev/trigger 触发后端发放漏斗 */
async function manualTriggerSimPay(): Promise<void> {
  if (!isAdmin.value || paid.value || expired.value) return;
  triggering.value = true;
  try {
    // axios.baseURL 已含 /api 前缀，此处直接用相对路径避免重复拼接
    const resp: any = await axios.get(`/pay/_dev/trigger/${encodeURIComponent(props.outTradeNo)}`);
    MessagePlugin.success(resp?.data?.message || "已模拟付款并下发权益");
    setTimeout(() => void pollOnce(false), 300);
  } catch (err:any) {
    MessagePlugin.error(err?.message || err?.response?.data?.message || "模拟付款失败");
  } finally {
    triggering.value = false;
  }
}

/* 关闭 & 取消清理：到账跳转中禁止手动关闭以免打断权益落地的展示节奏 */
function closeDialog(): void {
  if (paid.value) return;
  emit("update:modelValue", false);
}
function handleCancel(): void {
  if (paid.value) return;
  emit("cancel");
  closeDialog();
}
function handleBackdropClick(): void {
  if (paid.value) return;
  handleCancel();
}
function teardownAll(): void {
  stopPollTimer();
  stopTick();
}
onUnmounted(teardownAll);

/* 打开时复位状态、渲染码图、启动倒计时 + 首查轮询；关闭时清干净定时器 */
watch(
  () => props.modelValue,
  async (open:boolean) => {
    if (open) {
      resetForOpen();
      detectExpiredSnapshot();
      startTick();
      await renderQR().catch(()=>{ });
      void loopPoll();
    } else {
      teardownAll();
    }
  },
  { immediate:true },
);

// 弹窗打开期间若码内容变化则重新渲染
watch(
  () => props.qrContent,
  async (v:string) => {
    if (props.modelValue && v) await renderQR().catch(()=>{ });
  },
);

/** 复位为待支付的初始态：每次唤起都从干净状态开始，避免上轮残留影响展示与轮询判定 */
function resetForOpen(): void {
  rendering.value=true; paid.value=false; expired.value=false;
  polling.value=false; triggering.value=false; qrImgSrc.value="";
}
</script>

<style scoped lang="scss">
.pay-overlay{
  position:fixed;inset:0;background:rgba(0,0,0,.45);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  display:flex;align-items:center;justify-content:center;z-index:10001;padding:20px;
}
.pay-modal{
  position:relative;width:min(420px,94vw);background:#fff;border-radius:18px;
  border:.5px solid rgba(255,255,255,.6);
  box-shadow:0 24px 64px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.8);
  padding:26px 26px 22px;display:flex;flex-direction:column;align-items:center;text-align:center;
}
.pay-close{
  position:absolute;top:12px;right:12px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.06);
  display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;color:rgba(0,0,0,.4);cursor:pointer;user-select:none;
 &:hover{background:rgba(0,0,0,.1);color:rgba(0,0,0,.7);}
 [data-theme-mode="dark"] &{background:rgba(255,255,255,.08);color:rgba(255,255,255,.5);}
}
.qr-summary{text-align:center;margin-bottom:16px;display:flex;flex-direction:column;align-items:center;gap:4px;
 .pkg-name{font-size:13px;color:#888;}
 .amt{font-size:30px;font-weight:700;color:#ff9a5c;line-height:1.25;}
 .channel-tag{font-size:11px;color:#999;background:rgba(0,0,0,.04);padding:1px 8px;border-radius:10px;}
}
.qr-wrap{
  position:relative;width:240px;height:240px;margin:4px auto;background:#fff;border-radius:10px;border:1px solid rgba(0,0,0,.08);box-sizing:border-box;padding:8px;
 img{width:224px;height:224px;object-fit:contain;display:block;}
 p.rendering{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#aaa;font-size:13px;width:max-content;margin:0;}
}
.paid-mask,.expired-mask{
  position:absolute;inset:8px;background:rgba(255,255,255,.95);border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#00a870;font-weight:600;font-size:16px;
}
.expired-mask{color:#e34d59;}

.status-line{text-align:center;font-size:13px;color:#666;margin-top:14px;line-height:1.5;padding:0 10px;}
.countdown-row{margin-top:12px;width:88%;display:flex;align-items:center;justify-content:center;gap:8px;color:#999;font-size:11px;
 .progress-track{flex:1;height:3px;background:rgba(0,0,0,.08);border-radius:99px;overflow:hidden;i{display:block;height:100%;width:0%;border-radius:inherit;background:linear-gradient(90deg,#ffb38d,#ff6b35);transition:width .35s linear;}}
 span:last-child{white-space:nowrap;}
}

.actions{margin-top:20px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;width:100%;}
.actions button{height:36px;padding:0 16px;font-size:13px;font-weight:500;border:none;border-radius:9px;cursor:pointer;transition:.2s;&:disabled{opacity:.55;cursor:not-allowed;}}
.btn-dev{background:#fff7ed!important;color:#ff6b35;border:1px solid #ffd1b3!important;&:hover:not(:disabled){background:#ffeacc!important;}}
.btn-refresh{background:linear-gradient(135deg,#0052d9,#0066ff);color:#fff;box-shadow:0 4px 12px rgba(0,82,217,.22);&:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 16px rgba(0,82,217,.32);}}
.btn-cancel{background:rgba(0,0,0,.05);color:rgba(0,0,0,.55);&:hover:not(:disabled){background:rgba(0,0,0,.1);}}

@keyframes dashdraw{to{stroke-dashoffset:0;}}

.qr-scale-enter-active{transition:all .28s cubic-bezier(.16,1,.3,1);}
.qr-scale-leave-active{transition:all .18s ease;}
.qr-scale-enter-from{opacity:0;transform:scale(.93);}
.qr-scale-leave-to{opacity:0;transform:scale(.96);}
.qr-fade-enter-active,.qr-fade-leave-active{transition:opacity .25s ease;}
.qr-fade-enter-from,.qr-fade-leave-to{opacity:0;}
</style>

