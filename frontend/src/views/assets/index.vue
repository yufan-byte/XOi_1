<template>
  <div class="assets" :class="{ projectOverviewPage: isProjectOverview }">
    <div v-if="selectedProjectId && !selectorMode" class="projectLibraryNav">
      <div><button type="button" :class="{ on: libTab === 'project' }" @click="libTab = 'project'">角色与素材</button><button type="button" :class="{ on: libTab === 'works' }" @click="libTab = 'works'">视频与成片</button></div>
      <span>仅显示当前项目</span>
    </div>
    <!-- 三库融合顶层切换：项目素材（生产要素）/ 我的作品（生成产物）/ 画布素材（创作素材）。方案见 docs/项目资产库-三库融合方案.md -->
    <div class="libTabs" v-if="!selectorMode && !selectedProjectId">
      <div class="libTabsBrand">
        <span class="libTabsMark" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="m3 8.5 9-4.5 9 4.5-9 4.5-9-4.5Z" /><path d="m3 13 9 4.5 9-4.5" /><path d="m3 17.5 9 4.5 9-4.5" /></svg></span>
        <span class="libTabsText"><i>WORKSPACE LIBRARY</i><strong>资产中心</strong></span>
      </div>
      <div class="libTabsItems">
        <button type="button" :class="{ on: libTab === 'project' }" @click="libTab = 'project'"><t-icon name="folder-open" /><span>项目素材</span><small>按项目管理</small></button>
        <button type="button" :class="{ on: libTab === 'works' }" @click="libTab = 'works'"><t-icon name="user-circle" /><span>我的作品</span><small>全局作品</small></button>
        <button type="button" :class="{ on: libTab === 'canvas' }" @click="libTab = 'canvas'"><t-icon name="layers" /><span>画布素材</span><small>全局收藏</small></button>
      </div>
    </div>
    <library-projects v-if="libTab === 'project' && isProjectOverview" />
    <div class="assetScopeBar" v-if="libTab === 'project' && !isProjectOverview">
      <div class="scopeIntro">
        <strong>资产归属</strong>
        <span>素材文件只保存一份，可被多个剧本复用</span>
      </div>
      <t-select v-model="assetScope" style="width: 148px" @change="handleScopeChange">
        <t-option value="all" label="全部剧本" />
        <t-option value="shared" label="项目公共库" />
        <t-option value="script" label="指定剧本" />
      </t-select>
      <t-select v-if="assetScope === 'script'" v-model="selectedScriptId" style="width: 260px" placeholder="选择剧本" @change="handleScriptChange">
        <t-option v-for="item in scriptOptions" :key="item.id" :value="item.id" :label="item.name" />
      </t-select>
      <t-tag v-if="assetScope === 'all'" theme="warning" variant="light">列表中的“归属剧本”会明确标注来源</t-tag>
      <t-tag v-else-if="assetScope === 'shared'" theme="success" variant="light">适合跨剧本复用的角色、场景和素材</t-tag>
    </div>
    <div class="data" v-if="libTab === 'project' && !isProjectOverview">
      <t-tabs v-model="assetOptions" @change="selectAssetOptions">
        <t-tab-panel v-for="(item, index) in themeData" :key="index" :value="item.value">
          <template #label>
            <div class="tabLabel">
              <component :is="item.icon" theme="outline" size="20" />
              <span>{{ item.name }}</span>
            </div>
          </template>

          <div class="panelContent">
            <div class="toolbar">
              <t-space>
                <t-button theme="primary" class="assetPrimaryBtn" @click="handleAdd(item.value)">
                  <template #icon>
                    <t-icon name="add" />
                  </template>
                  {{ $t("workbench.assets.addPrefix") }}{{ item.name }}
                </t-button>
                <t-popup placement="bottom">
                  <t-button theme="primary" class="assetPrimaryBtn workspaceSecondary" v-if="assetOptions != 'clip' && assetOptions != 'audio'">
                    <template #icon>
                      <t-icon name="indent-left" />
                    </template>
                    {{ $t("workbench.assets.batchGenerate") }}
                  </t-button>
                  <template #content>
                    <div class="data">
                      <div class="generatePrompt">
                        <span @click="batchGeneration(1)">{{ $t("workbench.assets.generatePrompt") }}</span>
                      </div>
                      <div class="generateImage">
                        <span @click="batchGeneration(2)">{{ $t("workbench.assets.generateImage") }}</span>
                      </div>
                    </div>
                  </template>
                </t-popup>
                <t-button theme="default" variant="outline" @click="handleBatchDelete">
                  <template #icon>
                    <t-icon name="delete" />
                  </template>
                  {{ $t("workbench.assets.batchDelete") }}
                </t-button>
                <t-button theme="primary" variant="outline" @click="sendSelectedToCanvas">
                  <template #icon>
                    <t-icon name="send" />
                  </template>
                  发送到画布
                </t-button>
              </t-space>
              <div class="f ac">
                <t-input v-model="searchText" :placeholder="$t('workbench.assets.searchPlaceholder')" clearable style="width: 260px" />
                <t-button class="assetSearchBtn workspaceSecondary" style="margin-left: 5px" @click="handleSearch">
                  <template #icon>
                    <t-icon name="search" />
                  </template>
                  {{ $t("workbench.assets.search") }}
                </t-button>
              </div>
            </div>
            <div class="assetsList">
              <!-- 角色/道具/场景：即梦式卡片网格（子资产作为缩略图组收进卡片，不再用展开表格） -->
              <div v-if="['role', 'tool', 'scene'].includes(assetOptions)" class="assetGrid">
                <div v-for="row in tableData" :key="row.id" class="assetCard" :class="{ selected: selectedRowKeys.includes(row.id), generating: isGenerating(row.id) }">
                  <div class="cardMedia" @click="handleCardClick(row)">
                    <t-checkbox class="cardCheck" :checked="selectedRowKeys.includes(row.id)" :disabled="isGenerating(row.id)" @click.stop @change="toggleCardSelect(row.id)" />
                    <div v-if="row.state === '生成中'" class="mediaState generating">
                      <t-loading size="small" /><span>生成中</span>
                    </div>
                    <t-image-viewer v-else-if="row.src" :images="[row.src]" :closeOnEscKeydown="true" :closeOnOverlay="true">
                      <template #trigger="{ open }">
                        <img :src="thumbUrl(row.src, 320)" :alt="row.name" class="mediaImg" loading="lazy" @click="row.src && getBigImageUrl(row, open())" />
                      </template>
                    </t-image-viewer>
                    <div v-else class="mediaState empty"><t-icon name="image" size="26px" /><span>暂无图片</span></div>
                    <div class="mediaOverlay">
                      <t-tooltip content="生成"><t-button shape="circle" variant="dashed" :disabled="isGenerating(row.id)" @click.stop="generate(row)"><i-magic :size="15" /></t-button></t-tooltip>
                      <t-tooltip content="编辑"><t-button shape="circle" variant="dashed" @click.stop="handleEdit(row)"><t-icon name="edit" /></t-button></t-tooltip>
                      <t-tooltip content="发送到画布"><t-button shape="circle" variant="dashed" @click.stop="sendSingleToCanvas(row)"><t-icon name="send" /></t-button></t-tooltip>
                      <t-tooltip content="删除"><t-button shape="circle" variant="dashed" theme="danger" :disabled="isGenerating(row.id)" @click.stop="handleDelete(row)"><t-icon name="delete" /></t-button></t-tooltip>
                    </div>
                  </div>
                  <div class="cardBody">
                    <div class="cardTitle">
                      <strong :title="row.name">{{ row.name }}</strong>
                      <t-tag v-if="row.sonAssets?.length" size="small" variant="outline">{{ row.sonAssets.length }} 个衍生</t-tag>
                    </div>
                    <div class="cardScriptRow">
                      <t-tag v-if="row.scriptNames?.length" size="small" variant="light" theme="primary">{{ row.scriptNames.join("、") }}</t-tag>
                      <span v-else class="sharedAssetLabel">项目公共库</span>
                      <span class="cardTime">{{ dayjs((row as any).startTime).format("MM-DD HH:mm") }}</span>
                    </div>
                    <p class="cardPrompt" :class="{ generating: row.promptState === '生成中' }" :title="row.prompt">
                      <t-loading v-if="row.promptState === '生成中'" size="small" />
                      {{ row.prompt || (row.promptState === '生成中' ? '提示词生成中…' : '暂无提示词') }}
                    </p>
                    <div v-if="row.sonAssets?.length" class="sonRow">
                      <button
                        v-for="sub in row.sonAssets.slice(0, 5)"
                        :key="sub.id"
                        type="button"
                        class="sonThumb"
                        :class="{ selected: selectedSubRowKeys.includes(sub.id) }"
                        :title="sub.name + (sub.prompt ? ' · ' + sub.prompt.slice(0, 40) : '')"
                        @click.stop="toggleSubSelect(sub.id)">
                        <img v-if="sub.src" :src="thumbUrl(sub.src, 240)" alt="" loading="lazy" />
                        <t-icon v-else name="image" />
                      </button>
                      <span v-if="row.sonAssets.length > 5" class="sonMore">+{{ row.sonAssets.length - 5 }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="!loading && !tableData.length" class="gridEmpty"><t-icon name="folder-open" size="38px" /><p>这里还没有{{ tabNameMap[assetOptions] }}，点上方「添加」开始</p></div>
              </div>

              <!-- 素材 clip：媒体卡片网格（图/视频/音频自适应） -->
              <div v-if="assetOptions == 'clip'" class="assetGrid">
                <div v-for="row in tableData" :key="row.id" class="assetCard" :class="{ selected: selectedRowKeys.includes(row.id) }">
                  <div class="cardMedia">
                    <t-checkbox class="cardCheck" :checked="selectedRowKeys.includes(row.id)" @click.stop @change="toggleCardSelect(row.id)" />
                    <t-image-viewer v-if="getMediaType(row.src) === 'image' && row.src" :images="[row.src]" :closeOnEscKeydown="true" :closeOnOverlay="true">
                      <template #trigger="{ open }">
                        <img :src="thumbUrl(row.src, 320)" :alt="row.name" class="mediaImg" loading="lazy" @click="open()" />
                      </template>
                    </t-image-viewer>
                    <div v-else-if="getMediaType(row.src) === 'video'" class="mediaState video" @click="openMediaPreview(row.src, row.name)">
                      <video v-if="row.src" :src="row.src" class="thumbVideo" muted preload="metadata" />
                      <t-icon name="play-circle" size="30" class="playBadge" />
                    </div>
                    <div v-else-if="getMediaType(row.src) === 'audio'" class="mediaState audio" @click="openMediaPreview(row.src, row.name)">
                      <t-icon name="music" size="26px" />
                      <t-icon name="play-circle" size="20" class="playBadge" />
                    </div>
                    <div v-else class="mediaState empty"><t-icon name="image" size="26px" /><span>未知媒体</span></div>
                    <div class="mediaOverlay">
                      <t-tooltip content="编辑"><t-button shape="circle" variant="dashed" @click.stop="handleEdit(row)"><t-icon name="edit" /></t-button></t-tooltip>
                      <t-tooltip v-if="row.src && getMediaType(row.src) === 'image'" content="发送到画布"><t-button shape="circle" variant="dashed" @click.stop="sendSingleToCanvas(row)"><t-icon name="send" /></t-button></t-tooltip>
                      <t-tooltip content="删除"><t-button shape="circle" variant="dashed" theme="danger" @click.stop="handleDelete(row)"><t-icon name="delete" /></t-button></t-tooltip>
                    </div>
                  </div>
                  <div class="cardBody">
                    <div class="cardTitle"><strong :title="row.name">{{ row.name }}</strong></div>
                    <div class="cardScriptRow">
                      <t-tag v-if="row.scriptNames?.length" size="small" variant="light" theme="primary">{{ row.scriptNames.join("、") }}</t-tag>
                      <span v-else class="sharedAssetLabel">项目公共库</span>
                      <span class="cardTime">{{ dayjs((row as any).startTime).format("MM-DD HH:mm") }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="!loading && !tableData.length" class="gridEmpty"><t-icon name="folder-open" size="38px" /><p>还没有素材，点上方「添加素材」上传图片/视频/音频</p></div>
              </div>

              <!-- 音频：卡片网格（大音符面 + 播放） -->
              <div v-if="assetOptions == 'audio'" class="assetGrid">
                <div v-for="row in tableData" :key="row.id" class="assetCard" :class="{ selected: selectedRowKeys.includes(row.id) }">
                  <div class="cardMedia audioFace" @click="openMediaPreview(row.src, row.name)">
                    <t-checkbox class="cardCheck" :checked="selectedRowKeys.includes(row.id)" @click.stop @change="toggleCardSelect(row.id)" />
                    <div class="audioFaceInner">
                      <t-icon name="music" size="34px" />
                      <strong class="audioWave" aria-hidden="true"><i></i><i></i><i></i><i></i></strong>
                    </div>
                    <div class="mediaOverlay">
                      <t-tooltip content="播放"><t-button shape="circle" variant="dashed" @click.stop="openMediaPreview(row.src, row.name)"><t-icon name="play-circle" /></t-button></t-tooltip>
                      <t-tooltip content="编辑"><t-button shape="circle" variant="dashed" @click.stop="handleEdit(row)"><t-icon name="edit" /></t-button></t-tooltip>
                      <t-tooltip content="删除"><t-button shape="circle" variant="dashed" theme="danger" @click.stop="handleDelete(row)"><t-icon name="delete" /></t-button></t-tooltip>
                    </div>
                  </div>
                  <div class="cardBody">
                    <div class="cardTitle"><strong :title="row.name">{{ row.name }}</strong><span v-if="row.sex" class="sexTag">{{ row.sex }}</span></div>
                    <div class="cardScriptRow">
                      <t-tag v-if="row.scriptNames?.length" size="small" variant="light" theme="primary">{{ row.scriptNames.join("、") }}</t-tag>
                      <span v-else class="sharedAssetLabel">项目公共库</span>
                      <span class="cardTime">{{ dayjs((row as any).startTime).format("MM-DD HH:mm") }}</span>
                    </div>
                    <p v-if="row.sonAssets?.length" class="cardPrompt">含 {{ row.sonAssets.length }} 条衍生音频</p>
                  </div>
                </div>
                <div v-if="!loading && !tableData.length" class="gridEmpty"><t-icon name="folder-open" size="38px" /><p>还没有音频，点上方「添加音频」收录配音/音效</p></div>
              </div>

              <div v-if="pagination.total > pagination.pageSize" class="gridPagination">
                <t-pagination v-model="currentPage" :total="pagination.total" :page-size="pagination.pageSize" :show-page-size="false" @current-change="handleGridPage" />
              </div>
            </div>
          </div>
        </t-tab-panel>
      </t-tabs>
    </div>
    <addAssets
      v-model="addAssetsShow"
      :type="assetOptions"
      :title="tabNameMap[assetOptions]"
      :formData="formData"
      :scriptId="assetScope === 'script' ? selectedScriptId : null"
      @getFilteredData="getFilteredData(assetOptions)" />
    <generateImage v-model="generateImageShow" @update="loadCurrentTabData" :formData="currentAssetData" :scriptId="assetScope === 'script' ? selectedScriptId : null" />

    <addAudioAssets v-model="addAudioShow" v-if="addAudioShow" :formData="audioFormData" :scriptId="assetScope === 'script' ? selectedScriptId : null" @getFilteredData="getFilteredData(assetOptions)" />
    <t-dialog
      v-model:visible="mediaPreviewShow"
      :header="mediaPreviewName || $t('workbench.assets.mediaPreview')"
      :footer="false"
      width="600px"
      placement="center"
      destroyOnClose
      @close="closeMediaPreview">
      <div class="mediaPreviewDialog">
        <video v-if="mediaPreviewType === 'video'" :src="mediaPreviewSrc" controls autoplay class="mediaPlayer videoPlayer" />
        <div v-else-if="mediaPreviewType === 'audio'" class="audioWrapper">
          <div class="audioIcon">
            <t-icon name="music" size="64px" />
          </div>
          <p class="audioName">{{ mediaPreviewName }}</p>
          <audio :src="mediaPreviewSrc" controls autoplay class="mediaPlayer audioPlayer" />
        </div>
      </div>
    </t-dialog>
    <t-dialog
      v-model:visible="batchGenerationShow"
      :header="batchType"
      width="600px"
      top="10vh"
      placement="center"
      destroyOnClose
      @confirm="keep"
      @close="batchGenerationShow = false">
      <div class="batch">
        <span>{{ $t("workbench.assets.confirmBatch", { type: batchType }) }}</span>
        <t-form labelAlign="top">
          <t-form-item :label="$t('workbench.assets.model')" name="selectValue" v-if="batchType === $t('workbench.assets.batchGenImage')">
            <modelSelect v-model="selectValue" :type="`image`" />
          </t-form-item>
          <t-form-item :label="$t('workbench.assets.resolution')" name="resolution" v-if="batchType === $t('workbench.assets.batchGenImage')">
            <t-select v-model="resolution" :placeholder="$t('workbench.assets.resolutionPh')">
              <t-option key="1K" label="1K" value="1K" />
              <t-option key="2K" label="2K" value="2K" />
              <t-option key="4K" label="4K" value="4K" />
            </t-select>
          </t-form-item>
        </t-form>
      </div>
      </t-dialog>
      <library-works v-if="libTab === 'works'" :project-id="selectedProjectId || undefined" />
      <div v-if="libTab === 'canvas'" class="collectionScopeHint">这里只显示画布收藏。项目生成的视频和导出成片，请到 <button type="button" @click="libTab = 'works'">我的作品 →</button> 查看。</div>
      <library-canvas v-if="libTab === 'canvas'" />
  </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import modelSelect from "@/components/modelSelect.vue";
import { useFileDialog } from "@vueuse/core";
import axios from "@/utils/axios";
import {takeBrowserHandoff} from "../../../../shared/browserHandoff";
import {sessionSignal} from "@/utils/session";
import { thumbUrl } from "@/utils/mediaUrl";
import type { TabValue } from "tdesign-vue-next";
import addAssets from "./components/addAssets.vue";
import addAudioAssets from "./components/addAudioAssets.vue";
import generateImage from "./components/generateImage.vue";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { sendToCanvas } from "@/utils/sendToCanvas";
import libraryWorks from "./components/libraryWorks.vue";
import libraryCanvas from "./components/libraryCanvas.vue";
import libraryProjects from "./components/libraryProjects.vue";
import { useRoute, useRouter } from "vue-router";

/** 顶层三库切换：project=项目素材（原有功能） / works=我的作品（mc_works） / canvas=画布素材（atelier IndexedDB） */
const libTab = ref<"project" | "works" | "canvas">("project");
const { otherSetting } = storeToRefs(settingStore());

const props = withDefaults(
  defineProps<{
    /** 是否作为选择器弹窗使用 */
    selectorMode?: boolean;
    /** 限制显示的资产类型 */
    allowedTypes?: ("role" | "tool" | "scene" | "clip" | "audio")[];
    /** 当类型为 clip 时，限制媒体子类型 */
    clipMediaTypes?: ("image" | "video" | "audio")[];
    /** 是否多选 */
    multiple?: boolean;
  }>(),
  {
    selectorMode: false,
    multiple: true,
  },
);
const addAudioShow = ref(false);

const audioFormData = ref({
  name: "",
  describe: "",
  sex: "",
});

async function checkCanvasSaveResult() {
  // 与角景共享同一 localStorage 键『canvas_save_result』；doSave 据 ?from 定点回归后由各页消费。
  try {
    const result = takeBrowserHandoff<{images: Array<{id?: number;src?: string}>;timestamp: number}>(sessionStorage,sessionSignal(),'canvas-result');
    if (!result) return
    if (Date.now() - result.timestamp > 5 * 60 * 1000) {
      return
    }
    if (!result.images || result.images.length === 0) return
    window.$message?.info(`已从画布返回 ${result.images.length} 张图片，正在保存为候选…`)
    await Promise.all(
      (result.images as Array<{ id?: number; src?: string }>).map(async (img) => {
        if (!img.id || !img.src) return
        let filePath = img.src
        try { filePath = new URL(filePath, window.location.origin).pathname } catch { /* 已是相对路径 */ }
        if (filePath.startsWith('/oss/')) filePath = filePath.slice(4) // getSmallImageUrl→getFileUrl 会自动加回 /oss/
        try {
          await axios.post('/assetsGenerate/saveCanvasResult', { id: img.id, filePath, projectId: Number(project.value?.id), candidateOnly: true })
        } catch (e) {
          console.error('保存画布结果失败:', e)
          throw e;
        }
      }),
    )
    window.$message?.success('画布结果已保存为候选图，原图未替换。请打开资产查看并选择采用。')
    await loadCurrentTabData() // 重拉以同步子资产 / 分页计数 / 最新状态
  } catch (e) {
    console.error('检查画布保存结果失败:', e)
    window.$message?.error('部分画布结果未确认保存，请核对素材；未保存的原图保留');
  }
}

async function loadProjectAssetView() {
  if (isProjectOverview.value) return;
  if (!(await ensureAssetProjectContext())) return;
  await checkCanvasSaveResult()
  await loadScriptOptions()
  loadCurrentTabData();
}

onMounted(loadProjectAssetView);

onUnmounted(() => {
  stopPolling();
  stopImagePolling();
});

const { project } = storeToRefs(projectStore());
const route = useRoute();
const router = useRouter();
const selectedProjectId = computed(() => Number(route.query.projectId) || null);
const isProjectOverview = computed(() => !props.selectorMode && selectedProjectId.value == null);

async function ensureAssetProjectContext() {
  const projectId = selectedProjectId.value;
  if (!projectId) return !!project.value?.id;
  if (Number(project.value?.id) === projectId) return true;
  try {
    const { data } = await axios.post("/general/getSingleProject", { id: projectId });
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) throw new Error("项目不存在或无权访问");
    project.value = item;
    return true;
  } catch (error: any) {
    window.$message?.error(error?.message || "项目加载失败");
    await router.replace("/assets");
    return false;
  }
}

function backToProjectLibrary() {
  router.push("/assets");
}

watch(
  () => route.query.projectId,
  async () => {
    libTab.value = "project";
    await loadProjectAssetView();
  },
);
type AssetScope = "all" | "shared" | "script";
const assetScope = ref<AssetScope>(route.query.scriptId || route.query.episode ? "script" : "all");
const selectedScriptId = ref<number | undefined>(Number(route.query.scriptId || route.query.episode) || undefined);
const scriptOptions = ref<Array<{ id: number; name: string }>>([]);

async function loadScriptOptions() {
  if (!project.value?.id) return;
  try {
    const { data } = await axios.post("/script/getScrptApi", { projectId: Number(project.value.id) });
    scriptOptions.value = (Array.isArray(data) ? data : []).map((item: any) => ({ id: Number(item.id), name: item.name || `剧本 ${item.id}` }));
    if (selectedScriptId.value && !scriptOptions.value.some((item) => item.id === selectedScriptId.value)) {
      selectedScriptId.value = undefined;
      assetScope.value = "all";
    }
  } catch (error) {
    console.warn("加载剧本列表失败:", error);
    scriptOptions.value = [];
    if (assetScope.value === "script") assetScope.value = "all";
  }
}

function handleScopeChange(value: any) {
  if (value === "script" && !selectedScriptId.value && scriptOptions.value.length) {
    selectedScriptId.value = scriptOptions.value[0].id;
  }
  pagination.value.page = 1;
  loadCurrentTabData();
}

function handleScriptChange() {
  pagination.value.page = 1;
  loadCurrentTabData();
}

const allThemeData = [
  {
    name: $t("workbench.assets.role"),
    value: "role",
    icon: "i-permissions",
  },
  {
    name: $t("workbench.assets.prop"),
    value: "tool",
    icon: "i-tool",
  },
  {
    name: $t("workbench.assets.scene"),
    value: "scene",
    icon: "i-landscape",
  },
  {
    name: $t("workbench.assets.clip"),
    value: "clip",
    icon: "i-editing",
  },
  {
    name: $t("workbench.assets.audio"),
    value: "audio",
    icon: "i-audio-file",
  },
];
const themeData = ref(props.allowedTypes?.length ? allThemeData.filter((item) => props.allowedTypes!.includes(item.value as any)) : allThemeData);

const initialTab = (themeData.value[0]?.value || "role") as "role" | "tool" | "scene" | "clip";
const assetOptions = ref<"role" | "tool" | "scene" | "clip" | "audio">(initialTab);
const searchText = ref("");

const tabNameMap: Record<string, string> = {
  role: $t("workbench.assets.role"),
  tool: $t("workbench.assets.prop"),
  scene: $t("workbench.assets.scene"),
  clip: $t("workbench.assets.clip"),
  audio: $t("workbench.assets.audio"),
};
const selectedRowKeys = ref<Array<string | number>>([]);
const selectedSubRowKeys = ref<Array<string | number>>([]);
const expandedRowKeys = ref<Array<string | number>>([]);
const loading = ref(false);
// 是否正在处于任意生成中（提示词或图片），基于 item 的实际 state/promptState 判断
const isGenerating = (id: number) => {
  const item = findAssetById(id);
  return item?.promptState === "生成中" || item?.state === "生成中";
};
//表格数据类型定义
interface Asset {
  id: number;
  assetsId: number | null;
  name: string;
  prompt: string;
  describe: string;
  remark: string;
  src: string;
  type: "role" | "tool" | "scene" | "clip" | "audio"; // "角色" | "道具" | "场景" | "素材" | "音频"
  state: string;
  sonAssets?: Asset[]; // 子资产列表
  imageId: number;
  promptState: string;
  filePath: string;
  scriptNames?: string[];
  startTime?: number | string;
  sex?: string;
}
const tableData = ref<Asset[]>([]);
// 分页配置
const pagination = ref({
  page: 1,
  pageSize: 10,
  total: 0,
  showJumper: true,
});
function handleSearch() {
  pagination.value.page = 1;
  getFilteredData(assetOptions.value);
}
async function getFilteredData(type: string) {
  try {
    loading.value = true;
    const { data } = await axios.post("/assets/getAssetsApi", {
      projectId: Number(project.value?.id),
      type: type,
      name: searchText.value || undefined,
      page: pagination.value.page,
      limit: pagination.value.pageSize,
      scope: assetScope.value,
      scriptId: assetScope.value === "script" ? selectedScriptId.value : undefined,
    });

    tableData.value = data.data || [];
    // 当 clip 类型且指定了 clipMediaTypes 时，进行二次过滤
    if (type === "clip" && props.clipMediaTypes?.length) {
      tableData.value = tableData.value.filter((item) => {
        const mt = getMediaType(item.src);
        return props.clipMediaTypes!.includes(mt as any);
      });
    }
    pagination.value.total = data.total || 0;
    return tableData.value;
  } catch (error) {
    console.error("加载资产数据失败:", error);
    tableData.value = [];
    pagination.value.total = 0;
  } finally {
    loading.value = false;
  }
}
// 加载当前标签的数据
async function loadCurrentTabData() {
  let type = "";
  if (assetOptions.value === "role") {
    type = "角色";
  } else if (assetOptions.value === "tool") {
    type = "道具";
  } else if (assetOptions.value === "scene") {
    type = "场景";
  } else if (assetOptions.value === "clip") {
    type = "素材";
  } else if (assetOptions.value === "audio") {
    type = "音频";
  }
  await getFilteredData(assetOptions.value);
}
function selectAssetOptions(value: TabValue) {
  searchText.value = "";
  selectedRowKeys.value = [];
  selectedSubRowKeys.value = [];
  expandedRowKeys.value = [];
  pagination.value.page = 1;
  loadCurrentTabData();
}
const formData = ref<{ id: number; name: string; describe: string; remark: string; src?: string; prompt: string }>({
  id: 0,
  name: "",
  describe: "",
  remark: "",
  src: "",
  prompt: "",
});
const addAssetsShow = ref(false);
// 新增
// 文件选择
const { open, onChange, onCancel } = useFileDialog({ multiple: false, reset: true, accept: ".png,.jpg,.jpeg,.mp3,.mp4" });
async function handleAdd(type: string) {
  if (type === "clip") {
    const files = await new Promise<FileList | null>((resolve) => {
      open();
      onChange((f) => resolve(f));
      onCancel(() => resolve(null));
    });
    if (!files?.length) return;

    const file = files[0];

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = reader.result as string;
      await axios.post("/assets/uploadClip", {
        projectId: Number(project.value?.id),
        base64Data: base64,
        name: file.name,
        scriptId: assetScope.value === "script" ? selectedScriptId.value : undefined,
      });
      window.$message.success($t("workbench.assets.uploadSuccess"));
      getFilteredData(assetOptions.value);
    };
    reader.readAsDataURL(file);
  } else if (type == "audio") {
    addAudioShow.value = true;
    audioFormData.value = {
      name: "",
      describe: "",
      sex: "",
    };
  } else {
    addAssetsShow.value = true;
    formData.value = {
      id: 0,
      name: "",
      describe: "",
      remark: "",
      prompt: "",
    };
  }
}
const batchGenerationShow = ref(false);
const selectValue = ref(""); //选择的模型
const resolution = ref("1K"); //选择的分辨率
const batchType = ref("");
function batchGeneration(type: number) {
  batchType.value = type === 1 ? $t("workbench.assets.batchGenPrompt") : $t("workbench.assets.batchGenImage");
  batchGenerationShow.value = true;
}
function keep() {
  if (batchType.value === $t("workbench.assets.batchGenPrompt")) {
    handleBatchGeneratePrompt();
  } else if (batchType.value === $t("workbench.assets.batchGenImage")) {
    handleBatchGenerateImage();
  }
}
// 获取所有选中的子资产
function getSelectedSubAssets(): Asset[] {
  const subAssets: Asset[] = [];
  tableData.value.forEach((row) => {
    if (row.sonAssets?.length) {
      row.sonAssets.forEach((sub) => {
        if (selectedSubRowKeys.value.includes(sub.id)) {
          subAssets.push(sub);
        }
      });
    }
  });
  return subAssets;
}
// 批量生成提示词
async function handleBatchGeneratePrompt() {
  const selectedParentAssets = tableData.value.filter((item: any) => selectedRowKeys.value.includes(item.id));
  const selectedSubAssets = getSelectedSubAssets();
  const selectedAssets = [...selectedParentAssets, ...selectedSubAssets];
  if (selectedAssets.length === 0) {
    window.$message.warning($t("workbench.assets.selectAtLeastOne"));
    return;
  }
  // 设置 promptState 为 '生成中'，让轮询自动接管状态跟踪
  selectedParentAssets.forEach((asset) => {
    const target = tableData.value.find((row) => row.id === asset.id);
    if (target) target.promptState = "生成中";
  });
  selectedSubAssets.forEach((asset) => {
    tableData.value.forEach((row) => {
      const target = row.sonAssets?.find((sub) => sub.id === asset.id);
      if (target) target.promptState = "生成中";
    });
  });
  selectedRowKeys.value = selectedRowKeys.value.filter((key) => !selectedParentAssets.some((a) => a.id === key));
  selectedSubRowKeys.value = selectedSubRowKeys.value.filter((key) => !selectedSubAssets.some((a) => a.id === key));
  batchGenerationShow.value = false;
  try {
    await axios.post("/assetsGenerate/batchPolishAssetsPrompt", {
      projectId: project.value?.id,
      concurrentCount: otherSetting.value.assetsBatchGenereateSize,
      items: selectedAssets.map((item: { id: number; name: string; type: string; describe: string }) => ({
        assetsId: item.id,
        type: item.type ?? "props",
        name: item.name,
        describe: item.describe ? item.describe : $t("workbench.assets.noDescription"),
      })),
    });
  } catch (e: any) {
    window.$message.error(e?.message ?? $t("workbench.assets.promptGenFail"));
  }
}
// 批量生成图片
async function handleBatchGenerateImage() {
  const selectedParentAssets = tableData.value.filter((item: any) => selectedRowKeys.value.includes(item.id));
  const selectedSubAssets = getSelectedSubAssets();
  const selectedAssets = [...selectedParentAssets, ...selectedSubAssets];
  if (selectedAssets.length === 0) {
    window.$message.warning($t("workbench.assets.selectAtLeastOne"));
    return;
  }
  if (!selectValue.value) {
    window.$message.error($t("workbench.assets.selectModel"));
    return;
  }
  if (!resolution.value) {
    window.$message.error($t("workbench.assets.selectResolution"));
    return;
  }

  // 过滤掉没有 prompt 的资产
  const validAssets = selectedAssets.filter((asset) => {
    if (!asset.prompt) {
      window.$message.warning($t("workbench.assets.noPromptForImage", { name: asset.name }));
      return false;
    }
    return true;
  });
  if (validAssets.length === 0) return;

  // 设置 state 为 '生成中'，让轮询自动接管状态跟踪
  const validParentAssets = validAssets.filter((a) => selectedRowKeys.value.includes(a.id));
  const validSubAssets = validAssets.filter((a) => selectedSubRowKeys.value.includes(a.id));
  validParentAssets.forEach((asset) => {
    const target = tableData.value.find((row) => row.id === asset.id);
    if (target) target.state = "生成中";
  });
  validSubAssets.forEach((asset) => {
    tableData.value.forEach((row) => {
      const target = row.sonAssets?.find((sub) => sub.id === asset.id);
      if (target) target.state = "生成中";
    });
  });
  selectedRowKeys.value = selectedRowKeys.value.filter((key) => !validAssets.some((a) => a.id === key));
  selectedSubRowKeys.value = selectedSubRowKeys.value.filter((key) => !validAssets.some((a) => a.id === key));
  batchGenerationShow.value = false;

  try {
    await axios.post("/assetsGenerate/batchGenerateImageAssets", {
      projectId: project.value?.id,
      model: selectValue.value,
      resolution: resolution.value,
      concurrentCount: otherSetting.value.assetsBatchGenereateSize,
      items: validAssets.map((item) => ({
        id: item.id,
        type: item.type ?? "props",
        name: item.name ?? $t("workbench.cornerScape.unnamed"),
        prompt: item.prompt || item.describe,
      })),
    });
  } catch (e: any) {
    window.$message.error($t("workbench.assets.imageGenFail", { name: "", error: e.message ?? "" }));
    validAssets.forEach((asset) => {
      // 在父级和子级中都查找
      const parentTarget = tableData.value.find((row) => row.id === asset.id);
      if (parentTarget) {
        parentTarget.state = "生成失败";
      } else {
        tableData.value.forEach((row) => {
          const subTarget = row.sonAssets?.find((sub) => sub.id === asset.id);
          if (subTarget) subTarget.state = "生成失败";
        });
      }
    });
  }
}
// 批量删除
function handleBatchDelete() {
  const selectedParentAssets = tableData.value.filter((item: any) => selectedRowKeys.value.includes(item.id));
  const selectedSubAssets = getSelectedSubAssets();
  const selectedAssets = [...selectedParentAssets, ...selectedSubAssets];
  if (selectedAssets.length === 0) {
    window.$message.warning($t("workbench.assets.selectAtLeastOne"));
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.assets.confirmBatchDeleteBody"),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      await axios.post("/assets/batchDelete", { id: selectedAssets.map((asset) => asset.id) });
      window.$message.success($t("workbench.assets.deleteSuccess"));
      getFilteredData(assetOptions.value);
      dialog.destroy();
    },
  });
}
// 父资产表格列配置
const selectType = props.multiple ? "multiple" : "single";
// 旧的 t-table 列配置已随表格视图移除（卡片网格不需要列定义）
// 选择行（正在生成中的行不允许勾选）
function handleSelectChange(value: Array<string | number>) {
  const filtered = value.filter((key) => !isGenerating(key as number));
  if (!props.multiple) {
    selectedRowKeys.value = filtered.length > 0 ? [filtered[filtered.length - 1]] : [];
  } else {
    selectedRowKeys.value = filtered;
  }
}

// ---- 卡片网格的选择与翻页 ----
const currentPage = ref(1);
function toggleCardSelect(id: number) {
  if (isGenerating(id)) return;
  if (!props.multiple) {
    selectedRowKeys.value = selectedRowKeys.value.includes(id) ? [] : [id];
    return;
  }
  handleSelectChange(
    selectedRowKeys.value.includes(id)
      ? selectedRowKeys.value.filter((k) => k !== id)
      : [...selectedRowKeys.value, id],
  );
}
function toggleSubSelect(id: number) {
  if (!props.multiple) {
    selectedSubRowKeys.value = selectedSubRowKeys.value.includes(id) ? [] : [id];
    return;
  }
  selectedSubRowKeys.value = selectedSubRowKeys.value.includes(id)
    ? selectedSubRowKeys.value.filter((k) => k !== id)
    : [...selectedSubRowKeys.value, id];
}
/** 点卡片主体（非按钮区）：多选=切换勾选（选择器语义），预览走图片点击 */
function handleCardClick(row: Asset) {
  if (props.selectorMode) toggleCardSelect(row.id);
}
function handleGridPage(page: number) {
  pagination.value.page = page;
  loadCurrentTabData();
}

// 批量发送选中资产到画布
function sendSelectedToCanvas() {
  const selectedItems = tableData.value.filter((item: any) =>
    selectedRowKeys.value.includes(item.id) && item.src
  )
  if (selectedItems.length === 0) {
    window.$message.warning('请先选择有图片的资产')
    return
  }
  sendToCanvas(
    selectedItems.map((item: any) => ({
      src: item.src,
      name: item.name,
      id: item.id
    })),
    { from: 'assets' }
  )
}

// 单个资产发送到画布
function sendSingleToCanvas(row: any) {
  if (!row.src) {
    window.$message.warning('该资产暂无图片')
    return
  }
  sendToCanvas([{ src: row.src, name: row.name, id: row.id }], { from: 'assets' })
}
// 生成
const generateImageShow = ref(false);
// 当前操作的资产数据（用于图片生成）
const currentAssetData = ref<{
  id?: number;
  name?: string;
  describe?: string;
  type?: string;
  prompt?: string;
  src: string;
}>({
  id: undefined,
  name: "",
  describe: "",
  type: "",
  prompt: "",
  src: "",
});
function generate(row: any) {
  currentAssetData.value = {
    id: row.id,
    name: row.name,
    describe: row.describe,
    type: row.type,
    prompt: row.prompt,
    src: row.src,
  };
  generateImageShow.value = true;
}
// 编辑
function handleEdit(row: any) {
  console.log(row);
  if (row.type == "audio") {
    audioFormData.value = {
      ...row,
    };
    addAudioShow.value = true;
  } else {
    formData.value = {
      ...row,
    };
    addAssetsShow.value = true;
  }
}
// 删除
function handleDelete(row: any) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.assets.confirmDeleteBody"),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        await axios.post("/assets/delAssets", { id: row.id });
        window.$message.success($t("workbench.assets.deleteSuccess"));
        getFilteredData(assetOptions.value);
        dialog.destroy();
      } catch (error) {
        console.error("删除资产失败:", error);
        window.$message.error($t("workbench.assets.deleteFail"));
        dialog.destroy();
      }
    },
  });
}

defineExpose({
  selectedRowKeys,
  selectedSubRowKeys,
  tableData,
});

// ===== 媒体预览 =====
type MediaType = "image" | "video" | "audio" | "unknown";

function getMediaType(src?: string): MediaType {
  if (!src) return "unknown";
  const ext = src.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
  return "unknown";
}

const mediaPreviewShow = ref(false);
const mediaPreviewSrc = ref("");
const mediaPreviewType = ref<MediaType>("unknown");
const mediaPreviewName = ref("");

function openMediaPreview(src: string, name: string) {
  if (!src) return;
  mediaPreviewSrc.value = src;
  mediaPreviewType.value = getMediaType(src);
  mediaPreviewName.value = name;
  mediaPreviewShow.value = true;
}
function closeMediaPreview() {
  mediaPreviewShow.value = false;
  mediaPreviewSrc.value = "";
}
//轮询
// 获取所有资产（包含父资产和子资产）的扁平列表
function getAllAssetsFlat(): Asset[] {
  const all: Asset[] = [];
  tableData.value.forEach((row) => {
    all.push(row);
    if (row.sonAssets?.length) {
      all.push(...row.sonAssets);
    }
  });
  return all;
}
// 在父资产和子资产中查找指定 id 的资产
function findAssetById(id: number): Asset | undefined {
  for (const row of tableData.value) {
    if (row.id === id) return row;
    const sub = row.sonAssets?.find((s) => s.id === id);
    if (sub) return sub;
  }
  return undefined;
}
const notCompultedData = computed(() => {
  return getAllAssetsFlat().filter((item) => item.promptState == "生成中");
});
const generatingData = computed(() => {
  return getAllAssetsFlat().filter((item) => item.state === "生成中");
});
// 轮询相关
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let imagePollingTimer: ReturnType<typeof setInterval> | null = null;
//轮询提示词生成
async function pollingPromptAssets() {
  if (notCompultedData.value.length === 0) return;
  const ids = notCompultedData.value.map((item) => item.id);
  try {
    const { data } = await axios.post("/assets/pollingPromptAssets", { ids });
    if (Array.isArray(data) && data.length) {
      data.forEach((item: { id: number; promptState: string; prompt: string }) => {
        const target = findAssetById(item.id);
        if (target) {
          target.promptState = item.promptState;
          if (item.prompt !== undefined) target.prompt = item.prompt;
        }
      });
      getFilteredData(assetOptions.value);
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
    if (Array.isArray(data) && data.length) {
      data.forEach((item: { id: number; state: string; filePath: string; src?: string }) => {
        const target = findAssetById(item.id);
        if (target) {
          target.state = item.state;
          if (item.filePath !== undefined) target.filePath = item.filePath;
          if (item.src !== undefined) target.src = item.src;
          // filePath 存在时也作为 src 使用，确保图片立即显示
          if (!item.src && item.filePath && item.state !== "生成中") {
            target.src = item.filePath;
          }
        }
      });
      getFilteredData(assetOptions.value);
    }
  } catch (e) {
    console.error("轮询图片生成状态失败:", e);
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

async function getBigImageUrl(row: Asset, fn: Function) {
  row.src = `${row.src.split("?") ? row.src.split("?")[0] : row.src}`;
  nextTick(() => {
    fn();
  });
}
</script>

<style lang="scss" scoped>
/* 资产中心（项目内视图）：暖橙卡片网格（原 t-table 已移除） */
.projectLibraryNav { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:16px; }
.projectLibraryNav > div { display:flex; gap:4px; padding:4px; border:1px solid #eee7df; border-radius:12px; background:#f3f0ec; }
.projectLibraryNav button { background:transparent; border:0; padding:10px 18px; border-radius:9px; color:#8b8175; cursor:pointer; }
.projectLibraryNav button.on { background:#fff; color:#be5c31; box-shadow:0 2px 5px #35261908; }
.projectLibraryNav > span { color:#9c9185; font-size:12px; }

.assets {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: #302b28;

  .data { flex: 1; display: flex; flex-direction: column; min-height: 0; }

  :deep(.t-tabs) {
    flex: 1; display: flex; flex-direction: column; min-height: 0;
    .t-tabs__header {
      flex: none;
      border: 1px solid var(--xoi-workspace-border, #eee7e2);
      border-radius: 14px;
      padding: 6px 10px;
      background: #fff;
    }
    .t-tabs__nav-item {
      font-size: 13px; font-weight: 550; border-radius: 10px;
      transition: color .18s ease, background .18s ease;
      &:hover { color: #c25c22; background: #fff6ef; }
      &.t-is-active { color: #dc5f2d; background: #fff0e8; font-weight: 650; }
    }
    .t-tabs__bar { background: #f26b35; height: 2.5px; border-radius: 2px; }
    .t-tabs__content { flex: 1; display: flex; flex-direction: column; min-height: 0; }
    .t-tab-panel { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  }

  .tabLabel { display: flex; align-items: center; gap: 8px; }

  .panelContent {
    margin-top: 14px;
    flex: 1; display: flex; flex-direction: column; min-height: 0;

    .toolbar {
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px; flex-wrap: wrap;
      margin-bottom: 14px; padding: 10px 14px;
      border: 1px solid var(--xoi-workspace-border, #eee7e2);
      border-radius: 14px; background: #fff;

      :deep(.t-button) { border-radius: 10px; }
      :deep(.t-button--theme-primary) {
        border: 0; background: linear-gradient(135deg, #f2803f, #e0641f); color: #fff;
        box-shadow: 0 6px 14px rgba(224, 100, 31, .18);
        &:hover { background: linear-gradient(135deg, #f88746, #e96a26); }
      }
      :deep(.t-button--theme-primary.t-button--variant-outline) {
        border: 1px solid #f0c4a8; background: #fff6ef; color: #d06a33; box-shadow: none;
        &:hover { border-color: #e8a377; background: #ffefe3; }
      }
      :deep(.t-input) {
        border-radius: 10px; background: #fffdfb; border-color: #eee0d5;
        &:focus-within { border-color: #eba575; box-shadow: 0 0 0 3px rgba(240, 138, 90, .1); }
      }
    }
  }

  /* ---------- 即梦式资产卡片网格 ---------- */
  .assetsList { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 2px 10px; }

  .assetGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
    gap: 20px;
    align-items: stretch;
  }

  .assetCard {
    display: flex; flex-direction: column;
    border: 1px solid var(--xoi-workspace-border, #eee7e2);
    border-radius: 14px; background: #fff;
    box-shadow: 0 3px 12px #302b2806;
    overflow: hidden;
    transition: transform .22s cubic-bezier(.16,1,.3,1), box-shadow .22s, border-color .22s;

    &:hover {
      transform: translateY(-2px);
      border-color: #e6c3ab;
      box-shadow: 0 10px 24px #302b2812;
      .mediaOverlay { opacity: 1; pointer-events: auto; }
    }
    &.selected {
      border-color: #ef9f70;
      box-shadow: 0 0 0 2px rgba(240, 130, 70, .16), 0 8px 20px #302b2810;
      .cardBody { background: #fffaf5; }
    }
    &.generating .cardMedia { background: linear-gradient(135deg, #fff6ef, #ffefe3); }
  }

  .cardMedia {
    position: relative;
    /* 4:3 + contain：角色三视图/四视图等宽幅定妆照完整可见，不再被裁掉头脚 */
    aspect-ratio: 4 / 3;
    background: #f6f0e9;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    cursor: default;

    .cardCheck { position: absolute; top: 9px; left: 9px; z-index: 5; }

    .mediaImg {
      width: 100%; height: 100%;
      object-fit: contain; display: block;
      cursor: zoom-in;
      transition: transform .25s ease;
    }
    &:hover .mediaImg { transform: scale(1.03); }

    .thumbVideo { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }

    .mediaState {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; width: 100%; height: 100%;
      color: #b3a294; font-size: 12px;
      &.generating { color: #d4601f; }
      &.video, &.audio { color: #b5714c; cursor: pointer; }
      .playBadge { color: rgba(255,255,255,.94); filter: drop-shadow(0 2px 8px rgba(40,25,15,.4)); }
    }

    /* 音频卡面：暖色渐变 + 声波条 */
    &.audioFace {
      background: linear-gradient(135deg, #f78a4e, #e0641f);
      cursor: pointer;
      .audioFaceInner {
        display: flex; flex-direction: column; align-items: center; gap: 12px;
        color: rgba(255,255,255,.92);
        .audioWave { display: flex; align-items: flex-end; gap: 4px; height: 26px;
          i { width: 4px; border-radius: 2px; background: rgba(255,255,255,.75); animation: audioBar 1.1s ease-in-out infinite; }
          i:nth-child(1){height:10px} i:nth-child(2){height:22px;animation-delay:.15s} i:nth-child(3){height:14px;animation-delay:.3s} i:nth-child(4){height:24px;animation-delay:.45s}
        }
      }
    }

    .mediaOverlay {
      position: absolute; inset: auto 0 0 0; z-index: 4;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px;
      background: linear-gradient(180deg, transparent, rgba(28, 19, 12, .5));
      opacity: 0; pointer-events: none;
      transition: opacity .2s ease;
      :deep(.t-button) { border-color: rgba(255,255,255,.6); color: #fff; background: rgba(255,255,255,.14); backdrop-filter: blur(4px); }
      :deep(.t-button:hover) { background: rgba(255,255,255,.3); }
      :deep(.t-button--theme-danger) { border-color: rgba(255,150,140,.7); color: #ffd9d4; }
    }
  }

  .cardBody {
    flex: 1; display: flex; flex-direction: column; gap: 7px;
    padding: 11px 13px 12px;

    .cardTitle {
      display: flex; align-items: center; gap: 8px;
      strong {
        flex: 1; min-width: 0;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        color: #302b28; font-size: 13.5px; font-weight: 650;
      }
      .sexTag { flex: none; padding: 1px 7px; border-radius: 5px; background: #fff1e6; color: #c08a65; font-size: 11px; }
    }

    .cardScriptRow {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      min-height: 22px;
      .sharedAssetLabel { color: #b3a294; font-size: 11.5px; }
      .cardTime { flex: none; color: #b3a294; font-size: 11px; font-variant-numeric: tabular-nums; }
      :deep(.t-tag) { max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 6px; }
    }

    .cardPrompt {
      flex: 1;
      margin: 0;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; text-overflow: ellipsis;
      color: #8d8177; font-size: 11.5px; line-height: 1.55;
      &.generating { color: #d4601f; font-style: italic; }
    }

    .sonRow {
      display: flex; align-items: center; gap: 6px;
      padding-top: 7px; border-top: 1px dashed #f0e4d8;
      .sonThumb {
        display: grid; place-items: center;
        width: 34px; height: 34px; flex: none;
        border: 2px solid transparent; border-radius: 8px;
        background: #faf6f1; color: #b3a294;
        overflow: hidden; cursor: pointer; padding: 0;
        transition: border-color .18s ease, transform .18s ease;
        img { width: 100%; height: 100%; object-fit: cover; }
        &:hover { border-color: #e8b795; transform: translateY(-1px); }
        &.selected { border-color: #ef9f70; box-shadow: 0 0 0 2px rgba(240,130,70,.14); }
      }
      .sonMore { color: #b3a294; font-size: 11px; }
    }
  }

  .gridEmpty {
    grid-column: 1 / -1;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 70px 20px;
    border: 1px dashed #ecdfd4; border-radius: 16px; background: #fffdfb;
    color: #b3a294;
    p { margin: 0; font-size: 13px; }
  }

  .gridPagination { display: flex; justify-content: center; padding: 14px 0 4px; }
}

@keyframes audioBar {
  0%, 100% { transform: scaleY(.55); }
  50% { transform: scaleY(1); }
}
</style>

<style lang="scss">
/* 分页器 */
.t-pagination {
  margin-top: 12px;
}
</style>

<style lang="scss">
/* 全局：分页器与主按钮暖橙（卡片网格视图） */
.t-pagination { margin-top: 12px; }
.assets .t-pagination__number.t-is-current { border:0 !important; background:#f26b35 !important; color:#fff !important; }
</style>

<style lang="scss" scoped>
/* 三库融合顶层切换（项目素材 / 我的作品 / 画布素材） */
.collectionScopeHint { margin:0 0 12px; padding:10px 14px; background:#fff8f2; border:1px solid #f0e2d5; border-radius:10px; font-size:12px; color:#9c7d65; }
.collectionScopeHint button { border:0; background:none; color:#bf5a2e; cursor:pointer; }
.libTabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 66px;
  padding: 8px 10px 8px 20px;
  margin: 0 0 18px;
  border: 1px solid #ebe9ee;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 8px 24px rgba(42, 39, 58, 0.04);

  .libTabsBrand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  /* 品牌徽标：暖橙渐变方块 + 图层图标，配上下两行文字，拉开与标签按钮的呼吸感 */
  .libTabsMark { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 11px; background: linear-gradient(135deg, #ff8847, #f26432); color: #fff; box-shadow: 0 5px 12px rgba(224, 100, 31, .28), inset 0 1px 0 rgba(255, 255, 255, .28); }
  .libTabsText { display: flex; flex-direction: column; gap: 3px; }
  .libTabsText i { font-style: normal; color: #a89d92; font-size: 9px; font-weight: 750; letter-spacing: .22em; }
  .libTabsText strong { color: #33291f; font-size: 19px; font-weight: 750; letter-spacing: -.02em; }
  .libTabsItems { display: flex; align-items: center; gap: 4px; }

  button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 48px;
    min-width: 128px;
    padding: 0 15px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #55525f;
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition: all 0.18s ease;

    .t-icon { color: #807b88; font-size: 18px; }
    span { display: block; font-weight: 600; line-height: 17px; }
    small { display: block; margin-left: auto; color: #aaa6af; font-size: 10px; font-weight: 400; white-space: nowrap; }

    &:hover {
      color: #e9632b;
      background: #fff7f2;
    }

    &.on {
      background: #fff0e8;
      color: #dc5f2d;
      box-shadow: inset 0 0 0 1px rgba(239, 100, 48, .12);
      .t-icon, small { color: #e56e39; }
    }
  }
}

.assetScopeBar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  padding: 10px 16px;
  margin: 0 0 14px;
  border: 1px solid #e8e7ec;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 22px rgba(42, 39, 58, 0.045);
}

.assetProjectNav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #9a969f;
  font-size: 13px;

  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #6f6b77;
    font: inherit;
    cursor: pointer;

    &:hover {
      color: #e9632b;
      background: #fff1e9;
    }
  }

  strong { color: #34313d; }
}

.scopeIntro {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-right: auto;
  color: #777482;
  font-size: 12px;

  strong {
    color: #2d2a37;
    font-size: 14px;
  }
}

.sharedAssetLabel {
  color: #8a8791;
  font-size: 12px;
}

@media (max-width: 850px) {
  .libTabs { align-items: stretch; flex-direction: column; gap: 8px; padding: 14px; }
  .libTabsItems { overflow-x: auto; }
  .libTabs button { min-width: 145px; }
  .assetScopeBar {
    flex-wrap: wrap;
  }

  .scopeIntro {
    flex-basis: 100%;
  }
}
</style>

<style lang="scss" scoped>
.assets:not(.projectOverviewPage) { padding:20px 24px; background:var(--xoi-workspace-bg,#faf8f6); overflow-y:auto; }
.assets .libTabs { min-height:58px; margin-bottom:12px; padding:9px 14px 9px 18px; border-color:var(--xoi-workspace-border,#eee7e2); border-radius:14px; background:#fff; box-shadow:none; }
.assets .libTabs button { padding:8px 12px; border-radius:10px; }
.assets .assetProjectNav { margin:0 0 12px; padding:0 4px; }
.assets .assetScopeBar { border-color:var(--xoi-workspace-border,#eee7e2); border-radius:14px; background:#fff; box-shadow:none; }
.assets :deep(.t-tabs__header),.assets .toolbar { border-color:var(--xoi-workspace-border,#eee7e2) !important; border-radius:14px !important; background:#fff !important; box-shadow:none !important; }
.assets .toolbar { gap:12px; flex-wrap:wrap; }
.assets .toolbar :deep(.t-space) { flex-wrap:wrap; }
@media(max-width:700px) { .assets:not(.projectOverviewPage) { padding:14px; } .assets .libTabsItems { max-width:100%; overflow:auto; } .assets .toolbar > .f { max-width:100%; } .assets .toolbar :deep(.t-input__wrap) { min-width:0; flex:1; } }
</style>
