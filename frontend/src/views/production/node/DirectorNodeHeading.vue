<template>
  <div class="directorNodeHeading">
    <span class="directorNodeIndex">{{ step }}</span>
    <div class="directorNodeCopy">
      <small>{{ label }}</small>
      <div class="directorTitleRow"><strong>{{ title }}</strong><span v-if="progress" class="directorState" :class="progress.tone"><i />{{ progress.label }}</span></div>
      <span class="directorNext" :title="progress?.next">{{ progress?.next || description }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, inject } from "vue";
import { directorProgressKey, type DirectorNodeId } from "../utils/directorProgress";
const props = defineProps<{ step: string; nodeId: DirectorNodeId; label: string; title: string; description: string }>();
const allProgress = inject(directorProgressKey);
const progress = computed(() => allProgress?.value[props.nodeId]);
</script>
<style scoped>
.directorNodeHeading { display:flex; align-items:center; gap:10px; min-width:0; text-align:left; flex:1; }
.directorNodeIndex { display:grid; place-items:center; width:30px; height:36px; flex:none; border:1px solid #ffdac6; border-radius:8px; color:#ff783a; background:#fff0e7; font:600 13px/1.1 ui-monospace,monospace; }
.directorNodeCopy { display:flex; flex-direction:column; gap:5px; min-width:0; flex:1; }
.directorNodeCopy small { color:#bd9375; font-size:9px; font-weight:650; letter-spacing:.12em; }
.directorTitleRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.directorNodeCopy strong { color:#302b28; font-size:17px; line-height:1.3; font-weight:650; }
.directorState { display:inline-flex; align-items:center; gap:4px; padding:3px 6px; border-radius:6px; white-space:nowrap; background:#f6f1ec; color:#a58b78; font-size:10px; line-height:1.4; }
.directorState i { width:4px; height:4px; border-radius:50%; background:currentColor; }
.directorState.done { background:#fff5eb; color:#c9804e; }
.directorState.warn { background:#fff0e4; color:#f17b3f; }
.directorState.working { background:#fff1e5; color:#c18055; }
.directorNext { color:#a39388; font-size:11px; line-height:1.5; }
</style>
