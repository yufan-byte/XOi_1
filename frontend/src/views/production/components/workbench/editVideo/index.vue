<template>
  <div class="editor" :class="{ 'is-standalone': isStandalone }" @keydown="onControlKeydown">
    <!-- ─────────────── 顶栏 ─────────────── -->
    <header class="edTop">
      <div class="edTopLeft">
        <span class="editorMark"><i-cutting-one size="19" /></span>
        <div class="edMeta"><div class="edNameRow"><strong class="edName">{{ isStandalone ? '独立剪辑' : '剪辑成片' }}</strong><span class="editorProjectName">{{ isStandalone ? (scriptName || '本机素材与草稿') : episodeLabel }}</span></div><div class="edSub"><span>{{ timelineClipCount }} 个片段 · {{ formatDuration(fullDuration) }}</span><span v-if="!isStandalone" class="editorProjectHint">{{ project?.name }}</span></div></div>
        <span class="headerDivider" />
        <button type="button" class="edGhost" :disabled="!historyStore.canUndo || isReassembling || isExporting" aria-label="撤销" title="撤销" @click="historyStore.undo()"><i-undo size="17" /></button>
        <button type="button" class="edGhost" :disabled="!historyStore.canRedo || isReassembling || isExporting" aria-label="重做" title="重做" @click="historyStore.redo()"><i-redo size="17" /></button>
      </div>
      <div class="edTopRight">
        <div class="edSave" :class="`is-${saveState}`" role="status" :title="saveText"><span class="dot" />{{ editorLoading ? '正在载入…' : saveText }}</div>
        <details ref="editorMore" class="editorMore"><summary aria-label="更多剪辑操作">···</summary><div class="editorMoreMenu">
          <button v-if="!isStandalone && shots.length" type="button" :disabled="isReassembling || isExporting" @click="closeMore(); confirmReassemble()">按当前分镜重新装配…</button>
          <button v-if="localTimelineBackup" type="button" @click="closeMore(); openTimelineBackup()">查看本机未同步副本</button>
          <button type="button" @click="closeMore(); shortcutsOpen = true">查看快捷键</button>
        </div></details>
        <button type="button" class="editorExport" :disabled="editorLoading || !timelineClipCount || isExporting || isReassembling" @click="exportDialogVisible = true"><i-export size="15" />{{ isExporting ? '正在导出…' : '导出成片' }}</button>
        <span class="headerDivider" />
        <button type="button" class="editorClose" aria-label="关闭剪辑台" :title="isExporting ? '请完成或取消导出后关闭' : '关闭剪辑台，返回原工作区'" :disabled="isExporting || isReassembling" @click="goBack"><i-close size="20" /></button>
      </div>
    </header>
    <!-- ─────────────── 主体 ─────────────── -->
    <div class="edBody" :inert="isReassembling" :class="{ 'is-guide': showEmptyGuide }">
      <!-- 上部：镜头库 · 预览 · 属性 -->
      <div class="editorWorkspaceBar">
        <div><button type="button" :class="{ active: !leftCollapsed }" :aria-pressed="!leftCollapsed" @click="leftCollapsed = !leftCollapsed"><i-folder-open size="14" />素材库</button><span class="workspaceHint">{{ selectedClipLabel || '选择片段，拖动边缘裁剪或在播放头处分割' }}</span></div>
        <button type="button" :class="{ active: !rightCollapsed }" :aria-pressed="!rightCollapsed" @click="toggleInspector"><i-setting-config size="14" />片段设置</button>
      </div>
      <div class="edUpper">
        <aside v-show="!leftCollapsed" class="edSide edSideLeft"><mediaLibrary ref="mediaLibraryRef" :initial-video-items="libraryVideoItems" :initial-media-items="initialMediaItems" :initial-audio-items="initialAudioItems" :initial-image-items="initialImageItems" @pick="handlePickMedia" /></aside>
        <section class="edStage" :class="{ 'is-expanded': expandedPreview }" ref="previewWrapperRef" @dblclick="togglePreview">
          <span class="previewContext">成片预览 <i>·</i> {{ isStandalone ? replicateRatio : project?.videoRatio || '16:9' }}</span>
          <div class="previewStageActions"><button type="button" aria-label="上一个剪辑点" title="上一个剪辑点" :disabled="!timelineClipCount" @click.stop="jumpEditPoint(-1)">‹</button><button type="button" aria-label="下一个剪辑点" title="下一个剪辑点" :disabled="!timelineClipCount" @click.stop="jumpEditPoint(1)">›</button><button type="button" class="previewExpand" @click.stop="togglePreview" :aria-label="expandedPreview ? '退出大屏预览' : '放大成片预览'">{{ expandedPreview ? '退出大屏 · Esc' : '⛶' }}</button></div>
          <videoPreview ref="videoPreviewRef" :canvas-width="canvasWidth" :canvas-height="canvasHeight" :style="previewStyle" />
          <div v-if="showEmptyGuide" class="edPreviewEmpty"><span class="emptyCutMark"><i-film size="29" /></span><strong>从一个片段开始</strong><p>{{ isStandalone ? '导入视频、图片或音乐，把它们加入下方时间线。' : '使用本集分镜视频，或从电脑导入自己的素材。' }}</p><div class="emptyEditorActions"><button v-if="!isStandalone && shots.some(shot => shot.selectedVideoUrl || shot.videos.length)" type="button" class="primary" :disabled="isReassembling || editorLoading" @click="reassemble">{{ isReassembling ? '正在装配…' : '按分镜顺序加入视频' }}</button><button type="button" @click="openLocalFiles">导入素材</button></div><small>已有剪辑会自动恢复，关闭时保留草稿。</small></div>
        </section>
        <aside v-show="!rightCollapsed" class="edSide edSideRight"><propertyPanel /></aside>
      </div>
      <!-- 时间线高度拖拽条 -->
      <div class="edSplit" role="separator" aria-label="调整时间线高度" aria-orientation="horizontal" :aria-valuemin="timelineLimits.min" :aria-valuemax="timelineLimits.max" :aria-valuenow="timelineHeight" tabindex="0" @pointerdown="onSplitDown" @keydown.up.prevent="resizeTimeline(20)" @keydown.down.prevent="resizeTimeline(-20)"><span /></div>

      <!-- 下部：时间线 -->
      <div ref="timelineElement" class="edTimeline" :style="{ height: timelineHeight + 'px' }">
        <div v-if="missingSelectedShots && !showEmptyGuide" class="edMissingShots">{{ missingSelectedShots }} 段分镜视频尚未入轨 <span>当前剪辑保留，可从素材库加入。</span><button type="button" @click="leftCollapsed = false">查看素材 →</button></div>
        <!-- 选区（工作区）条：导出「选区」用的就是它。独立像素映射，不受时间线缩放/滚动影响 -->
        <div v-if="rangeOpen" class="edRange" title="拖拽拉选区间；快捷键 I 设起点、O 设终点、Esc 清除">
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
          <template #scale-append>
            <button type="button" class="timelineTextButton" :class="{ active: rangeOpen }" :aria-pressed="rangeOpen" @click="rangeOpen = !rangeOpen">选区 <small v-if="hasRange">已设置</small></button>
            <button type="button" class="timelineTextButton" :disabled="!fullDuration" title="让整条成片完整显示在时间线中" @click="fitTimeline">适应全片</button>
            <div class="editorZoomControl">
              <button type="button" aria-label="缩小时间线" :disabled="scaleStore.scale <= scaleStore.minScale" @click="scaleStore.zoomOut(.1)">−</button>
              <input type="range" aria-label="时间线缩放" :min="scaleStore.minScale" :max="scaleStore.maxScale" step="0.01" :value="scaleStore.scale" @input="scaleStore.setScale(Number(($event.target as HTMLInputElement).value))" />
              <span>{{ Math.round(scaleStore.scale * 100) }}%</span>
              <button type="button" aria-label="放大时间线" :disabled="scaleStore.scale >= scaleStore.maxScale" @click="scaleStore.zoomIn(.1)">+</button>
            </div>
          </template>
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
              :disabled="!canSplit || isExporting"
              @click="handleSplit"
              :title="$t('workbench.production.editVideo.split')">
              <template #icon><i-cutting-one size="16" /></template>
              {{ $t("workbench.production.editVideo.split") }}
            </t-button>
          </template>
          <template #custom-operation-delete>
            <t-button variant="text" size="small" :disabled="!tracksStore.selectedClipIds.size || isExporting" @click="handleDeleteClips" :title="$t('workbench.production.editVideo.delete')">
              <template #icon><i-delete size="16" /></template>
              {{ $t("workbench.production.editVideo.delete") }}
            </t-button>
          </template>
        </VideoTrack>

        <div v-if="showEmptyGuide" class="edTimelineHint">
          <span>{{ emptyGuideTitle }} · 单击左侧素材即可加入时间线</span>
          <button v-if="isStandalone" type="button" @click="openLocalFiles">导入素材 →</button>
          <button v-else-if="noProject" type="button" @click="router.push('/project')">选择项目 →</button>
          <button v-else type="button" @click="goStoryboard">查看分镜 →</button>
        </div>

        <!-- 自动装配后的提示条（可撤销） -->
        <div v-if="autoLayoutNotice" class="edAutoNotice">
          <i-check-circle theme="filled" size="15" />
          <span>{{ autoLayoutNotice }}</span>
          <button class="edAutoUndo" @click="undoAutoLayout">撤销自动编排</button>
        </div>
      </div>
    </div>

    <t-dialog v-if="shortcutsOpen" v-model:visible="shortcutsOpen" header="剪辑快捷键" width="420px" :footer="false" attach="body"><div class="editorShortcuts"><p><span>播放 / 暂停</span><kbd>Space</kbd></p><p><span>保存草稿</span><kbd>⌘ / Ctrl + S</kbd></p><p><span>设置选区起点 / 终点</span><kbd>I / O</kbd></p><p><span>清除选区 / 退出大屏预览</span><kbd>Esc</kbd></p><p><span>缩放时间线</span><small>滚轮 / 双指捏合</small></p><p><span>平移时间线</span><small>双指横滑 / Shift + 滚轮</small></p></div></t-dialog>
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
            合成在浏览器本地完成（WebCodecs），{{ isStandalone ? '导完下载到本机，不写入其他剧本项目。' : '导完自动下载并归档到项目资产库的「成片」节点。' }}<br />
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
import { editorProductionReturn } from "../../../utils/studioWorkflow";
import { sessionUserId } from "@/utils/session";
import {accountBoundary} from "@/utils/accountBoundary";
import { provide } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import axios from "@/utils/axios";
import mediaLibrary from "./mediaLibrary.vue";
import videoPreview from "./videoPreview.vue";
import { timelineWheel } from "@/utils/editorGestures";
import { requestedClipDuration, missingShotCount } from '@/utils/timelineAssembly';
import propertyPanel from "./propertyPanel.vue";
import { useLocalStorage, useWindowSize } from "@vueuse/core";
import { editorTimelineSize, fitEditorScale, adjacentEditPoint, canSplitEditorClip, editorDraftSerializer } from "@/utils/editorWorkspace";
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
import { MessagePlugin } from "tdesign-vue-next";
import { loadDraft as loadReplicateDraft } from "@/views/viralReplicate/storage";
import { getCloudDocument, saveCloudDocument, assertWorkspaceOwner } from "@/utils/workspace";

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
const isStandalone = computed(() => route.query.mode === "standalone");
const replicateRatio = ref("16:9");

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
  const ratio = isStandalone.value ? replicateRatio.value : project.value?.videoRatio;
  if (ratio === "1:1") return { w: 1080, h: 1080 };
  if (ratio === "9:16") return { w: 1080, h: 1920 };
  return { w: 1920, h: 1080 };
});
const aspectRatio = computed(() => canvasWidth.value / canvasHeight.value);

// ─────────────────────── 三区布局状态 ───────────────────────
const leftCollapsed = ref(typeof window !== "undefined" && window.innerWidth < 900);
const rightCollapsed = ref(true);
let inspectorPinnedClosed = false;
const { height: viewportHeight } = useWindowSize();
const timelineLimits = computed(() => editorTimelineSize(viewportHeight.value));
const timelineHeight = ref(editorTimelineSize(window.innerHeight).value);
watch(viewportHeight, height => { timelineHeight.value = editorTimelineSize(height, timelineHeight.value).value; });
function resizeTimeline(delta: number) { timelineHeight.value = editorTimelineSize(viewportHeight.value, timelineHeight.value + delta).value; }
const editorLoading = ref(true), shortcutsOpen = ref(false), rangeOpen = ref(false);
const editorMore = ref<HTMLDetailsElement>();
function closeMore() { if (editorMore.value) editorMore.value.open = false; }
function toggleInspector() { rightCollapsed.value = !rightCollapsed.value; inspectorPinnedClosed = rightCollapsed.value; }
let stopSplitDrag: (() => void) | undefined;

let splitDragging = false;
function onSplitDown(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  stopSplitDrag?.();
  splitDragging = true;
  const startY = e.clientY;
  const startH = timelineHeight.value;
  const onMove = (ev: PointerEvent) => {
    if (!splitDragging) return;
    const next = startH - (ev.clientY - startY);
    timelineHeight.value = editorTimelineSize(viewportHeight.value, next).value;
  };
  const onUp = () => {
    splitDragging = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    stopSplitDrag = undefined;
  };
  stopSplitDrag = onUp;
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

// 预览自适应尺寸
const previewWrapperRef = ref<HTMLElement>();
const expandedPreview = ref(false);
async function togglePreview() {
  if (expandedPreview.value) {
    if (document.fullscreenElement === previewWrapperRef.value) await document.exitFullscreen().catch(() => {});
    expandedPreview.value = false;
    return;
  }
  expandedPreview.value = true;
  await previewWrapperRef.value?.requestFullscreen?.().catch(() => {});
  await nextTick();
  if (previewWrapperRef.value) {
    wrapperSize.width = previewWrapperRef.value.clientWidth;
    wrapperSize.height = previewWrapperRef.value.clientHeight;
  }
}
function previewFullscreenChanged() { if (!document.fullscreenElement) expandedPreview.value = false; }
function previewEscape(e: KeyboardEvent) { if (e.key === 'Escape') expandedPreview.value = false; }
const wrapperSize = reactive({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | null = null;
const previewStyle = computed(() => {
  const { width: cw, height: ch } = wrapperSize;
  if (cw <= 0 || ch <= 0) return {};
  const ratio = aspectRatio.value;
  const pad = 16;
  const availW = Math.max(cw - pad, 0);
  const controls = 36;
  const availH = Math.max(ch - pad - controls, 0);
  if (availW / availH > ratio) return { height: (availH + controls) + "px", width: Math.floor(availH * ratio) + "px" };
  return { width: availW + "px", height: (Math.floor(availW / ratio) + controls) + "px" };
});

// ─────────────────────── store ───────────────────────
const tracksStore = useTracksStore();
const playbackStore = usePlaybackStore();
const historyStore = useHistoryStore();
const scaleStore = useScaleStore();
const selectedClipLabel = computed(() => tracksStore.selectedClips.length === 1 ? tracksStore.selectedClips[0]?.name || '当前片段' : tracksStore.selectedClipIds.size ? `已选 ${tracksStore.selectedClipIds.size} 个片段` : '');
const canSplit = computed(() => tracksStore.selectedClips.some(clip => canSplitEditorClip(clip, playbackStore.currentTime)));
watch(() => [...tracksStore.selectedClipIds], ids => { if (ids.length === 1 && !inspectorPinnedClosed) rightCollapsed.value = false; });
function jumpEditPoint(direction: -1 | 1) { playbackStore.pause(); playbackStore.seekTo(adjacentEditPoint(tracksStore.tracks.flatMap(track => track.clips.filter(clip => clip.type !== 'transition')), playbackStore.currentTime, direction)); }
function fitTimeline() {
  const area = timelineElement.value?.querySelector('.track-area') as HTMLElement | null;
  const value = fitEditorScale(fullDuration.value, area?.clientWidth || (timelineElement.value?.clientWidth || 0) - 180, scaleStore.pixelsPerSecond, scaleStore.minScale, scaleStore.maxScale);
  if (value === null) return;
  scaleStore.setScale(value);
  if (area) area.scrollLeft = 0;
}

const editorOwner = sessionUserId();
const editorScope = accountBoundary.capture();
const draftKey = computed(() => {
  if (isStandalone.value) return `xoi:${editorOwner}:timeline-draft:standalone:${String(route.query.draft || "default")}`;
  return `xoi:${editorOwner}:timeline-draft:${projectId.value || "project"}:${scriptId.value || "episode"}`;
});
const timelineDraft = useLocalStorage<Track[] | null>(draftKey, null, { serializer: editorDraftSerializer });
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
let timelineRevision = 0, timelineQueue = Promise.resolve(), cloudAvailable = true;
const timelineSaveMessage = ref("");
const localTimelineBackup = ref<Track[] | null>(null);
let currentTimelineId = "";
let timelineSaveSequence = 0;
async function timelineId() {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(draftKey.value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function restoreCloudTimeline() {
  timelineRevision = 0;
  try {
    currentTimelineId = await timelineId();
    const meta = JSON.parse(localStorage.getItem(`${draftKey.value}:sync`) || "null");
    localTimelineBackup.value = JSON.parse(localStorage.getItem(`${draftKey.value}:unsynced-backup`) || "null");
    // A viral legacy key includes a verified owner; never auto-import an unscoped legacy draft.
    if (!timelineDraft.value && route.query.viralDraft) timelineDraft.value = JSON.parse(localStorage.getItem(`xoi:timeline-draft:standalone:viral-${editorOwner}-${route.query.viralDraft}`) || "null");
    const saved = await getCloudDocument<{ tracks: Track[]; ratio: string; name: string; shots?: Shot[] }>(editorOwner, "timeline", currentTimelineId);
    accountBoundary.assert(editorScope);
    if (saved) {
      timelineRevision = saved.revision;
      if (meta?.pending && meta.revision === saved.revision && timelineDraft.value) { timelineSaveMessage.value = "本机有未同步编辑 · 自动保存后可跨设备继续"; return; }
      if (meta?.pending && timelineDraft.value) {
        localTimelineBackup.value = JSON.parse(JSON.stringify(timelineDraft.value));
        localStorage.setItem(`${draftKey.value}:unsynced-backup`, JSON.stringify(localTimelineBackup.value));
      }
      timelineDraft.value = saved.payload.tracks;
      localStorage.setItem(`${draftKey.value}:sync`, JSON.stringify({ revision: saved.revision, pending: false }));
      if (isStandalone.value) { replicateRatio.value = saved.payload.ratio || "16:9"; scriptName.value = saved.payload.name; if (!shots.value.length && saved.payload.shots) shots.value = saved.payload.shots; }
      timelineSaveMessage.value = "已恢复云端剪辑草稿";
    }
  } catch { cloudAvailable = false; timelineSaveMessage.value = "云端不可用 · 本机草稿保留，暂不覆盖云端"; }
}
function openTimelineBackup() {
  if (!localTimelineBackup.value) return;
  cloudAvailable = false; ready = false;
  tracksStore.reset(); localTimelineBackup.value.forEach(track => tracksStore.addTrack(JSON.parse(JSON.stringify(track))));
  timelineDraft.value = JSON.parse(JSON.stringify(localTimelineBackup.value));
  ready = true; timelineSaveMessage.value = "正在查看本机未同步副本 · 可导出，不覆盖云端";
}

const saveState = ref<"saved" | "saving" | "idle">("idle");
const saveText = computed(() => saveState.value === "saving" ? "保存中…" : timelineSaveMessage.value || "自动保存剪辑草稿");

const videoPreviewRef = ref<InstanceType<typeof videoPreview>>();
const videoTrackRef = ref();
const mediaLibraryRef = ref<InstanceType<typeof mediaLibrary>>();
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
watch(fullDuration, seconds => playbackStore.setDuration(seconds), { flush: 'post' });

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

/** 空状态只看时间线是否为空；没有 AI 分镜视频不代表不能独立剪辑。 */
const noProject = computed(() => !isStandalone.value && projectId.value <= 0);
const timelineClipCount = computed(() => tracksStore.tracks.reduce((n, t) => n + t.clips.filter((c) => c.type !== "transition").length, 0));
const showEmptyGuide = computed(() => noProject.value || timelineClipCount.value === 0);
const emptyGuideTitle = computed(() => {
  if (isStandalone.value) return "导入素材，开始独立剪辑";
  return noProject.value ? "先选择一个项目" : "从任意素材开始剪辑";
});

function openLocalFiles() {
  leftCollapsed.value = false;
  mediaLibraryRef.value?.openFilePicker();
}

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
  if (isStandalone.value) {
    scriptId.value = 0;
    scriptName.value = "";
    return;
  }
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
  if (isStandalone.value) {
    shots.value = [];
    return;
  }
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
  if (isStandalone.value) {
    initialMediaItems.value = [
      {
        id: "video-xoi-ending",
        type: "video",
        name: "XOi片尾.mp4",
        duration: 0,
        icon: "i-video",
        color: "linear-gradient(135deg, #2d2a28 0%, #68574d 100%)",
        url: "/assets/ending.mp4",
        loading: true,
      },
    ];
    initialAudioItems.value = [];
    initialImageItems.value = [];
    return;
  }
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
      name: Number(item.id) === 0 ? "XOi片尾.mp4" : item.name,
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
    backgroundColor: "#bba188",
    borderColor: "#9d8068",
    height: 60,
    selected: { borderColor: "#c2683d", boxShadow: "0 0 0 2px rgba(194,104,61,.2)" },
  },
  audio: {
    backgroundColor: "#829e93",
    height: 36,
    selected: { borderColor: "#4ecdc4" },
  },
  image: {
    backgroundColor: "#9eaeba",
    borderColor: "#43e97b",
    height: 60,
    selected: { borderColor: "#c2683d", boxShadow: "0 0 0 2px rgba(194,104,61,.2)" },
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
      name: "主视频轨",
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
const isReassembling = ref(false);
const missingSelectedShots = computed(() => missingShotCount(shots.value.map(s => s.selectedVideoUrl || s.videos[0]?.url || ''), tracksStore.tracks.flatMap(t => t.clips.filter(c => c.type === 'video').map(c => (c as any).sourceUrl || ''))));
function confirmReassemble() {
  const dialog = DialogPlugin.confirm({
    header: '按当前分镜重新装配？',
    body: '将先保存一份云端备份，再用当前选用视频替换主视频轨。其他轨道保留，可撤销；不会重新生成视频，不扣积分。',
    confirmBtn: '备份并重新装配', cancelBtn: '保留当前剪辑',
    onConfirm: async () => { dialog.destroy(); await reassemble(); },
    onCancel: () => dialog.destroy(),
  });
}
async function reassemble() {
  if (isReassembling.value || isStandalone.value) return;
  isReassembling.value = true;
  const previousReady = ready;
  let before: Track[] | undefined;
  ready = false;
  try {
    if (!cloudAvailable) throw new Error('请先恢复云端连接，再备份并重新装配');
    if (draftSaveTimer) { clearTimeout(draftSaveTimer); draftSaveTimer = null; }
    await timelineQueue;
    const backupId = `${currentTimelineId || await timelineId()}.backup.${Date.now()}`;
    const tracks = JSON.parse(JSON.stringify(tracksStore.tracks));
    before = tracks;
    const portable = tracks.map((t: any) => ({ ...t, clips: t.clips.map(({ thumbnails, waveformData, ...c }: any) => c) }));
    await saveCloudDocument(editorOwner, 'timeline', backupId, 0, `[装配前备份]${scriptName.value}`, { tracks: portable, ratio: project.value?.videoRatio, name: scriptName.value, sourceTimeline: currentTimelineId });
    await autoLayout(true);
    ready = previousReady;
    persistTimeline();
    window.$message.success('已按分镜重新装配，原剪辑已备份到云端，可撤销');
  } catch (e: any) {
    if (before) tracksStore.setTracks(before);
    window.$message.error(e?.message || '未能重新装配，原草稿保留');
  }
  finally { ready = previousReady; isReassembling.value = false; }
}
async function autoLayout(force = false) {
  const main = ensureMainTrack();
  if (force && main?.locked) throw new Error('主视频轨已锁定，请先解锁再重新装配');
  if (!main || (!force && main.clips.length > 0)) return;
  if (!force && timelineDraft.value) return; // 有草稿：用户的编排优先

  const usable = (shots.value.length ? shots.value : []).filter((s) => s.selectedVideoUrl || s.videos?.length);
  if (!usable.length) return;

  // 先并行量真实时长，再顺序落轨（顺序落轨才能保证无空隙）
  const durations = await Promise.all(
    usable.map((shot) => probeDuration(shot.selectedVideoUrl || shot.videos[0]?.url || "")),
  );

  preAutoTracks = JSON.parse(JSON.stringify(tracksStore.tracks));
  if (force) tracksStore.removeClips(main.clips.map(c => c.id));

  let cursor = 0;
  usable.forEach((shot, i) => {
    const url = shot.selectedVideoUrl || shot.videos[0]?.url;
    const duration = requestedClipDuration(shot.duration, durations[i]);
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

  playbackStore.setDuration(fullDuration.value);
  playbackStore.seekTo(0);
  historyStore.initialize();
  if (force) clearRange();
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
  playbackStore.setDuration(fullDuration.value);
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
  playbackStore.setDuration(fullDuration.value);
  historyStore.initialize();
  await loadInitialAudioWaveforms(tracksStore);
  ready = true;
}

async function reload() {
  if (isStandalone.value) {
    autoLayoutNotice.value = "";
    await initializeTracks();
    return;
  }
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
  draftSaveTimer = setTimeout(persistTimeline, 600);
}
function persistTimeline() {
    if(!accountBoundary.current(editorScope))return;
    if (!ready) return;
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    const localKey = draftKey.value, documentId = currentTimelineId;
    const sequence = ++timelineSaveSequence;
    const payload = { tracks: JSON.parse(JSON.stringify(tracksStore.tracks)), ratio: isStandalone.value ? replicateRatio.value : project.value?.videoRatio, name: scriptName.value, shots: isStandalone.value ? JSON.parse(JSON.stringify(shots.value)) : undefined };
    timelineDraft.value = payload.tracks;
    let localSaved = true;
    try {
      localStorage.setItem(localKey, JSON.stringify(payload.tracks)); // Synchronous checkpoint before pagehide/navigation.
      localStorage.setItem(`${localKey}:sync`, JSON.stringify({ revision: timelineRevision, pending: true }));
    } catch {
      localSaved = false;
      timelineSaveMessage.value = "本机缓存空间不足，正在尝试云端保存";
    }
    timelineQueue = timelineQueue.catch(() => {}).then(async () => {
      accountBoundary.assert(editorScope);
      if (sequence !== timelineSaveSequence) return; // Coalesce stale autosaves while a previous network write is in flight.
      assertWorkspaceOwner(editorOwner);
      if (!cloudAvailable) throw new Error("云端尚未读取成功，本机修改保留；请联网后重新打开并核对");
      // Thumbnails and waveforms are regenerated locally; do not upload these bulky preview caches.
      const portable = JSON.parse(JSON.stringify(payload, (key, value) => ["thumbnail", "thumbnails", "waveformData", "loading"].includes(key) ? undefined : value));
      if (/"blob:/i.test(JSON.stringify(portable))) throw new Error("本机素材尚未上传 · 草稿只保存在本机");
      const saved = await saveCloudDocument(editorOwner, "timeline", documentId, timelineRevision, payload.name || "剪辑草稿", portable);
      timelineRevision = saved.revision;
      if (sequence === timelineSaveSequence) { timelineSaveMessage.value = "已保存到云端"; saveState.value = "saved"; }
      if (sequence === timelineSaveSequence) {
        try { localStorage.setItem(`${localKey}:sync`, JSON.stringify({ revision: timelineRevision, pending: false })); }
        catch { /* The cloud commit is authoritative even if this device's cache is full. */ }
      }
    }).catch((error: any) => {
      timelineSaveMessage.value = error.response?.status === 409 ? (error.response?.data?.message || "其他设备已更新 · 本机修改保留，请核对") : error.message || "云端保存失败 · 本机修改保留";
      if (!localSaved) timelineSaveMessage.value = "云端与本机缓存均未保存成功 · 请勿关闭页面，先导出或重试";
      if (error.response?.status === 409) cloudAvailable = false;
      saveState.value = "idle";
    });
}
onBeforeRouteLeave(async () => { if (isExporting.value) { window.$message.warning('正在导出，请完成或取消导出后再关闭'); return false; } if (isReassembling.value) { window.$message.warning('正在备份并装配，请稍候再离开'); return false; } persistTimeline(); await Promise.race([timelineQueue, new Promise(resolve => setTimeout(resolve, 1000))]); ready = false; });

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
  let changed = false;
  selectedIds.forEach((id) => {
    const clip = tracksStore.getClip(id);
    if (!clip || !canSplitEditorClip(clip, currentTime)) return;
    tracksStore.splitClip(id, currentTime);
    changed = true;
  });
  if (changed) historyStore.pushSnapshot($t("workbench.production.editVideo.splitClip"));
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
  if (isReassembling.value || isExporting.value || editorLoading.value) return;
  if (item.type === 'transition') {
    const main = ensureMainTrack();
    if (main) handleDropTransition(item, main.id, playbackStore.currentTime);
    return;
  }
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
  // VideoTrack.reset() CLEARS tracks/history. Never use it to reset the viewport.
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

const timelineElement = ref<HTMLElement>();
let wheelFrame = 0;
let pendingScroll = 0;
function onTrackWheel(e: WheelEvent) {
  const area = (e.target as HTMLElement)?.closest('.track-area') as HTMLElement | null;
  if (!area) return;
  e.preventDefault();
  e.stopPropagation();
  const result = timelineWheel(e, scaleStore.scale, scaleStore.minScale, scaleStore.maxScale, wheelFrame ? pendingScroll : area.scrollLeft, Math.max(0, e.clientX - area.getBoundingClientRect().left));
  scaleStore.setScale(result.scale);
  pendingScroll = result.scroll;
  if (wheelFrame) cancelAnimationFrame(wheelFrame);
  wheelFrame = requestAnimationFrame(() => {
    area.scrollLeft = pendingScroll;
    area.dispatchEvent(new Event('scroll'));
    wheelFrame = 0;
  });
}

function initTrackInteractions() {
  nextTick(() => {
    timelineElement.value?.addEventListener("wheel", onTrackWheel, { passive: false, capture: true });
    const area = document.querySelector(".track-area") as HTMLElement | null;
    area?.addEventListener("mousedown", onTrackMouseDown);
    // Delegate once: tracks can be inserted/replaced after asynchronous cloud restore.
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
  if (!fullDuration.value) return;
  rangeOpen.value = true;
  const t = playbackStore.currentTime;
  rangeTouched.value = true;
  inPoint.value = Math.max(0, Math.min(t, outPoint.value - MIN_RANGE_GAP));
  window.$message.success(`入点已设为 ${fmtTime(inPoint.value)}`);
}

function setOutAtPlayhead() {
  if (!fullDuration.value) return;
  rangeOpen.value = true;
  const t = playbackStore.currentTime;
  rangeTouched.value = true;
  outPoint.value = Math.min(fullDuration.value, Math.max(t, inPoint.value + MIN_RANGE_GAP));
  window.$message.success(`出点已设为 ${fmtTime(outPoint.value)}`);
}

/** I / O / Esc：剪辑软件的老习惯，改区间不用去拖那条窄带 */
function onControlKeydown(event: KeyboardEvent) {
  // Let a focused button activate with Space instead of also starting timeline playback.
  if (event.code === 'Space' && (event.target as HTMLElement)?.closest('button, summary')) event.stopPropagation();
}
function onEditorKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!isReassembling.value) persistTimeline(); return; }
  if (isReassembling.value) return;
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey || isExporting.value || exportDialogVisible.value || shortcutsOpen.value) return;
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
const safeReturnTo = computed(() => {
  const raw = route.query.returnTo;
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "";
  const path = raw.split(/[?#]/, 1)[0];
  // 返回位置只接受站内已知入口，防止外部地址或再次跳进编辑器造成返回循环。
  return ["/project", "/novel", "/scriptAgent", "/script", "/cornerScape", "/production", "/assets", "/canvas", "/aiAssistant", "/director3d", "/square", "/viral-replicate"].includes(path) ? raw : "";
});
function goBack() {
  if (isStandalone.value) {
    router.push(safeReturnTo.value || "/project");
    return;
  }
  router.push(editorProductionReturn(route.query.returnTo, String(project.value?.id || route.query.projectId || ""), String(scriptId.value || route.query.episode || "")));
}
function goStoryboard() {
  if (isStandalone.value) return goBack();
  router.push({ path: "/production", query: { projectId: String(project.value?.id || route.query.projectId || ""), episode: String(scriptId.value || route.query.episode || ""), stage: "frames", view: "studio" } });
}

// ─────────────────────── 生命周期 ───────────────────────
onMounted(async () => {
  if (isStandalone.value && typeof route.query.viralDraft === "string") {
    try {
      const owner = localStorage.getItem("userId") || "";
      const draft = await loadReplicateDraft(owner, route.query.viralDraft);
      if (!draft || !draft.shots.length || draft.shots.some(s => !s.clip)) throw new Error("复刻片段未全部就绪，请返回复刻工作台");
      replicateRatio.value = draft.settings.ratio;
      shots.value = draft.shots.map((s, i) => ({ id: i + 1, index: i, prompt: s.scene, duration: s.seconds, thumb: s.board || "", selectedVideoUrl: s.clip!, videos: [{ id: i + 1, url: s.clip! }] }));
      scriptName.value = draft.title;
    } catch (error) { MessagePlugin.error(error instanceof Error ? error.message : "复刻任务读取失败"); }
  }
  if (!isStandalone.value) await resolveEpisode();
  // Standalone editing still needs the shared XOi ending in “本地视频”.
  // The public brand asset is referenced once and is never copied per user/project.
  await Promise.all([loadShots(), loadMaterials()]);
  await restoreCloudTimeline();
  await initializeTracks();
  if (timelineSaveMessage.value.startsWith("本机有未同步编辑")) scheduleDraftSave();
  editorLoading.value = false;
  initTrackInteractions();
  document.addEventListener('fullscreenchange', previewFullscreenChanged);
  window.addEventListener('keydown', previewEscape);
  window.addEventListener("pagehide", persistTimeline);
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
  stopSplitDrag?.();
  playbackStore.pause();
  resizeObserver?.disconnect();
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  window.removeEventListener("pagehide", persistTimeline);
  window.removeEventListener("keydown", onEditorKeydown);
  window.removeEventListener("pointermove", onRangeMove);
  window.removeEventListener("pointerup", onRangeUp);
  const area = document.querySelector(".track-area") as HTMLElement | null;
  area?.removeEventListener("mousedown", onTrackMouseDown);
  timelineElement.value?.removeEventListener("wheel", onTrackWheel, true);
  if (wheelFrame) cancelAnimationFrame(wheelFrame);
  document.removeEventListener('fullscreenchange', previewFullscreenChanged);
  window.removeEventListener('keydown', previewEscape);
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
  min-height: 66px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 18px;
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
.edNameRow { display: flex; align-items: center; gap: 8px; min-width: 0; }
.edName { font-size: 17px; font-weight: 720; color: var(--td-text-color-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
.edModePill {
  flex: none;
  padding: 2px 7px;
  border: 1px solid color-mix(in srgb, var(--td-brand-color) 24%, transparent);
  border-radius: 999px;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  font-size: 10px;
  font-weight: 650;
}
.edSub {
  display: flex; align-items: center; gap: 8px; margin-top: 2px;
  font-size: 11px; color: var(--td-text-color-placeholder);
  .edSep { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .6; }
  .edTime { font-variant-numeric: tabular-nums; }
}
.edTopRight { display: flex; align-items: center; gap: 6px; flex: none; }
.edImport {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 34px; padding: 0 12px; margin-right: 4px;
  border: 1px solid var(--td-border-level-1-color); border-radius: 8px;
  background: var(--td-bg-color-container); color: var(--td-text-color-primary);
  font-size: 12px; font-weight: 650; cursor: pointer;
  &:hover { border-color: var(--td-brand-color); color: var(--td-brand-color); }
}
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
.edSideLeft { width: clamp(205px, 21vw, 264px); }
.edSideRight { width: clamp(220px, 22vw, 280px); }

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
  position: relative;
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
.edStage:fullscreen, .edStage.is-expanded { position:fixed; inset:0; z-index:10000; border:0; border-radius:0; background:#151413; }
.previewExpand { position:absolute; right:12px; top:12px; z-index:5; padding:7px 11px; border:1px solid #ffffff35; border-radius:8px; background:#24201dc9; color:#fff; cursor:pointer; font-size:12px; }
.edGestureHint { color:#978a80; font-size:11px; padding:5px 14px; }
.edMissingShots { padding:6px 14px; background:#fff4e8; color:#a26b3d; font-size:12px; }
.editorZoomControl { display:flex; align-items:center; gap:10px; font-size:12px; color:#897466; }
.editorZoomControl button { width:30px; height:30px; border:1px solid #eaded5; border-radius:8px; background:#fff; color:#b75e37; cursor:pointer; }
.editorZoomControl button:disabled { opacity:.4; cursor:default; }
.editorZoomControl input { width:110px; accent-color:#c3683d; }.editorZoomControl span { min-width:42px; text-align:center; }
.editor :deep(.tools-bar__scale-control) { display:none; }
.editor :deep(.tools-bar__btn--play) { background:#c3683d; }
.edPreviewEmpty {
  position: absolute; inset: 0; z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: #f7f7f5; color: #a09c95; text-align: center;
  .edPreviewGlyph { display: grid; place-items: center; width: 64px; height: 64px; margin-bottom: 4px; border-radius: 18px; background: #fff; color: #f57443; box-shadow: 0 4px 20px rgba(30, 29, 27, .05); }
  strong { color: #363432; font-size: 15px; font-weight: 670; }
  span { max-width: 260px; padding: 0 12px; font-size: 12px; line-height: 1.6; }
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
.edTimelineHint {
  position: absolute; right: 18px; bottom: 20px; z-index: 15;
  display: flex; align-items: center; gap: 12px; max-width: calc(100% - 210px);
  padding: 9px 12px; border: 1px solid #e8e5e0; border-radius: 9px;
  background: rgba(255, 255, 255, .96); box-shadow: 0 5px 18px rgba(27, 27, 27, .06);
  color: #77736d; font-size: 12px;
  span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { flex: none; padding: 0; border: 0; background: transparent; color: #f57443; font: inherit; font-weight: 650; cursor: pointer; }
}

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
  min-width: 0;
  --color-primary: var(--td-text-color-primary);
  --color-bg-dark: #f6f5f2;
  --color-bg-medium: #eeede9;
  --color-bg-light: #f4f3f0;
  --color-border: #e0ded9;
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
  .tracks__scrollbar { background-color: #f5f4f1; }
  .tracks__track { background: #f6f5f2; }
  .tracks__track--hidden { opacity: 1; }
  .tracks__track--hidden .track-area { background: repeating-linear-gradient(135deg, #f3f2ef 0, #f3f2ef 12px, #eceae5 12px, #eceae5 13px); }
  .tracks__track--hidden .track-control__name::after { content: "已隐藏"; margin-left: 7px; color: #99948b; font-size: 10px; font-weight: 500; }
}
:deep(.tools-bar__select) { display: none !important; }
</style>

<style scoped lang="scss" src="./editorWorkspace.scss"></style>
