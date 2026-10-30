<template>
  <component
    :is="embedded ? 'div' : TDialog"
    v-bind="wrapperProps"
    :class="embedded ? 'shotStudioEmbedded' : 'shotStudioDialog'"
    @update:visible="visible = $event">
    <section class="shotStudio" aria-label="分镜成片工作台">
      <header class="studioHeader">
        <div class="studioIdentity">
          <button v-if="embedded" type="button" class="studioBack" @click="emit('leave-workspace')" aria-label="收起工作台并返回关系画布">↙ <span>收起工作台</span></button>
          <strong class="studioBrand">分镜成片</strong>
          <span v-if="embedded && projectName" class="studioProject" :title="projectName">{{ projectName }}</span>
          <select
            v-if="embedded && episodesOptions?.length"
            class="studioEpisode"
            :value="episodesId"
            :disabled="episodeSwitching"
            aria-label="当前分集"
            @change="emit('episode-change', Number(($event.target as HTMLSelectElement).value))">
            <option v-for="e in episodesOptions" :key="e.value" :value="e.value">{{ e.label }}</option>
          </select>
          <span v-else class="studioBreadcrumb">{{ episodeTitle || "当前分集" }}</span>
        </div>
        <div class="studioHeaderActions">
          <button type="button" @click="openReferences">本集参考</button>
          <button v-if="embedded" type="button" @click="emit('toggle-assistant')">导演助理</button>
          <button v-if="embedded" type="button" class="canvasEntry" title="总览内容关系，定位跨步骤问题" @click="emit('show-overview')"><i-share-two size="15" />关系画布</button>
          <button v-else type="button" class="studioClose" aria-label="关闭工作台" @click="visible = false"><i-close-small size="20" /></button>
        </div>
      </header>
      <nav class="studioNav workflowNav" aria-label="制作流程">
        <button
          v-for="(stage, index) in studioStages"
          :key="stage.id"
          type="button"
          :class="{ active: activeStage === stage.id }"
          :aria-current="activeStage === stage.id ? 'step' : undefined"
          @click="changeMenu(stage.id)">
          <span class="workflowNumber">{{ String(index + 1).padStart(2, "0") }}</span>
          <span class="workflowCopy">
            <strong>{{ stage.label }}</strong>
            <small>{{ stageStatus[stage.id] }}</small>
          </span>
          <span v-if="index < 3" class="workflowArrow" aria-hidden="true">›</span>
        </button>
      </nav>
      <div class="studioStepGuide" :class="{ compact: activeStage === 'video' }">
        <div>
          <p>{{ currentStage.purpose }}</p>
          <small>本步产出：{{ currentStage.output }}</small>
        </div>
        <button type="button" class="stageNext" @click="nextStage">
          {{ nextLabel }}
          <span>{{ activeStage === "edit" ? "↗" : "→" }}</span>
        </button>
      </div>
      <div ref="contentRoot" class="studioContent">
        <PlanningWorkspace v-if="activeStage === 'planning'" ref="planning" @next="changeMenu('frames')" />
        <section v-else-if="activeStage === 'frames'" class="framesWorkspace">
          <div class="framesTools">
            <div class="localViewSwitch" aria-label="分镜画面视图">
              <button type="button" :class="{ active: frameView === 'making' }" @click="frameView = 'making'">① 制作分镜图</button>
              <button type="button" :class="{ active: frameView === 'overview' }" @click="frameView = 'overview'">② 整集预览与衔接</button>
            </div>
            <span>{{ frameView === "overview" ? "按顺序预览，检查场景与人物是否衔接。" : "为每个镜头生成画面，不满意可直接修改；完成后再检查整集衔接。" }}</span>
          </div>
          <StoryboardOverview v-if="frameView === 'overview'" @generate="openGenerator" @make="openFrameEditor" @image-canvas="openImageCanvas" />
          <div v-else class="frameMaking">
            <div v-if="!flowData.reviewState?.tableApproved" class="workflowNotice">
              分镜表还未确认。可以查看和编辑已有镜头，生成新图片前请先完成规划。
              <button type="button" @click="openDocument('storyboardTable')">回到分镜表 →</button>
            </div>
            <div v-if="!flowData.storyboard.length" class="workflowNotice">
              还没有镜头记录。请先把已确认的分镜表整理为镜头记录。
              <button type="button" @click="openDocument('storyboardTable')">去整理镜头 →</button>
            </div>
            <storyboardNode ref="frameEditor" standalone v-model="flowData.storyboard" :assets-data="flowData.assets" />
          </div>
        </section>
        <section v-else-if="activeStage === 'edit'" class="editWorkspace">
          <div class="framesTools">
            <div class="localViewSwitch" aria-label="成片检查视图">
              <button type="button" :class="{ active: editView === 'playback' }" @click="editView = 'playback'">已采用视频连播</button>
              <button type="button" :class="{ active: editView === 'archive' }" @click="editView = 'archive'">
                成片存档 · {{ flowData.output?.length || 0 }}
              </button>
            </div>
            <span>连播用于检查素材，剪辑台用于正式合成。</span>
          </div>
          <EpisodePlayback v-if="editView === 'playback'" video-only @go-generate="changeMenu('video')" />
          <div v-else class="studioArchive">
            <div v-if="!flowData.output?.length" class="archiveEmpty">
              <h3>还没有成片存档</h3>
              <p>在剪辑台合成导出后，作品会归档到这里。</p>
              <button type="button" class="stageNext" @click="goEditor">打开剪辑台 ↗</button>
            </div>
            <article v-for="output in flowData.output" :key="output.id">
              <video :src="output.url" controls preload="metadata" />
              <strong>{{ output.name }}</strong>
              <small>{{ output.resolution }} · {{ Math.round(output.duration) }} 秒</small>
            </article>
          </div>
        </section>
        <generate
          v-if="visitedGenerate"
          v-show="activeStage === 'video'"
          ref="generator"
          @importVideo="goEditor"
          @go-review="openDocument('storyboardTable')"
          @go-frames="changeMenu('frames')" />
      </div>
      <t-drawer
        v-if="referencesOpen"
        v-model:visible="referencesOpen"
        header="本集参考 · 剧本与角色场景"
        size="min(850px, 95vw)"
        :footer="false"
        attach="body">
        <div class="planningReferences">
          <section class="scriptReferenceRead">
            <h3>本集剧本</h3>
            <MdPreview :model-value="flowData.script || '暂无剧本，请先在剧本整理中完成。'" />
          </section>
          <assetsNode standalone v-model="flowData.assets" />
        </div>
      </t-drawer>
    </section>
  </component>
</template>
<script setup lang="ts">
import { computed, inject, nextTick, ref, watch, type Ref } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next";
import { useRoute, useRouter } from "vue-router";
import productionAgentStore from "@/stores/productionAgent";
import projectStore from "@/stores/project";
import { initialStudioStage, studioStageFor, studioStages, studioStageStatus, type StudioStage } from "../../utils/studioWorkflow";
import PlanningWorkspace from "./PlanningWorkspace.vue";
import storyboardNode from "../../node/storyboard.vue";
import { MdPreview } from "@/utils/markdown";
import assetsNode from "../../node/assets.vue";
import StoryboardOverview from "./StoryboardOverview.vue";
import EpisodePlayback from "./EpisodePlayback.vue";
import generate from "./generate/index.vue";
const props = defineProps<{ embedded?: boolean; episodesOptions?: { label: string; value: number }[]; episodeSwitching?: boolean }>();
const emit = defineEmits<{ "show-overview": []; "toggle-assistant": []; "episode-change": [id: number]; "stage-change": [stage: StudioStage]; "leave-workspace": [] }>();
const visible = defineModel<boolean>("visible", { default: false });
const wrapperProps = computed(() =>
  props.embedded
    ? {}
    : {
        visible: visible.value,
        header: false,
        footer: false,
        closeBtn: false,
        attach: "body",
        mode: "full-screen",
        dialogClassName: "shotStudioModal",
      },
);
const { flowData } = storeToRefs(productionAgentStore());
const projectName = computed(() => projectStore().project?.name || "");
const episodeTitle = inject<Ref<string>>("productionEpisodeTitle", ref(""));
const episodesId = inject<Ref<number>>("episodesId", ref(0));
const router = useRouter(),
  route = useRoute();
const activeStage = ref<StudioStage>(initialStudioStage(flowData.value, route.query.stage));
const visitedGenerate = ref(activeStage.value === "video");
const frameView = ref("making"),
  editView = ref("playback");
const stageStatus = computed(() => studioStageStatus(flowData.value));
const currentStage = computed(() => studioStages.find((stage) => stage.id === activeStage.value)!);
const nextLabel = computed(() => activeStage.value === 'frames' && frameView.value === 'making' ? '预览整集与衔接' : ({ planning: "查看分镜画面", frames: "进入视频制作", video: "检查与剪辑", edit: "打开剪辑台" })[activeStage.value]);
const generator = ref<{ selectStoryboard: (id: number) => Promise<void>; flushDrafts: () => Promise<void> }>();
const contentRoot = ref<HTMLElement>();
const referencesOpen = ref(false);
const frameEditor = ref<{ editFrame: (id: number) => void; openImageCanvas: (id: number) => void }>();
const planning = ref<{ selectDocument: (value: string) => void }>();
watch(
  activeStage,
  (stage) => {
    contentRoot.value?.querySelectorAll("video").forEach((video) => video.pause());
    emit("stage-change", stage);
  },
  { immediate: true },
);
function changeMenu(menu: string) {
  const stage = studioStageFor(menu) || "planning";
  activeStage.value = stage;
  if (stage === "video") visitedGenerate.value = true;
  if (props.embedded && route.query.stage !== stage) void router.replace({ query: { ...route.query, stage } });
}
watch(
  () => route.query.stage,
  (stage) => {
    const resolved = studioStageFor(stage);
    if (resolved) {
      activeStage.value = resolved;
      if (resolved === "video") visitedGenerate.value = true;
    }
  },
);
function nextStage() {
  if (activeStage.value === "edit") return goEditor();
  if (activeStage.value === "frames" && frameView.value === "making") { frameView.value = "overview"; return; }
  const index = studioStages.findIndex((stage) => stage.id === activeStage.value);
  changeMenu(studioStages[index + 1].id);
}
async function openDocument(document: string) {
  if (document === "assets" || document === "script") {
    referencesOpen.value = true;
    return;
  }
  changeMenu("planning");
  await nextTick();
  planning.value?.selectDocument(document);
}
function openReferences() {
  referencesOpen.value = true;
}
async function openFrameEditor(id?: number) {
  frameView.value = "making";
  await nextTick();
  if (id) frameEditor.value?.editFrame(id);
}
async function openImageCanvas(id?: number) {
  frameView.value = "making";
  await nextTick();
  if (id) frameEditor.value?.openImageCanvas(id);
}
async function openGenerator(id?: number) {
  changeMenu("video");
  await nextTick();
  if (id) await generator.value?.selectStoryboard(id);
}
async function flushDrafts() { await generator.value?.flushDrafts(); }
defineExpose({ setActiveMenu: changeMenu, openDocument, flushDrafts });
function goEditor() {
  if (!props.embedded) visible.value = false;
  void router.push({ path: "/editor", query: { projectId: route.query.projectId, episode: String(episodesId.value), returnTo: route.fullPath } });
}
</script>
<style lang="scss">
.shotStudioEmbedded {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--studio-white);
  box-sizing: border-box;
}
.studioHeaderActions > button {
  border: 0;
  background: none;
  color: var(--studio-muted);
  font: inherit;
  padding: 5px 0;
  cursor: pointer;
}
.studioHeaderActions > button:hover {
  color: var(--studio-text);
}
.studioHeaderActions > button.canvasEntry {
  display:flex;
  align-items:center;
  gap:6px;
  margin-left:2px;
  padding:8px 13px;
  border:1px solid #c95029;
  border-radius:9px;
  background:#c95029;
  color:#fff;
  font-weight:600;
  box-shadow:0 5px 14px rgba(153,59,29,.16);
}
.studioHeaderActions > button.canvasEntry:hover {
  border-color:#a83d1d;
  background:#a83d1d;
  color:#fff;
}
.studioEpisode {
  max-width: 310px;
  border: 0;
  background: none;
  color: var(--studio-muted);
  font: inherit;
  font-size: 12px;
  padding: 4px;
}
.studioNav > button small {
  font-size: 10px;
  color: var(--studio-muted);
  margin-right: 6px;
  font-variant-numeric: tabular-nums;
}
.studioNav > button.active small {
  color: var(--studio-accent);
}
.studioNavArrow {
  color: var(--studio-line);
}
.studioNav .studioPlayback {
  margin-left: auto;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
}
.studioContent {
  position: relative;
}

.shotStudioModal,
.shotStudioEmbedded {
  --studio-white: light-dark(#fff, #262422);
  --studio-bg: light-dark(#f8f7f5, #201f1e);
  --studio-field: light-dark(#f3f1ed, #33302c);
  --studio-line: light-dark(#e9e4dd, #454039);
  --studio-text: light-dark(#302d29, #eae5df);
  --studio-muted: light-dark(#8a8278, #b0a69b);
  --studio-accent: light-dark(#bd4c22, #e98554);
  --studio-accent-text: light-dark(#fffaf6, #231b16);
}
.shotStudioModal {
  padding: 0 !important;
  width: calc(100% - 48px) !important;
  max-width: 1680px !important;
  height: calc(100dvh - 40px) !important;
  margin: 20px auto !important;
  background: var(--studio-white) !important;
  border: 1px solid var(--studio-line) !important;
  border-radius: 18px !important;
  overflow: hidden;
  box-shadow: 0 18px 80px #20181022 !important;
  .t-dialog__body {
    padding: 0 !important;
    height: 100%;
    max-height: none !important;
    overflow: hidden !important;
  }
  .t-dialog__header {
    display: none !important;
  }
}
.shotStudio {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--studio-text);
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "PingFang SC",
    sans-serif;
}
.studioHeader {
  min-height: 48px;
  padding: 10px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--studio-white);
}
.studioIdentity {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}
.studioBack {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  padding: 8px 12px;
  border: 1px solid var(--studio-line);
  border-radius: 10px;
  background: var(--studio-white);
  color: var(--studio-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.studioBack:hover { border-color: var(--studio-accent); color: var(--studio-accent); }
.studioProject { max-width: 250px; overflow: hidden; color: var(--studio-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 760px) {
  .studioProject { display: none; }
  .studioIdentity { gap: 9px; }
  .studioBack { padding: 7px 9px; }
}
.studioBrand {
  font-size: 17px;
  letter-spacing: -0.4px;
  font-weight: 700;
  flex: none;
}
.studioBreadcrumb {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  color: var(--studio-muted);
  flex-wrap: wrap;
}
.studioBreadcrumb i {
  font-style: normal;
  color: var(--studio-line);
}
.studioHeaderActions {
  display: flex;
  align-items: center;
  gap: 18px;
  color: var(--studio-muted);
  font-size: 12px;
  flex: none;
}
.studioClose {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: var(--studio-muted);
  cursor: pointer;
}
.studioClose:hover {
  background: var(--studio-field);
  color: var(--studio-text);
}
.studioNav {
  display: flex;
  gap: 15px;
  align-items: center;
  min-height: 47px;
  padding: 6px 24px;
  border-top: 1px solid var(--studio-line);
  border-bottom: 1px solid var(--studio-line);
  background: var(--studio-white);
}
.studioNav > button {
  padding: 8px 2px;
  background: none;
  border: 0;
  color: var(--studio-muted);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.studioNav > button:hover {
  color: var(--studio-text);
}
.studioNav > button.active {
  color: var(--studio-accent);
  font-weight: 600;
}
.studioNav .studioEdit {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  padding: 8px 14px;
  border: 1px solid var(--studio-line);
  border-radius: 9px;
  color: var(--studio-text);
  font-size: 13px;
}
.studioEdit span {
  color: var(--studio-muted);
}
.studioContent {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--studio-bg);
}
.studioContent > .episodePlayback {
  padding: 22px 26px;
  box-sizing: border-box;
}
.shotStudio button:focus-visible,
.shotStudio select:focus-visible,
.shotStudio textarea:focus-visible {
  outline: 2px solid var(--studio-accent);
  outline-offset: 3px;
}
@media (max-width: 760px) {
  .shotStudioModal {
    width: 100% !important;
    height: 100dvh !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
  }
  .studioHeader {
    min-height: 47px;
    padding: 13px 16px;
  }
  .studioIdentity {
    gap: 12px;
  }
  .studioBreadcrumb {
    font-size: 11px;
    gap: 5px;
  }
  .studioHeaderActions > span {
    display: none;
  }
  .studioNav {
    padding: 9px 16px;
    gap: 16px;
    flex-wrap: wrap;
    min-height: 52px;
  }
  .studioNav > button {
    font-size: 12px;
  }
  .studioNav .studioEdit {
    padding: 6px 10px;
    font-size: 12px;
  }
  .studioContent > .episodePlayback {
    padding: 14px;
  }
}

.workflowNav {
  gap: 0;
  padding: 0 24px;
  min-height: 67px;
}
.workflowNav > button {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 12px;
  position: relative;
}
.workflowNav > button.active::after {
  content: "";
  height: 2px;
  background: var(--studio-accent);
  position: absolute;
  bottom: 0;
  left: 12px;
  right: 30px;
}
.workflowNumber {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border: 1px solid var(--studio-line);
  border-radius: 50%;
  font-size: 10px;
  flex: none;
  color: var(--studio-muted);
}
.active .workflowNumber {
  background: var(--studio-accent);
  border-color: var(--studio-accent);
  color: var(--studio-accent-text);
}
.workflowCopy {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.workflowCopy strong {
  font-size: 14px;
  font-weight: 600;
}
.workflowNav .workflowCopy small {
  margin: 0;
  font-size: 10px;
  font-weight: 400;
  color: var(--studio-muted);
}
.workflowArrow {
  margin-left: auto;
  padding-right: 12px;
  color: var(--studio-line);
}
.studioStepGuide {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 28px;
  border-bottom: 1px solid var(--studio-line);
  flex: none;
}
.studioStepGuide p {
  font-size: 12px;
  margin: 0;
  line-height: 1.6;
}
.studioStepGuide small {
  display: block;
  font-size: 10px;
  color: var(--studio-muted);
  margin-top: 4px;
}
.studioStepGuide.compact {
  padding-top: 8px;
  padding-bottom: 8px;
}
.studioStepGuide.compact small {
  display: none;
}
.stageNext {
  display: flex;
  align-items: center;
  gap: 24px;
  border: 0;
  background: var(--studio-accent);
  color: var(--studio-accent-text);
  padding: 11px 18px;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.framesWorkspace,
.editWorkspace {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.framesTools {
  padding: 13px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex: none;
  border-bottom: 1px solid var(--studio-line);
}
.framesTools > span {
  color: var(--studio-muted);
  font-size: 11px;
}
.localViewSwitch {
  display: flex;
  gap: 5px;
}
.localViewSwitch button {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  padding: 7px 10px;
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.localViewSwitch button.active {
  background: var(--studio-white);
  box-shadow: 0 0 0 1px var(--studio-line);
  color: var(--studio-text);
}
.framesWorkspace > .storyOverview {
  flex: 1;
  min-height: 0;
  height: auto;
}
.frameMaking {
  flex: 1;
  overflow: auto;
  padding: 24px 28px;
}
.frameMaking .storyboard {
  border: 1px solid var(--studio-line);
  border-radius: 12px;
}
.frameMaking .directorNodeIndex,
.frameMaking .directorNodeCopy > small {
  display: none;
}
.workflowNotice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 15px;
  padding: 13px 16px;
  border: 1px solid var(--studio-line);
  border-radius: 9px;
  font-size: 12px;
  color: var(--studio-muted);
}
.workflowNotice button {
  border: 0;
  background: none;
  color: var(--studio-accent);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.editWorkspace > .episodePlayback {
  flex: 1;
  min-height: 0;
  padding: 20px 28px;
  overflow: auto;
}
.planningReferences {
  display: grid;
  gap: 22px;
}
.studioArchive {
  overflow: auto;
  padding: 25px 28px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
  gap: 20px;
}
.studioArchive article {
  background: var(--studio-white);
  border: 1px solid var(--studio-line);
  border-radius: 12px;
  overflow: hidden;
}
.studioArchive video {
  width: 100%;
  max-height: 330px;
  background: #191817;
  display: block;
}
.studioArchive strong,
.studioArchive small {
  display: block;
  margin: 15px 18px;
  font-size: 13px;
}
.studioArchive small {
  font-size: 11px;
  color: var(--studio-muted);
}
.archiveEmpty {
  grid-column: 1/-1;
  padding: 60px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}
.archiveEmpty h3,
.archiveEmpty p {
  margin: 0;
}
.archiveEmpty p {
  font-size: 12px;
  color: var(--studio-muted);
}
@media (max-width: 900px) {
  .workflowNav {
    padding: 0 10px;
    min-height: 65px;
    flex-wrap: nowrap;
  }
  .workflowNav > button {
    gap: 7px;
    padding: 13px 6px;
  }
  .workflowCopy strong {
    font-size: 12px;
  }
  .workflowNav .workflowCopy small {
    font-size: 9px;
  }
  .workflowArrow {
    display: none;
  }
  .framesTools > span {
    display: none;
  }
  .studioStepGuide {
    padding: 10px 16px;
  }
  .studioHeaderActions {
    gap: 12px;
  }
  .framesTools {
    padding: 12px 16px;
  }
}
@media (max-width: 600px) {
  .studioHeader {
    flex-wrap: wrap;
    padding: 12px;
    gap: 8px;
  }
  .studioHeaderActions {
    margin-left: auto;
  }
  .workflowNumber {
    display: none;
  }
  .studioStepGuide {
    flex-wrap: wrap;
    gap: 8px;
  }
  .studioStepGuide small {
    display: none;
  }
  .stageNext {
    padding: 8px 12px;
  }
  .workflowCopy small {
    max-width: 90px;
    white-space: normal;
  }
  .frameMaking {
    padding: 15px;
  }
  .workflowNotice {
    flex-wrap: wrap;
  }
}
</style>
