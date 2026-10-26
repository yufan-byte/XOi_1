<template>
  <t-drawer v-model:visible="visible" header="衔接检查 · 对照、修正与确认" size="min(1120px, 96vw)" :footer="false" destroy-on-close>
    <div v-if="current" class="continuityInspector">
      <div class="ciIntro">
        <div>
          <strong>分镜 S{{ String(currentIndex + 1).padStart(2, "0") }}</strong>
          <p>先固定房间布局，再核对前后镜头。镜头反打可以改变画面左右，家具在房间里的关系应保持一致。</p>
        </div>
        <span>{{ reviewLabel }}</span>
      </div>
      <div class="ciCompare">
        <section>
          <header>
            上一镜
            <small v-if="previous">S{{ String(currentIndex).padStart(2, "0") }}</small>
          </header>
          <img v-if="previous?.src" :src="continuityImageUrl(previous.src)" alt="上一镜分镜图" />
          <div v-else class="ciPlaceholder">{{ previous ? "上一镜尚未出图" : "本集第一镜" }}</div>
          <p>{{ previous?.continuity?.endState || "尚未记录人物末态" }}</p>
        </section>
        <section class="ciCurrent">
          <header>当前镜头</header>
          <img v-if="current.src" :src="continuityImageUrl(current.src)" alt="当前分镜图" />
          <div v-else class="ciPlaceholder">等待生成画面</div>
          <p>{{ draft.startState || "填写本镜初态，方便核对动作是否接得上" }}</p>
        </section>
        <section v-if="anchor">
          <header>固定空间锚点</header>
          <img :src="continuityImageUrl(anchor.src)" alt="用户选择的场景布局锚点" />
          <p>核对床、门窗、家具；不照抄人物动作和构图。</p>
        </section>
      </div>
      <div v-if="currentVideo?.src" class="ciVideoPair">
        <section v-if="previousVideo?.src">
          <header>上一片段 · 检查末尾</header>
          <video :src="previousVideo.src" controls preload="metadata" />
        </section>
        <section>
          <header>当前版本 · 检查开头与结尾</header>
          <video :src="currentVideo.src" controls preload="metadata" />
        </section>
      </div>
      <div class="ciRules">
        <label>
          镜头关系
          <select v-model="draft.transition">
            <option value="cut">同场景切镜</option>
            <option value="continue">连续动作 · 接上一镜末态</option>
            <option value="new_scene">换场景</option>
          </select>
        </label>
        <label>
          固定场景
          <select v-model="draft.sceneId">
            <option :value="null">选择本镜已关联场景</option>
            <option v-for="s in scenes" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label>
          空间锚点
          <select v-model="draft.anchorStoryboardId">
            <option :value="null">使用场景参考与自动锚点</option>
            <option v-for="s in anchors" :key="s.id" :value="s.id">S{{ String(frames.indexOf(s) + 1).padStart(2, "0") }} · 固定此镜布局</option>
          </select>
        </label>
        <label class="ciWide">
          固定布局
          <textarea
            v-model="draft.spatialLayout"
            rows="2"
            maxlength="4000"
            placeholder="例如：以房间入口为参照，床沿右墙、雕花窗在左墙、木桌靠窗。区分房间方位和画面左右。" />
        </label>
        <label class="ciWide ciApply">
          <span>
            <input v-model="applySceneLayout" type="checkbox" :disabled="!draft.sceneId" />
            将固定布局同步到本集同场景镜头，保留各镜人物动作
          </span>
        </label>
        <label>
          本镜初态
          <textarea v-model="draft.startState" rows="2" maxlength="2000" placeholder="谁在哪里、站着或坐着、看向何处、拿着什么" />
        </label>
        <label>
          本镜末态
          <textarea v-model="draft.endState" rows="2" maxlength="2000" placeholder="动作结束后的人物站位、姿势与道具位置" />
        </label>
        <label class="ciWide">
          空间轴线与出入画方向
          <input v-model="draft.screenDirection" maxlength="500" placeholder="例如：人物轴线保持，摄影机在窗侧；下一镜为同轴反打" />
        </label>
      </div>
      <div v-if="warnings.length" class="ciWarnings">
        <strong>生成前待核对</strong>
        <ul>
          <li v-for="w in warnings" :key="w">{{ w }}</li>
        </ul>
      </div>
      <section class="ciAnalysis">
        <div class="ciAnalysisToolbar">
          <div>
            <strong>AI 看图检查</strong>
            <small>需选择支持图片理解的模型；仅按实际检查调用计费。</small>
          </div>
          <modelSelect v-model="analysisModel" type="text" capability="vision" size="small" />
          <select v-model="analysisKind" aria-label="检查范围">
            <option value="image">分镜图对照</option>
            <option value="video" :disabled="!currentVideo?.src">视频接镜 · 抽样帧</option>
          </select>
          <t-button :loading="checking" :disabled="!analysisCanRun || !current.src || saving" @click="analyze">
            {{ checking ? progress : "检查当前镜头" }}
          </t-button>
          <t-button v-if="checking" variant="text" @click="controller?.abort()">停止</t-button>
        </div>
        <p v-if="analysisError" class="ciError" role="alert">{{ analysisError }}</p>
        <div v-if="report" class="ciReport" :class="{ stale: reportStale }">
          <header>
            <strong>{{ report.manual ? "人工复核记录" : report.kind === "video" ? "视频抽样检查" : "分镜图检查" }}</strong>
            <span>
              {{ reportStale ? "画面或设定已变化，需重新检查" : report.issues.length ? `${report.issues.length} 项待核对` : "本次未检出明确问题" }}
            </span>
          </header>
          <p>{{ report.summary }}</p>
          <article v-for="(issue, i) in report.issues" :key="i">
            <strong>{{ issue.category }} · {{ issue.severity === "error" ? "明显差异" : "建议核对" }}</strong>
            <p>{{ issue.evidence }}</p>
            <p>修正建议：{{ issue.suggestion }}</p>
            <button type="button" :disabled="reportStale || checking" @click="addRepair([issue])">加入本镜修正</button>
          </article>
          <ul v-if="report.uncertainties.length">
            <li v-for="u in report.uncertainties" :key="u">无法确定：{{ u }}</li>
          </ul>
          <small>AI 检查仅作辅助；静态画面与抽样帧不能保证所有穿帮都被发现。</small>
        </div>
      </section>
      <label class="ciRepair">
        本镜修正说明
        <textarea
          v-model="draft.repairNotes"
          maxlength="4000"
          rows="3"
          placeholder="例如：只把床恢复到右墙；保留人物外貌、服装、光线。人物承接上一镜坐姿，不重复起身。" />
      </label>
      <div v-if="draft.imageHistory?.length" class="ciHistory">
        <strong>可恢复的历史画面</strong>
        <button
          v-for="(v, i) in draft.imageHistory"
          :key="v.filePath"
          type="button"
          :disabled="saving || checking || current.state === '生成中'"
          @click="restore(v.filePath)">
          恢复历史 {{ i + 1 }} · {{ new Date(v.createdAt).toLocaleString() }}
        </button>
        <small>恢复不会调用模型，当前画面也会保留为历史。</small>
      </div>
      <footer>
        <span>{{ saveStatus || "保存衔接设置后，重画和视频生成都会使用这些约束。" }}</span>
        <t-button variant="text" @click="visible = false">关闭检查</t-button>
        <t-button variant="outline" :disabled="saving || checking || !current.src" @click="confirmManual">记录人工复核</t-button>
        <t-button :loading="saving" :disabled="checking" @click="save">保存设置</t-button>
        <t-button theme="primary" :loading="regenerating" :disabled="checking || saving || current.state === '生成中'" @click="regenerate">
          保存并重画这一镜
        </t-button>
      </footer>
    </div>
    <t-empty v-else description="当前镜头已不存在，请重新选择" />
  </t-drawer>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { computed, ref, watch, onUnmounted } from "vue";
import modelSelect from "@/components/modelSelect.vue";
import productionAgentStore from "@/stores/productionAgent";
import projectStore from "@/stores/project";
import axios from "@/utils/axios";
import { continuityImageData, continuityImageUrl, inspectContinuity } from "@/utils/continuityAnalysis";
import { modelCatalog, type ModelCatalogRow } from "@/utils/modelCatalog";
import { canUnderstandImages } from "@/utils/modelCapabilities";
import { extractAnalysisFrames } from "@/utils/videoFrames";
import {
  continuitySignature,
  continuityWarnings,
  continuityRepairText,
  type ShotContinuity,
  type ContinuityIssue,
  type ContinuityReview,
} from "../../../../../shared/shotContinuity";

const props = defineProps<{ storyboardId?: number; currentVideo?: { id: number; src: string }; previousVideo?: { id: number; src: string } }>();
const visible = defineModel<boolean>("visible", { required: true });
const emit = defineEmits<{ saved: [] }>();
const agent = productionAgentStore(),
  project = projectStore();
const episode = inject<Ref<number>>("episodesId", ref(0));
const frames = computed(() => agent.flowData.storyboard || []);
const currentIndex = computed(() => frames.value.findIndex((s) => s.id === props.storyboardId));
const current = computed(() => frames.value[currentIndex.value]);
const previous = computed(() => frames.value[currentIndex.value - 1]);
const blank = (): ShotContinuity => ({
  sceneId: null,
  transition: "cut",
  startState: "",
  endState: "",
  screenDirection: "",
  spatialLayout: "",
  repairNotes: "",
  anchorStoryboardId: null,
});
const draft = ref<ShotContinuity>(blank());
const applySceneLayout = ref(false);
const expected = ref<ShotContinuity | null>(null);
const scenes = computed(() =>
  agent.flowData.assets
    .flatMap((a) => [a, ...(a.derive || [])])
    .filter((a) => a.type === "scene" && current.value?.associateAssetsIds?.includes(a.id)),
);
function sceneOf(s: (typeof frames.value)[number]) {
  if (s.continuity?.sceneId) return s.continuity.sceneId;
  const linked = agent.flowData.assets
    .flatMap((a) => [a, ...(a.derive || [])])
    .filter((a) => a.type === "scene" && s.associateAssetsIds?.includes(a.id));
  return linked.length === 1 ? linked[0].id : null;
}
const anchors = computed(() =>
  frames.value.filter((s) => s.id !== current.value?.id && s.src && draft.value.sceneId && sceneOf(s) === draft.value.sceneId),
);
const anchor = computed(() => frames.value.find((s) => s.id === draft.value.anchorStoryboardId));
const analysisModel = ref(""),
  analysisKind = ref<"image" | "video">("image");
const analysisCatalog = ref<ModelCatalogRow[]>([]);
const analysisCanRun = computed(() =>
  analysisCatalog.value.some((m) => canUnderstandImages(m) && `${m.id}:${m.value || m.modelName}` === analysisModel.value),
);
const report = computed(() => draft.value.review);
const signature = (kind: "image" | "video") =>
  continuitySignature(
    { ...current.value, continuity: draft.value },
    previous.value,
    anchor.value,
    kind === "video"
      ? [`${props.previousVideo?.id}:${props.previousVideo?.src || ""}`, `${props.currentVideo?.id}:${props.currentVideo?.src || ""}`]
      : undefined,
    scenes.value.find((s) => s.id === draft.value.sceneId),
  );
const reportStale = computed(() => !!report.value && report.value.sourceSignature !== signature(report.value.kind));
const reviewLabel = computed(() =>
  !report.value
    ? "尚未记录检查"
    : reportStale.value
      ? "检查已过期"
      : report.value.manual
        ? "已记录人工复核"
        : `AI 已检查 · ${report.value.issues.length} 项待核对`,
);
const warnings = computed(() => continuityWarnings({ ...current.value, continuity: draft.value }, previous.value));
const checking = ref(false),
  saving = ref(false),
  regenerating = ref(false),
  progress = ref("准备画面"),
  analysisError = ref(""),
  saveStatus = ref("");
let controller: AbortController | undefined;
function reset() {
  controller?.abort();
  expected.value = structuredClone(current.value?.continuity ? JSON.parse(JSON.stringify(current.value.continuity)) : null);
  draft.value = { ...blank(), ...(expected.value ? JSON.parse(JSON.stringify(expected.value)) : {}) };
  if (!draft.value.sceneId && scenes.value.length === 1) draft.value.sceneId = scenes.value[0].id;
  void modelCatalog
    .get()
    .then((rows) => {
      if (!visible.value) return;
      analysisCatalog.value = rows;
      if (!analysisCanRun.value) {
        const compatible = rows.filter(canUnderstandImages);
        const selected =
          compatible.find((m) => `${m.id}:${m.value || m.modelName}` === project.project?.textModel) ||
          compatible.find((m) => m.recommended) ||
          compatible[0];
        analysisModel.value = selected ? `${selected.id}:${selected.value || selected.modelName}` : "";
      }
    })
    .catch(() => {
      analysisError.value = "视觉模型目录暂时无法读取，请稍后重新打开检查。";
    });
  analysisError.value = "";
  saveStatus.value = "";
  analysisKind.value = "image";
  applySceneLayout.value = false;
}
watch([visible, () => props.storyboardId], () => {
  if (visible.value) reset();
  else controller?.abort();
});
watch(() => current.value?.continuity, latest => {
  if (!visible.value || saving.value || !latest) return;
  const withoutHistory = (c: ShotContinuity | null) => {
    if (!c) return 'null';
    const { imageHistory, ...rest } = c;
    return JSON.stringify(rest);
  };
  draft.value.imageHistory = latest.imageHistory ? JSON.parse(JSON.stringify(latest.imageHistory)) : [];
  if (withoutHistory(latest) === withoutHistory(expected.value)) expected.value = JSON.parse(JSON.stringify(latest));
  else saveStatus.value = '项目中的衔接设置已更新，请重新打开检查后保存；当前输入仍保留。';
});
onUnmounted(() => controller?.abort());
async function save() {
  if (saving.value || !current.value?.id) return false;
  const id = current.value.id,
    scriptId = episode.value;
  saving.value = true;
  try {
    const { data } = await axios.post("/production/storyboard/saveContinuity", {
      projectId: Number(project.project?.id),
      scriptId,
      id,
      continuity: JSON.parse(JSON.stringify(draft.value)),
      expectedContinuity: expected.value,
      applySceneLayout: applySceneLayout.value,
    });
    if (scriptId !== episode.value || id !== current.value?.id) return false;
    current.value.continuity = data.continuity;
    for (const update of data.updates || []) {
      const other = frames.value.find((f) => f.id === update.id);
      if (other) other.continuity = update.continuity;
    }
    applySceneLayout.value = false;
    expected.value = JSON.parse(JSON.stringify(data.continuity));
    draft.value = JSON.parse(JSON.stringify(data.continuity));
    saveStatus.value = "已保存到项目；已有视频和剪辑不会被覆盖。";
    emit("saved");
    return true;
  } catch (e: any) {
    saveStatus.value = e.message || "保存失败，请重试";
    return false;
  } finally {
    saving.value = false;
  }
}
async function regenerate() {
  if (regenerating.value || !current.value?.id) return;
  const id = current.value.id;
  regenerating.value = true;
  try {
    if (!(await save())) return;
    await agent.batchGenerateStoryboard([id], true);
    saveStatus.value = "已提交本镜重画，成功后可在历史画面中恢复旧版本。";
  } catch (e: any) {
    saveStatus.value = e.message || "重画失败";
  } finally {
    regenerating.value = false;
  }
}
function addRepair(issues: ContinuityIssue[]) {
  const text = continuityRepairText(issues);
  if (!draft.value.repairNotes?.includes(text)) draft.value.repairNotes = [draft.value.repairNotes, text].filter(Boolean).join("\n").slice(0, 4000);
  saveStatus.value = "修正说明已填入；保存并重画后请再次对照。";
}
async function confirmManual() {
  if (!current.value?.src) return;
  draft.value.review = {
    sourceSignature: signature(analysisKind.value),
    kind: analysisKind.value,
    checkedAt: Date.now(),
    manual: true,
    summary: "用户已对照当前画面与设定，记录人工复核；此记录不代表自动检测通过。",
    issues: reportStale.value ? [] : report.value?.issues || [],
    uncertainties: reportStale.value ? [] : report.value?.uncertainties || [],
  };
  await save();
}
async function restore(filePath: string) {
  if (!current.value?.id || saving.value) return;
  const id = current.value.id,
    scriptId = episode.value;
  saving.value = true;
  try {
    const { data } = await axios.post("/production/storyboard/restoreContinuityImage", {
      id,
      projectId: Number(project.project?.id),
      scriptId,
      filePath,
    });
    if (scriptId !== episode.value || id !== current.value?.id) return;
    current.value.src = data.src;
    current.value.state = "已完成";
    current.value.continuity = data.continuity;
    reset();
    saveStatus.value = "已恢复历史画面，当前参考已变化，请重新检查。";
    emit("saved");
  } catch (e: any) {
    saveStatus.value = e.message || "恢复失败，当前画面保留";
  } finally {
    saving.value = false;
  }
}
async function analyze() {
  if (checking.value || !current.value?.src || !analysisCanRun.value) return;
  controller = new AbortController();
  const signal = controller.signal;
  const sourceSignature = signature(analysisKind.value),
    id = current.value.id,
    scriptId = episode.value,
    kind = analysisKind.value;
  const imageSources = {
    previous: previous.value?.src,
    current: current.value.src,
    anchor: anchor.value?.src,
    scene: scenes.value.find((s) => s.id === draft.value.sceneId)?.src,
  };
  const videos = { previous: props.previousVideo?.src, current: props.currentVideo?.src };
  const rules = JSON.parse(JSON.stringify(draft.value));
  delete rules.review;
  delete rules.imageHistory;
  const context = JSON.stringify({
    current: { id, prompt: current.value.prompt, rules },
    scene: scenes.value.find((s) => s.id === draft.value.sceneId)?.desc,
    previous: previous.value ? { id: previous.value.id, rules: previous.value.continuity } : null,
    kind,
    imageOrder:
      kind === "video"
        ? "上一片段末帧（若存在）、当前片段首帧、当前片段末帧、空间锚点或场景资产（若存在）。这些仅为抽样。"
        : "上一镜（若存在）、当前镜、固定空间锚点或场景资产（若存在）。",
  });
  checking.value = true;
  analysisError.value = "";
  progress.value = "读取对照画面";
  try {
    const images: { name: string; dataUrl: string }[] = [];
    if (kind === "video") {
      if (!videos.current) throw Error("请先选择一个可预览的视频版本");
      if (videos.previous) {
        const p = await extractAnalysisFrames({ name: "上一片段", source: videos.previous, count: 2 }, signal);
        images.push({ name: "上一片段末帧", dataUrl: p.frames[p.frames.length - 1].dataUrl });
      }
      const c = await extractAnalysisFrames({ name: "当前片段", source: videos.current, count: 2 }, signal);
      images.push({ name: "当前片段首帧", dataUrl: c.frames[0].dataUrl }, { name: "当前片段末帧", dataUrl: c.frames[c.frames.length - 1].dataUrl });
    } else {
      if (imageSources.previous) images.push({ name: "上一镜分镜图", dataUrl: await continuityImageData(imageSources.previous, signal) });
      images.push({ name: "当前镜分镜图", dataUrl: await continuityImageData(imageSources.current, signal) });
    }
    if (imageSources.anchor) images.push({ name: "固定空间锚点", dataUrl: await continuityImageData(imageSources.anchor, signal) });
    else if (imageSources.scene) images.push({ name: "固定场景资产参考", dataUrl: await continuityImageData(imageSources.scene, signal) });
    progress.value = "AI 对照检查中";
    const result = await inspectContinuity({ model: analysisModel.value, context, images }, signal);
    signal.throwIfAborted();
    if (scriptId !== episode.value || id !== current.value?.id) return;
    draft.value.review = { ...result, kind, sourceSignature, checkedAt: Date.now() } as ContinuityReview;
    saveStatus.value = "检查结果已返回；保存设置可将记录保留到项目中。";
  } catch (e: any) {
    analysisError.value = signal.aborted ? "检查已停止，未标记为通过。" : e.message || "检查失败，未标记为通过。";
  } finally {
    checking.value = false;
  }
}
</script>

<style scoped lang="scss">
.continuityInspector {
  color: var(--td-text-color-primary);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 12px;
}
.ciIntro {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.ciIntro strong {
  font-size: 17px;
}
.ciIntro p {
  margin: 6px 0;
  color: var(--td-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.ciIntro > span {
  flex: none;
  color: #ba632f;
  font-size: 12px;
  padding: 5px 9px;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: 6px;
}
.ciCompare,
.ciVideoPair {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.ciCompare section,
.ciVideoPair section {
  flex: 1;
  min-width: 200px;
  border: 1px solid var(--td-component-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--td-bg-color-container);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  font-size: 13px;
}
header small {
  color: var(--td-text-color-secondary);
}
.ciCurrent {
  border-color: #d79568 !important;
}
.ciCompare img {
  width: 100%;
  height: 190px;
  object-fit: contain;
  display: block;
  background: var(--td-bg-color-secondarycontainer);
}
.ciCompare p {
  margin: 9px 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  line-height: 1.65;
}
.ciPlaceholder {
  height: 190px;
  display: grid;
  place-items: center;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-placeholder);
}
.ciVideoPair video {
  width: 100%;
  max-height: 220px;
  display: block;
  background: #171719;
}
.ciRules {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.ciRules label,
.ciRepair {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
.ciWide {
  grid-column: 1/-1;
}
select,
textarea,
input {
  padding: 9px 10px;
  border: 1px solid var(--td-component-border);
  border-radius: 7px;
  color: var(--td-text-color-primary);
  background: var(--td-bg-color-container);
  font: inherit;
  min-width: 0;
  max-width: 100%;
}
textarea {
  resize: vertical;
  line-height: 1.65;
}
.ciWarnings {
  background: var(--td-bg-color-secondarycontainer);
  border-radius: 9px;
  padding: 12px 15px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
.ciWarnings strong {
  color: #a76528;
}
ul {
  padding-left: 20px;
  margin: 7px 0;
  line-height: 1.8;
}
.ciAnalysis {
  padding: 14px;
  border: 1px solid var(--td-component-border);
  border-radius: 10px;
}
.ciAnalysisToolbar {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.ciAnalysisToolbar > div:first-child {
  margin-right: auto;
}
.ciAnalysisToolbar small {
  display: block;
  font-size: 11px;
  margin-top: 4px;
  color: var(--td-text-color-secondary);
}
.ciAnalysisToolbar :deep(.modelSelectField) {
  width: 180px;
}
.ciReport {
  margin-top: 12px;
  font-size: 13px;
}
.ciReport header {
  padding: 8px 0;
}
.ciReport header span {
  font-size: 12px;
  color: #af653a;
}
.ciReport p {
  line-height: 1.8;
  margin: 6px 0;
}
.ciReport article {
  margin-top: 10px;
  background: var(--td-bg-color-secondarycontainer);
  padding: 12px;
  border-radius: 8px;
}
.ciReport small,
.ciHistory small {
  display: block;
  color: var(--td-text-color-secondary);
  line-height: 1.7;
}
.ciReport.stale {
  opacity: 0.75;
}
.ciReport button,
.ciHistory button {
  border: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
  border-radius: 6px;
  padding: 6px 9px;
  font-size: 12px;
  color: var(--td-text-color-primary);
  cursor: pointer;
}
.ciHistory {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  font-size: 12px;
}
.ciHistory small {
  width: 100%;
}
.ciError {
  color: var(--td-error-color);
  font-size: 12px;
}
footer {
  display: flex;
  gap: 9px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid var(--td-component-border);
}
footer > span {
  flex: 1;
  min-width: 180px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
@media (max-width: 650px) {
  .ciRules {
    grid-template-columns: 1fr;
  }
  .ciIntro {
    flex-direction: column;
  }
  .ciCompare section {
    min-width: 100%;
  }
  .ciAnalysisToolbar :deep(.modelSelectField) {
    width: 100%;
  }
}
</style>
