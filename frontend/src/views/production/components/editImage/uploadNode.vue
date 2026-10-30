<template>
  <div class="uploadNode">
    <Handle type="source" :position="Position.Right" style="z-index: 999999" />
    <div class="data">
      <div class="title ac">
        <span class="nodeGlyph">▧</span>
        <strong>参考图片</strong><small>连接到画面生成</small>
      </div>
      <div class="imageBox">
        <t-image
          class="image"
          :src="currentImageUrl"
          fit="contain"
          :style="{
            width: '100%',
            height: '100%',
            borderRadius: '10px',
          }">
          <template #overlayContent>
            <div class="imageToolsWrap">
              <ImageTools :src="currentImageUrl" position="br" />
            </div>
          </template>
        </t-image>
        <t-dropdown :options="options" @click="clickHandler">
          <div class="upload ac">
            <i-upload theme="outline" size="14" />
            <span style="margin-left: 5px">更换参考</span>
          </div>
          <template #content>
            <div class="fc ac" style="gap: 6px">
              <t-button variant="outline" @click="uploadFn">资产图片</t-button>
              <t-button variant="outline" @click="getStoryboardImage">分镜图片</t-button>
            </div>
          </template>
        </t-dropdown>
        <button type="button" class="keepBottomLeftBtn" v-if="currentImageUrl" @click="handleKeep">采用这张</button>
        <t-tooltip theme="primary" :content="$t('workbench.production.editImage.deleteNode')">
          <div class="remove ac" @click="removeFn">
            <i-delete theme="outline" size="15" />
          </div>
        </t-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position, useVueFlow } from "@vue-flow/core";
import { onBeforeUnmount, ref, watch } from "vue";
import openAssetsSelector from "@/utils/assetsCheck";
import type { Storyboard } from "../../utils/flowBuilder";
import type { DropdownOption } from "tdesign-vue-next/es/dropdown";
const props = defineProps<{
  id: string;
  data: {
    image?: string;
  };
}>();
const openStoryboardCheck = inject<() => Promise<Storyboard[]>>("openStoryboardCheck")!;

const { updateNodeData, removeNodes } = useVueFlow("editImage");
const currentImageUrl = ref(props.data?.image || "");
const currentObjectUrl = ref<string | null>(null);

const options = [
  { content: $t("workbench.production.editImage.uploadImage"), value: 1 },
  { content: $t("workbench.production.editImage.uploadStoryboardImage"), value: 2 },
];

watch(
  () => props.data?.image,
  (newUrl) => {
    currentImageUrl.value = newUrl || "";
  },
);

onBeforeUnmount(() => {
  if (currentObjectUrl.value) {
    URL.revokeObjectURL(currentObjectUrl.value);
  }
});

function removeFn() {
  removeNodes(props.id);
}
const emit = defineEmits(["upload", "keep"]);

function clickHandler(data: DropdownOption) {
  if (data.value == 1) {
    uploadFn();
  } else if (data.value == 2) {
    getStoryboardImage();
  }
}
function handleKeep() {
  if (!currentImageUrl.value) return window.$message.error($t("workbench.production.editImage.noImage"));
  emit("keep", currentImageUrl.value);
}
async function uploadFn() {
  const selectedAssets = await openAssetsSelector({
    multiple: false,
    title: $t("workbench.production.editImage.selectImage"),
  });
  if (selectedAssets.length > 0) {
    const filePath = selectedAssets[0].src!;
    currentImageUrl.value = filePath;
    updateNodeData(props.id, { image: filePath });
    emit("upload");
  }
}
async function getStoryboardImage() {
  const rows = await openStoryboardCheck();
  if (rows.length > 0) {
    const filePath = rows[0].src!;
    currentImageUrl.value = filePath;
    updateNodeData(props.id, { image: filePath });
    emit("upload");
  }
}
</script>

<style lang="scss" scoped>
.uploadNode {
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
    }
    .imageBox {
      border: 1px solid var(--td-border-level-1-color);
      height: 320px;
      width: 100%;
      position: relative;
      border-radius: 10px;
      .keepBottomLeftBtn {
        position: absolute;
        bottom: 10px;
        left: 10px;
        z-index: 9999;
        background-color: rgba(0, 0, 0, 0.5);
      }
      .image {
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

      .upload {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 9999;
        padding: 5px 10px;
        border-radius: 10px;
        background-color: rgba(0, 0, 0, 0.5);
      }

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
    }
  }
}
</style>
<style lang="scss" scoped>
.uploadNode .data { padding:10px; box-sizing:border-box; border:1px solid #e8e2dc; border-radius:15px; background:#fff; box-shadow:0 8px 24px rgba(45,34,26,.08); }
.uploadNode .data .title { height:32px; padding:0 2px 8px; gap:8px; }
.nodeGlyph { display:grid; place-items:center; width:25px; height:25px; border-radius:8px; background:#f4eee9; color:#b65a35; font-size:14px; }
.uploadNode .title strong { color:#3b3430; font-size:12px; }.uploadNode .title small { margin-left:auto; color:#a99d93; font-size:10px; }
.uploadNode .data .imageBox { overflow:hidden; height:230px; border:0; border-radius:10px; background:#f5f2ef; }
.uploadNode .data .imageBox .upload,.uploadNode .data .imageBox .remove { color:#5c514a; background:#fffffff0; box-shadow:0 2px 8px #32211514; border-radius:8px; cursor:pointer; }
.uploadNode .data .imageBox .remove:hover { background:#fff1ee; color:#bd4e3a; }
.uploadNode .data .imageBox .keepBottomLeftBtn { padding:6px 9px; border:0; border-radius:7px; background:#ffffffeb; color:#a04a2d; font-size:10px; cursor:pointer; }
</style>
