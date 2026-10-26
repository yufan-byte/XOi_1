<template>
  <div class="purgeNovel">
    <t-dialog :footer="false" v-model:visible="purgeNovelShow" :header="$t('workbench.novel.import.title')" width="min(880px, calc(100vw - 32px))" placement="center">
      <div class="data">
        <t-tabs :value="activeKey" disabled>
          <t-tab-panel value="To1" :label="$t('workbench.novel.import.step1')" style="height: min(600px, calc(100dvh - 230px)); min-height: 260px; overflow-y: auto">
            <div class="uploadArea" @click="triggerUpload" @dragover.prevent @drop.prevent="handleDrop">
              <t-upload
                ref="uploadRef"
                v-model="fileList"
                theme="file"
                :multiple="false"
                :max="1"
                :before-upload="handleBeforeUpload"
                :request-method="requestMethod"
                style="display: none" />
              <div class="dragIcon">
                <i-upload-one theme="outline" size="32" fill="var(--td-brand-color)" />
              </div>
              <p class="uploadText">{{ $t("workbench.novel.import.dragUpload") }}</p>
              <p class="uploadHint">{{ $t("workbench.novel.import.uploadHint") }}</p>
            </div>
            <t-divider>{{ $t("workbench.novel.import.or") }}</t-divider>
            <div class="formItem">
              <div class="label">{{ $t("workbench.novel.import.pasteLabel") }}</div>
              <div class="uploadWrap">
                <t-textarea v-model="content" :placeholder="$t('workbench.novel.import.pastePlaceholder')" :autosize="{ minRows: 12, maxRows: 12 }" />
              </div>
              <div class="footerInfo f ac jb" style="margin-top: 8px">
                <div>
                  <span class="charCount">{{ content.length }} {{ $t("workbench.novel.import.chars") }}</span>
                  <span v-if="content.length > 0 && content.length < 100" class="tips warn">{{ $t("workbench.novel.import.tooShort") }}</span>
                </div>
                <span>{{ $t("workbench.novel.import.parsedChapters", { count: tableData.length }) }}</span>
              </div>
            </div>

            <div style="margin-top: 16px; text-align: right">
              <t-button theme="primary" style="margin-left: 10px" :disabled="!content || !tableData.length" @click="activeKey = 'To2'">
                {{ $t("workbench.novel.import.nextStep") }}
              </t-button>
            </div>
          </t-tab-panel>
          <t-tab-panel value="To2" :label="$t('workbench.novel.import.step2')" style="height: min(600px, calc(100dvh - 230px)); min-height: 260px; overflow-y: auto">
            <div class="fc to2Box">
              <t-table
                ref="tableRef"
                row-key="index"
                :data="tableData"
                :columns="columns"
                :selected-row-keys="selectedRowKeys"
                hover
                style="flex: 1; overflow-y: auto"
                @select-change="onSelectChange">
                <template #chapterData="{ row }">
                  <t-tooltip :content="row.chapterData" placement="top">
                    <span class="ellipsisText">{{ row.chapterData }}</span>
                  </t-tooltip>
                </template>
              </t-table>
              <div class="selectedInfo">{{ $t("workbench.novel.import.selectedInfo", { count: selectedTextLength }) }}</div>
              <div style="margin-top: 16px; text-align: right">
                <t-button variant="outline" @click="activeKey = 'To1'">{{ $t("workbench.novel.import.prevStep") }}</t-button>
                <t-button theme="primary" style="margin-left: 10px" :loading="nextLoading" @click="keep">
                  保存
                </t-button>
              </div>
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { LoadingPlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import parseNovel from "@/utils/parseNovel";

import type { UploadFile, PrimaryTableCol, TableRowData } from "tdesign-vue-next";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());
interface ChapterItem {
  index: number;
  reel: string;
  chapter: string;
  chapterData: string;
}

const purgeNovelShow = defineModel<boolean>();

const activeKey = ref("To1");
const uploadRef = ref();
const content = ref("");
const fileList = ref<any[]>([]);
const selectedRowKeys = ref<number[]>([]);

const nextLoading = ref(false);

const columns: PrimaryTableCol<TableRowData>[] = [
  { colKey: "row-select", type: "multiple", width: 60 },
  { colKey: "index", title: $t("workbench.novel.import.col.chapter"), width: 100 },
  { colKey: "reel", title: $t("workbench.novel.import.col.reel"), width: 100 },
  { colKey: "chapter", title: $t("workbench.novel.import.col.chapterName"), width: 200, ellipsis: true },
  { colKey: "chapterData", title: $t("workbench.novel.import.col.chapterData"), ellipsis: true },
];

// 解析后的章节数据
const tableData = computed<ChapterItem[]>(() => {
  if (!content.value) return [];
  try {
    return parseNovel(content.value).flatMap((reel) =>
      reel.chapters.map((chapter) => ({
        index: chapter.index,
        reel: reel.reel,
        chapter: chapter.chapter,
        chapterData: chapter.text,
      })),
    );
  } catch (e) {
    console.error("解析小说内容出错:", e);
    return [];
  }
});

// 选中的行数据
const selectedRows = computed(() => tableData.value.filter((item) => selectedRowKeys.value.includes(item.index)));

// 已选文本总长度
const selectedTextLength = computed(() => selectedRows.value.reduce((sum, item) => sum + item.chapterData.length, 0));

// 触发上传
function triggerUpload() {
  uploadRef.value?.triggerUpload();
}

// 处理拖拽上传
async function handleDrop(e: DragEvent) {
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    await handleBeforeUpload({ raw: files[0] });
  }
}

// 读取文件内容
async function readFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (file.type === "text/plain") {
    return new TextDecoder().decode(buffer);
  }
  const { default: mammoth } = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}
function requestMethod() {
  return Promise.resolve({
    response: {},
    status: "success",
  } as const);
}

// 上传前校验并解析
async function handleBeforeUpload(file: UploadFile) {
  const rawFile = file.raw;
  if (!rawFile) {
    window.$message.error($t("workbench.novel.import.msg.selectFile"));
    return false;
  }
  const allowTypes = ["text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

  if (rawFile.type === "application/msword") {
    window.$message.warning($t("workbench.novel.import.msg.docNotSupported"));
    return false;
  }
  if (!allowTypes.includes(rawFile.type)) {
    window.$message.error($t("workbench.novel.import.msg.unsupportedType"));
    return false;
  }
  if (rawFile.size > 10 * 1024 * 1024) {
    window.$message.error($t("workbench.novel.import.msg.fileTooLarge"));
    return false;
  }

  LoadingPlugin(true);
  try {
    content.value = await readFile(rawFile);
  } catch {
    window.$message.error($t("workbench.novel.import.msg.parseFailed"));
  } finally {
    LoadingPlugin(false);
  }
  return false;
}

// 勾选变化
function onSelectChange(selectedKeys: Array<string | number>, context: { selectedRowData: TableRowData[] }) {
  selectedRowKeys.value = selectedKeys as number[];
}
const emit = defineEmits(["select"]);
//保存小说
async function keep() {
  nextLoading.value = true;
  if (!selectedRows.value.length) {
    window.$message.warning($t("workbench.novel.import.msg.selectChapters"));
    nextLoading.value = false;
    return;
  }
  try {
    await axios.post("/novel/addNovel", { projectId: project.value?.id, data: selectedRows.value });
    nextLoading.value = false;
    emit("select");
    window.$message.success($t("workbench.novel.import.msg.saveSuccess"));
  } catch (e) {
    window.$message.error((e as Error).message);
    nextLoading.value = false;
  } finally {
    nextLoading.value = false;
    purgeNovelShow.value = false;
  }
}
//关闭弹窗时重置数据
watch(purgeNovelShow, (newVal) => {
  if (!newVal) {
    content.value = "";
    fileList.value = [];
    selectedRowKeys.value = [];
    activeKey.value = "To1";
  }
});
</script>

<style lang="scss" scoped>
.purgeNovel {
  :deep(.t-dialog) {
    border-radius: 24px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.06);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.15),
      0 8px 24px rgba(0, 0, 0, 0.08);
    overflow: hidden;

    .t-dialog__header {
      font-weight: 700;
      font-size: 18px;
      color: #1a1a2e;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      padding: 20px 28px;
      background: rgba(0, 0, 0, 0.01);
    }
    .t-dialog__body {
      padding: 12px 28px 24px;
    }
    .t-dialog__close {
      transition: all 0.2s ease;
      &:hover {
        background: rgba(0, 0, 0, 0.06);
        border-radius: 8px;
      }
    }
  }
  .data {
    /* 标签栏 */
    :deep(.t-tabs__header) {
      background: rgba(0, 0, 0, 0.03);
      border: 1px solid rgba(0, 0, 0, 0.06);
      border-radius: 12px;
      padding: 4px 6px;
    }
    :deep(.t-tabs__nav-item) {
      font-size: 13px;
      font-weight: 600;
      border-radius: 10px;
      padding: 8px 16px;
      transition: all 0.3s ease;
      &.t-is-active {
        color: #667eea;
        background: rgba(102, 126, 234, 0.08);
      }
    }
    :deep(.t-tabs__bar) {
      background: linear-gradient(90deg, #667eea, #764ba2);
      height: 3px;
      border-radius: 2px;
    }
    .uploadArea {
      margin-top: 16px;
      padding: 48px 24px;
      border: 2px dashed rgba(102, 126, 234, 0.3);
      border-radius: 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.03), rgba(118, 75, 162, 0.03));
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.3), transparent);
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      &:hover {
        border-color: rgba(102, 126, 234, 0.6);
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.06), rgba(118, 75, 162, 0.06));
        transform: translateY(-2px);
        box-shadow: 0 8px 32px rgba(102, 126, 234, 0.12);

        &::before {
          opacity: 1;
        }

        .dragIcon {
          transform: scale(1.1);
        }
      }

      .dragIcon {
        margin-bottom: 16px;
        transition: transform 0.3s ease;
      }

      .uploadText {
        font-size: 15px;
        font-weight: 600;
        margin: 0 0 8px;
        color: #1a1a2e;
      }

      .uploadHint {
        font-size: 12px;
        margin: 0;
        color: rgba(0, 0, 0, 0.4);
      }
    }
    :deep(.t-divider) {
      border-color: rgba(0, 0, 0, 0.06);
      margin: 20px 0;
      .t-divider__inner-text {
        font-size: 12px;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.35);
        padding: 0 16px;
        background: rgba(255, 255, 255, 0.92);
      }
    }
    .to2Box {
      height: 100%;
    }
    .formItem {
      .label {
        font-weight: 700;
        font-size: 14px;
        margin-bottom: 10px;
        color: #1a1a2e;
      }
      .footerInfo {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.45);
        .charCount {
          font-weight: 500;
        }
        .tips.warn {
          margin-left: 8px;
          color: #f59e0b;
          font-weight: 500;
        }
      }
    }
    /* 输入框 */
    :deep(.t-textarea) {
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.8);
      border: 1.5px solid rgba(0, 0, 0, 0.08);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
      &:focus-within {
        border-color: #667eea;
        box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.12);
        background: #fff;
      }
      .t-textarea__inner {
        padding: 14px 16px;
        font-size: 14px;
        line-height: 1.7;
      }
    }
    /* 按钮 */
    :deep(.t-button--theme-primary) {
      background: linear-gradient(135deg, #667eea, #764ba2);
      border: none;
      color: #fff;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      padding: 10px 24px;
      height: auto;
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.45);
      }
      &.t-is-disabled {
        opacity: 0.5;
        transform: none;
        box-shadow: none;
      }
    }
    :deep(.t-button--variant-outline) {
      border-radius: 12px;
      font-weight: 500;
      transition: all 0.3s ease;
      &:hover {
        background: rgba(0, 0, 0, 0.04);
      }
    }
    /* 表格（第二步） */
    :deep(.t-table) {
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
      .t-table__header {
        background: rgba(102, 126, 234, 0.04);
        th {
          font-size: 12px;
          font-weight: 700;
          color: rgba(0, 0, 0, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          padding: 14px 16px;
        }
      }
      .t-table__body {
        tr {
          transition: all 0.2s ease;
          &:hover {
            background: rgba(102, 126, 234, 0.06) !important;
          }
          td {
            border-bottom: 1px solid rgba(0, 0, 0, 0.04);
            padding: 12px 16px;
          }
        }
      }
    }
    /* 滚动条 */
    .t-tab-panel {
      &::-webkit-scrollbar {
        width: 6px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.12);
        border-radius: 3px;
        &:hover {
          background: rgba(0, 0, 0, 0.2);
        }
      }
    }
  }
}
.ellipsisText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 100%;
}
.selectedInfo {
  margin-top: 14px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.5);
}
</style>
