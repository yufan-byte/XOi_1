<template>
  <div class="novel" ref="novelRef">
    <section class="novelHero">
      <div class="novelHeroCopy">
        <span class="novelEyebrow">XOi STORY WORKSPACE · 01</span>
        <h1>原始素材</h1>
        <p>这里可以导入小说原文，也可以导入已有剧本。先判断是否需要 AI 改编，再把内容整理成可制作的分集剧本。</p>
        <div class="novelMeta"><span><strong>{{ pagination.total || 0 }}</strong> 个章节</span><span>{{ project?.name || '当前漫剧项目' }}</span></div>
      </div>
      <div class="novelHeroArt" aria-hidden="true"><span class="page pageBack">STORY</span><span class="page pageFront"><i>CHAPTER</i><strong>01</strong></span></div>
    </section>

    <section class="workflowGuide" aria-labelledby="workflowGuideTitle">
      <div class="workflowGuideIntro">
        <div>
          <span class="workflowGuideEyebrow">导入完成后，按你的情况选择</span>
          <h2 id="workflowGuideTitle">AI 改编不是必经环节</h2>
          <p>AI 改编负责“改变故事表达”；剧本整理负责“保留内容并结构化分集”。两者不是一回事。</p>
        </div>
        <span class="workflowGuideHint">当前项目 · {{ pagination.total || 0 }} 个章节</span>
      </div>
      <div class="workflowChoices">
        <button type="button" class="workflowChoice workflowChoiceAi" @click="goToScriptAgent">
          <span class="workflowChoiceIcon"><i-magic /></span>
          <span class="workflowChoiceCopy"><strong>需要 AI 改编</strong><small>从故事骨架、改编策略到分场剧本，逐步生成。</small></span>
          <span class="workflowChoiceArrow">→</span>
        </button>
        <button type="button" class="workflowChoice workflowChoiceManual" @click="goToScript">
          <span class="workflowChoiceIcon"><i-editing /></span>
          <span class="workflowChoiceCopy"><strong>不改写内容，整理分集剧本</strong><small>已有剧本或原文时，按集拆分并结构化；可用 AI 辅助识别格式。</small></span>
          <span class="workflowChoiceArrow">→</span>
        </button>
      </div>
    </section>

    <div class="headBtn jb ac" ref="headBtnRef">
      <t-space>
        <t-button theme="primary" class="importBtn" @click="importNovelFn">
          <template #icon>
            <t-icon name="add" />
          </template>
          {{ $t("workbench.novel.importText") }}
        </t-button>
        <t-button theme="danger" class="dangerBtn" :disabled="selectedRowKeys.length === 0" @click="handleBatchDelete">
          <template #icon>
            <t-icon name="delete" />
          </template>
          {{ $t("workbench.novel.batchDelete") }} {{ selectedRowKeys.length > 0 ? `(${selectedRowKeys.length})` : "" }}
        </t-button>
        <t-button class="analysisBtn" @click="startEventAnalysis" :disabled="selectedRowKeys.length === 0">
          <template #icon>
            <t-icon name="analytics" />
          </template>
          {{ $t("workbench.novel.eventAnalysis") }} {{ selectedRowKeys.length > 0 ? `(${selectedRowKeys.length})` : "" }}
        </t-button>
      </t-space>
      <div class="f">
        <t-input v-model="searchText" :placeholder="$t('workbench.novel.searchPlaceholder')" clearable style="width: 260px" />
        <t-button class="searchBtn" @click="onChange" style="margin-left: 10px">
          <template #icon><t-icon name="search" /></template>
          {{ $t("workbench.novel.search") }}
        </t-button>
      </div>
    </div>
    <t-table
      ref="tableRef"
      style="margin-top: 10px; flex: 1; display: flex; flex-direction: column"
      :columns="columns"
      :data="tableData"
      :selected-row-keys="selectedRowKeys"
      :select-on-row-click="true"
      :keyboardRowHover="false"
      row-key="id"
      hover
      stripe
      size="small"
      :pagination="pagination"
      :loading="loading"
      lazy-load
      table-layout="fixed"
      @select-change="handleSelectChange"
      @page-change="handlePageChange">
      <template #startTime="{ row }">
        <span>{{ dayjs(row.startTime).format("YYYY-MM-DD HH:mm:ss") }}</span>
      </template>
      <template #event="{ row }">
        <t-loading v-if="row.eventState == 0" size="small" :text="$t('workbench.novel.generating')"></t-loading>
        <t-button
          v-else-if="row.eventState == -1 && !row.event"
          theme="danger"
          variant="text"
          size="small"
          @click.stop="openPreview($t('workbench.novel.genFailed'), row?.errorReason)">
          {{ $t("workbench.novel.genFailed") }}
        </t-button>
        <div v-else class="eventCell">
          <div class="eventPreview">{{ formatPreview(row.event) }}</div>
          <t-link
            v-if="row.event && row.event.length > PREVIEW_MAX_LENGTH"
            theme="success"
            hover="color"
            @click="openPreview($t('workbench.novel.col.event'), row.event)">
            {{ $t("workbench.novel.viewDetail") }}
          </t-link>
        </div>
      </template>
      <template #chapterData="{ row }">
        <div class="chapterDataCell">
          <div class="chapterPreview">{{ formatPreview(row.chapterData) }}</div>
          <t-link
            v-if="row.chapterData && row.chapterData.length > PREVIEW_MAX_LENGTH"
            theme="success"
            hover="color"
            @click.stop="openPreview($t('workbench.novel.col.chapterData'), row.chapterData)">
            {{ $t("workbench.novel.viewDetail") }}
          </t-link>
        </div>
      </template>
      <template #operation="{ row }">
        <t-space :size="0">
          <t-button theme="primary" :disabled="row.eventState == 0" variant="text" @click="handleEdit(row)">
            <template #icon>
              <t-icon name="edit" />
            </template>
            {{ $t("workbench.novel.edit") }}
          </t-button>
          <t-button theme="danger" :disabled="row.eventState == 0" variant="text" @click="handleDelete(row)">
            <template #icon>
              <t-icon name="delete" />
            </template>
            {{ $t("workbench.novel.delete") }}
          </t-button>
        </t-space>
      </template>
    </t-table>
    <t-dialog v-model:visible="previewVisible" :header="previewTitle" width="900px" placement="top" top="10vh" destroy-on-close :footer="false">
      <div class="previewDialogContent">{{ previewContent || $t("workbench.novel.none") }}</div>
    </t-dialog>
    <importNovel v-model="importNovelShow" @select="getNovel" />
    <editNodel v-model="editNodelShow" :formData="formData" @select="getNovel" />
  </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import axios from "@/utils/axios";
import importNovel from "./components/importNovel.vue";
import editNodel from "./components/editNodel.vue";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { showPointsToast } from "@/utils/pointsToast";
import { guardProjectType } from "@/utils/pipelineGuard";
const router = useRouter();
const { otherSetting } = storeToRefs(settingStore());
const { project } = storeToRefs(projectStore());

// 搜索文本
const searchText = ref("");
// 表头
const columns = ref<Record<string, unknown>[]>([
  {
    colKey: "row-select",
    type: "multiple",
    width: 50,
    align: "center",
  },
  {
    colKey: "index",
    title: $t("workbench.novel.col.id"),
    width: 50,
    align: "center",
  },
  { colKey: "reel", title: $t("workbench.novel.col.reel"), width: 100, align: "center", cell: "preview" },
  { colKey: "chapter", title: $t("workbench.novel.col.chapter"), width: 100, ellipsis: true },
  { colKey: "chapterData", title: $t("workbench.novel.col.chapterData"), ellipsis: true },
  { colKey: "event", title: $t("workbench.novel.col.event"), ellipsis: true },
  { colKey: "operation", title: $t("workbench.novel.col.operation"), width: 200, align: "center" },
]);
const editNodelShow = ref(false);
interface OriginalText {
  id: number;
  index: number;
  reel: string;
  chapter: string;
  chapterData: string;
  event: string;
  eventState?: number;
  errorReason?: string;
}
const formData = ref<OriginalText>({ id: -1, index: 0, reel: "", chapter: "", chapterData: "", event: "" });
const PREVIEW_MAX_LENGTH = 80;
const previewVisible = ref(false);
const previewTitle = ref("");
const previewContent = ref("");

function formatPreview(text?: string) {
  if (!text) return $t("workbench.novel.none");
  if (text.length <= PREVIEW_MAX_LENGTH) return text;
  return `${text.slice(0, PREVIEW_MAX_LENGTH)}...`;
}

function openPreview(title: string, content?: string) {
  previewTitle.value = title;
  previewContent.value = content || "";
  previewVisible.value = true;
}

// 表格数据
const tableData = ref<OriginalText[]>([]);
// 加载状态
const loading = ref(false);
// 选中行
const selectedRowKeys = ref<Array<string | number>>([]);
// 分页
const pagination = ref({
  page: 1,
  pageSize: 10,
  total: 0,
});

onMounted(() => {
  // P2 类型守卫：剧本创作型项目没有原文可导，直接输 URL 进来会产出错配数据
  guardProjectType(router, project.value?.projectType, "novel");
  getNovel();
});

onUnmounted(() => {
  stopPolling();
});
function onChange() {
  pagination.value.page = 1;
  getNovel();
}

function getNovel() {
  loading.value = true;
  axios
    .post("/novel/getNovel", {
      projectId: project.value?.id,
      page: pagination.value.page,
      limit: pagination.value.pageSize,
      search: searchText.value,
    })
    .then((res) => {
      tableData.value = res.data.data;
      pagination.value.total = res.data.total;
    })
    .finally(() => {
      loading.value = false;
    });
}
// 处理分页变化
function handlePageChange(pageInfo: { current: number; pageSize: number }) {
  pagination.value.page = pageInfo.current;
  pagination.value.pageSize = pageInfo.pageSize;
  getNovel();
}
const importNovelShow = ref(false);
// 导入原文
function importNovelFn() {
  importNovelShow.value = true;
}

function goToScriptAgent() {
  router.push("/scriptAgent");
}

function goToScript() {
  router.push({ path: "/script", query: { entry: "organize" } });
}
// 处理选择变化
function handleSelectChange(value: Array<string | number>, context: { selectedRowData: any[] }) {
  selectedRowKeys.value = value.filter(Boolean);
}
// 批量删除
function handleBatchDelete() {
  if (selectedRowKeys.value.length === 0) return;
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.novel.msg.batchDeleteHeader"),
    body: $t("workbench.novel.msg.batchDeleteBody", { count: selectedRowKeys.value.length }),
    onConfirm: async () => {
      await axios.post("/novel/batchDeleteNovel", {
        ids: selectedRowKeys.value,
      });
      getNovel();
      window.$message.success($t("workbench.novel.msg.batchDeleteSuccess"));
      dialog.destroy();
    },
  });
}
// 编辑
function handleEdit(row: OriginalText) {
  editNodelShow.value = true;
  formData.value = { ...row };
}
// 删除
function handleDelete(row: OriginalText) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.novel.msg.deleteHeader"),
    body: $t("workbench.novel.msg.deleteBody", { name: row.chapter }),
    onConfirm: async () => {
      try {
        await axios.post("/novel/delNovel", { id: row.id });
        window.$message.success($t("workbench.novel.msg.deleteSuccess"));
        if (tableData.value.length === 1 && pagination.value.page > 1) {
          pagination.value.page -= 1;
        }
        getNovel();
      } catch (e) {
        window.$message.error((e as Error).message);
      }
      window.$message.success($t("workbench.novel.msg.deleteSuccess"));
      dialog.destroy();
    },
  });
}

function startEventAnalysis() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.novel.msg.eventAnalysisHeader"),
    body: $t("workbench.novel.msg.eventAnalysisBody", { count: selectedRowKeys.value.length }),
    onConfirm: () => {
      dialog.destroy();
      axios
        .post("/novel/event/generateEvents", {
          projectId: project.value?.id!,
          novelIds: selectedRowKeys.value,
          concurrentCount: otherSetting.value.assetsBatchGenereateSize,
        })
        .then((res) => {
          selectedRowKeys.value.length = 0;
          getNovel();
          if (res.data?.pointsDeducted) {
            showPointsToast(res.data.pointsDeducted, res.data.balance);
          }
        });
    },
  });
}

const notCompultedData = computed(() => {
  return tableData.value.filter((item) => !item.eventState);
});

// 轮询相关
let pollingTimer: ReturnType<typeof setInterval> | null = null;

async function pollEventState() {
  if (notCompultedData.value.length === 0) return;
  const ids = notCompultedData.value.map((item) => item.id);
  try {
    const { data } = await axios.post("/novel/getNovelEventState", { ids });
    if (Array.isArray(data)) {
      data.forEach((item: { id: number; eventState: number; event?: string; errorReason?: string }) => {
        const target = tableData.value.find((row) => row.id === item.id);
        if (target) {
          target.eventState = item.eventState;
          if (target.eventState == -1) target.errorReason = item.errorReason;
          if (item.event !== undefined) target.event = item.event;
        }
      });
    }
  } catch (e) {
    console.error("轮询事件状态失败:", e);
  }
}

function startPolling() {
  if (pollingTimer) return;
  pollingTimer = setInterval(async () => {
    if (notCompultedData.value.length === 0) {
      stopPolling();
      return;
    }
    await pollEventState();
  }, 3000);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

watch(notCompultedData, (val) => {
  if (val.length > 0) {
    startPolling();
  } else {
    stopPolling();
  }
});
onUnmounted(() => {
  stopPolling();
});
</script>

<style lang="scss" scoped>
.novel {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 0 32px 16px;

  /* 页面引导 */
  .guideBanner {
    margin-top: 16px;
    margin-bottom: 12px;
    padding: 16px 20px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08));
    border: 1px solid rgba(102, 126, 234, 0.15);
    border-radius: 14px;
    flex-shrink: 0;
    .guideContent {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 12px;
      .guideIcon {
        font-size: 28px;
        flex-shrink: 0;
      }
      .guideCloseBtn {
        border-radius: 8px;
        font-size: 12px;
        padding: 4px 12px;
        border-color: rgba(102, 126, 234, 0.3);
        color: #667eea;
        flex-shrink: 0;
        &:hover {
          background: rgba(102, 126, 234, 0.08);
          border-color: rgba(102, 126, 234, 0.5);
        }
      }
      .guideText {
        flex: 1;
        .guideTitle {
          font-size: 15px;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 2px;
        }
        .guideDesc {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.5);
          line-height: 1.4;
        }
      }
    }
    .guideFlow {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 10px;
      border: 1px solid rgba(0, 0, 0, 0.04);
      .flowStep {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 8px;
        transition: all 0.3s ease;
        &.active {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
          border: 1px solid rgba(102, 126, 234, 0.25);
        }
        .flowNum {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .flowText {
          .flowTitle {
            font-size: 13px;
            font-weight: 600;
            color: #1a1a2e;
          }
          .flowDesc {
            font-size: 11px;
            color: rgba(0, 0, 0, 0.4);
          }
        }
      }
      .flowArrow {
        font-size: 16px;
        color: rgba(0, 0, 0, 0.3);
        font-weight: 300;
      }
    }
    .guideTip {
      font-size: 11px;
      color: rgba(0, 0, 0, 0.45);
      line-height: 1.5;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 8px;
    }
  }

  .workflowGuide {
    flex-shrink: 0;
    margin-top: 16px;
    margin-bottom: 12px;
    padding: 18px 20px 20px;
    border: 1px solid rgba(103, 94, 143, 0.13);
    border-radius: 18px;
    background: linear-gradient(135deg, #fff, #f8f5ff 58%, #fff4ec);
    box-shadow: 0 10px 28px rgba(54, 51, 91, 0.055);
  }

  .workflowGuideIntro {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }

  .workflowGuideEyebrow {
    color: #e76c2d;
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.12em;
  }

  .workflowGuide h2 {
    margin: 6px 0 4px;
    color: #2c2a35;
    font-size: 18px;
    line-height: 1.2;
  }

  .workflowGuide p {
    margin: 0;
    color: #777482;
    font-size: 12px;
    line-height: 1.55;
  }

  .workflowGuideHint {
    flex: none;
    padding: 6px 10px;
    border: 1px solid rgba(103, 94, 143, 0.1);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    color: #8d8796;
    font-size: 11px;
  }

  .workflowChoices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .workflowChoice {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
    padding: 12px 13px;
    border: 1px solid transparent;
    border-radius: 13px;
    text-align: left;
    cursor: pointer;
    transition: 0.2s ease;
  }

  .workflowChoice:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(75, 59, 107, 0.08);
  }

  .workflowChoiceAi { border-color: #f0c7aa; background: #fff5ed; }
  .workflowChoiceManual { border-color: #d8d2ef; background: #f7f5ff; }
  .workflowChoiceIcon { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: 10px; background: #fff; color: #df6d32; }
  .workflowChoiceManual .workflowChoiceIcon { color: #7061c8; }
  .workflowChoiceCopy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
  .workflowChoiceCopy strong { color: #332f3a; font-size: 13px; }
  .workflowChoiceCopy small { overflow: hidden; color: #817b88; font-size: 11px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
  .workflowChoiceArrow { flex: none; color: #ad9b8e; font-size: 18px; }

  .headBtn {
    margin-top: 24px;
    margin-bottom: 20px;
    padding: 16px 20px;
    background: var(--material-thin);
    backdrop-filter: var(--blur-light);
    -webkit-backdrop-filter: var(--blur-light);
    border: 1px solid var(--material-border-light);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
}

/* 表格容器 */
:deep(.t-table) {
  background: var(--material-regular);
  backdrop-filter: var(--blur-medium);
  -webkit-backdrop-filter: var(--blur-medium);
  border: 1px solid var(--material-border-medium);
  border-top: 1px solid var(--material-border-heavy);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  flex: 1;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 240px);
}

:deep(.t-table__content) {
  flex: 1;
  overflow-y: auto !important;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.12);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
  }
}

:deep(.t-table__header) {
  position: sticky;
  top: 0;
  z-index: 10;

  th {
    padding: 16px 18px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 2px solid var(--material-border-light);
  }
}

:deep(.t-table__body) {
  tr {
    transition: all 0.15s ease;

    &:hover {
      background: rgba(99, 102, 241, 0.05);
    }

    &:not(:last-child) {
      border-bottom: 1px solid rgba(0, 0, 0, 0.04);
    }
  }

  td {
    padding: 16px 18px;
    font-size: 14px;
    color: var(--text-primary);
  }
}

/* 去掉斑马纹 */
:deep(.t-table--stripe) .t-table__body tr:nth-child(even) {
  background: transparent;
}

:deep(.t-table--stripe) .t-table__body tr:nth-child(even):hover {
  background: rgba(99, 102, 241, 0.05);
}

/* 按钮样式 */
:deep(.t-button--theme-primary) {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
  border-radius: 10px;
  font-weight: 500;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    background: #ccc;
    box-shadow: none;
  }
}

:deep(.t-button--theme-danger) {
  border-radius: 10px;
  font-weight: 500;
  transition: all 0.25s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
  }
}

:deep(.t-button--variant-text) {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
}

/* 搜索框 */
:deep(.t-input) {
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--material-border-light);
  transition: all 0.2s ease;

  &:focus-within {
    border-color: rgba(99, 102, 241, 0.4);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
}

/* 分页器 */
:deep(.t-table__pagination-wrap) {
  padding: 16px 20px;
  border-top: 1px solid var(--material-border-light);
}

:deep(.t-pagination__btn) {
  background: var(--material-thin);
  border: 1px solid var(--material-border-light);
  border-radius: 10px;
  transition: all 0.2s ease;

  &:hover:not(.t-is-disabled) {
    background: var(--material-regular);
    border-color: var(--accent-primary);
  }
}

:deep(.t-pagination__number) {
  border-radius: 10px;
  transition: all 0.2s ease;

  &.t-is-current {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    border: none;
  }
}

/* 复选框 */
:deep(.t-checkbox) {
  transition: all 0.2s ease;

  &.t-is-checked .t-checkbox__input {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border-color: #6366f1;
  }
}

.chapterDataCell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chapterPreview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 200px;
}

.eventCell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.eventPreview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 200px;
}

.previewDialogContent {
  max-height: 65vh;
  overflow: auto;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  color: var(--text-primary);
  padding: 20px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
}

/* 链接 */
:deep(.t-link--theme-success) {
  color: #6366f1;
  font-size: 12px;

  &:hover {
    color: #4f46e5;
  }
}
.novel{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;padding:22px 34px;background:linear-gradient(180deg,#fbfbfc,#f6f7fa)}.novel .guideBanner{padding:20px 24px;border-radius:20px;background:linear-gradient(135deg,#f2f0ff,#fff4ea);border-color:rgba(108,98,205,.13);box-shadow:0 12px 30px rgba(54,51,91,.06)}.novel .guideBanner .guideContent .guideTitle{font-size:18px;color:#292b38}.novel .guideBanner .guideContent .guideDesc{font-size:13px;color:#737682}.novel .guideBanner .guideFlow{background:rgba(255,255,255,.72);border-radius:14px}.novel .headBtn{padding:14px 16px;border-radius:18px;background:#fff;border:1px solid #e9e9ed;box-shadow:0 8px 24px rgba(37,40,57,.05)}.novel :deep(.t-button){border-radius:11px}.novel :deep(.t-button--theme-primary){background:#24252b;border-color:#24252b}.novel :deep(.t-table){border-radius:20px;border-color:#e8e9ed;background:#fff;box-shadow:0 12px 34px rgba(37,40,57,.06)}
</style>

<style lang="scss">
.novel {
  .importBtn,
  .searchBtn,
  .analysisBtn:not(:disabled) {
    color: #fff !important;

    .t-button__text,
    .t-icon,
    svg {
      color: #fff !important;
    }
  }

  .importBtn {
    border-color: transparent !important;
    background: linear-gradient(135deg, #ff8847, #f26432) !important;
  }

  .analysisBtn:not(:disabled) {
    border-color: transparent !important;
    background: linear-gradient(135deg, #8576e8, #6657c8) !important;
    box-shadow: 0 7px 16px rgba(102, 87, 200, .2) !important;
  }

  .searchBtn {
    border-color: transparent !important;
    background: linear-gradient(135deg, #ff8847, #f26432) !important;
    box-shadow: 0 7px 16px rgba(239, 100, 48, .2) !important;
  }

  .t-table .t-button--theme-primary.t-button--variant-text {
    border-color: transparent !important;
    background: transparent !important;
    color: #e9632b !important;
    box-shadow: none !important;

    .t-button__text,
    .t-icon,
    svg {
      color: #e9632b !important;
    }

    &:hover:not(:disabled) {
      background: #fff0e8 !important;
      color: #d95520 !important;
    }
  }

  .analysisBtn:disabled,
  .dangerBtn:disabled {
    .t-button__text,
    .t-icon,
    svg {
      color: #9997a0 !important;
    }
  }
}
</style>

<style lang="scss" scoped>
.novel {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 24px clamp(22px, 3vw, 46px) 22px;
  background:
    radial-gradient(circle at 91% 2%, rgba(255, 174, 119, .17), transparent 23%),
    linear-gradient(180deg, #faf9fb 0%, #f5f5f7 100%);
  color: #292833;

  .novelHero {
    position: relative;
    min-height: 168px;
    flex: none;
    overflow: hidden;
    padding: 28px 34px;
    border: 1px solid rgba(89, 76, 148, .11);
    border-radius: 25px;
    background:
      radial-gradient(circle at 85% 10%, rgba(255, 151, 91, .28), transparent 24%),
      radial-gradient(circle at 68% 105%, rgba(125, 109, 225, .18), transparent 36%),
      linear-gradient(132deg, #fff 0%, #f7f3ff 55%, #fff4eb 100%);
    box-shadow: 0 17px 42px rgba(58, 49, 99, .075);
  }
  .novelHeroCopy { position: relative; z-index: 2; max-width: 620px; }
  .novelEyebrow { color: #e76c2d; font-size: 10px; font-weight: 750; letter-spacing: .17em; }
  .novelHero h1 { margin: 9px 0 7px; color: #292733; font-size: clamp(28px, 2.7vw, 39px); line-height: 1.08; letter-spacing: -.045em; }
  .novelHero p { margin: 0; color: #777482; font-size: 13px; line-height: 1.65; }
  .novelMeta { display: flex; align-items: center; gap: 8px; margin-top: 15px; }
  .novelMeta span { padding: 6px 10px; border: 1px solid rgba(103,94,143,.11); border-radius: 999px; background: rgba(255,255,255,.62); color: #74717f; font-size: 11px; }
  .novelMeta strong { color: #302d39; font-size: 13px; }
  .novelHeroArt { position: absolute; top: 0; right: 2%; width: 280px; height: 100%; pointer-events: none; }
  .page { position: absolute; display: flex; flex-direction: column; justify-content: space-between; width: 104px; height: 124px; padding: 14px; border: 1px solid rgba(255,255,255,.72); border-radius: 17px; color: #fff; box-shadow: 0 16px 32px rgba(66,53,108,.16); font-size: 8px; letter-spacing: .13em; }
  .pageBack { top: 24px; right: 112px; transform: rotate(-8deg); background: linear-gradient(145deg,#8d7ce8,#5c50b7); }
  .pageFront { top: 18px; right: 24px; transform: rotate(8deg); background: linear-gradient(145deg,#ff9b61,#e75f42); }
  .page i { font-style: normal; }
  .page strong { font-size: 31px; letter-spacing: -.06em; }

  .headBtn { flex: none; margin: 15px 0 12px; padding: 12px 14px; border: 1px solid #e8e7ec; border-radius: 17px; background: rgba(255,255,255,.86); box-shadow: 0 8px 22px rgba(42,39,58,.045); }
  .headBtn :deep(.t-space) { gap: 8px !important; }
  :deep(.t-button) { min-height: 36px; border-radius: 11px; font-weight: 600; }
  :deep(.importBtn) { border-color: transparent !important; background: linear-gradient(135deg,#ff8847,#f26432) !important; color: #fff !important; box-shadow: 0 8px 18px rgba(239,100,48,.22); }
  :deep(.importBtn .t-button__text), :deep(.importBtn .t-icon) { color: #fff !important; }
  :deep(.analysisBtn) { border: 1px solid transparent !important; background: linear-gradient(135deg,#8576e8,#6657c8) !important; color: #fff !important; box-shadow: 0 7px 16px rgba(102,87,200,.2) !important; }
  :deep(.searchBtn) { border: 1px solid transparent !important; background: linear-gradient(135deg,#ff8847,#f26432) !important; color: #fff !important; box-shadow: 0 7px 16px rgba(239,100,48,.2) !important; }
  :deep(.analysisBtn .t-button__text), :deep(.analysisBtn .t-icon), :deep(.searchBtn .t-button__text), :deep(.searchBtn .t-icon) { color: #fff !important; }
  :deep(.analysisBtn:disabled) { border-color: #e3e2e7 !important; background: #e3e2e7 !important; color: #9997a0 !important; box-shadow: none; }
  :deep(.analysisBtn:disabled .t-button__text), :deep(.analysisBtn:disabled .t-icon) { color: #9997a0 !important; }
  :deep(.dangerBtn:not(:disabled)) { border-color: #f1d3d0 !important; background: #fff3f1 !important; color: #c7443b !important; }
  :deep(.dangerBtn:not(:disabled) .t-button__text), :deep(.dangerBtn:not(:disabled) .t-icon) { color: #c7443b !important; }
  :deep(.dangerBtn:disabled) { border-color: #e7e6ea !important; background: #f1f0f3 !important; color: #aaa8af !important; }
  :deep(.dangerBtn:disabled .t-button__text), :deep(.dangerBtn:disabled .t-icon) { color: #aaa8af !important; }
  :deep(.t-input) { height: 38px; border-color: #e2e1e6; border-radius: 11px; background: #f8f8fa; }
  :deep(.t-input:focus-within) { border-color: rgba(235,107,48,.48); box-shadow: 0 0 0 3px rgba(242,112,54,.09); }

  :deep(.t-table) { min-height: 0; max-height: none; border: 1px solid #e8e7ec; border-radius: 19px; background: #fff; box-shadow: 0 12px 30px rgba(40,37,54,.055); }
  :deep(.t-table__header th) { padding: 13px 16px; border-bottom: 1px solid #ecebf0; background: #f8f8fa; color: #55525f; font-size: 12px; font-weight: 650; }
  :deep(.t-table__body td) { padding: 14px 16px; color: #393741; }
  :deep(.t-table__body tr:hover) { background: #faf8ff; }
  :deep(.t-table__pagination-wrap) { padding: 11px 16px; background: #fff; }
  :deep(.t-pagination__number.t-is-current) { border: 0; background: #f26b35; color: #fff; }
}

@media (max-width: 850px) {
  .novel {
    padding: 16px;
    overflow-y: auto;
    .novelHero { min-height: 184px; padding: 26px 24px; }
    .novelHeroCopy { max-width: 68%; }
    .novelHeroArt { right: -58px; opacity: .42; }
    .headBtn { align-items: stretch; flex-direction: column; }
    .headBtn > .f { width: 100%; }
    .headBtn > .f :deep(.t-input__wrap) { flex: 1; }
  }
}
</style>
