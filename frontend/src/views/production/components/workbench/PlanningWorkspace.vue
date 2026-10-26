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
          <li :class="{ done: flowData.reviewState?.planApproved, current: document === 'scriptPlan' }" @click="document = 'scriptPlan'">
            <b>1</b><span><strong>确认导演计划</strong><small>锁定房间布局、人物位置和叙事规则</small></span>
          </li>
          <li :class="{ done: flowData.reviewState?.tableApproved, current: document === 'storyboardTable' }" @click="document = 'storyboardTable'">
            <b>2</b><span><strong>确认分镜表</strong><small>逐镜写清画面、时长、动作和前后承接</small></span>
          </li>
          <li :class="{ current: flowData.reviewState?.tableApproved }">
            <b>3</b><span><strong>创建镜头记录</strong><small>确认文字后，才进入分镜图预览与制作</small></span>
          </li>
        </ol>
        <div class="missionNow">
          <span>现在做什么</span>
          <p>{{ currentTask }}</p>
          <button v-if="document === 'scriptPlan' && flowData.reviewState?.planApproved" type="button" @click="document = 'storyboardTable'">继续检查分镜表 →</button>
          <button v-else-if="document === 'storyboardTable' && flowData.reviewState?.tableApproved" type="button" @click="prepareShots">{{ flowData.storyboard.length ? '核对已有镜头记录' : '根据分镜表创建镜头' }} →</button>
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
        <button type="button" @click="emit('next')">查看分镜画面 →</button>
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
const currentTask = computed(() => {
  if (document.value === "scriptPlan") {
    return flowData.value.reviewState?.planApproved
      ? "导演计划已确认。继续到分镜表，检查每个镜头是否遵守同一套空间和人物规则。"
      : "阅读或编辑导演计划，重点核对床、门、窗、人物站位等固定关系；确认无误后，在下方卡片中点击“确认导演计划”。";
  }
  return flowData.value.reviewState?.tableApproved
    ? "分镜表已确认。把它整理成镜头记录后，再进入分镜图预览；预览只负责看画面与衔接。"
    : "逐镜检查拍什么、几秒、动作从哪里开始到哪里结束，以及怎样接上一镜；确认无误后，在下方卡片中点击“确认分镜表”。";
});
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
.planningMission li { display:flex; align-items:flex-start; gap:9px; padding:11px; border:1px solid #e8e0da; border-radius:10px; background:#fff; color:#81776f; cursor:pointer; }
.planningMission li.current { border-color:#d78869; background:#fff3e9; color:#633724; }
.planningMission li.done > b { background:#529878; color:#fff; }
.planningMission li > b { display:grid; place-items:center; width:22px; height:22px; flex:none; border-radius:7px; background:#eee9e4; font-size:10px; }
.planningMission li span { display:flex; min-width:0; flex-direction:column; gap:3px; }
.planningMission li strong { font-size:12px; }
.planningMission li small { color:#938980; font-size:10px; line-height:1.55; }
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
