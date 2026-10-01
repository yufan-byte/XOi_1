<template>
  <div class="videoTrack">
    <t-card bordered :style="{ height: '100%' }">
      <div class="trackMenu f ac jb">
        <div class="left f ac">
          <t-checkbox v-model="checkAll" @change="handleCheckAll">{{ $t("workbench.generate.selectAll") }}</t-checkbox>
          <span class="selectedCount" v-if="checkedTrackIds.length">{{ $t("workbench.generate.selected") }} {{ checkedTrackIds.length }} 段</span>
        </div>
        <div class="right f ac">
          <t-button size="small" variant="outline" :disabled="!checkedTrackIds.length" @click="batchDownloadVideo" title="下载已勾选镜头的已采用视频">
            下载视频
          </t-button>
          <t-button size="small" variant="outline" :disabled="!checkedTrackIds.length" @click="importSelectedToEditor" title="把已采用的视频加入剪辑台">
            导入剪辑台
          </t-button>
          <t-button size="small" variant="outline" :disabled="!checkedTrackIds.length" @click="batchGenText" :loading="generateTextLoad" title="为已勾选镜头生成提示词">
            生成提示词
          </t-button>
          <t-button size="small" theme="primary" :disabled="!checkedTrackIds.length" @click="batchGenVideo" :loading="generateVideoLoad" title="为已勾选镜头生成视频">
            批量生成视频
          </t-button>
          <!-- <t-button size="small" variant="outline" @click="importVideo">{{ $t("workbench.generate.importVideo") }}</t-button> -->
        </div>
      </div>
      <div class="itemBox">
        <div
          class="item"
          :class="{ active: index === activeTrackIndex }"
          v-for="(track, index) in trackList"
          :key="track.id"
          @click="changeIndex(index)">
          <t-checkbox
            class="trackCheck"
            :checked="track.id != null && checkedTrackIds.includes(track.id)"
            @click.stop
            @change="(val: boolean) => toggleCheck(track.id, val)" />
          <t-tag class="indexTag" size="small">#{{ index + 1 }}</t-tag>
          <t-tag class="selectTag" theme="success" size="small" v-if="track.selectVideoId">已选择</t-tag>
          <!-- 优先展示选中视频的首帧 -->
          <div class="thumbGroup" v-if="track.selectVideoId && getSelectedVideoSrc(track)">
            <img
              v-if="videoCoverMap[getSelectedVideoSrc(track)!]"
              class="thumb selectedVideoThumb"
              :src="videoCoverMap[getSelectedVideoSrc(track)!]"
              draggable="false" />
            <div v-else class="thumb placeholder c">
              <i-video size="24" />
            </div>
          </div>
          <!-- 无选中视频时展示参考素材缩略图 -->
          <div class="thumbGroup" v-else-if="track.medias.some((m) => m.src)">
            <template v-for="(m, i) in track.medias" :key="i">
              <template v-if="m.src">
                <t-image fit="cover" v-if="m.fileType === 'image'" :src="m.src" class="thumb" />
                <div v-else class="thumb placeholder c">
                  <i-volume-notice v-if="m.fileType === 'audio'" size="20" />
                  <i-video v-else size="24" />
                </div>
              </template>
            </template>
          </div>
          <span v-else class="emptyTrack">{{ $t("workbench.generate.emptyTrack", { index: index + 1 }) }}</span>
          <div class="trackMeta">
            <span class="trackState" :class="trackStateClass(track)">{{ trackStateLabel(track) }}</span>
            <span class="trackDuration">{{ track.duration || 0 }}s</span>
          </div>
          <div class="deleteBtn" @click.stop="confirmDeleteTrack(index)">
            <i-close size="14" />
          </div>
        </div>
        <div class="item addItem c" @click="addTrack">
          <i-plus size="36"></i-plus>
        </div>
        <div class="item addItem c batchCreateBtn" :class="{ disabled: !pendingStoryboardCount }" @click="batchCreateFromStoryboard" v-if="props.storyboardList?.length">
          <t-tooltip :content="pendingStoryboardCount ? `根据分镜批量创建（剩余 ${pendingStoryboardCount} 个）` : '分镜已全部创建片段'">
            <i-copy size="24"></i-copy>
          </t-tooltip>
        </div>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
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
  imageList: UploadItem[];
  storyboardList?: StoryboardItem[];
  clampDuration: (trackDuration: number) => number;
}>();
const activeTrackIndex = defineModel("activeTrackIndex", {
  default: 0,
});
const checkedTrackIds = ref<number[]>([]); // 已勾选的轨道 id
const trackList = defineModel<TrackItem[]>({
  default: () => [],
});
const emit = defineEmits<{
  getData: [];
  change: [prevIndex: number];
  saveImageList: [trackId: number];
  importVideo: [{ trackId: number; videoId: number; src: string; duration: number }[]];
}>();
const checkAll = ref(false); // 全选状态
const pendingStoryboardCount = computed(() => (props.storyboardList ?? []).filter((storyboard) => !storyboard.trackId).length);

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
      video.currentTime = 0;
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
  return ({ processing: "生成中", failed: "需重试", selected: "已采用", ready: "待选择", prompted: "可生成", todo: "待准备" } as Record<string, string>)[state];
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
    window.$message.warning("请先在右侧视频版本中点击 ✓ 选择要剪辑的版本");
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
  const activeTrackId = trackList.value[activeTrackIndex.value]?.id;

  if (track.id === activeTrackId) {
    const items = props.imageList as UploadItem[];
    return (filterEmpty ? items.filter((item) => Boolean(item.src)) : items).map(({ id, sources }) => ({
      id,
      sources: (sources ?? "storyboard") as string,
    }));
  }
  return track.medias.filter((m) => !filterEmpty || Boolean(m.src)).map(({ id, sources }) => ({ id, sources: (sources ?? "storyboard") as string }));
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
      try {
        const { data } = await axios.post("/production/workbench/batchGenerateVideo", requestData);
        const videoRecordId: Record<number, number> = {};
        data.forEach((item: { videoId: number; trackId: number }) => {
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

<style lang="scss" scoped>
.videoTrack {
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  .trackMenu {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--td-border-level-1-color);
    .selectedCount {
      font-size: 12px;
      color: var(--td-text-color-secondary);
      margin-left: 8px;
      animation: fadeIn 200ms ease-out;
    }
    .left { width: 100%; min-width: 0; }
    .right {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      .t-button { border-radius: 7px; white-space: nowrap; }
    }
  }
  .itemBox {
    height: auto;
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    gap: 10px;
    padding-bottom: 6px;
    &::-webkit-scrollbar {
      height: 6px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    }
    .item {
      border-radius: 12px;
      flex-shrink: 0;
      width: 100%;
      height: 78px;
      border: 1px solid var(--td-gray-color-3);
      overflow: hidden;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      position: relative;
      transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
      }
      &:active {
        transform: scale(0.97);
      }
      &.active {
        border-color: var(--td-brand-color);
        border-width: 2px;
        box-shadow: 0 0 0 3px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.2), 0 8px 24px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.15);
        background: linear-gradient(180deg, rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.06) 0%, transparent 100%);
        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 0 3px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.2), 0 10px 28px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.2);
        }
      }
      .indexTag {
        position: absolute;
        bottom: 4px;
        left: 4px;
        z-index: 2;
        backdrop-filter: blur(8px);
        background: rgba(0, 0, 0, 0.5) !important;
        color: #fff !important;
        border: none !important;
      }
      .selectTag {
        position: absolute;
        bottom: 4px;
        right: 4px;
        z-index: 1;
        backdrop-filter: blur(8px);
      }
      .trackMeta {
        position: absolute;
        left: 8px;
        right: 8px;
        top: 8px;
        z-index: 3;
        display: flex;
        justify-content: space-between;
        align-items: center;
        pointer-events: none;
        .trackState, .trackDuration { padding: 3px 6px; border-radius: 6px; background: rgba(15, 23, 42, .72); color: #fff; font-size: 10px; backdrop-filter: blur(8px); }
        .trackState.selected { background: rgba(22, 140, 108, .88); }
        .trackState.processing { background: rgba(37, 99, 235, .88); }
        .trackState.failed { background: rgba(220, 38, 38, .88); }
        .trackState.ready { background: rgba(217, 119, 6, .88); }
      }
      .thumbGroup {
        width: 104px;
        height: 76px;
        flex: 0 0 104px;
        display: flex;
        .thumb {
          flex: 1;
          min-width: 0;
          height: 100%;
          object-fit: cover;
          transition: transform 300ms ease;
        }
        .placeholder {
          background: var(--td-bg-color-secondarycontainer);
          color: var(--td-text-color-placeholder);
          font-size: 12px;
        }
      }
      &:hover .thumbGroup .thumb {
        transform: scale(1.03);
      }
      .emptyTrack {
        color: var(--td-text-color-placeholder);
        font-size: 12px;
      }
      .trackMeta { left: 120px; right: 28px; top: 50px; justify-content: flex-start; gap: 6px; }
      .trackCheck {
        position: absolute;
        top: 4px;
        left: 4px;
        z-index: 2;
      }
      .deleteBtn {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(4px);
        color: #fff;
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 1;
        transition: background-color 150ms ease, transform 100ms ease;
        &:hover {
          background: rgba(220, 50, 50, 0.85);
          transform: scale(1.1);
        }
        &:active {
          transform: scale(0.9);
        }
      }
      &:hover .deleteBtn {
        display: flex;
      }
    }
    .addItem { min-height: 56px; height: 56px; width: 100%; }
    .addItem {
      border: 2px dashed var(--td-component-border);
      cursor: pointer;
      border-radius: 12px;
      transition: border-color 200ms ease, background-color 200ms ease, transform 100ms ease;
      &:hover {
        border-color: var(--td-brand-color);
        background: rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.04);
        transform: scale(1.02);
      }
      &:active {
        transform: scale(0.97);
      }
    }
    .batchCreateBtn {
      min-width: 60px;
      border: 2px dashed var(--td-brand-color);
      color: var(--td-brand-color);
      &:hover {
        background: rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.1);
      }
      &.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        &:hover { transform: none; background: transparent; }
      }
    }
    .selectedVideoThumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
      user-select: none;
      display: block;
    }
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
