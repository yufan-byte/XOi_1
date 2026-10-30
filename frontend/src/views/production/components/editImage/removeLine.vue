<template>
  <BaseEdge :id="id" :path="path[0]" :label-x="path[1]" :label-y="path[2]" label-bg-style="fill: whitesmoke" />
  <EdgeLabelRenderer>
    <div
      :style="{
        pointerEvents: 'all',
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${path[1]}px,${path[2]}px)`,
      }">
      <button type="button" class="remove" title="移除这条参考连线" aria-label="移除这条参考连线" @click="remove(id)">×</button>
    </div>
  </EdgeLabelRenderer>
</template>
<script setup>
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useVueFlow } from "@vue-flow/core";
const { removeEdges } = useVueFlow({ id: "editImage" });

const props = defineProps([
  "id",
  "sourceX",
  "sourceY",
  "targetX",
  "targetY",
  "sourcePosition",
  "targetPosition",
  "sourceNode",
  "targetNode",
  "source",
  "target",
  "type",
  "updatable",
  "data",
  "markerEnd",
  "markerStart",
  "style",
  "selected",
  "animated",
  "label",
  "labelStyle",
  "labelShowBg",
  "labelBgStyle",
  "labelBgPadding",
  "labelBgBorderRadius",
  "events",
  "sourceHandleId",
  "targetHandleId",
  "interactionWidth",
]);
const path = computed(() => getBezierPath(props));

function remove(id) {
  removeEdges(id);
}
</script>

<style lang="scss" scoped>
.remove {
  width: 22px; height: 22px; display:grid; place-items:center; padding:0;
  border:1px solid #ded5ce; border-radius:50%; background:#fff; color:#a99a8f;
  font-size:16px; line-height:1; opacity:.25; transition:opacity .18s,color .18s;
  cursor: pointer;
  &:hover {
    opacity:1; color:#c9553c;
  }
}
</style>
