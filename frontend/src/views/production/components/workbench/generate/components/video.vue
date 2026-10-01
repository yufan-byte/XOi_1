<template>
  <t-card :title="'#' + (activeTrackIndex + 1) + $t('workbench.generate.videoMenu')" header-bordered style="height: 100%">
    <template #actions>
      <t-button size="small" :loading="generating" @click="emit('generate')">{{ $t("workbench.generate.generate") }}</t-button>
    </template>
    <div class="history">
      <div class="titleBox f ac">
        <i-time />
        <span class="title">{{ $t("workbench.generate.history") }}（{{ currentTrack?.videoList.length }}）</span>
      </div>
      <div class="historyItemBox">
        <div v-if="!currentTrack?.videoList?.length" class="historyEmpty">
          <i-video theme="outline" size="34" />
          <span>还没有生成版本</span>
          <small>确认提示词后，点击右上角生成视频</small>
        </div>
        <div
          class="historyItem"
          :class="{ active: v.id === selectVideoId, generating: v.state === '生成中', failed: v.state === '生成失败' }"
          v-for="v in currentTrack?.videoList"
          :key="v.id"
          @click="previewVideo(v)">
          <template v-if="videoCoverMap[v.src]">
            <img :src="videoCoverMap[v.src]" class="videoCover" />
          </template>
          <template v-else-if="v.state !== '生成中'">
            <video
              :key="v.src"
              :src="v.src"
              preload="metadata"
              muted
              @loadedmetadata="
                (e: Event) => {
                  (e.target as HTMLVideoElement).currentTime = 0.5;
                }
              "
              @seeked="
                (e: Event) => {
                  const el = e.target as HTMLVideoElement;
                  captureVideoCover(v.src);
                  el.style.display = 'none';
                }
              " />
          </template>
          <div v-if="v.state === '生成中'" class="loadingOverlay c fc">
            <t-loading size="24px" />
            <span class="loadingText">{{ $t("workbench.generate.generating") }}</span>
          </div>
          <t-tooltip v-if="v.state == '生成失败'" placement="top" :content="v?.errorReason! ?? ''" theme="light">
            <t-tag class="stateTag" theme="danger" size="small">
              {{ $t("workbench.generate.generateFailed") }}
            </t-tag>
          </t-tooltip>
          <div v-if="v.state !== '生成中'" class="selectBtn" @click.stop="selectVideo(v)">
            <i-check size="16" />
          </div>
          <div class="delBtn" @click.stop="handleDeleteVideo(v)">
            <i-delete size="16" />
          </div>
          <div v-if="v.state !== '生成中' && v.state !== '生成失败'" class="download" @click.stop="downloadVideo(v)">
            <i-to-bottom size="16" />
          </div>
          <div v-if="v.state !== '生成中' && v.state !== '生成失败'" class="playBtn" @click.stop="openVideoPlayer(v)">
            <i-play size="16" />
          </div>
        </div>
      </div>
    </div>
  </t-card>

  <!-- 视频播放弹窗 -->
  <t-dialog
    v-model:visible="videoPlayerVisible"
    :header="$t('workbench.generate.previewVideo')"
    :footer="false"
    width="800px"
    destroy-on-close
    @close="handlePlayerClose">
    <div class="videoPlayerBox">
      <video v-if="playingVideoSrc" :src="playingVideoSrc" controls autoplay class="videoPlayer" />
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";

const props = defineProps<{
  activeTrackIndex: number;
  generating?: boolean;
}>();
const currentTrack = defineModel<TrackItem>("currentTrack", {
  default: () => {},
});
const emit = defineEmits<{
  generate: [];
  refresh: [];
}>();

const { project } = storeToRefs(projectStore());
const episodesId = inject<Ref<number>>("episodesId")!;

const selectVideoId = ref();
const videoCoverMap = ref<Record<string, string>>({});
const videoPlayerVisible = ref(false);
const playingVideoSrc = ref<string>();

/** 选中历史视频并同步到后端 */
async function selectVideo(v: HistoryVideoItem) {
  if (v.state === "生成中" || v.state === "生成失败") return;
  try {
    await axios.post("/production/workbench/selectVideo", {
      projectId: project.value?.id,
      scriptId: episodesId.value ?? 0,
      videoId: v.id,
      trackId: currentTrack?.value.id,
    });
    window.$message.success($t("workbench.generate.selectVideoSuccess"));
    emit("refresh");
  } catch {
    window.$message.error($t("workbench.generate.selectVideoFailed"));
  }
}

/** 删除某条历史视频 */
function handleDeleteVideo(value: HistoryVideoItem) {
  const dlg = DialogPlugin.confirm({
    header: $t("workbench.generate.del"),
    body: $t("workbench.generate.delVideo"),
    onConfirm: () => {
      axios.post("/production/workbench/delVideo", { id: value.id }).then(() => {
        window.$message.success($t("workbench.generate.delSuccess"));
        emit("refresh");
        dlg.destroy();
        currentTrack.value.videoList.filter((item) => item.id == value.id);
      });
    },
    onCancel: () => dlg.destroy(),
  });
}

/** 单个视频下载 */
const downloadingSet = new Set<string>();

async function downloadVideo(value: HistoryVideoItem) {
  if (!value?.src) return;
  if (downloadingSet.has(value.src)) {
    window.$message.info("下载进行中，请稍候");
    return;
  }
  downloadingSet.add(value.src);
  try {
    const response = await fetch(value.src);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    // 使用时间戳保证文件名唯一，避免浏览器提示覆盖
    link.download = `视频_${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // 延迟撤销，确保浏览器有时间开始下载（避免立即 revoke 导致问题）
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
    }, 60000);
  } catch (err) {
    console.error(err);
    window.$message.error("下载失败");
  } finally {
    downloadingSet.delete(value.src);
  }
}

/** 捕获视频封面（绘制 0.5s 帧到 canvas） */
function captureVideoCover(src: string) {
  if (!src || videoCoverMap.value[src]) return;
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.src = src;
  video.addEventListener(
    "seeked",
    () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 160;
        canvas.height = video.videoHeight || 90;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          videoCoverMap.value[src] = canvas.toDataURL("image/jpeg", 0.7);
        }
      } catch {}
      video.src = "";
    },
    { once: true },
  );
  video.addEventListener(
    "loadeddata",
    () => {
      video.currentTime = 0.5;
    },
    { once: true },
  );
  video.addEventListener(
    "error",
    () => {
      video.src = "";
    },
    { once: true },
  );
  video.load();
}

/** 打开视频播放弹窗 */
function openVideoPlayer(v: HistoryVideoItem) {
  if (!v.src) return;
  playingVideoSrc.value = v.src;
  videoPlayerVisible.value = true;
}

/** 关闭播放弹窗时清空 src，停止播放 */
function handlePlayerClose() {
  playingVideoSrc.value = undefined;
}

/** 点击历史视频条目进行预览 */
function previewVideo(v: HistoryVideoItem) {
  if (v.state === "生成中" || v.state === "生成失败") return;
}
</script>

<style lang="scss" scoped>
.history {
  height: 100%;
  .titleBox {
    gap: 6px;
    margin-bottom: 8px;
    .title {
      font-size: 13px;
      color: var(--td-text-color-secondary);
    }
  }
  .historyItemBox {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    height: 100%;
    align-content: start;
    overflow-y: auto;
    padding: 4px;
    .historyEmpty {
      grid-column: 1 / -1;
      min-height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 8px;
      color: var(--td-text-color-placeholder);
      small { color: var(--td-text-color-secondary); font-size: 12px; }
    }
    .historyItem {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 10;
      height: auto;
      border-radius: 10px;
      overflow: hidden;
      cursor: pointer;
      border: 2px solid transparent;
      background: var(--td-bg-color-secondarycontainer);
      transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
      &:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
      }
      &:active {
        transform: scale(0.97);
      }
      &.active {
        border-color: var(--td-brand-color);
        box-shadow: 0 0 0 2px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.25), 0 4px 12px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.15);
      }
      &.generating {
        cursor: default;
        &:hover {
          transform: none;
          box-shadow: none;
        }
      }
      &.failed {
        cursor: default;
        &:hover {
          transform: none;
          box-shadow: none;
        }
      }
      .videoCover {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 300ms ease;
      }
      &:hover .videoCover {
        transform: scale(1.05);
      }
      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .loadingOverlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        gap: 4px;
        .loadingText {
          font-size: 11px;
          color: #fff;
        }
      }
      .stateTag {
        position: absolute;
        bottom: 4px;
        left: 4px;
        backdrop-filter: blur(8px);
      }
      .selectBtn,
      .delBtn,
      .download,
      .playBtn {
        position: absolute;
        display: none;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(4px);
        color: #fff;
        cursor: pointer;
        transition: background-color 150ms ease, transform 100ms ease;
        &:hover {
          background: rgba(0, 0, 0, 0.8);
          transform: scale(1.15);
        }
        &:active {
          transform: scale(0.9);
        }
      }
      .selectBtn {
        bottom: 4px;
        right: 4px;
      }
      .delBtn {
        top: 4px;
        right: 4px;
        &:hover {
          background: rgba(220, 50, 50, 0.85);
        }
      }
      .download {
        bottom: 4px;
        left: 4px;
      }
      .playBtn {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(4px);
        opacity: 0;
        transition: opacity 200ms ease, background-color 150ms ease;
        &:hover {
          background: rgba(0, 0, 0, 0.8);
          transform: translate(-50%, -50%) scale(1.15);
        }
        &:active {
          transform: translate(-50%, -50%) scale(0.9);
        }
      }
      &:hover {
        .selectBtn,
        .delBtn,
        .download {
          display: flex;
        }
        .playBtn {
          display: flex;
          opacity: 1;
        }
      }
    }
  }
}

@media (max-width: 520px) {
  .history .historyItemBox { grid-template-columns: 1fr; }
}

.videoPlayerBox {
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  .videoPlayer {
    width: 100%;
    max-height: 450px;
    outline: none;
  }
}
:deep(.t-card__body) {
  overflow: auto;
  height: calc(100% - 48px);
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }
}
</style>
