<template>
  <div class="editVideo">
    <div class="editorHeader">
      <div class="editorTitle">
        <span class="eyebrow">XOi EDITOR</span>
        <span class="title">剪辑工作台</span>
        <span class="hint">将已选镜头自动编排到主轨道，再进行精剪</span>
      </div>
      <div class="editorStatus">
        <span class="statusDot" /> 自动保存草稿
      </div>
    </div>
    <splitpanes class="default-theme content" horizontal :push-other-panes="false">
      <pane size="60">
        <splitpanes :push-other-panes="false">
          <pane size="20" min-size="10">
            <mediaLibrary
              :initial-video-items="initialVideoItems"
              :initial-media-items="initialMediaItems"
              :initial-audio-items="initialAudioItems"
              :initial-image-items="initialImageItems" />
          </pane>
          <pane size="60" min-size="20">
            <div ref="previewWrapperRef" class="previewWrapper">
              <videoPreview ref="videoPreviewRef" :canvas-width="canvasWidth" :canvas-height="canvasHeight" :style="previewStyle" />
            </div>
          </pane>
          <pane size="20" min-size="10">
            <propertyPanel />
          </pane>
        </splitpanes>
      </pane>
      <pane size="40" class="pr">
        <VideoTrack
          class="videoTrack"
          ref="videoTrackRef"
          :operation-buttons="operationButtons"
          :scale-config-buttons="scaleConfigButtons"
          :track-types="trackTypes"
          :clip-configs="clipConfigs"
          :enable-main-track-mode="true"
          :enable-cross-track-drag="true"
          :enable-snap="true"
          :default-scale="1"
          @add-transition="handleAddTransitionFromClick"
          @drop-media="handleDropMedia"
          @transition-added="onTransitionAdded">
          <!-- 自定义操作按钮 -->
          <template #custom-operation-reset>
            <t-button variant="text" size="small" @click="videoTrackRef?.reset()" :title="$t('workbench.production.editVideo.reset')">
              <template #icon><i-refresh size="16" /></template>
              {{ $t("workbench.production.editVideo.reset") }}
            </t-button>
          </template>

          <template #custom-operation-undo>
            <t-button
              variant="text"
              size="small"
              :disabled="!historyStore.canUndo"
              @click="historyStore.undo()"
              :title="$t('workbench.production.editVideo.undo')">
              <template #icon><i-undo size="16" /></template>
              {{ $t("workbench.production.editVideo.undo") }}
            </t-button>
          </template>

          <template #custom-operation-redo>
            <t-button
              variant="text"
              size="small"
              :disabled="!historyStore.canRedo"
              @click="historyStore.redo()"
              :title="$t('workbench.production.editVideo.redo')">
              <template #icon><i-redo size="16" /></template>
              {{ $t("workbench.production.editVideo.redo") }}
            </t-button>
          </template>

          <template #custom-operation-split>
            <t-button
              variant="text"
              size="small"
              :disabled="tracksStore.selectedClipIds.size === 0"
              @click="handleSplit"
              :title="$t('workbench.production.editVideo.split')">
              <template #icon><i-cutting-one size="16" /></template>
              {{ $t("workbench.production.editVideo.split") }}
            </t-button>
          </template>

          <template #custom-operation-delete>
            <t-button variant="text" size="small" @click="handleDeleteClips" :title="$t('workbench.production.editVideo.delete')">
              <template #icon><i-delete size="16" /></template>
              {{ $t("workbench.production.editVideo.delete") }}
            </t-button>
          </template>
          <!-- <template #custom-operation-import>
            <t-button variant="text" size="small" @click="handleImport" :title="$t('workbench.production.editVideo.importProject')">
              <template #icon><i-folder-open size="16" /></template>
              {{ $t("workbench.production.editVideo.import") }}
            </t-button>
          </template> -->
          <template #scale-append>
            <t-button theme="danger" @click="exportDialogVisible = true" :loading="isExporting" :title="$t('workbench.production.editVideo.exportProject')">
              <template #icon><i-export size="16" style="margin-right: 4px" /></template>
              {{ isExporting ? $t("workbench.production.editVideo.rendering") : $t("workbench.production.editVideo.exportVideo") }}
            </t-button>
          </template>
        </VideoTrack>
      </pane>
    </splitpanes>

    <t-dialog v-model:visible="exportDialogVisible" header="导出中心" width="620px" :footer="false" destroy-on-close>
      <div class="exportDialog">
        <div class="exportHero">
          <div>
            <div class="exportEyebrow">XOi DELIVERY</div>
            <div class="exportTitle">把时间线交付成片</div>
            <div class="exportSub">先选择导出范围，导出过程不会影响当前剪辑。</div>
          </div>
          <div class="exportDuration">{{ formatTimelineDuration(playbackStore.duration) }}</div>
        </div>

        <div class="exportModes">
          <button v-for="item in exportModes" :key="item.value" class="exportMode" :class="{ active: exportMode === item.value, disabled: item.disabled }" :disabled="item.disabled" @click="exportMode = item.value">
            <span class="modeIcon">{{ item.icon }}</span>
            <span class="modeCopy"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
            <span v-if="exportMode === item.value" class="modeCheck">✓</span>
          </button>
        </div>

        <div v-if="exportMode === 'range'" class="rangeEditor">
          <div class="rangeField"><label>入点</label><t-input-number v-model="exportStart" :min="0" :max="playbackStore.duration" :step="0.1" suffix="秒" /></div>
          <span class="rangeArrow">→</span>
          <div class="rangeField"><label>出点</label><t-input-number v-model="exportEnd" :min="exportStart" :max="playbackStore.duration" :step="0.1" suffix="秒" /></div>
          <div class="rangeSummary">导出时长 {{ formatTimelineDuration(Math.max(exportEnd - exportStart, 0)) }}</div>
        </div>

        <div v-if="exportMode === 'scene' || exportMode === 'marker'" class="comingSoon">
          <span class="comingIcon">✦</span>
          <div><strong>{{ exportMode === 'scene' ? '按场景分段导出' : '按标记分段导出' }}</strong><p>导出任务队列正在接入，当前先完成时间线范围配置。</p></div>
        </div>

        <div class="exportFooter">
          <span class="exportNote">MP4 · {{ canvasWidth }}×{{ canvasHeight }} · 当前项目比例</span>
          <div class="exportActions"><t-button variant="outline" @click="exportDialogVisible = false">取消</t-button><t-button theme="primary" :disabled="exportMode === 'scene' || exportMode === 'marker'" :loading="isExporting" @click="confirmExport">开始导出</t-button></div>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import mediaLibrary from "./mediaLibrary.vue";
import videoPreview from "./videoPreview.vue";
import propertyPanel from "./propertyPanel.vue";
import { Splitpanes, Pane } from "splitpanes";
import { useLocalStorage } from "@vueuse/core";
import "vue-clip-track/style.css";
import {
  VideoTrack,
  useTracksStore,
  usePlaybackStore,
  useHistoryStore,
  useScaleStore,
  generateId,
  normalizeTime,
  type OperationButton,
  type ScaleConfigButton,
  type TrackTypeConfig,
  type Track,
  type Clip,
  type MediaClip,
} from "vue-clip-track";

import type { MediaItem, AudioItem } from "./utils/mediaData";
import { getDefaultDuration, findOrCreateTrackWithSpace } from "./utils/trackHelper";
import { loadVideoClipThumbnails, loadAudioClipWaveform, loadInitialAudioWaveforms } from "./utils/mediaLoader";
import { findAdjacentClipsAtTime, addTransitionBetweenClips } from "./utils/transitionHelper";
import projectStore from "@/stores/project";

const props = withDefaults(
  defineProps<{
    initialTracks?: Track[];
    initialVideoItems?: MediaItem[];
    initialMediaItems?: MediaItem[];
    initialAudioItems?: AudioItem[];
    initialImageItems?: MediaItem[];
    canvasWidth?: number;
    canvasHeight?: number;
  }>(),
  {
    initialTracks: () => [],
    initialVideoItems: () => [],
    initialMediaItems: () => [],
    initialAudioItems: () => [],
    initialImageItems: () => [],
    canvasWidth: 1920,
    canvasHeight: 1080,
  },
);

const aspectRatio = computed(() => props.canvasWidth / props.canvasHeight);

// 预览区域自适应尺寸
const previewWrapperRef = ref<HTMLElement>();
const wrapperSize = reactive({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | null = null;

const previewStyle = computed(() => {
  const { width: cw, height: ch } = wrapperSize;
  if (cw <= 0 || ch <= 0) return {};
  const ratio = aspectRatio.value;
  if (cw / ch > ratio) {
    return { height: ch + "px", width: Math.floor(ch * ratio) + "px" };
  }
  return { width: cw + "px", height: Math.floor(cw / ratio) + "px" };
});

const tracksStore = useTracksStore();
const playbackStore = usePlaybackStore();
const historyStore = useHistoryStore();
const scaleStore = useScaleStore();
const episodesId = inject("episodesId", ref(0));
const projectState = projectStore();
const { project } = storeToRefs(projectState);
const draftKey = computed(() => `xoi:timeline-draft:${project.value?.id ?? "project"}:${episodesId.value ?? "episode"}`);
const timelineDraft = useLocalStorage<any>(draftKey, null);
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;

const operationButtons = ref<OperationButton[]>([
  { type: "custom", key: "reset" },
  { type: "custom", key: "undo" },
  { type: "custom", key: "redo" },
  { type: "custom", key: "split" },
  { type: "custom", key: "delete" },
  { type: "custom", key: "import" },
]);

const scaleConfigButtons = ref<ScaleConfigButton[]>(["snap"]);

const trackTypes = ref<TrackTypeConfig>({
  video: { max: 5 },
  image: { max: 3 },
  audio: { max: 3 },
  subtitle: { max: 2 },
  text: { max: 2 },
  sticker: { max: 2 },
  filter: { max: 1 },
  effect: { max: 2 },
});

const clipConfigs = ref({
  video: {
    backgroundColor: "linear-gradient(45deg, #667eea 0%, #764ba2 100%)",
    borderColor: "#000000",
    height: 60,
    selected: {
      borderColor: "#ff6b6b",
      boxShadow: "0 0 0 3px rgba(255, 107, 107, 0.3)",
    },
  },
  audio: {
    backgroundColor: "linear-gradient(45deg, #f093fb 0%, #f5576c 100%)",
    height: 36,
    selected: {
      borderColor: "#4ecdc4",
    },
  },
  image: {
    backgroundColor: "linear-gradient(45deg, #43e97b 0%, #38f9d7 100%)",
    borderColor: "#43e97b",
    height: 60,
    selected: {
      borderColor: "#ff6b6b",
      boxShadow: "0 0 0 3px rgba(255, 107, 107, 0.3)",
    },
  },
});

const videoTrackRef = ref();
const videoPreviewRef = ref<InstanceType<typeof videoPreview>>();
const isExporting = ref(false);
const exportDialogVisible = ref(false);
const exportMode = ref<"full" | "range" | "scene" | "marker">("full");
const exportStart = ref(0);
const exportEnd = ref(0);
const exportModes = [
  { value: "full", label: "整片导出", description: "导出完整时间线", icon: "▣", disabled: false },
  { value: "range", label: "当前范围", description: "按入点和出点导出", icon: "⌁", disabled: false },
  { value: "scene", label: "按场景分段", description: "每个场景生成一个文件", icon: "▤", disabled: false },
  { value: "marker", label: "按标记分段", description: "按时间线标记生成文件", icon: "◆", disabled: true },
] as const;

function formatTimelineDuration(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function confirmExport() {
  if (exportMode.value === "range" && exportEnd.value <= exportStart.value) {
    window.$message.warning("请设置有效的导出范围");
    return;
  }
  exportDialogVisible.value = false;
  void handleExport();
}

async function handleExport() {
  if (!videoPreviewRef.value) return;
  if (isExporting.value) return;
  isExporting.value = true;
  try {
    await videoPreviewRef.value.exportVideo();
    window.$message.success($t("workbench.production.editVideo.exportSuccess"));
  } catch (error: any) {
    if (error.name === "AbortError") return; // 用户取消保存
    window.$message.error(error.message || $t("workbench.production.editVideo.exportFailed"));
  } finally {
    isExporting.value = false;
  }
}

function scheduleDraftSave() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    timelineDraft.value = JSON.parse(JSON.stringify(tracksStore.tracks));
  }, 450);
}

function handleSplit() {
  const selectedIds = Array.from(tracksStore.selectedClipIds);
  if (selectedIds.length === 0) return;
  const currentTime = playbackStore.currentTime;
  selectedIds.forEach((id) => {
    const clip = tracksStore.getClip(id);
    if (!clip || currentTime <= clip.startTime || currentTime >= clip.endTime) return;
    tracksStore.splitClip(id, currentTime);
  });
  historyStore.pushSnapshot($t("workbench.production.editVideo.splitClip"));
}

function handleDeleteClips() {
  const selectedIds = Array.from(tracksStore.selectedClipIds);
  if (selectedIds.length === 0) return;
  tracksStore.removeClips(selectedIds);
  historyStore.pushSnapshot($t("workbench.production.editVideo.deleteClip"));
}

// 处理从资源库拖拽媒体到轨道
async function handleDropMedia(mediaData: any, trackId: string, startTime: number) {
  try {
    if (mediaData.type === "transition") {
      handleDropTransition(mediaData, trackId, startTime);
      return;
    }

    const duration = getDefaultDuration(mediaData.type, mediaData);
    const { track } = findOrCreateTrackWithSpace(tracksStore, mediaData.type, startTime, duration, trackId);
    if (!track) return;

    let clip: Partial<Clip> = {
      id: generateId("clip-"),
      trackId: track.id,
      startTime: normalizeTime(startTime),
      selected: false,
    };

    if (mediaData.type === "video") {
      const sourceUrl = mediaData.sourceUrl || mediaData.url || mediaData.id;
      clip = {
        ...clip,
        type: "video",
        name: mediaData.name,
        endTime: normalizeTime(startTime + duration),
        sourceUrl,
        originalDuration: duration,
        trimStart: 0,
        trimEnd: duration,
        playbackRate: 1,
        thumbnails: mediaData.thumbnails || [],
      } as Partial<MediaClip>;

      tracksStore.addClip(track.id, clip as Clip);
      historyStore.pushSnapshot($t("workbench.production.editVideo.addClip", { name: mediaData.name }));

      if (!mediaData.thumbnails || mediaData.thumbnails.length === 0) {
        loadVideoClipThumbnails(tracksStore, clip.id!, sourceUrl);
      }
      return;
    } else if (mediaData.type === "image") {
      const sourceUrl = mediaData.sourceUrl || mediaData.url || mediaData.id;
      clip = {
        ...clip,
        type: "image" as any,
        name: mediaData.name,
        endTime: normalizeTime(startTime + duration),
        sourceUrl,
        originalDuration: duration,
        trimStart: 0,
        trimEnd: duration,
        playbackRate: 1,
        thumbnails: mediaData.thumbnail ? [mediaData.thumbnail] : [],
      };

      tracksStore.addClip(track.id, clip as Clip);
      historyStore.pushSnapshot($t("workbench.production.editVideo.addClip", { name: mediaData.name }));
      return;
    } else if (mediaData.type === "audio") {
      const sourceUrl = mediaData.sourceUrl || mediaData.url || mediaData.id;
      clip = {
        ...clip,
        type: "audio",
        name: mediaData.name,
        endTime: normalizeTime(startTime + duration),
        sourceUrl,
        originalDuration: duration,
        trimStart: 0,
        trimEnd: duration,
        playbackRate: 1,
        volume: 1,
        waveformData: mediaData.waveformData || [],
      } as Partial<MediaClip>;

      tracksStore.addClip(track.id, clip as Clip);
      historyStore.pushSnapshot($t("workbench.production.editVideo.addClip", { name: mediaData.name }));

      if (!mediaData.waveformData || mediaData.waveformData.length === 0) {
        loadAudioClipWaveform(tracksStore, clip.id!, sourceUrl);
      }
      return;
    } else if (mediaData.type === "subtitle") {
      clip = {
        ...clip,
        type: "subtitle",
        name: mediaData.name,
        endTime: normalizeTime(startTime + duration),
        text: $t("workbench.production.editVideo.sampleSubtitle"),
      };
    } else if (mediaData.type === "text") {
      clip = {
        ...clip,
        type: "text",
        name: mediaData.name,
        endTime: normalizeTime(startTime + duration),
        text: $t("workbench.production.editVideo.customText"),
      };
    } else if (mediaData.type === "sticker") {
      clip = { ...clip, type: "sticker", name: mediaData.name, endTime: normalizeTime(startTime + duration), sourceUrl: mediaData.id };
    } else if (mediaData.type === "filter") {
      clip = {
        ...clip,
        type: "filter",
        name: mediaData.name,
        endTime: normalizeTime(startTime + duration),
        filterType: mediaData.filterType || mediaData.id,
        filterValue: mediaData.filterValue ?? 1,
      };
    } else if (mediaData.type === "effect") {
      clip = {
        ...clip,
        type: "effect",
        name: mediaData.name,
        endTime: normalizeTime(startTime + duration),
        effectType: mediaData.effectType || mediaData.id,
        effectDuration: duration,
      };
    }

    tracksStore.addClip(track.id, clip as Clip);
    historyStore.pushSnapshot($t("workbench.production.editVideo.addClip", { name: mediaData.name }));
  } catch (error: any) {
    alert(error.message);
  }
}

// 处理转场拖拽
function handleDropTransition(transitionData: any, trackId: string, dropTime: number) {
  const track = tracksStore.tracks.find((t) => t.id === trackId);
  if (!track) return;

  const clips = track.clips.filter((c) => c.type !== "transition").sort((a, b) => a.startTime - b.startTime);
  if (clips.length === 0) {
    window.$message.warning($t("workbench.production.editVideo.transitionBetweenClips"));
    return;
  }

  const result = findAdjacentClipsAtTime(clips, dropTime);
  if (!result) {
    window.$message.warning($t("workbench.production.editVideo.transitionBetweenClips"));
    return;
  }

  applyTransition(result.beforeClip.id, result.afterClip.id, transitionData.subType);
}

function handleAddTransitionFromClick(beforeClipId: string, afterClipId: string) {
  applyTransition(beforeClipId, afterClipId, "fade");
}

// 添加转场并触发后续事件
function applyTransition(beforeClipId: string, afterClipId: string, transitionType: string = "fade") {
  const result = addTransitionBetweenClips(tracksStore, historyStore, beforeClipId, afterClipId, transitionType);
  if (result) {
    if (videoTrackRef.value) {
      videoTrackRef.value.emitTransitionAdded(result.transitionClip, result.beforeClip.id, result.afterClip.id);
    }
  }
}

function onTransitionAdded(transitionClip: any, beforeClipId: string, afterClipId: string) {
  window.$message.success($t("workbench.production.editVideo.transitionAdded", { name: transitionClip.name }));
  playbackStore.seekTo(transitionClip.startTime);
}

// 初始化轨道数据
function initializeTracks() {
  tracksStore.reset();

  const savedTracks = Array.isArray(timelineDraft.value) && timelineDraft.value.length ? timelineDraft.value : props.initialTracks;
  if (savedTracks.length > 0) {
    savedTracks.forEach((track: Track) => {
      tracksStore.addTrack(track);
    });
  }

  // 将视频生成页中“已选用”的镜头视频自动编排到主轨道。
  // 这是生成 → 剪辑的关键桥接：用户不需要再手动从素材库逐个拖拽。
  const mainTrack = tracksStore.tracks.find((track) => track.isMain || track.type === "video");
  if (!timelineDraft.value && mainTrack && props.initialVideoItems.length > 0 && mainTrack.clips.length === 0) {
    let cursor = 0;
    props.initialVideoItems
      .filter((item) => item.selected && item.url)
      .forEach((item) => {
        const duration = Math.max(Number(item.duration) || 1, 0.5);
        const clip = {
          id: generateId("clip-"),
          trackId: mainTrack.id,
          type: "video",
          name: item.name,
          startTime: normalizeTime(cursor),
          endTime: normalizeTime(cursor + duration),
          sourceUrl: item.url,
          originalDuration: duration,
          trimStart: 0,
          trimEnd: duration,
          playbackRate: 1,
          selected: false,
        } as unknown as Clip;
        tracksStore.addClip(mainTrack.id, clip);
        cursor += duration;
      });
    if (cursor > 0) playbackStore.setDuration(Math.max(cursor + 5, 30));
  }

  if (playbackStore.duration <= 0) playbackStore.setDuration(60 * 5);
  playbackStore.seekTo(0);
  historyStore.initialize();
  loadInitialAudioWaveforms(tracksStore);
  watch(
    () => tracksStore.tracks,
    () => scheduleDraftSave(),
    { deep: true },
  );
}

// ============ 鼠标拖拽滚动 & 滚轮缩放 ============
let isDragging = false;
let dragStartX = 0;
let dragScrollLeft = 0;

function initTrackInteractions() {
  nextTick(() => {
    const trackArea = document.querySelector('.track-area') as HTMLElement;
    if (!trackArea) return;

    // 鼠标左键拖拽滚动
    trackArea.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // 排除可交互元素
      if (target.closest('.clip') || target.closest('.ruler__cursor-handle') || target.closest('.ruler__cursor-line') || target.closest('.clip__handle')) {
        return;
      }

      isDragging = true;
      dragStartX = e.pageX;
      dragScrollLeft = trackArea.scrollLeft;
      trackArea.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      const trackArea = document.querySelector('.track-area') as HTMLElement;
      if (!trackArea) return;
      const walk = (dragStartX - e.pageX) * 1.5;
      trackArea.scrollLeft = dragScrollLeft + walk;
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      const trackArea = document.querySelector('.track-area') as HTMLElement;
      if (trackArea) {
        trackArea.style.cursor = '';
      }
    });

    // 鼠标滚轮缩放时间轴
    trackArea.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        scaleStore.zoomIn(0.2);
      } else {
        scaleStore.zoomOut(0.2);
      }
    }, { passive: false });
  });
}

onMounted(() => {
  initializeTracks();
  exportEnd.value = playbackStore.duration;
  initTrackInteractions();

  if (previewWrapperRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        wrapperSize.width = entry.contentRect.width;
        wrapperSize.height = entry.contentRect.height;
      }
    });
    resizeObserver.observe(previewWrapperRef.value);
  }
});

onUnmounted(() => {
  playbackStore.pause();
  resizeObserver?.disconnect();
});
</script>

<style lang="scss" scoped>
.exportDialog {
  .exportHero { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px 18px; border-radius: 14px; background: linear-gradient(135deg, #eff6ff, #f8fafc); border: 1px solid #dbeafe; }
  .exportEyebrow { color: #2563eb; font-size: 10px; letter-spacing: .16em; font-weight: 800; }
  .exportTitle { margin-top: 5px; color: #0f172a; font-size: 20px; font-weight: 750; }
  .exportSub { margin-top: 5px; color: #64748b; font-size: 12px; }
  .exportDuration { color: #0f172a; font-size: 26px; font-variant-numeric: tabular-nums; font-weight: 700; }
  .exportModes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
  .exportMode { display: flex; align-items: center; gap: 10px; position: relative; padding: 13px; text-align: left; border: 1px solid var(--td-border-level-1-color); border-radius: 12px; background: var(--td-bg-color-container); cursor: pointer; transition: all .16s ease; }
  .exportMode:hover:not(:disabled) { border-color: #93c5fd; transform: translateY(-1px); }
  .exportMode.active { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.1); background: #f8fbff; }
  .exportMode.disabled { opacity: .52; cursor: not-allowed; }
  .modeIcon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; background: #eff6ff; color: #2563eb; font-size: 16px; }
  .modeCopy { display: flex; flex-direction: column; gap: 3px; } .modeCopy strong { color: var(--td-text-color-primary); font-size: 13px; } .modeCopy small { color: var(--td-text-color-secondary); font-size: 11px; }
  .modeCheck { position: absolute; right: 10px; top: 10px; color: #2563eb; font-weight: 800; }
  .rangeEditor { display: flex; align-items: flex-end; gap: 10px; margin-top: 14px; padding: 13px; border-radius: 12px; background: var(--td-bg-color-secondarycontainer); }
  .rangeField { flex: 1; } .rangeField label { display: block; margin-bottom: 5px; color: var(--td-text-color-secondary); font-size: 11px; } .rangeArrow { padding-bottom: 8px; color: var(--td-text-color-placeholder); } .rangeSummary { padding-bottom: 8px; color: #2563eb; font-size: 12px; white-space: nowrap; }
  .comingSoon { display: flex; gap: 10px; align-items: center; margin-top: 14px; padding: 14px; color: #475569; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; } .comingIcon { color: #d97706; font-size: 20px; } .comingSoon strong { color: #92400e; font-size: 13px; } .comingSoon p { margin: 4px 0 0; font-size: 12px; }
  .exportFooter { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--td-border-level-1-color); } .exportNote { color: var(--td-text-color-secondary); font-size: 11px; } .exportActions { display: flex; gap: 8px; }
}
.editorHeader {
  height: 54px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(90deg, #111827 0%, #182235 60%, #202b43 100%);
  color: #fff;
  border-radius: 14px 14px 0 0;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  .editorTitle {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    .eyebrow {
      font-size: 10px;
      letter-spacing: 0.18em;
      color: #7dd3fc;
      font-weight: 700;
    }
    .title { font-size: 15px; font-weight: 700; }
    .hint { font-size: 12px; color: rgba(255, 255, 255, 0.62); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  }
  .editorStatus {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
    .statusDot { width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.14); }
  }
}
.editVideo {
  .content {
    height: calc(100vh - var(--td-comp-paddingTB-xl) * 2 - 54px - 50px - 16px);
  }

  .previewWrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--td-bg-color-secondarycontainer);
    border: 1px solid var(--td-border-level-1-color);
    border-radius: 10px;
  }
  .videoTrack {
    height: 100%;
    border: 1px solid var(--td-border-level-1-color);
    border-radius: 10px;
  }
}
:deep(.ruler__cursor-handle) {
  &:hover {
    filter: none !important;
  }
}
:deep(.splitpanes__pane) {
  background-color: transparent !important;
}
:deep(.splitpanes__splitter) {
  border: none !important;
  margin: 0px !important;
}
:deep(.tools-bar__select) {
  display: none !important;
}
:deep(.video-track) {
  --color-primary: var(--td-text-color-primary);
  --color-bg-dark: var(--td-bg-color-component);
  --color-bg-medium: var(--td-bg-color-secondarycontainer);
  --color-text-primary: var(--td-text-color-primary);
  .ruler {
    background-color: var(--td-bg-color-container);
    .ruler__placeholder {
      background-color: var(--td-bg-color-secondarycontainer);
    }
  }
  .track-control {
    background-color: var(--td-bg-color-container);
  }
  .tools-bar {
    background-color: var(--td-bg-color-container);
  }
  .tools-bar__time {
    background-color: var(--td-bg-color-secondarycontainer);
  }
  .tools-bar__btn {
    background-color: var(--td-brand-color-active);
    &:hover {
      background-color: var(--td-bg-color-container-hover);
      box-shadow: none;
    }
  }

  .tracks__scrollbar {
    background-color: var(--td-bg-color-container);
  }
}
</style>
