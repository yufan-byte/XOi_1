<template>
  <div class="cornerScape f">
    <!-- 左侧：批量生成面板 -->
    <div class="left">
      <t-card shadow class="card">
        <template #title>
          <div class="panelTitle">
            {{ $t("workbench.cornerScape.batchSettings") }}
            <t-tag size="small" theme="primary" variant="light">{{ dataList.length }}</t-tag>
          </div>
        </template>
        <p class="panelDesc">{{ $t("workbench.cornerScape.panelDesc") }}</p>
        <div class="scopeBar" :class="{ scoped: selectedIds.length > 0 }">
          <t-icon name="filter" />
          <span v-if="selectedIds.length > 0">{{ $t("workbench.cornerScape.scopeSelected", { count: selectedIds.length }) }}</span>
          <span v-else>{{ $t("workbench.cornerScape.scopeAll") }}</span>
        </div>
        <t-form labelAlign="top" class="paramForm">
          <t-form-item :label="$t('workbench.cornerScape.genModel')">
            <modelSelect v-model="selectValue" :type="`image`" />
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.resolution')">
            <t-select v-model="resolution" :placeholder="$t('workbench.cornerScape.resolutionPh')" :options="resolutionOptions"></t-select>
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.textPromptInput')">
            <t-textarea v-model="otherTextPrompt" :placeholder="$t('workbench.cornerScape.textPromptPh')"></t-textarea>
          </t-form-item>
        </t-form>
        <div class="panelActions">
          <div class="actionRow">
            <t-button theme="primary" variant="outline" block @click="batchGenerationPrompt">
              {{ $t("workbench.cornerScape.batchGenerationPrompt") }}
            </t-button>
            <t-button theme="primary" variant="outline" block @click="batchSelectBindAudio">
              {{ $t("workbench.cornerScape.batchBingAudio") }}
            </t-button>
          </div>
          <t-button theme="primary" block @click="batchGenerationImage">
            {{ $t("workbench.cornerScape.startBatch") }}
          </t-button>
        </div>
      </t-card>
    </div>
    <!-- 主内容区 -->
    <div class="content">
      <div class="contentHeader">
        <div class="pageTitleRow">
          <h2 class="pageTitle">{{ $t("workbench.menu.cornerScape") }}</h2>
          <p class="pageSubtitle">{{ $t("workbench.cornerScape.workbenchSubtitle") }}</p>
        </div>
        <div class="filterChips">
          <button class="chip" :class="{ active: activeFilter === '' }" @click="setFilter('')">
            {{ $t("workbench.cornerScape.filterAll") }}
            <span class="count">{{ dataList.length }}</span>
          </button>
          <button class="chip" :class="{ active: activeFilter === 'role' }" @click="setFilter('role')">
            {{ $t("workbench.cornerScape.filterRole") }}
            <span class="count">{{ typeCounts.role }}</span>
          </button>
          <button class="chip" :class="{ active: activeFilter === 'scene' }" @click="setFilter('scene')">
            {{ $t("workbench.cornerScape.filterScene") }}
            <span class="count">{{ typeCounts.scene }}</span>
          </button>
          <button class="chip" :class="{ active: activeFilter === 'tool' }" @click="setFilter('tool')">
            {{ $t("workbench.cornerScape.filterTool") }}
            <span class="count">{{ typeCounts.tool }}</span>
          </button>
          <button class="chip" :class="{ active: activeFilter === 'needHandle' }" @click="setFilter('needHandle')">
            {{ $t("workbench.cornerScape.needHandle") }}
            <span class="count">{{ needHandleCount }}</span>
          </button>
        </div>
        <div class="selectionBar">
          <t-tag size="medium" theme="primary" variant="light" v-if="selectedIds.length > 0">
            {{ $t("workbench.cornerScape.selectedChips", { count: selectedIds.length }) }}
          </t-tag>
          <t-dropdown :options="smartSelectOptions" trigger="click" @click="onSmartSelect">
            <t-button size="medium" theme="default" variant="outline">
              {{ $t("workbench.cornerScape.smartSelect") }}
              <template #icon><t-icon name="caret-down-small" /></template>
            </t-button>
          </t-dropdown>
          <t-image-viewer :images="previewImages" :closeOnEscKeydown="true" :closeOnOverlay="true">
            <template #trigger="{ open }">
              <t-button size="medium" theme="default" variant="outline" :disabled="!hasPreviewImages" @click="hasPreviewImages && open()">
                {{ $t("workbench.cornerScape.batchPreview") }}
              </t-button>
            </template>
          </t-image-viewer>
        </div>
      </div>
      <div class="grid" :class="{ withDock: selectedIds.length > 0 }">
          <t-card
          v-show="dataList.length > 0"
          shadow
          class="card"
          v-for="item in paginatedDisplayList"
          :key="item.id"
          :class="{ selected: selectedIds.includes(item.id) }"
          @click="openDrawer(item)">
          <div class="imageBox">
            <t-checkbox class="selectBox" :checked="selectedIds.includes(item.id)" @click.stop @change="toggleSelect(item.id)" />
            <div class="statusBadge" :class="statusBadge(item).cls">
              <t-loading size="14px" class="badgeLoading" v-if="statusBadge(item).loading" />
              <i class="dot" v-else></i>
              {{ statusBadge(item).label }}
            </div>
            <div class="cancelGeneration" @click.stop="cancelGenerationFn(item)" v-if="item.state === '生成中'">
              <t-tag theme="danger" size="small">
                {{ $t("workbench.cornerScape.cancelGeneration") }}
              </t-tag>
            </div>
            <t-empty v-if="!item.state && item.promptState !== '生成中'" type="maintenance" :title="$t('workbench.cornerScape.waitingGen')" />
            <div v-else-if="item.state === '生成中' || item.promptState === '生成中' || item.audioBindState == '生成中'" class="generatingBox">
              <t-loading />
              <span class="generatingText">
                {{ item.audioBindState === "生成中" ? $t("workbench.cornerScape.audioState") : $t("workbench.cornerScape.generating") }}
              </span>
            </div>
            <t-popup :content="item.errorReason" v-else-if="item.state === '生成失败'">
              <t-empty type="fail" :title="$t('workbench.cornerScape.genFailed')" />
            </t-popup>
            <t-image v-else class="image" :src="item.filePath ?? undefined" fit="contain" :preview="true" :lazy="true">
              <template #error>
                <t-empty type="fail" :title="$t('workbench.cornerScape.imageError')" />
              </template>
              <template #overlayContent>
                <div class="imageToolsWrap">
                  <ImageTools :src="item.filePath!" position="br" />
                </div>
              </template>
            </t-image>
          </div>
          <div class="infoBox">
            <div class="titleRow">
              <span class="name">{{ item.name }}</span>
              <t-tag size="small" variant="light" theme="warning" class="typeTag">{{ typeName(item.type) }}</t-tag>
            </div>
            <p class="desc" :class="{ empty: !item.describe }">{{ item.describe || $t("workbench.cornerScape.noDescription") }}</p>
            <div class="metaRow">
              <span class="metaLeft" v-if="item.model">{{ item.model }}<template v-if="item.resolution"> · {{ item.resolution }}</template></span>
              <span v-else></span>
              <span class="promptLink ready" v-if="item.prompt">{{ $t("workbench.cornerScape.promptReady") }}</span>
              <span class="promptLink pending" v-else @click.stop="openDrawer(item)">{{ $t("workbench.cornerScape.promptPending") }}</span>
            </div>
            <div class="audioTags" v-if="item.relepedAudio.length">
              <t-tag v-for="audio in item.relepedAudio" :key="audio.id" size="small" variant="outline" theme="primary">{{ audio.name }}</t-tag>
            </div>
          </div>
        </t-card>
        <t-empty
          v-if="displayList.length === 0"
          type="empty"
          :title="dataList.length === 0 ? $t('workbench.cornerScape.operateScriptFirst') : $t('workbench.cornerScape.filterEmpty')" />
      </div>
      <div v-if="displayList.length > pageSize" class="paginationBar">
        <t-pagination v-model="currentPage" :total="displayList.length" :page-size="pageSize" :show-page-size="false" />
      </div>
      <t-drawer :closeBtn="true" closeOnEscKeydown :showOverlay="false" :footer="false" v-model:visible="drawerVisible" size="480px">
        <template #header>
          <div class="drawerHeader">
            <span>{{ currentItem?.name }} - {{ $t("workbench.cornerScape.individualConfig") }}</span>
            <t-tag size="medium" variant="light-outline" theme="warning">
              {{
                currentItem?.type === "role"
                  ? $t("workbench.cornerScape.typeRole")
                  : currentItem?.type === "scene"
                    ? $t("workbench.cornerScape.typeScene")
                    : currentItem?.type === "tool"
                      ? $t("workbench.cornerScape.typeTool")
                      : $t("workbench.cornerScape.typeUnknown")
              }}
            </t-tag>
          </div>
        </template>
        <div v-if="currentItem" class="drawerImageBox">
          <t-empty v-if="!currentItem.state" type="maintenance" :title="$t('workbench.cornerScape.waitingGen')" />
          <div v-else-if="currentItem.state === '生成中'" class="generatingBox">
            <t-loading />
            <span class="generatingText">{{ $t("workbench.cornerScape.generating") }}</span>
          </div>
          <t-empty v-else-if="currentItem.state === '生成失败'" type="fail" :title="$t('workbench.cornerScape.genFailed')" />
          <t-image v-else-if="currentItem.filePath" class="image" :src="currentItem.filePath" fit="contain">
            <template #error>
              <t-empty type="fail" :title="$t('workbench.cornerScape.imageError')" />
            </template>
            <template #overlayContent>
              <div class="imageToolsWrap show">
                <ImageTools :src="currentItem.filePath!" position="br" />
              </div>
            </template>
          </t-image>
          <t-empty v-else type="maintenance" :title="$t('workbench.cornerScape.noImage')" />
        </div>
        <t-form v-if="currentItem" labelAlign="top">
          <t-form-item :label="$t('workbench.cornerScape.history')">
            <div class="historyImageList f">
              <div
                v-for="item in currentItem.historyImages"
                :key="item.id"
                class="historyImageItem"
                :class="{ selected: selectedHistoryId === item.id }"
                @click.stop="toggleHistorySelect(item.id)">
                <t-image :src="item.filePath" :style="{ width: '100px', minWidth: '100px', height: '100px' }" :lazy="true" fit="contain" />
              </div>
            </div>
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.genModel')">
            <modelSelect v-model="selectValue" :type="`image`" />
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.resolution')">
            <t-select v-model="editForm.resolution" :placeholder="$t('workbench.cornerScape.resolutionPh')" :options="resolutionOptions" />
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.promptLabel')">
            <t-loading style="width: 100%" :loading="currentItem.promptState == '生成中'">
              <t-textarea
                v-model="editForm.prompt"
                :placeholder="$t('workbench.cornerScape.promptPh')"
                :autosize="{ minRows: 4, maxRows: 10 }"
                :disabled="polishing"
                @blur="savePromptOnBlur" />
            </t-loading>
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.assetsAudioLabel')">
            <div>
              <div>
                <t-button size="small" theme="primary" variant="outline" @click="selectAudio">
                  <template #icon><i-plus /></template>
                  {{ $t("workbench.cornerScape.selectAudio") }}
                </t-button>
              </div>
              <div class="audioList ac w" v-if="editForm.relepedAudio.length">
                <t-tag v-for="audio in editForm.relepedAudio" :key="audio.id" closable variant="light-outline" @close="removeAudio(audio.id)">
                  {{ audio.name }}
                </t-tag>
              </div>
              <div v-else class="assets-empty">{{ $t("workbench.cornerScape.noAudio") }}</div>
            </div>
          </t-form-item>
          <t-form-item>
            <div class="drawerActions">
              <t-button
                theme="default"
                variant="outline"
                :loading="polishing"
                @click="polishPrompts"
                :disabled="currentItem.promptState == '生成中' ? true : false">
                <template #icon><t-icon name="edit" /></template>
                {{ $t("workbench.cornerScape.aiPolish") }}
              </t-button>
              <t-button theme="primary" @click="regenerateItem" :disabled="currentItem.state == '生成中' ? true : false">
                <template #icon><t-icon name="refresh" /></template>
                {{ $t("workbench.cornerScape.regenerate") }}
              </t-button>
            </div>
          </t-form-item>
        </t-form>
      </t-drawer>
    </div>
    <!-- 右下角：交付托盘 -->
    <transition name="dockUp">
      <div class="deliveryDock" v-if="selectedIds.length > 0">
        <div class="dockLeft">
          <div class="dockInfo">
            <span class="dockTitle">{{ $t("workbench.cornerScape.deliveryTray") }}</span>
            <span class="dockCount" :class="{ none: deliverableItems.length === 0 }">
              <i class="dot"></i>
              {{ $t("workbench.cornerScape.deliverableCount", { count: deliverableItems.length, total: selectedIds.length }) }}
            </span>
          </div>
          <div class="dockThumbs">
            <div class="thumb" v-for="img in deliverableItems" :key="img.id">
              <img :src="img.filePath" :alt="img.name" />
              <span class="thumbClose" @click.stop="toggleSelect(img.id)">
                <t-icon name="close" />
              </span>
            </div>
            <span class="dockEmptyTip" v-if="deliverableItems.length === 0">{{ $t("workbench.cornerScape.trayEmptyImage") }}</span>
          </div>
        </div>
        <div class="dockActions">
          <t-button theme="default" variant="outline" @click="clearSelection">{{ $t("workbench.cornerScape.clearTray") }}</t-button>
          <t-button theme="primary" :disabled="deliverableItems.length === 0" @click="sendSelectedToCanvas">
            <template #icon><t-icon name="send" /></template>
            {{ $t("workbench.cornerScape.sendToCanvasCount", { count: deliverableItems.length }) }}
          </t-button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import modelSelect from "@/components/modelSelect.vue";
import settingStore from "@/stores/setting";
import openAssetsSelector from "@/utils/assetsCheck";
import { sendToCanvas } from "@/utils/sendToCanvas";
import { showPointsToast } from "@/utils/pointsToast";

const { otherSetting } = storeToRefs(settingStore());
interface Image {
  filePath: string;
  id: number;
}
interface DataItem {
  id: number;
  imageId: number;
  type: string;
  name: string;
  prompt: string;
  filePath: string | null;
  state: string;
  model: string;
  resolution: string;
  describe: string;
  promptState: string;
  historyImages: Image[];
  errorReason: string;
  promptErrorReason: string;
  relepedAudio: { id: number; name: string }[];
  audioBindState: string;
}

const activeFilter = ref(""); // ''=全部 / role / scene / tool / needHandle
const { project } = storeToRefs(projectStore());
const selectValue = ref(project.value?.imageModel ?? "");
const resolution = ref("1K");
const otherTextPrompt = ref("");
const resolutionOptions = [
  { label: "1K", value: "1K" },
  { label: "2K", value: "2K" },
  { label: "4K", value: "4K" },
];
const dataList = ref<DataItem[]>([]);
const loading = ref(false);

// 用于取消进行中的生成请求
let abortController: AbortController | null = null;

function createAbortController() {
  abortController?.abort();
  abortController = new AbortController();
  return abortController;
}

onMounted(async () => {
  await getFilteredData();
  checkCanvasSaveResult();
});

onUnmounted(() => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  stopPolling();
  stopImagePolling();
  stopAudioPolling();
  // 将所有"生成中"的项重置为空状态
  dataList.value.forEach((item) => {
    if (item.state === "生成中") item.state = "";
  });
});
function setFilter(filter: string) {
  activeFilter.value = filter;
}
async function getFilteredData() {
  try {
    loading.value = true;
    // 始终拉全量，类型/待处理筛选由前端 computed 过滤
    const { data } = await axios.post("/cornerScape/getAllAssets", {
      projectId: project.value?.id,
      type: [],
    });
    dataList.value = data;
    syncSelectedIdsWithData();
  } catch (error) {
    console.error("加载资产数据失败:", error);
    dataList.value = [];
    selectedIds.value = [];
  } finally {
    loading.value = false;
  }
}

const selectedIds = ref<number[]>([]);

// 筛选 chips 计数
const typeCounts = computed(() => ({
  role: dataList.value.filter((i) => i.type === "role").length,
  scene: dataList.value.filter((i) => i.type === "scene").length,
  tool: dataList.value.filter((i) => i.type === "tool").length,
}));
const isNeedHandle = (item: DataItem) => !item.state || item.state === "生成失败" || !item.prompt?.trim();
const needHandleCount = computed(() => dataList.value.filter(isNeedHandle).length);
// 网格渲染列表（按 chips 过滤）
const displayList = computed(() => {
  if (activeFilter.value === "") return dataList.value;
  if (activeFilter.value === "needHandle") return dataList.value.filter(isNeedHandle);
  return dataList.value.filter((i) => i.type === activeFilter.value);
});
const currentPage = ref(1);
const pageSize = 12;
const paginatedDisplayList = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return displayList.value.slice(start, start + pageSize);
});
watch(activeFilter, () => {
  currentPage.value = 1;
});
watch(() => displayList.value.length, (length) => {
  const lastPage = Math.max(1, Math.ceil(length / pageSize));
  if (currentPage.value > lastPage) currentPage.value = lastPage;
});
// 交付托盘：勾选中已有图片的项
const deliverableItems = computed(() =>
  dataList.value.filter((i): i is DataItem & { filePath: string } => selectedIds.value.includes(i.id) && !!i.filePath),
);

// 卡片类型名
function typeName(type: string) {
  return type === "role"
    ? $t("workbench.cornerScape.typeRole")
    : type === "scene"
      ? $t("workbench.cornerScape.typeScene")
      : type === "tool"
        ? $t("workbench.cornerScape.typeTool")
        : $t("workbench.cornerScape.typeUnknown");
}
// 卡片状态徽章
function statusBadge(item: DataItem): { label: string; cls: string; loading: boolean } {
  if (item.state === "生成中" || item.promptState === "生成中" || item.audioBindState === "生成中") {
    return { label: $t("workbench.cornerScape.generating"), cls: "generating", loading: true };
  }
  if (item.state === "生成失败") return { label: $t("workbench.cornerScape.genFailed"), cls: "failed", loading: false };
  if (item.state === "已完成") return { label: $t("workbench.cornerScape.stateDone"), cls: "done", loading: false };
  return { label: $t("workbench.cornerScape.waitingGen"), cls: "waiting", loading: false };
}

// 智能选择下拉
const smartSelectOptions = computed(() => [
  { content: $t("workbench.cornerScape.selectAll"), value: "all" },
  { content: $t("workbench.cornerScape.selectPromptEmpty"), value: "promptEmpty" },
  { content: $t("workbench.cornerScape.selectUngenerated"), value: "ungenerated" },
  { content: $t("workbench.cornerScape.selectGenerated"), value: "generated" },
  { content: $t("workbench.cornerScape.selectFailed"), value: "failed" },
  { content: $t("workbench.cornerScape.invertSelection"), value: "invert" },
  { content: $t("workbench.cornerScape.clearSelection"), value: "clear" },
]);
function onSmartSelect(option: { value?: string | number | Record<string, any> }) {
  switch (String(option.value)) {
    case "all":
      selectAll();
      break;
    case "promptEmpty":
      selectPromptEmpty();
      break;
    case "ungenerated":
      selectByState("");
      break;
    case "generated":
      selectByState("已完成");
      break;
    case "failed":
      selectByState("生成失败");
      break;
    case "invert":
      toggleSelectAll();
      break;
    case "clear":
      clearSelection();
      break;
  }
}

function syncSelectedIdsWithData() {
  const visibleIds = new Set(dataList.value.map((item) => item.id));
  selectedIds.value = Array.from(new Set(selectedIds.value)).filter((id) => visibleIds.has(id));
}

const previewImages = computed((): string[] => {
  const selectedImageList = dataList.value
    .filter((item) => selectedIds.value.includes(item.id) && item.filePath)
    .map((item) => item.filePath as string);

  if (selectedImageList.length > 0) {
    return selectedImageList;
  }

  return dataList.value.filter((item) => item.filePath).map((item) => item.filePath as string);
});

const hasPreviewImages = computed(() => previewImages.value.length > 0);

const toggleSelect = (id: number) => {
  const idx = selectedIds.value.indexOf(id);
  if (idx === -1) selectedIds.value.push(id);
  else selectedIds.value.splice(idx, 1);
};

const selectByState = (state: string) => {
  selectedIds.value = displayList.value.filter((item) => (state === "" ? !item.state : item.state === state)).map((item) => item.id);
};
//全选提示词为空的
function selectPromptEmpty() {
  const lite = displayList.value.filter((item) => !item.prompt || item.prompt.trim() === "").map((item) => item.id);
  if (lite.length === 0) {
    window.$message.warning($t("workbench.cornerScape.noEmptyPrompt"));
    return;
  }
  selectedIds.value = lite;
  window.$message.success($t("workbench.cornerScape.selectedCount", { count: selectedIds.value.length }));
}

function selectAll() {
  selectedIds.value = displayList.value.map((item) => item.id);
}

// 反选：在当前筛选可见范围内取反，隐藏项保持原状
function toggleSelectAll() {
  const visible = new Set(displayList.value.map((item) => item.id));
  selectedIds.value = dataList.value
    .filter((item) => (visible.has(item.id) ? !selectedIds.value.includes(item.id) : selectedIds.value.includes(item.id)))
    .map((item) => item.id);
}
function clearSelection() {
  selectedIds.value = [];
}

// 批量发送选中资产到画布（交付托盘统一出口）
function sendSelectedToCanvas() {
  const selectedItems = dataList.value.filter(item => selectedIds.value.includes(item.id) && item.filePath)
  if (selectedItems.length === 0) {
    window.$message.warning('请先选择有图片的资产')
    return
  }
  sendToCanvas(selectedItems.map(item => ({
    src: item.filePath!,
    name: item.name,
    id: item.id
  })), { from: "cornerScape" })
}

// 检查画布保存的结果
async function checkCanvasSaveResult() {
  try {
    const raw = localStorage.getItem('canvas_save_result');
    if (!raw) return;
    const result = JSON.parse(raw);
    // 检查是否是最近 5 分钟内的结果
    if (Date.now() - result.timestamp > 5 * 60 * 1000) {
      localStorage.removeItem('canvas_save_result');
      return;
    }
    // 清除结果（避免重复处理）
    localStorage.removeItem('canvas_save_result');
    if (!result.images || result.images.length === 0) return;
    // 显示提示
    window.$message?.success(`已从画布返回 ${result.images.length} 张图片，正在更新...`);
    // 更新资产图片（替换原有图片，或新增到历史）
    for (const img of result.images) {
      if (!img.id || !img.src) continue;
      // 规范化 URL：去掉域名和 ?size= 参数，去掉 /oss/ 前缀（getFileUrl 会加回来）
      let filePath = img.src;
      try {
        const parsed = new URL(filePath, window.location.origin);
        filePath = parsed.pathname; // 去掉 query 参数（如 ?size=20）
      } catch { /* 已经是相对路径，直接用 */ }
      // 去掉 /oss/ 前缀，因为 getSmallImageUrl → getFileUrl 会自动加上
      if (filePath.startsWith('/oss/')) filePath = filePath.slice(4); // /oss/xxx → /xxx
      try {
        const { data } = await axios.post('/assetsGenerate/saveCanvasResult', {
          id: img.id,
          filePath
        });
        // 更新本地数据
        const item = dataList.value.find(i => i.id === img.id);
        if (item && data.imageId) {
          // 添加到历史图片
          if (!item.historyImages) item.historyImages = [];
          item.historyImages.unshift({ id: data.imageId, filePath });
          // 更新当前显示图片
          item.filePath = filePath;
          item.imageId = data.imageId;
        }
      } catch (e) {
        console.error('保存画布结果失败:', e);
      }
    }
    window.$message?.success('画布结果已保存');
  } catch (e) {
    console.error('检查画布保存结果失败:', e);
    localStorage.removeItem('canvas_save_result');
  }
}

//取消生成
async function cancelGenerationFn(item: DataItem) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmCancellation"),
    body: $t("workbench.assets.confirmAgain"),
    confirmBtn: $t("workbench.assets.sure"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        const { data } = await axios.post("/cornerScape/getAllAssets", {
          projectId: project.value?.id,
          type: [],
        });
        const freshItem = (data as DataItem[]).find((d) => d.id === item.id);
        if (!freshItem || !freshItem.imageId) {
          window.$message.warning($t("workbench.cornerScape.noGenerating"));
          return;
        }
        await axios.post("/assetsGenerate/cancelGenerate", {
          id: freshItem.imageId,
        });
        window.$message.success($t("workbench.cornerScape.cancelGeneration") + " " + item.name);
      } catch (e: any) {
        window.$message.error(e.message ?? $t("workbench.cornerScape.cancelGeneration") + "失败");
      } finally {
        getFilteredData();
        dialog.destroy();
      }
    },
  });
}

// Drawer
const drawerVisible = ref(false);
const currentItem = ref<DataItem | null>(null);
const selectedHistoryId = ref<number | null>(null);

async function toggleHistorySelect(id: number) {
  selectedHistoryId.value = selectedHistoryId.value === id ? null : id;
  if (!currentItem.value) return;
  const selectedImage = currentItem.value.historyImages.find((img) => img.id === selectedHistoryId.value);
  try {
    await axios.post("/assets/saveAssets", {
      id: currentItem.value.id,
      type: currentItem.value.type,
      projectId: project.value?.id,
      prompt: currentItem.value.prompt,
      imageId: selectedImage?.id,
    });
    //拿选中的图片替换当前图片
    if (selectedImage) {
      currentItem.value.filePath = selectedImage.filePath;
      currentItem.value.state = "已完成";
    }
    getFilteredData();
    window.$message.success($t("workbench.cornerScape.msg.replaceSuccess"));
  } catch (e) {
    window.$message.error($t("workbench.cornerScape.msg.replaceFailed"));
    return;
  }
}

const editForm = reactive({
  assetsId: 0,
  model: "",
  type: "",
  resolution: "",
  prompt: "",
  name: "",
  describe: "",
  promptState: "",
  relepedAudio: [] as { id: number; name: string }[],
});

async function openDrawer(item: DataItem) {
  if (item.state == "生成中") return;
  selectedHistoryId.value = null;
  // 先用当前数据打开抽屉
  editForm.assetsId = item.id;
  editForm.name = item.name || "";
  editForm.type = item.type || "";
  editForm.model = item.model || "";
  currentItem.value = item;
  editForm.resolution = item.resolution || "";
  editForm.prompt = item.prompt || "";
  editForm.describe = item.describe || "";
  editForm.promptState = item.promptState;
  editForm.relepedAudio = item?.relepedAudio ?? [];

  drawerVisible.value = true;
  // 重新获取最新数据（含历史图片）
  try {
    const { data } = await axios.post("/cornerScape/getAllAssets", {
      projectId: project.value?.id,
      type: [],
    });
    const freshItem = (data as DataItem[]).find((d) => d.id === item.id);
    if (freshItem) {
      // 更新 dataList 中对应项
      const idx = dataList.value.findIndex((d) => d.id === item.id);
      if (idx !== -1) dataList.value[idx] = freshItem;
      // 更新当前抽屉项
      currentItem.value = freshItem;
      editForm.prompt = freshItem.prompt || editForm.prompt;
      editForm.resolution = freshItem.resolution || editForm.resolution;
    }
  } catch (e) {
    console.error("刷新资产详情失败:", e);
  }
}

function setItemState(id: number, state: string) {
  const item = dataList.value.find((i) => i.id === id);
  if (item) item.state = state;
  if (currentItem.value?.id === id) currentItem.value.state = state;
}

function regenerateItem() {
  if (!currentItem.value) return;
  if (!selectValue.value) {
    window.$message.warning($t("workbench.cornerScape.msg.selectModel"));
    return;
  }
  if (!editForm.resolution) {
    window.$message.warning($t("workbench.cornerScape.msg.selectResolution"));
    return;
  }
  if (!editForm.prompt.trim()) {
    window.$message.warning($t("workbench.cornerScape.msg.enterPrompt"));
    return;
  }
  const item = currentItem.value;
  setItemState(item.id, "生成中");
  drawerVisible.value = false;
  const controller = createAbortController();
  axios
    .post(
      "/assetsGenerate/generateAssets",
      {
        type: item.type ?? "props",
        projectId: project.value?.id,
        name: item.name ?? $t("workbench.cornerScape.unnamed"),
        base64: "",
        prompt: editForm.prompt,
        model: selectValue.value,
        id: item.id,
        resolution: editForm.resolution,
        concurrentCount: 1,
      },
      { signal: controller.signal },
    )
    .then(async (res) => {
      window.$message.success($t("workbench.cornerScape.msg.genSuccess", { name: item.name }));
      if (res?.data?.pointsDeducted) {
        showPointsToast(res.data.pointsDeducted, res.data.balance);
      }
      await getFilteredData();
    })
    .catch((e: any) => {
      if (e.name === "CanceledError" || e.code === "ERR_CANCELED") return;
      window.$message.error(e.message ?? $t("workbench.cornerScape.msg.genFailed", { name: item.name }));
      setItemState(item.id, "生成失败");
    });
}

// 提示词失焦保存
async function savePromptOnBlur() {
  if (!currentItem.value) return;
  // 内容没有变化则不保存
  if (editForm.prompt === currentItem.value.prompt) return;
  try {
    await axios.post("/assets/saveAssets", {
      id: currentItem.value.id,
      type: currentItem.value.type,
      projectId: project.value?.id,
      prompt: editForm.prompt,
    });
    // 同步更新本地数据
    currentItem.value.prompt = editForm.prompt;
    const target = dataList.value.find((d) => d.id === currentItem.value!.id);
    if (target) target.prompt = editForm.prompt;
    window.$message.success($t("workbench.cornerScape.msg.saveSuccess"));
  } catch (e) {
    window.$message.error($t("workbench.cornerScape.msg.saveFailed"));
  }
}

// AI 润色
const polishing = ref(false);
async function polishPrompts() {
  if (!editForm.prompt.trim()) {
    window.$message.warning($t("workbench.cornerScape.msg.enterPromptFirst"));
    return;
  }
  polishing.value = true;
  try {
    const { data } = await axios.post("/assetsGenerate/polishAssetsPrompt", {
      projectId: project.value?.id,
      assetsId: editForm.assetsId,
      type: editForm.type ?? "props",
      name: editForm.name,
      describe: editForm.describe,
    });
    window.$message.success($t("workbench.cornerScape.msg.promptGenSuccess"));
    if (data?.data?.pointsDeducted) {
      showPointsToast(data.data.pointsDeducted, data.data.balance);
    }
    if (data?.assetsId === editForm.assetsId) {
      editForm.prompt = data.prompt;
    }
    getFilteredData();
  } catch (e) {
    window.$message.error((e as any)?.message ?? $t("workbench.cornerScape.msg.polishFailed"));
  } finally {
    polishing.value = false;
  }
}
//批量生成提示词
async function batchGenerationPrompt() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastOne"));
    return;
  }

  const items = dataList.value.filter((item) => selectedIds.value.includes(item.id));

  // 前端先将所有选中项的 promptState 标记为"生成中"，让轮询自动接管状态跟踪
  items.forEach((item) => {
    item.promptState = "生成中";
  });

  // 清除已选中的项
  selectedIds.value = [];

  try {
    await axios.post("/assetsGenerate/batchPolishAssetsPrompt", {
      projectId: project.value?.id,
      items: items.map((item) => ({
        assetsId: item.id,
        type: item.type ?? "props",
        name: item.name,
        describe: item.describe,
      })),
      concurrentCount: otherSetting.value.assetsBatchGenereateSize,
      otherTextPrompt: otherTextPrompt.value,
    });
  } catch (e: any) {
    window.$message.error(e?.message ?? $t("workbench.cornerScape.msg.promptGenFail"));
    // 生成失败时重置 promptState
    items.forEach((item) => {
      const target = dataList.value.find((row) => row.id === item.id);
      if (target) target.promptState = "";
    });
  }
}
//绑定音频
async function batchSelectBindAudio() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastBindOne"));
    return;
  }

  const items = dataList.value.filter((item) => selectedIds.value.includes(item.id));

  // 前端先将所有选中项的 promptState 标记为"生成中"，让轮询自动接管状态跟踪
  items.forEach((item) => {
    item.audioBindState = "生成中";
  });

  // 清除已选中的项
  selectedIds.value = [];

  try {
    await axios.post("/cornerScape/batchBindAudio", {
      projectId: project.value?.id,
      assetsIds: items.map((item) => item.id),
      concurrentCount: otherSetting.value.assetsBatchGenereateSize,
    });
  } catch (e: any) {
    window.$message.error(e.message ?? $t("workbench.cornerScape.msg.promptGenFail"));
    // 生成失败时重置 audioBindState
    items.forEach((item) => {
      const target = dataList.value.find((row) => row.id === item.id);
      if (target) target.audioBindState = "";
    });
  }
}
// 批量生成图片
async function batchGenerationImage() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastOne"));
    return;
  }
  if (!selectValue.value) {
    window.$message.warning($t("workbench.cornerScape.msg.selectModel"));
    return;
  }
  if (!resolution.value) {
    window.$message.warning($t("workbench.cornerScape.msg.selectResolution"));
    return;
  }

  const items = dataList.value.filter((item) => selectedIds.value.includes(item.id));
  //检查如果勾选的数据prompt有空的，提示用户勾选的哪一个提示词未生成，然后终止批量生成
  const emptyPrompts = items.filter((item) => !item.prompt);
  if (emptyPrompts.length > 0) {
    const emptyPromptNames = emptyPrompts.map((item) => item.name).join(", ");
    window.$message.warning(
      $t("workbench.cornerScape.msg.emptyPrompt", {
        emptyPromptNames,
      }),
    );
    return;
  }

  // 前端先将所有选中项标记为"生成中"
  items.forEach((item) => setItemState(item.id, "生成中"));

  window.$message.success(
    $t("workbench.cornerScape.msg.batchStarted", { count: items.length, concurrent: otherSetting.value.assetsBatchGenereateSize }),
  );

  try {
    await axios.post("/assetsGenerate/batchGenerateImageAssets", {
      projectId: project.value?.id,
      model: selectValue.value,
      resolution: resolution.value,
      concurrentCount: otherSetting.value.assetsBatchGenereateSize,
      items: items.map((item) => ({
        id: item.id,
        type: item.type ?? "props",
        name: item.name ?? $t("workbench.cornerScape.unnamed"),
        prompt: item.prompt,
      })),
    });
    selectedIds.value = [];
  } catch (e: any) {
    if (e.name === "CanceledError" || e.code === "ERR_CANCELED") return;
    window.$message.error(e.message ?? $t("workbench.cornerScape.msg.batchFailed"));
  }
}
//轮询
const notCompultedData = computed(() => {
  return dataList.value.filter((item) => item.promptState == "生成中");
});
const generatingData = computed(() => {
  return dataList.value.filter((item) => item.state === "生成中");
});
const audioBindData = computed(() => {
  return dataList.value.filter((item) => item.audioBindState === "生成中");
});
// 轮询相关
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let imagePollingTimer: ReturnType<typeof setInterval> | null = null;
let audioBindPollingTimer: ReturnType<typeof setInterval> | null = null;

//轮询提示词生成
async function pollingPromptAssets() {
  if (notCompultedData.value.length === 0) return;
  const ids = notCompultedData.value.map((item) => item.id);
  try {
    const { data } = await axios.post("/assets/pollingPromptAssets", { ids });
    let hasCompleted = false;
    if (Array.isArray(data) && data.length) {
      data.forEach((item: { id: number; promptState: string; prompt: string }) => {
        const target = dataList.value.find((row) => row.id === item.id);
        if (target) {
          if (target.promptState === "生成中" && item.promptState !== "生成中") hasCompleted = true;
          target.promptState = item.promptState;
          if (item.prompt !== undefined) target.prompt = item.prompt;
        }
      });
    }
    // 有提示词生成完成时，重新获取完整数据以刷新 historyImages
    if (hasCompleted) {
      try {
        const { data: freshData } = await axios.post("/cornerScape/getAllAssets", {
          projectId: project.value?.id,
          type: [],
        });
        (freshData as DataItem[]).forEach((fresh) => {
          const target = dataList.value.find((row) => row.id === fresh.id);
          if (target) target.historyImages = fresh.historyImages;
        });
        // 同步更新抽屉中的当前项
        if (currentItem.value) {
          const freshCurrent = (freshData as DataItem[]).find((d) => d.id === currentItem.value!.id);
          if (freshCurrent) currentItem.value.historyImages = freshCurrent.historyImages;
        }
      } catch (e) {
        console.error("刷新历史图片失败:", e);
      }
    }
  } catch (e) {
    console.error("轮询提示词状态失败:", e);
  }
}
//轮询图片生成
async function pollingImageAssets() {
  if (generatingData.value.length === 0) return;
  const ids = generatingData.value.map((item) => item.id);
  try {
    const { data } = await axios.post("/assets/pollingImageAssets", { ids });
    let hasCompleted = false;
    if (Array.isArray(data) && data.length) {
      data.forEach((item: { id: number; state: string; filePath: string }) => {
        const target = dataList.value.find((row) => row.id === item.id);
        if (target) {
          if (target.state === "生成中" && item.state !== "生成中") hasCompleted = true;
          target.state = item.state;
          if (item.filePath !== undefined) target.filePath = item.filePath;
        }
      });
    }
    // 有图片生成完成时，重新获取完整数据以刷新 historyImages
    if (hasCompleted) {
      try {
        const { data: freshData } = await axios.post("/cornerScape/getAllAssets", {
          projectId: project.value?.id,
          type: [],
        });
        (freshData as DataItem[]).forEach((fresh) => {
          const target = dataList.value.find((row) => row.id === fresh.id);
          if (target) target.historyImages = fresh.historyImages;
        });
        // 同步更新抽屉中的当前项
        if (currentItem.value) {
          const freshCurrent = (freshData as DataItem[]).find((d) => d.id === currentItem.value!.id);
          if (freshCurrent) currentItem.value.historyImages = freshCurrent.historyImages;
        }
      } catch (e) {
        console.error("刷新历史图片失败:", e);
      }
    }
  } catch (e) {
    console.error("轮询图片生成状态失败:", e);
  }
}
//轮询音频绑定生成
async function pollingAudioBind() {
  if (audioBindData.value.length === 0) return;
  const ids = audioBindData.value.map((item) => item.id);
  try {
    const { data } = await axios.post("/cornerScape/pollingAudio", { ids });
    let hasCompleted = false;
    if (Array.isArray(data) && data.length) {
      data.forEach((item: { id: number; audioBindState: string; filePath: string }) => {
        const target = dataList.value.find((row) => row.id === item.id);
        if (target) {
          if (target.audioBindState === "生成中" && item.audioBindState !== "生成中") hasCompleted = true;
          target.audioBindState = item.audioBindState;
          if (item.filePath !== undefined) target.filePath = item.filePath;
        }
      });
    }
    if (hasCompleted) {
      try {
        const { data: freshData } = await axios.post("/cornerScape/getAllAssets", {
          projectId: project.value?.id,
          type: [],
        });
        (freshData as DataItem[]).forEach((fresh) => {
          const target = dataList.value.find((row) => row.id === fresh.id);
          if (target) target.relepedAudio = fresh.relepedAudio;
        });
        // 同步更新抽屉中的当前项
        if (currentItem.value) {
          const freshCurrent = (freshData as DataItem[]).find((d) => d.id === currentItem.value!.id);
          if (freshCurrent) currentItem.value.relepedAudio = freshCurrent.relepedAudio;
        }
      } catch (e) {
        console.error("刷新历史图片失败:", e);
      }
    }
  } catch (e) {
    console.error("轮询音频绑定状态失败:", e);
  }
}
function startPolling() {
  if (pollingTimer) return;
  pollingTimer = setInterval(async () => {
    if (notCompultedData.value.length === 0) {
      stopPolling();
      return;
    }
    await pollingPromptAssets();
  }, 3000);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

function startImagePolling() {
  if (imagePollingTimer) return;

  imagePollingTimer = setInterval(async () => {
    if (generatingData.value.length === 0) {
      stopImagePolling();
      return;
    }
    await pollingImageAssets();
  }, 3000);
}

function stopImagePolling() {
  if (imagePollingTimer) {
    clearInterval(imagePollingTimer);
    imagePollingTimer = null;
  }
}
function stopAudioPolling() {
  if (audioBindPollingTimer) {
    clearInterval(audioBindPollingTimer);
    audioBindPollingTimer = null;
  }
}
function startAudioPolling() {
  if (audioBindPollingTimer) return;
  audioBindPollingTimer = setInterval(async () => {
    if (audioBindData.value.length === 0) {
      stopAudioPolling();
      return;
    }
    await pollingAudioBind();
  }, 3000);
}

watch(notCompultedData, (val) => {
  if (val.length > 0) {
    startPolling();
  } else {
    stopPolling();
  }
});

watch(generatingData, (val) => {
  if (val.length > 0) {
    startImagePolling();
  } else {
    stopImagePolling();
  }
});

watch(audioBindData, (val) => {
  if (val.length > 0) {
    startAudioPolling();
  } else {
    stopAudioPolling();
  }
});
async function removeAudio(id: number) {
  editForm.relepedAudio = editForm.relepedAudio.filter((a) => a.id !== id);
  await axios.post("/cornerScape/updateAssetsAudio", {
    assetsId: editForm.assetsId,
  });
}
async function selectAudio() {
  const assets = await openAssetsSelector({
    title: $t("workbench.script.add.msg.selectAssetsTitle"),
    types: ["audio"],
    selectorMode: true,
    multiple: false,
  });
  if (assets.length) {
    editForm.relepedAudio = [{ id: assets[0].id, name: assets[0].name }];
    await axios.post("/cornerScape/updateAssetsAudio", {
      assetsId: editForm.assetsId,
      audioIds: editForm.relepedAudio.map((i) => i.id),
    });
  }
}
</script>

<style lang="scss" scoped>
.cornerScape {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  align-items: flex-start;
  animation: fadeIn 300ms ease-out;

  /* ---------- 品牌紫：实心主按钮 ---------- */
  :deep(.t-button--theme-primary.t-button--variant-base) {
    background: linear-gradient(135deg, #667eea, #764ba2) !important;
    border: none !important;
    color: #fff !important;
    border-radius: 10px !important;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.25);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    &:not(.t-is-disabled):hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
    }
    &:not(.t-is-disabled):active {
      transform: scale(0.97) translateY(0) !important;
    }
    &.t-is-disabled {
      background: rgba(0, 0, 0, 0.08) !important;
      color: rgba(0, 0, 0, 0.26) !important;
      box-shadow: none;
    }
  }
  /* ---------- 品牌紫：描边按钮 ---------- */
  :deep(.t-button--theme-primary.t-button--variant-outline) {
    border-color: rgba(102, 126, 234, 0.45) !important;
    color: #667eea !important;
    background: rgba(102, 126, 234, 0.04) !important;
    border-radius: 10px !important;
    font-weight: 500;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    &:not(.t-is-disabled):hover {
      border-color: #667eea !important;
      background: rgba(102, 126, 234, 0.1) !important;
    }
    &:not(.t-is-disabled):active {
      transform: scale(0.97) !important;
    }
  }

  /* ---------- 左侧：批量生成面板 ---------- */
  .left {
    width: clamp(250px, 21vw, 310px);
    height: 100%;
    min-height: 0;
    flex-shrink: 0;
    margin-right: 16px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    animation: fadeSlideIn 350ms ease-out;
    .card {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--material-thin) !important;
      backdrop-filter: var(--blur-heavy) !important;
      -webkit-backdrop-filter: var(--blur-heavy) !important;
      border: 1px solid var(--material-border-light) !important;
      border-radius: 16px !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
      :deep(.t-card__header) {
        flex-shrink: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding: 14px 18px;
        .t-card__title {
          font-weight: 600;
        }
      }
      :deep(.t-card__body) {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 14px 18px;
      }
    }
    .panelTitle {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .panelDesc {
      flex-shrink: 0;
      margin: 0 0 10px;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.45);
      line-height: 1.6;
    }
    .scopeBar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(102, 126, 234, 0.08);
      color: #667eea;
      margin-bottom: 12px;
      transition: all 0.25s;
      &.scoped {
        background: rgba(102, 126, 234, 0.16);
        font-weight: 500;
      }
    }
    .paramForm {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding-right: 2px;
      /* 滚动条 */
      &::-webkit-scrollbar {
        width: 5px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 3px;
        &:hover {
          background: rgba(0, 0, 0, 0.18);
        }
      }
    }
    :deep(.t-form) {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    :deep(.t-form__item) {
      margin-bottom: 0;
    }
    :deep(.t-form__label) {
      font-size: 12px;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    :deep(.t-input),
    :deep(.t-textarea),
    :deep(.t-select) {
      border-radius: 10px;
      background: var(--material-regular);
      border: 1px solid var(--material-border-light);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      &:focus-within {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }
    }
    .panelActions {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      padding-top: 12px;
      margin-top: 12px;
      .actionRow {
        display: flex;
        gap: 8px;
        :deep(.t-button) {
          flex: 1;
        }
      }
    }
  }
  /* ---------- 主内容区 ---------- */
  .content {
    flex: 1;
    min-width: 0;
    height: 100%;
    min-height: 0;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;

    .contentHeader {
      flex-shrink: 0;
      padding: 2px 4px 0;
      .pageTitleRow {
        .pageTitle {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.4;
        }
        .pageSubtitle {
          margin: 2px 0 0;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.45);
        }
      }
      .filterChips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: var(--material-thin);
          border-radius: 999px;
          padding: 5px 14px;
          font-size: 13px;
          cursor: pointer;
          color: rgba(0, 0, 0, 0.65);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          .count {
            font-size: 12px;
            line-height: 18px;
            padding: 0 7px;
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.06);
          }
          &:hover {
            border-color: rgba(102, 126, 234, 0.5);
            color: #667eea;
          }
          &.active {
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-color: transparent;
            color: #fff;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
            .count {
              background: rgba(255, 255, 255, 0.25);
              color: #fff;
            }
          }
        }
      }
      .selectionBar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 12px;
        padding: 8px 10px;
        background: var(--material-thin);
        border: 1px solid var(--material-border-light);
        border-radius: 12px;
      }
    }

    .grid {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      align-items: start;
      align-content: start;
      gap: 14px;
      padding: 14px 4px 20px;
      &.withDock {
        padding-bottom: 104px;
      }
      /* 滚动条 */
      &::-webkit-scrollbar {
        width: 6px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 3px;
        &:hover {
          background: rgba(0, 0, 0, 0.18);
        }
      }
    .card {
      cursor: pointer;
      width: 100%;
      height: auto;
      min-height: 300px;
      display: flex;
      flex-direction: column;
      background: var(--material-thin) !important;
      backdrop-filter: var(--blur-heavy) !important;
      -webkit-backdrop-filter: var(--blur-heavy) !important;
      border: 1px solid var(--material-border-light) !important;
      border-radius: 14px !important;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05),
        inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      overflow: hidden;
      animation: cardFadeIn 350ms ease-out backwards;
      &:nth-child(1) { animation-delay: 0ms; }
      &:nth-child(2) { animation-delay: 40ms; }
      &:nth-child(3) { animation-delay: 80ms; }
      &:nth-child(4) { animation-delay: 120ms; }
      &:nth-child(5) { animation-delay: 160ms; }
      &:nth-child(6) { animation-delay: 200ms; }
      &:nth-child(7) { animation-delay: 240ms; }
      &:nth-child(8) { animation-delay: 280ms; }
      &.selected {
        border-color: #667eea !important;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.28), 0 4px 16px rgba(102, 126, 234, 0.14) !important;
      }
      &:hover {
        transform: translateY(-3px) !important;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.15) !important;
        border-color: rgba(102, 126, 234, 0.3) !important;
      }
      &:active {
        transform: scale(0.98) !important;
      }
      :deep(.t-card__body) {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        padding: 0;
      }
      .imageBox {
        position: relative;
        width: 100%;
        height: 170px;
        background: rgba(0, 0, 0, 0.02);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-bottom: 1px solid rgba(0, 0, 0, 0.04);
        overflow: hidden;
        .selectBox {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 10;
        }
        .statusBadge {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 10;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2px 10px;
          border-radius: 999px;
          font-size: 12px;
          line-height: 18px;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(4px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
          }
          &.done {
            color: #2ba471;
            .dot {
              background: #2ba471;
            }
          }
          &.generating {
            color: #667eea;
            border-color: rgba(102, 126, 234, 0.4);
          }
          &.failed {
            color: #d54941;
            .dot {
              background: #d54941;
            }
          }
          &.waiting {
            color: rgba(0, 0, 0, 0.5);
            .dot {
              background: rgba(0, 0, 0, 0.25);
            }
          }
        }
        .cancelGeneration {
          position: absolute;
          bottom: 8px;
          right: 8px;
          z-index: 10;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s;
          cursor: pointer;
          font-size: 12px;
        }
        .generatingBox {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.06), rgba(118, 75, 162, 0.06));
          .generatingText {
            font-size: 13px;
            color: #667eea;
            letter-spacing: 0.05em;
            font-weight: 500;
          }
        }
        .image {
          width: 100%;
          height: 100%;
          transition: transform 300ms ease;
          :deep(.t-image__img) {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
        }
        .imageToolsWrap {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        :deep(.t-empty) {
          width: 100%;
        }
      }
      &:hover {
        .imageBox .image {
          transform: scale(1.03);
        }
        .imageBox .imageToolsWrap {
          opacity: 1;
          pointer-events: auto;
        }
        .imageBox .cancelGeneration {
          opacity: 1;
          pointer-events: auto;
        }
      }
      .infoBox {
        flex: 1;
        padding: 12px 14px;
        overflow: hidden;
        cursor: pointer;
        .titleRow {
          display: flex;
          align-items: center;
          gap: 6px;
          .name {
            flex: 1;
            min-width: 0;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: normal;
            overflow-wrap: anywhere;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .typeTag {
            flex-shrink: 0;
            border-radius: 6px;
          }
        }
        .desc {
          margin: 6px 0 0;
          font-size: 12px;
          color: rgba(0, 0, 0, 0.4);
          line-height: 1.55;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          -webkit-box-orient: vertical;
          &.empty {
            color: rgba(0, 0, 0, 0.25);
          }
        }
        .metaRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 8px;
          font-size: 12px;
          .metaLeft {
            min-width: 0;
            color: rgba(0, 0, 0, 0.35);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .promptLink {
            flex-shrink: 0;
            font-weight: 500;
            &.ready {
              color: #2ba471;
            }
            &.pending {
              color: #e37318;
              cursor: pointer;
              &:hover {
                text-decoration: underline;
              }
            }
          }
        }
        .audioTags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 6px;
        }
      }
      }
    }
  }
}

/* TDesign 抽屉苹果风 */
:deep(.t-drawer) {
  .t-drawer__content {
    background: var(--material-thick) !important;
    backdrop-filter: var(--blur-heavy) !important;
    -webkit-backdrop-filter: var(--blur-heavy) !important;
    border-left: 1px solid var(--material-border-light) !important;
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.08) !important;
  }
  .t-drawer__header {
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 16px 20px;
  }
  .t-drawer__body {
    padding: 16px 20px;
    &::-webkit-scrollbar {
      width: 5px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 3px;
    }
  }
  .t-input,
  .t-textarea,
  .t-select {
    border-radius: 10px;
    background: var(--material-regular);
    border: 1px solid var(--material-border-light);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    &:focus-within {
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
  }
  .t-button--theme-primary {
    background: linear-gradient(135deg, #667eea, #764ba2) !important;
    border: none !important;
    color: #fff !important;
    border-radius: 10px !important;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.25);
    &:hover {
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
    }
  }
}

.drawerHeader {
  display: flex;
  align-items: center;
  gap: 8px;
}
.audioList {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  .t-tag {
    border-radius: 8px;
  }
}
.drawerImageBox {
  width: 100%;
  min-height: 120px;
  max-height: 400px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 12px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;

  .image {
    width: 100%;
    height: auto;
    :deep(.t-image__img) {
      max-height: 400px;
      object-fit: contain;
    }
  }
  .generatingBox {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    .generatingText {
      font-size: 13px;
      color: #667eea;
      font-weight: 500;
    }
  }
  .imageToolsWrap {
    opacity: 1;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

/* ---------- 右下角：交付托盘 ---------- */
.deliveryDock {
  position: absolute;
  right: 24px;
  bottom: 24px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--material-thick, rgba(255, 255, 255, 0.92));
  backdrop-filter: var(--blur-heavy, blur(12px));
  -webkit-backdrop-filter: var(--blur-heavy, blur(12px));
  border: 1px solid var(--material-border-light);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  .dockLeft {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
    .dockInfo {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex-shrink: 0;
      .dockTitle {
        font-size: 13px;
        font-weight: 600;
      }
      .dockCount {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: #2ba471;
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #2ba471;
        }
        &.none {
          color: rgba(0, 0, 0, 0.4);
          .dot {
            background: rgba(0, 0, 0, 0.25);
          }
        }
      }
    }
    .dockThumbs {
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 320px;
      overflow-x: auto;
      padding: 2px;
      &::-webkit-scrollbar {
        height: 4px;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 2px;
      }
      .thumb {
        position: relative;
        width: 44px;
        height: 44px;
        border-radius: 10px;
        overflow: hidden;
        flex-shrink: 0;
        border: 1px solid rgba(0, 0, 0, 0.08);
        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .thumbClose {
          position: absolute;
          top: 0;
          right: 0;
          width: 16px;
          height: 16px;
          border-radius: 0 0 0 10px;
          background: rgba(0, 0, 0, 0.55);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s;
          :deep(svg) {
            width: 10px;
            height: 10px;
          }
        }
        &:hover .thumbClose {
          opacity: 1;
        }
      }
      .dockEmptyTip {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.35);
        white-space: nowrap;
      }
    }
  }
  .dockActions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
}

/* 交付托盘出入场 */
.dockUp-enter-active,
.dockUp-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.dockUp-enter-from,
.dockUp-leave-to {
  opacity: 0;
  transform: translateY(24px);
}

.historyImageList {
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  max-width: 100%;
  width: 0;
  min-width: 100%;
  flex-shrink: 1;
  padding-bottom: 4px;

  &::-webkit-scrollbar {
    height: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.historyImageItem {
  border-radius: 10px;
  border: 3px solid transparent;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
  overflow: hidden;

  &:hover {
    border-color: rgba(102, 126, 234, 0.3);
    transform: scale(1.03);
  }
  &:active {
    transform: scale(0.97);
  }
  &.selected {
    border-color: #667eea;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
  }
}

.drawerActions {
  display: flex;
  gap: 10px;
  width: 100%;
  :deep(.t-button) {
    flex: 1;
    border-radius: 10px;
    font-weight: 500;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    &:hover {
      transform: translateY(-1px);
    }
    &:active {
      transform: scale(0.97) !important;
    }
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes cardFadeIn {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>

<style lang="scss">
.cornerScape {
  box-sizing:border-box; height:100%; padding:22px 28px 24px; gap:16px;
  background:radial-gradient(circle at 92% 0,rgba(255,174,119,.15),transparent 22%),linear-gradient(180deg,#faf9fb,#f5f5f7);
  .left>.card { border:1px solid #e8e7ec !important; border-radius:21px !important; background:rgba(255,255,255,.9) !important; box-shadow:0 12px 30px rgba(40,37,54,.06) !important; }
  .contentHeader { padding:20px 22px !important; border:1px solid rgba(89,76,148,.1) !important; border-radius:21px !important; background:radial-gradient(circle at 91% 0,rgba(255,151,91,.2),transparent 24%),linear-gradient(132deg,#fff,#f6f3ff 62%,#fff5ed) !important; box-shadow:0 12px 30px rgba(58,49,99,.06) !important; }
  .pageTitle { color:#292733 !important; font-size:30px !important; letter-spacing:-.04em; }.pageSubtitle{color:#777482 !important}
  .chip.active { border-color:transparent !important; background:#f26b35 !important; color:#fff !important; }.chip.active .count{color:#fff !important}
  .grid>.card { border:1px solid #e8e7ec !important; border-radius:19px !important; background:#fff !important; box-shadow:0 9px 26px rgba(40,37,54,.055) !important; }
  .paginationBar { display:flex; justify-content:center; flex:none; padding:0 4px 12px; }
  .paginationBar .t-pagination { background:rgba(255,255,255,.8); border:1px solid #e8e7ec; border-radius:12px; padding:5px 8px; }
  .t-button--theme-primary.t-button--variant-base:not(:disabled) { border-color:transparent !important; background:linear-gradient(135deg,#ff8847,#f26432) !important; color:#fff !important; }.t-button--theme-primary.t-button--variant-base:not(:disabled) .t-button__text,.t-button--theme-primary.t-button--variant-base:not(:disabled) .t-icon{color:#fff !important}
  .t-button--theme-primary.t-button--variant-outline:not(:disabled){border-color:#f1a27e !important;background:#fff7f2 !important;color:#df5f29 !important}.t-button--theme-primary.t-button--variant-outline:not(:disabled) .t-button__text,.t-button--theme-primary.t-button--variant-outline:not(:disabled) .t-icon{color:#df5f29 !important}
  .t-button:disabled{border-color:#e5e4e8 !important;background:#efeff1 !important;color:#9c9aa2 !important}.t-button:disabled .t-button__text,.t-button:disabled .t-icon{color:#9c9aa2 !important}
}
</style>
