<template>
  <div class="studioTracks">
    <header class="tracksHeading">
      <strong>本集镜头</strong>
      <span>{{ trackList.length }} 段 · {{ totalSeconds }} 秒</span>
    </header>
    <button v-if="pendingStoryboardCount" type="button" class="tracksPending" @click="emit('go-frames')">
      {{ pendingStoryboardCount }} 镜未关联视频 · 去补齐 →
    </button>
    <div v-if="batchMode" class="tracksBatch">
      <label>
        <input type="checkbox" :checked="checkAll" @change="handleCheckAll(($event.target as HTMLInputElement).checked)" />
        全选
        <span>已选 {{ checkedTrackIds.length }}</span>
      </label>
      <div>
        <button type="button" :disabled="!checkedTrackIds.length || generateTextLoad" @click="batchGenText">整理提示词</button>
        <button type="button" :disabled="!checkedTrackIds.length || generateVideoLoad" @click="batchGenVideo">
          {{ generateVideoLoad ? "正在提交…" : "批量生成" }}
        </button>
        <button type="button" :disabled="!checkedTrackIds.length" @click="batchDownloadVideo">下载视频</button>
        <button type="button" :disabled="!checkedTrackIds.length" @click="importSelectedToEditor">加入剪辑</button>
      </div>
    </div>
    <div class="studioShotList">
      <article v-for="(track, index) in trackList" :key="track.id" class="studioShot" :class="{ active: index === activeTrackIndex }">
        <button type="button" class="shotPick" :aria-pressed="index === activeTrackIndex" @click="changeIndex(index)">
          <div class="shotThumb">
            <img v-if="coverFor(track)" :src="coverFor(track)" alt="镜头画面缩略图" loading="lazy" />
            <span v-else class="shotThumbEmpty"><i-video size="22" /></span>
            <span v-if="trackStateClass(track) === 'processing'" class="shotBusy">生成中</span>
          </div>
          <strong>{{ props.trackLabels?.[track.id] || `镜头 ${index + 1}` }}</strong>
          <span class="shotDetails">
            {{ track.duration || 0 }} 秒
            <i>·</i>
            {{ adoptedLabel(track) }}
          </span>
        </button>
        <input
          v-if="batchMode"
          class="shotCheck"
          type="checkbox"
          :aria-label="`选择镜头 ${index + 1}`"
          :checked="checkedTrackIds.includes(track.id)"
          @change="toggleCheck(track.id, ($event.target as HTMLInputElement).checked)" />
      </article>
    </div>
    <footer class="tracksFooter">
      <button type="button" class="batchToggle" :class="{ active: batchMode }" @click="batchMode = !batchMode">
        {{ batchMode ? "退出批量操作" : "批量操作" }}
      </button>
      <details>
        <summary>更多镜头操作</summary>
        <button type="button" @click="addTrack">添加独立片段</button>
        <button type="button" :disabled="!pendingStoryboardCount" @click="batchCreateFromStoryboard">
          从未关联分镜创建片段{{ pendingStoryboardCount ? `（${pendingStoryboardCount}）` : "" }}
        </button>
        <button type="button" :disabled="!trackList.length" @click="confirmDeleteTrack(activeTrackIndex)">删除当前片段</button>
      </details>
    </footer>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { videoReferenceItems, videoReferenceError, type StudioReferenceAllowance } from "@/utils/studioVideoInput";
import "@/views/production/components/workbench/type/type";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import imageListCacheStore from "@/stores/imageListCache";
import JSZip from "jszip";
import settingStore from "@/stores/setting";

const { otherSetting } = storeToRefs(settingStore());
const { project } = storeToRefs(projectStore());
const { removeCache } = imageListCacheStore();
const episodesId = inject<Ref<number>>("episodesId")!;
const props = defineProps<{
  modelParmas: ModelSetting;
  trackLabels?: Record<number, string>;
  imageList: UploadItem[];
  storyboardList?: StoryboardItem[];
  referenceAllowance: StudioReferenceAllowance;
  clampDuration: (trackDuration: number) => number;
}>();
const activeTrackIndex = defineModel<number>("activeTrackIndex", {
  default: 0,
});
const checkedTrackIds = ref<number[]>([]); // 已勾选的轨道 id
const batchMode = ref(false);
const trackList = defineModel<TrackItem[]>({
  default: () => [],
});
const emit = defineEmits<{
  getData: [];
  "go-frames": [];
  change: [prevIndex: number];
  saveImageList: [trackId: number];
  importVideo: [{ trackId: number; videoId: number; src: string; duration: number }[]];
}>();
const checkAll = ref(false); // 全选状态
const pendingStoryboardCount = computed(() => (props.storyboardList ?? []).filter((storyboard) => !storyboard.trackId).length);

const totalSeconds = computed(() => Number(trackList.value.reduce((sum, track) => sum + Number(track.duration || 0), 0).toFixed(1)));
function coverFor(track: TrackItem) {
  const video = getSelectedVideoSrc(track);
  return (
    (video && videoCoverMap.value[video]) ||
    props.storyboardList?.find((frame) => Number(frame.trackId) === track.id && frame.src)?.src ||
    track.medias.find((m) => m.fileType === "image" && m.src)?.src ||
    ""
  );
}
function adoptedLabel(track: TrackItem) {
  const selected = track.videoList.findIndex((video) => video.id === track.selectVideoId);
  return selected >= 0 ? `已采用 V${selected + 1}` : trackStateLabel(track);
}
/** 视频封面缓存 src -> dataURL */
const videoCoverMap = ref<Record<string, string>>({});

/** 获取轨道选中视频的 src */
function getSelectedVideoSrc(track: TrackItem): string | null {
  if (!track.selectVideoId) return null;
  const video = track.videoList?.find((v) => v.id === track.selectVideoId);
  return video?.src || null;
}

/** 截取视频首帧封面 */
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
      video.currentTime = Math.min(0.12, Number.isFinite(video.duration) ? video.duration / 2 : 0.12);
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
  const timeout = setTimeout(() => {
    video.removeAttribute("src");
    video.load();
  }, 15000);
  video.addEventListener("seeked", () => clearTimeout(timeout), { once: true });
  video.addEventListener("error", () => clearTimeout(timeout), { once: true });
  video.load();
}

function changeIndex(index: number) {
  if (activeTrackIndex.value == index) return;
  const prevIndex = activeTrackIndex.value;
  activeTrackIndex.value = index;
  emit("change", prevIndex);
}

function trackStateClass(track: TrackItem) {
  if (track.state === "生成中") return "processing";
  if (track.state === "生成失败") return "failed";
  if (track.selectVideoId) return "selected";
  if (track.videoList?.some((video) => video.state === "已完成")) return "ready";
  if (track.prompt) return "prompted";
  return "todo";
}

function trackStateLabel(track: TrackItem) {
  const state = trackStateClass(track);
  return (
    { processing: "生成中", failed: "需重试", selected: "已采用", ready: "待选择", prompted: "可生成", todo: "待准备" } as Record<string, string>
  )[state];
}
/** 删除轨道请求 */
async function deleteTrack(index: number) {
  const track = trackList.value[index];
  if (!track) return;
  await axios.post("/production/workbench/deleteTrack", { id: track.id });
  checkedTrackIds.value = checkedTrackIds.value.filter((id) => id !== track.id);
  // 删除该轨道的图片缓存
  const pid = project.value?.id;
  const sid = episodesId.value;
  if (pid != null && sid != null && track.id != null) {
    removeCache(pid, sid, track.id);
  }
  if (activeTrackIndex.value >= trackList.value.length) {
    activeTrackIndex.value = trackList.value.length - 1;
  }
}
function confirmDeleteTrack(index: number) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.generate.del"),
    body: $t("workbench.generate.delConfirm"),
    confirmBtn: $t("settings.generate.delConfirmBtn"),
    cancelBtn: $t("settings.memory.msg.cancel"),
    onConfirm: async () => {
      try {
        await deleteTrack(index);
        window.$message.success($t("workbench.generate.delSuccess"));
        emit("getData");
      } catch (e: any) {
        window.$message.error(e.message ?? $t("workbench.cornerScape.cancelGeneration") + "失败");
      } finally {
        dialog.destroy();
      }
    },
  });
}
async function addTrack() {
  const { data: modelData } = await axios.post("/modelSelect/getModelDetail", { modelId: props.modelParmas.model });
  const drMap = modelData.durationResolutionMap;
  if (!Array.isArray(drMap) || drMap.length === 0 || !drMap[0].duration?.length) return;
  const duration = drMap[0].duration[0];
  const { data } = await axios.post("/production/workbench/addTrack", {
    projectId: project.value?.id,
    scriptId: episodesId.value ?? 0,
    duration,
  });
  // await getGenerateData();
  emit("getData");
  activeTrackIndex.value = trackList.value.length - 1;
}

// 根据分镜批量创建片段，并关联分镜图片作为参考图
async function batchCreateFromStoryboard() {
  if (!props.storyboardList?.length) {
    window.$message.warning("没有分镜数据");
    return;
  }

  const pendingStoryboards = props.storyboardList.filter((storyboard) => !storyboard.trackId);
  if (!pendingStoryboards.length) {
    window.$message.info("所有分镜都已创建片段，无需重复创建");
    return;
  }
  const count = pendingStoryboards.length;

  const dialog = DialogPlugin.confirm({
    header: "批量创建片段",
    body: `检测到 ${count} 个分镜，将创建 ${count} 个片段并关联分镜图片作为参考图？`,
    confirmBtn: "确认创建",
    cancelBtn: "取消",
    theme: "info",
    onConfirm: async () => {
      try {
        const loading = LoadingPlugin({ fullscreen: true, content: `正在创建 ${count} 个片段...` });

        // 获取模型时长
        const { data: modelData } = await axios.post("/modelSelect/getModelDetail", { modelId: props.modelParmas.model });
        const drMap = modelData.durationResolutionMap;
        const duration = (Array.isArray(drMap) && drMap.length > 0 && drMap[0].duration?.[0]) || 8;

        // 批量创建片段并关联分镜
        const storyboardIds = pendingStoryboards.map((s) => s.id).filter(Boolean);
        const { data } = await axios.post("/production/workbench/batchAddTracks", {
          projectId: project.value?.id,
          scriptId: episodesId.value ?? 0,
          duration,
          storyboardIds,
        });

        emit("getData");

        loading.hide();
        const createdCount = Array.isArray(data) ? data.length : count;
        window.$message.success(`成功创建 ${createdCount} 个片段并关联分镜图片`);
      } catch (e) {
        window.$message.error("创建失败：" + (e as any)?.message);
      } finally {
        dialog.destroy();
      }
    },
  });
}

/** 获取 URL 中的文件扩展名 */
function getFileExtension(url: string): string {
  const ext = url.split(".").pop()?.split(/[#?]/)[0];
  return ext || "mp4";
}
/** 批量下载已勾选轨道的选中视频，打包为 zip */
async function batchDownloadVideo(): Promise<void> {
  const zip = new JSZip();
  const selectedTracks = trackList.value.filter((track) => checkedTrackIds.value.includes(track.id));
  const tasks = selectedTracks
    .map((track) => {
      const video = track.videoList.find((v) => v.id === track.selectVideoId);
      if (!video?.src) return null;
      const filename = `分镜${track.id}.${getFileExtension(video.src)}`;
      return fetch(video.src)
        .then((res) => res.blob())
        .then((blob) => zip.file(filename, blob))
        .catch((err) => console.error(`视频下载失败: ${video.src}`, err));
    })
    .filter(Boolean);
  await Promise.all(tasks);
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `视频批量下载_${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  checkedTrackIds.value = [];
  checkAll.value = false;
}

function importSelectedToEditor() {
  const items = trackList.value
    .filter((track) => checkedTrackIds.value.includes(track.id))
    .map((track) => {
      const video = track.videoList?.find((item) => item.id === track.selectVideoId && item.src);
      if (!video?.src) return null;
      return { trackId: track.id, videoId: video.id, src: video.src, duration: Number(track.duration || 3) };
    })
    .filter((item): item is { trackId: number; videoId: number; src: string; duration: number } => Boolean(item));

  if (!items.length) {
    window.$message.warning("请先在生成结果下采用要剪辑的视频版本");
    return;
  }
  emit("importVideo", items);
  checkedTrackIds.value = [];
  checkAll.value = false;
}
const generateTextLoad = ref(false);
function batchGenText() {
  generateTextLoad.value = true;
  const trackData: any[] = [];
  trackList.value.forEach((track, index) => {
    if (!checkedTrackIds.value.includes(track.id)) return;
    const trackId = track.id;
    let info = [];
    if (props.modelParmas.mode == "text") {
      info = track?.medias.map(({ id, sources }) => ({ id, sources }));
    } else {
      info = getTrackUploadInfo(track);
    }
    trackData.push({
      trackId,
      info: info.filter((i) => typeof i.id === "number" && !isNaN(i.id)),
    });
    track.state = "生成中";
  });
  axios
    .post("/production/workbench/batchGeneratePrompt", {
      projectId: project.value?.id,
      trackData,
      model: props.modelParmas.model,
      mode: props.modelParmas.mode,
      concurrentCount: otherSetting.value.assetsBatchGenereateSize,
    })
    .then(({ data }) => {
      window.$message.success("开始生成提示词");
      generateTextLoad.value = false;
      checkedTrackIds.value = [];
      checkAll.value = false;
    })
    .catch((e) => {
      window.$message.error(e?.message ?? "生成提示词失败");
      trackList.value.forEach((i) => {
        i.state = "生成失败";
      });
    })
    .finally(() => {});
}
/**
 * 获取指定轨道的上传数据：
 * 当前活动轨道 → uploadBox（含未保存的最新编辑）
 * 其他轨道 → uploadBoxCache（含切换前的编辑）→ 降级 track.medias
 * @param filterEmpty 是否过滤掉没有 src 的项（生成视频时需要过滤，生成提示词时不需要）
 */
function getTrackUploadInfo(track: TrackItem, filterEmpty = false) {
  const items: (UploadItem | TrackMedia)[] = track.id === trackList.value[activeTrackIndex.value]?.id ? props.imageList : track.medias;
  return videoReferenceItems(props.modelParmas.mode, items, props.referenceAllowance).map(({ id, sources }) => ({ id, sources: sources! }));
}

const generateVideoLoad = ref(false);
/** 批量为已勾选轨道生成视频 */
function batchGenVideo() {
  const dlg = DialogPlugin.confirm({
    header: $t("workbench.generate.generateConfirm"),
    body: $t("workbench.generate.generateVideosInBatches"),
    onConfirm: async () => {
      dlg.destroy();

      const checkedTrackData = trackList.value.filter((track) => checkedTrackIds.value.includes(track.id));
      const notHasPrompt = checkedTrackData.filter((i) => !i.prompt);
      if (notHasPrompt.length) return window.$message.warning($t("workbench.generate.skipDataWithEmptyVideoPromptWords"));

      for (const track of checkedTrackData) {
        const refs = track.id === trackList.value[activeTrackIndex.value]?.id ? props.imageList : track.medias;
        const problem = videoReferenceError(props.modelParmas.mode, refs, props.referenceAllowance);
        if (problem) return window.$message.warning(`${props.trackLabels?.[track.id] || "所选镜头"}：${problem}`);
      }
      const trackData = checkedTrackData.map((track) => {
        const trackId = track.id;
        const uploadData = props.modelParmas.mode === "text" ? [] : getTrackUploadInfo(track, true);
        return {
          duration: props.clampDuration(track.duration || props.modelParmas.duration),
          prompt: track.prompt,
          uploadData,
          trackId,
        };
      });
      const requestData = {
        projectId: project.value?.id,
        scriptId: episodesId.value,
        model: props.modelParmas.model,
        mode: props.modelParmas.mode,
        resolution: props.modelParmas.resolution,
        audio: Boolean(props.modelParmas.audio),
        trackData,
      };
      generateVideoLoad.value = true;
      try {
        const { data } = await axios.post("/production/workbench/batchGenerateVideo", requestData);
        const videoRecordId: Record<number, number> = {};
        const tasks = Array.isArray(data) ? data : data?.tasks;
        if (!Array.isArray(tasks)) throw Error("任务已提交但返回格式异常，请刷新任务状态，避免重复生成");
        tasks.forEach((item: { videoId: number; trackId: number }) => {
          videoRecordId[item.trackId] = item.videoId;
        });
        checkedTrackData.forEach((i) => {
          if (videoRecordId[i.id])
            i.videoList.push({
              id: videoRecordId[i.id],
              state: "生成中",
              src: "",
            });
        });
        checkedTrackIds.value = [];
        window.$message.success($t("workbench.generate.generateStarted"));
      } catch (e) {
        window.$message.error((e as any)?.message ?? $t("workbench.generate.generateError"));
      } finally {
        generateVideoLoad.value = false;
      }
    },
    onCancel: () => dlg.destroy(),
  });
}

/** 全选 / 取消全选轨道 */
function handleCheckAll(val: boolean) {
  const allIds = trackList.value.map((t) => t.id).filter((id): id is number => id != null);
  checkedTrackIds.value = val ? allIds : [];
}

/** 单个勾选轨道 */
function toggleCheck(trackId: number | undefined, val: boolean) {
  if (trackId == null) return;
  if (val) {
    if (!checkedTrackIds.value.includes(trackId)) checkedTrackIds.value.push(trackId);
  } else {
    checkedTrackIds.value = checkedTrackIds.value.filter((id) => id !== trackId);
  }
  const allIds = trackList.value.map((t) => t.id).filter((id): id is number => id != null);
  checkAll.value = allIds.length > 0 && allIds.every((id) => checkedTrackIds.value.includes(id));
}

// 轨道列表变化时，截取选中视频首帧（只监听 selectVideoId 和 videoList 变化，避免深度监听整个 trackList）
watch(
  () => trackList.value.map((t) => ({ selectVideoId: t.selectVideoId, videoList: t.videoList })),
  () => {
    trackList.value.forEach((track) => {
      const src = getSelectedVideoSrc(track);
      if (src) captureVideoCover(src);
    });
  },
  { deep: true, immediate: true },
);
</script>

<style scoped lang="scss">
.tracksPending {
  background: var(--studio-bg);
  border: 1px solid var(--studio-line);
  color: var(--studio-accent);
  border-radius: 7px;
  padding: 8px 10px;
  margin: 0 12px 10px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}
.studioTracks {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 13px;
  color: var(--studio-text);
  background: var(--studio-white);
  padding: 20px 16px 15px;
  box-sizing: border-box;
}
.tracksHeading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tracksHeading strong {
  font-size: 16px;
  font-weight: 600;
}
.tracksHeading > span {
  font-size: 12px;
  color: var(--studio-muted);
  white-space: nowrap;
}
.studioShotList {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 2px 2px 5px;
}
.studioShot {
  position: relative;
  flex: none;
  padding: 9px;
  border: 1px solid var(--studio-line);
  border-radius: 15px;
  background: var(--studio-bg);
  transition: border-color 0.15s;
}
.studioShot.active {
  border-color: var(--studio-accent);
  box-shadow: 0 0 0 1px var(--studio-accent);
}
.shotPick {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 9px;
  padding: 0;
  border: 0;
  text-align: left;
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  cursor: pointer;
}
.shotPick > strong {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
.shotThumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  border-radius: 11px;
  overflow: hidden;
  background: var(--studio-field);
}
.shotThumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.shotThumbEmpty {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--studio-muted);
}
.shotBusy {
  position: absolute;
  bottom: 5px;
  right: 5px;
  background: #24211cbb;
  border-radius: 4px;
  padding: 3px 6px;
  color: #fff;
  font-size: 10px;
}
.shotDetails {
  font-size: 12px;
  color: var(--studio-muted);
  line-height: 1.5;
  padding-bottom: 2px;
}
.shotDetails i {
  font-style: normal;
  padding: 0 3px;
}
.shotCheck {
  position: absolute;
  top: 14px;
  left: 14px;
  width: 16px;
  height: 16px;
  accent-color: var(--studio-accent);
}
.tracksFooter {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.batchToggle,
.tracksBatch button,
.tracksFooter details button {
  padding: 9px;
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  background: var(--studio-white);
  color: var(--studio-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.batchToggle:hover,
.batchToggle.active {
  background: var(--studio-field);
}
.tracksFooter details {
  font-size: 11px;
  color: var(--studio-muted);
}
.tracksFooter summary {
  padding: 3px;
  text-align: center;
  cursor: pointer;
}
.tracksFooter details button {
  display: block;
  width: 100%;
  font-size: 11px;
  margin-top: 6px;
  padding: 7px;
}
.tracksBatch {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 11px;
  color: var(--studio-muted);
}
.tracksBatch > label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tracksBatch > label span {
  margin-left: auto;
}
.tracksBatch input {
  accent-color: var(--studio-accent);
}
.tracksBatch > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}
.tracksBatch button {
  font-size: 11px;
  padding: 6px 4px;
}
.studioTracks button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
@media (max-width: 760px) {
  .studioTracks {
    padding: 14px;
    gap: 10px;
  }
  .studioShotList {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .studioShot {
    width: 155px;
  }
  .tracksFooter {
    flex-direction: row;
    align-items: center;
  }
  .batchToggle {
    flex: 1;
  }
  .tracksFooter details {
    flex: 1;
  }
}
</style>
