<!-- 导演助理消息的自绘渲染：替代 t-chat-message 的内部渲染。
     目标：正文用 MdPreview（与工作台一致的排版、可滚动表格），
     思考过程默认折叠（流式时展开）、完成后收起，建议点击直达发送。 -->
<template>
  <div v-if="isUser && hasBody" class="userRow">
    <div class="userBubble">{{ userText }}</div>
  </div>

  <div v-else-if="!isUser && hasBody" class="assistantRow">
    <span class="avatar"><i-movie theme="outline" size="16" /></span>
    <div class="assistantBody" :class="{ isError }">
      <div v-if="isWorking" class="metaRow">
        <span class="streamBadge">
          <i class="pulse" />
          {{ message.status === "pending" ? "准备中" : "生成中" }}
        </span>
      </div>

      <template v-for="(seg, i) in segments" :key="seg.id ?? `${seg.type}-${i}`">
        <div v-if="seg.type === 'thinking'" class="thinkBlock" :class="{ open: isThinkOpen(seg, i) }">
          <button type="button" class="thinkToggle" @click="toggleThink(seg, i)">
            <i-tips size="13" />
            <span>{{ thinkLabel(seg) }}</span>
            <i-chevron-down size="12" :class="{ flip: isThinkOpen(seg, i) }" />
          </button>
          <div v-show="isThinkOpen(seg, i)" class="thinkBody">
            {{ typeof seg.data === "object" ? (seg.data as any)?.text || "" : (seg.data ?? "") }}
          </div>
        </div>

        <div
          v-else-if="seg.type === 'text' || seg.type === 'markdown'"
          class="responseText"
          :class="{ folded: longReply && !expanded && !isWorking }">
          <MdPreview
            v-if="seg.type === 'text' || seg.type === 'markdown'"
            class="assistantMarkdown"
            :model-value="seg.data ?? ''"
            :theme="resolveThemeMode(themeSetting.mode)" />
        </div>

        <div v-else-if="seg.type === 'suggestion'" class="suggestionRow">
          <button v-for="(item, j) in suggestionList(seg)" :key="j" type="button" class="suggestionChip" @click="emit('suggestion', item.prompt)">
            {{ item.title }}
          </button>
        </div>
      </template>

      <button v-if="longReply && !isWorking" class="expandReply" type="button" @click="expanded = !expanded">
        {{ expanded ? "收起完整回复" : "展开完整回复" }}
      </button>
      <div v-if="isError" class="errorNote" role="alert">{{ errorText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { ChatMessagesData, AIMessage, AIMessageContent } from "@tdesign-vue-next/chat";
import { MdPreview } from "@/utils/markdown";
import { resolveThemeMode } from "@/utils/theme";
import settingStore from "@/stores/setting";

const { themeSetting } = storeToRefs(settingStore());
const props = defineProps<{ message: ChatMessagesData }>();
const emit = defineEmits<{ (e: "suggestion", prompt: string): void }>();

const expanded = ref(false);
const longReply = computed(
  () => segments.value.filter((s) => s.type === "text" || s.type === "markdown").reduce((n, s) => n + String(s.data ?? "").length, 0) > 700,
);
const isUser = computed(() => props.message.role === "user");
const segments = computed(() => ((props.message as AIMessage).content ?? []) as AIMessageContent[]);
const isWorking = computed(() => props.message.status === "pending" || props.message.status === "streaming");
const isError = computed(() => props.message.status === "error");
const userText = computed(() =>
  segments.value
    .filter((s) => s.type === "text")
    .map((s) => String(s.data ?? ""))
    .join("\n"),
);
const errorText = computed(() => String((props.message as AIMessage).ext?.error || "这段回复没有完成，可重试"));

// 历史消息里存在只有思考/空文本的残缺消息：没有任何可读内容时整条不渲染，避免空气泡
const hasBody = computed(() => {
  if (isUser.value) return userText.value.trim().length > 0;
  if (isError.value || isWorking.value) return true;
  return segments.value.some((seg) => {
    if (seg.type === "text" || seg.type === "markdown") return String(seg.data ?? "").trim().length > 0;
    if (seg.type === "suggestion") return suggestionList(seg).length > 0;
    return false;
  });
});

// 思考块开关：流式时自动展开，完成后自动收起；用户手动点开后尊重选择
const thinkOverrides = reactive(new Map<string, boolean>());
const thinkKey = (seg: AIMessageContent, index: number) => String(seg.id ?? `think-${index}`);
function isThinkOpen(seg: AIMessageContent, index: number) {
  const key = thinkKey(seg, index);
  if (thinkOverrides.has(key)) return thinkOverrides.get(key)!;
  return false;
}
function toggleThink(seg: AIMessageContent, index: number) {
  const key = thinkKey(seg, index);
  thinkOverrides.set(key, !isThinkOpen(seg, index));
}
function thinkLabel(seg: AIMessageContent) {
  return seg.status === "streaming" || seg.status === "pending" ? "思考中…" : "思考过程";
}

function suggestionList(seg: AIMessageContent): { title?: string; prompt: string }[] {
  const data = seg.data as { title?: string; prompt?: string }[] | undefined;
  return Array.isArray(data) ? data.filter((item): item is { title?: string; prompt: string } => Boolean(item?.prompt)) : [];
}
</script>

<style lang="scss" scoped>
.responseText.folded {
  max-height: 210px;
  overflow: hidden;
  position: relative;
  mask-image: linear-gradient(#000 75%, transparent);
}
.expandReply {
  align-self: flex-start;
  border: 0;
  padding: 4px 0;
  background: none;
  font: inherit;
  font-size: 11px;
  color: #bd4c22;
  cursor: pointer;
}
.userRow {
  display: flex;
  justify-content: flex-end;
  padding: 2px 0;

  .userBubble {
    max-width: 86%;
    padding: 9px 13px;
    border-radius: 14px 14px 4px 14px;
    background: #fdeee1;
    border: 1px solid #f7dcc6;
    color: #8a4d2c;
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.assistantRow {
  display: flex;
  gap: 9px;
  padding: 2px 0;

  .avatar {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    margin-top: 2px;
    border-radius: 9px;
    background: #fff0e5;
    border: 1px solid #ffdcc6;
    color: #f8793e;
  }

  .assistantBody {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;

    // 出错时正文退居其次，错误卡片是主视觉
    &.isError .assistantMarkdown {
      color: #8c4330;
      opacity: 0.75;
    }
  }

  .metaRow {
    display: flex;
    align-items: center;
    min-height: 18px;

    .streamBadge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #d4601f;
      font-size: 10.5px;

      .pulse {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #e07a3f;
        animation: thinkPulse 1.2s ease-in-out infinite;
      }
    }
  }

  // 助手正文不做气泡，直接文本流（头像即归属）；表格/引用等内容块自带浅色卡片
  .assistantMarkdown {
    overflow: hidden;

    :deep(.md-editor-preview-wrapper) {
      padding: 0;
    }
    :deep(.md-editor-preview) {
      color: #45403b;
      font-size: 13px;
      line-height: 1.75;
      p {
        margin-block: 0.45em;
      }
      h1,
      h2,
      h3,
      h4 {
        margin-block: 0.7em 0.4em;
        font-size: 14px;
        color: #36302a;
      }
      ul,
      ol {
        margin-block: 0.45em;
        padding-left: 1.35em;
      }
      li {
        margin-block: 0.15em;
      }
      code {
        font-size: 12px;
        background: #f7efe7;
        border-radius: 4px;
        padding: 1px 5px;
      }
      blockquote {
        margin: 0.5em 0;
        padding: 0.35em 0.9em;
        border-left: 3px solid #f2c9ab;
        background: #fffaf5;
        color: #7c6a5c;
        border-radius: 0 8px 8px 0;
      }

      // 大表格在内容区内滚动，不再把整个面板撑爆
      table {
        display: block;
        width: max-content;
        max-width: 100%;
        max-height: 300px;
        overflow: auto;
        margin: 0.5em 0;
        border-collapse: collapse;
        font-size: 12px;
        line-height: 1.55;
        scrollbar-width: thin;
      }
      th,
      td {
        padding: 5px 9px;
        border: 1px solid #eee2d6;
      }
      th {
        background: #fbf4ec;
        font-weight: 650;
        white-space: nowrap;
        position: sticky;
        top: 0;
      }
    }
  }

  .thinkBlock {
    border: 1px dashed #ecdcc9;
    border-radius: 10px;
    background: #fffdf9;
    overflow: hidden;

    .thinkToggle {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 6px 11px;
      border: 0;
      background: transparent;
      color: #a98f78;
      font-size: 11.5px;
      cursor: pointer;

      &:hover {
        color: #d4601f;
        background: #fff6ef;
      }
      .flip {
        transform: rotate(180deg);
      }
    }

    .thinkBody {
      max-height: 220px;
      overflow: auto;
      padding: 8px 12px 10px;
      border-top: 1px dashed #f0e3d4;
      color: #8d7c6d;
      font-size: 12px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
      scrollbar-width: thin;
    }
  }

  .suggestionRow {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 0 3px;

    .suggestionChip {
      padding: 5px 12px;
      border: 1px solid #f2cdb2;
      border-radius: 999px;
      background: #fff6ef;
      color: #c25c22;
      font-size: 12px;
      cursor: pointer;

      &:hover {
        background: #ffeddf;
      }
    }
  }

  .errorNote {
    padding: 8px 11px;
    border: 1px solid #f0c8bd;
    border-radius: 10px;
    background: #fff6f3;
    color: #8c4330;
    font-size: 12px;
    line-height: 1.6;
  }
}

@keyframes thinkPulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
