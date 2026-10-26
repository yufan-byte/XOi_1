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
          <section class="generationDock" aria-label="当前镜头生成台">
            <header class="dockHeading">
              <span class="dockSpark" aria-hidden="true">✦</span>
              <div>
                <strong>对话生成视频</strong>
                <small>告诉 AI 这段镜头怎么动；分镜语境、连续性约束和版本记录仍由导演工作流接管</small>
              </div>
            </header>
            <div class="dockModeBar">
              <div class="inputMethod" aria-label="视频生成方式">
                <button
                  v-for="item in modeList"
                  :key="item.value"
                  type="button"
                  :class="{ active: modelParmas.mode === item.value }"
                  :title="item.description"
                  @click="modeChange(item.value)">
                  {{ item.label }}
                </button>
                <span v-if="!modeList.length" class="modeLoading">读取模型能力…</span>
              </div>
              <span>{{ modeHint }}</span>
            </div>
            <div v-if="!isTextVideoMode(modelParmas.mode)" class="dockReferences">
              <span class="dockLabel">本次参考</span>
              <div class="referenceChips">
                <span v-for="(item, i) in sentReferences.slice(0, 4)" :key="`${item.sources}:${item.id}:${i}`">
                  <img v-if="item.fileType === 'image'" :src="item.src" alt="本次参考缩略图" />
                  {{ referenceLabel(item) }}
                  <button type="button" :aria-label="`移除${referenceLabel(item)}`" @click="removeReference(i)">×</button>
                </span>
                <span v-if="!sentReferences.length" class="referenceEmpty">选择分镜图、角色、场景或自己的素材</span>
              </div>
              <button type="button" class="dockTextButton" @click="referencesOpen = true">
                {{ sentReferences.length ? "更换 / 添加" : "选择参考图" }}
              </button>
              <span v-if="currentFrame?.continuity?.transition === 'continue'" class="referenceContext">衔接参考含上一镜已采用视频的尾帧</span>
              <span v-if="currentFrame?.continuity?.anchorStoryboardId" class="referenceContext">含已固定的空间锚点</span>
              <span class="referenceContext">{{ referenceLimitText }}</span>
              <span v-if="referenceTrimmed" class="referenceWarning">超出当前模型能力的素材不会提交</span>
            </div>
            <div class="dockPrompt">
              <label for="shot-prompt" class="dockLabel">
                {{ isTextVideoMode(modelParmas.mode) ? "视频描述 · 场景、人物、动作与运镜" : "动作与运镜" }}
              </label>
              <textarea
                v-if="currentTrack"
                id="shot-prompt"
                v-model="currentTrack.prompt"
                rows="2"
                placeholder="描述人物如何行动、镜头如何移动。空间布局与衔接约束会一同应用。"
                @input="onPromptInput(currentTrack.prompt)"
                @blur="handlePromptBlur" />
              <span v-if="promptSaveStatus" class="promptSaved">{{ promptSaveStatus }}</span>
              <span v-else-if="currentTrack" class="promptCount">{{ currentTrack.prompt?.length || 0 }} 字</span>
            </div>
            <modeMenu
              v-model="modelParmas"
              :modeOptions="modeOptions"
              :trackId="currentTrack?.id"
              @duration-change="updateTrackDuration" />

            <footer class="dockSubmit">
              <button type="button" class="dockTextButton promptAssist" :disabled="currentTrack?.state === '生成中'" title="读取本镜分镜和参考素材，整理成可直接生成的视频提示词" @click="genText">
                <span aria-hidden="true">✦</span>
                {{ currentTrack?.state === "生成中" ? "正在帮写…" : "按分镜智能帮写" }}
              </button>
              <div class="submitActions">
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
                  :disabled="submittingVideo || !currentTrack?.prompt?.trim() || !modelParmas.model"
                  @click="generateVideo">
                  <t-loading v-if="submittingVideo" size="small" />
                  {{ submittingVideo ? "正在提交" : currentTrack?.videoList.length ? "再生成一版" : "生成视频" }}
                </button>
              </div>
            </footer>
          </section>
        </div>
      </main>
    </div>
    <t-dialog v-if="referencesOpen" v-model:visible="referencesOpen" header="本镜参考素材" :footer="false" width="min(880px, 94vw)" attach="body">
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
  inspectedFrameId = ref<number>();
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
defineExpose({ selectStoryboard });
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
  clearTimeout(promptSaveTimer);
  if (accountBoundary.current(editorOwner)) for (const id of dirtyPrompts.keys()) void persistPrompt(id).catch(() => {});
  dataRevision++;
  stopPoll();
  stopPromptPoll();
});
</script>

<style scoped lang="scss">
.dockHeading {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 10px;
}
.dockHeading > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.dockHeading strong {
  font-size: 14px;
  color: var(--studio-text);
}
.dockHeading small {
  color: var(--studio-muted);
  font-size: 11px;
  line-height: 1.5;
}
.dockSpark {
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  color: var(--studio-accent);
  background: color-mix(in srgb, var(--studio-accent) 10%, white);
}
.dockModeBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.inputMethod {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--studio-field);
  padding: 3px;
  border-radius: 8px;
  flex: none;
  max-width: 72%;
  overflow-x: auto;
  scrollbar-width: none;
}
.inputMethod::-webkit-scrollbar {
  display: none;
}
.inputMethod button {
  border: 0;
  background: none;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  padding: 6px 13px;
  border-radius: 6px;
  white-space: nowrap;
}
.inputMethod button.active {
  background: var(--studio-white);
  color: var(--studio-accent);
  box-shadow: 0 1px 4px #30201008;
  font-weight: 600;
}
.inputMethod button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dockModeBar > span,
.referenceContext {
  color: var(--studio-muted);
  font-size: 11px;
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
.referenceChips > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.referenceChips > span > button {
  display: grid;
  width: 17px;
  height: 17px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  cursor: pointer;
}
.referenceChips > span > button:hover {
  background: var(--studio-white);
  color: var(--studio-accent);
}
.referenceChips img {
  width: 25px;
  height: 25px;
  object-fit: cover;
  border-radius: 3px;
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
  grid-template-columns: 235px minmax(0, 1fr);
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
  overflow: hidden;
  display: flex;
  padding: 14px 20px;
  scrollbar-gutter: stable;
}
.studioMainInner {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  height: 100%;
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
  background: var(--studio-white);
  border: 1px solid var(--studio-line);
  border-radius: 15px;
  padding: 12px 16px;
  flex: none;
}
.dockReferences {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.dockLabel {
  color: var(--studio-muted);
  font-size: 12px;
  white-space: nowrap;
}
.referenceChips {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  align-items: center;
}
.referenceChips > span {
  padding: 4px 9px;
  border-radius: 5px;
  background: var(--studio-field);
  font-size: 12px;
  color: var(--studio-text);
}
.referenceChips .referenceEmpty {
  background: none;
  color: var(--studio-muted);
  padding-left: 0;
}
.referenceWarning {
  color: #b45a2a;
  font-size: 11px;
}
.dockTextButton {
  padding: 3px 2px;
  background: transparent;
  border: 0;
  color: var(--studio-accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dockTextButton:disabled {
  opacity: 0.5;
  cursor: default;
}
.dockPrompt {
  position: relative;
  margin: 6px 0;
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
  min-height: 44px;
  height: 44px;
  max-height: 110px;
  padding: 3px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline-offset: 3px;
}
.dockPrompt textarea::placeholder {
  color: var(--studio-muted);
}
.promptSaved {
  display: block;
  position: absolute;
  right: 0;
  top: 0;
  color: var(--studio-muted);
  font-size: 10px;
}
.promptCount {
  display: block;
  position: absolute;
  right: 0;
  top: 0;
  color: var(--studio-muted);
  font-size: 10px;
}
.dockSubmit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--studio-line);
}
.promptAssist {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.promptAssist > span {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--studio-accent) 10%, white);
}
.submitActions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}
.submitActions :deep(.modelCostHint) {
  font-size: 12px;
  color: var(--studio-muted);
}
.generateAction {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border: 1px solid var(--studio-accent);
  border-radius: 10px;
  background: var(--studio-accent);
  color: var(--studio-accent-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: filter 0.15s;
}
.generateAction:hover {
  filter: brightness(1.05);
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
@media (min-width: 1800px) {
  .productionWorkspace {
    grid-template-columns: 260px minmax(0, 1fr);
  }
  .stageMain {
    padding: 20px 30px;
  }
}
@media (max-width: 1000px) {
  .productionWorkspace {
    grid-template-columns: 200px minmax(0, 1fr);
  }
  .stageMain {
    padding: 19px;
  }
  .generationDock {
    padding: 14px;
  }
  .submitActions {
    gap: 8px;
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
  .dockReferences {
    gap: 7px;
  }
  .dockModeBar {
    align-items: flex-start;
    flex-direction: column;
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
  .dockSubmit {
    gap: 10px;
  }
  .submitActions {
    flex-wrap: wrap;
  }
  .generateAction {
    padding: 9px 14px;
  }
  .dockPrompt textarea {
    font-size: 14px;
  }
}
</style>
