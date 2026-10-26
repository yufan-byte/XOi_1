<template>
  <t-card class="directorStageCard" :class="{ fluid: standalone }">
    <div class="titleBar" :class="{ dragHandle: !standalone }">
      <DirectorNodeHeading node-id="storyboardTable" step="04" label="SHOT LIST" title="分镜表" description="确认镜头次序、动作与前后衔接" />
      <div class="titleActions" :class="{ nowheel: !standalone, nodrag: !standalone }">
        <button class="readerButton primary" type="button" @click="openEdit">✎ 编辑</button>
        <button v-if="!standalone" class="readerButton" type="button" @click="readerVisible = true">⤢ 放大查看</button>
      </div>
      <Handle v-if="!standalone" :id="props.handleIds!.target" type="target" :position="Position.Left" />
      <Handle v-if="!standalone" :id="props.handleIds!.source" type="source" :position="Position.Right" />
    </div>
    <StageReviewActions stage="storyboardTable" />
    <div class="stageExcerpt" :class="{ nowheel: !standalone, nodrag: !standalone }">
      <div v-if="!content" class="stageEmpty">
        <p>可以让导演助理起草，也可以直接自己写。</p>
        <button class="readerButton primary" type="button" @click="openEdit">自己撰写</button>
      </div>
      <MdPreview v-else :model-value="content" :theme="resolveThemeMode(themeSetting.mode)" />
    </div>
  </t-card>

  <t-dialog
    v-model:visible="editVisible"
    header="分镜表 · 编辑"
    width="min(1200px, 96vw)"
    :confirm-btn="{ content: '保存', loading: saving }"
    cancel-btn="取消"
    :close-on-overlay-click="false"
    placement="center"
    attach="body"
    @confirm="onSave"
    @cancel="editVisible = false"
    @close="editVisible = false">
    <p class="editorTip nowheel nodrag">支持 Markdown 表格（工具栏「表格」可插入模板）。建议保持「镜号 / 景别 / 画面 / 台词 / 衔接」等列结构，助理会按表生成镜头画面。保存后审核状态会自动重置。</p>
    <MdEditor
      v-model="editContent"
      class="nowheel nodrag"
      :theme="resolveThemeMode(themeSetting.mode)"
      :toolbars="tableToolbars"
      :footers="[]"
      style="height: 64vh"
      @onUploadImg="() => {}"
      @drop.prevent
      @paste="onPaste" />
  </t-dialog>

  <t-dialog v-if="readerVisible" v-model:visible="readerVisible" header="分镜表 · 阅读与审核" width="min(1120px, 94vw)" :footer="false" placement="center" attach="body">
    <div class="directorStageReader nowheel nodrag">
      <StageReviewActions stage="storyboardTable" @compose="readerVisible = false" />
      <p class="readerTip">可直接编辑，也可以让导演助理调整；修改保存后需重新审核。审核不调用模型。</p>
      <t-empty v-if="!content" description="尚未起草，点击卡片上的“编辑”自己写，或请助理起草" />
      <MdPreview v-else :model-value="content" :theme="resolveThemeMode(themeSetting.mode)" />
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { Handle, Position } from '@vue-flow/core';
import DirectorNodeHeading from './DirectorNodeHeading.vue';
import StageReviewActions from './StageReviewActions.vue';
import { MdEditor, MdPreview } from '@/utils/markdown';
import type { ToolbarNames } from 'md-editor-v3';
import { resolveThemeMode } from '@/utils/theme';
import settingStore from '@/stores/setting';
import productionAgentStore from '@/stores/productionAgent';
const { themeSetting } = storeToRefs(settingStore());
const props = defineProps<{ id?: string; handleIds?: { target: string; source: string }; standalone?: boolean }>();
const content = defineModel<string>({ required: true });
const editVisible = ref(false);
const readerVisible = ref(false);
const editContent = ref('');
const saving = ref(false);
const base = ref({ content: '', plan: '', script: '' });
useEventListener(window,'production:open-assistant',()=>{editVisible.value=false;readerVisible.value=false;});

const tableToolbars: ToolbarNames[] = [
  'bold','italic','-','title','unorderedList','orderedList','-','table','codeRow','-','revoke','next','=','preview',
];

function openEdit() {
  editContent.value = content.value ?? '';
  const fd = productionAgentStore().flowData;
  base.value = { content: editContent.value, plan: fd.scriptPlan || '', script: fd.script || '' };
  editVisible.value = true;
}

async function onSave() {
  saving.value = true;
  try {
    await productionAgentStore().saveDirectorDocument('storyboardTable', editContent.value, base.value.content, base.value.plan, base.value.script);
    editVisible.value = false;
  } catch (error: any) {
    window.$message.error(error?.message || '保存失败，编辑内容已保留，请重试');
  } finally {
    saving.value = false;
  }
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
      e.preventDefault();
      return;
    }
  }
}
</script>
<style scoped>
.directorStageCard { min-width:320px; width:360px; max-width:100vw; }
.directorStageCard.fluid { width:100%; min-width:0; }
.titleBar { display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:grab; }
.fluid .titleBar { cursor:default; }
.titleActions { display:flex; gap:6px; flex:none; }
.readerButton { padding:7px 10px; color:#af623c; background:#fff9f3; border:1px solid #eee0d2; border-radius:8px; cursor:pointer; font-size:12px; }
.readerButton.primary { color:#fff; background:#e07a3f; border-color:#e07a3f; }
.readerButton.primary:hover { background:#d06d33; }
.readerButton:hover { background:#fff1e6; }
.stageExcerpt { position:relative; margin-top:10px; max-height:230px; overflow:hidden; }
.stageExcerpt::after { content:""; position:absolute; left:-2px; right:-2px; bottom:0; height:64px; background:linear-gradient(180deg, rgba(255,255,255,0), #fff); pointer-events:none; }
.directorStageCard.fluid .stageExcerpt { max-height:none; overflow:visible; }
.directorStageCard.fluid .stageExcerpt::after { display:none; }
.titleBar { display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:grab; }
.fluid .titleBar { cursor:default; }
.titleActions { display:flex; gap:6px; flex:none; }
.readerButton { padding:7px 10px; color:#af623c; background:#fff9f3; border:1px solid #eee0d2; border-radius:8px; cursor:pointer; font-size:12px; }
.readerButton.primary { color:#fff; background:#e07a3f; border-color:#e07a3f; }
.readerButton.primary:hover { background:#d06d33; }
.readerButton:hover { background:#fff1e6; }
.stageEmpty { display:flex; flex-direction:column; align-items:flex-start; gap:10px; padding:18px 2px; color:#a5968a; font-size:13px; }
.directorStageReader { max-height:72vh; overflow:auto; padding:4px 12px 20px; user-select:text; }
.readerTip { font-size:12px; color:#948474; line-height:1.8; }
.editorTip { margin:0 0 10px; font-size:12px; color:#948474; line-height:1.7; }
:deep(.md-editor-preview) { font-size:13px; line-height:1.75; color:#5c534b; }
:deep(.md-editor-preview p) { margin-block:0.5em; }
.directorStageReader :deep(table) { min-width:100%; }
</style>
