<template>
  <div class="rightChatBox nowheel nodrag nopan" :class="{ docked }" :style="docked ? undefined : { width: boxWidth + 'px' }">
    <div v-if="!docked" ref="resizeHandleRef" class="resizeHandle"></div>
    <div class="header">
      <div class="assistantIdentity">
        <span class="directorMark"><i-movie theme="outline" size="19" /></span>
        <span class="identityCopy">
          <small>导演助理 · 本集协作</small>
          <strong :title="props.title">{{ props.title || "片场导演助理" }}</strong>
        </span>
      </div>
      <div class="headerActions">
        <span class="connectionState" :class="{ online: connected }" :title="connected ? '已连接' : '重连中'"><i /></span>
        <button type="button" class="close" aria-label="收起导演助理" title="收起导演助理" @click.stop="emit('close')">
          <i-click-to-fold size="16" />
        </button>
      </div>
    </div>
    <section class="assistantTaskBrief">
      <p>{{ taskBrief }}</p>
      <div class="assistantProgress">
        <span>计划 {{ flowData.reviewState?.planApproved ? "已确认" : "待确认" }}</span>
        <span>分镜表 {{ flowData.reviewState?.tableApproved ? "已确认" : "待确认" }}</span>
        <span>画面 {{ flowData.storyboard.filter((f) => f.src).length }}/{{ flowData.storyboard.length }}</span>
      </div>
      <div class="assistantTasks">
        <button v-for="task in tasks" :key="task.title" type="button" :disabled="isBusy" @click="prepareTask(task.prompt)">
          {{ task.title }}
          <span>↗</span>
        </button>
      </div>
      <small>点击任务填入要求，确认后发送。</small>
    </section>
    <div class="agentStrip">
      <span class="agentStripLabel">模型</span>
      <fieldset class="agentModelField" :disabled="status === 'streaming' || status === 'pending'">
        <modelSelect v-model="assistantTextModel" type="text" size="small" :show-price-hint="false" />
      </fieldset>
      <span class="agentStripTip">规划与分镜共用</span>
    </div>
    <div class="chatBox">
      <div ref="historyRef" class="directorChatHistory" v-loading="loadingHistory" @scroll="onHistoryScroll">
        <AssistantMessage v-for="message in messages" :key="message.id" :message="message" @suggestion="handleSuggestion" />
        <div class="historyTail" aria-hidden="true"></div>
      </div>
      <div v-if="chatError" class="chatErrorCard" role="alert">
        <span class="errorDot">!</span>
        <span class="errorText">{{ chatError }}</span>
        <button type="button" @click="productionAgentStore().reconnect()">重连</button>
      </div>
      <t-chat-sender
        class="inputBox"
        :disabled="status === 'pending' || status === 'streaming' || !connected"
        v-model="inputValue"
        :loading="status === 'pending' || status === 'streaming'"
        placeholder="例如：检查第 2 镜床的位置，只修改这一镜"
        @send="handleSend"
        @stop="handleStop">
        <template #footer-prefix>
          <div class="ac" style="gap: 5px">
            <ModelCostHint v-if="agentModelName" :model="agentModelName" type="text" :input-length="inputValue.length" compact />
            <t-popup trigger="click" placement="top-left">
              <t-button shape="square" variant="outline" size="small">
                <template #icon>
                  <i-setting-config size="16" />
                </template>
              </t-button>
              <template #content>
                <div class="settingMenu">
                  <div class="settingMenuItem" @click="handleReconnect()">
                    <i-api size="14" />
                    <span>{{ $t("workbench.scriptAgent.reconnect") }}</span>
                  </div>
                  <div class="settingMenuItem" @click="handleClearMemory('message')">
                    <i-delete size="14" />
                    <span>{{ $t("workbench.production.chatBox.clearMessageMemory") }}</span>
                  </div>
                  <div class="settingMenuItem" @click="handleClearMemory('summary')">
                    <i-close size="14" />
                    <span>{{ $t("workbench.production.chatBox.clearSummaryMemory") }}</span>
                  </div>
                  <div class="settingMenuItem danger" @click="handleClearMemory('all')">
                    <i-delete-one size="14" />
                    <span>{{ $t("workbench.production.chatBox.clearAllMemory") }}</span>
                  </div>
                </div>
              </template>
            </t-popup>
            <t-popup trigger="click" placement="top" v-if="showThink">
              <t-button size="small" variant="outline" :theme="(['default', 'success', 'warning', 'danger'] as const)[thinkLevel] || 'default'">
                <template #icon>
                  <i-tips size="16" />
                </template>
                {{ thinkLevelOptions[thinkLevel]?.label }}
              </t-button>
              <template #content>
                <div class="settingMenu">
                  <div
                    v-for="opt in thinkLevelOptions"
                    :key="opt.value"
                    class="settingMenuItem"
                    :class="{ active: thinkLevel === opt.value }"
                    @click="productionAgentStore().updateThinkConfig(opt.value)">
                    <span>{{ opt.label }}</span>
                  </div>
                </div>
              </template>
            </t-popup>
          </div>
        </template>
      </t-chat-sender>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMousePressed, useMouse } from "@vueuse/core";
import _ from "lodash";
import axios from "@/utils/axios";
import productionAgentStore from "@/stores/productionAgent";
import projectStore from "@/stores/project";
import ModelCostHint from "@/components/ModelCostHint.vue";
import AssistantMessage from "./AssistantMessage.vue";
const { project } = storeToRefs(projectStore());
const { connected, messages, status, lastError, episodesId, loadingHistory, thinkLevel, assistantTextModel, assistantDraft, flowData } =
  storeToRefs(productionAgentStore());
const thinkLevelOptions = [
  { label: $t("workbench.scriptAgent.thinkLevel.off"), value: 0 },
  { label: $t("workbench.scriptAgent.thinkLevel.light"), value: 1 },
  { label: $t("workbench.scriptAgent.thinkLevel.deep"), value: 2 },
  { label: $t("workbench.scriptAgent.thinkLevel.extreme"), value: 3 },
];

const props = defineProps<{ title?: string; docked?: boolean; stage?: "planning" | "frames" | "video" | "edit" }>();

const emit = defineEmits(["close"]);

const inputValue = ref("");
const isBusy = computed(() => status.value === "pending" || status.value === "streaming");
const taskBrief = computed(
  () =>
    ({
      planning: "当前：镜头规划。协助起草导演计划、拆分镜头并补齐镜头记录。",
      frames: "当前：分镜画面。核对布局与动作设定；实际画面对照请点镜头上的「对照衔接」。",
      video: "当前：视频制作。协助写动作与运镜、梳理参考素材；模型与生成方式由你在制作区选择。",
      edit: "当前：剪辑成片。协助梳理镜头顺序和节奏，采用版本及合成在制作区、剪辑台操作。",
    })[props.stage || "planning"],
);
const tasks = computed(() => {
  const common = {
    title: "修正指定问题",
    prompt:
      "读取当前工作区和最近一次报告，只修复我明确要求处理的具体镜头或设定问题，保留无关内容、镜头ID和已有媒体版本。没有明确修改对象时先询问，不自行重写整集或生成图片视频。完成后只说明修改位置和结果。",
  };
  switch (props.stage) {
    case "frames":
      return [
        {
          title: "核对空间与动作设定",
          prompt:
            "读取本集分镜与 continuity 设定，只检查床、门、窗及道具的固定布局、人物站位、动作起止和前后衔接。最多列3个有依据的问题及镜号，不重做导演计划。不生成媒体。这里是文字设定核对，未读取实际图片时不得声称画面检查通过；引导我在对应镜头的对照衔接中查看图片。",
        },
        common,
      ];
    case "video":
      return [
        {
          title: "整理指定镜头的动作与运镜",
          prompt:
            "请协助整理视频动作与运镜描述。先读取本集现有镜头及衔接设定，询问我想调整哪一个镜号，再只给该镜可复制的提示词，写清动作开始、结束、人物位置与镜头运动。不要擅自更改视频模型、模式、参考图、采用版本或提交生成。",
        },
        {
          title: "梳理参考素材用法",
          prompt:
            "读取本集角色场景与镜头设定，先询问目标镜号和想要的效果，再建议文字生成或参考图生成及可选择的现有素材。视频生成方式、素材数量和槽位以制作区当前模型能力为准；不替我选图、改参数或生成视频。",
        },
        common,
      ];
    case "edit":
      return [
        {
          title: "检查镜头时长与顺序",
          prompt:
            "读取本集镜头记录、时长及已有视频进度，检查是否有缺失镜头或时长不合理的问题，最多列3条具体建议。不将生成完成等同于视频已采用，不声称看过未读取的视频，不改动镜头或剪辑时间线。",
        },
        {
          title: "给出本集节奏建议",
          prompt:
            "依据本集剧本、分镜表和实际镜头时长，提供简短具体的剪辑节奏建议，标出对应镜号。只给建议，保留已有镜头、视频版本和成片；不自行生成媒体。",
        },
      ];
    default:
      return [
        {
          title: "整理导演计划",
          prompt:
            "读取本集剧本、导演计划与上一阶段已有的角色场景资产。有方案则仅补齐当前缺失的固定布局、人物状态、节奏与拍摄规则；无方案则起草写入 scriptPlan。不重做角色场景、不生成媒体，等待我确认。最多三点说明修改与下一步。",
        },
        {
          title: "拆分与补齐镜头清单",
          prompt:
            "先读取本集导演计划、分镜表、镜头记录与角色场景资产。如果导演计划未确认，先提示我确认；否则起草或补齐分镜表，逐镜明确时长、景别、动作、运镜、场景及角色ID、起止状态与前镜关系。已有镜头不重复创建，保留所有媒体。分镜表未确认时不创建镜头记录、不生成图片视频；已确认则仅补齐缺失的镜头记录并汇报。",
        },
        common,
      ];
  }
});
function prepareTask(prompt: string) {
  inputValue.value = prompt;
}

watch(
  assistantDraft,
  (value) => {
    if (value) {
      inputValue.value = value;
      assistantDraft.value = "";
    }
  },
  { immediate: true },
);
const fallbackAgentModel = ref("");
const agentModelName = computed(() => assistantTextModel.value || fallbackAgentModel.value);
const chatError = computed(() => {
  const latest = messages.value[messages.value.length - 1] as any;
  if (lastError.value) return lastError.value;
  return latest?.role === "assistant" && latest?.status === "error" ? latest?.ext?.error || "请求没有完成，请重连后重试" : "";
});

async function handleSend(text: string) {
  if (await productionAgentStore().chat(text)) inputValue.value = "";
}
function handleStop() {
  productionAgentStore().stopGenerate();
}
function handleReconnect() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.scriptAgent.msg.reconnect"),
    body: $t("workbench.scriptAgent.msg.notReconnect"),
    confirmBtn: $t("workbench.scriptAgent.msg.keepReconnect"),
    cancelBtn: $t("workbench.scriptAgent.msg.cancel"),
    theme: "warning",
    onConfirm: async () => {
      productionAgentStore().reconnect();
      dialog.destroy();
    },
  });
}

// 建议点击直达发送
function handleSuggestion(prompt?: string) {
  if (prompt) prepareTask(prompt);
}

// 历史区自动吸底：用户手动上翻时暂停跟随，回到底部附近再恢复
const historyRef = ref<HTMLElement | null>(null);
let stickToBottom = true;
function onHistoryScroll() {
  const el = historyRef.value;
  if (!el) return;
  stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
}
watch(
  messages,
  () => {
    requestAnimationFrame(() => {
      const el = historyRef.value;
      if (!el || !stickToBottom) return;
      el.scrollTop = el.scrollHeight;
    });
  },
  { deep: true },
);

const memoryTypeLabel: Record<string, string> = {
  message: $t("workbench.production.chatBox.messageMemory"),
  summary: $t("workbench.production.chatBox.summaryMemory"),
  all: $t("workbench.production.chatBox.allMemory"),
};
function handleClearMemory(type: "message" | "summary" | "all") {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.production.chatBox.confirmClear"),
    body: $t("workbench.production.chatBox.confirmClearBody", { type: memoryTypeLabel[type] }),
    confirmBtn: $t("workbench.production.chatBox.confirmClearBtn"),
    cancelBtn: $t("workbench.production.cancel"),
    theme: "warning",
    onConfirm: async () => {
      await axios.post(`/agents/clearMemory`, { projectId: project.value?.id, agentType: "productionAgent", episodesId: episodesId.value, type });
      window.$message.success($t("workbench.production.chatBox.memoryCleared", { type: memoryTypeLabel[type] }));
      dialog.destroy();
      productionAgentStore().getHistory();
    },
  });
}

const resizeHandleRef = ref<HTMLElement | null>(null);
const boxWidth = ref(380);
const MIN_WIDTH = 360;
const { pressed } = useMousePressed({ target: resizeHandleRef });
const { x } = useMouse();
const dragStartX = ref(0);
const dragStartWidth = ref(380);
watch(pressed, (isPressed) => {
  if (isPressed) {
    dragStartX.value = x.value;
    dragStartWidth.value = boxWidth.value;
  }
});
watchEffect(() => {
  if (pressed.value) {
    const maxWidth = window.innerWidth * 0.8;
    boxWidth.value = Math.min(maxWidth, Math.max(MIN_WIDTH, dragStartWidth.value + (dragStartX.value - x.value)));
  }
});

const showThink = ref(false);
onMounted(async () => {
  try {
    const { data } = await axios.post(`/project/getModelDetails`, { key: "productionAgent" });
    fallbackAgentModel.value = data?.modelName || data?.name || "";
    if (data && data.think) showThink.value = true;
  } catch {
    // 未配置生产 Agent 时仍允许打开工作台，发送时会在面板内给出具体错误。
  }
});
watch(connected, (newVal) => {
  if (status.value != "idle" && newVal) {
    status.value = "idle";
  }
});
</script>

<style lang="scss" scoped>
.assistantTaskBrief {
  padding: 12px 16px;
  border-bottom: 1px solid #eee7e0;
  background: #fcfbf9;
  flex: none;
}
.assistantTaskBrief p {
  margin: 0 0 8px;
  font-size: 12px;
  color: #756f67;
}
.assistantProgress {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 10px;
  color: #9b9287;
  margin-bottom: 10px;
}
.assistantTasks {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.assistantTasks button {
  font: inherit;
  font-size: 11px;
  padding: 6px 8px;
  border: 1px solid #e7ded4;
  border-radius: 6px;
  background: white;
  color: #67584a;
  cursor: pointer;
}
.assistantTasks button:hover {
  border-color: #bd4c22;
  color: #bd4c22;
}
.assistantTasks span {
  margin-left: 5px;
}
.assistantTaskBrief > small {
  display: block;
  color: #aaa195;
  font-size: 10px;
  margin-top: 8px;
}
.agentModelField :deep(.modelSelectControl) {
  min-height: 29px !important;
  height: 29px !important;
  font-size: 11px !important;
  box-shadow: none !important;
  border-radius: 6px !important;
}
.agentStripTip {
  display: none;
}

.rightChatBox {
  position: absolute;
  top: 72px;
  right: 16px;
  bottom: 18px;
  display: flex;
  flex-direction: column;
  z-index: 9999;
  min-width: 0;
  max-width: min(560px, calc(100% - 32px));
  height: auto;
  margin-right: 0;
  border-radius: 20px;
  border: 1px solid #d9e2d8;
  background: #fff;
  overflow: hidden;
  box-shadow: -10px 14px 40px #283d2c14;

  &.docked {
    position: static;
    inset: auto;
    width: auto;
    min-width: 0;
    max-width: none;
    height: 100%;
    border: 0;
    border-left: 1px solid #ecdfd4;
    border-radius: 0;
    box-shadow: none;
    background: #fffdfb;
  }

  .resizeHandle {
    user-select: none;
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    z-index: 10;
    &:hover {
      background-color: var(--td-bg-color-container-hover);
    }
  }
  .chatBox {
    width: 100%;
    height: auto;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 0 12px 12px;
    .inputBox {
      flex: none;
      margin: 10px 0 0;
    }
  }
  .directorChatHistory {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 10px 4px;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: #ded0c5 transparent;
    .historyTail {
      height: 2px;
      flex: none;
    }
  }
  .chatBox :deep(.t-chat-sender__textarea) {
    padding: 0;
    border: 1px solid #edd9c8;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 3px 14px #9c633808;
  }
  .chatBox :deep(.t-chat-sender__textarea__wrapper) {
    min-height: 0;
    padding: 0;
  }
  .chatBox :deep(.t-textarea__inner) {
    min-height: 64px !important;
    max-height: 140px;
    padding: 11px 12px;
    font-size: 13px;
    line-height: 1.65;
    resize: none;
  }
  .chatBox :deep(.t-chat-sender__footer) {
    min-height: 42px;
    padding: 8px 10px;
    border-top: 1px solid #f0e6dc;
  }
  .chatBox :deep(.t-chat-sender__footer-prefix) {
    min-width: 0;
    flex-wrap: wrap;
  }
  .chatBox :deep(.t-chat-sender__button) {
    margin-left: 6px;
  }
  .chatBox :deep(.t-chat-sender__button .t-button) {
    border-radius: 10px;
    background: #e07a3f;
    border-color: #e07a3f;
    color: #fff;
  }
  .chatBox :deep(.t-chat-sender__button .t-button:hover) {
    background: #d06d33;
    border-color: #d06d33;
  }
  .chatErrorCard {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 10px 8px 2px;
    padding: 8px 10px;
    border: 1px solid #f0c8bd;
    border-radius: 10px;
    background: #fff6f3;
    color: #8c4330;
    font-size: 11px;
  }
  .errorDot {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    flex: none;
    border-radius: 50%;
    background: #e87551;
    color: #fff;
    font-weight: 700;
  }
  .errorText {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chatErrorCard button {
    flex: none;
    padding: 4px 9px;
    border: 1px solid #e3a18e;
    border-radius: 7px;
    background: #fff;
    color: #b74d2f;
    cursor: pointer;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 56px;
    padding: 9px 12px 8px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(91, 77, 65, 0.08);
    background: var(--td-bg-color-container);
    .assistantIdentity {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .directorMark {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      flex: none;
      border-radius: 10px;
      background: #fff0e5;
      color: #f8793e;
      border: 1px solid #ffdcc6;
    }
    .identityCopy {
      display: flex;
      min-width: 0;
      flex-direction: column;
    }
    .identityCopy small {
      color: #c08a65;
      font-size: 9px;
      font-weight: 650;
      letter-spacing: 0.06em;
      line-height: 13px;
    }
    .identityCopy strong {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      color: #2e2a2d;
      font-size: 13.5px;
      font-weight: 720;
      line-height: 18px;
      text-overflow: ellipsis;
    }
    .headerActions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
    }
    .connectionState {
      display: grid;
      place-items: center;
      width: 14px;
      height: 14px;
      cursor: default;
    }
    .connectionState i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #c9c2be;
      box-shadow: 0 0 0 3px rgba(160, 150, 140, 0.12);
    }
    .connectionState.online i {
      background: #3f9e6b;
      box-shadow: 0 0 0 3px rgba(63, 158, 107, 0.14);
    }
    .close {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border: 1px solid #e8e2de;
      border-radius: 9px;
      background: #fff;
      color: #716b69;
      cursor: pointer;
      &:hover {
        border-color: #d5c5bc;
        color: #c85e30;
        background: #fff8f3;
      }
    }
  }
  .agentStrip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px 6px;
    background: #fffdfb;
    color: #a5968a;
    font-size: 10px;
    flex-wrap: wrap;
  }
  .agentStripLabel {
    flex: none;
    padding: 2px 8px;
    border: 1px solid #f0e2d6;
    border-radius: 999px;
    background: #fff6ef;
    color: #c08a65;
    font-weight: 650;
    letter-spacing: 0.05em;
  }
  .agentModelField {
    border: 0;
    padding: 0;
    margin: 0;
    flex: 1;
    min-width: 140px;
  }
  .agentStripTip {
    color: #b6a89e;
    white-space: nowrap;
  }
}

.settingMenu {
  padding: 4px 0;
  .settingMenuItem {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
      background-color: var(--td-bg-color-container-hover);
    }
    &.danger {
      color: var(--td-error-color);
    }
  }
}
.modelSelCls {
  gap: 5px;
  .paramSelect {
    max-width: 80px;
  }
}
</style>
