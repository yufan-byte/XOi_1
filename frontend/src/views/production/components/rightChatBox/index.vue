<template>
  <div class="rightChatBox" :style="{ width: boxWidth + 'px' }">
    <div ref="resizeHandleRef" class="resizeHandle"></div>
    <div class="header f ac jb">
      <span class="text">
        <i-dot theme="outline" :fill="connected ? 'green' : 'red'" />
        {{ props.title }}
      </span>
      <div class="close">
        <i-click-to-fold size="18" @click.stop="emit('close')" />
      </div>
    </div>
    <div class="chatBox" v-loading="loadingHistory">
      <t-chat-list :clear-history="false">
        <t-chat-message
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :name="(message as any).name"
          :placement="message.role === 'user' ? 'right' : 'left'"
          :variant="message.role === 'user' ? 'base' : 'outline'"
          :handleActions="message.role === 'user' ? {} : handleActions"
          :status="message.status"
          allowContentSegmentCustom>
          <!-- <template #actionbar>
            <t-chat-actionbar :action-bar="['replay', 'copy']" />
          </template> -->
        </t-chat-message>
      </t-chat-list>
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
        :placeholder="$t('workbench.production.chatBox.inputPlaceholder')"
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
const { project } = storeToRefs(projectStore());
const { connected, messages, status, lastError, episodesId, loadingHistory, thinkLevel } = storeToRefs(productionAgentStore());
const thinkLevelOptions = [
  { label: $t("workbench.scriptAgent.thinkLevel.off"), value: 0 },
  { label: $t("workbench.scriptAgent.thinkLevel.light"), value: 1 },
  { label: $t("workbench.scriptAgent.thinkLevel.deep"), value: 2 },
  { label: $t("workbench.scriptAgent.thinkLevel.extreme"), value: 3 },
];

const props = defineProps({ title: String });

const emit = defineEmits(["close"]);

const inputValue = ref("");
const agentModelName = ref("");
const chatError = computed(() => {
  const latest = messages.value[messages.value.length - 1] as any;
  if (lastError.value) return lastError.value;
  return latest?.role === "assistant" && latest?.status === "error" ? latest?.ext?.error || "请求没有完成，请重连后重试" : "";
});

function handleSend(text: string) {
  productionAgentStore().chat(text);
  inputValue.value = "";
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

//快捷发送
const handleActions = {
  suggestion: (data?: any) => {
    productionAgentStore().chat(data?.content?.prompt);
  },
};

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
const boxWidth = ref(400);
const MIN_WIDTH = 400;
const { pressed } = useMousePressed({ target: resizeHandleRef });
const { x } = useMouse();
const dragStartX = ref(0);
const dragStartWidth = ref(400);
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
    agentModelName.value = data?.modelName || data?.name || "";
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
.rightChatBox {
  position: absolute;
  top: 74px;
  right: 12px;
  bottom: 72px;
  display: flex;
  flex-direction: column;
  z-index: 9999;
  min-width: 360px;
  max-width: min(520px, calc(100vw - 32px));
  height: auto;
  margin-right: 0;
  border-radius: 18px;
  border: 1px solid var(--td-border-level-1-color);
  background-color: var(--td-bg-color-container);
  overflow: hidden;
  box-shadow: -8px 10px 30px rgba(43, 38, 52, 0.12);

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
    padding-left: 8px;
    .inputBox {
      padding-right: 8px;
    }
  }
  .chatBox :deep(.t-chat) { display:flex; flex:1; min-height:0; flex-direction:column; }
  .chatBox :deep(.t-chat__list) { flex:1; min-height:0; overflow:auto; }
  .chatErrorCard { display:flex; align-items:center; gap:8px; margin:0 10px 8px 2px; padding:8px 10px; border:1px solid #f0c8bd; border-radius:10px; background:#fff6f3; color:#8c4330; font-size:11px; }
  .errorDot { display:grid; place-items:center; width:18px; height:18px; flex:none; border-radius:50%; background:#e87551; color:#fff; font-weight:700; }
  .errorText { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .chatErrorCard button { flex:none; padding:4px 9px; border:1px solid #e3a18e; border-radius:7px; background:#fff; color:#b74d2f; cursor:pointer; }
  :deep(.t-chat__list) {
    padding-right: 8px;
  }
  .header {
    height: 48px;
    line-height: 40px;
    padding: 0 14px;
    flex-shrink: 0;
    .text {
      font-size: 18px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
    }
    .close {
      cursor: pointer;
      aspect-ratio: 1/1;
    }
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
