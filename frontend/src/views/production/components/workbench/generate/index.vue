<template>
  <div class="index">
    <div class="stageHeader">
      <div>
        <div class="stageTitle">视频生成</div>
        <div class="stageSubtitle">把已完成的分镜变成可选的视频版本。先选镜头，再配置参考图和提示词。</div>
      </div>
      <div class="stageSummary">
        <template v-if="trackList.length">
          <span>共 {{ trackList.length }} 个镜头</span>
          <span class="summaryReady">已完成 {{ trackList.filter(t => t.selectVideoId).length }}</span>
          <span class="summaryPending">待处理 {{ trackList.filter(t => !t.selectVideoId).length }}</span>
        </template>
        <span v-else class="summaryEmpty">等待分镜</span>
      </div>
    </div>
    <div v-if="!trackList.length" class="emptyGenerate">
      <div class="emptyIcon">✦</div>
      <h3>还没有可生成的视频镜头</h3>
      <p>先在“分镜台”创建镜头并生成分镜图，视频生成会自动读取这些镜头。</p>
      <div class="emptyFlow"><span>分镜台</span><i>→</i><span class="active">视频生成</span><i>→</i><span>剪辑成片</span></div>
    </div>
    <div v-else class="productionWorkspace">
      <aside class="track">
      <newTrack
        v-model:activeTrackIndex="activeTrackIndex"
        v-model="trackList"
        :image-list="imageList"
        :storyboard-list="storyboardList"
        @change="trackChange"
        :modelParmas="modelParmas"
        :clampDuration="clampDuration"
        @getData="getGenerateData" />
      </aside>
      <main class="stageMain">
        <div class="referenceImage">
          <div class="panelHeading"><div><strong>参考素材</strong><small>用于锁定人物、场景和首尾帧</small></div><span>{{ imageList.filter(item => item.src).length }} 个已选</span></div>
          <div class="uploadBtn">
            <imageSelect :mode="modelParmas.mode as VideoMode" v-model="imageList" :storyboard-list="storyboardList" />
          </div>
        </div>
        <div class="modelSelect">
          <div class="panelHeading"><div><strong>生成设置</strong><small>选择模型、模式和输出规格</small></div></div>
          <modeMenu v-model="modelParmas" :modeOptions="modeOptions" :trackId="currentTrack?.id" :modeList="modeList" @modeChange="modeChange" />
        </div>
        <div class="prompt" v-if="currentTrack">
          <t-card :title="'镜头 #' + (activeTrackIndex + 1) + ' · ' + $t('workbench.generate.generateText')" header-bordered class="videoPrompt">
            <template #actions>
              <t-button size="small" class="genTextbtn" :loading="currentTrack.state == '生成中'" @click="genText">
                {{ $t("workbench.generate.generateText") }}
              </t-button>
            </template>
            <div class="promptData fc">
              <div class="promptInput" @focusout="handlePromptBlur">
                <promptEditor v-model="currentTrack.prompt" :references="references" :placeholder="$t('workbench.generate.promptPlaceholder')" />
              </div>
            </div>
          </t-card>
        </div>
      </main>
      <aside class="video">
        <videoCard
          v-if="currentTrack"
          :active-track-index="activeTrackIndex"
          v-model:current-track="currentTrack"
          @refresh="getGenerateData"
          @generate="generateVideo" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import newTrack from "./components/track.vue";
import imageSelect from "./components/imageSelect.vue";
import modeMenu from "./components/modeMenu.vue";
import videoCard from "./components/video.vue";
import "@/views/production/components/workbench/type/type";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import promptEditor from "@/components/promptEditor.vue";
import imageListCacheStore from "@/stores/imageListCache";

const { project } = storeToRefs(projectStore());
const episodesId = inject<Ref<number>>("episodesId")!;
const activeTrackIndex = ref(0);
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

/** 排序优先级：assets有图=0，storyboard有图=1，无图=2 */
function getImageItemPriority(item: UploadItem): number {
  if (item.src) return item.sources === "assets" ? 0 : 1;
  return 2;
}

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
        return [...cached].sort((a, b) => getImageItemPriority(a) - getImageItemPriority(b));
      }
    }
    const medias = currentTrack.value?.medias;
    if (!medias?.length) return [];
    return [...(medias as UploadItem[])].sort((a, b) => getImageItemPriority(a) - getImageItemPriority(b));
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

function modeChange(newVal: string) {
  if (newVal == modelParmas.value.mode) return;
  if ((imageList.value.length || currentTrack.value?.prompt) && modelParmas.value.mode) {
    const dialog = DialogPlugin.confirm({
      header: $t("workbench.generate.modeChange"),
      body: $t("workbench.generate.modeChangeConfirm"),
      confirmBtn: $t("settings.generate.modelChnageSure"),
      cancelBtn: $t("settings.memory.msg.cancel"),
      onConfirm: async () => {
        imageList.value = [];
        currentTrack.value.prompt = "";
        dialog.destroy();
        modelParmas.value.mode = newVal;
      },
    });
  } else if (newVal) {
    modelParmas.value.mode = newVal;
  }
}
const modeList = computed(() => {
  const modeLabelMap: Record<string, string> = {
    singleImage: "单图",
    startEndRequired: "首尾帧",
    endFrameOptional: "尾帧可选",
    startFrameOptional: "首帧可选",
    text: "文本生视频",
    videoReference: "视频",
    imageReference: "图片",
    audioReference: "音频",
    textReference: "文本",
  };
  function parseRefLabel(m: string): string {
    const match = m.match(/^(videoReference|imageReference|audioReference|textReference):(\d+)$/);
    if (match) {
      const base = modeLabelMap[match[1]] || match[1];
      return `${base} ×${match[2]}`;
    }
    return modeLabelMap[m] || m;
  }
  return modeOptions.value.mode
    ? modeOptions.value.mode.map((mode) =>
        Array.isArray(mode)
          ? { value: JSON.stringify(mode), label: mode.map((m) => parseRefLabel(m)).join(" + ") + "参考" }
          : { value: mode, label: modeLabelMap[mode] || mode },
      )
    : [];
});
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
  const drMap = modeOptions.value?.durationResolutionMap;
  if (Array.isArray(drMap) && drMap.length > 0 && drMap[0].duration?.length) {
    const durations = drMap[0].duration;
    return Math.max(Math.min(...durations), Math.min(trackDuration, Math.max(...durations)));
  }
  return trackDuration;
}
watch(
  () => modelParmas.value.model,
  (val) => {
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
    axios.post("/modelSelect/getModelDetail", { modelId: val }).then(({ data }) => {
      modeOptions.value = data;
      modelParmas.value.audio = data.audio === true || data.audio === "true" || data.audio == "optional";
      const drMap = data.durationResolutionMap;
      if (Array.isArray(drMap) && drMap.length > 0) {
        if (drMap[0].resolution?.length) modelParmas.value.resolution = drMap[0].resolution[0];
        if (drMap[0].duration?.length) modelParmas.value.duration = clampDuration(modelParmas.value.duration);
      }

      const currentParsed = parseMode(modelParmas.value.mode);
      const modeMatched =
        currentParsed !== null &&
        data.mode.some((m: VideoMode) => {
          if (Array.isArray(m) && Array.isArray(currentParsed)) {
            return JSON.stringify(m) === JSON.stringify(currentParsed);
          }
          return m == currentParsed;
        });
      if (!modeMatched) {
        const newMode = Array.isArray(data.mode[0]) ? JSON.stringify(data.mode[0]) : data.mode[0];
        modeChange(newMode);
      }
    });
  },
);
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

async function getGenerateData() {
  const { data } = await axios.post("/production/workbench/getGenerateData", {
    projectId: project.value?.id,
    scriptId: episodesId.value ?? 0,
  });

  storyboardList.value = data.storyboardList;
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
        track.medias = cached as unknown as TrackMedia[];
      }
    });
    // 整体赋值触发响应式
    trackList.value = [...data.trackList];
  }

  modelParmas.value.duration = clampDuration(data.trackList?.[activeTrackIndex.value]?.duration);
}
/** 提示词失焦时保存到后端 */
function handlePromptBlur() {
  const trackId = trackList.value[activeTrackIndex.value]?.id;
  if (trackId == null) return;
  axios.post("/production/workbench/updateVideoPrompt", { id: trackId, prompt: currentTrack.value?.prompt });
}

/** 单个轨道生成提示词 */
async function genText() {
  const track = currentTrack.value;
  if (track.id == null || track.state === "生成中") return;
  let info: { id: number; sources: string }[] = [];
  const currentTrackId = track.id;
  const rawMedias = (track.medias ?? []) as UploadItem[];
  if (modelParmas.value.mode == "text") {
    info = rawMedias.map(({ id, sources }) => ({ id: id!, sources }));
  } else {
    const frameMode = ["startEndRequired", "endFrameOptional", "startFrameOptional"];
    const preSliced = frameMode.includes(modelParmas.value.mode)
      ? rawMedias.slice(0, 2)
      : modelParmas.value.mode === "singleImage"
        ? rawMedias.slice(0, 1)
        : rawMedias;
    const filtered = preSliced.filter((item) => typeof item.id === "number" && !isNaN(item.id)).map(({ id, sources }) => ({ id: id!, sources }));
    if (frameMode.includes(modelParmas.value.mode)) info = filtered.slice(0, 2);
    else if (modelParmas.value.mode === "singleImage") info = filtered.slice(0, 1);
    else info = filtered;
  }
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
    track.prompt = typeof data === "string" ? data : data?.text ?? "";
    track.state = "已完成";
  } catch (e) {
    track.state = "生成失败";
    window.$message.error((e as Error)?.message ?? "提示词生成失败");
  }
}
function trackChange(prevIndex?: number) {
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
  if (modelParmas.value.mode == "singleImage" && imageList.value.length > 1) {
    imageList.value = imageList.value.slice(0, 1);
  }
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

onMounted(() => {
  modelParmas.value.model = project.value?.videoModel || "";
  modelParmas.value.mode = project.value?.mode || "";
  getGenerateData();
  if (hasGenerateVideoIds.value && hasGenerateVideoIds.value.length) {
    startPoll();
  }
});
/** 单个轨道生成视频 */
async function generateVideo() {
  const dlg = DialogPlugin.confirm({
    header: $t("workbench.generate.generateConfirm"),
    body: $t("workbench.generate.generateConfirmBody"),
    onConfirm: async () => {
      dlg.destroy();
      try {
        const { data } = await axios.post("/production/workbench/generateVideo", {
          projectId: project.value?.id,
          scriptId: episodesId.value,
          uploadData:
            modelParmas.value.mode === "text"
              ? []
              : (() => {
                  const frameMode = ["startEndRequired", "endFrameOptional", "startFrameOptional"];
                  const preSliced = frameMode.includes(modelParmas.value.mode)
                    ? imageList.value.slice(0, 2)
                    : modelParmas.value.mode === "singleImage"
                      ? imageList.value.slice(0, 1)
                      : imageList.value;
                  const filtered = preSliced
                    .filter((item) => Boolean(item.src) && typeof item.id === "number" && !isNaN(item.id))
                    .map(({ id, sources }) => ({ id, sources }));
                  if (frameMode.includes(modelParmas.value.mode)) return filtered.slice(0, 2);
                  if (modelParmas.value.mode === "singleImage") return filtered.slice(0, 1);
                  return filtered;
                })(),
          prompt: currentTrack.value.prompt,
          model: modelParmas.value.model,
          mode: modelParmas.value.mode,
          resolution: modelParmas.value.resolution,
          duration: modelParmas.value.duration,
          audio: modelParmas.value.audio,
          trackId: currentTrack.value.id,
        });
        window.$message.success($t("workbench.generate.generateStarted"));
        currentTrack.value.videoList.push({
          id: data,
          state: "生成中",
          src: "",
        });
      } catch (e) {
        window.$message.error((e as any)?.message ?? "视频发起生成请求失败");
      } finally {
      }
    },
    onCancel: () => dlg.destroy(),
  });
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
  stopPoll();
  stopPromptPoll();
});
</script>

<style lang="scss" scoped>
.index {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  padding: 8px 12px 12px;
  background: #f7f8fa;
  .stageHeader { display:flex; align-items:center; justify-content:space-between; padding: 4px 4px 0; }
  .stageTitle { font-size: 18px; font-weight: 700; color: #1f2329; }
  .stageSubtitle { margin-top: 3px; color: #8a919f; font-size: 12px; }
  .stageSummary { display:flex; gap: 14px; color:#8a919f; font-size:12px; }
  .summaryReady { color:#16a36a; } .summaryPending { color:#d48806; }
  .summaryEmpty { color:#a7a2af; }
  .emptyGenerate { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:0; padding:40px 20px; border:1px solid #eceaf0; border-radius:16px; background:linear-gradient(180deg,#fff,#fbfaff); text-align:center; }
  .emptyIcon { display:grid; place-items:center; width:48px; height:48px; border-radius:15px; background:#f1edff; color:#7d5dd5; font-size:24px; }
  .emptyGenerate h3 { margin:14px 0 4px; color:#38343f; font-size:17px; }
  .emptyGenerate p { max-width:440px; margin:0; color:#9994a1; font-size:12px; line-height:1.7; }
  .emptyFlow { display:flex; align-items:center; gap:9px; margin-top:20px; color:#aaa5b1; font-size:12px; }
  .emptyFlow span { padding:6px 10px; border:1px solid #e8e5ee; border-radius:7px; background:#fff; }
  .emptyFlow span.active { border-color:#cfc3f2; background:#f7f4ff; color:#6448b1; }
  .emptyFlow i { color:#b3adbd; font-style:normal; }
  .productionWorkspace { flex:1; min-height:0; display:grid; grid-template-columns: 300px minmax(560px,1.1fr) minmax(420px,.75fr); gap:14px; }
  .stageMain { min-width:0; min-height:0; display:flex; flex-direction:column; gap:10px; }
  .referenceImage, .modelSelect, .prompt, .video, .track { min-height:0; animation: fadeSlideIn 300ms ease-out; }
  .referenceImage, .modelSelect { flex:none; padding: 10px 12px; border-radius:12px; background:#fff; border:1px solid #edf0f3; }
  .panelHeading { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
  .panelHeading strong { display:block; color:#3e3a46; font-size:12px; }
  .panelHeading small { display:block; margin-top:2px; color:#a09aa8; font-size:10px; }
  .panelHeading > span { color:#8c77c5; font-size:10px; white-space:nowrap; }
  .prompt { flex:1; }
  .video, .track { height:100%; min-width:0; }
  .track :deep(.videoTrack), .video :deep(.t-card), .prompt .videoPrompt { height:100%; }
  .prompt .videoPrompt { overflow:hidden; display:flex; flex-direction:column; border-radius:12px; }
  .prompt .videoPrompt :deep(.t-card__body) { flex:1; min-height:0; overflow:hidden; display:flex; flex-direction:column; }
  .promptData, .promptInput { flex:1; min-height:0; overflow:auto; }
  .track :deep(.t-card), .video :deep(.t-card) { border-radius:12px; }
  .track :deep(.t-card__body), .video :deep(.t-card__body) { height:100%; }
  .track :deep(.itemBox) { overflow-y:auto; max-height: calc(100% - 58px); }
  @media (max-width: 900px) {
    .stageHeader { align-items:flex-start; flex-direction:column; gap:8px; }
    .emptyGenerate { padding:30px 14px; }
    .productionWorkspace { grid-template-columns: 1fr; overflow:auto; }
    .track, .video { min-height: 360px; }
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
