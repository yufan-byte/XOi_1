<template>
  <t-dialog
    v-model:visible="addAssetsShow"
    :closable="false"
    width="40vw"
    :header="props.formData.id ? '编辑' : '新增'"
    :maskClosable="false"
    @close-btn-click="handleCancel"
    @confirm="onConfirm"
    @cancel="handleCancel">
    <div class="data">
      <t-form :data="props.formData" :rules="rules" ref="formRef">
        <t-form-item :label="$t('workbench.assets.add.audioName')" name="name">
          <t-input v-model="props.formData.name" :placeholder="$t('workbench.assets.add.audioNamePh')"></t-input>
        </t-form-item>
        <t-form-item :label="$t('workbench.assets.add.describe')" name="describe">
          <t-textarea v-model="props.formData.describe" :placeholder="$t('workbench.assets.add.describePh')"></t-textarea>
        </t-form-item>
        <t-form-item :label="$t('workbench.assets.add.sex')" name="remark">
          <t-input v-model="props.formData.sex" :placeholder="$t('workbench.assets.add.sexPh')"></t-input>
        </t-form-item>
        <t-form-item :label="$t('workbench.assets.add.audioFile')" name="audioFile">
          <div class="audio-list">
            <div v-for="(item, index) in audioItems" :key="index" class="audio-item">
              <div class="audio-upload-row">
                <div class="audio-file-area" @click="triggerFileInput(index)" @dragover.prevent @drop.prevent="(e) => handleDrop(e, index)">
                  <template v-if="item.file">
                    <i-volume-notice size="16" />
                    <span class="audio-filename">{{ item.file.name }}</span>
                  </template>
                  <template v-else-if="item.src">
                    <i-volume-notice size="16" fill="var(--td-success-color)" />
                    <span class="audio-filename audio-filename--existing">{{ item.name }}</span>
                    <t-tag size="small" theme="success" variant="light" style="margin-left: auto; flex-shrink: 0">已上传</t-tag>
                  </template>
                  <template v-else>
                    <i-upload-one size="16" fill="var(--td-brand-color)" />
                    <span class="audio-upload-hint">点击或拖拽上传音频</span>
                  </template>
                  <input
                    :ref="(el) => (fileInputRefs[index] = el as HTMLInputElement)"
                    type="file"
                    accept="audio/*"
                    style="display: none"
                    @change="(e) => handleFileChange(e, index)" />
                </div>
                <t-button theme="danger" variant="outline" shape="circle" size="small" @click="removeAudioItem(index)">
                  <template #icon><i-close size="12" /></template>
                </t-button>
              </div>
              <div class="recordRow"><t-button size="small" variant="outline" :disabled="recordingIndex !== null && recordingIndex !== index" @click="recordingIndex === index ? stopRecording() : startRecording(index)">{{ recordingIndex === index ? '停止录音' : '录制声音' }}</t-button><span>{{ recordingIndex === index ? '录音中，最长 60 秒' : '录音将作为音频素材保存，不会自动克隆音色' }}</span></div>
              <audio v-if="item.previewUrl || item.src" :src="item.previewUrl || item.src" controls class="audioPreview" />
              <t-input v-model="item.text" placeholder="请输入该音频对应的文本内容" class="audio-text-input" />
              <t-input v-model="item.describe" placeholder="请输入该音频的描述" class="audio-text-input" />
            </div>
            <t-button theme="primary" variant="outline" size="small" @click="addAudioItem">
              <template #icon><i-plus /></template>
              添加音频
            </t-button>
          </div>
        </t-form-item>
      </t-form>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());

interface AudioItem {
  id?: number;
  src?: string;
  file: File | null;
  text: string;
  name: string;
  describe: string;
  previewUrl?: string;
}
const props = defineProps<{
  formData: {
    id?: number;
    name: string;
    describe: string;
    sex: string;
    sonAssets?: {
      id?: number;
      src?: string;
      prompt: string;
      name?: string;
      describe?: string;
    }[];
  };
  scriptId?: number | null;
}>();
const addAssetsShow = defineModel<boolean>({
  default: false,
});
const rules = ref<{}>({
  name: [{ required: true, message: $t("workbench.assets.add.nameRequired"), trigger: "blur" }],
  describe: [{ required: true, message: $t("workbench.assets.add.describeRequired"), trigger: "blur" }],
});
function handleCancel() {
  discardRecording();
  audioItems.value.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
  addAssetsShow.value = false;
  // 重置音频列表
  audioItems.value = [{ file: null, text: "", name: "", describe: "" }];
}
const formRef = ref();
const emit = defineEmits(["getFilteredData"]);

const audioItems = ref<AudioItem[]>([{ file: null, text: "", name: "", describe: "" }]);
const fileInputRefs = ref<HTMLInputElement[]>([]);
const recordingIndex = ref<number | null>(null);
let recorder: MediaRecorder | null = null;
let recordingStream: MediaStream | null = null;
let recordingTimer: ReturnType<typeof setTimeout> | null = null;
let discardCurrentRecording = false;
async function startRecording(index: number) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return window.$message.warning('当前浏览器不支持录音，请上传音频文件');
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = ['audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!preferred) throw new Error('当前浏览器没有可用的录音格式，请上传音频文件');
    const target = audioItems.value[index];
    const chunks: Blob[] = [];
    discardCurrentRecording = false;
    recorder = new MediaRecorder(recordingStream, { mimeType: preferred });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      recordingStream?.getTracks().forEach(track => track.stop()); recordingStream = null;
      if (recordingTimer) clearTimeout(recordingTimer); recordingTimer = null;
      if (!discardCurrentRecording && chunks.length && audioItems.value.includes(target)) {
        const blob = new Blob(chunks, {type: preferred});
        if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
        target.file = new File([blob], `录音-${Date.now()}.${preferred === 'audio/mp4' ? 'm4a' : 'webm'}`, { type: preferred });
        target.src = undefined; target.previewUrl = URL.createObjectURL(blob); target.name ||= target.file.name;
      }
      recordingIndex.value = null; recorder = null;
    };
    recorder.start(); recordingIndex.value = index;
    recordingTimer = setTimeout(() => stopRecording(), 60_000);
  } catch (e: any) {
    recordingStream?.getTracks().forEach(track => track.stop()); recordingStream = null; recorder = null; recordingIndex.value = null;
    window.$message.error(e?.message || '无法使用麦克风，请检查浏览器权限');
  }
}
function stopRecording() { if (recorder?.state === 'recording') recorder.stop(); }
function discardRecording() { discardCurrentRecording = true; stopRecording(); recordingStream?.getTracks().forEach(track => track.stop()); }
onUnmounted(() => { discardRecording(); audioItems.value.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); }); });

// 初始化音频列表
watch(
  () => props.formData.sonAssets,
  (newSonAssets) => {
    if (newSonAssets && newSonAssets.length > 0) {
      audioItems.value = newSonAssets.map((asset) => ({
        id: asset.id,
        src: asset.src,
        file: null,
        text: asset.prompt,
        name: asset.name || "",
        describe: asset.describe || "",
      }));
    } else {
      audioItems.value = [{ file: null, text: "", name: "", describe: "" }];
    }
  },
  { immediate: true },
);

function addAudioItem() {
  audioItems.value.push({ file: null, text: "", name: "", describe: "" });
}

function removeAudioItem(index: number) {
  if (recordingIndex.value !== null) { window.$message.warning('请先停止录音'); return; }
  if (audioItems.value[index]?.previewUrl) URL.revokeObjectURL(audioItems.value[index].previewUrl!);
  audioItems.value.splice(index, 1);
  if (audioItems.value.length === 0) {
    audioItems.value.push({ file: null, text: "", name: "", describe: "" });
  }
}

function triggerFileInput(index: number) {
  fileInputRefs.value[index]?.click();
}

function handleFileChange(e: Event, index: number) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    if (audioItems.value[index].previewUrl) URL.revokeObjectURL(audioItems.value[index].previewUrl!);
    audioItems.value[index].previewUrl = URL.createObjectURL(file);
    audioItems.value[index].file = file;
    audioItems.value[index].src = undefined;
    if (!audioItems.value[index].name) {
      audioItems.value[index].name = file.name;
    }
  }
  input.value = "";
}

function handleDrop(e: DragEvent, index: number) {
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith("audio/")) {
    if (audioItems.value[index].previewUrl) URL.revokeObjectURL(audioItems.value[index].previewUrl!);
    audioItems.value[index].previewUrl = URL.createObjectURL(file);
    audioItems.value[index].file = file;
    if (!audioItems.value[index].name) {
      audioItems.value[index].name = file.name;
    }
  } else if (file) {
    window.$message.warning($t("workbench.assets.add.pleaseUploadAudio"));
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function onConfirm() {
  if (recordingIndex.value !== null) { window.$message.warning('请先停止录音，再试听并保存'); return; }
  formRef.value?.validate().then(async (result: any) => {
    if (result == true) {
      const assetsItem = (
        await Promise.all(
          audioItems.value.map(async (item) => {
            if (item.id != null && item.src) {
              return {
                id: item.id,
                src: item.src,
                prompt: item.text || "",
                name: item.name || item.src.split("/").pop() || "",
                describe: item.describe || "",
              };
            }
            if (item.file) {
              return {
                base64: await fileToBase64(item.file),
                prompt: item.text || "",
                name: item.name || item.file.name,
                describe: item.describe || "",
              };
            }
            return null;
          }),
        )
      ).filter(
        (
          item,
        ): item is
          | { id: number; src: string; prompt: string; name: string; describe: string }
          | { base64: string; prompt: string; name: string; describe: string } => !!item,
      );

      const payload = {
        name: props.formData.name,
        describe: props.formData.sex + "|" + props.formData.describe,
        projectId: project.value?.id ?? 0,
        assetsItem,
        scriptId: props.scriptId ?? undefined,
      };
      console.log(props.formData.id);
      if (props.formData.id) {
        await axios
          .post(`/assets/updateAudioAssets`, {
            id: props.formData.id,
            ...payload,
          })
          .then(() => {
            window.$message.success($t("workbench.assets.add.updateSuccess"));
            emit("getFilteredData");
            addAssetsShow.value = false;
          });
      } else {
        await axios.post(`/assets/addAudioAssets`, payload).then(() => {
          window.$message.success($t("workbench.assets.add.addSuccess"));
          emit("getFilteredData");
          addAssetsShow.value = false;
        });
      }
    }
  });
}
</script>

<style lang="scss" scoped>
.modalHeader {
  background: var(--td-bg-color-container);
  width: 100%;

  :deep(.ant-typography) {
    color: var(--td-text-color-primary);
    margin: 0;
  }

  :deep(.ant-btn-text) {
    color: var(--td-brand-color);

    &:hover {
      background: var(--td-bg-color-component-hover);
      color: var(--td-brand-color-hover);
    }
  }
}

.data {
  width: 100%;
}
.recordRow { display:flex; align-items:center; gap:10px; color:#8e8278; font-size:12px; }.audioPreview { width:100%; height:36px; }

.audio-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;

  .audio-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--td-border-level-1-color);
    border-radius: 6px;
    background: var(--td-bg-color-secondarycontainer);

    .audio-upload-row {
      display: flex;
      align-items: center;
      gap: 8px;

      .audio-file-area {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border: 1px dashed var(--td-component-border);
        border-radius: 4px;
        cursor: pointer;
        min-height: 34px;
        transition: border-color 0.2s;

        &:hover {
          border-color: var(--td-brand-color);
          background: var(--td-bg-color-secondarycontainer-hover);
        }

        .audio-filename {
          font-size: 13px;
          color: var(--td-text-color-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 200px;
          flex: 1;

          &--existing {
            color: var(--td-success-color);
          }
        }

        .audio-upload-hint {
          font-size: 12px;
          color: var(--td-text-color-placeholder);
        }
      }
    }

    .audio-text-input {
      width: 100%;
    }
  }
}
</style>
