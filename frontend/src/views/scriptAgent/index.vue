<template>
  <div class="scriptAgent">
    <section class="studioHeader"><div><span>XOi STORY WORKSPACE · 02 · 可选</span><h1>AI 改编</h1><p>只有需要改变原故事、重组为短剧时才使用。已有剧本或不想改写内容，请去“剧本整理”。</p><button type="button" class="skipAdaptationLink" @click="goToScript">不做 AI 改编？去剧本整理（可用 AI 分集） →</button></div><div class="studioHeaderArt" aria-hidden="true"><i>AI</i><b>SCRIPT</b></div></section>

    <Splitpanes class="default-theme data f">
      <Pane :size="38" :min-size="28" class="operate">
        <div class="box pr">
          <header class="scriptChatHeader">
            <div class="scriptChatIdentity"><span class="miniMascot"><img :src="ipBodyUrl" alt="" /></span><div><small class="agentEyebrow">STORY INTELLIGENCE</small><strong>剧本创作助手</strong></div></div>
            <span class="agentLive" :class="{ busy: isGenerating }"><i></i>{{ isGenerating ? '创作中' : connected ? '已就绪' : '未连接' }}</span>
          </header>
          <div class="scriptChatSubhead"><strong>故事构思 <span>→</span> 改编策划 <span>→</span> 剧本成稿</strong><button type="button" title="重新连接" :disabled="isGenerating" @click="handleReconnect"><i-api size="17" /></button></div>
          <section v-if="isWelcomeState" class="scriptWelcome">
            <div class="scriptMascot" aria-label="XOi 剧本助手" role="img">
              <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <defs>
                <pattern id="scriptAgentMascotPattern" patternContentUnits="objectBoundingBox" width="1" height="1">
                  <use href="#scriptAgentMascotImage" transform="scale(0.0013587)" />
                </pattern>
                <image id="scriptAgentMascotImage" width="736" height="736" preserveAspectRatio="none" :href="ipBodyUrl" />
              </defs>
              <rect width="63.8367" height="63.8367" transform="matrix(-1 0 0 1 55.1021 -7.34692)" fill="url(#scriptAgentMascotPattern)" />
            </svg>
            </div>
            <h2>XOi</h2>
            <p>你的专业剧本创作搭档<br />从故事骨架开始，一起完成精彩剧本。</p>
            <div class="scriptQuickStarts">
              <button v-for="item in scriptQuickStarts" :key="item.title" type="button" @click="startScriptFlow(item.prompt)">{{ item.title }}</button>
            </div>
            <small>内容由 AI 生成，仅供参考</small>
          </section>
          <t-chat-list v-show="!isWelcomeState" :clear-history="false">
            <t-chat-message
              v-for="message in messages"
              :key="message.id"
              :message="message"
              :name="(message as any).name"
              :placement="message.role === 'user' ? 'right' : 'left'"
              :variant="message.role === 'user' ? 'base' : 'outline'"
              :handleActions="message.role === 'user' ? {} : handleActions"
              :status="message.status"
              allowContentSegmentCustom></t-chat-message>
          </t-chat-list>
          <div v-if="chatError" class="chatErrorCard" role="alert">
            <div class="chatErrorIcon">!</div>
            <div class="chatErrorBody">
              <strong>这次请求没有完成</strong>
              <span>{{ chatError }}</span>
            </div>
            <button type="button" @click="retryConnection">重连</button>
          </div>
          <t-chat-sender
            class="inputBox"
            :disabled="status === 'pending' || status === 'streaming'"
            v-model="inputValue"
            :loading="status === 'pending' || status === 'streaming'"
            :placeholder="selectedSkills.length ? '已加载剧本创作能力，描述你想创作的故事…' : '描述故事灵感，开始 AI 改编…'"
            @send="handleSend"
            @stop="handleStop">
            <template #inner-header>
              <div v-if="selectedSkills.length" class="loadedSkillChips"><button v-for="path in selectedSkills" :key="path" type="button" :disabled="isGenerating" @click="toggleCreativeSkill(path)"><span class="skillChipSpark">✦</span>{{ creativeSkillName(path) }} <span class="skillChipRemove">×</span></button></div>
            </template>
            <template #footer-prefix>
              <button type="button" class="loadSkillButton" :disabled="isGenerating" @click="showCreativeSkills = !showCreativeSkills"><i-toolkit size="16" />剧本能力 <b>{{ selectedSkills.length }}/4</b></button>
              <t-popup trigger="click" placement="top-left">
                <t-button shape="square" variant="outline" size="small" :disabled="status === 'pending' || status === 'streaming'">
                  <template #icon>
                    <i-setting-config size="16" />
                  </template>
                </t-button>
                <template #content>
                  <div class="settingMenu">
                    <div class="settingMenuItem" @click="handleReconnect()">
                      <i-api size="14" />
                      <span>{{ $t("workbench.scriptAgent.reconnect") }}</span>
                    </div>
                    <div class="settingMenuItem" @click="handleClearMemory('message')">
                      <i-delete size="14" />
                      <span>{{ $t("workbench.scriptAgent.clearMessageMemory") }}</span>
                    </div>
                    <div class="settingMenuItem" @click="handleClearMemory('summary')">
                      <i-close size="14" />
                      <span>{{ $t("workbench.scriptAgent.clearSummaryMemory") }}</span>
                    </div>
                    <div class="settingMenuItem danger" @click="handleClearMemory('all')">
                      <i-delete-one size="14" />
                      <span>{{ $t("workbench.scriptAgent.clearAllMemory") }}</span>
                    </div>
                  </div>
                </template>
              </t-popup>
              <section v-if="showCreativeSkills" class="creativeSkillPicker">
                <div class="pickerHeading"><div><strong>剧本创作能力</strong><small>只选择本轮需要的方法，最多 4 个</small></div><button type="button" aria-label="关闭技能选择" @click="showCreativeSkills = false">×</button></div>
                <input v-model="creativeSkillQuery" class="skillSearch" placeholder="搜索原著分析、故事开发、剧本写作…" aria-label="搜索剧本创作能力" />
                <p v-if="creativeSkillsLoading" class="pickerNotice">正在读取技能库…</p>
                <p v-else-if="creativeSkillsError" class="pickerNotice">{{ creativeSkillsError }} <button @click="loadCreativeSkillOptions">重试</button></p>
                <div v-else class="creativeSkillOptions"><button v-for="skill in filteredCreativeSkills" :key="skill.path" type="button" :class="{ selected: selectedSkills.includes(skill.path) }" :disabled="isGenerating || (!selectedSkills.includes(skill.path) && selectedSkills.length >= 4)" @click="toggleCreativeSkill(skill.path)"><span class="skillOptionIcon">✦</span><span><strong>{{ skill.name }}</strong><small>{{ skill.desc }}</small></span><b>{{ selectedSkills.includes(skill.path) ? '✓' : '+' }}</b></button><p v-if="!filteredCreativeSkills.length" class="pickerNotice">没有匹配的技能</p></div>
                <div class="pickerFoot">已选择的方法只会影响本轮 AI 改编对话<button type="button" @click="showCreativeSkills = false">完成</button></div>
              </section>
              <t-popup trigger="click" placement="top" v-if="showThink">
                <t-button
                  size="small"
                  variant="outline"
                  :theme="(['default', 'success', 'warning', 'danger'] as const)[thinkLevel] || 'default'"
                  style="margin-left: 8px">
                  <template #icon>
                    <i-tips size="16" />
                  </template>
                  {{ thinkLevelOptions[thinkLevel]?.label }}
                </t-button>
                <template #content>
                  <div class="settingMenu">
                    <div
                      v-for="opt in thinkLevelOptions"
                      :key="opt.value"
                      class="settingMenuItem"
                      :class="{ active: thinkLevel === opt.value }"
                      @click="scriptAgentStore().updateThinkConfig(opt.value)">
                      <span>{{ opt.label }}</span>
                    </div>
                  </div>
                </template>
              </t-popup>
            </template>
            <template #suffix>
              <button v-if="isGenerating" type="button" class="sendUpButton stop" aria-label="停止生成" @click="handleStop"><span></span></button>
              <button v-else type="button" class="sendUpButton" :disabled="!inputValue.trim()" aria-label="发送消息" @click="handleSend(inputValue)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" /></svg>
              </button>
            </template>
          </t-chat-sender>
          <div v-if="agentModelName" class="costHintRow">
            <ModelCostHint :model="agentModelName" type="text" :input-length="inputValue.length" />
          </div>
          <!-- 连接状态胶囊：取代原本悬浮左上角的 i-dot，落到底部发送栏之下 -->
          <div class="connStatus" :class="{ on: connected, off: !connected }">
            <i class="ind"></i><span>{{ connected ? "已连接" : "未连接" }}</span>
          </div>
          <transition name="fade">
            <div v-if="forceGenerateVisible" class="forceGenerateMask">
              <div class="forceGenerateCard">
                <div class="forceGenerateDesc">{{ $t("workbench.scriptAgent.forceGenerate.desc") }}</div>
                <div class="forceGenerateActions">
                  <t-button @click="forceGenerateVisible = false">{{ $t("workbench.scriptAgent.forceGenerate.confirm") }}</t-button>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </Pane>
      <Pane :size="62" :min-size="30" class="data">
        <div class="tabsWrapper">
          <t-tabs v-model="currentTable">
            <template #action>
              <div class="ac" v-if="currentTable == 1">
                <t-button @click="editMdPreview">{{ $t("workbench.scriptAgent.edit") }}</t-button>
              </div>
              <div class="ac" v-else-if="currentTable == 2">
                <t-button @click="editMdPreview">{{ $t("workbench.scriptAgent.edit") }}</t-button>
              </div>
            </template>
            <!-- <t-tab-panel :value="1" :label="$t('workbench.scriptAgent.chapterEvents')">
              <pre>{{ planData.event }}</pre>
            </t-tab-panel> -->
            <t-tab-panel :value="1" :label="$t('workbench.scriptAgent.storySkeleton')">
              <div class="panelContent">
                <MdPreview
                  v-if="planData.storySkeleton"
                  :modelValue="planData.storySkeleton"
                  :theme="themeSetting.mode === 'auto' ? undefined : themeSetting.mode" />
                <t-empty v-else :title="$t('workbench.scriptAgent.noContent')" />
              </div>
            </t-tab-panel>
            <t-tab-panel :value="2" :label="$t('workbench.scriptAgent.adaptationStrategy')">
              <div class="panelContent">
                <MdPreview
                  v-if="planData.adaptationStrategy"
                  :modelValue="planData.adaptationStrategy"
                  :theme="themeSetting.mode === 'auto' ? undefined : themeSetting.mode" />
                <t-empty v-else :title="$t('workbench.scriptAgent.noContent')" />
              </div>
            </t-tab-panel>
            <t-tab-panel :value="3" :label="$t('workbench.scriptAgent.script')">
              <div class="panelContent">
                <t-empty v-if="!planData.script?.length" :title="$t('workbench.scriptAgent.noContent')" />
                <div v-else class="scriptList">
                  <div
                    v-for="(item, index) in planData.script"
                    :key="getScriptCardKey(item, index)"
                    class="scriptCard"
                    :class="{ collapsed: isCardCollapsed(item, index) }">
                    <div class="scriptCardHeader">
                      <div class="scriptCardHeaderLeft">
                        <span class="scriptIndex">#{{ index + 1 }}</span>
                        <span class="scriptTitle">{{ item.name }}</span>
                      </div>
                      <div class="scriptCardActions">
                        <t-button size="small" variant="outline" @click="toggleCardCollapse(item, index)">
                          <template #icon>
                            <i-down v-if="!isCardCollapsed(item, index)" size="14" />
                            <i-right v-else size="14" />
                          </template>
                        </t-button>
                        <t-button size="small" @click="editScript(index)">
                          <template #icon><i-edit size="14" /></template>
                        </t-button>
                        <t-button theme="danger" variant="outline" size="small" @click="delScript(index)">
                          <template #icon><i-delete size="14" /></template>
                        </t-button>
                      </div>
                    </div>
                    <div class="scriptCardBody" v-if="!isCardCollapsed(item, index)">
                      <pre v-if="item.content">{{ item.content }}</pre>
                      <span v-else class="emptyContent">{{ $t("workbench.scriptAgent.noContent") }}</span>
                    </div>
                  </div>
                </div>
                <!-- 悬浮折叠按钮 -->
                <div class="floatCollapseBtn" v-if="planData.script?.length">
                  <t-button shape="circle" size="large" theme="primary" @click="toggleAllCards">
                    <template #icon>
                      <i-right v-if="isAllCollapsed" title="" size="18" />
                      <i-down v-else size="18" />
                    </template>
                  </t-button>
                </div>
              </div>
            </t-tab-panel>
          </t-tabs>
        </div>
      </Pane>
    </Splitpanes>
    <editMdPreivew v-model="dialogVisible" @save="onConfirm" :content="editContent" />

    <!-- 剧本编辑对话框 -->
    <t-dialog
      v-model:visible="scriptEditVisible"
      :header="$t('workbench.scriptAgent.editScript')"
      width="80%"
      top="10vh"
      placement="center"
      :confirm-btn="{ content: $t('workbench.scriptAgent.save'), theme: 'primary' }"
      @confirm="saveScript"
      @close="scriptEditVisible = false">
      <div class="scriptEditForm">
        <div class="scriptEditField">
          <strong>{{ scriptEditData.name }}</strong>
        </div>
        <div class="scriptEditField">
          <label>{{ $t("workbench.scriptAgent.content") }}</label>
          <MdEditor
            v-model="scriptEditData.content"
            :theme="themeSetting.mode === 'auto' ? undefined : themeSetting.mode"
            :toolbars="toolbars"
            :footers="[]"
            style="height: 50vh"
            @onUploadImg="() => {}"
            @drop.prevent />
        </div>
      </div>
    </t-dialog>

    <!-- 流水线下一步：AI 改编（可选站）→ 剧本整理。改编完成、或不想改写，都从这里往前走。 -->
    <NextStepBar current="scriptAgent" :status="pipelineStatus" status-tone="idle" next-label="下一步：剧本整理" />
  </div>
</template>

<script setup lang="ts">
import { MdEditor } from "md-editor-v3";
import type { ToolbarNames } from "md-editor-v3";
import { MdPreview } from "md-editor-v3";
import settingStore from "@/stores/setting";
import NextStepBar from "@/components/pipeline/NextStepBar.vue";
import ModelCostHint from "@/components/ModelCostHint.vue";
const { themeSetting } = storeToRefs(settingStore());
import { Splitpanes, Pane } from "splitpanes";
import axios from "@/utils/axios";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());
import editMdPreivew from "@/components/editMdPreivew.vue";
import scriptAgentStore from "@/stores/scriptAgent";
import ipBodyUrl from "@/assets/photosynthesis-effect-mark.png";
const router = useRouter();
const { connected, messages, status, lastError, planData, thinkLevel, selectedSkills } = storeToRefs(scriptAgentStore());
import userStore from "@/stores/user";
import { guardProjectType } from "@/utils/pipelineGuard";
const isGenerating = computed(() => status.value === 'pending' || status.value === 'streaming');
const chatError = computed(() => {
  const latest = messages.value[messages.value.length - 1] as any;
  if (latest?.role !== "assistant" || latest?.status !== "error") return lastError.value;
  return lastError.value || latest?.ext?.error || (latest ? "请求失败，请检查模型配置后重试" : "");
});
const showCreativeSkills = ref(false);
const creativeSkillQuery = ref('');
const creativeSkillsLoading = ref(false);
const creativeSkillsError = ref('');
const creativeSkillOptions = ref<{ path: string; name: string; desc: string }[]>([]);
const creativeSkillLabels: Record<string, [string, string]> = {
  'short-drama-novel-analyze': ['长篇原著分析', '评估改编价值，提取人物与剧情主线'],
  'short-drama-develop': ['故事开发与分集规划', '搭建故事引擎、人物冲突和分集大纲'],
  'short-drama-write': ['短剧剧本创作', '创作分场剧本，打磨对白与戏剧节奏'],
  'short-drama-review': ['短剧项目审查', '检查结构、逻辑与连续性，提出修改建议'],
};
const creativeSkillsStorageKey = computed(() => `xoi_script_skills:${userStore().userId}:${project.value?.id}`);
const filteredCreativeSkills = computed(() => {
  const query = creativeSkillQuery.value.trim().toLocaleLowerCase();
  return creativeSkillOptions.value.filter((s) => !query || `${s.name} ${s.desc}`.toLocaleLowerCase().includes(query));
});
const creativeSkillName = (path: string) => creativeSkillOptions.value.find((s) => s.path === path)?.name || creativeSkillLabels[path.split('/').at(-2) || '']?.[0] || '创作技能';
function toggleCreativeSkill(path: string) {
  if (isGenerating.value) return;
  selectedSkills.value = selectedSkills.value.includes(path) ? selectedSkills.value.filter((s) => s !== path) : [...selectedSkills.value, path].slice(0, 4);
  try { localStorage.setItem(creativeSkillsStorageKey.value, JSON.stringify(selectedSkills.value)); } catch { /* Storage may be unavailable. */ }
}
async function loadCreativeSkillOptions() {
  creativeSkillsLoading.value = true;
  creativeSkillsError.value = '';
  try {
    const { data } = await axios.post<string[]>('/setting/skillManagement/getSkillList');
    creativeSkillOptions.value = data.filter((p) => /^community\/drama-skills\/[^/]+\/SKILL\.md$/.test(p) && creativeSkillLabels[p.split('/').at(-2) || '']).map((path) => {
      const [name, desc] = creativeSkillLabels[path.split('/').at(-2)!];
      return { path, name, desc };
    });
    let saved: unknown = [];
    try { saved = JSON.parse(localStorage.getItem(creativeSkillsStorageKey.value) || '[]'); } catch { /* Ignore invalid saved selection. */ }
    selectedSkills.value = Array.isArray(saved) ? saved.filter((p) => creativeSkillOptions.value.some((s) => s.path === p)).slice(0, 4) : [];
  } catch { creativeSkillsError.value = '技能库加载失败，请重试'; }
  finally { creativeSkillsLoading.value = false; }
}
onMounted(loadCreativeSkillOptions);

// 页面引导
const thinkLevelOptions = [
  { label: $t("workbench.scriptAgent.thinkLevel.off"), value: 0 },
  { label: $t("workbench.scriptAgent.thinkLevel.light"), value: 1 },
  { label: $t("workbench.scriptAgent.thinkLevel.deep"), value: 2 },
  { label: $t("workbench.scriptAgent.thinkLevel.extreme"), value: 3 },
];
const currentTable = ref(1);
const inputValue = ref("");
const agentModelName = ref("");
const toolbars: ToolbarNames[] = [
  "bold",
  "underline",
  "italic",
  "strikeThrough",
  "-",
  "title",
  "sub",
  "sup",
  "quote",
  "unorderedList",
  "orderedList",
  "task",
  "-",
  "codeRow",
  "code",
  "table",
  "-",
  "revoke",
  "next",
  "=",
  "preview",
];
const defMsg: ChatMessagesData[] = [
  {
    id: "welcome",
    role: "assistant",
    content: [
      { type: "text", status: "complete", data: $t("workbench.scriptAgent.welcomeMsg") },
      {
        type: "suggestion",
        status: "complete",
        data: [{ title: $t("workbench.scriptAgent.start"), prompt: $t("workbench.scriptAgent.start") }],
      },
    ],
  },
];
const isWelcomeState = computed(() => messages.value.length === 0 || (messages.value.length === 1 && String(messages.value[0]?.id) === "welcome"));
const scriptQuickStarts = [
  { title: "开始剧本创作", prompt: $t("workbench.scriptAgent.start") },
  { title: "生成故事骨架", prompt: "请根据当前项目资料，开始梳理故事骨架。" },
  { title: "制定改编策略", prompt: "请分析当前故事，并制定适合短剧呈现的改编策略。" },
  { title: "生成分场剧本", prompt: "请基于已有故事骨架和改编策略，开始生成分场剧本。" },
  { title: "完善人物与冲突", prompt: "请检查主要人物、核心欲望与冲突，并提出可直接执行的完善方案。" },
];
function startScriptFlow(prompt: string) {
  scriptAgentStore().chat(prompt);
}

onMounted(() => {
  // P2 类型守卫：AI 改编是小说改编链路的站点，剧本创作型项目直接输 URL 进来会错配
  guardProjectType(router, project.value?.projectType, "novel");
  if (messages.value.length <= 0) messages.value = [...defMsg, ...messages.value];
  getPlanData();
  getNovel();
  scriptAgentStore().connect();

  if (messages.value.length <= 1) getHistory();
});
const agentWorkDataId = ref<number>();
async function getPlanData() {
  const { data } = await axios.post("/scriptAgent/getPlanData", { projectId: project.value?.id, agentType: "scriptAgent" });
  planData.value.storySkeleton = data.data.storySkeleton;
  planData.value.adaptationStrategy = data.data.adaptationStrategy;
  planData.value.script = data.data.script || [];
  agentWorkDataId.value = data.id;
}

//快捷发送
const handleActions = {
  suggestion: (data?: any) => {
    scriptAgentStore().chat(data?.content?.prompt);
  },
};

function handleSend(text: string) {
  scriptAgentStore().chat(text);
  inputValue.value = "";
}

function goToScript() {
  router.push({ path: "/script", query: { entry: "organize" } });
}

/** 吸底条状态：右侧剧本卡（分集）已产出多少 */
const pipelineStatus = computed(() => {
  const count = planData.value?.script?.length ?? 0;
  return count ? `已产出 ${count} 个剧本卡 · 前往剧本整理` : "改编完成或不想改写，都从这里去剧本整理";
});

function handleStop() {
  scriptAgentStore().stopGenerate();
}

const memoryTypeLabel: Record<string, string> = {
  message: $t("workbench.scriptAgent.memoryType.message"),
  summary: $t("workbench.scriptAgent.memoryType.summary"),
  all: $t("workbench.scriptAgent.memoryType.all"),
};
function handleClearMemory(type: "message" | "summary" | "all" | "reconnect") {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.scriptAgent.msg.clearConfirm"),
    body: $t("workbench.scriptAgent.msg.clearBody", { type: memoryTypeLabel[type] }),
    confirmBtn: $t("workbench.scriptAgent.msg.confirmClear"),
    cancelBtn: $t("workbench.scriptAgent.msg.cancel"),
    theme: "warning",
    onConfirm: async () => {
      await axios.post(`/agents/clearMemory`, { projectId: project.value?.id, agentType: "scriptAgent", type });
      window.$message.success($t("workbench.scriptAgent.msg.memoryCleared", { type: memoryTypeLabel[type] }));
      dialog.destroy();
      getHistory();
    },
  });
}
function handleReconnect() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.scriptAgent.msg.reconnect"),
    body: $t("workbench.scriptAgent.msg.notReconnect"),
    confirmBtn: $t("workbench.scriptAgent.msg.keepReconnect"),
    cancelBtn: $t("workbench.scriptAgent.msg.cancel"),
    theme: "warning",
    onConfirm: async () => {
      scriptAgentStore().reconnect();
      dialog.destroy();
    },
  });
}

function retryConnection() {
  scriptAgentStore().reconnect();
}

const loadingHistory = ref(false);
async function getHistory() {
  loadingHistory.value = true;
  const { data } = await axios.post(`/agents/getMemory`, {
    projectId: project.value?.id,
    agentType: "scriptAgent",
  });
  messages.value = [...defMsg, ...data];
  loadingHistory.value = false;
}

// 强制生成蒙层
const forceGenerateVisible = ref(false);
const novelData = ref([]);

function getNovel() {
  axios.post("/novel/getNovelData", { projectId: project.value?.id }).then(({ data }: any) => {
    novelData.value = data;
    const hasUnfinished = (novelData.value as any[]).some((item: any) => item.eventState === 0);
    if (hasUnfinished && !forceGenerateVisible.value) {
      forceGenerateVisible.value = true;
    }
  });
}

const dialogVisible = ref(false);
const editContent = ref("");
//编辑markdown
function editMdPreview() {
  if (currentTable.value == 1) editContent.value = planData.value.storySkeleton;
  else if (currentTable.value == 2) editContent.value = planData.value.adaptationStrategy;
  dialogVisible.value = true;
}

const scriptEditIndex = ref(-1);
const scriptEditData = ref({
  name: "",
  content: "",
});
const scriptEditVisible = ref(false);

function editScript(index: number) {
  const item = planData.value.script[index];
  scriptEditIndex.value = index;
  scriptEditData.value = {
    name: item.name,
    content: item.content,
  };
  scriptEditVisible.value = true;
}

async function saveScript() {
  if (scriptEditIndex.value < 0) return;
  planData.value.script[scriptEditIndex.value] = { ...scriptEditData.value };
  await scriptAgentStore().setPlanData();
  await getPlanData();
  window.$message.success($t("workbench.scriptAgent.msg.scriptUpdated"));
  scriptEditVisible.value = false;
}
async function delScript(index: number) {
  const item = planData.value.script[index];
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.scriptAgent.msg.deleteConfirm"),
    body: $t("workbench.scriptAgent.msg.deleteBody"),
    confirmBtn: $t("workbench.scriptAgent.msg.confirmDelete"),
    cancelBtn: $t("workbench.scriptAgent.msg.cancel"),
    theme: "danger",
    onConfirm: async () => {
      if (item.id) {
        await axios.post("/script/delScript", { ids: [item.id] });
        planData.value.script.splice(index, 1);
      } else {
        planData.value.script.splice(index, 1);
      }
      await scriptAgentStore().setPlanData();
      await getPlanData();
      window.$message.success($t("workbench.scriptAgent.msg.scriptDeleted"));
      dialog.destroy();
    },
  });
}
function onConfirm(value: string) {
  axios
    .post("/scriptAgent/updateData", {
      id: agentWorkDataId.value,
      data: {
        storySkeleton: currentTable.value == 1 ? value : planData.value.storySkeleton,
        adaptationStrategy: currentTable.value == 2 ? value : planData.value.adaptationStrategy,
        script: planData.value.script,
      },
    })
    .then(() => {
      window.$message.success($t("workbench.scriptAgent.msg.updated"));
      getPlanData();
    })
    .catch((err) => {
      window.$message.error(err?.message ?? $t("workbench.scriptAgent.msg.error"));
    });
}

const showThink = ref(false);
onMounted(async () => {
  try {
    const { data } = await axios.post(`/project/getModelDetails`, { key: "scriptAgent" });
    agentModelName.value = data?.modelName || data?.name || "";
    if (data && data.think) showThink.value = true;
  } catch {
    // 未配置 Agent 模型时仍允许用户查看项目内容，发送时由聊天错误卡提示具体原因。
  }
});

type ScriptCardItem = {
  id?: number;
  name: string;
  content: string;
};

// 剧本卡片折叠状态
const collapsedCards = ref<Record<string, boolean>>({});

function getScriptCardKey(item: ScriptCardItem, index: number) {
  if (item.id !== undefined && item.id !== null) {
    return `id:${item.id}`;
  }
  return `index:${index}`;
}

function isCardCollapsed(item: ScriptCardItem, index: number) {
  return Boolean(collapsedCards.value[getScriptCardKey(item, index)]);
}

watch(
  () => planData.value.script?.map((item, index) => getScriptCardKey(item, index)) || [],
  (keys) => {
    const nextCollapsedCards: Record<string, boolean> = {};
    keys.forEach((key) => {
      if (collapsedCards.value[key]) {
        nextCollapsedCards[key] = true;
      }
    });
    collapsedCards.value = nextCollapsedCards;
  },
  { immediate: true },
);

// 是否全部折叠
const isAllCollapsed = computed(() => {
  if (!planData.value.script?.length) return false;
  return planData.value.script.every((item, index) => isCardCollapsed(item, index));
});

// 切换单个卡片折叠状态
function toggleCardCollapse(item: ScriptCardItem, index: number) {
  const key = getScriptCardKey(item, index);
  collapsedCards.value[key] = !collapsedCards.value[key];
}

// 一键折叠/展开所有卡片
function toggleAllCards() {
  const nextCollapsed = !isAllCollapsed.value;
  const nextCollapsedCards = { ...collapsedCards.value };
  planData.value.script?.forEach((item, index) => {
    nextCollapsedCards[getScriptCardKey(item, index)] = nextCollapsed;
  });
  collapsedCards.value = nextCollapsedCards;
}
</script>

<style lang="scss" scoped>
.scriptAgent {
  height: calc(100% - 16px);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  /* 页面引导 */
  .guideBanner {
    margin-bottom: 12px;
    padding: 16px 20px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08));
    border: 1px solid rgba(102, 126, 234, 0.15);
    border-radius: 14px;
    flex-shrink: 0;
    .guideContent {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 12px;
      .guideIcon {
        font-size: 28px;
        flex-shrink: 0;
      }
      .guideCloseBtn {
        border-radius: 8px;
        font-size: 12px;
        padding: 4px 12px;
        border-color: rgba(102, 126, 234, 0.3);
        color: #667eea;
        flex-shrink: 0;
        &:hover {
          background: rgba(102, 126, 234, 0.08);
          border-color: rgba(102, 126, 234, 0.5);
        }
      }
      .guideText {
        flex: 1;
        .guideTitle {
          font-size: 15px;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 2px;
        }
        .guideDesc {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.5);
          line-height: 1.4;
        }
      }
    }
    .guideFlow {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 10px;
      border: 1px solid rgba(0, 0, 0, 0.04);
      .flowStep {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 8px;
        transition: all 0.3s ease;
        &.active {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
          border: 1px solid rgba(102, 126, 234, 0.25);
        }
        .flowNum {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .flowText {
          .flowTitle {
            font-size: 13px;
            font-weight: 600;
            color: #1a1a2e;
          }
          .flowDesc {
            font-size: 11px;
            color: rgba(0, 0, 0, 0.4);
          }
        }
      }
      .flowArrow {
        font-size: 16px;
        color: rgba(0, 0, 0, 0.3);
        font-weight: 300;
      }
    }
    .guideFeatures {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
      .guideFeature {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 10px;
        border: 1px solid rgba(0, 0, 0, 0.04);
        .featureIcon {
          font-size: 20px;
        }
        .featureText {
          .featureName {
            font-size: 13px;
            font-weight: 600;
            color: #1a1a2e;
          }
          .featureDesc {
            font-size: 11px;
            color: rgba(0, 0, 0, 0.4);
          }
        }
      }
    }
    .guideTip {
      font-size: 11px;
      color: rgba(0, 0, 0, 0.45);
      line-height: 1.5;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 8px;
    }
  }
  :deep(.splitpanes__pane) {
    background-color: transparent !important;
  }
  :deep(.splitpanes__splitter) {
    order: 2;
    border-left: none;
    margin-left: 1px;
    background: rgba(255, 255, 255, 0.08);
    width: 1px !important;
    &:hover {
      background: rgba(0, 212, 255, 0.3);
    }
  }
  .data {
    order: 1;
    flex: 1;
    overflow: hidden;
    :deep(.operate) {
      order: 3;
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 250px;
      height: 100%;
      .box {
        padding-top: 8px;
        flex: 1;
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        border: 1px solid var(--material-border-light);
        background: var(--material-thin);
        backdrop-filter: var(--blur-heavy);
        -webkit-backdrop-filter: var(--blur-heavy);
        overflow: hidden;
        position: relative;
        width: 100%;
        height: 100%;
        padding-left: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12),
          inset 0 1px 0 rgba(255, 255, 255, 0.15);
        .inputBox {
          padding-right: 8px;
          padding-bottom: 8px;
          /* 输入框苹果风格 */
          .t-chat-sender__textarea__wrapper {
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.6);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(102, 126, 234, 0.15);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            &:focus-within {
              border-color: rgba(102, 126, 234, 0.4);
              box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
          }
          .t-textarea__inner {
            border: none;
            background: transparent;
            &:focus {
              box-shadow: none;
            }
          }
          /* 发送键：回归项目真身份紫蓝渐变（#667eea→#764ba2），与右侧“我的消息”
             气泡同款材质；先前亮版次级紫蓝 #8b7bf5→#5897f5 显淡且削弱白字对比已弃用 */
          .t-chat-sender__button__sendbtn {
            .t-button {
              background-image: linear-gradient(135deg, #667eea, #764ba2) !important;
              background-color: #5a3d96 !important;
              color: #ffffff !important;
              -webkit-text-fill-color: #fff;
              border: none !important;
              box-shadow:
                0 6px 16px rgba(72, 50, 130, 0.44),
                inset 0 1px 0 rgba(255, 255, 255, 0.42),
                inset 0 -1px 0 rgba(30, 15, 60, 0.22);
              transition:
                filter 0.25s ease,
                box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
              &:hover {
                filter: brightness(1.07) saturate(1.08);
                box-shadow:
                  0 10px 24px rgba(82, 56, 150, 0.54),
                  inset 0 1px 0 rgba(255, 255, 255, 0.6) !important;
              }
              &:active {
                transform: scale(0.94);
              }
              i-send,
              i-icon,
              svg,
              svg path { stroke: #fff; }
              [fill],
              circle[fill] { fill: #fff; }
            }
          }
        }
        /* 底部连接状态胶囊：取代旧版悬浮在画布左上角的 i-dot */
        .connStatus {
          align-self: flex-end;
          margin: 0 12px 6px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 11px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.02em;
          line-height: 1.6;
          backdrop-filter: blur(8px) saturate(150%);
          -webkit-backdrop-filter: blur(8px) saturate(150%);
          background-color: rgba(255, 255, 255, 0.55);
          border: 1px solid rgba(15, 23, 42, 0.06);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;

          i.ind {
            width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
            display: inline-block;
          }

          /* 在线：绿点带呼吸光晕（沿用 pulse-glow 关键帧）*/
          &.on {
            color: #059669;
            background-image: linear-gradient(135deg, rgba(16,185,129,.14), rgba(52,211,153,.08));
            background-color: rgba(167,243,208,.18);
            border-color: rgba(16, 185, 129, 0.26);

            i.ind {
              background: #10b981;
              box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.22);
              animation: pulse-glow 2s ease-in-out infinite;
            }
          }

          /* 离线：红点静态实心，不呼吸以示异常态更冷静 */
          &.off {
            color: #b91c1c;
            background-color: rgba(239, 68, 68, 0.08);
            border-color: rgba(239, 68, 68, 0.28);

            i.ind { background: #ef4444; }
          }
        }
      }
      .t-chat__list {
        padding-right: 8px;
        /* ⚠️ 原 .t-chat__item__* 直写在此均为「死码」：
           t-chat-item 采用 Shadow DOM 封装，裸选择器打不进去；
           真正的自定义见下方独立模块 `t-chat-item ::part()` 重构段。 */
      }
    }
    :deep(.data) {
      display: flex;
      flex-direction: column;
      height: 100%;
      position: relative;
      .tabsWrapper {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: padding-bottom 0.3s ease;
        background: var(--material-thin);
        backdrop-filter: var(--blur-heavy);
        -webkit-backdrop-filter: var(--blur-heavy);
        border-radius: 16px;
        border: 1px solid var(--material-border-light);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.12);
        padding: 4px 0;
        .t-tabs {
          display: flex;
          flex-direction: column;
          height: 100%;
          .t-tabs__header {
            flex-shrink: 0;
            padding: 0 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          }
          .t-tabs__content {
            flex: 1;
            overflow: hidden;
          }
          .t-tab-panel {
            height: 100%;
          }
          .t-tabs__nav-item {
            font-size: 13px;
            font-weight: 500;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            &:hover {
              background: rgba(0, 212, 255, 0.06);
            }
            &.t-is-active {
              color: #00d4ff;
            }
          }
          .t-tabs__bar {
            background: linear-gradient(90deg, #00d4ff, #7b61ff);
            height: 2.5px;
            border-radius: 2px;
          }
        }
      }
    }
  }
}

/* ============================================================
   聊天气泡彻底重构 —— 穿透 t-chat-item 的 Shadow DOM，走 ::part() 入口。
   锁定本组件的 .box 容器做作用域闸门，防止样式泄漏到其他页面的 t-chat；
   placement="left" 为 AI 助手(outline variant)，placement="right" 为“我”的消息(base variant)。
   备注：上一版直接写进 .t-chat__list 的那些 .t-chat__item__* 全被 Shadow 挡住、从未生效，
         故此处分两步：先清掉那批死码，再以 host::part() 形态重建。
   ============================================================ */
.box :deep(t-chat-item) {
  /* —— 公共：头像紫系光环 / 名字时间排版 —— */
  &::part(t-chat__item__avatar) {
    margin-top: 4px;
    filter: drop-shadow(0 0 6px rgba(124, 108, 240, 0.18));
  }
  &::part(t-chat__item__name) {
    font-weight: 600;
    color: rgba(46, 31, 109, 0.55);
  }
  &::part(t-chat__item__time) {
    color: rgba(15, 23, 42, 0.36);
  }

  /* ===== 左侧 · AI 助手气泡：苹果磨砂白玻璃 + 细紫描边 + 不对称圆角（左下小尾）===== */
  &[placement="left"] {
    &::part(t-chat__item__inner) {
      align-items: flex-start;
    }
    &::part(t-chat__item__content) {
      background-color: rgba(255, 255, 255, 0.72);
      border: 1px solid rgba(167, 139, 250, 0.22);
      border-radius: 20px 20px 20px 6px;
      box-shadow:
        0 4px 14px rgba(31, 27, 72, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.65);
      backdrop-filter: blur(12px) saturate(160%);
      -webkit-backdrop-filter: blur(12px) saturate(160%);
      transition:
        border-color 0.25s ease,
        box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      &:hover {
        border-color: rgba(124, 108, 240, 0.38);
        box-shadow:
          0 6px 20px rgba(124, 108, 240, 0.12),
          inset 0 1px 0 rgba(255, 255, 255, 0.75);
      }
    }
    &::part(t-chat__text) {
      color: #26213f;
      font-size: 14px;
      line-height: 1.62;
    }

    /* ===== AI 正文内 Markdown 渲染精致化（经 t-chat-item 的 exportparts 再透出 md_*）===== */
    &::part(t-chat__text__markdown) {
      word-break: break-word;
      overflow-wrap: anywhere;
      > *:first-child { margin-top: 0; }
      > *:last-child { margin-bottom: 0; }
    }
    &::part(md_p) { margin: 8px 0; }
    &::part(md_strong) { color: #2e1f6d; font-weight: 700; }
    &::part(md_em) { color: #5566d4; font-style: italic; }
    &::part(md_a) {
      color: #5897f5;
      text-decoration: none;
      border-bottom: 1px solid rgba(96, 165, 250, 0.45);
      transition: color 0.18s ease, border-bottom-color 0.18s ease;
      &:hover { color: #3460e0; border-bottom-color: #5897f5; }
    }

    /* 标题：indigo 墨字 + 底部细分隔；H1 最重，逐级递减 */
    &::part(md_h1),
    &::part(md_h2),
    &::part(md_h3) {
      margin: 20px 0 10px;
      font-weight: 800;
      letter-spacing: -0.01em;
      line-height: 1.35;
    }
    &::part(md_h1) {
      font-size: 21px;
      padding-bottom: 8px;
      border-bottom: 2px solid rgba(124, 108, 240, 0.28);
    }
    &::part(md_h2) {
      font-size: 18px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    }
    &::part(md_h3) {
      font-size: 16px;
      color: #4a4099;
    }

    /* 列表：收紧间距，marker 自带浏览器默认着色即可 */
    &::part(md_ul),
    &::part(md_ol) {
      margin: 8px 0;
      padding-left: 22px;
    }
    &::part(md_li) { margin: 4px 0; line-height: 1.62; }

    /* 分割线：柔光渐变细线替代默认粗线 */
    &::part(md_hr) {
      height: 1px;
      border: none;
      margin: 18px 0;
      background-image: linear-gradient(90deg, transparent, rgba(124, 108, 240, 0.38), transparent);
    }

    /* 引述块：左侧品牌竖条 + 极淡紫底 + 小圆角尾 */
    &::part(md_blockquote) {
      margin: 12px 0;
      padding: 6px 14px;
      border-left: 3px solid #8b7bf5;
      background-color: rgba(167, 139, 250, 0.06);
      color: #4b4670;
      border-radius: 0 8px 8px 0;
    }

    /* 表格：圆角外壳 + 淡紫表头 + 斑马纹（奇偶行）+ hairline 描边 */
    &::part(md_div) {
      overflow-x: auto;
      margin: 12px 0;
      max-width: 100%;
    }
    &::part(md_table) {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 12px;
      overflow: hidden;
      font-size: 13px;
    }
    &::part(md_thead) { background-color: rgba(167, 139, 250, 0.09); }
    &::part(md_th) {
      padding: 9px 12px;
      text-align: left;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: #2e1f6d;
      border-bottom: 1px solid rgba(124, 108, 240, 0.18);
    }
    &::part(md_tbody) { background-color: transparent; }
    &::part(md_tr) {
      transition: background-color 0.18s ease;
      &:nth-child(even) { background-color: rgba(167, 139, 250, 0.05); }
      &:hover { background-color: rgba(96, 165, 250, 0.07); }
    }
    &::part(md_td) {
      padding: 9px 12px;
      color: #26213f;
      vertical-align: top;
      border-bottom: 1px solid rgba(15, 23, 42, 0.05);
    }
  }

  /* ===== 右侧 · 我的消息气泡：品牌紫蓝渐变实填 + 白字 + 高光阴影（右下小尾）===== */
  &[placement="right"] {
    &::part(t-chat__item__inner) {
      align-items: flex-end;
    }
    &::part(t-chat__item__content) {
      /* 回归项目真身份紫蓝渐变 #667eea→#764ba2（见 brand-color-purple-not-blue 记忆）；
         先前误用的亮版次级紫蓝 #8b7bf5→#5897f5 对白字对比不足，用户反馈看不清字 */
      background-image: linear-gradient(135deg, #667eea, #764ba2);
      background-color: #5a3d96;                       /* 无 gradient 降级时仍属深沉的备胎 */
      color: #ffffff !important;
      -webkit-text-fill-color: #ffffff !important;
      border: none;
      border-radius: 20px 20px 6px 20px;
      box-shadow:
        0 6px 16px rgba(72, 50, 130, 0.42),
        inset 0 1px 0 rgba(255, 255, 255, 0.46),
        inset 0 -1px 0 rgba(30, 15, 60, 0.22);
      transition:
        filter 0.25s ease,
        box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      &:hover {
        filter: brightness(1.06) saturate(1.08);
        box-shadow:
          0 8px 22px rgba(82, 56, 150, 0.52),
          inset 0 1px 0 rgba(255, 255, 255, 0.6);
      }
    }
    &::part(t-chat__text--user) {
      color: #ffffff !important;
      -webkit-text-fill-color: #ffffff !important;
      text-shadow: 0 1px 2px rgba(35, 15, 70, 0.32);   /* 字影兜底：任一带位上都吃得住白字 */
      font-size: 14px;
      line-height: 1.55;
      font-weight: 500;
    }
  }

  /* —— 附带复活：「开始」建议胶囊（之前写在 list 里因 Shadow 失效）—— */
  &::part(t-chat__item__suggestion-item) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: #6d54c8;
    background-image: linear-gradient(135deg, rgba(167, 139, 250, 0.14), rgba(96, 165, 250, 0.14));
    border: 1px solid rgba(124, 108, 240, 0.28);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    &:hover {
      color: #ffffff;
      -webkit-text-fill-color: #fff;
      background-image: linear-gradient(135deg, #667eea, #764ba2);
      border-color: transparent;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(96, 165, 250, 0.38);
    }
  }
}

/* 滚动条 */
:deep(.t-chat__list) {
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.12);
    border-radius: 3px;
    &:hover {
      background: rgba(0, 0, 0, 0.2);
    }
  }
}

.panelContent {
  height: 100%;
  overflow-y: auto;
  padding: 12px 16px;
  box-sizing: border-box;
  position: relative;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.12);
    border-radius: 3px;
    &:hover {
      background: rgba(0, 0, 0, 0.2);
    }
  }
}

.scriptList {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.scriptCard {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  overflow: hidden;
  background: var(--material-thin);
  backdrop-filter: var(--blur-light);
  -webkit-backdrop-filter: var(--blur-light);
  display: flex;
  flex-direction: column;
  align-self: start;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
    border-color: rgba(123, 97, 255, 0.3);
  }
  .scriptCardHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    .scriptCardHeaderLeft {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .scriptCardActions {
      flex-shrink: 0;
      display: flex;
      gap: 4px;
      .t-button {
        border-radius: 8px;
        transition: all 0.2s ease;
        &:hover {
          transform: scale(1.05);
        }
      }
    }
    .scriptIndex {
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
      background: linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(123, 97, 255, 0.12));
      color: #7b61ff;
      padding: 2px 8px;
      border-radius: 6px;
    }
    .scriptTitle {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .scriptCardBody {
    font-size: 13px;
    line-height: 1.7;
    padding: 10px 14px;
    max-height: 300px;
    overflow-y: auto;
    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.08);
      border-radius: 2px;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
      font-family: inherit;
    }
    .emptyContent {
      display: block;
      font-size: 13px;
      color: rgba(0, 0, 0, 0.3);
    }
    :deep(.md-editor-preview-wrapper) {
      padding: 0;
    }
  }
  .scriptCardFooter {
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--td-border-level-1-color);
    background: rgba(0, 0, 0, 0.02);
    .assetsLabel {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 12px;
      white-space: nowrap;
      margin-top: 2px;
      flex-shrink: 0;
    }
    .assetsTags {
      display: flex;
      flex-wrap: wrap;
      gap: 5.6px;
    }
  }
}

.scriptEditForm {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
  .scriptEditField {
    display: flex;
    flex-direction: column;
    gap: 6px;
    label {
      font-size: 13px;
      font-weight: 500;
    }
    .assets-list {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 10px;
    }
  }
  .assetsEditor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-radius: 10px;
    padding: 10px 14px;
    background: var(--material-thin);
    border: 1px solid rgba(255, 255, 255, 0.1);
    .assetsTagList {
      display: flex;
      flex-wrap: wrap;
      gap: 5.6px;
      min-height: 24px;
    }
    .assetsInputRow {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  }
}

.forceGenerateMask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: var(--blur-medium);
  -webkit-backdrop-filter: var(--blur-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  border-radius: 16px;
  animation: materialize-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  .forceGenerateCard {
    background: var(--material-thick);
    backdrop-filter: var(--blur-heavy);
    -webkit-backdrop-filter: var(--blur-heavy);
    border: 1px solid var(--material-border-medium);
    border-radius: 20px;
    padding: 32px 36px 28px;
    max-width: 320px;
    width: 90%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    .forceGenerateActions {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      width: 100%;
      justify-content: center;
      .t-button {
        border-radius: 10px;
        background: linear-gradient(135deg, #00d4ff, #7b61ff);
        border: none;
        color: #fff;
        font-weight: 600;
        padding: 8px 24px;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        &:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(123, 97, 255, 0.35);
        }
      }
    }
  }
}
.settingMenu {
  padding: 6px 0;
  background: var(--material-thick);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  border: 1px solid var(--material-border-medium);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  overflow: hidden;
  .settingMenuItem {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
    &:hover {
      background: rgba(123, 97, 255, 0.08);
    }
    &.danger {
      color: #ef4444;
      &:hover {
        background: rgba(239, 68, 68, 0.08);
      }
    }
  }
}

/* TDesign 按钮苹果风 */
:deep(.t-button) {
  border-radius: 10px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  &:hover {
    transform: translateY(-1px);
  }
  &.t-button--theme-primary {
    background: linear-gradient(135deg, #00d4ff, #7b61ff);
    border: none;
    color: #fff;
    box-shadow: 0 2px 8px rgba(123, 97, 255, 0.25);
    &:hover {
      box-shadow: 0 4px 16px rgba(123, 97, 255, 0.35);
    }
  }
}

:deep(.t-tabs__operations--right) {
  top: 0;
  bottom: 0;
}
:deep(.t-tabs__btn--right) {
  display: none;
}

/* 强制生成蒙层 */
:deep(.t-dialog) {
  border-radius: 20px;
  background: var(--material-thick);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  border: 1px solid var(--material-border-medium);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  .t-dialog__header {
    font-weight: 600;
  }
  .t-dialog__body {
    padding: 16px 24px;
  }
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

@keyframes materialize-in {
  from { opacity: 0; backdrop-filter: blur(0px); }
  to { opacity: 1; backdrop-filter: var(--blur-medium); }
}

// 悬浮折叠按钮样式
.floatCollapseBtn {
  position: fixed;
  right: 40px;
  bottom: 40px;
  z-index: 100;
  .t-button {
    background: linear-gradient(135deg, #00d4ff, #7b61ff) !important;
    border: none !important;
    color: #fff !important;
    width: 44px;
    height: 44px;
    box-shadow: 0 4px 16px rgba(123, 97, 255, 0.35);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    &:hover {
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 8px 24px rgba(123, 97, 255, 0.45);
    }
  }
}

// 折叠状态样式
.scriptCard {
  &.collapsed {
    .scriptCardHeader {
      border-bottom: none;
    }
  }
}
.scriptAgent{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;padding:20px 30px;background:linear-gradient(180deg,#fbfbfc,#f6f7fa)}.scriptAgent .guideBanner{padding:20px 24px;border-radius:20px;background:linear-gradient(135deg,#eef4ff,#f5efff 58%,#fff3e9);border-color:rgba(105,101,191,.13);box-shadow:0 12px 30px rgba(54,51,91,.06)}.scriptAgent .guideBanner .guideContent .guideTitle{font-size:18px;color:#292b38}.scriptAgent .guideBanner .guideContent .guideDesc{font-size:13px;color:#737682}.scriptAgent .guideBanner .guideFlow,.scriptAgent .guideBanner .guideFeature,.scriptAgent .guideBanner .guideTip{background:rgba(255,255,255,.7);border-radius:13px}.scriptAgent .data :deep(.operate .box){border-radius:20px;background:#fff;border-color:#e8e9ed;box-shadow:0 12px 34px rgba(37,40,57,.07)}.scriptAgent :deep(.t-button--theme-primary){background:#24252b;border-color:#24252b;border-radius:11px}
</style>

<style scoped>
.scriptAgent > .data { flex: 1 1 auto; min-height: 0; height: auto !important; }
.scriptAgent > .data :deep(.splitpanes__pane) { min-height: 0; overflow: hidden; }
.scriptAgent .operate { min-height: 0; }
.scriptAgent .operate .box { min-height: 0; }
.scriptAgent .costHintRow { display:flex; align-items:center; min-height:24px; padding:0 16px 5px; background:#fffdfb; }
.scriptAgent .chatErrorCard { display:flex; align-items:center; gap:9px; margin:0 12px 8px; padding:9px 11px; border:1px solid #f0c8bd; border-radius:11px; background:#fff6f3; color:#8c4330; font-size:11px; }
.scriptAgent .chatErrorIcon { display:grid; place-items:center; width:18px; height:18px; flex:none; border-radius:50%; background:#e87551; color:#fff; font-weight:700; }
.scriptAgent .chatErrorBody { display:flex; flex:1; min-width:0; flex-direction:column; gap:2px; }
.scriptAgent .chatErrorBody span { overflow:hidden; color:#a36e60; text-overflow:ellipsis; white-space:nowrap; }
.scriptAgent .chatErrorCard button { flex:none; padding:4px 9px; border:1px solid #e3a18e; border-radius:7px; background:#fff; color:#b74d2f; cursor:pointer; }
</style>

<style>
/* t-popup is teleported to body, so its shell must be styled outside the page scope. */
body .t-popup__content:has(> .settingMenu) {
  padding: 0 !important;
  border: 0 !important;
  border-radius: 14px !important;
  background: transparent !important;
  box-shadow: none !important;
  overflow: visible !important;
}
body .t-popup__content > .settingMenu {
  min-width: 190px;
  padding: 6px !important;
  border: 1px solid #e6cdbb !important;
  border-radius: 13px !important;
  background: #fffdfb !important;
  box-shadow: 0 16px 40px rgba(82,52,28,.16) !important;
  backdrop-filter: none !important;
}
body .t-popup__content > .settingMenu .settingMenuItem {
  margin: 2px 0;
  padding: 9px 11px !important;
  border-radius: 8px !important;
  color: #5c4a3e !important;
}
body .t-popup__content > .settingMenu .settingMenuItem:hover,
body .t-popup__content > .settingMenu .settingMenuItem.active {
  background: #fff0e3 !important;
  color: #c36d36 !important;
}
</style>

<style scoped>
.agentEyebrow{display:block;font-size:9px;letter-spacing:.16em;color:#b47b5a;margin-bottom:4px}.agentLive{display:flex;align-items:center;gap:6px;font-size:11px;color:#9c653e}.agentLive i{height:6px;width:6px;border-radius:50%;background:#ed873a;box-shadow:0 0 0 4px #ed873a15}.agentLive.busy i{animation:skillPulse 1.6s ease-in-out infinite}.loadSkillButton{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;box-sizing:border-box;padding:0 10px;border:1px solid #eac5a7;border-radius:9px;background:#fffaf5;color:#9b501f;cursor:pointer;font-size:11px;line-height:1;white-space:nowrap}.loadSkillButton b{display:grid;place-items:center;min-width:25px;height:18px;box-sizing:border-box;font-size:10px;background:#ffe9d6;border-radius:5px;padding:0 4px}.loadedSkillChips{display:flex;flex-wrap:wrap;gap:4px;margin-left:5px}.loadedSkillChips button{border:1px solid #ecdace;border-radius:7px;background:#fff;color:#9c592c;padding:5px 7px;font-size:10px;cursor:pointer}.loadedSkillChips span{margin-left:4px}.creativeSkillPicker{position:absolute;z-index:20;bottom:66px;left:12px;right:12px;max-height:calc(100% - 140px);display:flex;flex-direction:column;border:1px solid #edceb7;border-radius:17px;background:#fffdfb;box-shadow:0 20px 60px #62442d30;overflow:hidden}.pickerHeading{display:flex;justify-content:space-between;align-items:center;padding:17px}.pickerHeading strong{display:block;font-size:15px;color:#322b25}.pickerHeading small{display:block;font-size:11px;color:#91857c;margin-top:5px}.pickerHeading>button{border:0;background:transparent;font-size:22px;color:#9b8b80;cursor:pointer}.skillSearch{margin:0 14px 10px;padding:10px 12px;border:1px solid #eadfd6;border-radius:9px;background:#faf7f4;outline:none;min-width:0}.skillSearch:focus{border-color:#ed873a;box-shadow:0 0 0 3px #ed873a12}.creativeSkillOptions{overflow:auto;min-height:0;padding:0 10px 10px;display:grid;gap:5px}.creativeSkillOptions>button{display:flex;align-items:center;gap:10px;text-align:left;border:1px solid transparent;padding:11px 8px;background:transparent;border-radius:10px;cursor:pointer;color:#4b4037}.creativeSkillOptions>button:hover{background:#faf3ec}.creativeSkillOptions>button.selected{border-color:#f0c39f;background:#fff3e8}.skillOptionIcon{display:grid;place-items:center;width:29px;height:33px;background:#f7eade;border-radius:8px;color:#d38343;flex:none}.creativeSkillOptions strong{display:block;font-size:12px}.creativeSkillOptions small{display:block;margin-top:5px;font-size:10px;line-height:1.5;color:#938478}.creativeSkillOptions b{margin-left:auto;color:#d98442}.pickerFoot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 15px;border-top:1px solid #eee3da;font-size:10px;color:#9c8a7c}.pickerFoot button{border:0;border-radius:8px;padding:7px 14px;background:#b96d38;color:#fff;cursor:pointer}.pickerNotice{font-size:12px;padding:12px;color:#9b8573}.creativeSkillOptions button:disabled{opacity:.5;cursor:not-allowed}
.creativeSkillPicker{max-height:min(520px,calc(100vh - 300px))}
.inputBox :deep(.t-chat-sender__inner-header){padding:9px 12px 0;background:#fff;overflow:hidden}
.inputBox .loadedSkillChips{display:flex;gap:6px;margin:0;overflow-x:auto;flex-wrap:nowrap;padding-bottom:2px;scrollbar-width:none}
.inputBox .loadedSkillChips::-webkit-scrollbar{display:none}
.inputBox .loadedSkillChips button{display:inline-flex;align-items:center;gap:5px;flex:none;height:27px;padding:0 8px;border:1px solid #ead8ca;border-radius:999px;background:#fff9f4;color:#7c4b2d;font-size:10px;line-height:1;box-shadow:none}
.inputBox .loadedSkillChips button:hover{border-color:#dfaa82;background:#fff1e5}
.skillChipSpark{color:#e38643;font-size:9px}.skillChipRemove{margin-left:2px;color:#ad8d78;font-size:13px}
.sendUpButton{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:linear-gradient(145deg,#ff8847,#ed6434);color:#fff;box-shadow:0 6px 14px rgba(239,100,48,.25);cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}
.sendUpButton:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 18px rgba(239,100,48,.32)}
.sendUpButton:disabled{background:#ebe8eb;color:#aaa5ad;box-shadow:none;cursor:not-allowed}
.sendUpButton svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.sendUpButton.stop span{width:11px;height:11px;border-radius:3px;background:#fff}
</style>

<style lang="scss">
/* 剧本 Agent 对话区：通过 TDesign 暴露的 part 定制，不影响消息逻辑 */
.scriptAgent .operate .box {
  padding: 0 !important;
  overflow: hidden;
  background: #fbfafb !important;

  .t-chat { min-height: 0; flex: 1; }
  .t-chat__list { padding: 18px 16px 12px !important; background: linear-gradient(180deg,#fff 0%,#fbfafb 100%); }
  .t-chat__to-bottom { width:34px!important;height:34px!important;border:1px solid #e7e4e8!important;border-radius:50%!important;background:#fff!important;color:#68636e!important;box-shadow:0 5px 13px rgba(44,39,55,.09)!important; }

  t-chat-item::part(t-chat__item__inner) { margin: 0 0 15px; gap: 8px; }
  t-chat-item::part(t-chat__item__main) { max-width: 88%; }
  t-chat-item::part(t-chat__item__header) { display: none; }
  t-chat-item::part(t-chat__item__avatar) { display: none; }

  t-chat-item[placement="left"]::part(t-chat__item__content) {
    padding: 11px 13px;
    border: 1px solid #ece9ed;
    border-radius: 6px 16px 16px 16px;
    background: #f5f4f6;
    color: #38343d;
    box-shadow: none;
    backdrop-filter: none;
  }
  t-chat-item[placement="left"]::part(t-chat__text),
  t-chat-item[placement="left"]::part(md_p),
  t-chat-item[placement="left"]::part(md_td) { color:#38343d; font-size:13px; line-height:1.68; }
  t-chat-item[placement="left"]::part(md_strong) { color:#27232c; font-weight:700; }
  t-chat-item[placement="left"]::part(md_table) { border-color:#e2dfe4; border-radius:10px; background:#fff; }
  t-chat-item[placement="left"]::part(md_thead) { background:#f0edef; }
  t-chat-item[placement="left"]::part(md_th) { color:#4b454f; border-bottom-color:#dedade; }

  t-chat-item[placement="right"]::part(t-chat__item__content) {
    padding: 10px 14px;
    border: 1px solid #f1c7b2;
    border-radius: 16px 6px 16px 16px;
    background: #fff0e7;
    background-image: none;
    color: #78381e !important;
    -webkit-text-fill-color: #78381e !important;
    box-shadow: none;
  }
  t-chat-item[placement="right"]::part(t-chat__text--user) {
    color:#78381e!important;
    -webkit-text-fill-color:#78381e!important;
    text-shadow:none;
    font-size:13px;
    line-height:1.55;
    font-weight:600;
  }
  t-chat-item::part(t-chat__item__suggestion-item) {
    padding:7px 13px;
    border:1px solid #edb89c;
    border-radius:10px;
    background:#fff8f4;
    background-image:none;
    color:#d95c27;
    font-size:12px;
    font-weight:650;
    box-shadow:none;
  }
  t-chat-item::part(t-chat__item__suggestion-item):hover {
    border-color:#ef7b49;
    background:#fff0e7;
    background-image:none;
    color:#c84e1d;
    -webkit-text-fill-color:#c84e1d;
    transform:none;
    box-shadow:none;
  }

  .inputBox {
    margin: 0 12px 8px;
    width: calc(100% - 24px) !important;
    max-width: calc(100% - 24px) !important;
    align-self: center;
    box-sizing: border-box;
    padding: 0 !important;
    border: 1px solid #e4e1e5;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 8px 22px rgba(43,38,52,.07);
  }
  .inputBox .t-chat-sender__textarea__wrapper { min-height:70px!important;border:0!important;border-radius:15px 15px 0 0!important;background:#fff!important;box-shadow:none!important;backdrop-filter:none!important; }
  .inputBox .t-textarea__inner { min-height:70px!important;height:70px!important;padding:13px 14px!important;color:#37323b!important;font-size:13px!important;line-height:1.6!important; }
  .inputBox .t-chat-sender__footer { min-height:50px;padding:7px 10px 7px 12px;border-top:1px solid #f0edef;align-items:center; }
  .inputBox .t-chat-sender__mode { display:flex!important;align-items:center!important;gap:6px!important;width:auto!important;min-width:0!important;line-height:1; }
  .inputBox .t-chat-sender__footer-prefix { display:flex;align-items:center;gap:4px;min-width:0;flex-wrap:wrap; }
  .inputBox { overflow:visible!important; }
  .inputBox .t-chat-sender__mode .t-button { width:32px!important;height:32px!important;min-width:32px!important;margin:0!important;padding:0!important;border:1px solid #eadfd7!important;border-radius:9px!important;background:#faf7f4!important;color:#755b49!important;box-shadow:none!important;vertical-align:middle!important; }
  .inputBox .t-chat-sender__button__sendbtn .t-button {
    width:36px!important;height:36px!important;min-width:36px!important;padding:0!important;border:0!important;border-radius:50%!important;
    background:linear-gradient(135deg,#ff8847,#f26432)!important;color:#fff!important;
    box-shadow:0 6px 14px rgba(239,100,48,.24)!important;
  }
  .inputBox .t-chat-sender__button__sendbtn .t-button .t-button__text,
  .inputBox .t-chat-sender__button__sendbtn .t-button svg,
  .inputBox .t-chat-sender__button__sendbtn .t-button path { color:#fff!important;fill:#fff!important; }
  .inputBox .t-chat-sender__button__sendbtn .t-button,
  .inputBox .t-chat-sender__button__sendbtn .t-button *,
  .inputBox .t-chat-sender__button__sendbtn .t-button svg {
    animation:none!important;
    transform:none!important;
    transition:background-color .18s ease,box-shadow .18s ease!important;
  }
  .inputBox .t-chat-sender__button__sendbtn .t-button__text { display:grid!important;place-items:center!important;width:100%;height:100%; }
  .inputBox .t-chat-sender__button__sendbtn .t-button:disabled,
  .inputBox .t-chat-sender__button__sendbtn .t-chat-sender__button--disabled {
    background:#ece9ec!important;color:#aaa5ad!important;box-shadow:none!important;opacity:1!important;
  }
  .inputBox .t-chat-sender__button__sendbtn .t-button:disabled svg,
  .inputBox .t-chat-sender__button__sendbtn .t-button:disabled path { color:#aaa5ad!important;fill:#aaa5ad!important; }
  .t-popup__content { border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important;padding:0!important; }
  .t-popup__content .settingMenu { min-width:190px;padding:6px!important;background:#fffdfb!important;border:1px solid #e6cdbb!important;border-radius:13px!important;box-shadow:0 16px 40px rgba(82,52,28,.16)!important;backdrop-filter:none!important; }
  .t-popup__content .settingMenuItem { margin:2px 4px;padding:9px 11px!important;border-radius:8px!important;color:#5c4a3e!important; }
  .t-popup__content .settingMenuItem:hover,.t-popup__content .settingMenuItem.active { background:#fff0e3!important;color:#c36d36!important; }
  .inputBox .t-chat-sender__button .t-chat-sender__button__sendbtn .t-button,
  .inputBox .t-chat-sender__button .t-chat-sender__button__sendbtn .t-button.t-button--variant-text { background:linear-gradient(135deg,#ff8847,#f26432)!important;background-color:#f26432!important;color:#fff!important;border-color:transparent!important; }
  .inputBox .t-chat-sender__button .t-chat-sender__button__sendbtn .t-button:disabled { background:#ece9ec!important;color:#aaa5ad!important; }
  .connStatus { margin:0 14px 9px!important;padding:3px 9px!important;background:transparent!important;border:0!important;box-shadow:none!important;font-size:10px!important; }

  .scriptChatHeader,.scriptChatSubhead{display:flex;align-items:center;justify-content:space-between;flex:none;padding:0 16px;background:#fff}
  .scriptChatHeader{height:64px}.scriptChatSubhead{height:48px;border-bottom:1px solid #eceaec}
  .scriptChatIdentity{display:flex;align-items:center;gap:10px}.scriptChatIdentity strong{font-size:17px;color:#242126}
  .miniMascot{display:grid;place-items:center;width:34px;height:34px;overflow:hidden;border:1px solid #e8e5e8;border-radius:50%;background:#fff}.miniMascot img{width:40px;height:40px;object-fit:contain}
  .scriptChatHeader button,.scriptChatSubhead button{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:9px;background:transparent;color:#353138;cursor:pointer}.scriptChatHeader button:hover,.scriptChatSubhead button:hover{background:#f3f1f3}
  .scriptChatSubhead>strong{font-size:14px;color:#65616a}.scriptChatSubhead>div{display:flex;gap:3px}
  .scriptWelcome{display:flex;flex:1;min-height:0;flex-direction:column;align-items:center;overflow:auto;padding:28px 20px 18px;background:#fff;text-align:center}
  .scriptMascot{width:104px;height:104px;flex:none;filter:drop-shadow(0 9px 18px rgba(0,0,0,.09))}.scriptMascot svg{display:block;width:100%;height:100%}
  .scriptWelcome h2{margin:-4px 0 8px;font-size:38px;line-height:1;font-weight:850;letter-spacing:-.07em;color:#222}
  .scriptWelcome p{margin:0;color:#4f4a52;font-size:13px;line-height:1.65}
  .scriptQuickStarts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;width:100%;margin-top:24px}
  .scriptQuickStarts button{min-height:48px;padding:11px 13px;border:1px solid transparent;border-radius:13px;background:#f2f1f2;color:#302c32;font:500 13px/1.35 inherit;text-align:left;cursor:pointer;transition:.2s ease}
  .scriptQuickStarts button:hover{border-color:#efb79c;background:#fff4ed;color:#d95c27;transform:translateY(-1px)}
  .scriptQuickStarts button:last-child:nth-child(odd){grid-column:1/-1}
  .scriptWelcome small{align-self:flex-start;margin-top:18px;color:#aaa6ad;font-size:11px}
}
@media(max-width:1100px){.scriptAgent .operate .box .scriptQuickStarts{grid-template-columns:1fr}.scriptAgent .operate .box .scriptQuickStarts button:last-child:nth-child(odd){grid-column:auto}.scriptAgent .operate .box .scriptWelcome{padding-inline:12px}}
</style>

<style lang="scss">
.scriptAgent {
  box-sizing: border-box; height: 100%; min-height: 0; padding: 22px 30px 24px !important;
  background: radial-gradient(circle at 92% 0,rgba(255,174,119,.16),transparent 22%),linear-gradient(180deg,#faf9fb,#f5f5f7) !important;
  .studioHeader { position:relative; display:flex; align-items:center; min-height:126px; flex:none; margin-bottom:14px; padding:24px 30px; overflow:hidden; border:1px solid rgba(89,76,148,.11); border-radius:23px; background:radial-gradient(circle at 86% 10%,rgba(255,151,91,.27),transparent 25%),linear-gradient(132deg,#fff,#f5f2ff 58%,#fff3ea); box-shadow:0 15px 38px rgba(58,49,99,.07); }
  .studioHeader>div:first-child { position:relative; z-index:2; }
  .studioHeader span { color:#e76c2d; font-size:10px; font-weight:750; letter-spacing:.17em; }
  .studioHeader h1 { margin:8px 0 5px; color:#292733; font-size:32px; line-height:1.05; letter-spacing:-.04em; }
  .studioHeader p { margin:0; color:#777482; font-size:13px; }
  .skipAdaptationLink { display:block; margin-top:10px; padding:0; border:0; background:transparent; color:#d95c27; font-size:11px; cursor:pointer; }
  .skipAdaptationLink:hover { color:#b84418; text-decoration:underline; }
  .studioHeaderArt { position:absolute; right:5%; display:flex; align-items:center; gap:8px; transform:rotate(-5deg); }
  .studioHeaderArt i,.studioHeaderArt b { display:grid; place-items:center; width:82px; height:82px; border-radius:17px; color:#fff; font-style:normal; font-size:17px; box-shadow:0 13px 28px rgba(66,53,108,.15); }
  .studioHeaderArt i { background:linear-gradient(145deg,#8d7ce8,#5c50b7); }.studioHeaderArt b { margin-top:20px; background:linear-gradient(145deg,#ff9b61,#e75f42); }
  .splitpanes { min-height:0; border-radius:20px; overflow:hidden; }
  .tabsWrapper,.operate .box { border:1px solid #e8e7ec !important; border-radius:19px !important; background:#fff !important; box-shadow:0 10px 28px rgba(40,37,54,.055) !important; }
  .t-button--theme-primary.t-button--variant-base { border-color:transparent !important; background:linear-gradient(135deg,#ff8847,#f26432) !important; color:#fff !important; }
  .t-button--theme-primary.t-button--variant-base .t-button__text,.t-button--theme-primary.t-button--variant-base .t-icon { color:#fff !important; }
  .t-button:not(.t-button--theme-danger):not(:disabled) { border-radius:10px; }
  .t-tabs__nav-item.t-is-active { color:#e9632b !important; }.t-tabs__bar { background:#f26b35 !important; }
  .operate .box { position:relative; border-color:#ecd7c7!important; box-shadow:0 12px 36px #8f5d2910,inset 0 1px #fff!important; }
  .scriptChatHeader { height:76px; border-top:3px solid #ef9150; background:radial-gradient(ellipse at top right,#ffe4cb85,transparent 70%),#fffdfb; }
  .scriptChatIdentity strong { display:block; font-size:17px; letter-spacing:.02em; }
  .scriptChatSubhead { height:39px; background:#fffdfb; }
  .scriptChatSubhead>strong { font-size:10px; font-weight:500; letter-spacing:.04em; color:#978a7e; }
  .scriptChatSubhead>strong span { margin:0 6px; color:#da9e72; }
  .operate .box .t-chat__list { background:radial-gradient(circle at 1px 1px,#c3a88d15 1px,transparent 0) 0 0/18px 18px,linear-gradient(#fffdfb,#faf8f5)!important; }
  .operate .box t-chat-item::part(t-chat__item__header) { display:flex; font-size:10px; letter-spacing:.04em; color:#ab7e5b; margin-bottom:6px; }
  .operate .box t-chat-item[placement="left"]::part(t-chat__item__content) { background:#fffffff2; border:1px solid #e9e2da; border-left:2px solid #e4a576; border-radius:4px 14px 14px 14px; box-shadow:0 4px 14px #5b402905; }
  .operate .box t-chat-item[placement="right"]::part(t-chat__item__content) { background:linear-gradient(125deg,#ffead7,#fff3e8); border-color:#edc9aa; }
  .operate .box .inputBox { border:1px solid #e7c8ad!important; border-radius:15px!important; box-shadow:0 4px 20px #c9853410!important; background:#fffdfb!important; }
  .operate .box .inputBox:focus-within { border-color:#de9259!important; box-shadow:0 0 0 3px #ee985319!important; }
}
</style>
