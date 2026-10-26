<template>
  <div class="episodePlayback">
    <header>
      <div>
        <strong>本集连播</strong>
        <small>使用已采用的视频版本；未完成片段以分镜图明确占位。</small>
      </div>
      <div>
        <t-button v-if="!videoOnly" size="small" :variant="mode === 'adopted' ? 'base' : 'outline'" @click="mode = 'adopted'">已采用视频</t-button>
        <t-button
          v-if="!videoOnly"
          size="small"
          :variant="mode === 'images' ? 'base' : 'outline'"
          @click="
            mode = 'images';
            pause();
          ">
          分镜预演 / 导出
        </t-button>
        <t-button size="small" variant="text" @click="emit('go-generate')">返回镜头制作</t-button>
      </div>
    </header>
    <StoryboardPreview v-if="mode === 'images'" class="storyboardPlayback" @go-generate="emit('go-generate')" />
    <div v-else-if="items.length" class="episodeBody">
      <main>
        <div class="episodeScreen">
          <video
            v-if="current?.video"
            ref="player"
            :key="current.id"
            :data-clip-id="current.id"
            :src="current.video"
            :poster="current.image"
            controls
            playsinline
            preload="auto"
            @play="playing = true"
            @pause="onPause"
            @ended="advance"
            @error="
              playError = '视频暂时无法播放，请返回制作检查该版本';
              pause();
            " />
          <template v-else>
            <img v-if="current?.image" :src="current.image" alt="未完成片段的分镜占位图" />
            <div v-else class="episodeEmpty">本片段还没有画面</div>
            <span class="imagePlaceholder">分镜图占位 · 尚无采用视频</span>
          </template>
        </div>
        <div class="episodeControls">
          <t-button variant="outline" :disabled="index === 0" @click="select(index - 1)">上一片段</t-button>
          <t-button theme="primary" @click="toggle">{{ playing ? "暂停连播" : "播放本集" }}</t-button>
          <t-button variant="outline" :disabled="index === items.length - 1" @click="select(index + 1)">下一片段</t-button>
          <span>{{ index + 1 }} / {{ items.length }} · {{ current?.label }}</span>
        </div>
        <p v-if="playError" role="alert">{{ playError }}</p>
        <p v-if="!current?.video">当前片段用分镜图预演 {{ current?.duration }} 秒；不会被计为已生成视频。</p>
      </main>
      <aside>
        <button v-for="(item, i) in items" :key="item.id" type="button" :class="{ active: index === i }" @click="select(i)">
          <strong>{{ item.label }}</strong>
          <span>{{ item.video ? "已采用视频" : "分镜图占位" }}</span>
        </button>
      </aside>
    </div>
    <t-loading v-else-if="loading" class="episodeLoading" />
    <t-empty v-else :description="loadError || '本集还没有视频片段，请返回镜头制作'" />
  </div>
</template>
<script setup lang="ts">
import { storyboardTrackCode } from "../../utils/studioWorkflow";
import { computed, ref, inject, watch, nextTick, onMounted, onUnmounted, type Ref } from "vue";
import axios from "@/utils/axios";
import { continuityImageUrl } from "@/utils/continuityAnalysis";
import projectStore from "@/stores/project";
import StoryboardPreview from "./preview.vue";
defineProps<{ videoOnly?: boolean }>();
const emit = defineEmits<{ "go-generate": [] }>();
const episode = inject<Ref<number>>("episodesId")!;
const project = projectStore();
const mode = ref<"adopted" | "images">("adopted"),
  index = ref(0),
  player = ref<HTMLVideoElement>();
const playing = ref(false),
  loading = ref(true),
  loadError = ref(""),
  playError = ref("");
const items = ref<{ id: number; label: string; video?: string; image?: string; duration: number }[]>([]);
const current = computed(() => items.value[index.value]);
let timer: ReturnType<typeof setTimeout> | undefined,
  disposed = false;
function pause() {
  playing.value = false;
  player.value?.pause();
  clearTimeout(timer);
}
function onPause(event: Event) {
  const video = event.currentTarget as HTMLVideoElement;
  if (video !== player.value || Number(video.dataset.clipId) !== current.value?.id) return;
  if (!video.ended) playing.value = false;
}
async function playCurrent() {
  clearTimeout(timer);
  await nextTick();
  if (!playing.value || disposed) return;
  if (current.value?.video && player.value) {
    if (player.value.ended) player.value.currentTime = 0;
    try {
      await player.value.play();
    } catch {
      playing.value = false;
      playError.value = "浏览器已暂停自动播放，点击播放本集继续。";
    }
  } else timer = setTimeout(advance, (current.value?.duration || 3) * 1000);
}
function advance() {
  if (index.value >= items.value.length - 1) {
    pause();
    return;
  }
  index.value++;
  playing.value = true;
  void playCurrent();
}
function select(next: number) {
  index.value = next;
  playError.value = "";
  void playCurrent();
}
function toggle() {
  if (playing.value) pause();
  else {
    playing.value = true;
    playError.value = "";
    void playCurrent();
  }
}
watch(mode, () => pause());
onMounted(async () => {
  try {
    const scriptId = episode.value;
    const { data } = await axios.post("/production/workbench/getGenerateData", { projectId: Number(project.project?.id), scriptId });
    if (disposed || scriptId !== episode.value) return;
    items.value = data.trackList.map((track: TrackItem, i: number) => {
      const frames = data.storyboardList.filter((s: StoryboardItem) => Number(s.trackId) === track.id);
      const video = track.videoList.find((v) => v.id === track.selectVideoId && v.state === "已完成" && v.src);
      return {
        id: track.id,
        label: storyboardTrackCode(data.storyboardList, track.id, i),
        video: video?.src,
        image: continuityImageUrl(frames.find((s: StoryboardItem) => s.src)?.src),
        duration: Number(track.duration) || 3,
      };
    });
  } catch (e: any) {
    loadError.value = e.message || "读取本集失败，请返回后重试";
  } finally {
    loading.value = false;
  }
});
onUnmounted(() => {
  disposed = true;
  pause();
});
</script>
<style scoped lang="scss">
.episodePlayback {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--td-text-color-primary);
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
header strong {
  font-size: 17px;
}
header small {
  display: block;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-top: 5px;
}
header > div:last-child {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.episodeBody {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 210px;
  gap: 16px;
}
.episodeBody main {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.episodeScreen {
  position: relative;
  flex: 1;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #17171a;
  border-radius: 12px;
  overflow: hidden;
}
.episodeScreen video,
.episodeScreen img {
  height: 100%;
  width: 100%;
  object-fit: contain;
}
.episodeEmpty {
  color: #d1c8c0;
}
.imagePlaceholder {
  position: absolute;
  bottom: 12px;
  left: 12px;
  background: #171719cc;
  color: #fff;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 12px;
}
.episodeControls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.episodeControls span,
p {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
p {
  margin: 0;
}
aside {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
aside button {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  padding: 14px;
  border: 1px solid var(--td-component-border);
  border-radius: 9px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  cursor: pointer;
}
aside button.active {
  border-color: #d59570;
  background: var(--td-bg-color-secondarycontainer);
}
aside strong {
  font-size: 13px;
}
aside span {
  font-size: 11px;
  color: var(--td-text-color-secondary);
}
.storyboardPlayback {
  flex: 1;
  min-height: 0;
}
.episodeLoading {
  margin: auto;
}
@media (max-width: 650px) {
  .episodeBody {
    grid-template-columns: 1fr;
  }
  aside {
    max-height: 180px;
  }
  .episodeScreen {
    min-height: 240px;
  }
}
</style>
