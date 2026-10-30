<template>
  <section class="shotPreview" aria-label="当前镜头预览与版本">
    <header class="previewHeader">
      <strong>{{ title || `镜头 ${activeTrackIndex + 1}` }}</strong>
      <div class="previewTabs">
        <button type="button" :class="{ active: view === 'image' }" :aria-pressed="view === 'image'" @click="view = 'image'">分镜参考</button>
        <button type="button" :class="{ active: view === 'video' }" :aria-pressed="view === 'video'" @click="view = 'video'">生成结果</button>
      </div>
    </header>
    <div class="previewScreen">
      <div class="previewMedia">
        <img v-if="view === 'image' && storyboardImage" :src="storyboardImage" alt="本镜分镜画面" />
        <video
          v-else-if="view === 'video' && preview?.src && preview.state === '已完成'"
          :key="preview.id + ':' + preview.src"
          :src="preview.src"
          controls
          playsinline
          preload="auto" />
        <div v-else class="previewEmpty">
          <t-loading v-if="preview?.state === '生成中'" />
          <strong>
            {{
              preview?.state === "生成中"
                ? "这个版本正在生成"
                : preview?.state === "生成失败"
                  ? "这个版本未能完成"
                  : view === "image"
                    ? "等待本镜分镜画面"
                    : "为这一镜生成第一个视频版本"
            }}
          </strong>
          <small>{{ preview?.errorReason || "原采用版本会保留，你可以继续检查或调整其他镜头。" }}</small>
        </div>
        <span v-if="view === 'video' && preview?.state === '已完成'" class="previewCaption">视频 V{{ previewNumber }}</span>
      </div>
    </div>
    <div class="versionToolbar">
      <span>视频版本</span>
      <div class="versionList">
        <button
          v-for="(v, i) in currentTrack?.videoList"
          :key="v.id"
          type="button"
          :class="{ active: preview?.id === v.id }"
          :aria-pressed="preview?.id === v.id"
          @click="
            previewId = v.id;
            view = 'video';
          ">
          V{{ i + 1 }}
          <small v-if="v.state === '生成中'">生成中</small>
          <small v-else-if="v.state === '生成失败'">失败</small>
        </button>
        <small v-if="!currentTrack?.videoList.length" class="noVersions">暂无版本</small>
      </div>
      <div v-if="preview?.state === '已完成' && preview.src" class="versionActions">
        <span v-if="preview.id === currentTrack?.selectVideoId" class="adoptedFlag">已采用 V{{ previewNumber }}</span>
        <button v-else type="button" class="adoptButton" :disabled="adopting" @click="adopt">
          {{ adopting ? "正在采用…" : `采用 V${previewNumber}` }}
        </button>
        <details class="versionMore">
          <summary aria-label="当前视频版本更多操作">···</summary>
          <div>
            <button type="button" @click="download">下载这个版本</button>
            <button type="button" @click="removeVersion">删除这个版本</button>
          </div>
        </details>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, inject, type Ref } from "vue";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import "@/views/production/components/workbench/type/type";
const props = defineProps<{ activeTrackIndex: number; storyboardImage?: string; title?: string }>();
const currentTrack = defineModel<TrackItem | undefined>("currentTrack");
const emit = defineEmits<{ refresh: []; inspectContinuity: []; versionChange: [value: VideoItem | undefined] }>();
const episode = inject<Ref<number>>("episodesId")!;
const project = projectStore();
const previewId = ref<number>(),
  view = ref<"image" | "video">("video"),
  adopting = ref(false);
const preview = computed(() => currentTrack.value?.videoList.find((v) => v.id === previewId.value));
const previewNumber = computed(() => (currentTrack.value?.videoList.findIndex((v) => v.id === preview.value?.id) ?? -1) + 1);
watch(
  () => currentTrack.value?.id,
  () => {
    const t = currentTrack.value;
    previewId.value = t?.selectVideoId || t?.videoList.filter((v) => v.state === "已完成").at(-1)?.id || t?.videoList.at(-1)?.id;
    view.value = "video";
  },
  { immediate: true },
);
watch(
  () => currentTrack.value?.videoList.map((v) => v.id).join(","),
  () => {
    if (!preview.value) previewId.value = currentTrack.value?.selectVideoId || currentTrack.value?.videoList.at(-1)?.id;
  },
);
watch(preview, (value) => emit("versionChange", value), { immediate: true });
async function adopt() {
  const track = currentTrack.value,
    version = preview.value,
    scriptId = episode.value;
  if (!track || !version?.src || version.state !== "已完成" || adopting.value) return;
  adopting.value = true;
  try {
    await axios.post("/production/workbench/selectVideo", {
      projectId: Number(project.project?.id),
      scriptId,
      trackId: track.id,
      videoId: version.id,
    });
    if (scriptId !== episode.value) return;
    track.selectVideoId = version.id;
    window.$message.success("已采用该版本，已有剪辑草稿继续保留");
  } finally {
    adopting.value = false;
  }
}
async function download() {
  const v = preview.value;
  if (!v?.src) return;
  try {
    const response = await fetch(v.src);
    if (!response.ok) throw Error("下载失败");
    const url = URL.createObjectURL(await response.blob()),
      a = document.createElement("a");
    a.href = url;
    a.download = `镜头${props.activeTrackIndex + 1}-视频${v.id}.mp4`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    window.$message.error("下载失败，请稍后重试");
  }
}
function removeVersion() {
  const v = preview.value,
    track = currentTrack.value;
  if (!v || !track) return;
  if (v.id === track.selectVideoId) return window.$message.warning("请先采用另一个版本，再删除当前采用版本");
  const dlg = DialogPlugin.confirm({
    header: "删除这个视频版本？",
    body: "已有采用版本不会改变。",
    onConfirm: async () => {
      await axios.post("/production/workbench/delVideo", { id: v.id });
      track.videoList = track.videoList.filter((item) => item.id !== v.id);
      dlg.destroy();
    },
    onCancel: () => dlg.destroy(),
  });
}
</script>

<style scoped lang="scss">
.shotPreview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 340px;
  color: var(--studio-text);
}
.previewHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex: none;
}
.previewHeader > strong {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.2px;
}
.previewTabs {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px;
  background: var(--studio-field);
  border-radius: 10px;
  flex: none;
}
.previewTabs button {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  padding: 6px 13px;
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.previewTabs button.active {
  background: var(--studio-white);
  color: var(--studio-text);
  box-shadow: 0 1px 3px #1f170c06;
}
.previewScreen {
  flex: 1;
  height: auto;
  min-height: 270px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--studio-line) 72%, transparent);
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--studio-white) 92%, transparent), transparent 58%),
    color-mix(in srgb, var(--studio-field) 62%, var(--studio-white));
}
.previewMedia {
  position: relative;
  width: auto;
  max-width: 100%;
  height: calc(100% - 24px);
  max-height: 304px;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
  border-radius: 14px;
  box-shadow: 0 18px 44px -28px #20150e8a;
}
.previewMedia > video,
.previewMedia > img {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  object-fit: contain;
  border-radius: 14px;
  background: #171719;
}
.previewEmpty {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  height: 100%;
  width: 100%;
  max-width: 100%;
  padding: 20px;
  box-sizing: border-box;
  background: var(--studio-field);
  border-radius: 12px;
  text-align: center;
}
.previewEmpty strong {
  font-size: 16px;
  font-weight: 500;
}
.previewEmpty small {
  font-size: 12px;
  line-height: 1.8;
  color: var(--studio-muted);
}
.previewCaption {
  position: absolute;
  top: 11px;
  left: 12px;
  background: #161512a8;
  color: #f5eee7;
  border-radius: 6px;
  padding: 5px 9px;
  font-size: 11px;
  pointer-events: none;
}
.versionToolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 34px;
  flex: none;
  font-size: 12px;
}
.versionToolbar > span {
  color: var(--studio-muted);
}
.versionList {
  display: flex;
  gap: 6px;
  flex: 1;
  flex-wrap: wrap;
}
.versionList button {
  padding: 4px 9px;
  min-width: 37px;
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  background: var(--studio-white);
  color: var(--studio-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.versionList button.active {
  color: var(--studio-accent);
  border-color: var(--studio-accent);
}
.versionList small {
  font-size: 10px;
  margin-left: 4px;
}
.versionActions {
  display: flex;
  gap: 7px;
  align-items: center;
  margin-left: auto;
}
.adoptedFlag,
.adoptButton {
  padding: 4px 10px;
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  background: var(--studio-white);
  color: var(--studio-text);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
}
.adoptButton {
  cursor: pointer;
  color: var(--studio-accent);
  border-color: var(--studio-accent);
}
.versionMore {
  position: relative;
}
.versionMore summary {
  list-style: none;
  font-size: 18px;
  line-height: 24px;
  color: var(--studio-muted);
  padding: 2px 7px;
  border-radius: 5px;
  cursor: pointer;
}
.versionMore summary::-webkit-details-marker {
  display: none;
}
.versionMore[open] summary {
  background: var(--studio-field);
}
.versionMore > div {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 3;
  min-width: 145px;
  padding: 5px;
  background: var(--studio-white);
  border: 1px solid var(--studio-line);
  border-radius: 9px;
  box-shadow: 0 6px 25px #30261b12;
}
.versionMore button {
  display: block;
  width: 100%;
  padding: 8px 11px;
  text-align: left;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--studio-text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.versionMore button:hover {
  background: var(--studio-field);
}
.noVersions {
  font-size: 11px;
  color: var(--studio-muted);
}
@media (max-width: 1000px) {
  .previewScreen {
    height: clamp(240px, 38vh, 360px);
  }
  .previewHeader > strong {
    font-size: 16px;
  }
}
@media (max-width: 760px) {
  .previewScreen {
    height: auto;
    min-height: 210px;
    aspect-ratio: 16/10;
  }
  .previewMedia {
    width: 100%;
    height: 100%;
  }
  .previewMedia > video,
  .previewMedia > img {
    width: 100%;
    height: 100%;
  }
  .previewHeader {
    gap: 8px;
    margin-bottom: 7px;
  }
  .previewTabs button {
    padding: 6px 9px;
    font-size: 11px;
  }
  .previewHeader > strong {
    font-size: 13px;
  }
}
</style>
