<template>
  <VueFlow
    class="flowMain"
    :class="{ 'is-interacting': isInteracting && otherSetting.interacting, 'space-dragging': isSpacePressed }"
    id="mainFlowBox"
    @mousedown="onSpaceMouseDown"
    :nodes="episodesId ? nodes : []"
    :edges="episodesId ? edges : []"
    :nodes-draggable="!isSpacePressed"
    :nodes-connectable="!isSpacePressed"
    :elements-selectable="!isSpacePressed"
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
    fit-view-on-init
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
    <Background></Background>
    <Controls />
    <div class="floatingWindow">
      <div class="productionToolbar">
        <div class="episodesSelect f ac">
          <span class="productionMark">XOi PRODUCTION</span>
          <t-select
            :value="episodesId"
            :placeholder="$t('workbench.production.selectPlaceholder')"
            autoWidth
            :options="episodesOptions"
            filterable
            @change="handleEpisodesChange">
            <template #label>
              <i-document-folder size="24" />
            </template>
          </t-select>
          <t-tooltip placement="bottom" theme="primary" :content="$t('workbench.production.getFlowData')">
            <t-button class="guide-refresh-btn" @click="refFlowData" variant="outline">
              <template #icon><i-refresh size="16" /></template>
            </t-button>
          </t-tooltip>
          <t-tooltip placement="bottom" theme="primary" :content="$t('workbench.production.autoLayoutLR')">
            <t-button class="guide-layout-btn" @click="layoutGraph()" variant="outline">
              <template #icon><i-tree-diagram size="16" /></template>
            </t-button>
          </t-tooltip>
          <i-loading-four class="spin" size="16" v-show="loading"></i-loading-four>
        </div>
        <div v-if="episodesId" class="productionStatus" aria-label="制作进度">
          <span class="statusDivider" />
          <span class="statusMetric">分镜 <b>{{ productionProgress.storyboardDone }}/{{ productionProgress.storyboardTotal }}</b></span>
          <span class="statusMetric">图片 <b>{{ productionProgress.imageDone }}/{{ productionProgress.storyboardTotal }}</b></span>
          <span class="statusMetric">视频 <b>{{ productionProgress.videoDone }}/{{ productionProgress.storyboardTotal }}</b></span>
          <span class="statusMetric">成片 <b>{{ productionProgress.outputCount }}</b></span>
          <t-tag v-if="productionProgress.issueCount" theme="warning" variant="light" size="small">待处理 {{ productionProgress.issueCount }}</t-tag>
          <span v-else class="statusReady">流程正常</span>
          <div class="stageQuickNav" aria-label="生产阶段">
            <button v-for="stage in productionStages" :key="stage.id" type="button" :class="{ active: stage.id === activeStage }" @click="focusStage(stage.id)">
              {{ stage.label }}
            </button>
          </div>
        </div>
      </div>
      <div class="openRightChatBoxBtn c" v-show="!openShowVisible" @click.stop="openShowVisible = true">
        <i-menu-unfold-one theme="outline" size="24" />
      </div>
      <transition name="slide" v-show="openShowVisible" v-if="episodesId">
        <rightChatBox :title="title" v-model="flowData" @close="openShowVisible = false" />
      </transition>
    </div>
    <t-tag variant="outline" class="fps" v-if="!openShowVisible">{{ fps }}</t-tag>
  </VueFlow>
</template>

<script setup lang="ts">
import { useLocalStorage, useEventListener } from "@vueuse/core";
import { VueFlow, useVueFlow } from "@vue-flow/core";
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
import { useLayout } from "./utils/dagre";
import { useFlowBuilder } from "./utils/flowBuilder";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";

const { project } = storeToRefs(projectStore());
import settingStore from "@/stores/setting";
const { canvasWheelEvent, otherSetting } = storeToRefs(settingStore());
const openShowVisible = ref(true);
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
} = useVueFlow({ id: "mainFlowBox" });

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
  if (e.code === "Space" && !e.repeat) {
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
const router = useRouter();
provide("episodesId", episodesId);


const loading = ref(false);

// 节点位置
const nodePositions = ref<Record<string, { x: number; y: number }>>({
  script: { x: 0, y: 0 },
  scriptPlan: { x: 900, y: 0 },
  assets: { x: 1200, y: 4000 },
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

onMounted(async () => {
  await getScriptData();
  if (!episodesId.value) {
    // P2：一集剧本都没有时别让用户对着空台子发呆，明确告知并引导去整理剧本
    guardProduction(router, { scriptCount: 0, assetTotal: 0, assetDone: 0 });
    return;
  }

  const nodesReady = await waitForNodesReady();
  if (nodesReady) {
    await layoutGraph();
  }
  void runPipelineGuard();
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

function handleEpisodesChange(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const nextEpisodesId = Number(rawValue);
  if (!Number.isFinite(nextEpisodesId) || nextEpisodesId === episodesId.value) return;

  void (async () => {
    if (!(await confirmEpisodesSwitch())) return;

    episodesId.value = nextEpisodesId;
    await productionAgentStore().getFlowData();
  })();
}

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
    // 只设 episodesId —— 下面的 watch 会带出 refFlowData + updateContext + getHistory。
    // 旧代码这里又主动调了一遍 getFlowData/getHistory，进页面时两个请求各跑两次（重复请求 bug）。
    episodesId.value = episodesOptions.value[0].value;
  }
}

async function layoutGraph(direction: "LR" | "TB" = "LR") {
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

  const gap = 80; // 节点之间的最小留白

  if (direction === "LR") {
    // 手动布局：主链从左到右排列，assets 放在 script 正下方
    const mainChain = ["script", "scriptPlan", "storyboardTable", "storyboard", "workbench", "output"];
    const chainNodes = mainChain.filter((id) => oldData.nodes.some((n) => n.id === id));

    // 逐个排列主链节点，x 基于前一个节点的右边缘 + gap，顶部对齐
    let curX = 0;
    for (const id of chainNodes) {
      const node = oldData.nodes.find((n) => n.id === id);
      const dim = dims.get(id);
      if (!node || !dim) continue;
      node.position.x = curX;
      node.position.y = 0;
      curX += dim.w + gap;
    }

    // assets 放在 script 正下方
    const scriptNode = oldData.nodes.find((n) => n.id === "script");
    const assetsNode = oldData.nodes.find((n) => n.id === "assets");
    const scriptDim = dims.get("script");
    if (scriptNode && assetsNode && scriptDim) {
      assetsNode.position.x = scriptNode.position.x;
      assetsNode.position.y = scriptNode.position.y + scriptDim.h + gap;
    }

    // 确保 assets 不与主链中其他节点重叠（检查水平方向）
    if (assetsNode) {
      const assetsDim = dims.get("assets");
      if (assetsDim) {
        const assetsRight = assetsNode.position.x + assetsDim.w;
        const assetsTop = assetsNode.position.y;
        const assetsBottom = assetsTop + assetsDim.h;
        for (const id of chainNodes) {
          if (id === "script") continue;
          const node = oldData.nodes.find((n) => n.id === id);
          const dim = dims.get(id);
          if (!node || !dim) continue;
          const nodeTop = node.position.y;
          const nodeBottom = nodeTop + dim.h;
          // 检查垂直范围是否有交集
          const vertOverlap = assetsTop < nodeBottom && assetsBottom > nodeTop;
          if (vertOverlap && node.position.x < assetsRight) {
            // 将该节点及其后续都右移
            const shift = assetsRight + gap - node.position.x;
            const idx = chainNodes.indexOf(id);
            for (let i = idx; i < chainNodes.length; i++) {
              const shiftNode = oldData.nodes.find((n) => n.id === chainNodes[i]);
              if (shiftNode) shiftNode.position.x += shift;
            }
            break;
          }
        }
      }
    }
  } else {
    // TB 方向使用 dagre 自动布局
    const widths = [...dims.values()].map((d) => d.w);
    const heights = [...dims.values()].map((d) => d.h);
    const avgWidth = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 150;
    const avgHeight = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 50;
    const ranksep = avgHeight * 0.5 + gap;
    const nodesep = avgWidth * 0.3 + gap;
    oldData.nodes = layout(oldData.nodes, oldData.edges, direction, nodesep, ranksep);
  }

  await fromObject(oldData);
  await nextTick();

  // 布局后同步新位置到 nodePositions，防止后续 flowData 变化时回跳
  for (const node of getNodes.value) {
    nodePositions.value[node.id] = { x: node.position.x, y: node.position.y };
  }

  fitView({ duration: 300 });
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
  const videoDone = videoList.filter((item: any) => item.state === "已完成" || item.state === "生成成功").length;
  const issueCount = storyboard.filter((item: any) => item.state === "生成失败").length;
  // 第五段：本集已归档的成片（剪辑台合成导出后回传 o_output）
  const outputCount = (flowData.value.output ?? []).length;
  return {
    storyboardTotal: total,
    storyboardDone: total,
    imageDone,
    videoDone: Math.min(videoDone, total),
    issueCount,
    outputCount,
  };
});

type ProductionStage = "storyboard" | "generate" | "edit";
const productionStages: { id: ProductionStage; label: string }[] = [
  { id: "storyboard", label: "分镜" },
  { id: "generate", label: "分镜台" },
  { id: "edit", label: "剪辑台" },
];
const activeStage = computed<ProductionStage>(() => {
  if (productionProgress.value.issueCount || productionProgress.value.imageDone < productionProgress.value.storyboardTotal) return "storyboard";
  if (productionProgress.value.videoDone < productionProgress.value.storyboardTotal) return "generate";
  return "edit";
});

function focusStage(stage: ProductionStage) {
  const nodeId = stage === "storyboard" ? "storyboard" : "workbench";
  if (!findNode(nodeId)) return;
  fitView({ nodes: [nodeId], padding: 0.24, duration: 350, maxZoom: 1.15 });
  if (stage !== "storyboard") {
    window.dispatchEvent(new CustomEvent("production:focus-workbench", { detail: { tab: stage === "edit" ? "editVideo" : "generate" } }));
  }
}

watch(
  () => episodesId.value,
  async (newVal) => {
    if (!newVal || newVal < 0) return;
    await refFlowData();
    productionAgentStore().updateContext();
    await productionAgentStore().getHistory();
  },
);

async function refFlowData() {
  await productionAgentStore().getFlowData();
  layoutGraph();
}

const current = useLocalStorage("productionCurrent", 0);
const steps = [
  {
    element: ".episodesSelect",
    title: $t("workbench.production.guideSwitchEpisode"),
    body: $t("workbench.production.guideSwitchEpisodeBody"),
    placement: "bottom",
  },
  {
    element: ".guide-refresh-btn",
    title: $t("workbench.production.guideRefresh"),
    body: $t("workbench.production.guideRefreshBody"),
    placement: "bottom",
  },
  {
    element: ".guide-layout-btn",
    title: $t("workbench.production.guideLayoutBtn"),
    body: $t("workbench.production.guideLayoutBtnBody"),
    placement: "bottom",
  },
  {
    element: ".vue-flow__controls",
    title: $t("workbench.production.guideCanvasNav"),
    body: $t("workbench.production.guideCanvasNavBody"),
    placement: "right",
  },
] as any;

const fps = ref(0);
let lastFrameTime = performance.now();
let frameCount = 0;
function animate() {
  const now = performance.now();
  frameCount++;
  const elapsed = now - lastFrameTime;
  if (elapsed >= 500) {
    fps.value = Math.round((frameCount * 1000) / elapsed);
    frameCount = 0;
    lastFrameTime = now;
  }
  if (!openShowVisible.value) {
    requestAnimationFrame(animate);
  }
}

watch(openShowVisible, (val) => {
  if (!val) {
    animate();
  }
});
</script>
<style lang="scss" scoped>
.flowMain {
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
      min-height: 48px;
      max-width: calc(100% - 56px);
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
      .stageQuickNav {
        display: flex;
        gap: 3px;
        margin-left: 2px;
        padding-left: 8px;
        border-left: 1px solid var(--td-border-level-1-color);
        pointer-events: auto;
        button {
          border: 0;
          border-radius: 7px;
          padding: 4px 8px;
          color: var(--td-text-color-secondary);
          background: transparent;
          font-size: 12px;
          cursor: pointer;
          &:hover { background: var(--td-bg-color-container-hover); color: var(--td-text-color-primary); }
          &.active { color: var(--td-brand-color); background: var(--td-brand-color-light); font-weight: 600; }
        }
      }
    }
    .openRightChatBoxBtn {
      position: absolute;
      top: 10px;
      right: 0;
      width: 40px;
      height: 40px;
      background-color: var(--td-bg-color-secondarycontainer);
      border-radius: 10px;
      z-index: 10;
      cursor: pointer;
    }
  }
  :deep(.slide-enter-active),
  :deep(.slide-leave-active) {
    transition: transform 0.3s ease-out;
  }
  :deep(.slide-enter-from) {
    transform: translateX(100%);
  }
  :deep(.slide-leave-to) {
    transform: translateX(100%);
  }
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
.fps {
  position: absolute;
  bottom: 10px;
  right: 0px;
  padding: 2px 6px;
  font-size: 12px;
  border-radius: 4px;
}
</style>

<style lang="scss">
.flowMain {
  background-color:#f5f3f0 !important;
  background-image:radial-gradient(circle at 15% 8%,rgba(255,173,115,.13),transparent 24%),radial-gradient(circle at 86% 86%,rgba(121,105,220,.12),transparent 28%) !important;
  .vue-flow__background pattern path { stroke:rgba(78,72,92,.11) !important; }
  .floatingWindow .episodesSelect { top:18px !important; left:20px !important; gap:8px; min-height:48px; padding:7px 9px; border:1px solid rgba(69,63,83,.1); border-radius:15px; background:rgba(255,255,255,.9); box-shadow:0 10px 28px rgba(41,36,57,.11); backdrop-filter:blur(14px); }
  .productionMark{padding:0 9px;color:#e9632b;font-size:9px;font-weight:750;letter-spacing:.14em;white-space:nowrap}
  .episodesSelect .t-select .t-input{height:34px;border-color:#e5e2e7 !important;border-radius:10px !important;background:#f7f6f8 !important}.episodesSelect .t-button{width:35px;height:35px;border:1px solid #e4e1e7 !important;border-radius:10px !important;background:#fff !important;color:#55515e !important;box-shadow:none !important}.episodesSelect .t-button .t-icon,.episodesSelect .t-button svg{color:#55515e !important}.episodesSelect .t-button:hover{border-color:#f1a27e !important;background:#fff4ed !important;color:#e9632b !important}
  .openRightChatBoxBtn{top:18px !important;right:20px !important;width:43px !important;height:43px !important;border:1px solid rgba(69,63,83,.1);border-radius:13px !important;background:linear-gradient(135deg,#ff8847,#f26432) !important;color:#fff !important;box-shadow:0 9px 22px rgba(239,100,48,.24)}.openRightChatBoxBtn svg{color:#fff !important}
  .vue-flow__controls{overflow:hidden;border:1px solid rgba(69,63,83,.1)!important;border-radius:13px!important;background:rgba(255,255,255,.92)!important;box-shadow:0 8px 22px rgba(41,36,57,.1)!important}.vue-flow__controls-button{border-bottom-color:#ece9ee!important;background:#fff!important;color:#55515e!important}.vue-flow__controls-button:hover{background:#fff2ea!important;color:#e9632b!important}
  .vue-flow__node>.t-card,.vue-flow__node>div>.t-card{border-color:rgba(69,63,83,.11)!important;border-radius:18px!important;background:#fff!important;box-shadow:0 13px 32px rgba(41,36,57,.09)!important}.vue-flow__node.selected>.t-card,.vue-flow__node.selected>div>.t-card{border-color:#ee8a60!important;box-shadow:0 0 0 3px rgba(242,107,53,.1),0 15px 34px rgba(41,36,57,.11)!important}
  /* 我们的成片节点类型名恰好叫 "output"，与 vue-flow 内置 output 节点类名撞车，
   * 内置样式（白底/边框/内边距/定宽）会套在节点外层形成一个突兀的底框 —— 全部中和掉 */
  .vue-flow__node-output{border:0!important;padding:0!important;width:auto!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;color:inherit!important;font-size:inherit!important}
  .vue-flow__edge-path{stroke:#a69eae;stroke-width:2}.vue-flow__edge.selected .vue-flow__edge-path{stroke:#ed7544}
  .fps{right:18px!important;bottom:16px!important;border-color:rgba(69,63,83,.12)!important;border-radius:8px!important;background:rgba(255,255,255,.82)!important;color:#77717e!important}
}
</style>
