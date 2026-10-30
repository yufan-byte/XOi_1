<template>
  <div class="imageUploadBox ac">
    <!-- 单图模式 -->
    <template v-if="mode == 'singleImage' || mode === 'multiReference' || Array.isArray(parseMode(mode as string))">
      <div class="uploadBtn c fc" v-for="(item, index) in mode == 'singleImage' ? imageList.slice(0, 1) : imageList" :key="index">
        <template v-if="item.src">
          <t-image v-if="item.fileType == 'image'" :src="item.src" fit="contain" class="uploadPreview">
            <template #overlayContent>
              <div class="imageToolsWrap">
                <ImageTools :src="item.src!" position="br" />
              </div>
            </template>
          </t-image>
          <t-tooltip theme="primary" v-else-if="item.fileType == 'audio'" :content="item?.prompt || ''">
            <div class="mediaPreview audioPreview">
              <i-acoustic size="20" />
              <span class="mediaLabel">音频</span>
            </div>
          </t-tooltip>
          <div v-else-if="item.fileType == 'video'" class="mediaPreview videoPreview">
            <video class="uploadPreview" :src="item.src" preload="metadata" muted />
          </div>
        </template>
        <template v-else>
          <t-tooltip theme="primary" :content="item?.prompt ? '音频内容：' + item.prompt : ''">
            <span style="font-size: 20px">文</span>
          </t-tooltip>
        </template>
        <div class="imageTitleWrap" v-if="item.sources == 'storyboard' && item.index != null">
          {{ `P${item.index + 1}` }}
        </div>
        <div class="clearBtn" @click="splitImage(index)">
          <i-close size="12" />
        </div>
        <div class="source">
          <t-tag size="small">
            {{ item.sources == "storyboard" ? $t("workbench.generate.storyboard") : $t("workbench.generate.assets") }}
          </t-tag>
        </div>
      </div>
    </template>
    <template v-else-if="mode == 'endFrameOptional' || mode == 'startFrameOptional' || mode == 'startEndRequired'">
      <div class="uploadBtn c fc" v-for="(item, index) in buildLabel" :key="item.value" @click="handleMixedAdd(item.value as 'start' | 'end')">
        <div v-if="!isEmptySlot(imageList?.[index])" style="flex: 1; width: 100%" class="ac">
          <template v-if="imageList?.[index]?.src">
            <t-image v-if="imageList?.[index]?.fileType == 'image'" :src="imageList?.[index]!.src" fit="contain" class="uploadPreview">
              <template #overlayContent>
                <div class="imageToolsWrap">
                  <ImageTools :src="imageList?.[index]!.src" position="br" />
                </div>
              </template>
            </t-image>
            <div v-else-if="imageList?.[index]?.fileType == 'audio'" class="mediaPreview audioPreview">
              <i-acoustic size="20" />
              <span class="mediaLabel">音频</span>
            </div>
            <div v-else-if="imageList?.[index]?.fileType == 'video'" class="mediaPreview videoPreview">
              <video class="uploadPreview" :src="imageList?.[index]!.src" preload="metadata" muted />
            </div>
          </template>
          <template v-else>
            <t-tooltip theme="primary" :content="imageList?.[index]?.prompt || ''">
              <span style="font-size: 20px">文</span>
            </t-tooltip>
          </template>
          <div class="imageTitleWrap" v-if="imageList?.[index]?.sources == 'storyboard' && imageList?.[index]?.index != null">
            {{ `P${imageList[index]?.index + 1}` }}
          </div>
          <div class="clearBtn" @click.stop="clearImage(index)">
            <i-close size="12" />
          </div>
          <div class="source">
            <t-tag size="small">
              {{ imageList?.[index]?.sources == "storyboard" ? $t("workbench.generate.storyboard") : $t("workbench.generate.assets") }}
            </t-tag>
          </div>
        </div>
        <template v-else>
          <i-plus size="24"></i-plus>
          {{ item.label }}
        </template>
      </div>
    </template>
    <div class="uploadBtn c fc" v-if="isShowAddImage" @click="handleMixedAdd()">
      <i-plus size="24"></i-plus>
      {{ mode === "singleImage" && imageList.length ? "更换参考" : $t("workbench.generate.addReference") }}
    </div>

    <t-dialog v-model:visible="sourceOpen" header="选择本次参考来源" :footer="false" width="460px" attach="body" :z-index="3200">
      <div class="referenceSources">
        <button
          type="button"
          @click="
            sourceOpen = false;
            storyboardDialogVisible = true;
          ">
          <i-pic size="22" />
          <strong>从本集分镜选择</strong>
          <span>使用已经生成的分镜画面</span>
        </button>
        <button type="button" @click="chooseAssets">
          <i-folder-open size="22" />
          <strong>从素材库选择</strong>
          <span>角色、场景和已上传的素材</span>
        </button>
      </div>
    </t-dialog>
    <!-- 分镜选择弹窗 -->
    <t-dialog
      v-model:visible="storyboardDialogVisible"
      :header="$t('workbench.generate.selectStoryboard')"
      :footer="false"
      width="800px"
      placement="center"
      :z-index="3200">
      <div class="storyboardGrid">
        <div class="storyboardItem" v-for="sb in storyboardList" :key="sb.id" @click="pickStoryboard(sb)">
          <div class="imageTitleWrap" v-if="sb?.index != null">
            {{ `P${sb?.index + 1}` }}
          </div>
          <img v-if="sb.src" :src="thumbUrl(sb.src, 320)" loading="lazy" decoding="async" />
          <div v-else class="textBox ac jc">
            <t-tooltip theme="primary" :content="sb?.videoDesc || ''">
              <span style="font-size: 20px">{{ `分镜 ${sb?.index + 1 || ""}` }}</span>
            </t-tooltip>
          </div>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import "@/views/production/components/workbench/type/type";
import assetsCheck, { type AssetType, type ClipMediaType } from "@/utils/assetsCheck";
import type { StudioReferenceAllowance } from "@/utils/studioVideoInput";
import axios from "@/utils/axios";
import { thumbUrl } from "@/utils/mediaUrl";

const props = defineProps<{
  mode: VideoMode;
  storyboardList: StoryboardItem[];
  allowance: StudioReferenceAllowance;
}>();
const imageList = defineModel<UploadItem[]>({
  default: () => [],
});
//分镜选择弹窗
const storyboardDialogVisible = ref(false);
const sourceOpen = ref(false);
let alive = true;
onBeforeUnmount(() => {
  alive = false;
});

/** 空占位项，用于首尾帧模式中未设置的槽位 */
const EMPTY_SLOT: UploadItem = { fileType: "image", id: null, src: "" } as any;
function isEmptySlot(item: UploadItem | undefined): boolean {
  return !item || !item.id;
}

const buildLabel = computed(() => {
  const startOptional = props.mode === "startFrameOptional";
  const endOptional = props.mode === "endFrameOptional";
  return [
    { label: startOptional ? "首帧(可选)" : "首帧", value: "start" },
    { label: endOptional ? "尾帧(可选)" : "尾帧", value: "end" },
  ];
});

/** 确保 imageList 始终有两个槽位（首帧 index=0，尾帧 index=1） */
function ensureFrameSlots(): UploadItem[] {
  const list = [...imageList.value];
  while (list.length < 2) list.push({ ...EMPTY_SLOT });
  return list;
}

/** 将 item 设置到首帧或尾帧槽位 */
function setFrameSlot(slot: "start" | "end", item: UploadItem) {
  const list = ensureFrameSlots();
  list[slot === "start" ? 0 : 1] = item;
  imageList.value = list;
}

/** 解析模式值（字符串或 JSON 数组） */
function parseMode(value: string): VideoMode | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as ReferenceType[];
  } catch {
    return value as Exclude<VideoMode, ReferenceType[]>;
  }
  return value as Exclude<VideoMode, ReferenceType[]>;
}

//判断是否显示添加参考图
const isShowAddImage = computed(() => {
  const mode = props.mode;
  if (mode == "singleImage") return true;
  if (mode == "endFrameOptional" || mode == "startEndRequired" || mode == "startFrameOptional") {
    return false;
  }
  if (mode == "text") return false;
  //多参模式默认 true
  return true;
});

/** 根据文件扩展名推断媒体类型 */
function getFileTypeByExt(src: string | undefined): "image" | "video" | "audio" {
  const ext = src?.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
  return "image";
}
/** 根据混合模式推导当前允许的 clip 媒体类型 */
const mixedClipMediaTypes = computed<ClipMediaType[]>(() => {
  return (["image", "video", "audio"] as ClipMediaType[]).filter((kind) => props.allowance[kind] > 0);
});
function appendWithinAllowance(base: UploadItem[], additions: UploadItem[]) {
  const result = [...base];
  const count = { image: 0, video: 0, audio: 0 };
  for (const item of result) count[item.fileType === "video" ? "video" : item.fileType === "audio" ? "audio" : "image"]++;
  let skipped = 0;
  for (const item of additions) {
    if (result.some((old) => old.id === item.id && old.sources === item.sources)) continue;
    const kind = item.fileType === "video" ? "video" : item.fileType === "audio" ? "audio" : "image";
    if (count[kind] >= props.allowance[kind] || result.length >= props.allowance.total) {
      skipped++;
      continue;
    }
    result.push(item);
    count[kind]++;
  }
  if (skipped) window.$message.warning(`当前模型的${skipped}项素材已达上限，未加入本次参考`);
  return result;
}
let currentSlot: "start" | "end" | "" = "";
function handleMixedAdd(slot: "start" | "end" | "" = "") {
  if (!props.mode) return;
  currentSlot = slot;
  sourceOpen.value = true;
}
async function chooseAssets() {
  sourceOpen.value = false;
  const slot = currentSlot;
  const multiple = props.mode === "multiReference" || Array.isArray(parseMode(props.mode as string));
  const assets = await assetsCheck({
    types: multiple
      ? (["role", "tool", "scene", "clip", ...(props.allowance.audio ? ["audio"] : [])] as AssetType[])
      : ["role", "tool", "scene", "clip"],
    clipMediaTypes: multiple ? mixedClipMediaTypes.value : ["image"],
    multiple,
    zIndex: 3200,
  });

  if (!alive || !assets.length) return;

  const newItems: UploadItem[] = assets.flatMap((asset) => {
    if (asset.type === "audio" && asset?.sonAssets?.length) {
      return asset.sonAssets.map((sub: any) => {
        const fileType = getFileTypeByExt(sub.src);
        return {
          fileType,
          sources: "assets",
          src: sub.src,
          id: sub.id,
          prompt: sub.prompt,
        } as UploadItem;
      });
    }
    const fileType = getFileTypeByExt(asset.src);
    return [
      {
        fileType,
        sources: "assets",
        src: asset.src,
        id: asset.id,
        prompt: asset.prompt,
      } as UploadItem,
    ];
  });
  if (slot === "start" || slot === "end") {
    setFrameSlot(slot, newItems[0]);
  } else if (props.mode === "singleImage") {
    imageList.value = [newItems[0]];
  } else {
    const assetsNotAudioIds = newItems.filter((i) => i.fileType !== "audio");
    const { data } = await axios.post("/production/workbench/getAudioBindAssetsList", {
      assetsIds: assetsNotAudioIds.map((i) => i.id),
    });
    imageList.value = appendWithinAllowance(imageList.value, [...newItems, ...(data ?? [])]);
  }
}

function clearImage(index: number) {
  const list = ensureFrameSlots();
  list[index] = { ...EMPTY_SLOT };
  imageList.value = list;
}
/** 分镜弹窗选中回调 */
function pickStoryboard(sb: StoryboardItem) {
  storyboardDialogVisible.value = false;
  const fileType = "image";
  const newItem = {
    fileType,
    sources: "storyboard",
    src: sb.src,
    id: sb.id,
    prompt: sb.videoDesc ?? undefined,
    index: sb.index,
  } as UploadItem;

  if (currentSlot === "start" || currentSlot === "end") {
    setFrameSlot(currentSlot, newItem);
  } else if (props.mode === "singleImage") {
    imageList.value = [newItem];
  } else {
    imageList.value = appendWithinAllowance(imageList.value, [newItem]);
  }
}
function splitImage(index: number) {
  const list = [...imageList.value];
  list.splice(index, 1);
  imageList.value = list;
}
</script>

<style lang="scss" scoped>
.referenceSources {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.referenceSources button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 18px;
  text-align: left;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 10px;
  cursor: pointer;
}
.referenceSources button:hover {
  border-color: #bd4c22;
}
.referenceSources strong {
  font-size: 13px;
}
.referenceSources span {
  font-size: 11px;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
}
.imageUploadBox {
  gap: 8px;
  overflow-x: auto;
  flex-wrap: nowrap;
  padding-bottom: 6px;
  &::-webkit-scrollbar {
    height: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #696969;
    border-radius: 4px;
  }
  &::-webkit-scrollbar-track {
    background-color: var(--td-bg-color-secondarycontainer);
    border-radius: 4px;
  }
  .imageTitleWrap {
    z-index: 999;
    position: absolute;
    left: 4px;
    top: 4px;
    padding: 0 5px;
    font-size: 11px;
    line-height: 18px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    border-radius: 4px;
    backdrop-filter: blur(4px);
    user-select: none;
    white-space: nowrap;
  }
  .uploadBtn {
    width: 80px;
    min-width: 80px;
    height: 80px;
    flex-shrink: 0;
    position: relative;
    border: 1px dashed var(--td-component-border);
    border-radius: 8px;
    &:hover {
      border-color: var(--td-text-color);
      cursor: pointer;
    }

    .uploadPreview {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
      position: relative;
      .imageToolsWrap {
        height: 100%;
        transform: scale(0.6);
        transform-origin: bottom right;
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
    .mediaPreview {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      gap: 4px;
      .mediaLabel {
        font-size: 11px;
        color: var(--td-text-color-secondary);
      }
      &.audioPreview {
        background: var(--td-bg-color-secondarycontainer);
        color: var(--td-brand-color);
      }
      &.videoPreview {
        background: #000;
        overflow: hidden;
      }
    }
    .clearBtn {
      z-index: 999999999999999;
      position: absolute;
      top: 2px;
      right: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      &:hover {
        background: rgba(0, 0, 0, 0.85);
      }
    }
    &:hover .clearBtn {
      display: flex;
    }
    .source {
      position: absolute;
      bottom: 2px;
      right: 2px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      &:hover {
        background: rgba(0, 0, 0, 0.85);
      }
    }
    &:hover .source {
      display: flex;
    }
  }
  .storyboardGrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    max-height: 60vh;
    overflow-y: auto;
    padding: 4px;
    .storyboardItem {
      cursor: pointer;
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid transparent;
      transition:
        border-color 0.2s,
        box-shadow 0.2s;
      &:hover {
        border-color: var(--td-brand-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      }
      img {
        width: 100%;
        aspect-ratio: 16/9;
        object-fit: cover;
        display: block;
      }
      .textBox {
        aspect-ratio: 16/9;
        width: 100%;
        text-align: center;
        border: 1px solid #ccc;
      }
    }
  }
}
</style>
