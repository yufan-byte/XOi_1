<template>
  <section class="storyWorkspaceHeader" :class="{ compact }" :aria-labelledby="titleId" :title="compact ? description : undefined">
    <span class="workspaceIndex" aria-hidden="true"><template v-if="current">{{ optional ? '✦' : String(stepNo).padStart(2, '0') }}</template><svg v-else viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 9h18v11H3zM3 4h18v5H3zM7 4l-3 5M13 4l-3 5M19 4l-3 5M8 14h8M8 17h5" /></svg></span>
    <div class="workspaceCopy">
      <div class="workspaceEyebrow">XOi 创作工作区 <i /> <span>{{ !current ? sectionLabel : optional ? '可选环节' : `第 ${stepNo} / ${stepTotal} 步` }}</span></div>
      <div class="workspaceTitleRow"><h1 :id="titleId">{{ title }}</h1><div v-if="$slots.meta" class="workspaceMeta"><slot name="meta" /></div></div>
      <p>{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="workspaceHeaderActions"><slot name="actions" /></div>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { getStepNo, getStepTotal, type PipelineStepId } from "./pipelineSteps";
const props = withDefaults(defineProps<{ current?: PipelineStepId; projectType?: string | null; title: string; description: string; sectionLabel?: string; compact?: boolean }>(), { sectionLabel: "项目素材", compact: false });
const titleId = useId();
const optional = computed(() => props.current === "scriptAgent");
const stepNo = computed(() => props.current ? getStepNo(props.current, props.projectType) : 0);
const stepTotal = computed(() => getStepTotal(props.projectType));
</script>

<style scoped>
.storyWorkspaceHeader { box-sizing:border-box; display:flex; align-items:center; gap:16px; flex:none; min-height:128px; margin-bottom:16px; padding:20px 24px; border:1px solid #eee2d9; border-radius:16px; background:linear-gradient(110deg,#fffdfb,#fff4eb); }
.workspaceIndex { display:grid; place-items:center; width:42px; height:52px; flex:none; border:1px solid #ffdac6; border-radius:10px; background:#fff0e5; color:#ff7137; font:600 20px/1 ui-monospace,monospace; }
.workspaceCopy { min-width:0; flex:1; }
.workspaceEyebrow { display:flex; align-items:center; gap:8px; color:#8b7b70; font-size:10px; line-height:1.5; letter-spacing:.06em; }
.workspaceEyebrow i { width:3px; height:3px; flex:none; border-radius:50%; background:#d9cdc4; }
.workspaceEyebrow span { color:#f3733f; letter-spacing:0; }
.workspaceTitleRow { display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin:6px 0; }
h1 { margin:0; color:#302b28; font-size:26px; font-weight:650; line-height:1.3; letter-spacing:-.03em; }
p { margin:0; color:#7c7169; font-size:13px; line-height:1.65; }
.workspaceMeta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; color:#7c7169; font-size:11px; }
.workspaceMeta :slotted(span) { padding:4px 9px; border:1px solid #eee4dc; border-radius:7px; background:#fff; }
.workspaceHeaderActions { display:flex; align-items:center; flex:none; max-width:290px; }
.workspaceHeaderActions :slotted(button) { margin:0; padding:10px 12px; border:1px solid #ffdbc8; border-radius:10px; background:#fff3ea; color:#f16b34; font-size:12px; line-height:1.6; text-align:left; cursor:pointer; }
.workspaceHeaderActions :slotted(button:hover) { border-color:#ffb58d; background:#ffebdc; }
.workspaceHeaderActions :slotted(button:focus-visible) { outline:2px solid #ed975d; outline-offset:3px; }
.storyWorkspaceHeader.compact { min-height:0; margin:0; padding:0; gap:8px; border:0; background:transparent; }
.compact .workspaceIndex { width:25px; height:28px; border-radius:6px; font-size:12px; }
.compact .workspaceEyebrow,.compact p { display:none; }
.compact .workspaceTitleRow { margin:0; }
.compact h1 { font-size:13px; white-space:nowrap; }
@media(min-width:1101px) and (max-height:820px) { .storyWorkspaceHeader:not(.compact) { min-height:96px; padding:12px 20px; } }
@media(max-width:1100px) { .storyWorkspaceHeader { flex-wrap:wrap; } .workspaceHeaderActions { max-width:100%; margin-left:58px; } }
@media(max-width:600px) { .storyWorkspaceHeader { gap:12px; min-height:0; padding:16px; border-radius:14px; } .workspaceIndex { width:32px; height:42px; font-size:17px; } h1 { font-size:23px; } .workspaceTitleRow { gap:8px; } .workspaceHeaderActions { margin-left:44px; } }
</style>
