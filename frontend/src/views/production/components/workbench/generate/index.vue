<template>
  <div class="index">
    <div v-if="!trackList.length" class="emptyGenerate">
      <t-loading v-if="dataLoading" />
      <strong>{{ dataLoading ? "正在打开镜头…" : dataError ? "镜头暂时未能载入" : "从第一张分镜开始" }}</strong>
      <p>{{ dataError || (dataLoading ? "正在读取本集画面与视频版本" : "先生成分镜画面，镜头会自动出现在这里。") }}</p>
      <button v-if="dataError" type="button" class="dockTextButton" @click="getGenerateData">重新读取</button>
    </div>
    <div v-else class="productionWorkspace">
      <aside class="track">
        <newTrack
          v-model:activeTrackIndex="activeTrackIndex"
          v-model="trackList"
          :image-list="imageList"
          :storyboard-list="storyboardList"
          :track-labels="trackLabels"
          :modelParmas="modelParmas"
          :reference-allowance="referenceAllowance"
          :clampDuration="clampDuration"
          @change="trackChange"
          @getData="getGenerateData"
          @go-frames="emit('go-frames')"
          @importVideo="emit('importVideo')" />
      </aside>
      <main class="stageMain">
        <div class="studioMainInner">
          <videoCard
            v-if="currentTrack"
            :active-track-index="activeTrackIndex"
            :title="trackLabels[currentTrack.id]"
            :storyboard-image="continuityImageUrl(currentFrame?.src) || undefined"
            v-model:current-track="currentTrack"
            @refresh="getGenerateData"
            @versionChange="previewVersion = $event" />
          <div class="continuityRibbon" v-if="currentFrames.length">
            <div v-if="currentFrames.length > 1" class="frameChoices">
              <span>本片段画面</span>
              <button
                v-for="frame in currentFrames"
                :key="frame.id"
                type="button"
                :class="{ active: currentFrame?.id === frame.id }"
                @click="inspectedFrameId = frame.id">
                S{{ String(allFrames.findIndex((s) => s.id === frame.id) + 1).padStart(2, "0") }}
              </button>
            </div>
            <span class="continuityStatus">{{ continuityStatus }}</span>
            <button type="button" class="continuityLink" @click="openContinuity">
              <i-connection size="14" />
              检查空间与动作衔接
              <span>↗</span>
            </button>
            <div v-if="!productionAgentStore().flowData.reviewState?.tableApproved" class="reviewGate">
              <span>导演计划 / 分镜表尚待确认</span>
              <button type="button" @click="emit('go-review')">前往审核 →</button>
            </div>
          </div>
          <Teleport to="body" :disabled="!composerFullscreen">
            <div v-if="composerFullscreen" class="composerBackdrop" aria-hidden="true" @click="closeComposerFullscreen" />
            <section class="generationDock" :class="{ composerFullscreen }" aria-label="当前镜头生成台">
              <header v-if="!composerFullscreen" class="composerTitle">
                <div><span class="composerTitleIcon" aria-hidden="true">✦</span><span><strong>创作这个镜头</strong><small>描述画面如何运动，调整参考与生成设置</small></span></div>
                <span class="composerTitleShot">{{ currentTrack ? trackLabels[currentTrack.id] : "当前镜头" }}</span>
              </header>
              <div class="composerTopbar">
                <div class="inputMethod" aria-label="视频生成方式">
                  <button
                    v-for="item in modeList"
                    :key="item.value"
                    type="button"
                    :class="{ active: modelParmas.mode === item.value }"
                    :title="item.description"
                    @click="modeChange(item.value)">
                    <span aria-hidden="true">{{ item.glyph }}</span>
                    {{ item.label }}
                  </button>
                  <span v-if="!modeList.length" class="modeLoading">读取模型能力…</span>
                </div>
                <div class="composerIdentity">
                  <span>当前镜头</span>
                  <strong>{{ currentTrack ? trackLabels[currentTrack.id] : "—" }}</strong>
                  <button
                    type="button"
                    class="fullscreenToggle"
                    :aria-label="composerFullscreen ? '退出全屏创作' : '进入全屏创作'"
                    @click="toggleComposerFullscreen">
                    <span aria-hidden="true">{{ composerFullscreen ? "×" : "⛶" }}</span>
                    {{ composerFullscreen ? "退出全屏" : "全屏创作" }}
                  </button>
                </div>
              </div>
              <div class="composerBody">
                <div v-if="!isTextVideoMode(modelParmas.mode)" class="referenceTray" aria-label="本次参考素材">
                  <div
                    v-for="(item, i) in sentReferences.slice(0, 3)"
                    :key="`${item.sources}:${item.id}:${i}`"
                    class="referenceTile"
                    :title="referenceLabel(item)">
                    <img v-if="item.fileType === 'image'" :src="item.src" alt="本次参考缩略图" />
                    <video v-else-if="item.fileType === 'video'" :src="item.src" muted preload="metadata" />
                    <span v-else class="referenceAudio" aria-hidden="true">♫</span>
                    <span class="referenceTileLabel">{{ referenceLabel(item) }}</span>
                    <button type="button" :aria-label="`移除${referenceLabel(item)}`" @click="removeReference(i)">×</button>
                  </div>
                  <button type="button" class="referenceAdd" @click="openReferences">
                    <span aria-hidden="true">＋</span>
                    <small>{{ sentReferences.length ? "添加" : "参考素材" }}</small>
                  </button>
                  <button v-if="sentReferences.length > 3" type="button" class="referenceMore" @click="openReferences">
                    +{{ sentReferences.length - 3 }}
                  </button>
                </div>
                <div class="dockPrompt">
                  <label for="shot-prompt" class="dockLabel">
                    {{ isTextVideoMode(modelParmas.mode) ? "视频描述 · 场景、人物、动作与运镜" : "动作与运镜" }}
                  </label>
                  <textarea
                    v-if="currentTrack"
                    id="shot-prompt"
                    v-model="currentTrack.prompt"
                    rows="3"
                    placeholder="告诉 AI 这个镜头如何运动：人物动作、镜头调度、光线与氛围……"
                    @input="handlePromptInputEvent"
                    @blur="handlePromptBlur" />
                  <div class="promptMeta">
                    <span v-if="promptSaveStatus">{{ promptSaveStatus }}</span>
                    <span v-else>{{ modeHint }}</span>
                    <span v-if="currentTrack">{{ currentTrack.prompt?.length || 0 }} 字</span>
                  </div>
                </div>
              </div>
              <div v-if="!isTextVideoMode(modelParmas.mode)" class="referenceSummary">
                <span>{{ referenceLimitText }}</span>
                <span v-if="currentFrame?.continuity?.transition === 'continue'">已自动衔接上一镜末帧</span>
                <span v-if="currentFrame?.continuity?.anchorStoryboardId">已带入空间锚点</span>
                <strong v-if="referenceTrimmed">超出模型能力的素材不会提交</strong>
              </div>
              <footer class="composerToolbar">
                <modeMenu v-model="modelParmas" :modeOptions="modeOptions" :trackId="currentTrack?.id" @duration-change="updateTrackDuration" />
                <div class="composerActions">
                  <button
                    type="button"
                    class="assistAction"
                    :disabled="currentTrack?.state === '生成中'"
                    title="读取本镜分镜和参考素材，整理成可直接生成的视频提示词"
                    @click="genText">
                    <span aria-hidden="true">✦</span>
                    {{ currentTrack?.state === "生成中" ? "帮写中…" : "智能帮写" }}
                  </button>
                  <ModelCostHint
                    :model="modelParmas.model"
                    type="video"
                    :duration="modelParmas.duration"
                    :resolution="modelParmas.resolution"
                    :has-reference-video="sentReferences.some((i) => i.fileType === 'video')"
                    compact />
                  <button
                    type="button"
                    class="generateAction"
                    :aria-label="currentTrack?.videoList.length ? '再生成一版' : '生成视频'"
                    :title="currentTrack?.videoList.length ? '再生成一版' : '生成视频'"
                    :disabled="submittingVideo || !currentTrack?.prompt?.trim() || !modelParmas.model"
                    @click="generateVideo">
                    <t-loading v-if="submittingVideo" size="small" />
                    <span v-else aria-hidden="true">➜</span>
                  </button>
                </div>
              </footer>
            </section>
          </Teleport>
        </div>
      </main>
    </div>
    <t-dialog
      v-if="referencesOpen"
      v-model:visible="referencesOpen"
      header="本镜参考素材"
      :footer="false"
      width="min(880px, 94vw)"
      attach="body"
      :z-index="3100">
      <p class="referenceDialogHint">素材会保留在本镜草稿中；{{ referenceLimitText }}，提交时严格按当前模式和模型能力发送。</p>
      <imageSelect
        :key="currentTrack?.id"
        :mode="modelParmas.mode as VideoMode"
        :allowance="referenceAllowance"
        v-model="imageList"
        :storyboard-list="storyboardList" />
    </t-dialog>
    <ContinuityInspector
      v-model:visible="continuityOpen"
      :storyboard-id="currentFrame?.id"
      :current-video="previewVersion?.src ? { id: previewVersion.id, src: previewVersion.src } : undefined"
      :previous-video="previousAdoptedVideo"
      @saved="getGenerateData" />
  </div>
</template>

<script setup lang="ts">
import { storyboardTrackCode } from "../../../utils/studioWorkflow";
import type { Ref } from "vue";
import {
  compatibleStudioVideoMode,
  isTextVideoMode,
  studioVideoModeChoices,
  videoReferenceAllowance,
  videoReferenceItems,
  videoReferenceError,
} from "@/utils/studioVideoInput";
import { continuityImageUrl } from "@/utils/continuityAnalysis";
import ContinuityInspector from "../../ContinuityInspector.vue";
import ModelCostHint from "@/components/ModelCostHint.vue";
import { continuitySignature } from "../../../../../../../shared/shotContinuity";
import { accountBoundary } from "@/utils/accountBoundary";
import newTrack from "./components/track.vue";
import imageSelect from "./components/imageSelect.vue";
import modeMenu from "./components/modeMenu.vue";
import videoCard from "./components/video.vue";
import "@/views/production/components/workbench/type/type";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
import imageListCacheStore from "@/stores/imageListCache";

const emit = defineEmits<{ importVideo: []; "go-review": []; "go-frames": [] }>();
const editorOwner = accountBoundary.capture();
const referencesOpen = ref(false),
  continuityOpen = ref(false),
  composerFullscreen = ref(false),
  inspectedFrameId = ref<number>();
let bodyOverflowBeforeFullscreen = "";
let restoreFullscreenAfterReferences = false;
function closeComposerFullscreen() {
  composerFullscreen.value = false;
}
function toggleComposerFullscreen() {
  composerFullscreen.value = !composerFullscreen.value;
}
async function openReferences() {
  restoreFullscreenAfterReferences = composerFullscreen.value;
  if (composerFullscreen.value) {
    composerFullscreen.value = false;
    await nextTick();
  }
  referencesOpen.value = true;
}
function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && composerFullscreen.value) closeComposerFullscreen();
}
watch(referencesOpen, async (open, wasOpen) => {
  if (open || !wasOpen || !restoreFullscreenAfterReferences) return;
  restoreFullscreenAfterReferences = false;
  await nextTick();
  composerFullscreen.value = true;
});
watch(composerFullscreen, async (fullscreen) => {
  if (fullscreen) {
    bodyOverflowBeforeFullscreen = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  } else document.body.style.overflow = bodyOverflowBeforeFullscreen;
  await nextTick();
  document.querySelector<HTMLTextAreaElement>("#shot-prompt")?.focus({ preventScroll: true });
});
const previewVersion = ref<VideoItem>();
const allFrames = computed(() => productionAgentStore().flowData.storyboard || []);
const currentFrames = computed(() => allFrames.value.filter((s) => Number(s.trackId) === currentTrack.value?.id));
const trackLabels = computed(() =>
  Object.fromEntries(
    trackList.value.map((track, index) => {
      const frame = allFrames.value.find((s) => Number(s.trackId) === track.id);
      const assets = productionAgentStore().flowData.assets.flatMap((a) => [a, ...(a.derive || [])]);
      const scene = assets.find((a) => a.type === "scene" && (a.id === frame?.continuity?.sceneId || frame?.associateAssetsIds?.includes(a.id)));
      return [track.id, `${storyboardTrackCode(allFrames.value, track.id, index)}${scene ? ` · ${scene.name}` : ""}`];
    }),
  ),
);
function referenceLabel(item: UploadItem) {
  if (item.sources === "storyboard") return `分镜 ${typeof item.index === "number" ? "S" + String(item.index + 1).padStart(2, "0") : "首帧"}`;
  const asset = productionAgentStore()
    .flowData.assets.flatMap((a) => [a, ...(a.derive || [])])
    .find((a) => a.id === item.id);
  return asset?.name || (item.fileType === "audio" ? "声音参考" : item.fileType === "video" ? "视频参考" : "图片参考");
}
const referenceAllowance = computed(() => videoReferenceAllowance(modelParmas.value.mode, modeOptions.value.referenceLimits));
const sentReferences = computed(() => videoReferenceItems(modelParmas.value.mode, imageList.value, referenceAllowance.value));
const validDraftReferences = computed(() => videoReferenceItems(modelParmas.value.mode, imageList.value));
const referenceTrimmed = computed(() => validDraftReferences.value.length > sentReferences.value.length);
const activeMode = computed(() => modeList.value.find((item) => item.value === modelParmas.value.mode));
const modeHint = computed(() => activeMode.value?.description || (modelParmas.value.model ? "当前模型暂未声明可用方式" : "先选择视频模型"));
const referenceLimitText = computed(() => {
  const a = referenceAllowance.value;
  if (!a.total) return "当前方式不发送参考素材";
  const parts = [a.image ? `${a.image} 张图片` : "", a.video ? `${a.video} 段视频` : "", a.audio ? `${a.audio} 段音频` : ""].filter(Boolean);
  return `当前最多 ${parts.join("、")}`;
});
function removeReference(sentIndex: number) {
  const target = sentReferences.value[sentIndex];
  if (!target) return;
  const draftIndex = imageList.value.findIndex((item) => item === target || (item.id === target.id && item.sources === target.sources));
  if (draftIndex < 0) return;
  const next = [...imageList.value];
  if (["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(modelParmas.value.mode))
    next[draftIndex] = { fileType: "image", id: null, src: "", sources: "storyboard", index: draftIndex } as UploadItem;
  else next.splice(draftIndex, 1);
  imageList.value = next;
}
const currentFrame = computed(() => currentFrames.value.find((s) => s.id === inspectedFrameId.value) || currentFrames.value[0]);
const previousAdoptedVideo = computed(() => {
  const previousFrame = allFrames.value[allFrames.value.findIndex((s) => s.id === currentFrame.value?.id) - 1];
  if (!previousFrame || previousFrame.trackId === currentTrack.value?.id) return undefined;
  const t = trackList.value.find((t) => t.id === previousFrame.trackId);
  const v = t?.videoList.find((v) => v.id === t.selectVideoId && v.state === "已完成" && v.src);
  return v ? { id: v.id, src: v.src } : undefined;
});
const continuityStatus = computed(() => {
  const f = currentFrame.value,
    r = f?.continuity?.review;
  if (!r) return "尚未记录衔接检查";
  const previous = allFrames.value[allFrames.value.indexOf(f) - 1];
  const anchor = allFrames.value.find((s) => s.id === f.continuity?.anchorStoryboardId);
  const scene = productionAgentStore()
    .flowData.assets.flatMap((a) => [a, ...(a.derive || [])])
    .find((a) => a.id === f.continuity?.sceneId);
  const videos =
    r.kind === "video"
      ? [
          `${previousAdoptedVideo.value?.id}:${previousAdoptedVideo.value?.src || ""}`,
          `${previewVersion.value?.id}:${previewVersion.value?.src || ""}`,
        ]
      : undefined;
  if (r.sourceSignature !== continuitySignature(f, previous, anchor, videos, scene)) return "画面或版本变化，建议重新检查";
  return r.manual ? "已记录人工复核" : r.issues.length ? `${r.issues.length} 项待核对` : "AI 本次未检出明确问题";
});
function openContinuity() {
  if (!currentFrame.value) return window.$message.warning("本片段还没有关联分镜，请先到分镜台关联画面");
  continuityOpen.value = true;
}
const dirtyPrompts = new Map<number, string>();
let promptSaveTimer: ReturnType<typeof setTimeout> | undefined;
const promptSaveStatus = ref("");
function onPromptInput(value: string) {
  const t = currentTrack.value;
  if (!t) return;
  dirtyPrompts.set(t.id, value);
  promptSaveStatus.value = "正在保存…";
  clearTimeout(promptSaveTimer);
  promptSaveTimer = setTimeout(() => void persistPrompt(t.id).catch(() => {}), 650);
}
function handlePromptInputEvent(event: Event) {
  if (currentTrack.value) onPromptInput(currentTrack.value.prompt);
  const textarea = event.currentTarget as HTMLTextAreaElement;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`;
}
const promptWrites = new Map<number, Promise<void>>();
function persistPrompt(id: number): Promise<void> {
  const prior = promptWrites.get(id) || Promise.resolve();
  const task = prior
    .catch(() => {})
    .then(async () => {
      if (!dirtyPrompts.has(id)) return;
      accountBoundary.assert(editorOwner);
      const prompt = dirtyPrompts.get(id)!;
      try {
        await axios.post("/production/workbench/updateVideoPrompt", { id, prompt });
        if (dirtyPrompts.get(id) === prompt) dirtyPrompts.delete(id);
        promptSaveStatus.value = dirtyPrompts.size ? "有修改待保存" : "已保存";
      } catch (e) {
        promptSaveStatus.value = "保存失败，修改仍保留；点击输入区后重试";
        throw e;
      }
    });
  promptWrites.set(id, task);
  return task;
}
const { project } = storeToRefs(projectStore());
const episodesId = inject<Ref<number>>("episodesId")!;
const activeTrackIndex = ref(0);
let pendingStoryboardId: number | undefined;
async function selectStoryboard(id: number) {
  pendingStoryboardId = id;
  if (!dataLoading.value) await resolveStoryboardSelection();
}
async function resolveStoryboardSelection() {
  const id = pendingStoryboardId;
  if (!id) return;
  const frame = storyboardList.value.find((f) => f.id === id);
  if (!frame) return;
  pendingStoryboardId = undefined;
  if (!frame.trackId) {
    if (!Number(frame.duration) || !(frame.videoDesc || frame.prompt)?.trim())
      return window.$message.warning("这张分镜缺少描述或时长，请先补全信息再创建视频片段");
    try {
      await axios.post("/production/workbench/batchAddTracks", {
        projectId: project.value?.id,
        scriptId: episodesId.value,
        storyboardIds: [id],
        duration: Number(frame.duration) || 8,
      });
      await productionAgentStore().getFlowData();
      pendingStoryboardId = id;
      await getGenerateData();
    } catch (e: any) {
      window.$message.error(e.message || "创建视频片段失败");
    }
    return;
  }
  const i = trackList.value.findIndex((t) => t.id === Number(frame.trackId));
  if (i >= 0) {
    const old = activeTrackIndex.value;
    activeTrackIndex.value = i;
    trackChange(old);
  }
}
async function flushDrafts() {
  clearTimeout(promptSaveTimer);
  while (dirtyPrompts.size) await Promise.all([...dirtyPrompts.keys()].map((id) => persistPrompt(id)));
}
defineExpose({ selectStoryboard, flushDrafts });
const cacheStore = imageListCacheStore();
const { getCache, setCache, removeCache, initCacheFromTrackList, warmUpUrls } = cacheStore;
const { urlMap } = storeToRefs(cacheStore);

const modeOptions = ref<VideoModel>({
  name: "",
  modelName: "",
  durationResolutionMap: [],
  audio: false,
  type: "video",
  mode: [],
}); // 当前模型配置

const trackList = ref<TrackItem[]>([]); // 轨道列表

const modelParmas = ref<ModelSetting>({
  mode: "",
  model: "",
  resolution: "480p",
  duration: 8,
  audio: false,
});

const storyboardList = ref<StoryboardItem[]>([]); // 分镜列表

const imageList = computed({
  get(): UploadItem[] {
    // 触发对 urlMap 的依赖追踪，当 warmUpUrls 更新 urlMap 后自动重新计算
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    urlMap.value;
    const trackId = currentTrack.value?.id;
    const pid = project.value?.id;
    const sid = episodesId.value;
    // 优先从缓存读取
    if (pid != null && sid != null && trackId != null) {
      const cached = getCache(pid, sid, trackId);

      if (cached?.length) {
        return [...cached];
      }
    }
    const medias = currentTrack.value?.medias;
    if (!medias?.length) return [];
    return [...(medias as UploadItem[])];
  },
  set(val: UploadItem[]) {
    if (currentTrack.value) {
      currentTrack.value.medias = val as any;
      // 同步写入缓存
      const pid = project.value?.id;
      const sid = episodesId.value;
      const trackId = currentTrack.value.id;
      if (pid != null && sid != null && trackId != null) {
        setCache(pid, sid, trackId, val);
      }
    }
  },
});

function updateTrackDuration(id: number, duration: number) {
  const track = trackList.value.find((t) => t.id === id);
  if (track) track.duration = duration;
}
function modeChange(newVal: string) {
  if (newVal) modelParmas.value.mode = newVal;
  // Materials remain in the per-track draft; submission applies the selected mode's limits.
}
const modeList = computed(() => studioVideoModeChoices(modeOptions.value.mode || []));
const currentTrack = computed({
  get() {
    return trackList.value[activeTrackIndex.value];
  },
  set(val) {
    trackList.value[activeTrackIndex.value] = val;
  },
});

/** 将时长限制在模型支持的范围内 */
function clampDuration(trackDuration: number): number {
  const rows = modeOptions.value?.durationResolutionMap || [];
  const applicable = rows.filter((row) => !row.resolution?.length || row.resolution.includes(modelParmas.value.resolution));
  const choices = [...new Set((applicable.length ? applicable : rows).flatMap((row) => row.duration || []))].filter(Number.isFinite);
  const target = Number(trackDuration) || Number(modelParmas.value.duration) || 8;
  return choices.length ? choices.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a)) : target;
}

watch(
  () => modelParmas.value.model,
  async (val) => {
    if (!val) {
      modeOptions.value = {
        name: "",
        modelName: "",
        durationResolutionMap: [],
        audio: false,
        type: "video",
        mode: [],
      };
      modelParmas.value.mode = "";
      return;
    }
    try {
      const { data } = await axios.post("/modelSelect/getModelDetail", { modelId: val });
      if (modelParmas.value.model !== val) return;
      modeOptions.value = data;
      modelParmas.value.audio = data.audio === true || data.audio === "true" || data.audio == "optional";
      const drMap = data.durationResolutionMap;
      if (Array.isArray(drMap) && drMap.length > 0) {
        if (drMap[0].resolution?.length && !drMap.some((row: any) => row.resolution?.includes(modelParmas.value.resolution)))
          modelParmas.value.resolution = drMap[0].resolution[0];
        if (drMap[0].duration?.length) modelParmas.value.duration = clampDuration(modelParmas.value.duration);
      }

      const nextMode = compatibleStudioVideoMode(modelParmas.value.mode, studioVideoModeChoices(data.mode || []));
      if (nextMode !== modelParmas.value.mode) modeChange(nextMode);
    } catch (e: any) {
      window.$message.error(e.message || "模型能力读取失败");
    }
  },
);
/** uploadBox 作为 promptEditor 的引用预览 */
const references = computed(() => {
  function getFileTypeByExt(src: string | undefined): "image" | "video" | "audio" {
    if (!src) return "image";
    // 去掉 query 和 hash 部分
    const cleanSrc = src.split("?")[0].split("#")[0];
    const ext = cleanSrc.split(".").pop()?.toLowerCase() ?? "";

    if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
    return "image";
  }

  return imageList.value
    .filter((item) => item.src)
    .map((item) => ({
      type: getFileTypeByExt(item.src) as "image" | "video" | "audio" | "text",
      src: item.src ?? "",
    }));
});

const dataLoading = ref(true),
  dataError = ref("");
let dataRevision = 0;
async function getGenerateData() {
  const revision = ++dataRevision,
    scriptId = episodesId.value;
  dataLoading.value = true;
  dataError.value = "";
  try {
    const { data } = await axios.post("/production/workbench/getGenerateData", {
      projectId: project.value?.id,
      scriptId: episodesId.value ?? 0,
    });

    if (revision !== dataRevision || scriptId !== episodesId.value) return;
    storyboardList.value = data.storyboardList;
    data.trackList.forEach((track: TrackItem) => {
      if (dirtyPrompts.has(track.id)) track.prompt = dirtyPrompts.get(track.id)!;
    });
    // 优先使用本地缓存，没有缓存则用后端数据并写入缓存
    const pid = project.value?.id;
    const sid = episodesId.value;
    if (pid != null && sid != null) {
      // 先将没有缓存的轨道写入缓存（保留已有本地编辑）
      initCacheFromTrackList(pid, sid, data.trackList);
      // 批量向后端请求文件路径对应的完整 URL
      await warmUpUrls(pid, sid);
      // 将本地缓存回写到 trackList，确保优先使用缓存数据（src 已解析为完整 URL）
      data.trackList.forEach((track: TrackItem) => {
        if (track.id == null) return;
        const cached = getCache(pid, sid, track.id);
        if (cached?.length) {
          track.medias = cached.map((item) => {
            const fresh = item.sources === "storyboard" ? data.storyboardList.find((frame: StoryboardItem) => frame.id === item.id) : undefined;
            return fresh ? { ...item, src: fresh.src } : item;
          }) as unknown as TrackMedia[];
          setCache(pid, sid, track.id, track.medias as unknown as UploadItem[]);
        }
      });
      // 整体赋值触发响应式
      if (revision !== dataRevision || scriptId !== episodesId.value) return;
      const selectedId = currentTrack.value?.id;
      trackList.value = [...data.trackList];
      if (selectedId)
        activeTrackIndex.value = Math.max(
          0,
          trackList.value.findIndex((t) => t.id === selectedId),
        );
    }

    modelParmas.value.duration = clampDuration(data.trackList?.[activeTrackIndex.value]?.duration);
  } catch (e: any) {
    if (revision === dataRevision) {
      dataError.value = e?.message || "读取镜头失败，请重试";
      if (trackList.value.length) window.$message.error(dataError.value);
    }
  } finally {
    if (revision === dataRevision) {
      dataLoading.value = false;
      if (!dataError.value) void resolveStoryboardSelection();
    }
  }
}
/** 提示词失焦时保存到后端 */
function handlePromptBlur() {
  const id = currentTrack.value?.id;
  if (id != null) void persistPrompt(id).catch(() => {});
}

/** 单个轨道生成提示词 */
async function genText() {
  const track = currentTrack.value;
  if (!track || track.id == null || track.state === "生成中") return;
  const currentTrackId = track.id;
  const info = videoReferenceItems(modelParmas.value.mode, imageList.value).map(({ id, sources }) => ({ id, sources }));
  track.state = "生成中";
  try {
    const { data } = await axios.post("/production/workbench/generateVideoPrompt", {
      projectId: project.value?.id,
      trackId: currentTrackId,
      info: info,
      model: modelParmas.value.model,
      mode: modelParmas.value.mode,
    });
    // 接口返回统一响应中的 data 为 { text, pointsDeducted, balance }，只把文本写回编辑器
    track.prompt = typeof data === "string" ? data : (data?.text ?? "");
    dirtyPrompts.set(track.id, track.prompt);
    await persistPrompt(track.id);
    track.state = "已完成";
  } catch (e) {
    track.state = "生成失败";
    window.$message.error((e as Error)?.message ?? "提示词生成失败");
  }
}
function trackChange(prevIndex?: number) {
  referencesOpen.value = false;
  if (prevIndex != null && trackList.value[prevIndex]) void persistPrompt(trackList.value[prevIndex].id).catch(() => {});
  // 切换前：将旧轨道的 imageList 保存到缓存
  if (prevIndex != null) {
    const prevTrack = trackList.value[prevIndex];
    const pid = project.value?.id;
    const sid = episodesId.value;
    if (pid != null && sid != null && prevTrack?.id != null) {
      setCache(pid, sid, prevTrack.id, prevTrack.medias as unknown as UploadItem[]);
    }
  }
  // 切换后：从缓存恢复当前轨道的 imageList
  const pid = project.value?.id;
  const sid = episodesId.value;
  const curTrack = trackList.value[activeTrackIndex.value];
  if (pid != null && sid != null && curTrack?.id != null) {
    const cached = getCache(pid, sid, curTrack.id);
    if (cached) {
      curTrack.medias = cached as unknown as TrackMedia[];
    }
  }
  // imageList 是基于 currentTrack.medias 的计算属性，切换轨道后自动切换数据

  modelParmas.value.duration = clampDuration(trackList.value?.[activeTrackIndex.value]?.duration);
}
/** 监听当前轨道的 medias 变化，实时同步到缓存 */
watch(
  () => currentTrack.value?.medias,
  (medias) => {
    if (!medias) return;
    const pid = project.value?.id;
    const sid = episodesId.value;
    const trackId = currentTrack.value?.id;
    if (pid != null && sid != null && trackId != null) {
      setCache(pid, sid, trackId, medias as unknown as UploadItem[]);
    }
  },
  { deep: true },
);

watch(
  () => allFrames.value.map((f) => `${f.id}:${f.src || ""}`).join("|"),
  () => {
    void getGenerateData().catch(() => {});
  },
);
onMounted(() => {
  window.addEventListener("keydown", handleComposerKeydown);
  modelParmas.value.model = project.value?.videoModel || "";
  modelParmas.value.mode = project.value?.mode || "";
  getGenerateData();
  if (hasGenerateVideoIds.value && hasGenerateVideoIds.value.length) {
    startPoll();
  }
});
/** 单个轨道生成视频 */
const submittingVideo = ref(false);
async function generateVideo() {
  if (submittingVideo.value || !currentTrack.value) return;
  if (!productionAgentStore().flowData.reviewState?.tableApproved)
    return window.$message.warning("请先在导演总览中审核导演计划和分镜表。已有视频可继续预览、剪辑，不会被删除。");
  const referenceError = videoReferenceError(modelParmas.value.mode, imageList.value, referenceAllowance.value);
  if (referenceError) return window.$message.warning(referenceError);
  const requestTrack = currentTrack.value;
  submittingVideo.value = true;
  try {
    const payload = {
      projectId: project.value?.id,
      scriptId: episodesId.value,
      uploadData: sentReferences.value.map(({ id, sources }) => ({ id, sources })),
      prompt: requestTrack.prompt,
      model: modelParmas.value.model,
      mode: modelParmas.value.mode,
      resolution: modelParmas.value.resolution,
      duration: modelParmas.value.duration,
      audio: modelParmas.value.audio,
      trackId: requestTrack.id,
    };
    await persistPrompt(requestTrack.id);
    accountBoundary.assert(editorOwner);
    const { data } = await axios.post("/production/workbench/generateVideo", payload);
    window.$message.success($t("workbench.generate.generateStarted"));
    requestTrack.videoList.push({
      id: data,
      state: "生成中",
      src: "",
    });
  } catch (e) {
    window.$message.error((e as any)?.message ?? "视频发起生成请求失败");
  } finally {
    submittingVideo.value = false;
  }
}
let pollTimer: NodeJS.Timeout | null = null;
let promptPollTimer: NodeJS.Timeout | null = null;
function startPoll() {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => getVideoList(), 3000);
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
const hasGenerateVideoIds = computed(() => {
  return trackList.value
    .map((track) => {
      return track.videoList.filter((i) => i.state == "生成中").map((i) => i.id);
    })
    .flatMap((i) => i);
});
const hasGeneratePromptIds = computed(() => {
  const trackIds = trackList.value.filter((t) => t.state == "生成中").map((t) => t.id);
  return trackIds;
});
/** 查询所有视频列表，并检测生成完成/失败状态 */
async function getVideoList() {
  const { data } = await axios.post("/production/workbench/checkVideoStateList", {
    projectId: project.value?.id,
    scriptId: episodesId.value ?? 0,
    videoIds: hasGenerateVideoIds.value,
  });
  if (data && data.length) {
    data.forEach((item: { id: number; state: "生成中" | "未生成" | "已完成" | "生成失败"; src?: string; errorReason?: string }) => {
      for (const track of trackList.value) {
        const findData = track.videoList.find((i) => i.id == item.id);
        if (findData) {
          findData.state = item.state;
          findData.src = item?.src ?? "";
          findData.errorReason = item?.errorReason ?? "";
          break;
        }
      }
    });
  }
}
function startPromptPoll() {
  if (promptPollTimer !== null) return;
  promptPollTimer = setInterval(() => getTrackPromptList(), 3000);
}

function stopPromptPoll() {
  if (promptPollTimer) {
    clearInterval(promptPollTimer);
    promptPollTimer = null;
  }
}
/** 查询所有视频列表，并检测生成完成/失败状态 */
async function getTrackPromptList() {
  const { data } = await axios.post("/production/workbench/checkVideoPrompt", {
    projectId: project.value?.id,
    scriptId: episodesId.value ?? 0,
    trackIds: hasGeneratePromptIds.value,
  });
  if (data && data.length) {
    data.forEach((item: { id: number; state: "生成中" | "未生成" | "已完成" | "生成失败"; prompt?: string; reason?: string }) => {
      const findData = trackList.value.find((t) => t.id == item.id);
      if (findData) {
        findData.state = item.state;
        findData.prompt = item?.prompt ?? "";
        findData.reason = item?.reason ?? "";
        if (item.state === "生成失败") {
          window.$message.error(`提示词生成失败，${item.reason ?? "未知原因"}`);
        }
      }
    });
  }
}
watch(
  () => hasGenerateVideoIds.value,
  (newVal) => {
    if (newVal && newVal.length > 0) {
      startPoll();
    } else {
      stopPoll();
    }
  },
);
watch(
  () => hasGeneratePromptIds.value,
  (newVal) => {
    if (newVal && newVal.length > 0) {
      startPromptPoll();
    } else {
      stopPromptPoll();
    }
  },
);
onUnmounted(() => {
  window.removeEventListener("keydown", handleComposerKeydown);
  if (composerFullscreen.value) document.body.style.overflow = bodyOverflowBeforeFullscreen;
  clearTimeout(promptSaveTimer);
  if (accountBoundary.current(editorOwner)) for (const id of dirtyPrompts.keys()) void persistPrompt(id).catch(() => {});
  dataRevision++;
  stopPoll();
  stopPromptPoll();
});
</script>

<style scoped lang="scss">
.composerTopbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 45px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--studio-line) 72%, transparent);
  background: color-mix(in srgb, var(--studio-field) 36%, var(--studio-white));
}
.inputMethod {
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: 74%;
  padding: 3px;
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--studio-line) 86%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--studio-field) 72%, transparent);
  flex: none;
  scrollbar-width: none;
}
.inputMethod::-webkit-scrollbar {
  display: none;
}
.inputMethod button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: 0.16s ease;
}
.inputMethod button > span {
  color: color-mix(in srgb, var(--studio-accent) 74%, var(--studio-muted));
  font-size: 12px;
}
.inputMethod button.active {
  background: var(--studio-white);
  border-color: color-mix(in srgb, var(--studio-line) 74%, transparent);
  color: var(--studio-text);
  box-shadow: 0 2px 8px #3322140d;
  font-weight: 600;
}
.composerIdentity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: var(--studio-muted);
  font-size: 11px;
}
.composerIdentity strong {
  max-width: 220px;
  overflow: hidden;
  color: var(--studio-text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fullscreenToggle {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 6px;
  margin-left: 5px;
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, var(--studio-line) 90%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--studio-white) 92%, transparent);
  color: var(--studio-text);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 3px 12px -8px #3d2a1d4d;
  transition:
    border-color 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}
.fullscreenToggle > span {
  color: var(--studio-accent);
  font-size: 15px;
  line-height: 1;
}
.fullscreenToggle:hover {
  border-color: color-mix(in srgb, var(--studio-accent) 42%, var(--studio-line));
  color: var(--studio-accent);
  transform: translateY(-1px);
}
.modeLoading {
  padding: 6px 10px;
  color: var(--studio-muted);
  font-size: 12px;
  white-space: nowrap;
}
.reviewGate {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--studio-muted);
  font-size: 11px;
  margin-top: 0;
}
.reviewGate button {
  border: 0;
  padding: 0;
  background: none;
  font: inherit;
  color: var(--studio-accent);
  cursor: pointer;
}
.index {
  height: 100%;
  min-height: 0;
  color: var(--studio-text);
  background: var(--studio-bg);
}
.productionWorkspace {
  height: 100%;
  display: grid;
  grid-template-columns: clamp(272px, 17.5vw, 310px) minmax(0, 1fr);
  min-height: 0;
}
.track {
  height: 100%;
  min-height: 0;
  border-right: 1px solid var(--studio-line);
  background: var(--studio-white);
}
.stageMain {
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  padding: 16px 22px;
  scrollbar-gutter: stable;
}
.studioMainInner {
  width: 100%;
  max-width: 1580px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 100%;
  height: auto;
}
.continuityRibbon {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 21px;
  flex: none;
  font-size: 11px;
  color: var(--studio-muted);
  flex-wrap: wrap;
  padding: 0 1px;
}
.frameChoices {
  display: flex;
  gap: 5px;
  align-items: center;
}
.frameChoices button {
  padding: 3px 7px;
  border: 1px solid var(--studio-line);
  background: var(--studio-white);
  border-radius: 5px;
  font-size: 10px;
  color: var(--studio-muted);
  cursor: pointer;
}
.frameChoices button.active {
  color: var(--studio-accent);
  border-color: var(--studio-accent);
}
.continuityStatus {
  margin-left: auto;
}
.continuityLink {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--studio-accent);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.continuityLink > span {
  margin-left: 3px;
}
.generationDock {
  flex: none;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--studio-line) 86%, transparent);
  border-radius: 20px;
  background: color-mix(in srgb, var(--studio-white) 94%, transparent);
  box-shadow:
    0 16px 44px -28px #3d2a1d42,
    inset 0 1px 0 #ffffff;
  backdrop-filter: blur(14px);
}
.composerTitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 14px;
}
.composerTitle > div { display:flex; align-items:center; gap:11px; min-width:0; }
.composerTitleIcon { display:grid; width:38px; height:38px; flex:none; place-items:center; border-radius:13px; background:color-mix(in srgb, var(--studio-accent) 10%, var(--studio-white)); color:var(--studio-accent); font-size:17px; }
.composerTitle strong, .composerTitle small { display:block; }
.composerTitle strong { color:var(--studio-text); font-size:16px; font-weight:650; }
.composerTitle small { margin-top:4px; color:var(--studio-muted); font-size:11px; }
.composerTitleShot { max-width:150px; overflow:hidden; color:var(--studio-muted); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.composerBackdrop {
  position: fixed;
  inset: 0;
  z-index: 2998;
  background: #251d1870;
  backdrop-filter: blur(8px);
}
.generationDock.composerFullscreen {
  --studio-white: light-dark(#fff, #262422);
  --studio-bg: light-dark(#f8f7f5, #201f1e);
  --studio-field: light-dark(#f3f1ed, #33302c);
  --studio-line: light-dark(#e9e4dd, #454039);
  --studio-text: light-dark(#302d29, #eae5df);
  --studio-muted: light-dark(#8a8278, #b0a69b);
  --studio-accent: light-dark(#bd4c22, #e98554);
  --studio-accent-text: light-dark(#fffaf6, #231b16);
  position: fixed;
  inset: 18px;
  z-index: 2999;
  display: grid;
  width: auto;
  height: auto;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  border-radius: 24px;
  background: color-mix(in srgb, var(--studio-white) 98%, #fbf6f1);
  box-shadow:
    0 32px 90px -24px #1c140fa6,
    0 0 0 1px #ffffffa8;
  backdrop-filter: blur(22px);
}
.generationDock.composerFullscreen .composerTopbar {
  min-height: 60px;
  padding: 11px 20px;
  background: color-mix(in srgb, var(--studio-field) 46%, var(--studio-white));
}
.generationDock.composerFullscreen .inputMethod button {
  padding: 8px 15px;
  font-size: 13px;
}
.generationDock.composerFullscreen .composerIdentity,
.generationDock.composerFullscreen .composerIdentity strong {
  font-size: 13px;
}
.generationDock.composerFullscreen .fullscreenToggle {
  height: 34px;
  padding: 0 14px;
  background: var(--studio-white);
  font-size: 12px;
}
.generationDock.composerFullscreen .composerBody {
  min-height: 0;
  gap: 24px;
  padding: 28px 36px 18px;
  overflow: hidden;
}
.generationDock.composerFullscreen .referenceTray {
  max-width: 390px;
  align-items: flex-start;
  align-content: flex-start;
  flex-wrap: wrap;
  overflow: auto;
}
.generationDock.composerFullscreen .referenceTile,
.generationDock.composerFullscreen .referenceAdd {
  width: 94px;
  height: 118px;
  flex-basis: 94px;
  border-radius: 16px;
}
.generationDock.composerFullscreen .referenceTileLabel {
  inset: auto 7px 7px;
  padding: 3px 6px;
  font-size: 10px;
}
.generationDock.composerFullscreen .referenceAdd > span {
  font-size: 29px;
}
.generationDock.composerFullscreen .referenceAdd small {
  font-size: 12px;
}
.generationDock.composerFullscreen .dockPrompt {
  height: 100%;
}
.generationDock.composerFullscreen .dockPrompt textarea {
  min-height: 0;
  height: 100% !important;
  max-height: none;
  flex: 1;
  padding: 20px 22px;
  border-radius: 18px;
  font-size: 18px;
  line-height: 1.9;
}
.generationDock.composerFullscreen .promptMeta {
  padding: 9px 4px 0;
  font-size: 12px;
}
.generationDock.composerFullscreen .referenceSummary {
  margin: 0 36px 12px;
  font-size: 11px;
}
.generationDock.composerFullscreen .composerToolbar {
  padding: 14px 20px 16px;
}
.generationDock.composerFullscreen .assistAction {
  height: 38px;
  padding: 0 15px;
  font-size: 12px;
}
.generationDock.composerFullscreen .generateAction {
  width: 48px;
  height: 48px;
  flex-basis: 48px;
}
.dockLabel {
  color: var(--studio-muted);
  font-size: 12px;
  white-space: nowrap;
}
.composerBody {
  display: flex;
  min-height: 108px;
  align-items: stretch;
  gap: 13px;
  padding: 13px 16px 8px;
}
.referenceTray {
  position: relative;
  display: flex;
  flex: none;
  align-items: stretch;
  gap: 7px;
  max-width: 292px;
  overflow-x: auto;
  scrollbar-width: none;
}
.referenceTray::-webkit-scrollbar {
  display: none;
}
.referenceTile,
.referenceAdd {
  position: relative;
  width: 62px;
  height: 78px;
  flex: 0 0 62px;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--studio-line) 90%, transparent);
  border-radius: 12px;
  background: var(--studio-field);
}
.referenceTile img,
.referenceTile video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.referenceAudio {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--studio-accent);
  font-size: 22px;
}
.referenceTileLabel {
  position: absolute;
  inset: auto 4px 4px;
  overflow: hidden;
  padding: 2px 4px;
  border-radius: 5px;
  background: #17120db8;
  color: white;
  font-size: 9px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.referenceTile > button {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  width: 17px;
  height: 17px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: #17120db8;
  color: white;
  cursor: pointer;
}
.referenceAdd {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-style: dashed;
  color: var(--studio-muted);
  font: inherit;
  cursor: pointer;
}
.referenceAdd:hover {
  border-color: color-mix(in srgb, var(--studio-accent) 48%, var(--studio-line));
  color: var(--studio-accent);
}
.referenceAdd > span {
  font-size: 21px;
  font-weight: 300;
}
.referenceAdd small {
  font-size: 10px;
  white-space: nowrap;
}
.referenceMore {
  position: sticky;
  right: 2px;
  align-self: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border: 1px solid var(--studio-line);
  border-radius: 50%;
  background: var(--studio-white);
  color: var(--studio-muted);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.dockPrompt {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  margin: 0;
}
.dockPrompt > label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.dockPrompt textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 76px;
  height: 76px;
  max-height: 168px;
  padding: 9px 11px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: color-mix(in srgb, var(--studio-field) 48%, transparent);
  color: var(--studio-text);
  font: inherit;
  font-size: 14px;
  line-height: 1.7;
  resize: none;
  outline: none;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}
.dockPrompt textarea:focus {
  border-color: color-mix(in srgb, var(--studio-accent) 28%, var(--studio-line));
  background: color-mix(in srgb, var(--studio-white) 94%, var(--studio-field));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--studio-accent) 7%, transparent);
}
.dockPrompt textarea::placeholder {
  color: color-mix(in srgb, var(--studio-muted) 64%, transparent);
}
.promptMeta {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 2px 0;
  color: var(--studio-muted);
  font-size: 10px;
}
.promptMeta > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.promptMeta > span:last-child {
  flex: none;
}
.referenceSummary {
  display: flex;
  min-height: 22px;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 16px 4px;
  color: var(--studio-muted);
  font-size: 10px;
}
.referenceSummary > span,
.referenceSummary > strong {
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--studio-field) 72%, transparent);
  font-weight: 400;
}
.referenceSummary > strong {
  color: #b45a2a;
}
.composerToolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 9px 12px 10px;
  border-top: 1px solid color-mix(in srgb, var(--studio-line) 68%, transparent);
  background: color-mix(in srgb, var(--studio-field) 24%, transparent);
}
.composerActions {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  margin-left: auto;
}
.composerActions :deep(.modelCostHint) {
  max-width: 260px;
  padding: 5px 9px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--studio-field) 72%, transparent);
  font-size: 12px;
  color: var(--studio-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.assistAction {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--studio-line);
  border-radius: 999px;
  background: var(--studio-white);
  color: var(--studio-text);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.assistAction > span {
  color: var(--studio-accent);
}
.assistAction:hover {
  border-color: color-mix(in srgb, var(--studio-accent) 40%, var(--studio-line));
}
.assistAction:disabled {
  opacity: 0.5;
  cursor: default;
}
.generateAction {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--studio-accent);
  border-radius: 50%;
  background: var(--studio-accent);
  color: var(--studio-accent-text);
  font: inherit;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 8px 20px -10px color-mix(in srgb, var(--studio-accent) 68%, transparent);
  transition: 0.16s ease;
}
.generateAction:hover {
  filter: brightness(1.05);
  transform: translateY(-1px) scale(1.03);
}
.generateAction:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.modeCaution {
  margin: 8px 0 0;
  color: #b07c4b;
  font-size: 11px;
  line-height: 1.6;
}
.studioFootnote {
  margin: 9px 1px 0;
  font-size: 11px;
  color: var(--studio-muted);
  line-height: 1.6;
}
.emptyGenerate {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--studio-muted);
}
.emptyGenerate strong {
  font-size: 18px;
  font-weight: 500;
  color: var(--studio-text);
}
.emptyGenerate p {
  font-size: 13px;
}
.referenceDialogHint {
  margin: 0 0 15px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
@media (min-width: 1280px) {
  .stageMain { padding: 24px 28px; }
  .studioMainInner {
    display: grid;
    grid-template-columns: minmax(420px, 1.1fr) minmax(440px, 0.9fr);
    grid-template-rows: minmax(380px, 1fr) auto;
    align-content: start;
    align-items: stretch;
    gap: 14px 24px;
    min-height: 100%;
  }
  .studioMainInner :deep(.shotPreview) { grid-column: 1; grid-row: 1; min-height: 380px; }
  .continuityRibbon { grid-column: 1; grid-row: 2; align-content: center; justify-content: flex-start; padding: 0 2px 10px; }
  .continuityStatus { margin-left: 0; }
  .generationDock:not(.composerFullscreen) { grid-column: 2; grid-row: 1 / span 2; align-self: stretch; display: flex; min-height: 700px; flex-direction: column; }
  .generationDock:not(.composerFullscreen) .composerTopbar { flex-wrap:wrap; padding: 0 20px 13px; background:transparent; }
  .generationDock:not(.composerFullscreen) .inputMethod { max-width:100%; }
  .generationDock:not(.composerFullscreen) .composerIdentity { margin-left:auto; }
  .generationDock:not(.composerFullscreen) .composerIdentity > span,
  .generationDock:not(.composerFullscreen) .composerIdentity > strong { display:none; }
  .generationDock:not(.composerFullscreen) .composerBody { flex:1 0 auto; min-height:300px; flex-direction:column; gap:16px; padding:18px 22px 10px; }
  .generationDock:not(.composerFullscreen) .referenceTray { max-width:100%; }
  .generationDock:not(.composerFullscreen) .referenceTile,
  .generationDock:not(.composerFullscreen) .referenceAdd { width:72px; height:86px; flex-basis:72px; }
  .generationDock:not(.composerFullscreen) .dockPrompt { min-height:160px; }
  .generationDock:not(.composerFullscreen) .dockPrompt > label { position:static; width:auto; height:auto; margin:0 0 8px; overflow:visible; clip:auto; font-size:12px; font-weight:600; }
  .generationDock:not(.composerFullscreen) .dockPrompt textarea { flex:1; min-height:150px; max-height:none; height:auto !important; padding:14px 15px; font-size:14px; line-height:1.8; }
  .generationDock:not(.composerFullscreen) .promptMeta { padding:8px 2px 0; font-size:11px; }
  .generationDock:not(.composerFullscreen) .referenceSummary { margin:0 22px 12px; }
  .generationDock:not(.composerFullscreen) .composerToolbar { flex:none; gap:12px; padding:14px 20px 16px; }
  .generationDock:not(.composerFullscreen) .composerActions { width:100%; justify-content:flex-end; }
  .generationDock:not(.composerFullscreen) .generateAction { width:46px; height:46px; flex-basis:46px; }
  .studioMainInner :deep(.previewScreen) { min-height: 300px; }
  .studioMainInner :deep(.previewMedia) { width:min(calc(100% - 32px), 720px); height:auto; max-height:none; }
}
@media (min-width: 1800px) {
  .productionWorkspace {
    grid-template-columns: 320px minmax(0, 1fr);
  }
  .stageMain {
    padding: 20px 30px;
  }
}
@media (max-width: 1000px) {
  .productionWorkspace {
    grid-template-columns: 230px minmax(0, 1fr);
  }
  .stageMain {
    padding: 19px;
  }
  .composerToolbar {
    align-items: flex-start;
  }
  .composerActions {
    gap: 7px;
  }
}
@media (max-height: 690px), (max-width: 1000px) {
  .stageMain {
    overflow-y: auto;
  }
  .studioMainInner {
    height: auto;
    min-height: 100%;
  }
  .studioMainInner :deep(.shotPreview) {
    min-height: 220px;
  }
}
@media (max-width: 760px) {
  .productionWorkspace {
    grid-template-columns: 1fr;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .track {
    flex: none;
    height: 245px;
    border-right: 0;
    border-bottom: 1px solid var(--studio-line);
  }
  .stageMain {
    overflow: visible;
    padding: 16px;
    flex: none;
  }
  .inputMethod {
    width: 100%;
    max-width: 100%;
  }
  .continuityStatus {
    margin-left: 0;
  }
  .continuityRibbon {
    gap: 9px;
    padding-top: 7px;
  }
  .composerTopbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .composerIdentity {
    width: 100%;
    justify-content: flex-end;
  }
  .composerIdentity > span,
  .composerIdentity > strong {
    display: none;
  }
  .composerBody {
    flex-direction: column;
    padding: 12px;
  }
  .referenceTray {
    width: 100%;
    max-width: 100%;
  }
  .composerToolbar {
    flex-direction: column;
  }
  .composerActions {
    width: 100%;
  }
  .composerActions :deep(.modelCostHint) {
    margin-left: auto;
  }
  .dockPrompt textarea {
    font-size: 14px;
  }
  .generationDock.composerFullscreen {
    inset: 8px;
    border-radius: 18px;
  }
  .generationDock.composerFullscreen .composerTopbar {
    gap: 8px;
    padding: 10px 12px;
  }
  .generationDock.composerFullscreen .composerBody {
    padding: 16px 14px 12px;
    overflow-y: auto;
  }
  .generationDock.composerFullscreen .referenceTray {
    max-height: 128px;
    flex-wrap: nowrap;
  }
  .generationDock.composerFullscreen .dockPrompt {
    min-height: 260px;
  }
  .generationDock.composerFullscreen .dockPrompt textarea {
    min-height: 220px;
    padding: 16px;
    font-size: 16px;
  }
  .generationDock.composerFullscreen .referenceSummary {
    margin: 0 14px 8px;
  }
  .generationDock.composerFullscreen .composerToolbar {
    padding: 10px 12px 12px;
  }
}
</style>
