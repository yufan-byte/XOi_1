<template>
  <div class="script">
    <StoryWorkspaceHeader current="script" :project-type="project?.projectType" title="剧本整理" description="把原文或已有剧本整理为分集剧本，提取角色与场景后继续分镜制作。">
      <template #meta><span>{{ scripts.length }} 个剧本</span><span>{{ project?.name || '当前漫剧项目' }}</span></template>
    </StoryWorkspaceHeader>

    <section v-if="showEntryGuide" class="scriptEntryGuide">
      <div><strong>不做 AI 改编，也要先完成剧本整理</strong><p>这一步不改变剧情，只负责把原文/已有剧本按集拆开并保存，后面的角色、场景和分镜才能准确读取。</p></div>
      <div class="scriptEntryActions"><t-button class="workspaceSecondary" theme="primary" @click="handleAiOrganizeScript"><i-magic /> AI 分集整理</t-button><t-button variant="outline" @click="handleAddScript">手动整理</t-button></div>
    </section>

    <!-- 工具行：左侧检索，右侧创建入口 -->
    <div class="actionBar">
      <div class="barLeft">
        <t-input :placeholder="$t('workbench.script.searchPlaceholder')" v-model="searchQuery" class="searchInput" clearable @enter="onChange" @clear="onChange">
          <template #prefix><i-search /></template>
        </t-input>
        <t-button variant="outline" @click="onChange">
          {{ $t("workbench.script.search") }}
        </t-button>
      </div>
      <div class="barRight">
        <t-button theme="primary" variant="outline" @click="handleAiOrganizeScript">
          <template #icon><i-magic /></template>
          AI 分集整理
        </t-button>
        <t-button variant="outline" @click="handleBatchAddScript">
          <template #icon><i-plus /></template>
          {{ $t("workbench.script.batchAddScript") }}
        </t-button>
        <t-button theme="primary" @click="handleAddScript">
          <template #icon><i-plus /></template>
          {{ $t("workbench.script.addScript") }}
        </t-button>
      </div>
    </div>

    <!-- 批量操作条：有剧本才有；未选中时提取/导出/删除保持禁用并给出提示 -->
    <div v-if="scripts.length" class="selectBar">
      <label class="selectAll" @click.prevent="toggleSelectAll(!isAllSelected)">
        <t-checkbox :checked="isAllSelected" @click.stop @change="toggleSelectAll(!isAllSelected)" />
        <span>{{ isAllSelected ? $t("workbench.script.cancelSelectAll") : $t("workbench.script.selectAll") }}</span>
        <em v-if="selectedIds.length">{{ selectedIds.length }} / {{ scripts.length }}</em>
      </label>
      <div class="bulkActions">
        <t-button size="small" variant="outline" :disabled="selectedIds.length === 0" @click="handleExportScript">
          <template #icon><i-export /></template>
          {{ $t("workbench.script.exportScript") }}
        </t-button>
        <t-button size="small" variant="outline" theme="danger" :disabled="selectedIds.length === 0" @click="handleBatchDelete">
          <template #icon><i-delete /></template>
          {{ $t("workbench.script.deleteScript") }}
        </t-button>
        <t-button size="small" theme="primary" :loading="scriptLoad" :disabled="selectedIds.length === 0" @click="handleExtractAssets()">
          <template #icon><i-magic /></template>
          提取角色场景{{ selectedIds.length ? ` (${selectedIds.length})` : "" }}
        </t-button>
      </div>
      <span class="selectHint">提取资产后，到「角色场景」统一生成形象图</span>
    </div>

    <div class="contentArea">
      <div v-if="scripts.length === 0" class="emptyState">
        <div class="emptyContent">
          <div class="emptyIcon">📝</div>
          <div class="emptyTitle">还没有剧本</div>
          <div class="emptyDesc">选择一种方式开始：</div>
          <div class="emptyActions">
            <t-button theme="primary" @click="handleAddScript">
              <template #icon><i-plus /></template>
              手动添加剧本
            </t-button>
            <t-button variant="outline" @click="handleBatchAddScript">
              <template #icon><i-plus /></template>
              批量导入剧本
            </t-button>
            <t-button variant="outline" @click="handleAiOrganizeScript">
              <template #icon><i-robot /></template>
              用AI自动拆分
            </t-button>
          </div>
          <div class="emptyTip">
            💡 已有分场剧本可以直接添加；如果只有原文，先用「AI 分集整理」拆分，不会自动改写剧情。
          </div>
        </div>
      </div>
      <div v-else class="scriptsList">
        <div
          v-for="item in scripts"
          :key="item.id"
          class="scriptCard"
          :class="{ isSelected: selectedIds.includes(item.id) }"
          @click="handleScriptClick(item)">
          <div class="cardTop">
            <t-checkbox
              :checked="selectedIds.includes(item.id)"
              class="cardCheckbox"
              @click.stop
              @change="toggleSelect(item.id)" />
            <span class="cardTitle" :title="item.name">{{ item.name }}</span>
            <span class="wordCount">{{ (item.content || "").length }} 字</span>
            <i-delete class="delIcon" theme="outline" size="15" title="删除剧本" @click.stop="handleDeleteScript(item.id)" />
          </div>
          <p class="excerpt">{{ item.content }}</p>
          <div class="cardFoot">
            <t-loading v-if="item?.extractState == 0" :text="$t('workbench.script.msg.extracting')" size="small" class="stateLine" />
            <t-loading v-else-if="item?.extractState == 2" :text="$t('workbench.script.msg.waitExtract')" size="small" class="stateLine" />
            <t-tooltip v-else-if="item?.extractState == -1" :content="item.errorReason" theme="light">
              <t-tag theme="danger" size="small">{{ $t("workbench.script.msg.extractFailed") }}</t-tag>
            </t-tooltip>
            <div class="assetTags" v-else-if="item.relatedAssets?.length" @click.stop>
              <t-tag v-for="asset in item.relatedAssets.slice(0, 4)" :key="asset.id" size="small">
                {{ asset.name }}
              </t-tag>
              <t-tag v-if="item.relatedAssets.length > 4" size="small" variant="outline">+{{ item.relatedAssets.length - 4 }}</t-tag>
            </div>
            <span v-else class="stateLine pending">尚未提取资产</span>
          </div>
        </div>
      </div>
    </div>
    <editScript v-if="openedDialogs.detailsShow" v-model="detailsShow" :item="selectedScript" @searchScripts="searchScripts" />
    <addScript v-if="openedDialogs.addScriptShow" v-model="addScriptShow" @searchScripts="searchScripts" />
    <batchAddScript v-if="openedDialogs.batchScriptShow" v-model="batchScriptShow" @select="searchScripts" />

    <!-- 导航不暗中发起可能收费的模型调用；资产提取由用户显式点击。 -->
    <NextStepBar
      current="script"
      :status="pipelineStatus"
      :status-tone="pipelineStatusTone"
      :disabled="scripts.length === 0 || extractedCount === 0"
      :disabled-hint="scripts.length === 0 ? '先添加分集剧本' : '先选择剧本并提取资产'"
      :before-next="beforeNextStep" />
  </div>
</template>

<script setup lang="ts">
import StoryWorkspaceHeader from "@/components/pipeline/StoryWorkspaceHeader.vue";
import { defineAsyncComponent, reactive, watch } from "vue";
import axios from "@/utils/axios";
const editScript = defineAsyncComponent(() => import("./components/editScript.vue"));
const addScript = defineAsyncComponent(() => import("./components/addScript.vue"));
const batchAddScript = defineAsyncComponent(() => import("./components/batchAddScript.vue"));
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import imageListCacheStore from "@/stores/imageListCache";
import { useRoute, useRouter } from "vue-router";
import NextStepBar from "@/components/pipeline/NextStepBar.vue";

const { clearScriptCache } = imageListCacheStore();

const { otherSetting } = storeToRefs(settingStore());
const { project } = storeToRefs(projectStore());
const route = useRoute();
const router = useRouter();
const showEntryGuide = computed(() => route.query.entry === "organize");

// 页面引导：回上一站 AI 改编（统一走 router.push，别用 window.location.hash，避免整页重载丢状态）
function goToScriptAgent() {
  router.push({ path: "/scriptAgent", query: { projectId: String(project.value?.id || "") } });
}
interface ScriptAsset {
  id: number;
  name: string;
  describe: string;
  prompt: string;
  type: "role" | "tool" | "scene" | "clip";
}
interface Script {
  id: number;
  name: string;
  content: string;
  createTime?: number;
  extractState?: -1 | 0 | 1 | 2; // -1 失败 0 正在提取 1 成功 等待提取
  errorReason?: string;
  relatedAssets?: ScriptAsset[];
}
const scripts = ref<Script[]>([]);
const searchQuery = ref("");
const addScriptShow = ref(false);
const selectedIds = ref<number[]>([]);
const scriptLoad = ref(false);
const batchScriptShow = ref(false);
const isAllSelected = computed(() => scripts.value.length > 0 && selectedIds.value.length === scripts.value.length);
function toggleSelect(id: number) {
  const idx = selectedIds.value.indexOf(id);
  if (idx === -1) {
    selectedIds.value.push(id);
  } else {
    selectedIds.value.splice(idx, 1);
  }
}

function toggleSelectAll(checked: boolean) {
  if (checked) {
    selectedIds.value = scripts.value.map((s) => s.id);
  } else {
    selectedIds.value = [];
  }
}
// 搜索剧本
async function searchScripts() {
  try {
    const res = await axios.post("/script/getScrptApi", {
      projectId: project.value?.id,
      name: searchQuery.value,
    });
    scripts.value = res.data;
  } catch (error) {
    console.error("搜索剧本失败:", error);
    window.$message.error($t("workbench.script.msg.searchFailed"));
  }
}
onMounted(searchScripts);
// 搜索输入变化
function onChange() {
  searchScripts();
}
// 新增剧本
function handleAddScript() {
  addScriptShow.value = true;
}
function handleBatchAddScript() {
  batchScriptShow.value = true;
}
function handleAiOrganizeScript() {
  batchScriptShow.value = true;
}
//导出剧本
async function handleExportScript() {
  if (!selectedIds.value.length) {
    window.$message.warning($t("workbench.script.msg.selectsExport"));
    return;
  }
  try {
    const res = await axios.post("/script/exportScript", { id: selectedIds.value }, { responseType: "blob" });
    const blob = new Blob([res as any], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `script_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window.$message.success($t("workbench.script.msg.exportSuccess"));
  } catch (error) {
    console.error("导出剧本失败:", error);
    window.$message.error((error as Error).message ?? $t("workbench.script.msg.exportFailed"));
  }
}
const selectedScript = ref<Script>({
  id: 0,
  name: "",
  content: "",
});
const detailsShow = ref(false);
// 点击剧本卡片
function handleScriptClick(item: Script) {
  selectedScript.value = { ...item };
  detailsShow.value = true;
}
// 删除剧本
async function handleDeleteScript(scriptId: number) {
  //判断是否有资产正在提取中
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.script.msg.deleteHeader"),
    body: $t("workbench.script.msg.deleteBody"),
    confirmBtn: $t("workbench.script.msg.deleteConfirm"),
    cancelBtn: $t("workbench.script.msg.cancel"),
    theme: "warning",
    onConfirm: async () => {
      dialog.destroy(); // TDesign 插件式弹窗需手动收起
      try {
        await axios.post("/script/delScript", { ids: [scriptId] });
        window.$message.success($t("workbench.script.msg.deleteSuccess"));
        clearScriptCache(project.value!.id, scriptId);
        searchScripts();
        dialog.destroy();

        selectedIds.value = selectedIds.value.filter((i) => i !== scriptId);
      } catch (error) {
        console.error("删除剧本失败:", error);
        window.$message.error($t("workbench.script.msg.deleteFailed"));
        dialog.destroy();
      }
    },
    onClose: () => {
      dialog.destroy();
    },
  });
}
//提取资产
async function handleExtractAssets(): Promise<boolean> {
  if (!project.value) {
    window.$message.error($t("workbench.script.msg.projectNotFound"));
    return false;
  }
  // 长文本预校验：提交前先看字数，避免必然超模型上下文的无效调用
  const contentLen = (id: number) => scripts.value.find((s) => s.id === id)?.content?.length || 0;
  const totalChars = selectedIds.value.reduce((n, id) => n + contentLen(id), 0);
  const longestChars = selectedIds.value.reduce((n, id) => Math.max(n, contentLen(id)), 0);
  if (longestChars > 120000) {
    window.$message.warning(`有单集剧本约 ${(longestChars / 10000).toFixed(1)} 万字，超过单次提取上限（12 万字），请先拆分该剧本`);
    return false;
  }
  if (totalChars > 120000) {
    window.$message.info(`所选剧本合计约 ${(totalChars / 10000).toFixed(1)} 万字，将自动拆分为多批依次提取，批数越多耗时越长`);
  }
  // 已经提取过资产的剧本再点提取：先确认，避免重复花积分 / 产生重复资产
  const reExtractCount = selectedIds.value.filter((id) => {
    const item = scripts.value.find((s) => s.id === id);
    return !!item && (item.extractState === 1 || (item.relatedAssets?.length ?? 0) > 0);
  }).length;
  if (reExtractCount > 0) {
    const confirmed = await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
      // TDesign 的插件式 confirm 点确认/取消不会自动收起，必须手动 destroy，否则弹窗一直悬着（表现为"卡住"）
      const dialog = DialogPlugin.confirm({
        header: $t("workbench.script.msg.reExtractTitle"),
        body: $t("workbench.script.msg.reExtractConfirm", { count: reExtractCount }),
        confirmBtn: $t("workbench.script.msg.reExtractOk"),
        cancelBtn: $t("workbench.script.msg.reExtractCancel"),
        onConfirm: () => { dialog.destroy(); done(true); },
        onCancel: () => { dialog.destroy(); done(false); },
        onClose: () => { dialog.destroy(); done(false); },
      });
    });
    if (!confirmed) return false;
  }
  //判断是否有资产正在提取中
  scriptLoad.value = true;
  try {
    await axios.post("/script/extractAssets", {
      scriptIds: selectedIds.value,
      projectId: project.value!.id,
      groupSize: otherSetting.value.assetsBatchGenereateSize,
    });
    searchScripts();
    selectedIds.value = [];
    return true;
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.script.msg.extractFailed"));
    return false;
  } finally {
    scriptLoad.value = false;
  }
}
/** ---------- 流水线（剧本整理 → 角色场景） ---------- */
// extractState: -1 失败 / 0 正在提取 / 1 成功 / 2 等待提取
const extractedCount = computed(() => scripts.value.filter((s) => s.extractState === 1).length);
const extractingCount = computed(() => scripts.value.filter((s) => s.extractState === 0).length);

const pipelineStatus = computed(() => {
  if (scripts.value.length === 0) return "还没有分集剧本";
  if (extractingCount.value > 0) return `${scripts.value.length} 个剧本 · ${extractingCount.value} 个提取中`;
  if (extractedCount.value === 0) return `${scripts.value.length} 个剧本 · 尚未提取角色场景`;
  return `${scripts.value.length} 个剧本 · 已提取 ${extractedCount.value} 个`;
});

const pipelineStatusTone = computed<"ok" | "warn" | "idle">(() => {
  if (scripts.value.length === 0 || extractedCount.value === 0) return "warn";
  return "ok";
});

/** 前往角色场景前只校验，不在导航动作里偷偷发起付费提取。 */
async function beforeNextStep(): Promise<boolean> {
  const needExtract = selectedIds.value.filter((id) => {
    const item = scripts.value.find((s) => s.id === id);
    return item ? item.extractState !== 1 && item.extractState !== 0 : false;
  });
  if (needExtract.length) {
    window.$message.warning("所选分集还未提取角色场景，请先点击“提取资产”；该操作会调用模型。");
    return false;
  }
  return extractedCount.value > 0;
}

//批量删除剧本
async function handleBatchDelete() {  if (!selectedIds.value.length) {
    window.$message.warning($t("workbench.script.msg.selectDelScript"));
    return;
  }
  //判断是否有资产正在提取中
  const extractingIds = new Set(notCompletedData.value.map((s) => s.id));
  if (selectedIds.value.some((id) => extractingIds.has(id))) {
    return window.$message.error($t("workbench.script.msg.extractingInProgress"));
  }
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.script.msg.batchDeleteHeader"),
    body: $t("workbench.script.msg.batchDeleteBody", { count: selectedIds.value.length }),
    confirmBtn: $t("workbench.script.msg.deleteConfirm"),
    cancelBtn: $t("workbench.script.msg.cancel"),
    theme: "warning",
    onConfirm: async () => {
      dialog.destroy(); // TDesign 插件式弹窗需手动收起
      try {
        await axios.post("/script/delScript", { ids: selectedIds.value });
        window.$message.success($t("workbench.script.msg.batchDeleteSuccess"));
        for (const item of selectedIds.value) {
          clearScriptCache(project.value!.id, item);
        }
        searchScripts();
        dialog.destroy();
      } catch (error) {
        console.error("删除剧本失败:", error);
        window.$message.error($t("workbench.script.msg.deleteFailed"));
        dialog.destroy();
      } finally {
        selectedIds.value = [];
      }
    },
    onClose: () => {
      dialog.destroy();
    },
  });
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (pollingTimer) return;
  pollingTimer = setInterval(async () => {
    if (notCompletedData.value.length === 0) {
      stopPolling();
      return;
    }
    await pollScriptAssets();
  }, 3000);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}
const notCompletedData = computed(() => {
  return scripts.value.filter((s) => s.extractState == 0);
});
// 轮询相关
/** 连续失败次数：状态接口异常时不要让界面无限停在"资产提取中" */
let pollFailures = 0;

async function pollScriptAssets() {
  if (notCompletedData.value.length === 0) return;
  const ids = notCompletedData.value.map((item) => item.id);
  try {
    const { data } = await axios.post("/script/pollScriptAssets", { ids });
    pollFailures = 0;
    if (data.length) {
      searchScripts();
    }
  } catch (e) {
    console.error("轮询事件状态失败:", e);
    pollFailures += 1;
    // 连续 5 次（约 15 秒）拿不到状态就停轮询并明确告知，避免永远转圈
    if (pollFailures >= 5) {
      stopPolling();
      window.$message.warning($t("workbench.script.msg.pollFailed"));
    }
  }
}
watch(
  () => notCompletedData.value,
  (newVal) => {
    if (newVal.length > 0) {
      startPolling();
    } else {
      stopPolling();
    }
  },
);
onUnmounted(() => {
  stopPolling();
});
const openedDialogs = reactive({ detailsShow: false, addScriptShow: false, batchScriptShow: false });
watch([detailsShow, addScriptShow, batchScriptShow], ([edit, add, batch]) => {
  if (edit) openedDialogs.detailsShow = true;
  if (add) openedDialogs.addScriptShow = true;
  if (batch) openedDialogs.batchScriptShow = true;
}, { immediate: true });
</script>

<style lang="scss" scoped>
/* 剧本整理页：暖橙工作台风格，与项目总览/角色场景同一套 token */
.script {
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #302b28;

  /* 页面引导 */
  .scriptEntryGuide {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex: none;
    margin-bottom: 14px;
    padding: 14px 18px;
    border: 1px solid #edcfb8;
    border-radius: 14px;
    background: linear-gradient(135deg, #fff8f1, #fffdfb);
  }
  .scriptEntryGuide strong { color: #4d382b; font-size: 13.5px; }
  .scriptEntryGuide p { margin: 5px 0 0; color: #8b776a; font-size: 12px; line-height: 1.5; }
  .scriptEntryActions { display: flex; flex: none; gap: 8px; }

  /* 工具行 */
  .actionBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex: none;
    flex-wrap: wrap;
    margin-bottom: 12px;
    padding: 10px 14px;
    border: 1px solid var(--xoi-workspace-border, #eee7e2);
    border-radius: 14px;
    background: #fff;

    .barLeft { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
    .searchInput { width: min(300px, 100%); }
    .searchInput :deep(.t-input) { border-radius: 10px; background: #fffdfb; border-color: #eee0d5; }
    .barRight { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    :deep(.t-button) { border-radius: 10px; }
    :deep(.t-button--theme-primary) {
      border: 0; background: linear-gradient(135deg, #f2803f, #e0641f);
      box-shadow: 0 6px 14px rgba(224, 100, 31, .18);
      &:hover { background: linear-gradient(135deg, #f88746, #e96a26); }
    }
    :deep(.t-button--theme-primary.t-button--variant-outline) {
      border: 1px solid #f0c4a8; background: #fff6ef; color: #d06a33; box-shadow: none;
      &:hover { border-color: #e8a377; background: #ffefe3; }
    }
  }

  /* 批量操作条 */
  .selectBar {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: none;
    flex-wrap: wrap;
    margin-bottom: 14px;
    padding: 8px 14px;
    border: 1px solid #f0e2d6;
    border-radius: 12px;
    background: #fffdf9;

    .selectAll {
      display: inline-flex; align-items: center; gap: 8px;
      color: #4c433d; font-size: 13px; cursor: pointer; user-select: none;
      em { font-style: normal; color: #d06a33; font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
    }
    .bulkActions { display: flex; align-items: center; gap: 8px; }
    .bulkActions :deep(.t-button) { border-radius: 9px; }
    .selectHint { margin-left: auto; color: #b3a294; font-size: 11.5px; }
  }

  .contentArea { display: flex; flex-direction: column; min-height: 0; }

  /* 剧本卡片：自适应网格 */
  .scriptsList {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px;
    align-items: stretch;
  }

  .scriptCard {
    display: flex; flex-direction: column;
    padding: 13px 15px;
    border: 1px solid var(--xoi-workspace-border, #eee7e2);
    border-radius: 13px;
    background: #fff;
    box-shadow: 0 3px 12px #302b2806;
    cursor: pointer;
    transition: transform .22s cubic-bezier(.16, 1, .3, 1), box-shadow .22s, border-color .22s;

    &:hover {
      transform: translateY(-2px);
      border-color: #e6c3ab;
      box-shadow: 0 10px 24px #302b2812;
      .delIcon { opacity: .55; }
    }
    &.isSelected {
      border-color: #ef9f70;
      background: #fffaf5;
      box-shadow: 0 0 0 2px rgba(240, 130, 70, .12), 0 8px 20px #302b2810;
    }

    .cardTop { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .cardCheckbox { flex: none; }
    .cardTitle {
      flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: #302b28; font-size: 14px; font-weight: 650; letter-spacing: -.01em;
    }
    .wordCount { flex: none; color: #b3a294; font-size: 11px; font-variant-numeric: tabular-nums; }
    .delIcon {
      flex: none; color: #a3988d; opacity: 0; cursor: pointer;
      transition: opacity .2s, color .2s;
      &:hover { color: #d5453a; opacity: 1 !important; }
    }

    .excerpt {
      flex: 1;
      margin: 9px 0 0;
      color: #7c7169; font-size: 12.5px; line-height: 1.65;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
      overflow: hidden; text-overflow: ellipsis;
      word-break: break-all;
    }

    .cardFoot {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      margin-top: 10px; padding-top: 10px; border-top: 1px solid #f4ece4;
      min-height: 26px;

      .stateLine { color: #c08a65; font-size: 12px; }
      .stateLine.pending { color: #b3a294; font-size: 11.5px; }
      .assetTags { display: flex; flex-wrap: wrap; gap: 5px; }
      .assetTags :deep(.t-tag) {
        border-radius: 6px; border-color: #f0e2d6; background: #fff8f2; color: #a3765a; font-size: 11px;
      }
    }
  }

  /* 空态 */
  .emptyState {
    display: flex; justify-content: center; align-items: center;
    flex: 1; min-height: 320px;
    border: 1px dashed #ecdfd4; border-radius: 16px; background: #fffdfb;

    .emptyContent { text-align: center; max-width: 480px; padding: 40px 20px; }
    .emptyIcon { font-size: 44px; margin-bottom: 14px; }
    .emptyTitle { color: #4c433d; font-size: 17px; font-weight: 650; margin-bottom: 8px; }
    .emptyDesc { color: #8d8177; font-size: 13px; margin-bottom: 20px; }
    .emptyActions {
      display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px;
      :deep(.t-button) { border-radius: 10px; }
      :deep(.t-button--theme-primary) {
        border: 0; background: linear-gradient(135deg, #f2803f, #e0641f); box-shadow: 0 6px 14px rgba(224, 100, 31, .18);
      }
    }
    .emptyTip {
      color: #a3988d; font-size: 12px; line-height: 1.6;
      padding: 10px 14px; background: #fff6ef; border: 1px solid #f4e4d6; border-radius: 10px;
    }
  }
}
</style>

<style lang="scss">
/* 页面容器滚动结构（需作用于 .viewBox 下的本页根元素） */
.viewBox > .script {
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px 24px calc(20px + var(--pipeline-hint-space, 64px)) !important;
  background: var(--xoi-workspace-bg, #faf8f6) !important;

  .scriptEntryGuide, .actionBar, .selectBar { flex-shrink: 0; }
  .contentArea { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 0 8px; }
  .pipelineNextBar { margin-top: 14px; flex: none; }

  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(83, 82, 94, .22); background-clip: padding-box; }
}
@media (max-width: 700px) {
  .viewBox > .script { padding: 14px !important; }
  .viewBox > .script .selectBar .selectHint { display: none; }
}
</style>
