<template>
  <section class="storyOverview" aria-label="本集分镜预览">
    <header class="overviewHeader">
      <div>
        <h2>整集分镜预览</h2>
        <p>
          {{ frames.length }} 个分镜 · {{ totalDuration }} 秒
          <span>看场景、构图与顺序，确认故事是否连得起来。</span>
          <small v-if="incompleteCount" class="overviewIncomplete">{{ incompleteCount }} 镜待补充描述或时长</small>
        </p>
      </div>
      <div class="overviewActions">
        <button type="button" :disabled="!frames.length" @click="openPlayer">▷ 按时长预演</button>
      </div>
    </header>
    <div v-if="frames.length" class="overviewGrid">
      <article v-for="(frame, i) in frames" :key="frame.id" class="overviewCard">
        <button type="button" class="overviewImage" :aria-label="`放大分镜 S${number(i)}`" @click="openFrame(i)">
          <img v-if="frame.src" :src="continuityImageUrl(frame.src)" :alt="`分镜 S${number(i)} · ${sceneName(frame)}`" />
          <div v-else class="overviewPlaceholder">
            <i-pic size="28" />
            <span>{{ frame.state === "生成中" ? "画面生成中" : "等待分镜画面" }}</span>
          </div>
          <span class="overviewIndex">S{{ number(i) }}</span>
          <span class="overviewTime">{{ frame.duration ? `${frame.duration} 秒` : "时长待定" }}</span>
          <span v-if="frame.state === '生成中' && frame.src" class="overviewBusy">重画中 · 原图</span>
        </button>
        <div class="overviewCopy">
          <strong>{{ sceneName(frame) }}</strong>
          <p :title="frame.videoDesc || frame.prompt">{{ frame.videoDesc || frame.prompt || "暂未填写镜头描述" }}</p>
        </div>
        <footer>
          <button type="button" @click="inspect(frame.id)">对照衔接</button>
          <button v-if="!(Number(frame.duration) > 0) || !(frame.videoDesc || frame.prompt)?.trim()" type="button" @click="emit('make', frame.id)">
            补齐镜头信息 →
          </button>
          <button v-else type="button" @click="emit('generate', frame.id)">制作这一镜 →</button>
        </footer>
      </article>
    </div>
    <div v-else class="overviewEmpty">
      <i-pic size="34" />
      <h3>本集还没有分镜</h3>
      <p>先完成导演计划与分镜表，再来预览场景画面。</p>
      <button type="button" @click="openPlan">前往分镜表 →</button>
    </div>
    <div v-if="frames.length" class="overviewNote">
      <i-info size="14" />
      这里预览的是分镜图片。视频页可自主选择文生视频或参考图生视频。
    </div>
    <t-dialog
      v-model:visible="viewerOpen"
      :header="`分镜 S${number(index)} · ${current ? sceneName(current) : ''}`"
      :footer="false"
      width="min(1100px,94vw)"
      attach="body"
      @close="stop">
      <div class="overviewViewer">
        <img v-if="current?.src" :src="continuityImageUrl(current.src)" :alt="`分镜 S${number(index)}`" />
        <div v-else class="overviewViewerEmpty">当前分镜尚未出图</div>
        <div class="overviewPlayerControls">
          <button type="button" :disabled="index === 0" @click="select(index - 1)">← 上一镜</button>
          <button type="button" @click="toggle">{{ playing ? "暂停预演" : "按时长预演" }}</button>
          <button type="button" :disabled="index === frames.length - 1" @click="select(index + 1)">下一镜 →</button>
          <span>S{{ number(index) }} / {{ frames.length }} · {{ current?.duration || 0 }} 秒</span>
        </div>
        <p>{{ current?.videoDesc || current?.prompt }}</p>
        <div class="overviewFilmstrip">
          <button v-for="(frame, i) in frames" :key="frame.id" type="button" :class="{ active: i === index }" @click="select(i)">
            S{{ number(i) }}
          </button>
        </div>
      </div>
    </t-dialog>
    <ContinuityInspector v-model:visible="inspectorOpen" :storyboard-id="inspectedId" />
  </section>
</template>
<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from "vue";
import productionAgentStore from "@/stores/productionAgent";
import { continuityImageUrl } from "@/utils/continuityAnalysis";
import type { Storyboard } from "../../utils/flowBuilder";
import ContinuityInspector from "../ContinuityInspector.vue";
const emit = defineEmits<{ generate: [storyboardId?: number]; make: [storyboardId?: number] }>();
const store = productionAgentStore();
const frames = computed(() => store.flowData.storyboard || []);
const assets = computed(() => store.flowData.assets.flatMap((a) => [a, ...(a.derive || [])]));
const incompleteCount = computed(() => frames.value.filter((f) => !f.duration || !(f.videoDesc || f.prompt)?.trim()).length);
const totalDuration = computed(() => Number(frames.value.reduce((n, f) => n + Number(f.duration || 0), 0).toFixed(1)));
const number = (i: number) => String(i + 1).padStart(2, "0");
function sceneName(frame: Storyboard) {
  return (
    assets.value.find((a) => a.type === "scene" && (a.id === frame.continuity?.sceneId || frame.associateAssetsIds?.includes(a.id)))?.name ||
    "场景待确认"
  );
}
const viewerOpen = ref(false),
  index = ref(0),
  playing = ref(false),
  inspectorOpen = ref(false),
  inspectedId = ref<number>();
const current = computed(() => frames.value[index.value]);
let timer: ReturnType<typeof setTimeout> | undefined;
function stop() {
  playing.value = false;
  clearTimeout(timer);
}
function schedule() {
  clearTimeout(timer);
  if (!playing.value) return;
  timer = setTimeout(
    () => {
      if (index.value >= frames.value.length - 1) return stop();
      index.value++;
      schedule();
    },
    Math.max(0.5, Number(current.value?.duration) || 3) * 1000,
  );
}
function select(i: number) {
  index.value = i;
  schedule();
}
function toggle() {
  if (playing.value) stop();
  else {
    playing.value = true;
    schedule();
  }
}
function openFrame(i: number) {
  stop();
  index.value = i;
  viewerOpen.value = true;
}
function openPlayer() {
  openFrame(0);
  playing.value = true;
  schedule();
}
function inspect(id?: number) {
  inspectedId.value = id;
  inspectorOpen.value = true;
}
function openPlan() {
  window.dispatchEvent(new CustomEvent("production:studio-context", { detail: { node: "storyboardTable" } }));
}
watch(viewerOpen, (v) => {
  if (!v) stop();
});
onUnmounted(stop);
</script>
<style scoped lang="scss">
.storyOverview {
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 26px 30px 22px;
  color: var(--studio-text);
  background: var(--studio-bg);
}
.overviewHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.overviewHeader h2 {
  font-size: 21px;
  line-height: 1.4;
  font-weight: 600;
  letter-spacing: -0.5px;
  margin: 0 0 7px;
}
.overviewHeader p {
  font-size: 12px;
  color: var(--studio-muted);
  margin: 0;
}
.overviewIncomplete {
  display: inline-block;
  margin-left: 14px;
  color: #a77a53;
  font-size: 11px;
}
.overviewHeader p span {
  margin-left: 16px;
}
.overviewActions {
  display: flex;
  gap: 9px;
  flex: none;
}
.storyOverview button {
  font: inherit;
  cursor: pointer;
}
.overviewActions button,
.overviewEmpty button {
  padding: 9px 15px;
  border: 1px solid var(--studio-line);
  background: var(--studio-white);
  color: var(--studio-text);
  border-radius: 8px;
  font-size: 12px;
}
.overviewActions .overviewPrimary {
  background: var(--studio-accent);
  color: var(--studio-accent-text);
  border-color: var(--studio-accent);
}
.overviewPrimary span {
  margin-left: 16px;
}
.overviewGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
.overviewCard {
  min-width: 0;
  border: 1px solid var(--studio-line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--studio-white);
  transition: box-shadow 0.18s;
}
.overviewCard:hover {
  box-shadow: 0 7px 25px #33240e0b;
}
.overviewImage {
  display: block;
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  padding: 0;
  border: 0;
  background: var(--studio-field);
  overflow: hidden;
  text-align: left;
}
.overviewImage img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #211e1b;
  display: block;
}
.overviewIndex,
.overviewTime,
.overviewBusy {
  position: absolute;
  font-size: 11px;
  background: #191713b3;
  color: #fff;
  padding: 4px 8px;
  border-radius: 5px;
  backdrop-filter: blur(4px);
}
.overviewIndex {
  top: 11px;
  left: 11px;
  font-weight: 600;
  letter-spacing: 1px;
}
.overviewTime {
  right: 11px;
  bottom: 11px;
}
.overviewBusy {
  left: 11px;
  bottom: 11px;
}
.overviewCopy {
  padding: 14px 16px 10px;
}
.overviewCopy strong {
  font-size: 14px;
  font-weight: 600;
}
.overviewCopy p {
  font-size: 12px;
  line-height: 1.75;
  color: var(--studio-muted);
  margin: 7px 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 42px;
}
.overviewCard footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 16px;
  padding: 10px 0 12px;
  border-top: 1px solid var(--studio-line);
}
.overviewCard footer button {
  border: 0;
  background: none;
  padding: 0;
  color: var(--studio-muted);
  font-size: 11px;
}
.overviewCard footer button:last-child {
  color: var(--studio-accent);
}
.overviewCard footer span {
  margin-left: 8px;
}
.overviewPlaceholder,
.overviewEmpty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  color: var(--studio-muted);
  height: 100%;
  font-size: 12px;
}
.overviewEmpty {
  height: 70%;
}
.overviewEmpty h3,
.overviewEmpty p {
  margin: 0;
}
.overviewNote {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 20px;
  color: var(--studio-muted);
  font-size: 11px;
}
.overviewViewer > img,
.overviewViewerEmpty {
  display: block;
  width: 100%;
  height: min(58vh, 620px);
  object-fit: contain;
  background: #201e1c;
  border-radius: 9px;
}
.overviewViewerEmpty {
  display: grid;
  place-items: center;
  color: #ccc;
}
.overviewPlayerControls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 13px;
}
.overviewPlayerControls button,
.overviewFilmstrip button {
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 7px 12px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 7px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
}
.overviewPlayerControls span,
.overviewViewer > p {
  color: var(--td-text-color-secondary);
  font-size: 12px;
  line-height: 1.8;
}
.overviewPlayerControls span {
  margin-left: auto;
}
.overviewFilmstrip {
  display: flex;
  gap: 7px;
  overflow: auto;
}
.overviewFilmstrip .active {
  border-color: #bd4c22;
  color: #bd4c22;
}
.storyOverview button:disabled {
  opacity: 0.45;
  cursor: default;
}
@media (min-width: 1400px) {
  .overviewGrid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 1100px) {
  .overviewGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .overviewHeader p span {
    display: block;
    margin: 5px 0 0;
  }
}
@media (max-width: 760px) {
  .storyOverview {
    padding: 18px;
  }
  .overviewHeader {
    align-items: flex-start;
    gap: 12px;
    flex-direction: column;
  }
  .overviewGrid {
    grid-template-columns: 1fr;
  }
  .overviewHeader h2 {
    font-size: 18px;
  }
  .overviewPlayerControls {
    flex-wrap: wrap;
  }
}
</style>
