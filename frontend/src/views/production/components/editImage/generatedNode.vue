<template>
  <div class="generatedNode">
    <Handle type="target" :position="Position.Left" />
    <div class="data" @click="selectedFn">
      <div class="title ac">
        <span class="nodeGlyph">✦</span>
        <span class="titleText">画面生成</span><small>{{ selected ? '点击收起设置' : '点击展开设置' }}</small>
      </div>
      <div class="image">
        <div v-if="generating" class="imageLoading">
          <div class="loadingSpinner"></div>
          <span class="loadingText">{{ $t("workbench.production.editImage.generating") }}</span>
        </div>
        <div v-else class="imageWrapper">
          <t-image class="image" :src="data.generatedImage" fit="contain" :class="['nodeImage', { selected }]">
            <template #overlayContent>
              <div class="imageToolsWrap">
                <ImageTools :src="data.generatedImage ?? ''" position="br" />
              </div>
            </template>
          </t-image>
        </div>
        <t-dropdown :options="options" @click="clickHandler">
          <div class="upload ac" @click.stop>
            <i-upload theme="outline" size="14" />
            <span style="margin-left: 5px">更换图片</span>
          </div>
        </t-dropdown>
        <t-tooltip theme="primary" :content="$t('workbench.production.editImage.deleteNode')">
          <div class="remove ac" @click.stop="removeNodes(props.id)">
            <i-delete theme="outline" size="15" />
          </div>
        </t-tooltip>
      </div>
    </div>
    <div v-show="selected" class="parameter" @wheel.stop @mousedown.stop>
      <div class="parameterHeading"><strong>画面描述</strong><span>连入的图片会作为生成参考</span></div>
      <div class="imageRefs f w">
        <div v-for="(item, index) in data.references" :key="index" class="refThumb">
          <t-image :src="item.image" fit="cover" class="refImg" />
        </div>
      </div>
      <div class="text w">
        <PromptEditor v-model="data.prompt" :references="references" :placeholder="$t('workbench.production.editImage.promptPlaceholder')" />
      </div>
      <div class="operate ac jb">
        <div class="ac">
          <modelSelect v-model="data.model" type="image" size="small" compact :capability="data.references.length ? 'reference' : ''" :reference-count="data.references.length" />
          <t-select v-model="data.ratio" class="paramSelect ml-5" size="small" :placeholder="$t('workbench.production.editImage.ratio')">
            <t-option value="16:9" label="16:9" />
            <t-option value="9:16" label="9:16" />
            <t-option value="1:1" label="1:1" />
          </t-select>
          <t-select v-model="data.quality" class="paramSelect ml-5" size="small" :placeholder="$t('workbench.production.editImage.quality')">
            <t-option value="1K" label="1K" />
            <t-option value="2K" label="2K" />
            <t-option value="4K" label="4K" />
          </t-select>
        </div>

        <div class="f" style="gap: 5px; margin-left: 5px">
          <t-button theme="primary" size="small" class="generateBtn" :disabled="generating" :loading="generating" @click="handleGenerate">生成</t-button>
          <t-button variant="outline" size="small" class="keepBtn" :disabled="generating || !data.generatedImage" @click="handleKeep">采用画面</t-button>
        </div>
      </div>
    </div>
    <Handle type="source" :position="Position.Right" style="z-index: 999999" />
  </div>
</template>

<script setup lang="ts">
import { Handle, useVueFlow, Position } from "@vue-flow/core";
import type { Ref } from "vue";
import modelSelect from "@/components/modelSelect.vue";
import PromptEditor from "@/components/promptEditor.vue";
import axios from "@/utils/axios";
import { type GeneratedNodeData } from "../../utils/editImageType";
import type { DropdownOption } from "tdesign-vue-next/es/dropdown";
import type { Storyboard } from "../../utils/flowBuilder";
import openAssetsSelector from "@/utils/assetsCheck";
import { useFileDialog } from "@vueuse/core";
import projectStore from "@/stores/project";
import { accountBoundary } from "@/utils/accountBoundary";
const { project } = storeToRefs(projectStore());
const openStoryboardCheck = inject<() => Promise<Storyboard[]>>("openStoryboardCheck")!;
const { open, onChange, onCancel } = useFileDialog({ multiple: false, reset: true, accept: ".png,.jpg,.jpeg" });

const selected = ref(true);
const generating = ref(false);
const episodesId = inject<Ref<number>>("episodesId")!;
const owner = accountBoundary.capture();
const ownerEpisode = episodesId.value;
function assertNodeContext() {
  accountBoundary.assert(owner);
  if (Number(project.value?.id) !== props.projectId || episodesId.value !== ownerEpisode) throw new Error("项目或分集已切换，请重新打开画布");
}

const emit = defineEmits(["keep", "image-change"]);
const { removeNodes } = useVueFlow("editImage");

const options = [
  { content: $t("workbench.production.editImage.uploadImage"), value: 1 },
  { content: $t("workbench.production.editImage.uploadStoryboardImage"), value: 2 },
  { content: $t("workbench.production.generatedNode.localUpload"), value: 3 },
];

const references = computed(() => {
  return props.data.references.map((i) => ({ type: "image" as const, src: i.image })).filter(Boolean);
});

const props = defineProps<{
  id: string;
  data: GeneratedNodeData;
  projectId: number;
}>();

function selectedFn() {
  selected.value = !selected.value;
}
function clickHandler(data: DropdownOption) {
  if (data.value == 1) {
    uploadFn();
  } else if (data.value == 2) {
    getStoryboardImage();
  } else if (data.value == 3) {
    lensImage();
  }
}
async function lensImage() {
  const files = await new Promise<FileList | null>((resolve) => {
    open();
    onChange((f) => resolve(f));
    onCancel(() => resolve(null));
  });

  if (!files?.length) return;

  const file = files[0];
  //转成base64显示
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result as string;
    try {
      const { data } = await axios.post("/production/editImage/uploadImage", {
        base64Data: base64,
        projectId: props.projectId,
        scriptId: episodesId.value,
      });
      props.data.generatedImage = data;
    } catch (e) {
      return window.$message.error((e as any)?.message || $t("workbench.production.editImage.uploadFailed"));
    }
  };
  reader.readAsDataURL(file);
  // mockStoryboard.value.id = -1; // 新上传的图片没有id，使用-1标识，后端根据filePath处理这种情况
}
async function uploadFn() {
  const selectedAssets = await openAssetsSelector({
    multiple: false,
    title: $t("workbench.production.editImage.selectImage"),
  });
  if (selectedAssets.length > 0) {
    const filePath = selectedAssets[0].src!;
    props.data.generatedImage = filePath;
  }
}
async function getStoryboardImage() {
  const rows = await openStoryboardCheck();
  if (rows.length > 0) {
    const filePath = rows[0].src!;
    props.data.generatedImage = filePath;
  }
}
// 生成
async function handleGenerate() {
  try { assertNodeContext(); } catch (e) { return window.$message.error((e as Error).message); }
  if (!props.data.model) return window.$message.error($t("workbench.production.editImage.selectModel"));
  if (!props.data.quality) return window.$message.error($t("workbench.production.editImage.selectQuality"));
  if (!props.data.ratio) return window.$message.error($t("workbench.production.editImage.selectRatio"));
  generating.value = true;
  try {
    const { data } = await axios.post("/production/editImage/generateFlowImage", {
      references: props.data.references.map((i) => i.image).filter(Boolean),
      model: props.data.model,
      quality: props.data.quality,
      ratio: props.data.ratio,
      prompt: props.data.prompt,
      projectId: props.projectId,
    });
    assertNodeContext();
    props.data.generatedImage = data.url;
    emit("image-change");
  } catch (e) {
    return window.$message.error((e as any)?.message || $t("workbench.production.editImage.generateFailed"));
  } finally {
    generating.value = false;
  }
}

function handleKeep() {
  if (!props.data.generatedImage) return window.$message.error($t("workbench.production.editImage.generateFirst"));
  emit("keep", props.data.generatedImage);
}
onMounted(() => {
  if (!props.data.model) props.data.model = project.value?.imageModel ?? "";
  if (!props.data.quality) props.data.quality = project.value?.imageQuality ?? "";
  if (!props.data.ratio) props.data.ratio = project.value?.videoRatio ?? "16:9";
});
</script>

<style lang="scss" scoped>
.generatedNode {
  position: relative;
  width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;

  .data {
    width: 100%;
    cursor: pointer;

    .title {
      height: 30px;
      padding: 5px;

      .titleText {
        margin-left: 5px;
        color: var(--td-text-color-secondary);
      }
    }

    .image {
      height: 320px;
      width: 100%;
      position: relative;
      .remove {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 9999;
        padding: 5px;
        border-radius: 10px;
        background-color: rgba(220, 50, 50, 0.7);
        cursor: pointer;
        &:hover {
          background-color: rgba(220, 50, 50, 1);
        }
      }
      .upload {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 9999;
        padding: 5px 10px;
        border-radius: 10px;
        background-color: rgba(0, 0, 0, 0.5);
      }
      .imageLoading {
        width: 100%;
        height: 100%;
        background-color: var(--td-bg-color-component);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;

        .loadingSpinner {
          width: 36px;
          height: 36px;
          border: 3px solid #d0d0d0;
          border-top-color: #5bccb3;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .loadingText {
          font-size: 14px;
          color: var(--td-text-color-secondary);
        }
      }

      .imageWrapper {
        position: relative;
        width: 100%;
        height: 100%;

        :deep(.nodeImage) {
          width: 100%;
          height: 100%;
          border-radius: 10px;
          border: 3px solid transparent;
          box-sizing: border-box;

          &.selected {
            border-color: var(--td-text-color-primary);
          }
        }
      }
      .imageToolsWrap {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      &:hover {
        .imageToolsWrap {
          opacity: 1;
          pointer-events: auto;
        }
      }
    }
  }

  .parameter {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 10px;
    width: 500px;
    border: 1px solid var(--td-border-level-2-color);
    background-color: var(--td-bg-color-container);
    border-radius: 10px;
    z-index: 9999;

    .imageRefs {
      overflow: auto;
      padding: 10px;
      .refThumb {
        margin-left: 8px;
        .refImg {
          width: 45px;
          height: 45px;
          border-radius: 10px;
        }
      }
    }

    .text {
      height: 200px;
      min-height: 100px;
      max-height: 500px;
      display: flex;
      position: relative;
      overflow: auto;
      resize: vertical;
    }

    .operate {
      padding: 10px;
      height: 50px;

      .paramSelect {
        min-width: 100px;
        width: 100px;
      }

      .ml-5 {
        margin-left: 5px;
      }

      .generateBtn {
        margin-left: auto;
        --td-brand-color: #5bccb3;
        --td-brand-color-hover: #4ab8a0;
      }
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
<style lang="scss" scoped>
.generatedNode .data { padding:10px; box-sizing:border-box; border:1px solid #e8ded7; border-radius:15px; background:#fff; box-shadow:0 8px 24px rgba(45,34,26,.09); }
.generatedNode .data .title { height:32px; padding:0 2px 8px; gap:8px; }.generatedNode .data .title .titleText { margin:0; color:#3b3430; font-size:12px; font-weight:650; }.generatedNode .data .title small { margin-left:auto; color:#aa9d92; font-size:10px; }
.nodeGlyph { display:grid; place-items:center; width:25px; height:25px; border-radius:8px; background:#fff0e6; color:#d45e30; font-size:14px; }
.generatedNode .data .image { height:230px; overflow:hidden; border-radius:10px; background:#f5f2ef; }
.generatedNode .data .image .imageWrapper :deep(.nodeImage) { border:1px solid transparent; border-radius:9px; }.generatedNode .data .image .imageWrapper :deep(.nodeImage.selected) { border-color:#d9936f; }
.generatedNode .data .image .upload,.generatedNode .data .image .remove { color:#5c514a; background:#fffffff0; border-radius:8px; box-shadow:0 2px 8px #32211514; cursor:pointer; }.generatedNode .data .image .remove:hover { background:#fff1ee; color:#bd4e3a; }
.generatedNode .parameter { width:500px; padding:12px; box-sizing:border-box; border:1px solid #e6ded8; border-radius:15px; background:#fffffffa; box-shadow:0 14px 40px #34291d1a; }
.parameterHeading { display:flex; align-items:baseline; justify-content:space-between; color:#423a35; font-size:12px; }.parameterHeading span { color:#aa9c92; font-size:10px; }
.generatedNode .parameter .imageRefs { gap:6px; padding:10px 0 4px; }.generatedNode .parameter .imageRefs .refThumb { margin-left:0; }.generatedNode .parameter .imageRefs .refThumb .refImg { width:40px; height:40px; border:1px solid #eee7e1; border-radius:8px; }
.generatedNode .parameter .text { height:150px; max-height:300px; margin-top:5px; border:1px solid #f0e9e4; border-radius:10px; background:#fbfaf9; }
.generatedNode .parameter .operate { gap:8px; height:auto; padding:10px 0 0; }.generatedNode .parameter .operate > div:first-child { min-width:0; flex:1; }.generatedNode .parameter .operate .modelSelectField { min-width:120px; max-width:180px; }.generatedNode .parameter .operate .paramSelect { min-width:74px; width:74px; }
.generatedNode .parameter .operate .generateBtn { --td-brand-color:#c9532d; --td-brand-color-hover:#a94322; }
</style>
