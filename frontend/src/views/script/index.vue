<template>
  <div class="script">
    <section class="studioHeader"><div><span>XOi STORY WORKSPACE · 03</span><h1>剧本整理</h1><p>把原文或已有剧本整理成分集剧本，再提取角色、场景并进入分镜制作。</p><small>{{ scripts.length }} 个剧本 · {{ project?.name || '当前漫剧项目' }}</small></div><div class="studioHeaderArt" aria-hidden="true"><i>SCENE</i><b>{{ String(scripts.length).padStart(2, '0') }}</b></div></section>

    <section v-if="showEntryGuide" class="scriptEntryGuide">
      <div><strong>不做 AI 改编，也要先完成剧本整理</strong><p>这一步不改变剧情，只负责把原文/已有剧本按集拆开并保存，后面的角色、场景和分镜才能准确读取。</p></div>
      <div class="scriptEntryActions"><t-button theme="primary" @click="handleAiOrganizeScript"><i-magic /> AI 分集整理</t-button><t-button variant="outline" @click="handleAddScript">手动整理</t-button></div>
    </section>

    <div class="actionBar w">
      <div class="actionBar-left f ac">
        <t-input :placeholder="$t('workbench.script.searchPlaceholder')" v-model="searchQuery" class="searchInput" clearable style="width: 300px" />
        <t-button theme="primary" @click="onChange">
          <template #icon><i-search /></template>
          {{ $t("workbench.script.search") }}
        </t-button>
        <t-button theme="primary" @click="handleAddScript">
          <template #icon><i-plus /></template>
          {{ $t("workbench.script.addScript") }}
        </t-button>
        <t-button theme="primary" @click="handleBatchAddScript">
          <template #icon><i-plus /></template>
          {{ $t("workbench.script.batchAddScript") }}
        </t-button>
        <t-button theme="primary" variant="outline" @click="handleAiOrganizeScript">
          <template #icon><i-magic /></template>
          AI 分集整理
        </t-button>
      </div>
      <div class="actionBar-right f ac w" v-if="scripts.length">
        <t-button :theme="isAllSelected ? 'default' : 'primary'" variant="outline" @click="toggleSelectAll(!isAllSelected)">
          {{ isAllSelected ? $t("workbench.script.cancelSelectAll") : $t("workbench.script.selectAll") }}
        </t-button>
        <t-button theme="primary" @click="handleExportScript" :disabled="selectedIds.length === 0">
          <template #icon><i-export /></template>
          {{ $t("workbench.script.exportScript") }}{{ selectedIds.length ? `(${selectedIds.length})` : "" }}
        </t-button>
        <t-button theme="primary" @click="handleExtractAssets()" :loading="scriptLoad" :disabled="selectedIds.length === 0">
          <template #icon><i-export /></template>
          {{ $t("workbench.script.extractAssets") }}{{ selectedIds.length ? `(${selectedIds.length})` : "" }}
        </t-button>
        <t-button theme="primary" @click="handleBatchDelete" :disabled="selectedIds.length === 0">
          <template #icon><i-delete /></template>
          {{ $t("workbench.script.deleteScript") }}{{ selectedIds.length ? `(${selectedIds.length})` : "" }}
        </t-button>
      </div>
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
            <t-button theme="primary" variant="outline" @click="handleBatchAddScript">
              <template #icon><i-plus /></template>
              批量导入剧本
            </t-button>
            <t-button theme="default" variant="outline" @click="goToScriptAgent">
              <template #icon><i-robot /></template>
              用AI自动拆分
            </t-button>
          </div>
          <div class="emptyTip">
            💡 已有分场剧本可以直接添加；如果只有原文，先用「AI 分集整理」拆分，不会自动改写剧情。
          </div>
        </div>
      </div>
      <div v-else class="scriptsList f w">
        <div v-for="(item, index) in scripts" :key="index" @click="handleScriptClick(item)" class="scriptCard">
          <t-card shadow hover-shadow :style="{ width: '400px', cursor: 'pointer' }">
            <template #header>
              <div class="cardHeader">
                <span class="cardTitle">{{ item.name }}</span>
                <t-checkbox :checked="selectedIds.includes(item.id)" @click.stop @change="toggleSelect(item.id)" class="cardCheckbox" />
              </div>
            </template>
            <span class="content">{{ item.content }}</span>

            <t-loading v-if="item?.extractState == 0" :text="$t('workbench.script.msg.extracting')" size="small"></t-loading>
            <t-loading v-if="item?.extractState == 2" :text="$t('workbench.script.msg.waitExtract')" size="small"></t-loading>
            <t-tooltip :content="item.errorReason" v-if="item?.extractState == -1" theme="light">
              <t-tag theme="danger" size="small">{{ $t("workbench.script.msg.extractFailed") }}</t-tag>
            </t-tooltip>
            <div class="assetTags" v-else-if="item.relatedAssets?.length" @click.stop>
              <t-tag v-for="asset in item.relatedAssets" :key="asset.id" variant="light-outline" size="small">
                {{ asset.name }}
              </t-tag>
            </div>

            <div class="del">
              <i-delete theme="outline" size="18" @click.stop="handleDeleteScript(item.id)" style="cursor: pointer" />
            </div>
          </t-card>
        </div>
      </div>
    </div>
    <editScript v-model="detailsShow" :item="selectedScript" @searchScripts="searchScripts" />
    <addScript v-model="addScriptShow" @searchScripts="searchScripts" />
    <batchAddScript v-model="batchScriptShow" @select="searchScripts" />

    <!-- 流水线下一步：剧本整理 → 角色场景。选中的剧本若还没提取资产，点一下顺手提取再前往。 -->
    <NextStepBar
      current="script"
      :status="pipelineStatus"
      :status-tone="pipelineStatusTone"
      :disabled="scripts.length === 0"
      disabled-hint="先添加分集剧本"
      :before-next="beforeNextStep" />
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import editScript from "./components/editScript.vue";
import addScript from "./components/addScript.vue";
import batchAddScript from "./components/batchAddScript.vue";
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
  router.push("/scriptAgent");
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

/** 前往角色场景前：选中的剧本若还没提取资产，先提取再走（提取失败则留在本页）。 */
async function beforeNextStep(): Promise<boolean> {
  const needExtract = selectedIds.value.filter((id) => {
    const item = scripts.value.find((s) => s.id === id);
    return item ? item.extractState !== 1 && item.extractState !== 0 : false;
  });
  if (needExtract.length === 0) return true;
  return await handleExtractAssets();
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

async function pollScriptAssets() {
  if (notCompletedData.value.length === 0) return;
  const ids = notCompletedData.value.map((item) => item.id);
  try {
    const { data } = await axios.post("/script/pollScriptAssets", { ids });
    if (data.length) {
      searchScripts();
    }
  } catch (e) {
    console.error("轮询事件状态失败:", e);
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
</script>

<style lang="scss" scoped>
.script {
  .smHead {
    margin-bottom: 32px;
  }

  /* 页面引导 */
  .guideBanner {
    margin-bottom: 20px;
    padding: 20px 24px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08));
    border: 1px solid rgba(102, 126, 234, 0.15);
    border-radius: 16px;
    .guideContent {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      .guideIcon {
        font-size: 32px;
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
          font-size: 16px;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 4px;
        }
        .guideDesc {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.5);
          line-height: 1.5;
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
    .guideNext {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 10px;
      border: 1px solid rgba(0, 0, 0, 0.04);
      .nextLabel {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.4);
        margin-bottom: 8px;
      }
      .nextSteps {
        display: flex;
        gap: 10px;
        .nextStep {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.6);
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.04);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          &:hover {
            background: rgba(102, 126, 234, 0.08);
            border-color: rgba(102, 126, 234, 0.2);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
          }
          .nextIcon {
            font-size: 20px;
          }
          .nextText {
            .nextTitle {
              font-size: 13px;
              font-weight: 600;
              color: #1a1a2e;
            }
            .nextDesc {
              font-size: 11px;
              color: rgba(0, 0, 0, 0.4);
            }
          }
        }
      }
    }
  }

  .scriptEntryGuide {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 14px;
    padding: 16px 20px;
    border: 1px solid #edcfb8;
    border-radius: 16px;
    background: linear-gradient(135deg, #fff8f1, #fffdfb);
  }

  .scriptEntryGuide strong { color: #4d382b; font-size: 14px; }
  .scriptEntryGuide p { margin: 5px 0 0; color: #8b776a; font-size: 12px; line-height: 1.5; }
  .scriptEntryActions { display: flex; flex: none; gap: 8px; }

  .actionBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    gap: 16px;
    margin-top: 1.25rem;
    padding: 16px 20px;
    background: var(--material-thin);
    backdrop-filter: var(--blur-heavy);
    -webkit-backdrop-filter: var(--blur-heavy);
    border: 1px solid var(--material-border-light);
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    .actionBar-left {
      gap: 10px;
      :deep(.t-input) {
        border-radius: 10px;
        background: var(--material-regular);
        backdrop-filter: var(--blur-light);
        -webkit-backdrop-filter: var(--blur-light);
        border: 1px solid var(--material-border-light);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        &:focus-within {
          border-color: #7b61ff;
          box-shadow: 0 0 0 3px rgba(123, 97, 255, 0.12);
          transform: translateY(-1px);
        }
      }
    }
    .actionBar-right {
      gap: 12px;
      .countBox {
        gap: 5px;
      }
    }
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
  }
  .contentArea {
    .scriptsList {
      gap: 16px;
      .scriptCard {
        position: relative;
        :deep(.t-card) {
          background: var(--material-thin);
          backdrop-filter: var(--blur-heavy);
          -webkit-backdrop-filter: var(--blur-heavy);
          border: 1px solid var(--material-border-light);
          border-radius: 16px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          &:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.15);
            border-color: rgba(123, 97, 255, 0.3);
          }
          .t-card__header {
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding: 14px 20px;
          }
          .t-card__body {
            padding: 14px 20px;
          }
          .t-card__title {
            font-weight: 600;
          }
        }
      }
      .content {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        overflow: hidden;
        -webkit-line-clamp: 1;
        font-size: 13px;
        color: rgba(0, 0, 0, 0.45);
      }
      .cardHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        .cardTitle {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
          font-weight: 600;
        }
        .cardCheckbox {
          flex-shrink: 0;
          margin-left: 12px;
        }
      }
      .assetTags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
        :deep(.t-tag) {
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(123, 97, 255, 0.08));
          border: 1px solid rgba(123, 97, 255, 0.15);
          color: #6366f1;
          font-size: 12px;
        }
      }
      .del {
        text-align: right;
        opacity: 0.4;
        transition: all 0.2s ease;
        &:hover {
          opacity: 1;
          color: #ef4444;
          transform: scale(1.1);
        }
      }
    }
    .emptyState {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 400px;
      background: var(--material-thin);
      backdrop-filter: var(--blur-heavy);
      -webkit-backdrop-filter: var(--blur-heavy);
      border: 1px solid var(--material-border-light);
      border-radius: 20px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      padding: 40px;
      .emptyContent {
        text-align: center;
        max-width: 480px;
        .emptyIcon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .emptyTitle {
          font-size: 20px;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 8px;
        }
        .emptyDesc {
          font-size: 14px;
          color: rgba(0, 0, 0, 0.5);
          margin-bottom: 24px;
        }
        .emptyActions {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 20px;
          :deep(.t-button) {
            border-radius: 12px;
            font-weight: 600;
            padding: 10px 20px;
            height: auto;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            &:hover {
              transform: translateY(-2px);
            }
            &.t-button--theme-primary {
              background: linear-gradient(135deg, #667eea, #764ba2);
              border: none;
              color: #fff;
              box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
              &:hover {
                box-shadow: 0 8px 24px rgba(102, 126, 234, 0.45);
              }
            }
          }
        }
        .emptyTip {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.4);
          line-height: 1.6;
          padding: 12px 16px;
          background: rgba(102, 126, 234, 0.04);
          border-radius: 10px;
          border: 1px solid rgba(102, 126, 234, 0.08);
        }
      }
    }
  }
}

/* TDesign 对话框苹果风 */
:deep(.t-dialog) {
  border-radius: 20px;
  background: var(--material-thick);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  border: 1px solid var(--material-border-medium);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  .t-dialog__header {
    font-weight: 600;
  }
}

/* 滚动条 */
:deep(.t-table) {
  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
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

.settingDialogContent {
  padding: 16px 0;
  .settingItem {
    gap: 12px;
    margin-bottom: 16px;
    &:last-child {
      margin-bottom: 0;
    }
    .settingLabel {
      white-space: nowrap;
      min-width: 80px;
    }
  }
}
.settingDialogFooter {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}
.script{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;padding:20px 34px 50px;background:linear-gradient(180deg,#fbfbfc,#f6f7fa)}.script .guideBanner{padding:20px 24px;border-radius:20px;background:linear-gradient(135deg,#f1f4ff,#f7f0ff 56%,#fff4ea);border-color:rgba(105,101,191,.13);box-shadow:0 12px 30px rgba(54,51,91,.06)}.script .guideBanner .guideContent .guideTitle{font-size:18px;color:#292b38}.script .guideBanner .guideContent .guideDesc{font-size:13px;color:#737682}.script .guideBanner .guideFlow,.script .guideBanner .guideNext{background:rgba(255,255,255,.72);border-radius:14px}.script .actionBar{padding:14px 16px;border-radius:18px;background:#fff;border-color:#e8e9ed;box-shadow:0 8px 24px rgba(37,40,57,.05)}.script .actionBar :deep(.t-button.t-button--theme-primary){background:#24252b;border-color:#24252b;box-shadow:0 8px 18px rgba(25,26,31,.13)}.script .contentArea .scriptsList .scriptCard :deep(.t-card){border-radius:20px;background:#fff;border-color:#e8e9ed;box-shadow:0 10px 28px rgba(37,40,57,.06)}
</style>

<style lang="scss">
.script {
  box-sizing:border-box; height:100%; overflow-y:auto; padding:22px 34px 50px !important;
  background:radial-gradient(circle at 92% 0,rgba(255,174,119,.16),transparent 22%),linear-gradient(180deg,#faf9fb,#f5f5f7) !important;
  .studioHeader { position:relative; min-height:145px; margin-bottom:14px; padding:26px 32px; overflow:hidden; border:1px solid rgba(89,76,148,.11); border-radius:24px; background:radial-gradient(circle at 86% 10%,rgba(255,151,91,.27),transparent 25%),linear-gradient(132deg,#fff,#f6f2ff 58%,#fff3ea); box-shadow:0 16px 40px rgba(58,49,99,.07); }
  .studioHeader>div:first-child { position:relative;z-index:2 }.studioHeader span{color:#e76c2d;font-size:10px;font-weight:750;letter-spacing:.17em}.studioHeader h1{margin:9px 0 6px;color:#292733;font-size:34px;letter-spacing:-.045em}.studioHeader p{margin:0;color:#777482;font-size:13px}.studioHeader small{display:inline-block;margin-top:13px;padding:6px 10px;border:1px solid rgba(103,94,143,.11);border-radius:999px;background:rgba(255,255,255,.65);color:#74717f}
  .studioHeaderArt { position:absolute; top:20px; right:6%; display:flex; flex-direction:column; justify-content:space-between; width:108px; height:112px; padding:15px; border-radius:18px; transform:rotate(7deg); background:linear-gradient(145deg,#ff9b61,#e75f42); color:#fff; box-shadow:0 16px 32px rgba(100,54,37,.18); }.studioHeaderArt i{font-size:9px;font-style:normal;letter-spacing:.14em}.studioHeaderArt b{font-size:32px;letter-spacing:-.06em}
  .actionBar { margin-bottom:14px; border:1px solid #e8e7ec !important; border-radius:17px !important; background:rgba(255,255,255,.88) !important; box-shadow:0 8px 22px rgba(42,39,58,.045) !important; }
  .t-button--theme-primary.t-button--variant-base:not(:disabled) { border-color:transparent !important; background:linear-gradient(135deg,#ff8847,#f26432) !important; color:#fff !important; box-shadow:0 7px 16px rgba(239,100,48,.18) !important; }
  .t-button--theme-primary.t-button--variant-base:not(:disabled) .t-button__text,.t-button--theme-primary.t-button--variant-base:not(:disabled) .t-icon { color:#fff !important; }
  .t-button--theme-primary.t-button--variant-outline:not(:disabled) { border-color:#f1a27e !important; background:#fff7f2 !important; color:#df5f29 !important; }.t-button--theme-primary.t-button--variant-outline:not(:disabled) .t-button__text,.t-button--theme-primary.t-button--variant-outline:not(:disabled) .t-icon{color:#df5f29 !important}
  .t-button:disabled { border-color:#e5e4e8 !important; background:#efeff1 !important; color:#9c9aa2 !important; box-shadow:none !important; }.t-button:disabled .t-button__text,.t-button:disabled .t-icon{color:#9c9aa2 !important}
  .contentArea .scriptsList .scriptCard .t-card { border:1px solid #e8e7ec !important; border-radius:19px !important; background:#fff !important; box-shadow:0 10px 27px rgba(40,37,54,.055) !important; }
}
</style>
