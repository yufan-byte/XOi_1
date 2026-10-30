<template>
  <t-dialog
    :footer="false"
    :header="false"
    :closeBtn="false"
    v-model:visible="visible"
    attach="body"
    placement="center"
    mode="full-screen"
    class="fullscreenDialog">
    <header class="canvasHeader"><div><span class="canvasMark">✦</span><div><strong>分镜创作画布</strong><small>连接素材，生成并采用当前镜头画面</small></div></div><button type="button" @click="closeFn">返回分镜 <span>×</span></button></header>
    <VueFlow
      id="editImage"
      class="editImageCls"
      v-model:nodes="nodes"
      v-model:edges="edges"
      :min-zoom="0.01"
      fit-view-on-init
      @connect="onConnect"
      @edges-change="syncReferences">
      <template #node-upload="{ id, data }">
        <uploadNode :id="id" :data="data" @upload="syncReferences" @keep="sureNode" />
      </template>

      <template #node-generated="{ id, data }">
        <generatedNode :id="id" :data="data" :projectId="+project!.id" @keep="sureNode" @image-change="syncReferences" />
      </template>
      <template #edge-removeLine="edgeProps">
        <removeLine v-bind="edgeProps" />
      </template>
      <Background :gap="24" :size="1" color="#ded8d2"></Background>
      <Controls />

      <Panel position="top-left" class="toolPanel">
        <nav class="canvasToolbar" aria-label="画布创作工具">
          <button type="button" aria-label="添加参考图片" title="添加参考图片" @click="addUploadNode('upload')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 3 3 3-3 5 5" /></svg></button>
          <button type="button" aria-label="添加画面生成节点" title="添加画面生成节点" @click="addUploadNode('generated')"><span class="toolSpark">✦</span></button>
          <span class="toolDivider" />
          <button type="button" aria-label="整理节点布局" title="整理节点布局" @click="layoutGraph('LR')"><i-tree-diagram size="20" /></button>
          <button type="button" aria-label="显示全部节点" title="显示全部节点" @click="fitView({ duration: 300, padding: 0.18 })"><i-full-screen-one size="20" /></button>
        </nav>
      </Panel>
    </VueFlow>
    <storyboardImageCheck telepor v-model="storyboardVisible" :scriptId="episodesId!" @confirm="onStoryboardConfirm" @cancel="onStoryboardCancel" />
  </t-dialog>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { VueFlow, useVueFlow, Panel, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import uploadNode from "./uploadNode.vue";
import generatedNode from "./generatedNode.vue";
import storyboardImageCheck from "@/components/storyboardImageCheck.vue";
import type { Storyboard } from "../../utils/flowBuilder";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import removeLine from "./removeLine.vue";
import projectStore from "@/stores/project";
import { accountBoundary } from "@/utils/accountBoundary";

import axios from "@/utils/axios";
import type { NodeType, UploadNodeData, GeneratedNodeData } from "../../utils/editImageType";
import { DEFAULT_EDGE_OPTIONS, createGeneratedData, cleanNodes, cleanEdges } from "../../utils/editImageType";
import { useLayout } from "../../utils/dagre";
import { v4 as uuid } from "uuid";

const episodesId = inject<Ref<number>>("episodesId");
const { project } = storeToRefs(projectStore());
const canvasOwner = accountBoundary.capture();
const canvasProject = Number(project.value?.id);
const canvasEpisode = episodesId?.value;
function assertCanvasContext() {
  accountBoundary.assert(canvasOwner);
  if (Number(project.value?.id) !== canvasProject || episodesId?.value !== canvasEpisode) throw new Error("项目或分集已切换，请重新打开画布");
}

// ---- storyboardImageCheck 统一管理 ----
const storyboardVisible = ref(false);
let storyboardResolve: ((rows: Storyboard[]) => void) | null = null;

provide("openStoryboardCheck", openStoryboardCheck);

const { toObject, fromObject, fitView } = useVueFlow({ id: "editImage" });
const { layout } = useLayout("editImage");

const props = withDefaults(
  defineProps<{
    flowData: {
      flowId?: number | null;
      resultImages: { src: string; prompt: string }[]; // 结果图 url 和提示词
      referanceImages: string[]; // 参考图url
    };
    type?: string;
  }>(),
  {
    flowData: () => ({
      resultImages: [],
      referanceImages: [],
    }),
  },
);

const emit = defineEmits(["save"]);

const visible = defineModel({
  type: Boolean,
  default: false,
});
const { addEdges, getNodes, getEdges, updateNodeData } = useVueFlow("editImage");

const nodes = ref<NodeType[]>([]);
const edges = ref<Edge<any, any, string>[]>([]);

// 防抖定时器
let syncTimer: ReturnType<typeof setTimeout> | null = null;
function openStoryboardCheck(): Promise<Storyboard[]> {
  storyboardVisible.value = true;
  return new Promise<Storyboard[]>((resolve) => {
    storyboardResolve = resolve;
  });
}

function onStoryboardConfirm(rows: Storyboard[]) {
  storyboardVisible.value = false;
  storyboardResolve?.(rows);
  storyboardResolve = null;
}

function onStoryboardCancel() {
  storyboardVisible.value = false;
  storyboardResolve?.([]);
  storyboardResolve = null;
}

// 根据当前连线，将 upload 节点的图片同步到 generated 节点的 references
function syncReferences() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(_doSyncReferences, 60);
}

function _doSyncReferences() {
  const allNodes = getNodes.value;
  const allEdges = getEdges.value;

  // 用 Map 预索引节点，避免重复 find（O(n) → O(1)）
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  // 按 target 分组 edges，减少重复遍历
  const edgesByTarget = new Map<string, string[]>();
  for (const e of allEdges) {
    const list = edgesByTarget.get(e.target);
    if (list) list.push(e.source);
    else edgesByTarget.set(e.target, [e.source]);
  }

  // 找出所有 generated 节点并同步 references
  for (const genNode of allNodes) {
    if (genNode.type !== "generated") continue;

    const sourceIds = edgesByTarget.get(genNode.id) ?? [];
    const connectedImages = sourceIds
      .map((id) => nodeMap.get(id))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .map((n) => {
        if (n.type === "upload") {
          return { image: (n.data as UploadNodeData).image || "" };
        } else if (n.type === "generated") {
          return { image: (n.data as GeneratedNodeData).generatedImage || "" };
        }
        return { image: "" };
      })
      .filter((i) => i.image);

    // 仅在数据变化时才更新，避免无效的响应式触发
    const currentRefs: { image: string }[] = (genNode.data as GeneratedNodeData).references ?? [];
    const isSame = currentRefs.length === connectedImages.length && connectedImages.every((img, idx) => currentRefs[idx]?.image === img.image);
    if (!isSame) {
      updateNodeData(genNode.id, { references: connectedImages });
    }
  }
}

// 连接处理
const onConnect = (params: any) => {
  // 禁止自己连接自己
  if (params.source === params.target) return;

  // 禁止重复连线及反向连线：A→B 或 B→A 已存在则忽略
  const isDuplicate = getEdges.value.some(
    (e) => (e.source === params.source && e.target === params.target) || (e.source === params.target && e.target === params.source),
  );
  if (isDuplicate) return;

  addEdges([
    {
      id: uuid(),
      source: params.source,
      target: params.target,
      ...DEFAULT_EDGE_OPTIONS,
    },
  ]);
  // 连线建立后立即同步
  nextTick(syncReferences);
};
// 添加新的上传节点
const addUploadNode = (type: string, image: string = "", prompt: string = "") => {
  const newNodeId = uuid();
  const lastNode = nodes.value.filter((n) => n.type === type).pop();
  const newY = lastNode ? lastNode.position.y + 350 : 100;
  const newX = type === "generated" ? 600 : 100;

  nodes.value.push({
    id: newNodeId,
    type,
    position: { x: newX, y: newY },
    data: type === "generated" ? createGeneratedData(image, prompt) : { image },
  } as NodeType);

  return newNodeId;
};
//保存节点
async function sureNode(imageUrl: string) {
  try {
    assertCanvasContext();
    const payload = {
      nodes: cleanNodes(getNodes.value as NodeType[]),
      edges: cleanEdges(getEdges.value),
    };

    let flowId: number;
    if (props.flowData.flowId) {
      await axios.post("/production/editImage/updateImageFlow", { ...payload, flowId: props.flowData.flowId });
      assertCanvasContext();
      flowId = props.flowData.flowId;
    } else {
      const { data } = await axios.post("/production/editImage/saveImageFlow", { ...payload });
      assertCanvasContext();
      flowId = data?.id;
    }
    if (!flowId) throw Error("画布保存失败，请重试");
    await new Promise<void>((resolve, reject) => emit("save", { imageUrl, flowId, onComplete: (failure?: unknown) => failure ? reject(failure) : resolve() }));
    assertCanvasContext();
    visible.value = false;
  } catch (e) {
    window.$message.error((e as any).message || $t("workbench.production.editImage.saveFailed"));
  }
}
onMounted(async () => {
  try {
    if (!props.flowData.flowId) return buildFlow();
    const { data } = await axios.post("/production/editImage/getImageFlow", {
      id: props.flowData.flowId,
    });
    assertCanvasContext();
    if (!data) return buildFlow();
    edges.value = data.edges.map((e: any) => ({ ...e, ...DEFAULT_EDGE_OPTIONS }));
    nodes.value = data.nodes;
    await nextTick();
    setTimeout(() => fitView({ duration: 300 }), 100);
  } catch (e) {
    window.$message.error((e as any).message || $t("workbench.production.editImage.fetchFailed"));
  }
});

function buildFlow() {
  const uploadIds: string[] = [];
  const generatedIds: string[] = [];
  props.flowData.referanceImages.forEach((i: string) => {
    uploadIds.push(addUploadNode("upload", i));
  });
  props.flowData.resultImages.forEach((i: { src: string; prompt: string }) => {
    generatedIds.push(addUploadNode("generated", i.src, i.prompt));
  });
  if (!generatedIds.length) generatedIds.push(addUploadNode("generated"));
  // 将每个 upload 节点连接到每个 generated 节点
  for (const sourceId of uploadIds) {
    for (const targetId of generatedIds) {
      edges.value.push({
        id: uuid(),
        source: sourceId,
        target: targetId,
        ...DEFAULT_EDGE_OPTIONS,
      });
    }
  }
  nextTick(() => {
    syncReferences();
    setTimeout(() => fitView({ duration: 300 }), 100);
  });
}

function closeFn() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.production.editImage.closeConfirmTitle"),
    body: $t("workbench.production.editImage.closeConfirmBody"),
    confirmBtn: $t("common.confirm"),
    cancelBtn: $t("common.cancel"),
    onConfirm: async () => {
      try {
      assertCanvasContext();
      if (props.flowData.flowId) {
        const payload = {
          flowId: props.flowData.flowId,
          nodes: cleanNodes(getNodes.value as NodeType[]),
          edges: cleanEdges(getEdges.value),
        };
        await axios.post("/production/editImage/updateImageFlow", { ...payload });
        assertCanvasContext();
      }
      visible.value = false;
      dialog.destroy();
      } catch (e) { window.$message.error((e as Error).message || "画布保存失败，请重试"); }
    },
  });
}
async function layoutGraph(direction: "LR" | "TB") {
  const oldData = toObject();
  oldData.nodes = layout(oldData.nodes, oldData.edges, direction);
  await fromObject(oldData);
  await nextTick();
  fitView({ duration: 300 });
}
</script>

<style lang="scss" scoped>
.fullscreenDialog {
  .closure {
    position: absolute;
    margin-top: 10px;
    top: var(--td-comp-paddingTB-xl);
    right: var(--td-comp-paddingLR-xxl);
    z-index: 9999;
    cursor: pointer;
  }
  .editImageCls {
    width: 100%;
  }
}
.canvasHeader { position:absolute; z-index:20; top:18px; left:20px; right:20px; display:flex; align-items:center; justify-content:space-between; pointer-events:none; }
.canvasHeader > div { display:flex; align-items:center; gap:10px; padding:9px 13px; border:1px solid #eae4df; border-radius:12px; background:#ffffffef; box-shadow:0 5px 18px #3529190a; }
.canvasHeader strong,.canvasHeader small { display:block; }.canvasHeader strong { font-size:13px; color:#332e2a; }.canvasHeader small { margin-top:3px; color:#9b8f85; font-size:10px; }.canvasMark { display:grid; place-items:center; width:30px; height:30px; border-radius:9px; background:#fff0e6; color:#d86332; }
.canvasHeader > button { pointer-events:auto; padding:9px 12px; border:1px solid #e8ded7; border-radius:10px; background:#fff; color:#70635a; cursor:pointer; }.canvasHeader > button span { margin-left:8px; font-size:17px; }
.toolPanel { top:50% !important; left:16px !important; margin:0 !important; transform:translateY(-50%); }
.canvasToolbar { display:flex; flex-direction:column; align-items:center; gap:4px; padding:7px; border:1px solid #e8e4df; border-radius:16px; background:#ffffffee; box-shadow:0 8px 28px #29221c12; backdrop-filter:blur(14px); }
.canvasToolbar button { display:grid; width:40px; height:40px; place-items:center; border:0; border-radius:10px; background:transparent; color:#615b56; cursor:pointer; }
.canvasToolbar button:hover { background:#f5eee8; color:#c45b30; }.toolSpark { color:#d86b36; font-size:19px; }.toolDivider { width:24px; height:1px; margin:3px 0; background:#ebe5df; }
.editImageCls { background:#f6f5f3; }
:deep(.vue-flow__controls) { overflow:hidden; border:1px solid #e9e2dc; border-radius:10px; box-shadow:0 6px 20px #47332312; }

:deep(.fullscreenDialog) {
  .t-dialog__header {
    display: none !important;
  }
  .t-dialog__body {
    padding: 0 !important;
  }
  .t-dialog__wrap {
    padding: 0 !important;
  }
}
.item {
  width: 45px;
  padding: 5px;
  color: var(--mainColor);
  &:hover {
    background-color: var(--td-bg-color-container-hover);
    border-radius: 4px;
    cursor: pointer;
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
</style>
