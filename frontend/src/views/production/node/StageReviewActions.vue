<template>
  <div class="stageReview nowheel nodrag">
    <span :class="{ approved }">{{ approved ? "✓ 已审核" : content ? "内容已就绪 · 待你审核" : "与导演助理讨论后起草，再由你审核" }}</span>
    <div>
      <button type="button" :disabled="busy || !connected || (stage === 'storyboardTable' && !planApproved)" @click="requestDraft">
        {{ content ? "请助理调整" : "请助理起草" }}
      </button>
      <button
        type="button"
        class="approve"
        :disabled="busy || !content || approved || (stage === 'storyboardTable' && !planApproved)"
        @click="approve">
        {{ saving ? "保存中…" : approved ? "已确认" : stage === "scriptPlan" ? "确认导演方案" : "确认分镜表" }}
      </button>
    </div>
    <small v-if="error" role="alert">{{ error }}</small>
    <small v-else>
      {{
        stage === "storyboardTable" && !planApproved
          ? "先审核导演计划，再制定镜头清单。"
          : "在助理输入框发送后才调用模型；审核不扣积分，修改后需重新审核。"
      }}
    </small>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import productionAgentStore from "@/stores/productionAgent";
const props = defineProps<{ stage: "scriptPlan" | "storyboardTable" }>();
const emit = defineEmits<{ (e: "compose"): void }>();
const store = productionAgentStore();
const saving = ref(false),
  error = ref("");
const content = computed(() => store.flowData[props.stage]?.trim());
const connected = computed(() => store.connected);
const busy = computed(() => saving.value || store.status === "pending" || store.status === "streaming");
const planApproved = computed(() => store.flowData.reviewState?.planApproved);
const approved = computed(() => (props.stage === "scriptPlan" ? planApproved.value : store.flowData.reviewState?.tableApproved));
async function requestDraft() {
  error.value = "";
  store.assistantDraft =
    props.stage === "scriptPlan"
      ? "请根据本集剧本和我的创作偏好起草导演计划。明确场景固定布局、人物服装、光线、空间轴线、节奏和镜头意图，写入 scriptPlan。本次只完成计划，等待我审核，不创建镜头或生成媒体。"
      : "请依据已审核导演计划制定完整分镜表，写入 storyboardTable。每镜包含时长、景别、动作、运镜、声音、场景及人物资产ID、起始状态/结束状态/出入画方向，以及和上一镜的关系（切镜/连续动作/换场景）。只写分镜表，等待我审核，不生成媒体。";
  window.dispatchEvent(new CustomEvent("production:open-assistant"));
  emit("compose");
}
async function approve() {
  saving.value = true;
  error.value = "";
  try {
    await store.approveStage(props.stage);
    window.dispatchEvent(new CustomEvent("production:stage-approved", { detail: { stage: props.stage } }));
  } catch (e: any) {
    error.value = e?.message || "审核保存失败，请重试";
  } finally {
    saving.value = false;
  }
}
</script>
<style scoped>
.stageReview {
  margin: 12px 0;
  padding: 12px;
  border: 1px solid #eee2d8;
  border-radius: 10px;
  background: #fcf8f4;
  font-size: 12px;
  color: #9a745e;
}
.stageReview > span {
  display: block;
  margin-bottom: 9px;
}
.stageReview .approved {
  color: #518265;
}
.stageReview > div {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
button {
  padding: 6px 10px;
  border: 1px solid #e4d6cb;
  border-radius: 7px;
  background: #fff;
  color: #796252;
  cursor: pointer;
}
.approve {
  background: #b85a33;
  border-color: #b85a33;
  color: #fff;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
small {
  display: block;
  margin-top: 8px;
  line-height: 1.6;
}
</style>
