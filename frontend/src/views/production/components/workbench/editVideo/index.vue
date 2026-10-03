<template>
  <div class="editor">
    <!-- ─────────────── 顶栏 ─────────────── -->
    <header class="edTop">
      <div class="edTopLeft">
        <button class="edBack" title="返回分镜成片" @click="goBack">
          <i-arrow-left theme="outline" size="18" />
        </button>
        <div class="edMeta">
          <div class="edName">{{ project?.name || "未命名项目" }}</div>
          <div class="edSub">
            <span>{{ episodeLabel }}</span>
            <i class="edSep" />
            <span>{{ timelineClipCount }} 个镜头</span>
            <i class="edSep" />
            <span class="edTime">{{ formatDuration(playbackStore.duration) }}</span>
          </div>
        </div>
      </div>

      <div class="edTopRight">
        <div class="edSave" :class="`is-${saveState}`">
          <span class="dot" />{{ saveText }}
        </div>
        <button class="edGhost" :disabled="!historyStore.canUndo" title="撤销" @click="historyStore.undo()">
          <i-undo theme="outline" size="17" />
        </button>
        <button class="edGhost" :disabled="!historyStore.canRedo" title="重做" @click="historyStore.redo()">
          <i-redo theme="outline" size="17" />
        </button>
        <t-button theme="danger" :loading="isExporting" @click="exportDialogVisible = true">
          <template #icon><i-export size="16" style="margin-right: 4px" /></template>
          {{ isExporting ? "导出中…" : "导出成片" }}
        </t-button>
      </div>
    </header>

    <!-- ─────────────── 主体 ─────────────── -->
    <div class="edBody" :class="{ 'is-guide': showEmptyGuide }">
      <!-- 上部：镜头库 · 预览 · 属性 -->
      <div class="edUpper">
        <aside v-show="!leftCollapsed" class="edSide edSideLeft">
          <mediaLibrary
            :initial-video-items="libraryVideoItems"
            :initial-media-items="initialMediaItems"
            :initial-audio-items="initialAudioItems"
            :initial-image-items="initialImageItems"
            @pick="handlePickMedia" />
        </aside>
        <button class="edRail" :title="leftCollapsed ? '展开镜头库' : '收起镜头库'" @click="leftCollapsed = !leftCollapsed">
          <i-arrow-left v-if="!leftCollapsed" theme="outline" size="14" />
          <i-arrow-right v-else theme="outline" size="14" />
        </button>

        <section class="edStage" ref="previewWrapperRef">
          <videoPreview ref="videoPreviewRef" :canvas-width="canvasWidth" :canvas-height="canvasHeight" :style="previewStyle" />
        </section>

        <button class="edRail" :title="rightCollapsed ? '展开属性' : '收起属性'" @click="rightCollapsed = !rightCollapsed">
          <i-arrow-right v-if="!rightCollapsed" theme="outline" size="14" />
          <i-arrow-left v-else theme="outline" size="14" />
        </button>
        <aside v-show="!rightCollapsed" class="edSide edSideRight">
          <propertyPanel />
        </aside>
      </div>

      <!-- 时间线高度拖拽条 -->
      <div class="edSplit" @pointerdown="onSplitDown"><span /></div>

      <!-- 下部：时间线 -->
      <div class="edTimeline" :style="{ height: timelineHeight + 'px' }">
        <!-- 选区（工作区）条：导出「选区」用的就是它。独立像素映射，不受时间线缩放/滚动影响 -->
        <div class="edRange" title="拖拽拉选区间；快捷键 I 设起点、O 设终点、Esc 清除">
          <span class="edRangeLabel">选区</span>
          <div ref="rangeTrackRef" class="edRangeTrack" @pointerdown="onRangeTrackDown">
            <div class="edRangeFill" :style="rangeFillStyle" @pointerdown.stop="onRangeBandDown">
              <button class="edRangeHandle" title="起点" @pointerdown.stop="onRangeHandleDown('start', $event)" />
              <button class="edRangeHandle isEnd" title="终点" @pointerdown.stop="onRangeHandleDown('end', $event)" />
            </div>
          </div>
          <span class="edRangeText">{{ rangeText }}</span>
          <button class="edRangeBtn" title="把播放头位置设为入点（快捷键 I）" @click="setInAtPlayhead">入点</button>
          <button class="edRangeBtn" title="把播放头位置设为出点（快捷键 O）" @click="setOutAtPlayhead">出点</button>
          <button class="edRangeBtn" :disabled="!hasRange" @click="clearRange">清除</button>
        </div>

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
          @drop-media="handleDropMedia"
          @transition-added="onTransitionAdded">
          <template #custom-operation-reset>
            <t-button variant="text" size="small" title="重置时间线视图（滚动与缩放）" @click="resetView">
              <template #icon><i-refresh size="16" /></template>
              重置视图
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
        </VideoTrack>

        <!-- 空白态引导：一个镜头都没有时，不要给一片黑 -->
        <div v-if="showEmptyGuide" class="edGuide">
          <div class="edGuideCard">
            <div class="edGuideIcon"><i-film theme="outline" size="34" /></div>
            <div class="edGuideTitle">{{ noProject ? "还没有打开项目" : "这里还是空的" }}</div>
            <div class="edGuideText">
              <template v-if="noProject">
                剪辑台需要一个项目上下文。先回到项目列表打开一个项目，再进来就能按分镜顺序把镜头铺好。
              </template>
              <template v-else>
                剪辑台按「分镜顺序」自动铺轨，但目前这一集还没有可用的镜头视频。<br />
                先到分镜台生成镜头画面，回来就会自动排好，你直接从「改」开始。
              </template>
            </div>
            <div class="edGuideActions">
              <t-button theme="primary" @click="noProject ? router.push('/project') : goStoryboard()">
                {{ noProject ? "去项目列表" : "去分镜台生成镜头" }}
              </t-button>
              <t-button v-if="!noProject" variant="outline" @click="reload">重新检测</t-button>
            </div>
          </div>
        </div>

        <!-- 自动装配后的提示条（可撤销） -->
        <div v-if="autoLayoutNotice" class="edAutoNotice">
          <i-check-circle theme="filled" size="15" />
          <span>{{ autoLayoutNotice }}</span>
          <button class="edAutoUndo" @click="undoAutoLayout">撤销自动编排</button>
        </div>
      </div>
    </div>

    <!-- ─────────────── 导出 ─────────────── -->
    <t-dialog
      v-model:visible="exportDialogVisible"
      header="导出成片"
      width="560px"
      :footer="false"
      :close-btn="!isExporting"
      :close-on-overlay-click="!isExporting"
      :close-on-esc-keydown="!isExporting"
      destroy-on-close>
      <div class="exportPanel">
        <!-- 待导出：选范围 -->
        <template v-if="!isExporting">
          <div class="exportModes">
            <button class="exportMode" :class="{ isOn: exportMode === 'full' }" @click="exportMode = 'full'">
              <b>整片</b>
              <span>{{ fmtTime(fullDuration) }} · {{ timelineClipCount }} 个镜头</span>
            </button>
            <button class="exportMode" :class="{ isOn: exportMode === 'range' }" :disabled="!hasRange" @click="exportMode = 'range'">
              <b>选区</b>
              <span v-if="hasRange">{{ fmtTime(inPoint) }} – {{ fmtTime(outPoint) }} · {{ fmtTime(outPoint - inPoint) }}</span>
              <span v-else>先在时间线上拉区间，或按 I / O</span>
            </button>
          </div>

          <div class="exportInfo">
            <div class="exportInfoRow"><span>分辨率</span><b>{{ canvasWidth }} × {{ canvasHeight }}</b></div>
            <div class="exportInfoRow"><span>帧率</span><b>{{ EXPORT_FPS_TEXT }}</b></div>
            <div class="exportInfoRow"><span>导出时长</span><b>{{ fmtTime(exportDuration) }}</b></div>
            <div class="exportInfoRow"><span>预计体积</span><b>约 {{ estimatedSizeText }}</b></div>
          </div>

          <p class="exportHint">
            合成在浏览器本地完成（WebCodecs），导完自动下载并归档到项目资产库的「成片」节点。<br />
            「按镜头分段导出」会一次下载多个文件，浏览器可能提示「允许下载多个文件」。
          </p>

          <div class="exportActions">
            <t-button variant="text" :disabled="!segmentCount" @click="confirmExport('segments')">
              按镜头分段导出（{{ segmentCount }}）
            </t-button>
            <span class="exportSpacer" />
            <t-button variant="outline" @click="exportDialogVisible = false">取消</t-button>
            <t-button theme="primary" @click="confirmExport(exportMode)">
              <template #icon><i-export size="16" style="margin-right: 4px" /></template>
              开始导出
            </t-button>
          </div>
        </template>

        <!-- 导出中 -->
        <template v-else>
          <div class="exportRunning">
            <div class="exportRunningHead">
              <t-loading size="16px" />
              <span class="exportRunningLabel">{{ exportLabel }}</span>
              <b class="exportRunningPct">{{ Math.round(exportRatio * 100) }}%</b>
            </div>
            <div class="exportBar"><span :style="{ width: Math.round(exportRatio * 100) + '%' }" /></div>
            <p class="exportHint">请保持页面在前台，切换标签页或锁屏会明显拖慢合成速度。</p>
            <div class="exportActions">
              <span class="exportSpacer" />
              <t-button variant="outline" @click="cancelExport">取消导出</t-button>
            </div>
          </div>
        </template>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { provide } from "vue";
import { useRoute, useRouter } from "vue-router";
import axios from "@/utils/axios";
import mediaLibrary from "./mediaLibrary.vue";
import videoPreview from "./videoPreview.vue";
import propertyPanel from "./propertyPanel.vue";
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
} from "vue-clip-track";

import type { MediaItem, AudioItem } from "./utils/mediaData";
import { findOrCreateTrackWithSpace } from "./utils/trackHelper";
import { loadVideoClipThumbnails, loadAudioClipWaveform, loadInitialAudioWaveforms } from "./utils/mediaLoader";
import { addTransitionBetweenClips, findAdjacentClipsAtTime } from "./utils/transitionHelper";
import projectStore from "@/stores/project";

const props = withDefaults(
  defineProps<{
    initialTracks?: Track[];
    canvasWidth?: number;
    canvasHeight?: number;
  }>(),
  {
    initialTracks: () => [],
    canvasWidth: 0,
    canvasHeight: 0,
  },
);

interface Shot {
  id: number;
  index: number;
  prompt: string;
  duration: number;
  thumb: string;
  selectedVideoUrl: string;
  videos: { id: number; url: string }[];
}

const route = useRoute();
const router = useRouter();

// ─────────────────────── 上下文：项目 / 分集 ───────────────────────
const projectState = projectStore();
const { project } = storeToRefs(projectState);
const projectId = computed(() => Number(project.value?.id) || 0);

/** 当前分集（= o_script.id）。videoPreview 归档成片时 inject 这个 ref */
const scriptId = ref(0);
provide("episodesId", scriptId);

const scriptName = ref("");
const episodeLabel = computed(() => scriptName.value || (scriptId.value ? `第 ${scriptId.value} 集` : "未选择分集"));

/** 项目画幅：以项目设置为准（不再让弹窗在初始化时读一次就固定） */
const canvasWidth = computed(() => props.canvasWidth || ratioSize.value.w);
const canvasHeight = computed(() => props.canvasHeight || ratioSize.value.h);
const ratioSize = computed(() => {
  const ratio = project.value?.videoRatio;
  if (ratio === "1:1") return { w: 1080, h: 1080 };
  if (ratio === "9:16") return { w: 1080, h: 1920 };
  return { w: 1920, h: 1080 };
});
const aspectRatio = computed(() => canvasWidth.value / canvasHeight.value);

// ─────────────────────── 三区布局状态 ───────────────────────
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
const timelineHeight = ref(320);
const TIMELINE_MIN = 240;
const TIMELINE_MAX = 520;

let splitDragging = false;
function onSplitDown(e: PointerEvent) {
  e.preventDefault();
  splitDragging = true;
  const startY = e.clientY;
  const startH = timelineHeight.value;
  const onMove = (ev: PointerEvent) => {
    if (!splitDragging) return;
    const next = startH - (ev.clientY - startY);
    timelineHeight.value = Math.min(TIMELINE_MAX, Math.max(TIMELINE_MIN, next));
  };
  const onUp = () => {
    splitDragging = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

// 预览自适应尺寸
const previewWrapperRef = ref<HTMLElement>();
const wrapperSize = reactive({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | null = null;
const previewStyle = computed(() => {
  const { width: cw, height: ch } = wrapperSize;
  if (cw <= 0 || ch <= 0) return {};
  const ratio = aspectRatio.value;
  const pad = 16;
  const availW = Math.max(cw - pad, 0);
  const availH = Math.max(ch - pad, 0);
  if (availW / availH > ratio) return { height: availH + "px", width: Math.floor(availH * ratio) + "px" };
  return { width: availW + "px", height: Math.floor(availW / ratio) + "px" };
});

// ─────────────────────── store ───────────────────────
const tracksStore = useTracksStore();
const playbackStore = usePlaybackStore();
const historyStore = useHistoryStore();
const scaleStore = useScaleStore();

const draftKey = computed(() => `xoi:timeline-draft:${projectId.value || "project"}:${scriptId.value || "episode"}`);
const timelineDraft = useLocalStorage<any>(draftKey, null);
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;

const saveState = ref<"saved" | "saving" | "idle">("idle");
const saveText = computed(() => (saveState.value === "saving" ? "保存中…" : saveState.value === "saved" ? "已保存到本机" : "自动草稿"));

const videoPreviewRef = ref<InstanceType<typeof videoPreview>>();
const videoTrackRef = ref();
const isExporting = ref(false);
const exportDialogVisible = ref(false);

// ─────────────── 导出：范围 / 进度 / 取消 ───────────────
const EXPORT_FPS_TEXT = "30 fps";

const exportMode = ref<"full" | "range">("full");
const exportRatio = ref(0);
const exportLabel = ref("");
/** 取消信号：真导出是逐块读流，每块之间检查一次即可中断 */
let exportCancelFlag = false;

/** 时间线内容总长（秒）—— 与 videoPreview 的 getMaxSpriteDuration 同口径：max(clip.endTime) */
const fullDuration = computed(() => {
  let max = 0;
  for (const t of tracksStore.tracks) {
    for (const c of t.clips) if (c.type !== "transition" && c.endTime > max) max = c.endTime;
  }
  return Math.max(max, 0);
});

/** 主轨上的镜头分段（分段导出的单位） */
const mainTrackSegments = computed(() =>
  (() => {
    const main = tracksStore.tracks.find((t) => (t as any).isMain) ?? tracksStore.tracks.find((t) => t.type === "video");
    if (!main) return [];
    return main.clips
      .filter((c) => c.type === "video" && c.endTime - c.startTime > 0.05)
      .sort((a, b) => a.startTime - b.startTime);
  })(),
);
const segmentCount = computed(() => mainTrackSegments.value.length);

// 选区（入点 / 出点），秒
const inPoint = ref(0);
const outPoint = ref(0);
/** 用户是否手动拉过选区。没拉过就让选区跟随时间线长度自动更新 */
const rangeTouched = ref(false);
const hasRange = computed(
  () => fullDuration.value > 0 && outPoint.value - inPoint.value > 0.05 && outPoint.value - inPoint.value < fullDuration.value - 0.05,
);

watch(
  fullDuration,
  (v) => {
    if (!rangeTouched.value) {
      inPoint.value = 0;
      outPoint.value = v;
      return;
    }
    inPoint.value = Math.max(0, Math.min(inPoint.value, v));
    outPoint.value = Math.max(inPoint.value, Math.min(outPoint.value, v));
  },
  { immediate: true },
);

const exportDuration = computed(() => (exportMode.value === "range" ? Math.max(0, outPoint.value - inPoint.value) : fullDuration.value));

/** WebCodecs 硬编按 8Mbps 算，约等于 1MB/秒 —— 给用户一个预期，而不是导完才知道多大 */
const estimatedSizeText = computed(() => {
  const mb = exportDuration.value;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(mb, 0.1).toFixed(1)} MB`;
});

// ─────────────────────── 素材 & 分镜数据 ───────────────────────
const shots = ref<Shot[]>([]);
const initialMediaItems = ref<MediaItem[]>([]);
const initialAudioItems = ref<AudioItem[]>([]);
const initialImageItems = ref<MediaItem[]>([]);
const autoLayoutNotice = ref("");

/** 左侧「镜头」Tab：分镜语义的镜头卡（名字是「分镜 03」，不再是 #分镜1-1） */
const libraryVideoItems = computed<MediaItem[]>(() =>
  shots.value
    .filter((shot) => shot.selectedVideoUrl || shot.videos?.length)
    .map((shot) => ({
      id: `shot-${shot.id}`,
      type: "video" as const,
      name: `分镜 ${String(shot.index + 1).padStart(2, "0")}`,
      duration: shot.duration || 0,
      icon: "🎬",
      color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      url: shot.selectedVideoUrl || shot.videos[0]?.url || "",
      thumbnail: shot.thumb || undefined,
      selected: !!shot.selectedVideoUrl,
    })),
);

/** 有草稿时不动用户的东西；没有素材时不铺空轨 */
const noProject = computed(() => projectId.value <= 0);
const showEmptyGuide = computed(() => noProject.value || shots.value.length === 0 || libraryVideoItems.value.length === 0);
const timelineClipCount = computed(() => tracksStore.tracks.reduce((n, t) => n + t.clips.filter((c) => c.type !== "transition").length, 0));

const MEDIA_TYPE_EXT: Record<string, string[]> = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
  video: ["mp4", "webm", "ogg", "mov", "avi", "mkv"],
  audio: ["mp3", "wav", "ogg", "aac", "flac", "m4a"],
};
function getMediaType(src?: string): "image" | "video" | "audio" | "unknown" {
  if (!src) return "unknown";
  const ext = src.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  for (const [type, list] of Object.entries(MEDIA_TYPE_EXT)) if (list.includes(ext)) return type as any;
  return "unknown";
}

async function resolveEpisode() {
  const fromQuery = Number(route.query.episode);
  if (Number.isFinite(fromQuery) && fromQuery > 0) scriptId.value = fromQuery;
  try {
    const { data } = await axios.post("/script/getScrptApi", { projectId: projectId.value, name: "" });
    const list = Array.isArray(data) ? data : [];
    const picked = list.find((ep: any) => Number(ep.id) === scriptId.value) ?? list[0];
    if (picked) {
      scriptId.value = Number(picked.id);
      scriptName.value = picked.name ?? "";
    }
  } catch {
    /* 分集列表拿不到就沿用 query 里的 id，剪辑本身不依赖它 */
  }
}

async function loadShots() {
  try {
    const { data } = await axios.post("/production/editorTimeline", {
      projectId: projectId.value,
      scriptId: scriptId.value,
    });
    shots.value = Array.isArray(data?.shots) ? data.shots : [];
  } catch {
    shots.value = [];
  }
}

async function loadMaterials() {
  try {
    const { data } = await axios.post("/assets/getMaterialData", {
      projectId: projectId.value,
      scriptId: scriptId.value,
    });
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    const video = list.filter((item) => getMediaType(item.filePath) === "video");
    const audio = list.filter((item) => getMediaType(item.filePath) === "audio");
    const image = list.filter((item) => getMediaType(item.filePath) === "image");
    initialMediaItems.value = video.map((item) => ({
      id: `video-${item.id}`,
      type: "video" as const,
      name: item.name,
      duration: item.duration || 0,
      icon: "🎥",
      color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      url: item.filePath,
      loading: true,
    }));
    initialAudioItems.value = audio.map((item) => ({
      id: `audio-${item.id}`,
      type: "audio" as const,
      name: item.name,
      duration: item.duration || 0,
      url: item.filePath,
      loading: true,
    }));
    initialImageItems.value = image.map((item) => ({
      id: `image-${item.id}`,
      type: "image" as const,
      name: item.name,
      duration: item.duration || 5,
      icon: "🖼️",
      color: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
      url: item.filePath,
      loading: true,
    }));
  } catch {
    initialMediaItems.value = [];
    initialAudioItems.value = [];
    initialImageItems.value = [];
  }
}

// ─────────────────────── 轨道初始化 & 自动装配 ───────────────────────
const operationButtons = ref<OperationButton[]>([
  { type: "custom", key: "reset" },
  { type: "custom", key: "split" },
  { type: "custom", key: "delete" },
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
    selected: { borderColor: "#ff6b6b", boxShadow: "0 0 0 3px rgba(255, 107, 107, 0.3)" },
  },
  audio: {
    backgroundColor: "linear-gradient(45deg, #f093fb 0%, #f5576c 100%)",
    height: 36,
    selected: { borderColor: "#4ecdc4" },
  },
  image: {
    backgroundColor: "linear-gradient(45deg, #43e97b 0%, #38f9d7 100%)",
    borderColor: "#43e97b",
    height: 60,
    selected: { borderColor: "#ff6b6b", boxShadow: "0 0 0 3px rgba(255, 107, 107, 0.3)" },
  },
});

function formatDuration(seconds: number) {
  const v = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** 带 0.1s 精度：选区读数用秒级会看不出差别 */
function fmtTime(seconds: number) {
  const v = Math.max(0, seconds);
  const m = Math.floor(v / 60);
  return `${String(m).padStart(2, "0")}:${(v - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** 读真实时长：自动铺轨前必须知道每段多长，否则整条时间线的位置都是错的 */
function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.crossOrigin = "anonymous";
    const done = (v: number) => {
      el.removeAttribute("src");
      resolve(v);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);
    el.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    el.src = url;
  });
}

function ensureMainTrack(): Track | undefined {
  let main = tracksStore.tracks.find((t) => t.isMain || t.type === "video");
  if (!main) {
    main = {
      id: generateId("track-"),
      type: "video",
      name: "主轨道",
      visible: true,
      locked: false,
      clips: [],
      order: 0,
      isMain: true,
    } as unknown as Track;
    tracksStore.addTrack(main);
  }
  return main;
}

/**
 * 进入即有稿：按分镜顺序把镜头铺满主轨。
 * 这是把「从零搭一条时间线」换成「改一份初稿」的关键一步 —— 用户不该面对一条空轨。
 */
let preAutoTracks: Track[] | null = null;
async function autoLayout() {
  const main = ensureMainTrack();
  if (!main || main.clips.length > 0) return;
  if (timelineDraft.value) return; // 有草稿：用户的编排优先

  const usable = (shots.value.length ? shots.value : []).filter((s) => s.selectedVideoUrl || s.videos?.length);
  if (!usable.length) return;

  // 先并行量真实时长，再顺序落轨（顺序落轨才能保证无空隙）
  const durations = await Promise.all(
    usable.map((shot) => probeDuration(shot.selectedVideoUrl || shot.videos[0]?.url || "")),
  );

  preAutoTracks = JSON.parse(JSON.stringify(tracksStore.tracks));

  let cursor = 0;
  usable.forEach((shot, i) => {
    const url = shot.selectedVideoUrl || shot.videos[0]?.url;
    const duration = Math.max(durations[i] || shot.duration || 0, 0.5);
    const clip = {
      id: generateId("clip-"),
      trackId: main.id,
      type: "video",
      name: `分镜 ${String(shot.index + 1).padStart(2, "0")}`,
      startTime: normalizeTime(cursor),
      endTime: normalizeTime(cursor + duration),
      sourceUrl: url,
      originalDuration: duration,
      trimStart: 0,
      trimEnd: duration,
      playbackRate: 1,
      selected: false,
    } as unknown as Clip;
    tracksStore.addClip(main.id, clip);
    void loadVideoClipThumbnails(tracksStore, clip.id!, url);
    cursor += duration;
  });

  playbackStore.setDuration(Math.max(cursor, 10));
  playbackStore.seekTo(0);
  historyStore.initialize();
  if (cursor > 0) {
    autoLayoutNotice.value = `已按分镜顺序铺入 ${usable.length} 个镜头（共 ${formatDuration(cursor)}），可以直接开始精剪`;
  }
}

function undoAutoLayout() {
  if (preAutoTracks) {
    tracksStore.reset();
    preAutoTracks.forEach((t) => tracksStore.addTrack(JSON.parse(JSON.stringify(t))));
    preAutoTracks = null;
  }
  playbackStore.setDuration(60);
  playbackStore.seekTo(0);
  historyStore.initialize();
  autoLayoutNotice.value = "";
}

async function initializeTracks() {
  ready = false;
  tracksStore.reset();

  const savedTracks = Array.isArray(timelineDraft.value) && timelineDraft.value.length ? timelineDraft.value : props.initialTracks;
  if (savedTracks.length > 0) savedTracks.forEach((track: Track) => tracksStore.addTrack(track));

  await autoLayout();

  if (!tracksStore.tracks.length) ensureMainTrack();
  if (playbackStore.duration <= 0) playbackStore.setDuration(60);
  historyStore.initialize();
  await loadInitialAudioWaveforms(tracksStore);
  ready = true;
}

async function reload() {
  await Promise.all([resolveEpisode(), loadShots(), loadMaterials()]);
  autoLayoutNotice.value = "";
  await initializeTracks();
}

// ─────────────────────── 草稿 ───────────────────────
/** 初始化（含自动装配）期间不写草稿：否则会把你自动铺好的初稿当成"用户改过"，也会在装配失败时落一份空稿 */
let ready = false;

function scheduleDraftSave() {
  if (!ready) return;
  saveState.value = "saving";
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    timelineDraft.value = JSON.parse(JSON.stringify(tracksStore.tracks));
    saveState.value = "saved";
  }, 600);
}

// 只注册一次。放在 setup 顶层而不是 initializeTracks 里 —— reload() 会再跑一次初始化，注册在里面会越挂越多
watch(
  () => tracksStore.tracks,
  () => scheduleDraftSave(),
  { deep: true },
);

// ─────────────────────── 轨道编辑 ───────────────────────
function handleSplit() {
  const selectedIds = Array.from(tracksStore.selectedClipIds);
  if (!selectedIds.length) return;
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
  if (!selectedIds.length) return;
  tracksStore.removeClips(selectedIds);
  historyStore.pushSnapshot($t("workbench.production.editVideo.deleteClip"));
}

async function handleDropMedia(mediaData: any, trackId: string, startTime: number) {
  if (mediaData.type === "transition") {
    handleDropTransition(mediaData, trackId, startTime);
    return;
  }
  const duration = Number(mediaData.duration) > 0 ? Number(mediaData.duration) : mediaData.type === "audio" ? 30 : 5;
  const { track } = findOrCreateTrackWithSpace(tracksStore, mediaData.type, startTime, duration, trackId);
  if (!track) return;

  const sourceUrl = mediaData.sourceUrl || mediaData.url || mediaData.id;
  const base = {
    id: generateId("clip-"),
    trackId: track.id,
    startTime: normalizeTime(startTime),
    endTime: normalizeTime(startTime + duration),
    selected: false,
  };

  if (mediaData.type === "video" || mediaData.type === "audio") {
    const clip = {
      ...base,
      type: mediaData.type,
      name: mediaData.name,
      sourceUrl,
      originalDuration: duration,
      trimStart: 0,
      trimEnd: duration,
      playbackRate: 1,
      ...(mediaData.type === "audio"
        ? { volume: 1, waveformData: mediaData.waveformData || [] }
        : { thumbnails: mediaData.thumbnails || [] }),
    } as unknown as Clip;
    tracksStore.addClip(track.id, clip);
    historyStore.pushSnapshot(`添加 ${mediaData.name}`);
    if (mediaData.type === "video" && !mediaData.thumbnails?.length) void loadVideoClipThumbnails(tracksStore, clip.id!, sourceUrl);
    if (mediaData.type === "audio" && !mediaData.waveformData?.length) void loadAudioClipWaveform(tracksStore, clip.id!, sourceUrl);
    return;
  }

  let clip: any = { ...base, type: mediaData.type, name: mediaData.name };
  if (mediaData.type === "image") {
    clip = {
      ...clip,
      sourceUrl,
      originalDuration: duration,
      trimStart: 0,
      trimEnd: duration,
      playbackRate: 1,
      thumbnails: mediaData.thumbnail ? [mediaData.thumbnail] : [],
    };
  } else if (mediaData.type === "subtitle") clip.text = $t("workbench.production.editVideo.sampleSubtitle");
  else if (mediaData.type === "text") clip.text = $t("workbench.production.editVideo.customText");
  else if (mediaData.type === "sticker") clip.sourceUrl = mediaData.id;
  else if (mediaData.type === "filter") {
    clip.filterType = mediaData.filterType || mediaData.id;
    clip.filterValue = mediaData.filterValue ?? 1;
  } else if (mediaData.type === "effect") {
    clip.effectType = mediaData.effectType || mediaData.id;
    clip.effectDuration = duration;
  }

  tracksStore.addClip(track.id, clip as Clip);
  historyStore.pushSnapshot(`添加 ${mediaData.name}`);
}

/** 单击素材：追加到主轨（视频）或同类型轨道末尾，绝不覆盖已有内容 */
function handlePickMedia(item: any) {
  const trackEnd = (track: Track) =>
    track.clips.filter((c) => c.type !== "transition").reduce((max, c) => Math.max(max, c.endTime), 0);

  if (item.type === "video") {
    const main = ensureMainTrack();
    if (!main) return;
    void handleDropMedia(item, main.id, trackEnd(main));
    return;
  }
  const sameType = tracksStore.sortedTracks.find((t) => t.type === item.type);
  void handleDropMedia(item, sameType?.id ?? "", sameType ? trackEnd(sameType) : 0);
}

function handleDropTransition(transitionData: any, trackId: string, dropTime: number) {
  const track = tracksStore.tracks.find((t) => t.id === trackId);
  if (!track) return;
  const clips = track.clips.filter((c) => c.type !== "transition").sort((a, b) => a.startTime - b.startTime);
  const result = clips.length ? findAdjacentClipsAtTime(clips, dropTime) : null;
  if (!result) {
    window.$message.warning($t("workbench.production.editVideo.transitionBetweenClips"));
    return;
  }
  applyTransition(result.beforeClip.id, result.afterClip.id, transitionData.subType);
}

function applyTransition(beforeClipId: string, afterClipId: string, transitionType = "fade") {
  const result = addTransitionBetweenClips(tracksStore, historyStore, beforeClipId, afterClipId, transitionType);
  if (result && videoTrackRef.value) {
    videoTrackRef.value.emitTransitionAdded?.(result.transitionClip, result.beforeClip.id, result.afterClip.id);
  }
}

function onTransitionAdded(transitionClip: any) {
  window.$message.success($t("workbench.production.editVideo.transitionAdded", { name: transitionClip.name }));
  playbackStore.seekTo(transitionClip.startTime);
}

/** 重置时间线视图：缩放乱了 / 滚远了，一键回到起点 */
function resetView() {
  scaleStore.reset();
  videoTrackRef.value?.reset?.();
  const area = document.querySelector(".track-area") as HTMLElement | null;
  if (area) area.scrollLeft = 0;
}

// ─────────────────────── 时间线手感：滚轮缩放 + 空白处拖拽平移 ───────────────────────
let panning = false;
let panStartX = 0;
let panStartScroll = 0;

function onTrackMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  // 排除可交互元素，避免和 clip 拖拽 / 播放头打架
  if (target.closest(".clip") || target.closest(".ruler__cursor-handle") || target.closest(".ruler__cursor-line") || target.closest(".clip__handle")) return;
  const area = e.currentTarget as HTMLElement;
  panning = true;
  panStartX = e.pageX;
  panStartScroll = area.scrollLeft;
  area.style.cursor = "grabbing";
}

function onDocMouseMove(e: MouseEvent) {
  if (!panning) return;
  const area = document.querySelector(".track-area") as HTMLElement | null;
  if (!area) return;
  e.preventDefault();
  area.scrollLeft = panStartScroll + (panStartX - e.pageX) * 1.5;
}

function onDocMouseUp() {
  if (!panning) return;
  panning = false;
  const area = document.querySelector(".track-area") as HTMLElement | null;
  if (area) area.style.cursor = "";
}

function onTrackWheel(e: WheelEvent) {
  e.preventDefault();
  if (e.deltaY < 0) scaleStore.zoomIn(0.2);
  else scaleStore.zoomOut(0.2);
}

function initTrackInteractions() {
  nextTick(() => {
    const area = document.querySelector(".track-area") as HTMLElement | null;
    if (!area) return;
    area.addEventListener("mousedown", onTrackMouseDown);
    area.addEventListener("wheel", onTrackWheel, { passive: false });
    document.addEventListener("mousemove", onDocMouseMove);
    document.addEventListener("mouseup", onDocMouseUp);
  });
}

// ─────────────────────── 选区（入点 / 出点） ───────────────────────
const rangeTrackRef = ref<HTMLElement>();
type RangeDragKind = "start" | "end" | "band" | "new";
let rangeDrag: { kind: RangeDragKind; grabOffset: number } | null = null;
const MIN_RANGE_GAP = 0.1;

const rangeFillStyle = computed(() => {
  const total = fullDuration.value;
  if (total <= 0) return { left: "0%", width: "0%" };
  const left = (Math.max(0, Math.min(inPoint.value, total)) / total) * 100;
  const width = (Math.max(0, Math.min(outPoint.value, total) - Math.min(inPoint.value, total)) / total) * 100;
  return { left: `${left}%`, width: `${width}%` };
});

const rangeText = computed(() => {
  if (fullDuration.value <= 0) return "--:-- / --:--";
  return `${fmtTime(inPoint.value)} – ${fmtTime(outPoint.value)}  (${fmtTime(outPoint.value - inPoint.value)})`;
});

function posToTime(clientX: number): number {
  const el = rangeTrackRef.value;
  if (!el || fullDuration.value <= 0) return 0;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const ratio = (clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(fullDuration.value, ratio * fullDuration.value));
}

function bindRangeDrag(kind: RangeDragKind, grabOffset: number) {
  rangeDrag = { kind, grabOffset };
  window.addEventListener("pointermove", onRangeMove);
  window.addEventListener("pointerup", onRangeUp);
}

function onRangeTrackDown(e: PointerEvent) {
  if (fullDuration.value <= 0) return;
  e.preventDefault();
  rangeTouched.value = true;
  const t = posToTime(e.clientX);
  inPoint.value = t;
  outPoint.value = t;
  bindRangeDrag("new", 0);
}

function onRangeBandDown(e: PointerEvent) {
  if (fullDuration.value <= 0) return;
  e.preventDefault();
  rangeTouched.value = true;
  bindRangeDrag("band", posToTime(e.clientX) - inPoint.value);
}

function onRangeHandleDown(kind: "start" | "end", e: PointerEvent) {
  e.preventDefault();
  rangeTouched.value = true;
  bindRangeDrag(kind, 0);
}

function onRangeMove(e: PointerEvent) {
  if (!rangeDrag) return;
  const total = fullDuration.value;
  const t = posToTime(e.clientX);
  if (rangeDrag.kind === "start") {
    inPoint.value = Math.max(0, Math.min(t, outPoint.value - MIN_RANGE_GAP));
  } else if (rangeDrag.kind === "end") {
    outPoint.value = Math.min(total, Math.max(t, inPoint.value + MIN_RANGE_GAP));
  } else if (rangeDrag.kind === "new") {
    outPoint.value = Math.min(total, Math.max(t, inPoint.value + MIN_RANGE_GAP));
  } else {
    const span = outPoint.value - inPoint.value;
    const nextIn = Math.max(0, Math.min(total - span, t - rangeDrag.grabOffset));
    inPoint.value = nextIn;
    outPoint.value = nextIn + span;
  }
}

function onRangeUp() {
  rangeDrag = null;
  window.removeEventListener("pointermove", onRangeMove);
  window.removeEventListener("pointerup", onRangeUp);
  // 拉得太短当误触处理，回到「整片」
  if (outPoint.value - inPoint.value < MIN_RANGE_GAP) {
    inPoint.value = 0;
    outPoint.value = fullDuration.value;
    rangeTouched.value = false;
    return;
  }
  playbackStore.seekTo(inPoint.value);
}

function clearRange() {
  inPoint.value = 0;
  outPoint.value = fullDuration.value;
  rangeTouched.value = false;
  if (exportMode.value === "range") exportMode.value = "full";
}

function setInAtPlayhead() {
  const t = playbackStore.currentTime;
  rangeTouched.value = true;
  inPoint.value = Math.max(0, Math.min(t, outPoint.value - MIN_RANGE_GAP));
  window.$message.success(`入点已设为 ${fmtTime(inPoint.value)}`);
}

function setOutAtPlayhead() {
  const t = playbackStore.currentTime;
  rangeTouched.value = true;
  outPoint.value = Math.min(fullDuration.value, Math.max(t, inPoint.value + MIN_RANGE_GAP));
  window.$message.success(`出点已设为 ${fmtTime(outPoint.value)}`);
}

/** I / O / Esc：剪辑软件的老习惯，改区间不用去拖那条窄带 */
function onEditorKeydown(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "i" || e.key === "I") setInAtPlayhead();
  else if (e.key === "o" || e.key === "O") setOutAtPlayhead();
  else if (e.key === "Escape") clearRange();
}

// ─────────────────────── 导出 ───────────────────────
function confirmExport(mode: "full" | "range" | "segments") {
  void handleExport(mode);
}

async function handleExport(mode: "full" | "range" | "segments") {
  const preview = videoPreviewRef.value;
  if (!preview || isExporting.value) return;

  isExporting.value = true;
  exportCancelFlag = false;
  exportRatio.value = 0;
  exportLabel.value =
    mode === "segments" ? `准备按镜头分段（共 ${segmentCount.value} 段）…` : "正在合成画面与音轨…";

  try {
    const res = await preview.exportVideo({
      mode,
      start: inPoint.value,
      end: outPoint.value,
      onProgress: (p) => {
        exportRatio.value = p.ratio;
        exportLabel.value = p.label;
      },
      shouldCancel: () => exportCancelFlag,
    });
    exportDialogVisible.value = false;
    window.$message.success(
      mode === "segments" ? `已导出 ${res.files} 个镜头片段（${(res.bytes / 1024 / 1024).toFixed(1)}MB）` : $t("workbench.production.editVideo.exportSuccess"),
    );
  } catch (error: any) {
    if (error?.name === "AbortError") {
      window.$message.info("已取消导出");
      exportDialogVisible.value = false;
    } else {
      window.$message.error(error?.message || $t("workbench.production.editVideo.exportFailed"), 6000);
    }
  } finally {
    isExporting.value = false;
  }
}

function cancelExport() {
  exportCancelFlag = true;
  exportLabel.value = "正在取消…";
}

/** 打开弹窗时：有选区就默认导选区，没有就整片 */
watch(exportDialogVisible, (open) => {
  if (!open) return;
  exportRatio.value = 0;
  exportCancelFlag = false;
  exportMode.value = hasRange.value ? "range" : "full";
});

// ─────────────────────── 导航 ───────────────────────
function goBack() {
  router.push("/production");
}
function goStoryboard() {
  const q = scriptId.value ? `?episode=${scriptId.value}` : "";
  router.push(`/production${q}`);
}

// ─────────────────────── 生命周期 ───────────────────────
onMounted(async () => {
  await resolveEpisode();
  await Promise.all([loadShots(), loadMaterials()]);
  await initializeTracks();
  initTrackInteractions();
  window.addEventListener("keydown", onEditorKeydown);

  if (previewWrapperRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      wrapperSize.width = entry.contentRect.width;
      wrapperSize.height = entry.contentRect.height;
    });
    resizeObserver.observe(previewWrapperRef.value);
  }
});

onUnmounted(() => {
  playbackStore.pause();
  resizeObserver?.disconnect();
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  window.removeEventListener("keydown", onEditorKeydown);
  window.removeEventListener("pointermove", onRangeMove);
  window.removeEventListener("pointerup", onRangeUp);
  const area = document.querySelector(".track-area") as HTMLElement | null;
  area?.removeEventListener("mousedown", onTrackMouseDown);
  area?.removeEventListener("wheel", onTrackWheel);
  document.removeEventListener("mousemove", onDocMouseMove);
  document.removeEventListener("mouseup", onDocMouseUp);
});
</script>

<style lang="scss" scoped>
.editor {
  --ed-gap: 10px;
  --ed-radius: 12px;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
  box-sizing: border-box;
  background: var(--td-bg-color-page);
}

/* ───── 顶栏 ───── */
.edTop {
  flex: none;
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: var(--ed-radius) var(--ed-radius) 0 0;
  background: var(--td-bg-color-container);
}
.edTopLeft { display: flex; align-items: center; gap: 10px; min-width: 0; }
.edBack {
  width: 32px; height: 32px; flex: none;
  display: grid; place-items: center;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 9px; background: var(--td-bg-color-container);
  color: var(--td-text-color-secondary); cursor: pointer;
  transition: all .16s ease;
  &:hover { color: var(--td-brand-color); border-color: var(--td-brand-color); }
}
.edMeta { min-width: 0; }
.edName { font-size: 14px; font-weight: 700; color: var(--td-text-color-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
.edSub {
  display: flex; align-items: center; gap: 8px; margin-top: 2px;
  font-size: 11px; color: var(--td-text-color-placeholder);
  .edSep { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .6; }
  .edTime { font-variant-numeric: tabular-nums; }
}
.edTopRight { display: flex; align-items: center; gap: 6px; flex: none; }
.edSave {
  display: flex; align-items: center; gap: 6px;
  margin-right: 6px; padding: 4px 10px;
  font-size: 11px; border-radius: 999px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-secondarycontainer);
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #34d399; }
  &.is-saving .dot { background: #fbbf24; }
  &.is-idle .dot { background: var(--td-text-color-placeholder); }
}
.edGhost {
  width: 32px; height: 32px;
  display: grid; place-items: center;
  border: 1px solid transparent; border-radius: 9px;
  background: transparent; color: var(--td-text-color-secondary); cursor: pointer;
  transition: all .16s ease;
  &:hover:not(:disabled) { background: var(--td-bg-color-container-hover); color: var(--td-text-color-primary); }
  &:disabled { opacity: .32; cursor: not-allowed; }
}

/* ───── 主体 ───── */
.edBody {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: var(--ed-gap);
}
.edUpper { flex: 1; min-height: 0; display: flex; gap: 0; }

.edSide {
  flex: none;
  min-width: 0;
  overflow: hidden;
}
.edSideLeft { width: 264px; }
.edSideRight { width: 280px; }

.edRail {
  flex: none;
  width: 14px;
  border: 0;
  background: transparent;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
  display: grid;
  place-items: center;
  border-radius: 7px;
  transition: all .16s ease;
  &:hover { color: var(--td-brand-color); background: var(--td-bg-color-container-hover); }
}

.edStage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: var(--ed-radius);
  background: var(--td-bg-color-secondarycontainer);
}

/* ───── 时间线 ───── */
.edSplit {
  flex: none;
  height: 10px;
  display: grid;
  place-items: center;
  cursor: row-resize;
  span { width: 44px; height: 4px; border-radius: 999px; background: var(--td-border-level-2-color); transition: background .16s ease; }
  &:hover span { background: var(--td-brand-color); }
}
.edTimeline {
  flex: none;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: var(--ed-radius);
  overflow: hidden;
}
.videoTrack { flex: 1; min-height: 0; height: auto; }

/* 选区（工作区）条 */
.edRange {
  flex: none;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  background: var(--td-bg-color-secondarycontainer);
  border-bottom: 1px solid var(--td-border-level-1-color);
}
.edRangeLabel { flex: none; font-size: 11px; font-weight: 600; color: var(--td-text-color-secondary); letter-spacing: .4px; }
.edRangeTrack {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 12px;
  border-radius: 999px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-border-level-1-color);
  cursor: crosshair;
}
.edRangeFill {
  position: absolute;
  top: -1px; bottom: -1px;
  min-width: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--td-brand-color) 34%, transparent);
  border: 1px solid var(--td-brand-color);
  cursor: grab;
  &:active { cursor: grabbing; }
}
.edRangeHandle {
  position: absolute;
  top: 50%;
  left: -5px;
  transform: translateY(-50%);
  width: 10px; height: 20px;
  padding: 0;
  border: 1px solid var(--td-brand-color);
  border-radius: 4px;
  background: var(--td-bg-color-container);
  cursor: ew-resize;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .12);
  &.isEnd { left: auto; right: -5px; }
}
.edRangeText {
  flex: none;
  min-width: 150px;
  text-align: right;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-secondary);
}
.edRangeBtn {
  flex: none;
  height: 20px;
  padding: 0 8px;
  font-size: 11px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-secondary);
  cursor: pointer;
  transition: all .16s ease;
  &:hover:not(:disabled) { color: var(--td-brand-color); border-color: var(--td-brand-color); }
  &:disabled { opacity: .38; cursor: not-allowed; }
}

/* ───── 空白态 ───── */
.edGuide {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--td-bg-color-container);
  z-index: 3;
}
.edGuideCard { max-width: 460px; text-align: center; padding: 8px 20px; }
.edGuideIcon {
  width: 64px; height: 64px; margin: 0 auto 14px;
  display: grid; place-items: center;
  border-radius: 20px;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}
.edGuideTitle { font-size: 16px; font-weight: 700; color: var(--td-text-color-primary); }
.edGuideText { margin-top: 8px; font-size: 12.5px; line-height: 1.75; color: var(--td-text-color-secondary); }
.edGuideActions { margin-top: 18px; display: flex; gap: 10px; justify-content: center; }

/* ───── 自动装配提示 ───── */
.edAutoNotice {
  position: absolute;
  left: 12px; bottom: 12px;
  z-index: 4;
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px;
  font-size: 12px;
  color: #047857;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 999px;
  box-shadow: 0 6px 18px rgba(4, 120, 87, .12);
  animation: edPop .24s ease-out;
}
.edAutoUndo {
  margin-left: 4px;
  border: 0; background: transparent;
  color: #047857; font-size: 12px; font-weight: 650;
  text-decoration: underline; cursor: pointer;
  &:hover { color: #065f46; }
}
@keyframes edPop {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ───── 导出 ───── */
.exportPanel {
  .exportModes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .exportMode {
    display: flex; flex-direction: column; gap: 5px;
    padding: 12px 14px;
    text-align: left;
    border: 1px solid var(--td-border-level-1-color);
    border-radius: 10px;
    background: var(--td-bg-color-container);
    cursor: pointer;
    transition: all .16s ease;
    b { font-size: 13.5px; color: var(--td-text-color-primary); }
    span { font-size: 11.5px; color: var(--td-text-color-secondary); font-variant-numeric: tabular-nums; }
    &:hover:not(:disabled) { border-color: var(--td-brand-color); }
    &.isOn {
      border-color: var(--td-brand-color);
      background: var(--td-brand-color-light);
      b { color: var(--td-brand-color); }
    }
    &:disabled { opacity: .5; cursor: not-allowed; }
  }
  .exportInfo {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    margin-top: 14px;
  }
  .exportInfoRow {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--td-bg-color-secondarycontainer);
    span { font-size: 12px; color: var(--td-text-color-secondary); }
    b { font-size: 13px; color: var(--td-text-color-primary); font-variant-numeric: tabular-nums; }
  }
  .exportHint { margin: 14px 0 0; font-size: 12px; line-height: 1.7; color: var(--td-text-color-placeholder); }
  .exportActions { margin-top: 18px; display: flex; align-items: center; gap: 8px; }
  .exportSpacer { flex: 1; }

  .exportRunning { padding: 6px 0 2px; }
  .exportRunningHead {
    display: flex; align-items: center; gap: 9px;
    margin-bottom: 12px;
  }
  .exportRunningLabel { flex: 1; min-width: 0; font-size: 13px; color: var(--td-text-color-primary); }
  .exportRunningPct { font-size: 13px; color: var(--td-brand-color); font-variant-numeric: tabular-nums; }
  .exportBar {
    height: 6px; border-radius: 999px; overflow: hidden;
    background: var(--td-bg-color-secondarycontainer);
    span {
      display: block; height: 100%;
      background: var(--td-brand-color);
      border-radius: 999px;
      transition: width .2s linear;
    }
  }
}

/* 面板内子组件撑满 */
.edSide :deep(.mediaLibrary),
.edSide :deep(.propertyPanel) {
  height: 100%;
}

:deep(.video-track) {
  --color-primary: var(--td-text-color-primary);
  --color-bg-dark: var(--td-bg-color-component);
  --color-bg-medium: var(--td-bg-color-secondarycontainer);
  --color-text-primary: var(--td-text-color-primary);
  .ruler {
    background-color: var(--td-bg-color-container);
    .ruler__placeholder { background-color: var(--td-bg-color-secondarycontainer); }
  }
  .track-control { background-color: var(--td-bg-color-container); }
  .tools-bar { background-color: var(--td-bg-color-container); }
  .tools-bar__time { background-color: var(--td-bg-color-secondarycontainer); }
  .tools-bar__btn {
    background-color: var(--td-brand-color-active);
    &:hover { background-color: var(--td-bg-color-container-hover); box-shadow: none; }
  }
  .tracks__scrollbar { background-color: var(--td-bg-color-container); }
}
:deep(.tools-bar__select) { display: none !important; }
</style>
