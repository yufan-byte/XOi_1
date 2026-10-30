<template>
  <div class="planningWorkspace">
    <aside class="planningOutline" aria-label="镜头规划内容">
      <p class="outlineEyebrow">从剧本到镜头</p>
      <button type="button" :class="{ selected: document === 'scriptPlan' }" @click="document = 'scriptPlan'">
        <span class="documentNumber">A</span>
        <span>
          <strong>导演计划</strong>
          <small>固定布局、人物状态与叙事节奏</small>
          <em>{{ flowData.reviewState?.planApproved ? "已确认" : "待确认" }}</em>
        </span>
      </button>
      <span class="outlineConnector">↓</span>
      <button type="button" :class="{ selected: document === 'storyboardTable' }" @click="document = 'storyboardTable'">
        <span class="documentNumber">B</span>
        <span>
          <strong>分镜表</strong>
          <small>时长、景别、动作、运镜与衔接</small>
          <em>{{ flowData.reviewState?.tableApproved ? "已确认" : "待确认" }}</em>
        </span>
      </button>
      <div class="planningReference">
        <span>上一步的角色场景作为本集参考</span>
        <button type="button" @click="referencesOpen = true">查看剧本与角色场景 ↗</button>
      </div>
      <div class="planningHandoff">
        <strong>规划完成后</strong>
        <p>把已确认的分镜表落实为镜头记录，再去预览和制作画面。</p>
        <button v-if="flowData.reviewState?.tableApproved" type="button" @click="prepareShots">
          {{ flowData.storyboard.length ? "检查镜头记录是否齐全" : "根据分镜表创建镜头" }} ↗
        </button>
        <small>由助理整理文字与记录，发送后执行。</small>
      </div>
    </aside>
    <main class="planningDocument">
      <section class="planningMission" aria-label="镜头规划操作顺序">
        <div class="missionTitle">
          <span>本页任务</span>
          <strong>先定全片规则，再逐镜拆解。这里不生成图片或视频。</strong>
        </div>
        <ol>
          <li
            :class="missionClass(1)"
            role="button" tabindex="0" @keydown.enter.prevent="handleMissionStep(1)" @keydown.space.prevent="handleMissionStep(1)"
            :aria-current="planningPhase === 1 ? 'step' : undefined"
            @click="handleMissionStep(1)">
            <b>{{ flowData.reviewState?.planApproved ? "✓" : "1" }}</b><span><strong>确认导演计划</strong><small>锁定房间布局、人物位置和叙事规则</small><em>{{ missionStatus(1) }}</em></span>
          </li>
          <li
            :class="missionClass(2)"
            role="button" tabindex="0" @keydown.enter.prevent="handleMissionStep(2)" @keydown.space.prevent="handleMissionStep(2)"
            :aria-current="planningPhase === 2 ? 'step' : undefined"
            @click="handleMissionStep(2)">
            <b>{{ flowData.reviewState?.tableApproved ? "✓" : "2" }}</b><span><strong>确认分镜表</strong><small>逐镜写清画面、时长、动作和前后承接</small><em>{{ missionStatus(2) }}</em></span>
          </li>
          <li
            :class="missionClass(3)"
            role="button" tabindex="0" @keydown.enter.prevent="handleMissionStep(3)" @keydown.space.prevent="handleMissionStep(3)"
            :aria-current="planningPhase === 3 ? 'step' : undefined"
            :aria-disabled="!flowData.reviewState?.tableApproved"
            @click="handleMissionStep(3)">
            <b>{{ flowData.reviewState?.tableApproved && flowData.storyboard.length ? "✓" : "3" }}</b><span><strong>{{ flowData.storyboard.length ? "进入分镜画面" : "创建镜头记录" }}</strong><small>{{ flowData.storyboard.length ? `已有 ${flowData.storyboard.length} 个镜头，可继续预览与制作` : "确认文字后，整理为可制作的镜头记录" }}</small><em>{{ missionStatus(3) }}</em></span>
          </li>
        </ol>
        <div class="missionNow">
          <span>现在做什么</span>
          <p>{{ currentTask }}</p>
          <button v-if="planningPhase === 1" type="button" @click="document = 'scriptPlan'">查看导演计划 →</button>
          <button v-else-if="planningPhase === 2" type="button" @click="document = 'storyboardTable'">继续检查分镜表 →</button>
          <button v-else type="button" @click="handleMissionStep(3)">{{ flowData.storyboard.length ? '进入分镜画面' : '根据分镜表创建镜头' }} →</button>
        </div>
      </section>
      <div class="documentGuide">
        <strong>{{ document === "scriptPlan" ? "先定整集的拍摄规则" : "再把故事拆成可执行的镜头" }}</strong>
        <p>
          {{
            document === "scriptPlan"
              ? "复用已有角色和场景，明确床、门、窗等固定位置，以及人物初始站位。这里的规则供每个镜头共用。"
              : "每镜写清：拍什么、几秒、谁在哪、动作如何开始和结束，以及与上一镜如何连接。确认后再制作画面。"
          }}
        </p>
      </div>
      <scriptPlanNode v-if="document === 'scriptPlan'" standalone v-model="flowData.scriptPlan" />
      <storyboardTableNode v-else standalone v-model="flowData.storyboardTable" />
      <div v-if="document === 'scriptPlan'" class="documentNext">
        <span>确认导演计划后，继续制定本集镜头清单。</span>
        <button type="button" @click="document = 'storyboardTable'">查看分镜表 →</button>
      </div>
      <div v-else class="documentNext">
        <span>
          {{ flowData.reviewState?.tableApproved ? "可进入画面预览；缺失的镜头记录仍需补齐。" : "确认表中的时长、场景和动作承接，再继续制作。" }}
        </span>
        <button type="button" :disabled="!flowData.reviewState?.tableApproved" @click="handleMissionStep(3)">
          {{ !flowData.reviewState?.tableApproved ? "确认分镜表后继续" : flowData.storyboard.length ? "查看分镜画面 →" : "创建镜头记录 →" }}
        </button>
      </div>
    </main>
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
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { useEventListener } from "@vueuse/core";
import productionAgentStore from "@/stores/productionAgent";
import scriptPlanNode from "../../node/scriptPlan.vue";
import storyboardTableNode from "../../node/storyboardTable.vue";
import { MdPreview } from "@/utils/markdown";
import assetsNode from "../../node/assets.vue";
const store = productionAgentStore();
const { flowData } = storeToRefs(store);
const emit = defineEmits<{ next: [] }>();
const document = ref<"scriptPlan" | "storyboardTable">(flowData.value.reviewState?.planApproved ? "storyboardTable" : "scriptPlan");
const referencesOpen = ref(false);
const planningPhase = computed<1 | 2 | 3>(() => {
  if (!flowData.value.reviewState?.planApproved) return 1;
  if (!flowData.value.reviewState?.tableApproved) return 2;
  return 3;
});
const currentTask = computed(() => {
  if (planningPhase.value === 1)
    return "阅读或编辑导演计划，重点核对床、门、窗、人物站位等固定关系；确认无误后，在下方卡片中点击“确认导演计划”。";
  if (planningPhase.value === 2)
    return "逐镜检查拍什么、几秒、动作从哪里开始到哪里结束，以及怎样接上一镜；确认无误后，在下方卡片中点击“确认分镜表”。";
  return flowData.value.storyboard.length
    ? `规划已完成，已有 ${flowData.value.storyboard.length} 个镜头记录。下一步进入分镜画面，预览整集并检查穿帮和衔接。`
    : "导演计划和分镜表均已确认。现在将文字分镜整理为镜头记录，再进入分镜画面预览。";
});
function missionClass(step: 1 | 2 | 3) {
  const done = step === 1 ? Boolean(flowData.value.reviewState?.planApproved) : step === 2 ? Boolean(flowData.value.reviewState?.tableApproved) : Boolean(flowData.value.reviewState?.tableApproved && flowData.value.storyboard.length);
  const selected = (step === 1 && document.value === "scriptPlan") || (step === 2 && document.value === "storyboardTable");
  return { done, current: planningPhase.value === step, selected, locked: step === 3 && !flowData.value.reviewState?.tableApproved };
}
function missionStatus(step: 1 | 2 | 3) {
  if (step === 3 && planningPhase.value === 3 && flowData.value.storyboard.length) return "可继续";
  if (step < planningPhase.value) return "已完成";
  if (step === planningPhase.value) return "当前步骤";
  return "待前一步确认";
}
function handleMissionStep(step: 1 | 2 | 3) {
  if (step === 1) return void (document.value = "scriptPlan");
  if (step === 2) return void (document.value = "storyboardTable");
  if (!flowData.value.reviewState?.tableApproved) {
    document.value = "storyboardTable";
    window.$message.warning("请先确认分镜表，再创建镜头记录");
    return;
  }
  if (flowData.value.storyboard.length) emit("next");
  else prepareShots();
}
function selectDocument(value: string) {
  if (value === "assets" || value === "script") referencesOpen.value = true;
  else document.value = value === "scriptPlan" ? "scriptPlan" : "storyboardTable";
}
function prepareShots() {
  store.assistantDraft =
    "读取本集已确认的导演计划、分镜表、已有镜头记录和角色场景资产。逐镜核对分镜表与镜头记录的对应关系，只补齐缺失的记录、时长、描述、关联资产及 continuity（固定布局、起始/结束状态和前镜关系）。保留现有镜头ID、顺序和所有图片视频，不能重复创建已有镜头；冲突先说明。不要生成图片或视频。完成后简述补齐了哪些镜头。";
  window.dispatchEvent(new CustomEvent("production:open-assistant"));
}
useEventListener(window, "production:stage-approved", (event: Event) => {
  if ((event as CustomEvent<{ stage: string }>).detail?.stage === "scriptPlan") document.value = "storyboardTable";
});
defineExpose({ selectDocument });
</script>
<style scoped lang="scss">
.planningWorkspace {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 245px minmax(0, 1fr);
}
.planningOutline {
  padding: 26px 18px;
  border-right: 1px solid var(--studio-line);
  background: var(--studio-white);
  overflow: auto;
}
.outlineEyebrow {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--studio-muted);
  margin: 0 0 18px 9px;
}
.planningOutline > button {
  display: flex;
  width: 100%;
  gap: 12px;
  padding: 14px 12px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: none;
  text-align: left;
  color: var(--studio-text);
  cursor: pointer;
}
.planningOutline > button.selected {
  border-color: var(--studio-line);
  background: var(--studio-bg);
}
.documentNumber {
  padding-top: 1px;
  color: var(--studio-accent);
  font-size: 13px;
}
.planningOutline strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
}
.planningOutline small {
  display: block;
  font-size: 11px;
  color: var(--studio-muted);
  line-height: 1.7;
  margin-top: 7px;
}
.planningOutline em {
  display: block;
  font-size: 11px;
  color: var(--studio-accent);
  font-style: normal;
  margin-top: 10px;
}
.outlineConnector {
  display: block;
  color: var(--studio-muted);
  margin: 4px 0 4px 24px;
}
.planningReference {
  border-top: 1px solid var(--studio-line);
  margin-top: 25px;
  padding: 19px 10px;
  font-size: 11px;
  color: var(--studio-muted);
  line-height: 1.8;
}
.planningReference button,
.planningHandoff button {
  border: 0;
  padding: 8px 0;
  background: none;
  color: var(--studio-accent);
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.planningHandoff {
  padding: 17px 10px;
  color: var(--studio-muted);
  font-size: 12px;
  line-height: 1.8;
}
.planningHandoff strong {
  color: var(--studio-text);
  font-size: 12px;
}
.planningHandoff p {
  margin: 8px 0;
}
.planningDocument {
  overflow: auto;
  padding: 26px clamp(20px, 3vw, 55px) 45px;
}
.planningMission {
  margin-bottom: 24px;
  padding: 18px;
  border: 1px solid #e8ddd4;
  border-radius: 14px;
  background: #fffaf5;
}
.missionTitle { display:flex; align-items:baseline; gap:12px; margin-bottom:14px; }
.missionTitle > span { color:var(--studio-accent); font-size:10px; font-weight:700; letter-spacing:.12em; }
.missionTitle strong { color:var(--studio-text); font-size:14px; }
.planningMission ol { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:0; padding:0; list-style:none; }
.planningMission li { position:relative; display:flex; align-items:flex-start; gap:9px; padding:11px; border:1px solid #e8e0da; border-radius:10px; background:#fff; color:#81776f; cursor:pointer; transition:border-color .18s ease,background .18s ease,box-shadow .18s ease; }
.planningMission li:hover:not(.locked) { border-color:#d8b8a6; box-shadow:0 5px 15px rgba(94,57,35,.06); }
.planningMission li.current { border-color:#c9572e; background:#fff3e9; color:#633724; box-shadow:0 0 0 1px rgba(201,87,46,.08); }
.planningMission li.selected:not(.current) { border-color:#9d948d; background:#fff; box-shadow:inset 0 0 0 1px #f1ece8; }
.planningMission li.done:not(.current) { color:#557665; background:#f7fbf8; }
.planningMission li.done > b { background:#529878; color:#fff; }
.planningMission li.locked { cursor:not-allowed; opacity:.55; }
.planningMission li > b { display:grid; place-items:center; width:22px; height:22px; flex:none; border-radius:7px; background:#eee9e4; font-size:10px; }
.planningMission li span { display:flex; min-width:0; flex-direction:column; gap:3px; }
.planningMission li strong { font-size:12px; }
.planningMission li small { color:#938980; font-size:10px; line-height:1.55; }
.planningMission li em { margin-top:3px; color:#9b8f86; font-size:9px; font-style:normal; }
.planningMission li.current em { color:#c24f2a; font-weight:700; }
.planningMission li.done:not(.current) em { color:#4f8d70; }
.missionNow { display:flex; align-items:center; gap:10px; margin-top:12px; padding-top:12px; border-top:1px solid #eadfd7; }
.missionNow > span { flex:none; padding:4px 7px; border-radius:6px; background:#ce582f; color:#fff; font-size:10px; }
.missionNow p { flex:1; margin:0; color:#6f6259; font-size:11px; line-height:1.7; }
.missionNow button { flex:none; border:0; background:transparent; color:var(--studio-accent); font-size:11px; cursor:pointer; }
.documentGuide {
  margin-bottom: 22px;
}
.documentGuide strong {
  font-size: 21px;
  font-weight: 600;
}
.documentGuide p {
  max-width: 800px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--studio-muted);
  margin: 9px 0 0;
}
.documentNext {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-top: 22px;
  font-size: 12px;
  color: var(--studio-muted);
}
.documentNext button {
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  padding: 10px 16px;
  background: var(--studio-white);
  color: var(--studio-accent);
  cursor: pointer;
  white-space: nowrap;
}
.documentNext button:disabled { cursor:not-allowed; opacity:.5; }
.planningReferences {
  display: grid;
  gap: 22px;
}
.planningDocument :deep(.directorNodeIndex),
.planningDocument :deep(.directorNodeCopy > small) {
  display: none;
}
.planningDocument :deep(.t-card) {
  border: 1px solid var(--studio-line);
  border-radius: 12px;
  box-shadow: none;
}
@media (max-width: 850px) {
  .planningWorkspace {
    grid-template-columns: 1fr;
    overflow: auto;
  }
  .planningOutline {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
    border-right: 0;
    border-bottom: 1px solid var(--studio-line);
    overflow: visible;
  }
  .planningMission ol { grid-template-columns:1fr; }
  .missionNow { align-items:flex-start; flex-wrap:wrap; }
  .planningOutline > button {
    width: auto;
    flex: 1;
  }
  .planningOutline small,
  .planningOutline em,
  .outlineEyebrow,
  .outlineConnector,
  .planningReference,
  .planningHandoff {
    display: none;
  }
  .planningDocument {
    overflow: visible;
    padding: 20px 16px;
  }
  .documentNext {
    flex-wrap: wrap;
  }
}
</style>
