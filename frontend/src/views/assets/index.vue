<template>
  <div class="assets" :class="{ projectOverviewPage: isProjectOverview }">
    <!-- 三库融合顶层切换：项目素材（生产要素）/ 我的作品（生成产物）/ 画布素材（创作素材）。方案见 docs/项目资产库-三库融合方案.md -->
    <div class="libTabs" v-if="!selectorMode">
      <button type="button" :class="{ on: libTab === 'project' }" @click="libTab = 'project'"><t-icon name="folder-open" />项目素材</button>
      <button type="button" :class="{ on: libTab === 'works' }" @click="libTab = 'works'"><t-icon name="user-circle" />我的作品</button>
      <button type="button" :class="{ on: libTab === 'canvas' }" @click="libTab = 'canvas'"><t-icon name="layers" />画布素材</button>
    </div>
    <library-projects v-if="libTab === 'project' && isProjectOverview" />
    <div class="assetProjectNav" v-if="!selectorMode && !isProjectOverview">
      <button type="button" @click="backToProjectLibrary"><t-icon name="chevron-left" />全部项目</button>
      <span>/</span>
      <strong>{{ project?.name || "当前项目" }}</strong>
    </div>
    <section class="assetHero" v-if="libTab === 'project' && !isProjectOverview"><div><span>XOi STORY WORKSPACE · ASSETS</span><h1>{{ project?.name || "项目" }} · 资产中心</h1><p>这里只管理当前项目的角色、道具、场景、素材与声音。</p></div><div class="assetHeroArt" aria-hidden="true"><i>ROLE</i><i>SCENE</i><b>+</b></div></section>
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
                  <t-button theme="primary" class="assetPrimaryBtn" v-if="assetOptions != 'clip' && assetOptions != 'audio'">
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
                <t-button class="assetSearchBtn" style="margin-left: 5px" @click="handleSearch">
                  <template #icon>
                    <t-icon name="search" />
                  </template>
                  {{ $t("workbench.assets.search") }}
                </t-button>
              </div>
            </div>
            <div class="assetsList f w">
              <t-table
                v-if="['role', 'tool', 'scene'].includes(assetOptions)"
                :columns="columns"
                :data="tableData"
                :selected-row-keys="selectedRowKeys"
                :expanded-row-keys="expandedRowKeys"
                row-key="id"
                hover
                height="calc(100vh - 300px)"
                stripe
                size="small"
                :pagination="pagination"
                :loading="loading"
                lazy-load
                table-layout="fixed"
                :select-on-row-click="false"
                @select-change="handleSelectChange"
                @expand-change="handleExpandChange"
                @page-change="handlePageChange">
                <template #expandedRow="{ row }">
                  <div class="expandedContent">
                    <t-table
                      :columns="subColumns"
                      :data="row.sonAssets || []"
                      :selected-row-keys="selectedSubRowKeys"
                      row-key="id"
                      hover
                      size="small"
                      table-layout="fixed"
                      :select-on-row-click="false"
                      @select-change="handleSubSelectChange">
                      <template #previewWithLoading="{ row: subRow }">
                        <div class="previewCell">
                          <div v-if="subRow.state === '生成中'" class="imageTrigger generatingImage">
                            <t-loading size="small" />
                            <span class="generatingLabel">{{ $t("workbench.assets.generating") }}</span>
                          </div>
                          <t-image-viewer v-else :images="[subRow.src]" :closeOnEscKeydown="true" :closeOnOverlay="true">
                            <template #trigger="{ open }">
                              <div class="imageTrigger" @click="subRow.src && getBigImageUrl(subRow, open())">
                                <img v-if="subRow.src" :src="subRow.src" :alt="subRow.name" class="previewImage" />
                                <div v-else class="noImage">
                                  <t-icon name="image" size="24px" />
                                </div>
                                <div v-if="subRow.src" class="imageHoverOverlay">
                                  <t-icon name="browse" size="20px" />
                                  <span class="hoverText">{{ $t("workbench.assets.preview") }}</span>
                                </div>
                              </div>
                            </template>
                          </t-image-viewer>
                        </div>
                      </template>
                      <template #prompt="{ row: subRow }">
                        <div class="promptCell">
                          <t-loading v-if="subRow.promptState === '生成中'" size="small" style="margin-right: 4px" />
                          <span :class="{ 'generating-text': subRow.promptState === '生成中' }">{{ subRow.prompt }}</span>
                        </div>
                      </template>
                      <template #operation="{ row: subRow }">
                        <t-space :size="0">
                          <t-tooltip content="生成">
                            <t-button theme="primary" variant="text" :disabled="isGenerating(subRow.id)" @click="generate(subRow)">
                              <template #icon><i-magic :size="18" /></template>
                            </t-button>
                          </t-tooltip>
                          <t-tooltip content="编辑">
                            <t-button theme="primary" variant="text" @click="handleEdit(subRow)">
                              <template #icon><t-icon name="edit" /></template>
                            </t-button>
                          </t-tooltip>
                          <t-tooltip content="发送到画布">
                            <t-button theme="primary" variant="text" @click="sendSingleToCanvas(subRow)">
                              <template #icon><t-icon name="send" /></template>
                            </t-button>
                          </t-tooltip>
                          <t-tooltip content="删除">
                            <t-button theme="danger" variant="text" :disabled="isGenerating(subRow.id)" @click="handleDelete(subRow)">
                              <template #icon><t-icon name="delete" /></template>
                            </t-button>
                          </t-tooltip>
                        </t-space>
                      </template>
                    </t-table>
                  </div>
                </template>
                <template #preview="{ row }">
                  <div class="previewCell">
                    <t-image-viewer :images="[row.src]" :closeOnEscKeydown="true" :closeOnOverlay="true">
                      <template #trigger="{ open }">
                        <div class="imageTrigger" @click="row.src && getBigImageUrl(row, open())">
                          <img v-if="row.src" :src="row.src" :alt="row.name" class="previewImage" />
                          <div v-else class="noImage">
                            <t-icon name="image" size="24px" />
                          </div>
                          <div v-if="row.src" class="imageHoverOverlay">
                            <t-icon name="browse" size="20px" />
                            <span class="hoverText">{{ $t("workbench.assets.preview") }}</span>
                          </div>
                        </div>
                      </template>
                    </t-image-viewer>
                  </div>
                </template>
                <template #prompt="{ row }">
                  <div class="promptCell">
                    <t-loading v-if="row.promptState === '生成中'" size="small" style="margin-right: 4px" />
                    <span :class="{ 'generating-text': row.promptState === '生成中' }">{{ row.prompt }}</span>
                  </div>
                </template>
                <template #scriptNames="{ row }">
                  <t-tag v-if="row.scriptNames?.length" size="small" variant="light" theme="primary">
                    {{ row.scriptNames.join("、") }}
                  </t-tag>
                  <span v-else class="sharedAssetLabel">项目公共库</span>
                </template>
                <template #previewWithLoading="{ row }">
                  <div class="previewCell">
                    <div v-if="row.state === '生成中'" class="imageTrigger generatingImage">
                      <t-loading size="small" />
                      <span class="generatingLabel">{{ $t("workbench.assets.generating") }}</span>
                    </div>
                    <t-image-viewer v-else :images="[row.src]" :closeOnEscKeydown="true" :closeOnOverlay="true">
                      <template #trigger="{ open }">
                        <div class="imageTrigger" @click="row.src && getBigImageUrl(row, open())">
                          <img v-if="row.src" :src="row.src" :alt="row.name" class="previewImage" />
                          <div v-else class="noImage">
                            <t-icon name="image" size="24px" />
                          </div>
                          <div v-if="row.src" class="imageHoverOverlay">
                            <t-icon name="browse" size="20px" />
                            <span class="hoverText">{{ $t("workbench.assets.preview") }}</span>
                          </div>
                        </div>
                      </template>
                    </t-image-viewer>
                  </div>
                </template>
                <template #startTime="{ row }">
                  <span>{{ dayjs(row.startTime).format("YYYY-MM-DD HH:mm:ss") }}</span>
                </template>
                <template #operation="{ row }">
                  <t-space :size="0">
                    <t-tooltip content="生成">
                      <t-button theme="primary" variant="text" :disabled="isGenerating(row.id)" @click="generate(row)">
                        <template #icon><i-magic :size="18" /></template>
                      </t-button>
                    </t-tooltip>
                    <t-tooltip content="编辑">
                      <t-button theme="primary" variant="text" @click="handleEdit(row)">
                        <template #icon><t-icon name="edit" /></template>
                      </t-button>
                    </t-tooltip>
                    <t-tooltip content="发送到画布">
                      <t-button theme="primary" variant="text" @click="sendSingleToCanvas(row)">
                        <template #icon><t-icon name="send" /></template>
                      </t-button>
                    </t-tooltip>
                    <t-tooltip content="删除">
                      <t-button theme="danger" variant="text" :disabled="isGenerating(row.id)" @click="handleDelete(row)">
                        <template #icon><t-icon name="delete" /></template>
                      </t-button>
                    </t-tooltip>
                  </t-space>
                </template>
              </t-table>
              <t-table
                v-if="assetOptions == 'clip'"
                :columns="clipColumns"
                :data="tableData"
                :selected-row-keys="selectedRowKeys"
                :expanded-row-keys="expandedRowKeys"
                row-key="id"
                hover
                stripe
                size="small"
                :pagination="pagination"
                :loading="loading"
                lazy-load
                table-layout="fixed"
                @select-change="handleSelectChange"
                @expand-change="handleExpandChange"
                @page-change="handlePageChange">
                <template #preview="{ row }">
                  <div class="previewCell">
                    <t-image-viewer v-if="getMediaType(row.src) === 'image'" :images="[row.src]" :closeOnEscKeydown="true" :closeOnOverlay="true">
                      <template #trigger="{ open }">
                        <div class="mediaTrigger" @click="row.src && open()">
                          <img :src="row.src" :alt="row.name" />
                          <div class="mediaHoverOverlay">
                            <t-icon name="browse" size="20px" />
                            <span class="hoverText">{{ $t("workbench.assets.preview") }}</span>
                          </div>
                        </div>
                      </template>
                    </t-image-viewer>
                    <div v-else-if="getMediaType(row.src) === 'video'" class="mediaTrigger videoThumb" @click="openMediaPreview(row.src, row.name)">
                      <video :src="row.src" class="thumbVideo" />
                      <div class="mediaHoverOverlay">
                        <t-icon name="play-circle" size="24px" />
                        <span class="hoverText">{{ $t("workbench.assets.play") }}</span>
                      </div>
                    </div>
                    <div v-else-if="getMediaType(row.src) === 'audio'" class="mediaTrigger audioThumb" @click="openMediaPreview(row.src, row.name)">
                      <t-icon name="music" size="28px" />
                      <div class="mediaHoverOverlay">
                        <t-icon name="play-circle" size="24px" />
                        <span class="hoverText">{{ $t("workbench.assets.play") }}</span>
                      </div>
                    </div>
                    <div v-else class="mediaTrigger noMedia">
                      <t-icon name="image" size="24px" />
                    </div>
                  </div>
                </template>
                <template #startTime="{ row }">
                  <span>{{ dayjs(row.startTime).format("YYYY-MM-DD HH:mm:ss") }}</span>
                </template>
                <template #scriptNames="{ row }">
                  <t-tag v-if="row.scriptNames?.length" size="small" variant="light" theme="primary">{{ row.scriptNames.join("、") }}</t-tag>
                  <span v-else class="sharedAssetLabel">项目公共库</span>
                </template>
                <template #operation="{ row }">
                  <t-space :size="0">
                    <t-tooltip content="编辑">
                      <t-button theme="primary" variant="text" @click="handleEdit(row)">
                        <template #icon><t-icon name="edit" /></template>
                      </t-button>
                    </t-tooltip>
                    <t-tooltip content="发送到画布" v-if="row.src && getMediaType(row.src) === 'image'">
                      <t-button theme="primary" variant="text" @click="sendSingleToCanvas(row)">
                        <template #icon><t-icon name="send" /></template>
                      </t-button>
                    </t-tooltip>
                    <t-tooltip content="删除">
                      <t-button theme="danger" variant="text" @click="handleDelete(row)">
                        <template #icon><t-icon name="delete" /></template>
                      </t-button>
                    </t-tooltip>
                  </t-space>
                </template>
              </t-table>
              <t-table
                v-if="assetOptions == 'audio'"
                :columns="audioColumns"
                :data="tableData"
                :selected-row-keys="selectedRowKeys"
                :expanded-row-keys="expandedRowKeys"
                row-key="id"
                hover
                stripe
                size="small"
                :pagination="pagination"
                :loading="loading"
                lazy-load
                table-layout="fixed"
                @select-change="handleSelectChange"
                @expand-change="handleExpandChange"
                @page-change="handlePageChange">
                <template #expandedRow="{ row }" v-if="!selectorMode">
                  <div class="expandedContent">
                    <t-table
                      :columns="subAudioColumns"
                      :data="row.sonAssets || []"
                      :selected-row-keys="selectedSubRowKeys"
                      row-key="id"
                      hover
                      size="small"
                      table-layout="fixed"
                      stripe
                      :select-on-row-click="false"
                      @select-change="handleSubSelectChange">
                      <template #previewWithLoading="{ row: subRow }">
                        <div class="previewCell">
                          <div class="mediaTrigger audioThumb" @click="openMediaPreview(subRow.src, subRow.name)">
                            <t-icon name="music" size="28px" />
                            <div class="mediaHoverOverlay">
                              <t-icon name="play-circle" size="24px" />
                              <span class="hoverText">{{ $t("workbench.assets.play") }}</span>
                            </div>
                          </div>
                        </div>
                      </template>
                      <template #prompt="{ row: subRow }">
                        <div class="promptCell">
                          <span>{{ subRow.prompt }}</span>
                        </div>
                      </template>
                      <template #operation="{ row: subRow }">
                        <t-space :size="0">
                          <t-tooltip content="删除">
                            <t-button theme="danger" variant="text" :disabled="isGenerating(subRow.id)" @click="handleDelete(subRow)">
                              <template #icon><t-icon name="delete" /></template>
                            </t-button>
                          </t-tooltip>
                        </t-space>
                      </template>
                    </t-table>
                  </div>
                </template>
                <template #preview="{ row }">
                  <div class="previewCell">
                    <div class="mediaTrigger audioThumb" @click="openMediaPreview(row.src, row.name)">
                      <t-icon name="music" size="28px" />
                      <div class="mediaHoverOverlay">
                        <t-icon name="play-circle" size="24px" />
                        <span class="hoverText">{{ $t("workbench.assets.play") }}</span>
                      </div>
                    </div>
                  </div>
                </template>
                <template #startTime="{ row }">
                  <span>{{ dayjs(row.startTime).format("YYYY-MM-DD HH:mm:ss") }}</span>
                </template>
                <template #operation="{ row }">
                  <t-space :size="0">
                    <t-tooltip content="编辑">
                      <t-button theme="primary" variant="text" @click="handleEdit(row)">
                        <template #icon><t-icon name="edit" /></template>
                      </t-button>
                    </t-tooltip>
                    <t-tooltip content="删除">
                      <t-button theme="danger" variant="text" @click="handleDelete(row)">
                        <template #icon><t-icon name="delete" /></template>
                      </t-button>
                    </t-tooltip>
                  </t-space>
                </template>
              </t-table>
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
      <library-works v-if="libTab === 'works'" />
      <library-canvas v-if="libTab === 'canvas'" />
  </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import modelSelect from "@/components/modelSelect.vue";
import { useFileDialog } from "@vueuse/core";
import axios from "@/utils/axios";
import type { TabValue, TableProps } from "tdesign-vue-next";
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
    const raw = localStorage.getItem('canvas_save_result')
    if (!raw) return
    const result = JSON.parse(raw)
    if (Date.now() - result.timestamp > 5 * 60 * 1000) {
      localStorage.removeItem('canvas_save_result')
      return
    }
    localStorage.removeItem('canvas_save_result') // 先清，防重复处理 / 异常残留
    if (!result.images || result.images.length === 0) return
    window.$message?.success(`已从画布返回 ${result.images.length} 张图片，正在更新…`)
    await Promise.all(
      (result.images as Array<{ id?: number; src?: string }>).map(async (img) => {
        if (!img.id || !img.src) return
        let filePath = img.src
        try { filePath = new URL(filePath, window.location.origin).pathname } catch { /* 已是相对路径 */ }
        if (filePath.startsWith('/oss/')) filePath = filePath.slice(4) // getSmallImageUrl→getFileUrl 会自动加回 /oss/
        try {
          const { data } = await axios.post('/assetsGenerate/saveCanvasResult', { id: img.id, filePath })
          const target = tableData.value.find((i) => i.id === img.id)
          if (target && data.imageId) {
            target.filePath = filePath
            target.imageId = data.imageId
            target.state = '已完成'
            target.src = filePath // UI 即时切到新图（沿用 pollingImageAssets 做法）
          }
        } catch (e) {
          console.error('保存画布结果失败:', e)
        }
      }),
    )
    window.$message?.success('画布结果已保存')
    await loadCurrentTabData() // 重拉以同步子资产 / 分页计数 / 最新状态
  } catch (e) {
    console.error('检查画布保存结果失败:', e)
    localStorage.removeItem('canvas_save_result')
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
    const { data } = await axios.post("/project/getSingleProject", { id: projectId });
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
  type: "role" | "tool" | "scene" | "clip"; // "角色" | "道具" | "场景" | "素材"
  state: string;
  sonAssets?: Asset[]; // 子资产列表
  imageId: number;
  promptState: string;
  filePath: string;
  scriptNames?: string[];
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
const columns: TableProps["columns"] = [
  {
    colKey: "row-select",
    type: selectType,
    width: 50,
    align: "center",
    fixed: "left",
    disabled: (row: any) => isGenerating(row.row?.id ?? row.id),
  },
  {
    colKey: "src",
    title: $t("workbench.assets.colPreview"),
    width: 100,
    align: "center",
    cell: "previewWithLoading",
  },
  {
    colKey: "name",
    title: $t("workbench.assets.colName"),
    width: 100,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "scriptNames",
    title: "归属剧本",
    width: 180,
    align: "left",
    ellipsis: true,
    cell: "scriptNames",
  },
  {
    colKey: "prompt",
    title: $t("workbench.assets.colPrompt"),
    width: 200,
    align: "left",
    ellipsis: true,
    cell: "prompt",
  },
  {
    colKey: "describe",
    title: $t("workbench.assets.colDescribe"),
    width: 200,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "remark",
    title: $t("workbench.assets.colRemark"),
    minWidth: 200,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "startTime",
    title: $t("workbench.assets.colCreateTime"),
    width: 200,
    align: "center",
    cell: "startTime",
  },
  {
    colKey: "operation",
    title: $t("workbench.assets.colOperation"),
    width: 200,
    align: "center",
    fixed: "right",
    cell: "operation",
  },
];

// 子资产表格列配置
const subColumns: TableProps["columns"] = [
  {
    colKey: "row-select",
    type: selectType,
    width: 50,
    align: "center",
    fixed: "left",
  },
  {
    colKey: "src",
    title: $t("workbench.assets.colPreview"),
    width: 100,
    align: "center",
    cell: "previewWithLoading",
  },
  {
    colKey: "name",
    title: $t("workbench.assets.colName"),
    width: 100,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "prompt",
    title: $t("workbench.assets.colPrompt"),
    width: 200,
    align: "left",
    ellipsis: true,
    cell: "prompt",
  },
  {
    colKey: "describe",
    title: $t("workbench.assets.colDescribe"),
    width: 100,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "remark",
    title: $t("workbench.assets.colRemark"),
    minWidth: 150,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "operation",
    title: $t("workbench.assets.colOperation"),
    width: 200,
    align: "center",
    fixed: "right",
    cell: "operation",
  },
];

//剪辑表格列配置
const clipColumns: TableProps["columns"] = [
  { colKey: "row-select", type: "multiple", width: 50, align: "center", fixed: "left" },
  {
    colKey: "name",
    title: $t("workbench.assets.colName"),
    width: 200,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "describe",
    title: $t("workbench.assets.colDescribe"),
    width: 200,
    align: "left",
    ellipsis: true,
  },
  { colKey: "scriptNames", title: "归属剧本", width: 180, align: "left", ellipsis: true, cell: "scriptNames" },
  {
    colKey: "remark",
    title: $t("workbench.assets.colRemark"),
    minWidth: 200,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "startTime",
    title: $t("workbench.assets.colCreateTime"),
    width: 200,
    align: "center",
    cell: "startTime",
  },
  {
    colKey: "operation",
    title: $t("workbench.assets.colOperation"),
    width: 180,
    align: "center",
    fixed: "right",
    cell: "operation",
  },
];
const audioColumns: TableProps["columns"] = [
  { colKey: "row-select", type: selectType, width: 50, align: "center", fixed: "left" },
  {
    colKey: "name",
    title: $t("workbench.assets.audioName"),
    width: 200,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "sex",
    title: $t("workbench.assets.sex"),
    width: 200,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "describe",
    title: $t("workbench.assets.colDescribe"),
    width: 200,
    align: "left",
    ellipsis: true,
  },
  { colKey: "scriptNames", title: "归属剧本", width: 180, align: "left", ellipsis: true, cell: "scriptNames" },
  {
    colKey: "startTime",
    title: $t("workbench.assets.colCreateTime"),
    width: 200,
    align: "center",
    cell: "startTime",
  },
  {
    colKey: "operation",
    title: $t("workbench.assets.colOperation"),
    width: 180,
    align: "center",
    fixed: "right",
    cell: "operation",
  },
];
const subAudioColumns: TableProps["columns"] = [
  {
    colKey: "row-select",
    type: selectType,
    width: 50,
    align: "center",
    fixed: "left",
  },
  {
    colKey: "src",
    title: $t("workbench.assets.colPreview"),
    width: 100,
    align: "center",
    cell: "previewWithLoading",
  },
  {
    colKey: "prompt",
    title: $t("workbench.assets.audioText"),
    width: 100,
    align: "left",
    ellipsis: true,
  },
  {
    colKey: "operation",
    title: $t("workbench.assets.colOperation"),
    width: 200,
    align: "center",
    fixed: "right",
    cell: "operation",
  },
];
// 选择行（正在生成中的行不允许勾选）
function handleSelectChange(value: Array<string | number>) {
  const filtered = value.filter((key) => !isGenerating(key as number));
  if (!props.multiple) {
    selectedRowKeys.value = filtered.length > 0 ? [filtered[filtered.length - 1]] : [];
  } else {
    selectedRowKeys.value = filtered;
  }
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
// 子资产选择行
function handleSubSelectChange(value: Array<string | number>) {
  if (!props.multiple) {
    selectedSubRowKeys.value = value.length > 0 ? [value[value.length - 1]] : [];
  } else {
    selectedSubRowKeys.value = value;
  }
}
function handleExpandChange(value: Array<string | number>) {
  if (value.length > 3) {
    value = value.slice(-3);
  }
  expandedRowKeys.value = value;
}

// 处理分页变化
function handlePageChange(pageInfo: { current: number; pageSize: number }) {
  pagination.value.page = pageInfo.current;
  pagination.value.pageSize = pageInfo.pageSize;
  loadCurrentTabData();
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
.assets {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .data {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    :deep(.t-tabs) {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;

      .t-tabs__header {
        background: var(--material-thin);
        backdrop-filter: var(--blur-heavy);
        -webkit-backdrop-filter: var(--blur-heavy);
        border: 1px solid var(--material-border-light);
        border-radius: 14px;
        padding: 6px 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }

      .t-tabs__nav-item {
        font-size: 13px;
        font-weight: 500;
        border-radius: 10px;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        &:hover {
          background: rgba(0, 212, 255, 0.06);
        }
        &.t-is-active {
          color: #00d4ff;
          background: rgba(0, 212, 255, 0.08);
        }
      }

      .t-tabs__bar {
        background: linear-gradient(90deg, #00d4ff, #7b61ff);
        height: 2.5px;
        border-radius: 2px;
      }

      .t-tabs__content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .t-tab-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
    }

    .tabLabel {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .panelContent {
      margin-top: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;

      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding: 14px 18px;
        background: var(--material-thin);
        backdrop-filter: var(--blur-heavy);
        -webkit-backdrop-filter: var(--blur-heavy);
        border: 1px solid var(--material-border-light);
        border-radius: 14px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);

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
          }
        }
      }

      .data {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .assetsList {
        flex: 1;
        overflow-y: auto;
        min-height: 0;

        :deep(.t-table) {
          background: var(--material-thin);
          backdrop-filter: var(--blur-heavy);
          -webkit-backdrop-filter: var(--blur-heavy);
          border: 1px solid var(--material-border-light);
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);

          .t-table__header {
            background: rgba(0, 0, 0, 0.02);
            th {
              font-size: 13px;
              font-weight: 600;
              border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
          }

          .t-table__body {
            tr {
              transition: background 0.2s ease;
              &:hover {
                background: rgba(123, 97, 255, 0.04) !important;
              }
              td {
                border-bottom: 1px solid rgba(0, 0, 0, 0.04);
              }
            }
            /* 去掉斑马纹 */
            tr:nth-child(even) {
              background: transparent;
            }
          }

          /* 滚动条 */
          .t-table__content {
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
        }

        .expandedContent {
          padding: 16px 24px;
          border-radius: 10px;
          margin: 8px 0;
          background: rgba(0, 0, 0, 0.015);
        }

        .promptCell {
          display: flex;
          align-items: center;
          gap: 4px;

          .generating-text {
            font-style: italic;
            color: #00d4ff;
          }
        }

        .generatingImage {
          flex-direction: column;
          gap: 6px;
          cursor: default;

          &:hover {
            transform: none !important;
          }

          .generatingLabel {
            font-size: 11px;
            color: #00d4ff;
          }
        }
      }

      .previewCell {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 4px 0;

        .imageTrigger {
          position: relative;
          width: 72px;
          height: 72px;
          border-radius: 10px;
          overflow: hidden;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

          &:hover {
            transform: scale(1.08);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);

            .imageHoverOverlay {
              opacity: 1;
            }
          }

          img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .previewImage {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .noImage {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.04);
            color: rgba(0, 0, 0, 0.25);
          }

          .imageHoverOverlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.3s ease;
            color: white;

            .hoverText {
              font-size: 11px;
              font-weight: 500;
            }
          }
        }

        .mediaTrigger {
          position: relative;
          width: 72px;
          height: 72px;
          border-radius: 10px;
          overflow: hidden;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

          &:hover {
            transform: scale(1.08);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);

            .mediaHoverOverlay {
              opacity: 1;
            }
          }

          img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          &.videoThumb {
            background: #1a1a2e;

            .thumbVideo {
              width: 100%;
              height: 100%;
              object-fit: cover;
              pointer-events: none;
            }
          }

          &.audioThumb {
            background: linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(123, 97, 255, 0.12));
            color: #6366f1;
          }

          &.noMedia {
            cursor: default;
            background: rgba(0, 0, 0, 0.03);

            &:hover {
              transform: none;
            }
          }

          .mediaHoverOverlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.3s ease;
            color: white;

            .hoverText {
              font-size: 11px;
              font-weight: 500;
            }
          }
        }
      }
    }
  }
}
</style>

<style lang="scss">
/* 分页器 */
.t-pagination {
  margin-top: 12px;
}
</style>

<style lang="scss">
.assets {
  box-sizing:border-box; padding:22px 32px 24px; background:radial-gradient(circle at 92% 0,rgba(255,174,119,.15),transparent 22%),linear-gradient(180deg,#faf9fb,#f5f5f7);
  &.projectOverviewPage { display: block; padding: 0; overflow: auto; }
  .assetHero { position:relative; min-height:132px; flex:none; margin-bottom:14px; padding:25px 31px; overflow:hidden; border:1px solid rgba(89,76,148,.11); border-radius:23px; background:radial-gradient(circle at 86% 10%,rgba(255,151,91,.27),transparent 25%),linear-gradient(132deg,#fff,#f6f2ff 58%,#fff3ea); box-shadow:0 15px 38px rgba(58,49,99,.07); }
  .assetHero>div:first-child{position:relative;z-index:2}.assetHero span{color:#e76c2d;font-size:10px;font-weight:750;letter-spacing:.17em}.assetHero h1{margin:8px 0 5px;color:#292733;font-size:32px;line-height:1.05;letter-spacing:-.04em}.assetHero p{margin:0;color:#777482;font-size:13px}
  .assetHeroArt{position:absolute;top:17px;right:5%;display:flex;align-items:center;gap:7px;transform:rotate(-5deg)}.assetHeroArt i{display:grid;place-items:center;width:82px;height:88px;border-radius:17px;color:#fff;font-size:10px;font-style:normal;font-weight:700;letter-spacing:.1em;box-shadow:0 14px 28px rgba(66,53,108,.15)}.assetHeroArt i:first-child{background:linear-gradient(145deg,#8d7ce8,#5c50b7)}.assetHeroArt i:nth-child(2){margin-top:17px;background:linear-gradient(145deg,#ff9b61,#e75f42)}.assetHeroArt b{position:absolute;left:72px;top:36px;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#fff;color:#544d70;box-shadow:0 7px 15px rgba(60,53,89,.16)}
  .t-tabs__header{border:1px solid #e8e7ec !important;border-radius:16px !important;background:rgba(255,255,255,.88) !important;box-shadow:0 8px 22px rgba(42,39,58,.045) !important}.t-tabs__nav-item.t-is-active{color:#e9632b !important;background:#fff2ea !important}.t-tabs__bar{background:#f26b35 !important}
  .panelContent .toolbar{border:1px solid #e8e7ec !important;border-radius:16px !important;background:rgba(255,255,255,.9) !important;box-shadow:0 8px 22px rgba(42,39,58,.045) !important}
  .assetPrimaryBtn,.assetSearchBtn{border-color:transparent !important;background:linear-gradient(135deg,#ff8847,#f26432) !important;color:#fff !important;box-shadow:0 7px 16px rgba(239,100,48,.18) !important}.assetPrimaryBtn .t-button__text,.assetPrimaryBtn .t-icon,.assetSearchBtn .t-button__text,.assetSearchBtn .t-icon{color:#fff !important}
  .t-button--theme-primary.t-button--variant-outline:not(:disabled){border-color:#f1a27e !important;background:#fff7f2 !important;color:#df5f29 !important}.t-button--theme-primary.t-button--variant-outline:not(:disabled) .t-button__text,.t-button--theme-primary.t-button--variant-outline:not(:disabled) .t-icon{color:#df5f29 !important}
  .t-button--theme-primary.t-button--variant-text:not(:disabled){background:transparent !important;color:#e9632b !important;box-shadow:none !important}.t-button--theme-primary.t-button--variant-text:not(:disabled) .t-button__text,.t-button--theme-primary.t-button--variant-text:not(:disabled) .t-icon{color:#e9632b !important}
  .t-button:disabled{border-color:#e5e4e8 !important;background:#efeff1 !important;color:#9c9aa2 !important}.t-button:disabled .t-button__text,.t-button:disabled .t-icon{color:#9c9aa2 !important}
  .assetsList .t-table{border:1px solid #e8e7ec !important;border-radius:18px !important;background:#fff !important;box-shadow:0 10px 28px rgba(40,37,54,.055) !important}.assetsList .t-table__header th{background:#f8f8fa !important;color:#55525f !important}.t-pagination__number.t-is-current{border:0 !important;background:#f26b35 !important;color:#fff !important}
}
@media(max-width:850px){.assets{padding:16px}.assets .assetHeroArt{right:-55px;opacity:.4}.assets .assetHero>div:first-child{max-width:70%}}
</style>

<style lang="scss" scoped>
/* 三库融合顶层切换（项目素材 / 我的作品 / 画布素材） */
.libTabs {
  display: inline-flex;
  gap: 4px;
  padding: 5px;
  margin-bottom: 14px;
  border: 1px solid #e8e7ec;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 22px rgba(42, 39, 58, 0.045);

  button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 38px;
    padding: 0 18px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #55525f;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.18s ease;

    &:hover {
      color: #e9632b;
      background: #fff7f2;
    }

    &.on {
      background: linear-gradient(135deg, #ff8847, #f26432);
      color: #fff;
      font-weight: 600;
      box-shadow: 0 7px 16px rgba(239, 100, 48, 0.18);
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
  .assetScopeBar {
    flex-wrap: wrap;
  }

  .scopeIntro {
    flex-basis: 100%;
  }
}
</style>
