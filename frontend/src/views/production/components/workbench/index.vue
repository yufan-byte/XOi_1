<template>
  <t-dialog
    body="String"
    :header="false"
    :footer="false"
    :closeBtn="false"
    v-model:visible="visible"
    attach="body"
    placement="center"
    mode="full-screen"
    dialogClassName="noFooter"
    class="fullscreenDialog">
    <div class="closure">
      <i-close-small theme="outline" size="24" fill="#4a4a4a" @click="visible = false" />
    </div>
    <div class="workbenchIntro">
      <div class="introCopy">
        <div class="eyebrow">VIDEO WORKBENCH</div>
        <div class="workbenchTitle">从分镜到成片</div>
        <div class="workbenchHint">按顺序完成，结果会自动带入下一步。</div>
      </div>
      <div class="workflowSteps" aria-label="视频制作流程">
        <button v-for="step in workflowSteps" :key="step.id" type="button" class="workflowStep" :class="{ active: activeMenu === step.id }" @click="changeMenu(step.id)">
          <span class="stepIndex">{{ step.index }}</span>
          <strong>{{ step.label }}</strong>
          <span class="stepArrow" v-if="step.id !== 'editVideo'">›</span>
        </button>
      </div>
    </div>
    <div class="content">
      <preview v-if="activeMenu === 'preview'" @go-generate="changeMenu('generate')" />
      <generate v-if="activeMenu === 'generate'" @importVideo="handleBatchDownload" v-model="extractLines" />
      <editVideo
        v-if="activeMenu === 'editVideo'"
        :initial-tracks="mockTracks"
        :initial-video-items="initialVideoItems"
        :initial-media-items="mockMediaItems"
        :initial-audio-items="mockAudioItems"
        :initial-image-items="mockImageItems"
        :canvas-width="canvasWidth"
        :canvas-height="canvasHeight"
        ref="editVideoRef" />
    </div>
    <div v-if="importLoading" class="importLoadingMask">
      <div class="importLoadingContent">
        <t-loading size="large" :text="$t('workbench.production.wb.importingLoading')" />
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import axios from "@/utils/axios";
import preview from "./preview.vue";
import generate from "./generate/index.vue";
import editVideo from "./editVideo/index.vue";
import { generateId, type Track } from "vue-clip-track";
import type { MediaItem, AudioItem } from "./editVideo/utils/mediaData";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());

const visible = defineModel("visible", {
  type: Boolean,
  default: false,
});
const activeMenu = ref("preview");
const workflowSteps = [
  { id: "preview", index: "01", label: "分镜预览", description: "检查节奏与顺序" },
  { id: "generate", index: "02", label: "生成视频", description: "配置参考与提示词" },
  { id: "editVideo", index: "03", label: "剪辑成片", description: "时间线精剪与导出" },
];
function setActiveMenu(menu: string) {
  if (["preview", "generate", "editVideo"].includes(menu)) activeMenu.value = menu;
}
defineExpose({ setActiveMenu });

// 画布尺寸配置
const canvasWidth = ref(1920);
const canvasHeight = ref(1080);

onMounted(() => {
  const size = project.value?.videoRatio;
  if (size == "16:9") {
    canvasWidth.value = 1920;
    canvasHeight.value = 1080;
  } else if (size == "1:1") {
    canvasWidth.value = 1080;
    canvasHeight.value = 1080;
  } else if (size == "9:16") {
    canvasWidth.value = 1080;
    canvasHeight.value = 1920;
  }
});

// ============ 演示数据（可替换为在线资源地址） ============

/** 资源库 - 分镜视频 */
const initialVideoItems = ref<MediaItem[]>([]);

/** 资源库 - 视频素材 */
const mockMediaItems = ref<MediaItem[]>([]);

/** 资源库 - 音频素材 */
const mockAudioItems = ref<AudioItem[]>([]);

/** 资源库 - 图片素材 */
const mockImageItems = ref<MediaItem[]>([]);

const extractLines = ref(false);
const importLoading = ref(false);

onMounted(() => {
  editFootage();
});
type MediaType = "image" | "video" | "audio" | "unknown";
type ImportVideoItem = {
  trackId: number;
  videoId: number;
  src: string;
  duration: number;
};

function getMediaType(src?: string): MediaType {
  if (!src) return "unknown";
  const ext = src.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
  return "unknown";
}
//切换菜单
function changeMenu(type: string) {
  activeMenu.value = type;
  if (type == "editVideo") editFootage();
}
const episodesId = inject<Ref<number>>("episodesId")!;
//查询剪辑素材
function editFootage() {
  axios
    .post("/assets/getMaterialData", {
      projectId: project.value?.id,
      scriptId: episodesId.value ?? 0,
    })
    .then(({ data }) => {
      const videoList = data.data.filter((item: any) => getMediaType(item.filePath) === "video");
      const audioList = data.data.filter((item: any) => getMediaType(item.filePath) === "audio");
      const imageList = data.data.filter((item: any) => getMediaType(item.filePath) === "image");
      initialVideoItems.value = data.video.flatMap((item: any, index: number) => {
        if (Array.isArray(item.video)) {
          return item.video.map((subItem: any, subIndex: number) => ({
            id: `video-${subItem.id}`,
            type: "video",
            name: "#" + $t("workbench.production.wb.storyboardVideoName", { storyboard: index + 1, id: subIndex + 1 }),
            duration: subItem.duration || 0,
            icon: "🎬",
            color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            url: subItem.filePath,
            selected: item.videoId == subItem.id ? true : false,
          }));
        }
      });
      mockMediaItems.value = videoList.map((item: any) => ({
        id: `video-${item.id}`,
        type: "video",
        name: item.name,
        duration: item.duration || 0,
        icon: "🎥",
        color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        url: item.filePath,
        loading: true,
      }));
      mockAudioItems.value = audioList.map((item: any) => ({
        id: `audio-${item.id}`,
        type: "audio",
        name: item.name,
        duration: item.duration || 0,
        url: item.filePath,
        loading: true,
      }));
      mockImageItems.value = imageList.map((item: any) => ({
        id: `image-${item.id}`,
        type: "image",
        name: item.name,
        duration: item.duration || 5,
        icon: "🖼️",
        color: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
        url: item.filePath,
        loading: true,
      }));
    });
}

function createDemoTracks(): Track[] {
  const createTrack = (type: Track["type"], name: string, order: number, isMain: boolean = false): Track => ({
    id: generateId("track-"),
    type,
    name,
    visible: true,
    locked: false,
    clips: [],
    order,
    ...(isMain && { isMain }),
  });
  return [
    createTrack("video", "主轨道", 0, true),
    createTrack("audio", "音频", 2),
    createTrack("subtitle", "字幕", 3),
    createTrack("filter", "滤镜", 4),
  ];
}

const mockTracks = createDemoTracks();

//导入到剪辑台
function handleBatchDownload(value: ImportVideoItem[]) {
  if (!value.length) return;
  const imported = value.map((item, index) => ({
    id: `selected-${item.videoId}`,
    type: "video" as const,
    name: `镜头 ${index + 1}`,
    duration: Math.max(item.duration || 3, 0.5),
    icon: "🎬",
    color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    url: item.src,
    selected: true,
  }));
  initialVideoItems.value = imported;
  activeMenu.value = "editVideo";
  window.$message.success(`已导入 ${imported.length} 个镜头到剪辑台`);
}
</script>

<style lang="scss" scoped>
:deep(.t-dialog__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}
.fullscreenDialog {
  .importLoadingMask {
    position: absolute;
    inset: 0;
    background: var(--td-mask-active);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    animation: fadeIn 200ms ease-out;
    .importLoadingContent {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      animation: popIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
  }
  .closure {
    position: absolute;
    top: var(--td-comp-paddingTB-xl);
    right: var(--td-comp-paddingLR-xxl);
    z-index: 9999;
    cursor: pointer;
    margin-top: 20px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 150ms ease, transform 100ms ease;
    &:hover {
      background-color: var(--td-bg-color-container-hover);
    }
    &:active {
      transform: scale(0.9);
    }
  }
  .topMenu {
    gap: 8px;
    padding-bottom: 16px;
    width: fit-content;
    margin-top: 10px;
    .item {
      cursor: pointer;
      min-width: 112px;
      height: 44px;
      padding: 0 14px;
      flex-direction: row;
      gap: 8px;
      border-radius: 12px;
      color: var(--td-text-color-secondary);
      transition: background-color 200ms ease, transform 100ms ease, box-shadow 200ms ease;
      .icon {
        font-size: 20px;
        transition: transform 200ms ease;
      }
      .menuLabel {
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
      }
      &:hover {
        background-color: var(--td-bg-color-container-hover);
        .icon {
          transform: scale(1.1);
        }
      }
      &:active {
        transform: scale(0.92);
      }
    }
    .active {
      background-color: var(--td-brand-color) !important;
      color: #fff;
      box-shadow: 0 4px 12px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.35);
      &:hover {
        background-color: var(--td-brand-color-hover) !important;
      }
    }
  }
  .workbenchIntro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin: 0 0 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #eceaf0;
    background: #fff;
    .introCopy { min-width: 190px; }
    .eyebrow { color: #9b8bc9; font-size: 9px; font-weight: 800; letter-spacing: .16em; }
    .workbenchTitle { margin-top: 2px; color: #282631; font-size: 17px; font-weight: 750; letter-spacing: -.02em; }
    .workbenchHint { margin-top: 3px; color: #9b97a3; font-size: 11px; }
  }
  .workflowSteps { display: flex; align-items: center; gap: 4px; }
  .workflowStep {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    border: 1px solid transparent; border-radius: 9px; background: transparent; color: #817d89;
    font-size: 12px; cursor: pointer; transition: .2s ease;
    .stepIndex { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: #f0eef5; color: #817d8d; font-size: 10px; font-weight: 700; }
    .stepArrow { margin-left: 3px; color: #b7b1bf; font-size: 17px; font-weight: 300; }
    &:hover { background: #faf9fc; }
    &.active { border-color: #d9d0f5; background: #f7f4ff; color: #5f43b2; .stepIndex { background: #7858cf; color: #fff; } }
  }
  .content {
    flex: 1;
    overflow: hidden;
    animation: fadeSlideIn 300ms ease-out;
  }

  @media (max-width: 900px) {
    .workbenchIntro { align-items: flex-start; flex-direction: column; }
    .workflowSteps { width: 100%; }
    .workflowStep { flex: 1; min-width: 0; justify-content: center; }
    .workflowStep .stepArrow { display: none; }
  }
  .editImage {
    width: 100%;
    height: 75vh;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
