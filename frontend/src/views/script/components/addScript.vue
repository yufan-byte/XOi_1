<template>
  <div class="addScript">
    <t-dialog
      v-model:visible="addScriptShow"
      width="60vw"
      top="5vh"
      :header="$t('workbench.script.add.title')"
      :closable="false"
      :maskClosable="false">
      <div class="data">
        <div class="section name">
          <span class="section-label">{{ $t("workbench.script.add.scriptName") }}</span>
          <t-input v-model="scriptName" :placeholder="$t('workbench.script.add.scriptNamePh')" />
        </div>

        <div class="section upload">
          <span class="section-label">{{ $t("workbench.script.add.uploadFile") }}</span>
          <div class="upload-area" @click="triggerUpload" @dragover.prevent @drop.prevent="handleDrop">
            <t-upload
              ref="uploadRef"
              v-model="fileList"
              theme="file"
              :multiple="false"
              :max="1"
              :before-upload="handleBeforeUpload"
              style="display: none" />
            <div class="dragIcon">
              <i-upload-one theme="outline" size="32" fill="var(--td-brand-color)" />
            </div>
            <p class="upload-text">{{ $t("workbench.script.add.dragUpload") }}</p>
            <p class="upload-hint">{{ $t("workbench.script.add.uploadHint") }}</p>
          </div>
        </div>

        <div class="section content">
          <span class="section-label">{{ $t("workbench.script.add.scriptContent") }}</span>
          <t-textarea
            v-model="scriptData"
            :placeholder="$t('workbench.script.add.scriptContentPh')"
            name="description"
            :autosize="{ minRows: 12, maxRows: 12 }" />
          <div class="scriptLen">{{ scriptData.length }}/{{ otherSetting.scriptEpisodeLength }}</div>
        </div>

        <div class="section assets-section">
          <div class="assets-header">
            <span class="section-label">{{ $t("workbench.script.add.relatedAssets") }}</span>
            <t-button size="small" theme="primary" variant="outline" @click="handleSelectAssets">
              <template #icon><i-plus /></template>
              {{ $t("workbench.script.add.selectAssets") }}
            </t-button>
          </div>
          <div class="assets-list" v-if="selectedAssets.length">
            <t-tag v-for="asset in selectedAssets" :key="asset.id" closable variant="light-outline" @close="removeAsset(asset.id)">
              {{ asset.name }}
            </t-tag>
          </div>
          <div v-else class="assets-empty">{{ $t("workbench.script.add.noAssets") }}</div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <t-button theme="default" @click="handleCancel">{{ $t("workbench.script.add.cancel") }}</t-button>
          <t-button theme="primary" :loading="keepLoading" :disabled="scriptData.length > otherSetting.scriptEpisodeLength" @click="handleConfirm">
            {{ $t("workbench.script.add.confirm") }}
          </t-button>
        </div>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { LoadingPlugin } from "tdesign-vue-next";

import type { UploadFile } from "tdesign-vue-next";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import openAssetsSelector from "@/utils/assetsCheck";
import settingStore from "@/stores/setting";
const { otherSetting } = storeToRefs(settingStore());
const { project } = storeToRefs(projectStore());

const addScriptShow = defineModel<boolean>({
  default: false,
});

const uploadRef = ref<any>(null);
const content = ref<string>("");
const fileList = ref<UploadFile[]>([]);
const scriptData = ref<string>("");

const keepLoading = ref(false);

// 触发上传
function triggerUpload(): void {
  uploadRef.value?.triggerUpload();
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
// 上传前校验并解析
async function handleBeforeUpload(file: UploadFile): Promise<boolean> {
  const rawFile = file.raw;
  if (!rawFile) {
    window.$message.error($t("workbench.script.add.msg.fileReadFailed"));
    return false;
  }

  const allowTypes = ["text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

  if (rawFile.type === "application/msword") {
    window.$message.warning($t("workbench.script.add.msg.docNotSupported"));
    fileList.value = [];
    return false;
  }
  if (!allowTypes.includes(rawFile.type)) {
    window.$message.error($t("workbench.script.add.msg.unsupportedType"));
    fileList.value = [];
    return false;
  }
  if (rawFile.size > 10 * 1024 * 1024) {
    window.$message.error($t("workbench.script.add.msg.fileTooLarge"));
    fileList.value = [];
    return false;
  }

  const loader = LoadingPlugin({
    fullscreen: true,
    attach: "body",
    text: $t("workbench.script.add.msg.parsing"),
  });
  try {
    content.value = await readFile(rawFile);
    scriptData.value = content.value;
  } catch (error) {
    console.error("文件解析失败:", error);
    window.$message.error($t("workbench.script.add.msg.parseFailed"));
    fileList.value = [];
  } finally {
    loader.hide();
  }
  return false;
}
// 处理拖拽上传
async function handleDrop(e: DragEvent): Promise<void> {
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    fileList.value = [];
    const file = files[0];
    await handleBeforeUpload({ raw: file } as UploadFile);
  }
}
// ============== Assets ==============
interface SelectedAsset {
  id: number;
  name: string;
}
const selectedAssets = ref<SelectedAsset[]>([]);

async function handleSelectAssets() {
  const assets = await openAssetsSelector({ title: $t("workbench.script.add.msg.selectAssetsTitle"), types: ["role", "tool", "scene"] });
  if (assets.length) {
    const existing = new Set(selectedAssets.value.map((a) => a.id));
    for (const a of assets) {
      if (!existing.has(a.id)) {
        selectedAssets.value.push({ id: a.id, name: a.name });
      }
    }
  }
}

function removeAsset(id: number) {
  selectedAssets.value = selectedAssets.value.filter((a) => a.id !== id);
}

function handleCancel(): void {
  addScriptShow.value = false;
  scriptData.value = "";
  content.value = "";
  fileList.value = [];
  selectedAssets.value = [];
}
function closeWin(): void {
  scriptData.value = "";
  content.value = "";
  fileList.value = [];
  selectedAssets.value = [];
  addScriptShow.value = false;
}
const emit = defineEmits(["searchScripts"]);
async function handleConfirm(): Promise<void> {
  if (!scriptData.value.trim()) {
    window.$message.warning($t("workbench.script.add.msg.enterContent"));
    return;
  }
  if (!scriptName.value.trim()) {
    window.$message.warning($t("workbench.script.add.msg.enterName"));
    return;
  }
  keepLoading.value = true;
  try {
    await axios.post("/script/addScript", {
      name: scriptName.value,
      content: scriptData.value,
      projectId: project.value?.id,
      assets: selectedAssets.value.map((a) => a.id),
    });
    window.$message.success($t("workbench.script.add.msg.addSuccess"));
    closeWin();
    emit("searchScripts");
  } catch (error) {
    console.error("添加剧本失败:", error);
    window.$message.error((error as any).message ?? $t("workbench.script.add.msg.addFailed"));
  } finally {
    keepLoading.value = false;
  }
}
const scriptName = ref<string>("");
</script>

<style lang="scss" scoped>
$line-height: 28px;

.addScript {
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
    }
    .t-dialog__body {
      padding: 20px 28px;
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
    display: flex;
    flex-direction: column;
    gap: 20px;

    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      .scriptLen {
        text-align: right;
        font-size: 12px;
        color: rgba(0, 0, 0, 0.4);
        font-weight: 500;
      }
    }

    .section-label {
      font-size: 14px;
      font-weight: 700;
      color: #1a1a2e;
    }

    /* 输入框 */
    :deep(.t-input) {
      border-radius: 12px;
      border: 1.5px solid rgba(0, 0, 0, 0.08);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      &:focus-within {
        border-color: #667eea;
        box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.12);
      }
    }

    :deep(.t-textarea) {
      border-radius: 14px;
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

    .upload {
      .upload-area {
        padding: 40px 20px;
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

        .upload-text {
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 8px;
          color: #1a1a2e;
        }

        .upload-hint {
          font-size: 12px;
          margin: 0;
          color: rgba(0, 0, 0, 0.4);
        }
      }
    }

    .assets-section {
      .assets-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .assets-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        .t-tag {
          border-radius: 8px;
          font-weight: 500;
        }
      }
      .assets-empty {
        font-size: 13px;
        color: rgba(0, 0, 0, 0.35);
      }
    }

    .content {
      width: 100%;
      overflow: auto;
    }
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 0 0;
    border-top: 1px solid rgba(0, 0, 0, 0.06);

    :deep(.t-button) {
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      padding: 10px 24px;
      height: auto;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      &:hover {
        transform: translateY(-1px);
      }
    }
    :deep(.t-button--theme-primary) {
      background: linear-gradient(135deg, #667eea, #764ba2);
      border: none;
      color: #fff;
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
      &:hover {
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.45);
      }
    }
  }
}
</style>
