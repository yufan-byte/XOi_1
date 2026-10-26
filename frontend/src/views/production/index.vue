<template>
  <div class="productionWorkspace">
  <div v-if="contextReady && episodesId" v-show="viewMode === 'studio'" class="studioPage" :class="{'withAssistant':openShowVisible}">
    <ShotStudio :key="episodesId" ref="studioRef" embedded :episodes-options="episodesOptions" :episode-switching="episodeSwitching" @stage-change="studioStage = $event" @episode-change="handleEpisodesChange" @show-overview="viewMode = 'canvas'" @toggle-assistant="openShowVisible = !openShowVisible" />
    <aside v-if="openShowVisible" class="studioAssistant"><rightChatBox docked :title="title" :stage="studioStage" @close="openShowVisible=false" /></aside>
  </div>
  <div v-else-if="viewMode === 'studio'" class="studioPageLoading"><t-loading/><span>正在打开本集工作台…</span></div>
  <div v-if="viewMode === 'canvas'" class="productionStage">
    <VueFlow
      class="flowMain"
      :class="{ 'is-interacting': isInteracting && otherSetting.interacting, 'space-dragging': isSpacePressed }"
      id="mainFlowBox"
      @mousedown="onSpaceMouseDown"
      @node-double-click="handleNodeDoubleClick"
      :nodes="episodesId ? nodes : []"
      :edges="episodesId ? edges : []"
      :nodes-draggable="!isSpacePressed && !boardLocked"
      :nodes-connectable="!isSpacePressed && !boardLocked"
      :elements-selectable="!isSpacePressed && !boardLocked"
      :only-render-visible-elements="false"
      :max-zoom="10"
      :min-zoom="0.1"
      :nodes-focusable="false"
      :edges-focusable="false"
      :edges-updatable="false"
      :elevate-nodes-on-select="true"
      :elevate-edges-on-select="false"
      :disable-keyboard-a11y="true"
      :select-nodes-on-drag="false"
      :auto-pan-on-node-drag="false"
      :auto-pan-on-connect="false"
      :zoom-on-double-click="false"
      :delete-key-code="null"
      :zoom-activation-key-code="null"
      :pan-activation-key-code="null"
      :pan-on-scroll="canvasWheelEvent == 'scroll' ? true : false"
      :zoom-on-scroll="canvasWheelEvent == 'zoom' ? true : false"
      :selection-key-code="null"
      :multi-selection-key-code="null">
      <template #node-script="props">
        <scriptNode :id="props.id" v-model="flowData.script" :handleIds="props.data.handleIds" />
      </template>
      <template #node-scriptPlan="props">
        <scriptPlan :id="props.id" v-model="flowData.scriptPlan" :handleIds="props.data.handleIds" />
      </template>
      <template #node-storyboardTable="props">
        <storyboardTable :id="props.id" v-model="flowData.storyboardTable" :handleIds="props.data.handleIds" />
      </template>
      <template #node-assets="props">
        <assets :id="props.id" v-model="flowData.assets" :handleIds="props.data.handleIds" />
      </template>
      <template #node-storyboard="props">
        <storyboard :id="props.id" v-model="flowData.storyboard" :assetsData="flowData.assets" :handleIds="props.data.handleIds" />
      </template>
      <template #node-workbench="props">
        <workbench :id="props.id" v-model="flowData.workbench" :handleIds="props.data.handleIds" />
      </template>
      <!-- 成片节点：剪辑台 → 成片（本地下载同时归档到 o_output 的整片，是这条流水线的终点） -->
      <template #node-output="props">
        <outputNode :id="props.id" :items="flowData.output" :handleIds="props.data.handleIds" />
      </template>
      <Background variant="dots" :gap="28" :size="1" color="#ddd1c8" />
      <Controls :show-zoom="false" :show-fit-view="false" :show-interactive="false">
        <div class="directorViewControls nowheel nodrag">
          <button type="button" aria-label="缩小画布" title="缩小画布" @click="zoomOut({ duration: 180 })"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 12h14" /></svg></button>
          <button type="button" class="zoomValue" aria-label="恢复百分之百缩放" title="恢复 100% 缩放" @click="zoomTo(1, { duration: 200 })">{{ Math.round(viewport.zoom * 100) }}%</button>
          <button type="button" aria-label="放大画布" title="放大画布" @click="zoomIn({ duration: 180 })"><i-plus size="16" /></button>
          <span class="controlDivider" />
          <button type="button" class="viewAction" aria-label="显示全部制作栏" title="显示全部制作栏" @click="showOverview"><i-full-screen-one size="16" /><span>总览</span></button>
          <button type="button" class="viewAction" :class="{ locked: boardLocked }" :aria-label="boardLocked ? '解锁节点操作' : '锁定节点位置'" :aria-pressed="boardLocked" :title="boardLocked ? '解锁节点操作' : '锁定节点位置'" @click="boardLocked = !boardLocked"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2" /><path :d="boardLocked ? 'M8 10V6a4 4 0 0 1 8 0v4' : 'M8 10V6a4 4 0 0 1 7.5-2'" /><path d="M12 14v3" /></svg></button>
        </div>
      </Controls>
      <div class="boardReadingHint">栏内滚轮浏览 · 双击标题放大查看</div>
      <div class="floatingWindow">
        <div class="productionToolbar">
          <div class="episodesSelect f ac">
            <StoryWorkspaceHeader class="productionMark" current="production" :project-type="project?.projectType" title="关系画布" description="辅助查看本集内容之间的关联。" compact />
            <t-select
              :value="episodesId"
              :loading="episodeSwitching"
              :disabled="episodeSwitching"
              :placeholder="$t('workbench.production.selectPlaceholder')"
              autoWidth
              :options="episodesOptions"
              filterable
              @change="handleEpisodesChange">
              <template #label>
                <i-document-folder size="20" />
              </template>
            </t-select>
            <t-tooltip placement="bottom" theme="primary" :content="$t('workbench.production.getFlowData')">
              <t-button class="guide-refresh-btn" aria-label="重新加载制作数据" @click="refFlowData" variant="outline">
                <template #icon><i-refresh size="16" /></template>
              </t-button>
            </t-tooltip>
            <t-tooltip placement="bottom" theme="primary" :content="$t('workbench.production.autoLayoutLR')">
              <t-button class="guide-layout-btn" aria-label="整理导演画布" @click="layoutGraph()" variant="outline">
                <template #icon><i-tree-diagram size="16" /></template>
              </t-button>
            </t-tooltip>
            <t-button v-if="episodesId" variant="text" class="overviewBtn" @click="showOverview">导演总览</t-button>
            <t-button v-if="episodesId" variant="text" class="overviewBtn modeSwitch" @click="openStudio()">← 返回制作流程</t-button>
            <i-loading-four class="spin" size="16" v-show="loading"></i-loading-four>          </div>
          <div v-if="episodesId" class="productionStatus" aria-label="制作进度">
            <span class="statusDivider" />
            <span class="statusMetric">分镜 <b>{{ productionProgress.storyboardTotal }}</b></span>
            <span class="statusMetric">图片 <b>{{ productionProgress.imageDone }}/{{ productionProgress.storyboardTotal }}</b></span>
            <span class="statusMetric">视频 <b>{{ productionProgress.videoDone }}/{{ productionProgress.videoTotal }}</b></span>
            <span class="statusMetric">成片 <b>{{ productionProgress.outputCount }}</b></span>
            <t-tag v-if="productionProgress.issueCount" theme="warning" variant="light" size="small">待处理 {{ productionProgress.issueCount }}</t-tag>
            <span v-else-if="!flowData.reviewState?.tableApproved" class="statusPending">计划 / 分镜表待审核</span>
            <span v-else class="statusReady">流程正常</span>

          </div>
        </div>
      </div>
    </VueFlow>

    <!-- 画布模式的导演助理：与步骤模式一致的右侧停靠栏；收起时右下角悬浮按钮唤起 -->
    <aside v-if="episodesId && openShowVisible" class="canvasAssistantDock">
      <rightChatBox docked :title="title" @close="openShowVisible = false" />
    </aside>
    <button v-if="episodesId && !openShowVisible" type="button" class="assistantLauncher" aria-label="展开导演助理" @click="openShowVisible = true">
      <i-movie theme="outline" size="17" />
      <span>导演助理</span>
    </button>
  </div>
  </div>
</template>

<script setup lang="ts">
import StoryWorkspaceHeader from "@/components/pipeline/StoryWorkspaceHeader.vue";
import { useLocalStorage, useEventListener } from "@vueuse/core";
import { VueFlow, useVueFlow, type NodeMouseEvent } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
//子node组件
import scriptNode from "./node/script.vue";
import scriptPlan from "./node/scriptPlan.vue";
import assets from "./node/assets.vue";
import storyboardTable from "./node/storyboardTable.vue";
import storyboard from "./node/storyboard.vue";
import workbench from "./node/workbench.vue";
import outputNode from "./node/output.vue";
import rightChatBox from "./components/rightChatBox/index.vue";
import type { StudioStage } from "./utils/studioWorkflow";
import ShotStudio from "./components/workbench/index.vue";
import { useLayout } from "./utils/dagre";
import { useFlowBuilder } from "./utils/flowBuilder";
import { directorProgressKey, getDirectorProgress } from "./utils/directorProgress";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";

const { project } = storeToRefs(projectStore());
import settingStore from "@/stores/setting";
const { canvasWheelEvent, otherSetting } = storeToRefs(settingStore());
// 两种平行工作方式：工作台负责顺序制作，关系画布负责跨步骤总览与联动。
const viewMode = ref<"studio" | "canvas">("studio");
const studioStage = ref<StudioStage>("planning");
const contextReady = ref(false);
const studioRef = ref<{ setActiveMenu: (menu:string) => void; openDocument: (value:string) => Promise<void> }>();
async function openStudio(menu?: string) {
  viewMode.value = "studio";
  await nextTick();
  if (menu) studioRef.value?.setActiveMenu(menu);
}
function onOpenStudio(event: Event) { void openStudio((event as CustomEvent<{tab?:string}>).detail?.tab); }
onMounted(() => window.addEventListener("production:open-studio", onOpenStudio));
onUnmounted(() => window.removeEventListener("production:open-studio", onOpenStudio));
// 默认收起，先把完整工作区交给用户；需要时再打开导演助理，不遮挡节点与底部工具。
const openShowVisible = ref(false);
const boardLocked = ref(false);
// fitView 的 padding 只接受 0-1 的视口比例（像素字符串会被忽略导致节点贴边被裁）
const boardFitPadding = { top: 0.14, right: 0.06, bottom: 0.12, left: 0.06 } as const;
const {
  toObject,
  fromObject,
  fitView,
  findNode,
  onNodeDragStart,
  onNodeDragStop,
  onMoveStart,
  onMoveEnd,
  updateNodeInternals,
  getNodes,
  getViewport,
  setViewport,
  viewport,
  zoomIn,
  zoomOut,
  zoomTo,
} = useVueFlow({ id: "mainFlowBox" });

function showOverview() {
  return fitView({ duration: 300, padding: boardFitPadding, maxZoom: 1 });
}
function handleNodeDoubleClick({ event, node }: NodeMouseEvent) {
  if ((event.target as HTMLElement).closest(".titleBar")) {
    void fitView({ nodes: [node.id], padding: boardFitPadding, maxZoom: 1, duration: 250 });
  }
}

// 按住空格+左键拖拽画布（即使在节点上）
const isSpacePressed = ref(false);
let dragOrigin = { x: 0, y: 0, vx: 0, vy: 0 };

function onSpaceMouseDown(e: MouseEvent) {
  if (!isSpacePressed.value || e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  const vp = getViewport();
  dragOrigin = { x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y };
  document.addEventListener("mousemove", onSpaceMouseMove);
  document.addEventListener("mouseup", onSpaceMouseUp, { once: true });
}
function onSpaceMouseMove(e: MouseEvent) {
  setViewport({ x: dragOrigin.vx + e.clientX - dragOrigin.x, y: dragOrigin.vy + e.clientY - dragOrigin.y, zoom: getViewport().zoom });
}
function onSpaceMouseUp() {
  document.removeEventListener("mousemove", onSpaceMouseMove);
}

useEventListener(document, "keydown", (e: KeyboardEvent) => {
  if (e.code === "Space" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, button, a, [contenteditable], .t-dialog, .t-drawer")) return;
    e.preventDefault();
    isSpacePressed.value = true;
  }
});
useEventListener(document, "keyup", (e: KeyboardEvent) => {
  if (e.code === "Space") isSpacePressed.value = false;
});

// 拖拽/平移期间降低渲染复杂度，优化性能
const isInteracting = ref(false);
let interactionTimer: ReturnType<typeof setTimeout> | null = null;

function startInteracting() {
  if (interactionTimer) clearTimeout(interactionTimer);
  isInteracting.value = true;
}
function stopInteracting() {
  // 延迟恢复，避免频繁切换
  if (interactionTimer) clearTimeout(interactionTimer);
  interactionTimer = setTimeout(() => {
    isInteracting.value = false;
  }, 150);
}

onNodeDragStart(() => startInteracting());
onMoveStart(() => startInteracting());
onMoveEnd(() => stopInteracting());
const { layout } = useLayout("mainFlowBox");

import productionAgentStore from "@/stores/productionAgent";
import { guardProduction } from "@/utils/pipelineGuard";
const { episodesId, flowData, status } = storeToRefs(productionAgentStore());
provide(directorProgressKey, computed(() => getDirectorProgress(flowData.value)));
const router = useRouter();
const route = useRoute();
provide("episodesId", episodesId);
provide('productionEpisodeTitle', computed(() => episodesOptions.value.find(option => option.value === episodesId.value)?.label || '当前分集'));
async function focusStudioContext(event: Event) {
  const node = (event as CustomEvent<{node:string}>).detail?.node;
  if (!['script','scriptPlan','assets','storyboardTable'].includes(node)) return;
  await openStudio();
  await studioRef.value?.openDocument(node);
}
onMounted(() => window.addEventListener('production:studio-context', focusStudioContext));
onUnmounted(() => window.removeEventListener('production:studio-context', focusStudioContext));


const loading = ref(false);

// 节点位置
const nodePositions = ref<Record<string, { x: number; y: number }>>({
  script: { x: 0, y: 0 },
  scriptPlan: { x: 900, y: 0 },
  assets: { x: 0, y: 500 },
  storyboardTable: { x: 1800, y: 0 },
  storyboard: { x: 2500, y: 0 },
  workbench: { x: 3000, y: 0 },
  output: { x: 4500, y: 0 },
});
const { nodes, edges } = useFlowBuilder(flowData, nodePositions);

// 用户拖拽节点后，同步位置到 nodePositions，防止 flowData 更新时位置被复原
onNodeDragStop(async ({ nodes: draggedNodes }) => {
  await nextTick();
  stopInteracting();
  for (const node of draggedNodes) {
    nodePositions.value[node.id] = { x: node.position.x, y: node.position.y };
  }
});

// flowData 变化时，将 VueFlow 中节点的当前实际位置同步到 nodePositions，防止位置回跳
watch(
  flowData,
  () => {
    for (const node of getNodes.value) {
      nodePositions.value[node.id] = { x: node.position.x, y: node.position.y };
    }
  },
  { deep: true },
);

async function waitForNodesReady(maxRetries = 60, delay = 100) {
  while (maxRetries-- > 0) {
    const nodes = getNodes.value;
    if (nodes.length > 0) {
      // 等待所有节点的 DOM 尺寸都已被 VueFlow 测量完成
      const allMeasured = nodes.every((n) => n.dimensions?.width && n.dimensions.width > 0);
      if (allMeasured) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return false;
}

function openAssistantFromStage() { openShowVisible.value = true; }
onMounted(() => window.addEventListener('production:open-assistant', openAssistantFromStage));
onUnmounted(() => window.removeEventListener('production:open-assistant', openAssistantFromStage));
onMounted(async () => {
  await getScriptData();
  if (!episodesId.value) {
    // P2：一集剧本都没有时别让用户对着空台子发呆，明确告知并引导去整理剧本
    guardProduction(router, { scriptCount: 0, assetTotal: 0, assetDone: 0 });
    return;
  }
  await loadEpisodeContext();
  contextReady.value = true;

  if (viewMode.value === "canvas") {
    await waitForNodesReady();
    await layoutGraph();
  }
  void runPipelineGuard();
});

// 打开辅助画布时再测量与排版（画布未挂载时节点尺寸是空的，提前排版只会得到默认占位）
watch(viewMode, async (mode) => {
  if (mode !== "canvas") return;
  await nextTick();
  await waitForNodesReady();
  await layoutGraph();
});

/** P2 前置校验：角色/场景一张图都没出时给出明确警示（允许继续，但必须让用户知道会失去一致性）。
 *  资产计数取项目进度聚合（o_assets 的 total/done），不依赖当前集 flowData —— flowData 由 watch 异步拉，
 *  在此刻可能还没到；而 assetDone 的口径（已出图张数）不会因为“刚在上一页提取完资产”而变，读缓存安全。 */
function runPipelineGuard() {
  const progress = project.value?.progress;
  guardProduction(router, {
    scriptCount: episodesOptions.value.length,
    assetTotal: progress?.asset?.total ?? 0,
    assetDone: progress?.asset?.done ?? 0,
  });
}

const episodesOptions = ref<{ label: string; value: number }[]>([]);
function confirmEpisodesSwitch() {
  if (status.value !== "pending" && status.value !== "streaming") {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const dialog = DialogPlugin.confirm({
      header: $t("workbench.production.confirm"),
      body: $t("workbench.production.confirmEpisodesSwitch"),
      confirmBtn: $t("workbench.production.save"),
      cancelBtn: $t("workbench.production.cancel"),
      theme: "warning",
      onConfirm: () => {
        dialog.destroy();
        resolve(true);
      },
      onCancel: () => {
        dialog.destroy();
        resolve(false);
      },
      onClose: () => {
        dialog.destroy();
        resolve(false);
      },
    });
  });
}

const episodeSwitching = ref(false);
function handleEpisodesChange(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const nextEpisodesId = Number(rawValue);
  if (!Number.isFinite(nextEpisodesId) || nextEpisodesId === episodesId.value || episodeSwitching.value) return;
  episodeSwitching.value = true;
  void (async () => {
    try {
      if (!(await confirmEpisodesSwitch())) {
        if (String(route.query.episode || "") !== String(episodesId.value || "")) {
          await router.replace({ path: "/production", query: { ...route.query, episode: String(episodesId.value) } });
        }
        return;
      }
      contextReady.value = false;
      await nextTick();
      episodesId.value = nextEpisodesId;
      await router.replace({ path: "/production", query: { ...route.query, projectId: String(project.value?.id || ""), episode: String(nextEpisodesId) } });
      await loadEpisodeContext();
      await layoutGraph();
    } catch (error: any) {
      window.$message.error(error?.message || "分集加载失败，请重试");
    } finally { contextReady.value = true; episodeSwitching.value = false; }
  })();
}
// Keep browser history and episode deep links working when the page stays mounted.
watch(() => route.query.episode, value => {
  const id = Number(value);
  if (episodesOptions.value.some(episode => episode.value === id)) handleEpisodesChange(id);
});

async function getScriptData() {
  //获取剧本
  const { data: scriptRes } = await axios.post("/script/getScrptApi", {
    projectId: project.value?.id,
    name: "",
  });
  episodesOptions.value = scriptRes.map((ep: any) => ({
    label: ep.name,
    value: ep.id,
  }));
  if (episodesOptions.value.length) {
    // 返回制作页时优先恢复原分集；无效或已删除的分集才回退到第一集。
    const requestedEpisode = Number(route.query.episode);
    episodesId.value = episodesOptions.value.find((ep) => ep.value === requestedEpisode)?.value ?? episodesOptions.value[0].value;
  }
}

async function loadEpisodeContext() {
  // 显式读取一次，避免切回同一分集时 ref 值不变、watcher 不触发而沿用上个项目的数据。
  await Promise.all([productionAgentStore().getFlowData(), productionAgentStore().getHistory()]);
  productionAgentStore().updateContext();
}

async function layoutGraph(direction: "LR" | "TB" = "LR") {
  // 画布未挂载（步骤模式）时节点无尺寸可测，排版交给切换回画布时进行
  if (viewMode.value !== "canvas") return;
  // 等待 DOM 渲染完成
  await nextTick();

  // 强制 VueFlow 重新测量所有节点尺寸
  const nodeIds = getNodes.value.map((n) => n.id);
  updateNodeInternals(nodeIds);
  await nextTick();

  // 等待所有节点的 dimensions 都已被 VueFlow 正确测量且尺寸稳定
  let retries = 30;
  let lastSnapshot = "";
  let stableCount = 0;
  while (retries-- > 0) {
    const allMeasured = nodeIds.every((id) => {
      const node = findNode(id);
      return node?.dimensions?.width && node.dimensions.width > 0;
    });
    if (allMeasured) {
      // 检查尺寸是否稳定（连续两次相同才算就绪）
      const snapshot = nodeIds
        .map((id) => {
          const node = findNode(id);
          return `${id}:${node?.dimensions?.width}x${node?.dimensions?.height}`;
        })
        .join(",");
      if (snapshot === lastSnapshot) {
        stableCount++;
        if (stableCount >= 2) break;
      } else {
        stableCount = 0;
        lastSnapshot = snapshot;
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  const oldData = toObject();

  // 从 VueFlow 内部获取已测量的尺寸（流坐标系，无需 zoom 换算）
  const dims = new Map<string, { w: number; h: number }>();
  for (const n of oldData.nodes) {
    const vNode = findNode(n.id);
    dims.set(n.id, {
      w: vNode?.dimensions?.width ?? 150,
      h: vNode?.dimensions?.height ?? 50,
    });
  }

  const gapX = 56; // 列间距：给连线与节点标题留呼吸空间
  const gapY = 90; // 排间距：给上下排之间的连线留行程

  if (direction === "LR") {
    // 规整两排四列网格：上排=文本审批链（剧本/导演计划/分镜表），下排=生产链（资产/分镜/剪辑台/成片）。
    // 列宽取该列上下节点最大宽度，节点在列内水平居中——上下边缘严格对齐，一眼能看出「表格感」。
    const widthOf = (id: string) => dims.get(id)?.w || 0;
    const heightOf = (id: string) => dims.get(id)?.h || 0;
    const columns: Array<Array<string | null>> = [
      ["script", "assets"],
      ["scriptPlan", "storyboard"],
      ["storyboardTable", "workbench"],
      [null, "output"],
    ];
    const place = (id: string, x: number, y: number) => {
      const node = oldData.nodes.find(item => item.id === id);
      if (node) node.position = { x, y };
    };

    const colWidths = columns.map(col => Math.max(...col.map(id => id ? widthOf(id) : 0)));
    const colStarts: number[] = [];
    let x = 0;
    for (let i = 0; i < columns.length; i++) { colStarts.push(x); x += colWidths[i] + gapX; }

    const topRowHeight = Math.max(heightOf("script"), heightOf("scriptPlan"), heightOf("storyboardTable"));
    const bottomY = topRowHeight + gapY;
    columns.forEach((col, ci) => {
      const [topId, bottomId] = col;
      if (topId) place(topId, colStarts[ci] + Math.round((colWidths[ci] - widthOf(topId)) / 2), 0);
      if (bottomId) place(bottomId, colStarts[ci] + Math.round((colWidths[ci] - widthOf(bottomId)) / 2), bottomY);
    });
  } else {
    // TB 方向使用 dagre 自动布局
    const widths = [...dims.values()].map((d) => d.w);
    const heights = [...dims.values()].map((d) => d.h);
    const avgWidth = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 150;
    const avgHeight = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 50;
    const ranksep = avgHeight * 0.5 + gapY;
    const nodesep = avgWidth * 0.3 + gapX;
    oldData.nodes = layout(oldData.nodes, oldData.edges, direction, nodesep, ranksep);
  }

  await fromObject(oldData);
  await nextTick();

  // 布局后同步新位置到 nodePositions，防止后续 flowData 变化时回跳
  for (const node of getNodes.value) {
    nodePositions.value[node.id] = { x: node.position.x, y: node.position.y };
  }

  await showOverview();
}

const title = computed(() => {
  const episode = episodesOptions.value.find((option) => option.value === episodesId.value);
  return episode ? episode.label : "";
});

// 只读状态带：数据来自智能体写入的 flowData，不需要用户手动维护。
const productionProgress = computed(() => {
  const storyboard = flowData.value.storyboard ?? [];
  const total = storyboard.length;
  const imageDone = storyboard.filter((item: any) => item.state === "已完成" && item.src).length;
  const videoList = Array.isArray((flowData.value.workbench as any)?.videoList) ? (flowData.value.workbench as any).videoList : [];
  const videoDone = flowData.value.videoProgress?.done ?? videoList.filter((item: any) => item.state === "已完成" || item.state === "生成成功").length;
  const videoTotal = flowData.value.videoProgress?.total ?? videoList.length;
  const issueCount = storyboard.filter((item: any) => item.state === "生成失败").length + (flowData.value.videoProgress?.failed ?? 0);
  // 第五段：本集已归档的成片（剪辑台合成导出后回传 o_output）
  const outputCount = (flowData.value.output ?? []).length;
  return {
    storyboardTotal: total,
    storyboardDone: total,
    imageDone,
    videoDone,
    videoTotal,
    issueCount,
    outputCount,
  };
});

async function refFlowData() {
  await productionAgentStore().getFlowData();
  layoutGraph();
}
</script>
<style lang="scss" scoped>
.productionWorkspace { height:100%; min-height:0; display:flex; flex-direction:column; background:#f7f5f1; }
.studioPage{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);gap:14px}.studioPage.withAssistant{grid-template-columns:minmax(0,1fr) 400px}.studioAssistant{min-height:0;overflow:hidden;border:1px solid var(--td-border-level-1-color);border-radius:14px;background:var(--td-bg-color-container)}@media(max-width:1100px){.studioPage.withAssistant{grid-template-columns:minmax(0,1fr)}.studioAssistant{position:absolute;right:20px;top:92px;bottom:20px;width:min(420px,calc(100% - 40px));z-index:20;box-shadow:0 12px 60px #30201022}}
.studioPageLoading { flex:1; min-height:0; display:flex; gap:12px; align-items:center; justify-content:center; color:var(--td-text-color-secondary); font-size:13px; }
.productionStage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  min-width: 0;
}
.flowMain {
  flex: 1;
  min-width: 0;
  height: 100%;
  &.space-dragging {
    cursor: grab !important;
    :deep(*) {
      cursor: grab !important;
    }
  }
  .floatingWindow {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    .productionToolbar {
      position: absolute;
      top: 10px;
      left: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      row-gap: 6px;
      min-height: 48px;
      max-width: calc(100% - 32px);
      padding: 4px 10px 4px 14px;
      border: 1px solid color-mix(in srgb, var(--td-border-level-1-color) 82%, transparent);
      border-radius: 14px;
      background: color-mix(in srgb, var(--td-bg-color-container) 94%, transparent);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      backdrop-filter: blur(14px);
        .episodesSelect {
        display: flex;
        align-items: center;
        gap: 8px;
          cursor: pointer;

          .productionMark {
            padding-right: 4px;
            color: var(--mainColor);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            white-space: nowrap;
          }

        }

      .productionStatus {
      display: flex;
      align-items: center;
      gap: 14px;
      padding-left: 10px;
      pointer-events: none;
      white-space: nowrap;
      }
      .statusDivider {
        width: 1px;
        height: 24px;
        background: var(--td-border-level-1-color);
      }
      .statusMetric {
        color: var(--td-text-color-secondary);
        font-size: 12px;
        b { color: var(--td-text-color-primary); font-weight: 600; }
      }
      .statusReady { color: var(--td-success-color); font-size: 12px; }
      .statusPending { color: #b57a4e; font-size: 12px; }
      .overviewBtn { flex: none; padding: 0 6px; color: var(--td-text-color-secondary); font-size: 12px; }
      .overviewBtn.modeSwitch {
        padding: 0 11px;
        border: 1px solid #ffdac5 !important;
        border-radius: 9px !important;
        background: #fff1e6 !important;
        color: #f47438 !important;
        font-weight: 600;
      }
      .stageQuickNav {
        display: flex;
        gap: 3px;
        margin-left: 2px;
        padding-left: 8px;
        border-left: 1px solid var(--td-border-level-1-color);
        pointer-events: auto;
        overflow-x: auto;
        max-width: 100%;
        scrollbar-width: none;
        &::-webkit-scrollbar { display: none; }
        button {
          flex: none;
          border: 0;
          border-radius: 7px;
          padding: 4px 8px;
          color: var(--td-text-color-secondary);
          background: transparent;
          font-size: 12px;
          white-space: nowrap;
          cursor: pointer;
          &:hover { background: var(--td-bg-color-container-hover); color: var(--td-text-color-primary); }
          &.active { color: var(--td-brand-color); background: var(--td-brand-color-light); font-weight: 600; }
        }
      }
    }
  }
}

// 画布模式导演助理停靠栏：与步骤模式同构，右侧固定栏；收起时画布全宽
.canvasAssistantDock {
  flex: none;
  width: min(400px, 34vw);
  display: flex;
  flex-direction: column;
  border-left: 1px solid #ecdfd4;
  background: #fffdfb;
}

// 导演助理启动按钮：常规悬浮胶囊按钮（右下角），与步骤模式一致
.assistantLauncher {
  position: absolute;
  right: 22px;
  bottom: 92px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 11px 18px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #f2803f, #e0641f);
  color: #fff;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(224, 116, 34, 0.35);

  &:hover { transform: translateY(-1px); box-shadow: 0 12px 30px rgba(224, 116, 34, 0.45); }
  &:active { transform: translateY(0); }
}
// 拖拽/平移时优化渲染性能
.flowMain.is-interacting {
  :deep(.vue-flow__node) {
    will-change: transform;
    contain: layout style paint;
  }
  :deep(.vue-flow__transformationpane) {
    will-change: transform;
  }
  :deep(.t-image),
  :deep(.assetImage),
  :deep(.frameImg),
  :deep(.assetImageWrap) {
    pointer-events: none;
    contain: strict;
  }
  // 禁用 hover 效果，减少样式重算
  :deep(.imageToolsWrap),
  :deep(.addBetween) {
    display: none !important;
  }
}
$handelSize: 12px;

:deep(.source) {
  height: $handelSize;
  width: $handelSize;
}
:deep(.target) {
  height: $handelSize;
  width: $handelSize;
}
:deep(.dragHandle) {
  padding: 4px;
  border-radius: 4px;
  transition: backdrop-filter 0.3s ease-out;
  &:hover {
    cursor: move;
    backdrop-filter: brightness(0.95);
  }
}
</style>

<style lang="scss">
.flowMain {
  background-color:#f5f3f0 !important;
  background-image:radial-gradient(circle at 15% 8%,rgba(255,173,115,.13),transparent 24%),radial-gradient(circle at 86% 86%,rgba(121,105,220,.12),transparent 28%) !important;
  .vue-flow__background pattern path { stroke:rgba(78,72,92,.11) !important; }
  .floatingWindow .episodesSelect { top:18px !important; left:20px !important; gap:8px; min-height:48px; padding:7px 9px; border:1px solid rgba(69,63,83,.1); border-radius:15px; background:rgba(255,255,255,.9); box-shadow:0 10px 28px rgba(41,36,57,.11); backdrop-filter:blur(14px); }
  .productionMark{padding:0 9px;color:#e9632b;font-size:9px;font-weight:750;letter-spacing:.14em;white-space:nowrap}
  .episodesSelect .t-select .t-input{height:34px;border-color:#e8dccf !important;border-radius:10px !important;background:#fff !important}.episodesSelect .t-button{width:35px;height:35px;border:1px solid #e8dccf !important;border-radius:10px !important;background:#fff !important;color:#8d7a6c !important;box-shadow:none !important}.episodesSelect .t-button .t-icon,.episodesSelect .t-button svg{color:#8d7a6c !important}.episodesSelect .t-button:hover{border-color:#f1a27e !important;background:#fff4ed !important;color:#e9632b !important}
  .vue-flow__controls{overflow:hidden;border:1px solid rgba(69,63,83,.1)!important;border-radius:13px!important;background:rgba(255,255,255,.92)!important;box-shadow:0 8px 22px rgba(41,36,57,.1)!important}.vue-flow__controls-button{border-bottom-color:#ece9ee!important;background:#fff!important;color:#55515e!important}.vue-flow__controls-button:hover{background:#fff2ea!important;color:#e9632b!important}
  .vue-flow__node>.t-card,.vue-flow__node>div>.t-card{border-color:rgba(69,63,83,.11)!important;border-radius:18px!important;background:#fff!important;box-shadow:0 13px 32px rgba(41,36,57,.09)!important}.vue-flow__node.selected>.t-card,.vue-flow__node.selected>div>.t-card{border-color:#ee8a60!important;box-shadow:0 0 0 3px rgba(242,107,53,.1),0 15px 34px rgba(41,36,57,.11)!important}
  /* 我们的成片节点类型名恰好叫 "output"，与 vue-flow 内置 output 节点类名撞车，
   * 内置样式（白底/边框/内边距/定宽）会套在节点外层形成一个突兀的底框 —— 全部中和掉 */
  .vue-flow__node-output{border:0!important;padding:0!important;width:auto!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;color:inherit!important;font-size:inherit!important}
  .vue-flow__edge-path{stroke:#a69eae;stroke-width:2}.vue-flow__edge.selected .vue-flow__edge-path{stroke:#ed7544}
}

.flowMain {
  background: var(--xoi-workspace-bg,#faf8f6) !important;
  .vue-flow__background { opacity: .85; }
  .vue-flow__node > .t-card { box-sizing:border-box; padding:0 !important; overflow:visible; border:1px solid #eee4dd !important; border-radius:14px !important; background:#ffffff !important; box-shadow:0 6px 20px #9c63380a !important; }
  .vue-flow__node > .t-card > .t-loading__parent > .t-card__body { padding:16px; }
  .vue-flow__node > .t-card > .t-loading__parent > .t-card__body > .titleBar { position:relative; display:flex; align-items:center; justify-content:space-between; gap:10px; margin:-16px -16px 12px; padding:16px 14px 12px; background:linear-gradient(115deg,#fff7ef,#fffdf9); border-radius:13px 13px 0 0; border-bottom:1px solid #f1e5da; border-top:4px solid #ff9d67; }
  .titleBar > .t-button { color:#b57850; flex-shrink:0; border:1px solid #eddfd3; background:#fffbf7; border-radius:7px; font-size:11px; padding:0 7px; }
  .vue-flow__node-script > .t-card { width:360px; min-width:0; }
  .vue-flow__node-scriptPlan > .t-card { width:300px; min-width:0; }
  .vue-flow__node-storyboardTable > .t-card { width:340px; min-width:0; }
  .vue-flow__node-assets > .t-card { width:380px; min-width:0; }
  .vue-flow__node-storyboard > .t-card { width:440px; min-width:0; }
  .vue-flow__node-workbench > .t-card { width:340px; min-width:0; }
  .vue-flow__node-output > .t-card { width:300px; min-width:0; }
  .vue-flow__node-script .content,.vue-flow__node-scriptPlan .content,.vue-flow__node-storyboardTable .storyboardList { max-height:280px; overflow:auto; overscroll-behavior:contain; }
  .vue-flow__node-assets > .t-card > .t-loading__parent > .t-card__body > .content { max-height:280px; overflow:auto; overscroll-behavior:contain; }
  .vue-flow__node-storyboard > .t-card > .t-loading__parent > .t-card__body > .content { max-height:310px; overflow:auto; overscroll-behavior:contain; }
  .vue-flow__node-output .content { max-height:280px; overflow:auto; overscroll-behavior:contain; }
  .vue-flow__node-assets .assetItemBox { content-visibility:visible; gap:6px !important; padding:4px !important; }
  .vue-flow__node-assets .assetCard { flex-shrink:0; width:140px !important; min-width:140px; }
  .vue-flow__node-assets .assetCard .t-card__body { padding:10px !important; }
  .vue-flow__node-assets .divider svg { width:16px; }
  .vue-flow__node .nowheel { scrollbar-width:thin; scrollbar-color:#ded0c5 transparent; }
  .vue-flow__node .nowheel::-webkit-scrollbar { width:6px; height:6px; }
  .vue-flow__node .nowheel::-webkit-scrollbar-thumb { background:#ded0c5; border-radius:8px; }
  .vue-flow__node .md-editor { background:transparent; }
  .vue-flow__node .md-editor-preview-wrapper { overflow-wrap:anywhere; }
  .vue-flow__handle { width:8px; height:8px; border:2px solid #ffffff; background:#e6ad88; }
  .vue-flow__edge-path { stroke:#dfc9b9; stroke-width:1.6; }
  .floatingWindow .productionToolbar { gap:8px; max-width:calc(100% - 160px); background:#fffffff0; border-color:#eddfd3; box-shadow:0 5px 16px #9c63380a; border-radius:14px; }
  .episodesSelect .productionMark { color:#b57850; font-size:11px; letter-spacing:.02em; }
  .episodesSelect .overviewBtn.t-button { width:auto !important; min-width:64px; padding:0 10px !important; white-space:nowrap; background:transparent !important; color:#8d7a6c !important; border-color:transparent !important; }
  .episodesSelect .overviewBtn.t-button:hover { background:#fff4ed !important; color:#e9632b !important; }
  .episodesSelect .overviewBtn.modeSwitch.t-button { min-width:82px; padding:0 11px !important; background:#fff1e6 !important; color:#f47438 !important; border-color:#ffdac5 !important; }
  .episodesSelect .overviewBtn.t-button .t-button__text { overflow:visible; white-space:nowrap; }
  .vue-flow__controls { display:flex; left:18px; bottom:18px; margin:0; padding:4px; border-radius:12px !important; background:#fffffff2 !important; box-shadow:0 4px 16px #9c63380c !important; }
  .directorViewControls { display:flex; align-items:center; gap:2px; }
  .directorViewControls button { display:flex; align-items:center; justify-content:center; gap:5px; height:32px; min-width:32px; padding:0 8px; border:0; border-radius:8px; color:#af7c59; background:transparent; font:500 12px/1 inherit; cursor:pointer; }
  .directorViewControls button:hover,.directorViewControls button.locked { background:#fff0e6; color:#f47438; }
  .directorViewControls button:focus-visible { outline:2px solid #ffab7b; outline-offset:1px; }
  .directorViewControls .zoomValue { min-width:46px; font-variant-numeric:tabular-nums; }
  .controlDivider { height:18px; width:1px; background:#efe4dc; margin:0 4px; }
  .boardReadingHint { position:absolute; right:22px; bottom:24px; color:#a5968a; font-size:11px; pointer-events:none; }
}
@media(max-width:1100px) {
  .flowMain .productionToolbar .productionMark,.flowMain .productionToolbar .statusMetric,.flowMain .productionToolbar .statusDivider { display:none; }
  .flowMain .productionToolbar { max-width:calc(100% - 132px); }
  .flowMain .productionStatus { padding-left:0; }
  .flowMain .boardReadingHint { display:none; }
}
</style>

<style scoped>
.flowMain { background:var(--xoi-workspace-bg,#faf8f6); }
.productionToolbar { border-color:var(--xoi-workspace-border,#eee7e2); border-radius:14px; }
</style>
