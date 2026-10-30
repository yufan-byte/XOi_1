<template>
  <t-card class="storyboard" :class="{ fluid: standalone }">
    <div v-if="!standalone" class="titleBar" :class="{ dragHandle: !standalone, pr: !standalone }">
      <DirectorNodeHeading node-id="storyboard" step="05" label="STORYBOARD" :title="standalone ? '分镜图制作' : '分镜台'" description="逐镜确认构图、画面与时长" />
      <Handle v-if="!standalone" :id="props.handleIds!.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
      <Handle v-if="!standalone" :id="props.handleIds!.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>
    <div v-if="standalone" class="shotMaking">
      <header class="makingHeader">
        <div><span>STORYBOARD</span><h2>制作本集分镜画面</h2><p>先确认画面描述与角色场景，再逐镜生成；满意后去整集预览，检查前后衔接。</p></div>
        <div class="makingCount"><strong>{{ storyboard.filter(s => s.src).length }} / {{ storyboard.length }}</strong><small>画面已生成</small></div>
      </header>
      <div v-if="storyboard.length" class="makingBatch">
        <label><input type="checkbox" :checked="selectedIds.length === storyboard.length && storyboard.length > 0" @change="selectedIds.length === storyboard.length ? selectedIds = [] : selectAll()" /> 全选</label>
        <button type="button" @click="selectUnfinished">选择未出图</button><span>已选 {{ selectedIds.length }} 镜</span>
        <button type="button" class="makingBatchGenerate" :disabled="!selectedIds.length || generateLoading" @click="batchGenerateImage">{{ generateLoading ? '提交中…' : '生成选中的分镜图' }}</button>
        <small>已出图的镜头被选中时会重画，原图保留在历史中。</small>
      </div>
      <div v-if="storyboard.length" class="makingGrid">
        <article v-for="(item, index) in storyboard" :key="item.id" class="makingCard">
          <div class="makingImage">
            <img v-if="item.src" :src="item.src" :alt="`分镜 S${String(index + 1).padStart(2, '0')}`" />
            <div v-else class="makingEmpty"><i-pic size="28" /><span>{{ item.state === '生成中' ? '正在生成画面' : item.state === '生成失败' ? '生成失败，可重试' : '待生成画面' }}</span></div>
            <label class="makingCheck"><input v-model="selectedIds" type="checkbox" :value="item.id" :aria-label="`选择分镜 ${index + 1}`" /> S{{ String(index + 1).padStart(2, '0') }}</label>
            <span class="makingState">{{ item.state === '生成中' ? '生成中' : item.state === '生成失败' ? '生成失败' : item.src ? '已出图' : '待出图' }}</span>
          </div>
          <div class="makingCopy"><div><strong>镜头 {{ String(index + 1).padStart(2, '0') }}</strong><small>{{ item.duration ? `${item.duration} 秒` : '时长待定' }}</small></div><p :title="item.prompt || item.videoDesc">{{ item.prompt || item.videoDesc || '还没有画面描述，请先编辑镜头信息。' }}</p><div class="makingRefs">{{ referenceSummary(item) }}</div></div>
          <footer><button type="button" @click="editInfo(item)">镜头信息</button><button type="button" @click="openContinuity(item.id!)">检查衔接</button><button type="button" @click="openHistory(item.id!)">历史画面 {{ item.continuity?.imageHistory?.length || 0 }}</button><button v-if="item.src" type="button" class="makingMain" @click="openQuickEdit(item.id!)">修改画面</button><button v-else type="button" class="makingMain" :disabled="item.state === '生成中'" @click="regenerateOne(item)">{{ item.state === '生成中' ? '生成中' : '生成画面' }}</button><button v-if="item.src" type="button" class="makingCanvas" @click="sendFrameToCanvas(item, index)">在无限画布编辑 ↗</button></footer>
        </article>
      </div>
      <div v-else class="makingNoShots"><strong>还没有镜头记录</strong><p>先完成并确认分镜表，再创建镜头记录。</p></div>
    </div>
    <div v-else class="content nowheel nodrag">
      <t-empty v-if="!storyboard.length" style="margin-top: 16px"></t-empty>
      <t-checkbox-group v-model="selectedIds">
        <div class="frameGrid">
          <template v-for="(item, index) in visibleFrames" :key="item.id">
            <div class="frameItem" @mouseenter="setHoveredFrame(index)" @mouseleave="setHoveredFrame(null)">
              <div v-if="false" class="addBetween addBetween--left" :class="{ expanded: hoveredIndex === index }">
                <t-button
                  theme="primary"
                  variant="outline"
                  shape="circle"
                  @click.stop="editStoryboaryImage(item, [index > 0 ? storyboard[index - 1]?.src || '' : '', item.src || ''], index - 1)">
                  <template #icon><i-plus /></template>
                </t-button>
              </div>

              <div class="frameCard">
                <div
                  class="frameImage"
                  :style="{
                    width: `${200 * gridScale}px`,
                    height: `${200 * gridScale}px`,
                  }">
                  <div class="ac frameCheckbox" :style="{ transform: `scale(${styleMaxSize})` }">
                    <t-checkbox :checked="selectedIds.includes(item.id!)" @click.stop :key="item?.id || index" :value="item.id" />
                    <t-tag class="frameTypeTag" :style="{ backgroundColor: tagColors[index % tagColors.length] }">
                      S{{ String(index + 1).padStart(2, "0") }}
                    </t-tag>
                  </div>

                  <t-image
                    v-if="item.src"
                    :src="item.src"
                    fit="contain"
                    class="frameImg"
                    @click="sendFrameToCanvas(item, storyboard.indexOf(item))">
                    <template #overlayContent>
                      <div class="imageToolsWrap show">
                        <ImageTools :style="{ transform: `scale(${styleMaxSize})` }" :src="item.src" position="br" />
                      </div>
                    </template>
                  </t-image>
                  <div v-else class="generatingPlaceholder" @click="item.state !== '生成中' && regenerateOne(item)">
                    <t-loading v-if="item.state === '生成中' || regenerating.has(item.id!)" size="small" />
                    <t-tooltip v-else-if="item.state == '生成失败'" :content="item?.reason">
                      <span style="color: #ff4d4f">生成失败</span>
                    </t-tooltip>
                    <t-empty v-else size="small" :title="$t('workbench.production.node.storyboard.notGenerated')" />
                  </div>
                  <t-tooltip theme="primary" :content="item?.reason">
                    <div v-if="item.reason?.startsWith('衔接方案已更新')" class="continuityBadge ac" :style="{ transform: `scale(${styleMaxSize})` }">衔接</div>
                  </t-tooltip>
                  <t-tooltip theme="primary" :content="$t('workbench.production.node.storyboard.deleteNode')">
                    <div class="remove ac" :style="{ transform: `scale(${styleMaxSize})` }" @click.stop="removeFn(item.id!)">
                      <i-delete theme="outline" size="18" fill="#fff" />
                    </div>
                  </t-tooltip>
                  <t-tooltip theme="primary" content="重画这一镜（沿用该镜提示词与关联资产）">
                    <div class="regen ac" :style="{ transform: `scale(${styleMaxSize})` }" @click.stop="regenerateOne(item)">
                      <i-refresh :size="16" fill="#fff" />
                    </div>
                  </t-tooltip>
                  <t-tooltip theme="primary" :content="$t('workbench.production.node.storyboard.editNode')">
                    <div class="editNode ac" :style="{ transform: `scale(${styleMaxSize})` }" @click.stop="editInfo(item)">
                      <i-edit theme="outline" size="18" fill="#fff" />
                    </div>
                  </t-tooltip>
                </div>
                <div class="frameMeta">
                  <div class="frameName">S{{ String(index + 1).padStart(2, "0") }} <span>{{ item.duration || 0 }}s</span></div>
                  <small v-if="item.continuity" style="color:#9a7b64;font-size:11px;line-height:1.7" :title="`${item.continuity.startState} → ${item.continuity.endState} · ${item.continuity.screenDirection}`">{{ ({cut:'同场景切镜',continue:'连续动作 · 末帧接镜',new_scene:'换场景'})[item.continuity.transition] }}<template v-if="item.continuity.sceneId"> · 场景 #{{ item.continuity.sceneId }}</template></small>
                  <div class="frameStatuses">
                    <button type="button" class="statusPill todo" @click.stop="openContinuity(item.id!)">衔接检查 / 修正</button>
                    <span v-if="item.reason?.startsWith('衔接方案已更新')" class="statusPill todo" :title="item.reason">衔接方案待应用</span>
                    <span class="statusPill" :class="item.state === '生成中' ? 'loading' : item.state === '生成失败' ? 'failed' : item.src ? 'done' : 'todo'">图 {{ item.state === '生成中' ? (item.src ? '重画中 · 保留原图' : '生成中') : item.state === '生成失败' ? (item.src ? '失败 · 保留原图' : '失败') : item.src ? '已完成' : '待生成' }}</span>
                    <span class="statusPill" :class="videoStatusClass(item)">视频 {{ videoStatusLabel(item) }}</span>
                  </div>
                </div>
              </div>
              <div v-if="false" class="addBetween addBetween--right" :class="{ expanded: hoveredIndex === index }">
                <t-button
                  theme="primary"
                  variant="outline"
                  shape="circle"
                  @click.stop="
                    editStoryboaryImage(item, [item.src || '', index < (storyboard?.length ?? 0) - 1 ? storyboard[index + 1]?.src || '' : ''], index)
                  ">
                  <template #icon><i-plus /></template>
                </t-button>
              </div>
            </div>
          </template>
          <!-- 总览模式截断：分镜多时画布不被撑爆，展开/收起由用户控制 -->
          <button v-if="!standalone && truncated && storyboard.length > FRAME_PREVIEW" type="button" class="moreCard" @click="truncated = false">
            <strong>{{ storyboard.length - FRAME_PREVIEW }}+</strong>
            <span>展开全部 {{ storyboard.length }} 镜</span>
          </button>
          <button v-else-if="!standalone && !truncated && storyboard.length > FRAME_PREVIEW" type="button" class="moreCard slim" @click="truncated = true">
            <span>收起</span>
          </button>
        </div>
      </t-checkbox-group>

      <div class="ac" style="gap: 6px; margin-bottom: 6px; flex-wrap: wrap">
        <t-tag theme="primary" variant="light">{{ $t("workbench.production.node.storyboard.selectedCount", { count: selectedIds.length }) }}</t-tag>
        <t-button size="small" :disabled="!storyboard.length" theme="default" variant="outline" @click="selectedIds = []">
          {{ $t("workbench.production.node.storyboard.clearSelection") }}
        </t-button>
        <t-button size="small" :disabled="!storyboard.length" theme="default" variant="outline" @click="selectAll">
          {{ $t("workbench.production.node.storyboard.selectAll") }}
        </t-button>
        <t-button theme="danger" size="small" :disabled="!storyboard.length || !selectedIds.length" @click="handleDeleteSelected">批量删除</t-button>
      </div>
      <div class="ac" style="gap: 10px">
        <t-button theme="primary" variant="outline" @click="reviewVisible = true" :disabled="!storyboard.length">
          <template #icon><i-video-camera /></template>
          联审分镜
        </t-button>
        <t-button block @click="previewAll" :disabled="!storyboard.length">预览分镜</t-button>
        <t-button block theme="primary" @click="batchGenerateImage" :disabled="!storyboard.length || !selectedIds.length" :loading="generateLoading">
          生成选中镜头
        </t-button>
      </div>
    </div>
    <editImage v-model="visible" v-if="visible" :flowData="currentRow" type="storyboard" @save="saveFromCanvas" />
    <storyboardReview v-model:visible="reviewVisible" :storyboard="storyboard" />
    <ContinuityInspector v-model:visible="continuityVisible" :storyboard-id="continuityFrameId" />
    <ShotImageEditor v-model:visible="quickEditVisible" :storyboard-id="continuityFrameId" @inspect="openContinuity" @canvas="openCanvasById" />
    <t-dialog v-model:visible="historyVisible" header="历史画面" :footer="false" width="min(900px, 94vw)" attach="body">
      <div v-if="historyFrame" class="historyPanel">
        <p>选择一张图片预览，满意后点击采用。采用后，当前画面也会保留在历史中。</p>
        <div class="historyPreview"><img v-if="historySelection" :src="historyImageUrl(historySelection.filePath)" alt="所选历史画面" /><img v-else-if="historyFrame.src" :src="historyFrame.src" alt="当前采用的画面" /><span>{{ historySelection ? '历史画面预览 · 尚未替换' : '当前采用的画面' }}</span></div>
        <div v-if="historyFrame.continuity?.imageHistory?.length" class="historyGrid"><button v-for="(version, i) in historyFrame.continuity.imageHistory" :key="version.filePath" type="button" :class="{ selected: historySelection?.filePath === version.filePath }" @click="historySelection = version"><img :src="historyImageUrl(version.filePath)" :alt="`历史画面 ${i + 1}`" /><span>历史 {{ i + 1 }} · {{ new Date(version.createdAt).toLocaleString() }}</span></button></div>
        <p v-else>暂无历史画面。重新生成或从画布送回图片后，可在这里选择。</p>
        <div class="historyActions"><button type="button" @click="historyVisible = false">关闭</button><button type="button" class="historyAdopt" :disabled="!historySelection || historySaving || historyFrame.state === '生成中'" @click="adoptHistory">{{ historySaving ? '正在采用…' : '采用所选画面' }}</button></div>
      </div>
    </t-dialog>
    <t-image-viewer
      v-model:visible="previewVisible"
      v-if="previewVisible"
      :images="previewImages"
      :onClose="closePreview"
      :onDownload="downLoadImage"
      :imageScale="{ max: 10, min: 0.1 }" />
  </t-card>
</template>

<script setup lang="ts">
import DirectorNodeHeading from "./DirectorNodeHeading.vue";
import storyboardReview from "./storyboardReview.vue";
import { useLocalStorage } from "@vueuse/core";
import editImage from "../components/editImage/index.vue";
import { LoadingPlugin } from "tdesign-vue-next";
import { Handle, Position, type Edge } from "@vue-flow/core";
import axios from "@/utils/axios";
import type { AssetItem, Storyboard } from "../utils/flowBuilder";
import projectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
import ContinuityInspector from '../components/ContinuityInspector.vue';
import ShotImageEditor from '../components/workbench/ShotImageEditor.vue';
import { sendProjectImageToCanvas } from '@/utils/sendToCanvas';
const continuityVisible = ref(false), continuityFrameId = ref<number>();
function openContinuity(id: number) { continuityFrameId.value = id; continuityVisible.value = true; }
const quickEditVisible = ref(false);
function openQuickEdit(id: number) { continuityFrameId.value = id; quickEditVisible.value = true; }
const { project } = storeToRefs(projectStore());
const { episodesId } = storeToRefs(productionAgentStore());
const route = useRoute();
const router = useRouter();

const props = defineProps<{
  id?: string;
  handleIds?: {
    target: string;
    source: string;
  };
  assetsData: AssetItem[];
  standalone?: boolean;
}>();

const storyboard = defineModel<Storyboard[]>({ required: true });
const historyVisible = ref(false), historyId = ref<number>(), historySaving = ref(false);
const historySelection = ref<{ filePath: string; createdAt: number } | null>(null);
const historyFrame = computed(() => storyboard.value.find(frame => frame.id === historyId.value));
let historyExpected: string | null = null;
function historyImageUrl(value: string) { return value.startsWith('/oss/') ? value : `/oss/${value.replace(/^\/+/, '')}`; }
function openHistory(id: number) { historyId.value = id; historySelection.value = null; historyExpected = storyboard.value.find(frame => frame.id === id)?.src || null; historyVisible.value = true; }
async function adoptHistory() {
  const frame = historyFrame.value, selection = historySelection.value;
  if (!frame?.id || !selection || historySaving.value || frame.state === '生成中') return;
  const id = frame.id, scriptId = episodesId.value, projectId = Number(project.value?.id);
  historySaving.value = true;
  try {
    const { data } = await axios.post('/production/storyboard/restoreContinuityImage', { id, scriptId, projectId, filePath: selection.filePath, expectedUrl: historyExpected });
    if (historyId.value !== id || episodesId.value !== scriptId || Number(project.value?.id) !== projectId) return;
    frame.src = data.src; frame.state = '已完成'; frame.continuity = data.continuity;
    historyExpected = data.src; historySelection.value = null;
    window.$message.success('已采用所选画面，原画面已保留在历史中。');
  } catch (e: any) { window.$message.error(e?.message || '采用失败，请刷新后重试'); }
  finally { historySaving.value = false; }
}
watch(() => [route.query.canvasTarget, storyboard.value.map(frame => frame.id).join(',')] as const, ([raw]) => {
  const id = Number(raw);
  if (!props.standalone || !Number.isSafeInteger(id) || id <= 0 || !storyboard.value.some(frame => frame.id === id)) return;
  openHistory(id);
  window.$message.success('画布图片已保存到历史，可预览后采用。');
  const { canvasTarget: _canvasTarget, ...query } = route.query;
  void router.replace({ query });
}, { immediate: true });

const visible = ref(false);
const previewVisible = ref(false);
const previewImages = ref<string[]>([]);
const gridScale = useLocalStorage("storyboardGridScale", 1);

const hoveredIndex = ref<number | null>(null);
const selectedIds = ref<number[]>([]);

/* 总览画布的减噪：默认只铺前几帧，其余收进「展开」尾卡；分镜再多画布也不被撑爆 */
const FRAME_PREVIEW = 4;
const truncated = ref(true);
const reviewVisible = ref(false);
const regenerating = ref<Set<number>>(new Set());
const visibleFrames = computed<Storyboard[]>(() =>
  !props.standalone && truncated.value ? storyboard.value.slice(0, FRAME_PREVIEW) : storyboard.value,
);

/** 单镜重画：沿用该镜提示词与关联资产重新生图，不满意就换一张 */
async function regenerateOne(item: Storyboard) {
  if (!item.id || regenerating.value.has(item.id)) return;
  regenerating.value.add(item.id);
  try {
    await productionAgentStore().batchGenerateStoryboard([item.id], true);
    window.$message?.success("已提交重画，生成完成后这里会自动更新");
  } catch (e: any) {
    window.$message?.error(e?.message || "重画提交失败，请稍后再试");
  } finally {
    regenerating.value.delete(item.id);
  }
}

function videoStatus(item: Storyboard) {
  return (item as Storyboard & { videoState?: string }).videoState;
}
function videoStatusClass(item: Storyboard) {
  const state = videoStatus(item);
  return state === "已完成" || state === "生成成功" ? "done" : state === "生成中" ? "loading" : "todo";
}
function videoStatusLabel(item: Storyboard) {
  const state = videoStatus(item);
  return state === "已完成" || state === "生成成功" ? "已完成" : state === "生成中" ? "生成中" : "待生成";
}

function setHoveredFrame(index: number | null) {
  hoveredIndex.value = index;
}

function selectAll() {
  selectedIds.value = storyboard.value.map((s) => s.id!).filter(Boolean);
}
function selectUnfinished() { selectedIds.value = storyboard.value.filter((s) => !s.src && s.state !== '生成中').map((s) => s.id!).filter(Boolean); }
function referenceSummary(item: Storyboard) {
  const refs = props.assetsData.flatMap(a => [a, ...(a.derive || [])]).filter(a => item.associateAssetsIds?.includes(a.id));
  return refs.length ? `参考 · ${refs.map(a => a.name).join('、')}` : '未关联角色或场景参考';
}
function openCanvasById(id: number) { const index = storyboard.value.findIndex(frame => frame.id === id); if (index >= 0) void sendFrameToCanvas(storyboard.value[index], index); }
async function sendFrameToCanvas(item: Storyboard, index: number) {
  if (!item.id || !item.src || !project.value?.id || !episodesId.value) return;
  const refs = props.assetsData.flatMap(a => [a, ...(a.derive || [])]).filter(a => item.associateAssetsIds?.includes(a.id) && a.src);
  try { await sendProjectImageToCanvas({ kind: 'storyboard', projectId: Number(project.value.id), targetId: item.id, scriptId: episodesId.value }, [{ src: item.src, name: `分镜 S${String(index + 1).padStart(2, '0')}`, id: item.id, prompt: item.prompt || item.videoDesc || '' }, ...refs.map(a => ({ src: a.src, name: `参考 · ${a.name}` }))]); }
  catch (e: any) { window.$message.error(e?.message || '发送到画布失败'); }
}
function handleDeleteSelected() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.storyboard.confirmBatchDeleteBody", { index: selectedIds.value.length }),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        if (!selectedIds.value.length) {
          dialog.destroy();
          return window.$message.error($t("workbench.production.node.storyboard.pleaseSelectImage"));
        }
        axios.post("/production/storyboard/batchDelete", {
          ids: selectedIds.value,
          projectId: project.value?.id,
        });
        storyboard.value = storyboard.value.filter((i) => !selectedIds.value.includes(i.id!));
        selectedIds.value = [];
        window.$message.success($t("workbench.production.node.storyboard.deleteSuccess"));
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}
const currentRow = ref<{
  flowId?: number | null;
  resultImages: { src: string; prompt: string }[];
  referanceImages: string[];
}>({
  flowId: null,
  resultImages: [],
  referanceImages: [],
});

const tagColors = ["#5bccb3", "#9c7cfc", "#fbbf24", "#5b9afc", "#e86b6b", "#7cb8fc", "#e8a855", "#34d399"];

function closePreview() {
  previewImages.value = [];
}
async function downLoadImage() {
  LoadingPlugin(true);
  const allIds = (storyboard.value ?? []).filter((s) => s.src).map((s) => s.id!);
  if (!allIds.length) {
    window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
    LoadingPlugin(false);
    return;
  }
  try {
    const res = await axios.post(
      "/production/storyboard/downPreviewImage",
      {
        storyboardIds: allIds,
      },
      { responseType: "blob" },
    );
    // 创建下载链接
    const url = URL.createObjectURL(res as unknown as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storyboardImagePreview-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.$message.error($t("workbench.production.node.storyboard.imageLoadFailed"));
  } finally {
    LoadingPlugin(false);
  }
}
async function previewAll() {
  LoadingPlugin(true);
  const allIds = (storyboard.value ?? []).filter((s) => s.src).map((s) => s.id!);
  if (!allIds.length) {
    window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
    LoadingPlugin(false);
    return;
  }
  try {
    const { data } = await axios.post("/production/storyboard/previewImage", {
      storyboardIds: allIds,
      projectId: project.value?.id,
    });
    previewImages.value = [data];
    previewVisible.value = true;
  } catch {
    window.$message.error($t("workbench.production.node.storyboard.imageLoadFailed"));
  } finally {
    LoadingPlugin(false);
  }
}
const currentRowStoryboardInfo = ref<{ id: number | null; insertAfterIndex: number | null }>({
  id: null,
  insertAfterIndex: null,
});
const currentRowOriginalUrl = ref<string | null>(null);
const styleMaxSize = computed(() => {
  if (gridScale.value <= 1) return gridScale.value;
  else 1;
});
const generateLoading = ref(false);
async function batchGenerateImage() {
  if (!selectedIds.value.length) return window.$message.warning("请先选择分镜面板");
  generateLoading.value = true;
  try {
    await productionAgentStore().batchGenerateStoryboard(selectedIds.value, true);
    window.$message.success($t("workbench.production.node.storyboard.batchGenerateSuccess"));
    selectedIds.value = [];
  } catch (e) {
    window.$message.error($t("workbench.production.node.storyboard.batchGenerateFailed"));
  } finally {
    generateLoading.value = false;
  }
}
function editStoryboaryImage(item: Storyboard, images: string[], insertAfterIndex: number | null = null) {
  currentRowOriginalUrl.value = insertAfterIndex == null ? item.src || null : null;
  currentRowStoryboardInfo.value = {
    id: insertAfterIndex == null ? item?.id! : null,
    insertAfterIndex,
  };
  currentRow.value = {
    flowId: item?.flowId ?? null,
    resultImages: [],
    referanceImages: [],
  };

  if (currentRowStoryboardInfo.value.id) {
    let imagesPush: string[] = [];

    if (item.associateAssetsIds && item.associateAssetsIds.length > 0) {
      const assetsImages: string[] = [];
      for (const id of item.associateAssetsIds) {
        // 先查顶层 asset
        const asset = props.assetsData.find((a) => a.id === id);
        if (asset) {
          if (asset.src) assetsImages.push(asset.src);
          continue;
        }
        // 再查 derive
        for (const a of props.assetsData) {
          const derive = a.derive?.find((d) => d.id === id);
          if (derive) {
            if (derive.src) assetsImages.push(derive.src);
            break;
          }
        }
      }
      imagesPush = imagesPush.concat(assetsImages);
    }
    // if (item?.referenceIds && item.referenceIds.length > 0) {
    //   const referenImages = storyboard.value
    //     .filter((s) => item.referenceIds!.includes(s.id))
    //     .map((s) => s.src)
    //     .filter(Boolean) as string[];
    //   imagesPush = imagesPush.concat(referenImages);
    // }
    currentRow.value.referanceImages = imagesPush;
    currentRow.value.resultImages = [{ src: images.length ? images[0] : "", prompt: item.prompt ?? "" }];
  } else {
    currentRow.value.referanceImages = images.filter(Boolean);
  }
  visible.value = true;
}

async function save({ imageUrl, flowId }: { imageUrl: string; flowId: number }) {
  if (!imageUrl) return;

  const { id, insertAfterIndex } = currentRowStoryboardInfo.value;

  // 插入模式：在两张图之间新增一条分镜
  if (id === null && insertAfterIndex !== null) {
    const newFrame: Storyboard = {
      duration: 0,
      prompt: "",
      src: imageUrl,
      videoDesc: "",
      shouldGenerateImage: 1,
      state: "已完成",
    };
    const { data } = await axios.post("/production/storyboard/addStoryboard", {
      ...newFrame,
      projectId: project.value?.id,
      scriptId: episodesId.value,
      flowId,
    });

    storyboard.value.splice(insertAfterIndex + 1, 0, { ...newFrame, id: data.id!, flowId });
    productionAgentStore().setFlowData();
    return;
  }

  // 更新模式：更新对应分镜的 src
  const target = storyboard.value.find((s) => s.id === id);
  const { data } = await axios.post("/production/storyboard/updateStoryboardUrl", {
    id: id,
    url: imageUrl,
    flowId,
    expectedUrl: currentRowOriginalUrl.value,
  });
  if (target) {
    target.src = imageUrl;
    target.state = "已完成";
    target.flowId = flowId;
    target.continuity = data.continuity;
  }
}

async function saveFromCanvas(payload: { imageUrl: string; flowId: number; onComplete: (failure?: unknown) => void }) {
  try { await save(payload); payload.onComplete(); } catch (e) { payload.onComplete(e); }
}

async function removeFn(id: number) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.storyboard.confirmDeleteBody"),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      if (!id) {
        const index = storyboard.value.findIndex((s) => s.id === id);
        if (index !== -1) {
          storyboard.value.splice(index, 1);
        }
        dialog.destroy();
        return;
      }
      try {
        await axios.post("/production/storyboard/removeFrame", {
          id,
          projectId: project.value?.id,
        });
        const index = storyboard.value.findIndex((s) => s.id === id);
        if (index !== -1) {
          storyboard.value.splice(index, 1);
        }
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}

function editInfo(item: Storyboard) {
  const formData = reactive({
    prompt: item.prompt ?? "",
    videoDesc: item?.videoDesc ?? "",
    duration: Number(item.duration) || 0,
  });

  const bodyVNode = () =>
    h("div", { class: "editInfoForm" }, [
      h("div", { class: "editInfoField" }, [
        h("label", { class: "editInfoLabel" }, "镜头时长（秒）"),
        h(resolveComponent("t-input-number"), { value: formData.duration, min: 0.1, max: 3600, step: 1, "onUpdate:value": (v: number) => (formData.duration = v) }),
      ]),
      h("div", { class: "editInfoField" }, [
        h("label", { class: "editInfoLabel" }, $t("workbench.production.node.storyboard.prompt")),
        h(resolveComponent("t-textarea"), {
          value: formData.prompt,
          placeholder: $t("workbench.production.node.storyboard.promptPlaceholder"),
          autosize: { minRows: 3, maxRows: 6 },
          "onUpdate:value": (v: string) => (formData.prompt = v),
        }),
      ]),
      h("div", { class: "editInfoField" }, [
        h("label", { class: "editInfoLabel" }, $t("workbench.production.node.storyboard.videoDesc")),
        h(resolveComponent("t-textarea"), {
          value: formData.videoDesc,
          placeholder: $t("workbench.production.node.storyboard.videoDescPlaceholder"),
          autosize: { minRows: 3, maxRows: 6 },
          "onUpdate:value": (v: string) => (formData.videoDesc = v),
        }),
      ]),
    ]);

  const confirmDialog = DialogPlugin.confirm({
    header: $t("workbench.production.node.storyboard.editInfo"),
    body: bodyVNode,
    width: 480,
    confirmBtn: {
      content: $t("common.submit"),
      theme: "primary",
      loading: false,
    },
    onConfirm: async () => {
      if (!(formData.duration > 0) || !Number.isFinite(formData.duration)) { window.$message.warning("请填写大于 0 的镜头时长"); return; }
      confirmDialog.update({ confirmBtn: { content: $t("common.submitting"), loading: true } });
      try {
        await axios.post("/production/storyboard/editStoryboardInfo", {
          id: item.id,
          prompt: formData.prompt,
          videoDesc: formData.videoDesc,
          duration: formData.duration,
        });
        item.duration = formData.duration;
        item.prompt = formData.prompt;
        item.videoDesc = formData.videoDesc;
        window.$message.success($t("common.editSuccess"));
        confirmDialog.destroy();
      } catch (e) {
        window.$message.error((e as any)?.message || $t("common.editFailed"));
      } finally {
        confirmDialog.update({ confirmBtn: { content: $t("common.submit"), loading: false } });
      }
    },
  });
}
defineExpose({
  editFrame: (id: number) => { const item = storyboard.value.find(frame => frame.id === id); if (item) editInfo(item); },
  openImageCanvas: (id: number) => { const item = storyboard.value.find(frame => frame.id === id); if (item) editStoryboaryImage(item, item.src ? [item.src] : []); },
});
</script>

<style lang="scss" scoped>
.historyPanel { color: #3b342f; }
.historyPanel > p { color: #93877e; line-height: 1.6; }
.historyPreview { position: relative; display: grid; place-items: center; background: #f4f1ed; border-radius: 12px; min-height: 220px; overflow: hidden; }
.historyPreview img { display: block; width: 100%; max-height: 360px; object-fit: contain; }
.historyPreview span { position: absolute; left: 12px; bottom: 12px; padding: 5px 10px; color: white; background: #28211dcc; border-radius: 6px; font-size: 12px; }
.historyGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; max-height: 230px; overflow: auto; margin-top: 16px; }
.historyGrid button { padding: 5px; text-align: left; background: white; border: 1px solid #e9e2dc; border-radius: 9px; cursor: pointer; }
.historyGrid button.selected { border: 2px solid #c74e24; padding: 4px; }
.historyGrid img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 5px; }
.historyGrid span { display: block; padding: 7px 2px 2px; color: #81766f; font-size: 11px; }
.historyActions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.historyActions button { padding: 9px 18px; background: white; border: 1px solid #e6ddd5; border-radius: 8px; cursor: pointer; }
.historyActions .historyAdopt { color: white; background: #bd4b24; border-color: #bd4b24; }
.historyActions button:disabled { opacity: .45; cursor: not-allowed; }
.shotMaking { padding: 2px 3px 6px; color:#332d29; }
.makingHeader { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; margin-bottom:22px; }
.makingHeader span { color:#bc5a32; font-size:10px; font-weight:700; letter-spacing:.14em; }
.makingHeader h2 { margin:7px 0; font-size:21px; font-weight:650; }
.makingHeader p { margin:0; color:#93877f; font-size:12px; line-height:1.7; }
.makingCount { display:flex; flex-direction:column; align-items:flex-end; gap:3px; white-space:nowrap; }.makingCount strong { font-size:18px; }.makingCount small { color:#a2978e; font-size:10px; }
.makingBatch { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; padding:12px 14px; border:1px solid #eee5df; border-radius:10px; background:#faf8f6; font-size:12px; }
.makingBatch label { display:flex; align-items:center; gap:7px; cursor:pointer; }.makingBatch input,.makingCheck input { accent-color:#c6552e; }.makingBatch button { border:0; background:none; color:#a44e30; font:inherit; cursor:pointer; }.makingBatch span,.makingBatch small { color:#9a8c83; }.makingBatch small { font-size:10px; }.makingBatch .makingBatchGenerate { margin-left:auto; padding:8px 12px; border-radius:8px; background:#c6532e; color:#fff; }.makingBatch button:disabled { opacity:.45; cursor:not-allowed; }
.makingGrid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }.makingCard { min-width:0; overflow:hidden; border:1px solid #eae2dc; border-radius:12px; background:#fff; box-shadow:0 4px 16px #36251908; }.makingImage { position:relative; aspect-ratio:16/9; overflow:hidden; background:#25211e; }.makingImage img { width:100%; height:100%; object-fit:contain; }.makingEmpty { display:flex; height:100%; flex-direction:column; justify-content:center; align-items:center; gap:8px; background:#f4f0ed; color:#a69b93; font-size:12px; }.makingCheck,.makingState { position:absolute; top:10px; padding:5px 8px; border-radius:6px; background:#211b18b8; color:white; font-size:10px; }.makingCheck { left:10px; display:flex; align-items:center; gap:6px; cursor:pointer; }.makingState { right:10px; }
.makingCopy { padding:13px 14px 10px; }.makingCopy > div:first-child { display:flex; justify-content:space-between; align-items:center; }.makingCopy strong { font-size:13px; }.makingCopy small { color:#a79b92; font-size:11px; }.makingCopy p { display:-webkit-box; min-height:36px; margin:8px 0; overflow:hidden; color:#81756d; font-size:11px; line-height:1.65; -webkit-line-clamp:2; -webkit-box-orient:vertical; }.makingRefs { overflow:hidden; color:#a09288; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
.makingCard footer { display:flex; align-items:center; flex-wrap:wrap; gap:7px; margin:0 14px; padding:10px 0 13px; border-top:1px solid #f1eae5; }.makingCard footer button { padding:5px 0; border:0; background:transparent; color:#8a7c72; font:inherit; font-size:11px; cursor:pointer; }.makingCard footer .makingMain { margin-left:auto; padding:6px 9px; border-radius:7px; background:#c6532e; color:#fff; }.makingCard footer button:disabled { opacity:.5; cursor:not-allowed; }.makingCard footer .makingCanvas { width:100%; color:#b35633; text-align:right; }
.makingNoShots { padding:50px 15px; border:1px dashed #e4d9d0; border-radius:12px; text-align:center; color:#9d9085; }.makingNoShots strong { color:#62574f; }.makingNoShots p { font-size:12px; }
@media(max-width:700px) { .makingHeader { align-items:flex-start; }.makingBatch .makingBatchGenerate { margin-left:0; }.makingGrid { grid-template-columns:1fr; } }
@media(min-width:701px) and (max-width:1050px) { .makingGrid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
.storyboard {
  min-width: 500px;
  max-width: 100vw;
  user-select: text;
  cursor: default;

  &.fluid {
    width: 100%;
    min-width: 0;
  }

  .titleBar {
    display: flex;
    align-items: center;
    cursor: grab;
    user-select: none;
  }
  .title {
    background-color: #000;
    width: fit-content;
    padding: 5px 10px;
    color: #fff;
    border-radius: 8px 0;
    font-size: 16px;
  }
  .titleHint { margin-top: 5px; color: #9a96a3; font-size: 11px; }

  .content {
    margin-top: 12px;
  }

  .frameGrid {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0;
  }

  .frameItem {
    position: relative;
    display: inline-flex;
    align-items: flex-start;
    margin: 4px;
  }

  .addBetween {
    position: absolute;
    z-index: 10;
    top: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    span {
      line-height: 1;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    &.expanded {
      opacity: 1;
      pointer-events: auto;
    }
    &:hover {
      // background: var(--td-brand-color);
      // color: #fff;
      // transform: scale(1.15);
    }
    &--left {
      transform: translate(calc(-50% - 4px), -50%);
    }
    &--right {
      transform: translate(calc(50% + 4px), -50%);
      right: 0;
    }
  }

  .frameCard {
    display: flex;
    flex-direction: column;
    cursor: pointer;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }
  .frameMeta { width: 100%; padding: 7px 2px 2px; .frameName { color: var(--td-text-color-primary); font-size: 12px; font-weight: 700; span { color: var(--td-text-color-secondary); font-size: 10px; font-weight: 400; } } .frameStatuses { display: flex; gap: 4px; margin-top: 5px; flex-wrap: wrap; } .statusPill { padding: 2px 5px; border-radius: 5px; color: #64748b; background: #f1f5f9; font-size: 9px; &.done { color: #047857; background: #dff7ed; } &.loading { color: #1d4ed8; background: #dbeafe; } &.failed { color: #b91c1c; background: #fee2e2; } } }

  .frameImage {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    transition: opacity 0.2s ease;
    &:hover {
      .remove,
      .regen,
      .editNode {
        opacity: 1;
      }
    }
    .remove {
      position: absolute;
      top: 3px;
      right: 3px;
      z-index: 9999;
      padding: 5px;
      border-radius: 10px;
      background-color: rgba(220, 50, 50, 0.7);
      cursor: pointer;
      opacity: 0;
      transform-origin: top right;
      &:hover {
        background-color: rgba(220, 50, 50, 1);
      }
    }
    /* 重画：右上第二颗，橙色，和删除拉开语义距离 */
    .regen {
      position: absolute;
      top: 3px;
      right: 38px;
      z-index: 9999;
      padding: 6px;
      border-radius: 10px;
      background-color: rgba(224, 100, 31, 0.82);
      cursor: pointer;
      opacity: 0;
      transform-origin: top right;
      &:hover {
        background-color: rgba(224, 100, 31, 1);
      }
    }
    .continuityBadge {
      position: absolute;
      left: 3px;
      bottom: 3px;
      z-index: 9998;
      padding: 3px 7px;
      border-radius: 7px;
      background: rgba(181, 113, 60, 0.85);
      color: #fff;
      font-size: 10px;
    }
    .editNode {
      position: absolute;
      bottom: 3px;
      left: 3px;
      z-index: 9999;
      padding: 5px;
      border-radius: 10px;
      background-color: rgba(24, 144, 255, 0.7);
      cursor: pointer;
      transform-origin: bottom left;
      opacity: 0;
      &:hover {
        background-color: rgba(24, 144, 255, 1);
      }
    }
  }

  /* 展开尾卡：分镜截断时的入口，尺寸对齐帧图 */
  .moreCard {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    align-self: flex-start;
    margin: 4px;
    width: 144px;
    height: 144px;
    border: 1.5px dashed #e3c6ac;
    border-radius: 10px;
    background: #fffaf5;
    color: #c07a4c;
    cursor: pointer;
    transition: border-color 0.18s, background 0.18s;
    strong { font-size: 22px; font-weight: 750; line-height: 1; }
    span { font-size: 11px; }
    &:hover { border-color: #e6a97e; background: #fff3e9; }
    &.slim { width: auto; height: 32px; padding: 0 14px; margin-top: 8px; flex-direction: row; align-self: flex-start; }
  }

  .generatingPlaceholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background-color: var(--td-bg-color-container-hover, #f5f5f5);
    font-size: 12px;
  }

  .frameImg {
    width: 100%;
    height: 100%;
    object-fit: cover;
    .imageToolsWrap {
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }

    &:hover {
      .imageToolsWrap {
        opacity: 1;
        pointer-events: auto;
      }
    }
  }

  .frameCheckbox {
    position: absolute;
    left: 3px;
    top: 3px;
    z-index: 3;
    transform-origin: top left;
  }

  .frameTypeTag {
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    border: none;
    z-index: 2;
    padding: 0 4px;
    line-height: 18px;
    border-radius: 3px;
  }

  .frameTag {
    position: absolute;
    right: 8px;
    bottom: 8px;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    border: none;
  }

  .scaleControl {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--td-text-color-primary, #333);
  }

  .frameInfo {
    margin-top: 6px;
    font-size: 12px;
    color: var(--td-text-color-primary, #333);
    line-height: 1.4;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
:deep(.t-image__wrapper) {
  background-color: transparent !important;
}
.editInfoForm {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.editInfoField {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.editInfoLabel {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
</style>
