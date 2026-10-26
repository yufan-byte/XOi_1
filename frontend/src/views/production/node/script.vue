<template>
  <t-card class="script" :class="{ fluid: standalone }">
    <div class="titleBar" :class="{ dragHandle: !standalone, pr: !standalone }">
      <DirectorNodeHeading node-id="script" step="01" label="STORY" :title="$t('workbench.production.node.script.title')" description="确认故事、对白与场次" />
      <t-button size="small" variant="text" @click="openEdit">{{ $t("workbench.production.edit") }}</t-button>
      <Handle v-if="!standalone" :id="props.handleIds!.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>
    <div class="content" :class="{ nowheel: !standalone, nodrag: !standalone }">
      <!-- 画布总览只放摘要卡：整篇 markdown 会把画布撑成文档页，全文交给对话框 -->
      <div v-if="!standalone" class="scriptDigest">
        <div class="digestStats">
          <template v-if="sceneCount > 0">
            <span><b>{{ sceneCount }}</b> 个场次</span>
            <i></i>
          </template>
          <span><b>{{ wordCount }}</b> 字</span>
          <i></i>
          <span :class="script.trim() ? 'ok' : 'todo'">{{ script.trim() ? "内容已就绪" : "待整理" }}</span>
        </div>
        <p class="digestExcerpt">{{ excerpt || "还没有剧本内容，点「编辑」写下第一幕。" }}</p>
        <div class="digestOps">
          <t-button size="small" variant="outline" :disabled="!script.trim()" @click="previewVisible = true">预览全文</t-button>
          <t-button size="small" theme="primary" @click="openEdit">{{ $t("workbench.production.edit") }}</t-button>
        </div>
      </div>
      <MdPreview v-else v-model="script" :theme="resolveThemeMode(themeSetting.mode)" />
    </div>
    <Handle v-if="!standalone" :id="props.handleIds!.assets" type="source" :position="Position.Bottom" />
  </t-card>

  <t-dialog
    v-model:visible="previewVisible"
    :header="$t('workbench.production.node.script.title')"
    :width="'70vw'"
    :footer="false"
    placement="center"
    attach="body">
    <div class="scriptReader">
      <MdPreview v-model="script" :theme="resolveThemeMode(themeSetting.mode)" />
    </div>
  </t-dialog>

  <t-dialog
    v-model:visible="dialogVisible"
    :header="$t('workbench.production.node.script.editDialog')"
    :width="'90vw'"
    :confirm-btn="$t('workbench.production.save')"
    :cancel-btn="$t('workbench.production.cancel')"
    @confirm="onConfirm"
    @cancel="onCancel"
    @close="onCancel"
    :close-on-overlay-click="false"
    placement="center"
    attach="body">
    <MdEditor
      v-model="editContent"
      :theme="resolveThemeMode(themeSetting.mode)"
      :toolbars="toolbars"
      :footers="[]"
      style="height: 72vh"
      @onUploadImg="() => {}"
      @drop.prevent
      @paste="onPaste" />
  </t-dialog>
</template>

<script setup lang="ts">
import DirectorNodeHeading from "./DirectorNodeHeading.vue";
import { ref } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { MdEditor, MdPreview } from "@/utils/markdown";
import type { ToolbarNames } from "md-editor-v3";
import { resolveThemeMode } from "@/utils/theme";
import settingStore from "@/stores/setting";
import productionAgentStore from "@/stores/productionAgent";
const { themeSetting } = storeToRefs(settingStore());

const props = defineProps<{
  id?: string;
  handleIds?: {
    assets: string;
    source: string;
  };
  standalone?: boolean;
}>();

const script = defineModel<string>({ required: true });
const editContent = ref("");
const dialogVisible = ref(false);
const previewVisible = ref(false);

/* 摘要卡数据：场次按 markdown 标题行 + 「第X场/幕/景」启发式统计；摘要取去格式后的前 120 字 */
const sceneCount = computed(() => {
  const text = script.value || "";
  const headings = text.match(/^#{1,4}\s+\S/gm)?.length ?? 0;
  const sceneMarks = text.match(/第[零一二三四五六七八九十百\d]+\s*[场幕景]/g)?.length ?? 0;
  return Math.max(headings, sceneMarks) || 0;
});
const wordCount = computed(() => (script.value || "").replace(/\s|#|\*|-|>/g, "").length);
const excerpt = computed(() =>
  (script.value || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[#>*`\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120),
);

const toolbars: ToolbarNames[] = [
  "bold",
  "underline",
  "italic",
  "strikeThrough",
  "-",
  "title",
  "sub",
  "sup",
  "quote",
  "unorderedList",
  "orderedList",
  "task",
  "-",
  "codeRow",
  "code",
  "table",
  "-",
  "revoke",
  "next",
  "=",
  "preview",
];

function openEdit() {
  editContent.value = script.value ?? "";
  dialogVisible.value = true;
}

function onConfirm() {
  script.value = editContent.value;
  productionAgentStore().setFlowData();

  dialogVisible.value = false;
}

function onCancel() {
  dialogVisible.value = false;
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
      e.preventDefault();
      return;
    }
  }
}
</script>

<style lang="scss" scoped>
.script {
  max-width: 100vw;
  width: fit-content;
  min-width: 200px;
  user-select: text;
  cursor: default;

  &.fluid {
    width: 100%;
    min-width: 0;
  }

  .titleBar {
    cursor: grab;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    background-color: #000;
    width: fit-content;
    padding: 5px 10px;
    color: #fff;
    border-radius: 8px 0;
    font-size: 16px;
  }

  .content {
    margin-top: 8px;

    :deep(.md-editor) {
      border: none;
      box-shadow: none;
    }

    :deep(.md-editor-preview-wrapper) {
      padding: 0;
    }
  }

  /* 画布摘要卡：一行统计 + 两行摘要 + 两个按钮，把画布还给「地图」 */
  .scriptDigest {
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid #eee2d8;
    border-radius: 12px;
    background: #fcf8f4;
  }
  .digestStats {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #8d8177;
    font-size: 11.5px;
    b { color: #302b28; font-size: 13px; font-variant-numeric: tabular-nums; }
    i { width: 1px; height: 10px; background: #e4d6cb; }
    .ok { color: #3f7d5b; font-weight: 650; }
    .todo { color: #b3a294; }
  }
  .digestExcerpt {
    margin: 0;
    color: #7c7169;
    font-size: 12px;
    line-height: 1.7;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .digestOps { display: flex; gap: 8px; }
}

.scriptReader {
  max-height: 72vh;
  overflow: auto;
  user-select: text;
}
</style>
