<template>
  <div class="modelServe">
    <!-- 左侧供应商列表 -->
    <div class="modelList">
      <div class="listFooter">
        <t-button block theme="primary" @click="handleAddVendor">
          <template #icon><t-icon name="add" /></template>
          {{ $t("settings.vendor.addVendor") }}
        </t-button>
      </div>
      <div class="listContent" v-loading="loading">
        <t-menu v-model="activeVendorId" theme="light" v-if="vendorList.length > 0">
          <t-menu-item v-for="(item, index) in vendorList" :key="index" :value="item.id" @click="activeVendorId = item.id" class="providerItem">
            <template #icon>
              <t-avatar v-if="isValidBase64(item.icon)" size="24px" shape="round" :image="item.icon" />
              <span v-else class="providerInitial">{{ item.name.slice(0, 1).toUpperCase() }}</span>
            </template>
            <span class="providerName" :title="item.name">{{ item.name }}</span>
            <t-switch
              v-model="item.enable"
              :customValue="[1, 0]"
              @click.stop
              @change="(val: any) => onChange(item, val)"
              class="providerSwitch"></t-switch>
          </t-menu-item>
        </t-menu>

        <t-empty v-else :title="$t('settings.vendor.noVendor')" style="margin-top: 16px"></t-empty>
      </div>
    </div>
    <!-- 右侧配置面板 -->
    <div v-if="currentVendor" class="modelParameter">
      <div class="providerHero">
        <div class="providerIdentity"><span class="providerGlyph">{{ currentVendor.name.slice(0,1) }}</span><div><span class="providerEyebrow">MODEL PROVIDER</span><h3>{{ currentVendor.name }}</h3><p>{{ vendorModels.length }} 个模型 · {{ currentVendor.enable ? '服务已启用' : '服务已停用' }}</p></div></div>
        <span class="saveState">{{ autoUpdating ? '正在保存…' : '配置自动保存' }}</span>
      </div>
      <div class="configuration">
        <t-form :data="currentVendor" labelAlign="top">
          <div class="infoBox ac jb">
            <span class="idBox">#{{ currentVendor.id }}</span>
            <span class="author">@{{ currentVendor.author }}</span>
          </div>
          <t-alert
            v-if="needsUpdate(currentVendor)"
            theme="warning"
            :message="$t('settings.vendor.msg.vendorNeedsUpdate')"
            style="margin-bottom: 12px" />
          <t-form-item>
            <MdPreview v-model="currentVendor.description" :theme="resolveThemeMode(themeSetting.mode)" />
          </t-form-item>
          <t-form-item v-for="input in requiredInputs" :key="input.key" :name="input.key">
            <template #label>
              <span class="requiredLabel">
                {{ input.label }}
                <span class="requiredMark">*</span>
                <span class="requiredText">{{ $t("settings.vendor.required") }}</span>
              </span>
            </template>
            <t-input v-model="currentVendor.inputValues[input.key]" :type="input.type" clearable @blur="onBlurFn">
              <template #prefix-icon>
                <t-icon :name="getInputIcon(input.type)" />
              </template>
            </t-input>
            <template #help v-if="getInputPlaceholder(input)">
              <span class="inputHelp">{{ getInputPlaceholder(input) }}</span>
            </template>
          </t-form-item>

          <div v-if="optionalInputs.length > 0" class="optionalSection">
            <t-collapse>
              <t-collapse-panel value="optional-inputs" :header="$t('settings.vendor.optionalSection')">
                <t-form-item v-for="input in optionalInputs" :key="input.key" :name="input.key" :label="input.label">
                  <t-input v-model="currentVendor.inputValues[input.key]" :type="input.type" clearable @blur="onBlurFn">
                    <template #prefix-icon>
                      <t-icon :name="getInputIcon(input.type)" />
                    </template>
                  </t-input>
                  <template #help v-if="getInputPlaceholder(input)">
                    <span class="inputHelp">{{ getInputPlaceholder(input) }}</span>
                  </template>
                </t-form-item>
              </t-collapse-panel>
            </t-collapse>
          </div>

          <div class="jb ac">
            <div><h4 class="sectionTitle">模型能力</h4><p class="sectionHint">按用途管理模型，创作时不会再混淆</p></div>
            <div class="ac">
              <t-button variant="outline" size="small" @click="handleFetchModels" style="margin-right: 8px">
                <template #icon><i-refresh theme="outline" /></template>
                获取模型
              </t-button>
              <t-button variant="outline" size="small" @click="handleAddModel">
                <template #icon><i-plus theme="outline" /></template>
                {{ $t("settings.vendor.addManually") }}
              </t-button>
            </div>
          </div>
          <div class="modelTypeTabs">
            <button v-for="tab in modelTabs" :key="tab.value" type="button" :class="{active:modelFilter===tab.value}" @click="modelFilter=tab.value"><span>{{ tab.icon }}</span>{{ tab.label }} <b>{{ tab.count }}</b></button>
          </div>
          <t-card v-for="(item, index) in filteredVendorModels" :key="index" class="modelCard" :class="`model-${item.type}`">
            <div class="topInfo jb ac">
              <div class="modelCardNameWrap">
                <t-avatar v-if="getModelLogo(item.modelName)" size="24px" shape="round" :image="getModelLogo(item.modelName)!" />
                <span class="modelCardName">{{ item.name }}</span>
              </div>
              <div class="actionBtns">
                <t-button size="small" variant="text" @click="handleTestModel(item)">
                  <template #icon><i-lightning theme="outline" /></template>
                  {{ $t("settings.vendor.testModel") }}
                </t-button>
                <t-button variant="text" size="small" @click="handleEditModel(item)">
                  <template #icon><i-pencil theme="outline" /></template>
                  {{ $t("settings.vendor.edit") }}
                </t-button>
                <t-button variant="text" size="small" theme="danger" @click="handleDeleteModel(item.modelName)">
                  <template #icon><i-delete theme="outline" /></template>
                  {{ $t("settings.vendor.delete") }}
                </t-button>
              </div>
            </div>
            <div class="tags">
              <t-tag :theme="item.type === 'video' ? 'warning' : item.type === 'image' ? 'success' : 'primary'">{{ item.type === 'text' ? '文本生成' : item.type === 'image' ? '图片生成' : '视频生成' }}</t-tag>
              <t-tag v-if="item.type === 'text' && (item as any).think" variant="light">{{ $t("settings.vendor.think") }}</t-tag>
              <template v-for="(mode, mIdx) in (item as any).mode" :key="mIdx">
                <t-tag v-if="!Array.isArray(mode)" variant="light">{{ getModeLabel(mode, item.type) }}</t-tag>
                <t-tag v-else variant="light" v-for="(m, mmIdx) in mode" :key="mmIdx">
                  {{ getModeLabel(m, item.type) }}
                </t-tag>
              </template>
            </div>
          </t-card>
        </t-form>
        <div class="updateAction">
          <t-button theme="danger" :loading="updating" @click="handleDeleteVendor">{{ $t("settings.vendor.deleteVendor") }}</t-button>
          <t-button theme="default" :loading="updating" @click="handleEditVendorCode">{{ $t("settings.vendor.editCode") }}</t-button>
          <!-- <t-button theme="primary" :loading="updating" @click="handleUpdateVendor">{{ $t("settings.vendor.updateConfig") }}</t-button> -->
        </div>
      </div>
    </div>

    <!-- 添加模型弹窗 -->
    <t-dialog
      placement="center"
      width="40vw"
      v-model:visible="modelDialogVisible"
      :header="editingModelIndex === null ? $t('settings.vendor.addModel') : $t('settings.vendor.editModel')"
      :maskClosable="false"
      @confirm="handleConfirmModel">
      <div class="addBox">
        <t-form :data="modelFormData" labelAlign="top">
          <t-form-item name="name" :label="$t('settings.vendor.displayName')">
            <t-input v-model="modelFormData.name" :placeholder="$t('settings.vendor.displayNamePlaceholder')" clearable />
          </t-form-item>

          <t-form-item name="modelName" :label="$t('settings.vendor.modelId')">
            <t-input v-model="modelFormData.modelName" :placeholder="$t('settings.vendor.modelIdPlaceholder')" clearable />
          </t-form-item>

          <t-form-item name="type" :label="$t('settings.vendor.modelType')">
            <t-select v-model="modelFormData.type">
              <t-option v-for="item in modelTypeOptions" :key="item.value" :value="item.value">{{ $t(item.label) }}</t-option>
            </t-select>
          </t-form-item>
          <template v-if="modelFormData.type === 'text'">
            <t-form-item name="think" :label="$t('settings.vendor.think')">
              <t-radio-group v-model="modelFormData.think">
                <t-radio :value="true">{{ $t("settings.vendor.supported") }}</t-radio>
                <t-radio :value="false">{{ $t("settings.vendor.notSupported") }}</t-radio>
              </t-radio-group>
            </t-form-item>
          </template>

          <template v-if="modelFormData.type === 'image'">
            <t-form-item name="mode" :label="$t('settings.vendor.imageMode')">
              <t-checkbox-group v-model="modelFormData.mode">
                <t-checkbox v-for="opt in imageModeOptions" :key="opt.value" :value="opt.value">{{ $t(opt.label) }}</t-checkbox>
              </t-checkbox-group>
            </t-form-item>
          </template>

          <template v-if="modelFormData.type === 'video'">
            <t-form-item name="mode" :label="$t('settings.vendor.videoMode')">
              <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0">
                <t-checkbox-group v-model="modelFormData.mode">
                  <t-checkbox v-for="opt in videoModeOptions" :key="opt.value" :value="opt.value">{{ $t(opt.label) }}</t-checkbox>
                </t-checkbox-group>
                <div
                  v-if="modelFormData.mode.includes('multiReference')"
                  style="border: 1px solid #ddd; border-radius: 6px; padding: 6px 12px; margin-top: 6px">
                  <t-checkbox-group
                    v-model="modelFormData.mixedMode"
                    style="display: flex; flex-direction: row; gap: 8px; flex-wrap: wrap; align-items: center">
                    <template v-for="opt in referenceOptions" :key="opt.value">
                      <t-checkbox :value="opt.value">{{ $t(opt.label) }}</t-checkbox>
                      <t-input-number
                        v-if="modelFormData.mixedMode.includes(opt.value)"
                        v-model="modelFormData.mixedModeCount[opt.value]"
                        :min="1"
                        :max="99"
                        size="small"
                        style="width: 80px"
                        :placeholder="$t('settings.vendor.count')" />
                    </template>
                  </t-checkbox-group>
                </div>
              </div>
            </t-form-item>
            <t-form-item name="audio" :label="$t('settings.vendor.audioOutput')">
              <t-radio-group v-model="modelFormData.audio">
                <t-radio v-for="item in audioOptions" :key="String(item.value)" :value="item.value">{{ $t(item.label) }}</t-radio>
              </t-radio-group>
            </t-form-item>
            <t-form-item name="durationResolutionMap" :label="$t('settings.vendor.durationResolution')">
              <div class="drmEditor">
                <div class="drmHeader">
                  <div class="drmHeaderIndex"></div>
                  <div class="drmHeaderLabel">{{ $t("settings.vendor.durationSec") }}</div>
                  <div class="drmHeaderArrow"></div>
                  <div class="drmHeaderLabel">{{ $t("settings.vendor.resolution") }}</div>
                  <div class="drmHeaderAction"></div>
                </div>
                <div v-for="(row, rowIndex) in modelFormData.durationResolutionMap" :key="rowIndex" class="drmRow">
                  <div class="drmRowIndex">{{ rowIndex + 1 }}</div>
                  <t-tag-input v-model="row.duration" :placeholder="$t('settings.vendor.enterAndPress')" class="drmInput" />
                  <div class="drmArrow">→</div>
                  <t-tag-input v-model="row.resolution" :placeholder="$t('settings.vendor.enterAndPress')" class="drmInput" />
                  <t-button
                    variant="text"
                    theme="danger"
                    size="small"
                    :disabled="modelFormData.durationResolutionMap.length === 1"
                    @click="modelFormData.durationResolutionMap.splice(rowIndex, 1)">
                    <template #icon><i-delete theme="outline" /></template>
                  </t-button>
                </div>
                <t-button
                  style="margin-top: 16px"
                  variant="dashed"
                  block
                  @click="modelFormData.durationResolutionMap.push({ duration: [], resolution: [] })">
                  <template #icon><i-plus theme="outline" /></template>
                  {{ $t("settings.vendor.addDurationResolution") }}
                </t-button>
              </div>
            </t-form-item>
          </template>
        </t-form>
      </div>
    </t-dialog>

    <!-- 文本模型测试弹窗 -->
    <TextModelTest
      v-if="testingModel?.type === 'text' && textTestVisible"
      v-model:modelVisible="textTestVisible"
      :vendorId="currentVendor!.id"
      :modelName="testingModel.modelName" />

    <!-- 图像模型测试弹窗 -->
    <ImageModelTest
      v-if="testingModel?.type === 'image' && imageTestVisible"
      v-model:modelVisible="imageTestVisible"
      :vendorId="currentVendor!.id"
      :modelName="testingModel.modelName"
      :supportedModes="(testingModel as any).mode || []" />

    <!-- 视频模型测试弹窗 -->
    <VideoModelTest
      v-if="testingModel?.type === 'video' && videoTestVisible"
      v-model:modelVisible="videoTestVisible"
      :vendorId="currentVendor!.id"
      :modelName="testingModel.modelName"
      :rawModes="(testingModel as any).mode || []" />

    <!-- 添加供应商弹窗 -->
    <t-dialog
      width="30vw"
      placement="center"
      top="10vh"
      :footer="false"
      v-model:visible="vendorDialogVisible"
      :header="$t('settings.vendor.addVendorDialog')"
      :maskClosable="false">
      <div class="data">
        <t-radio-group variant="default-filled" v-model="addMode">
          <t-radio-button value="importAdd">通过文件导入</t-radio-button>
          <t-radio-button value="linkAdd">通过链接添加</t-radio-button>
          <t-radio-button value="codeAdd">通过代码添加</t-radio-button>
        </t-radio-group>
        <div class="linkAdd" v-if="addMode == 'linkAdd'">
          <t-alert theme="warning" style="margin-bottom: 20px">
            请填写 TypeScript 代码文件的链接（.ts 文件），不要填 API 地址或其他无关链接。 确认后 XOi 会自动加载该代码，请确保链接来源可信。
          </t-alert>
          <t-input v-model="link" :placeholder="$t('settings.vendor.linkAddPlaceholder')"></t-input>
          <div style="margin-top: 10px; text-align: right; width: 100%">
            <t-button :loading="linkReading" :disabled="!link.trim()" @click="linkRead">{{ $t("settings.vendor.linkAdd") }}</t-button>
          </div>
        </div>
        <div class="importAdd" v-if="addMode == 'importAdd'">
          <div class="uploadArea" @click="triggerUpload" @dragover.prevent @drop.prevent="handleDrop">
            <t-upload
              ref="uploadRef"
              v-model="fileList"
              theme="file"
              :multiple="false"
              :max="1"
              accept=".ts"
              :before-upload="handleBeforeUpload"
              :request-method="requestMethod"
              style="display: none" />
            <div class="dragIcon">
              <i-upload-one theme="outline" size="32" fill="var(--td-brand-color)" />
            </div>
            <p class="uploadText">{{ $t("workbench.novel.import.importAdd") }}</p>
            <p class="uploadHint">{{ $t("workbench.novel.import.limit") }}</p>
          </div>
        </div>
        <div class="codeAdd" v-if="addMode == 'codeAdd'"></div>
      </div>
    </t-dialog>
    <t-dialog
      width="70vw"
      placement="center"
      top="10vh"
      v-model:visible="codeDialogVisible"
      :header="$t('settings.vendor.code')"
      :maskClosable="false"
      @confirm="handleConfirmVendor">
      <div class="editorToolbar">
        <div class="editorInfo">
          <t-icon name="info-circle" size="16px" />
          <span>{{ $t("settings.vendor.codeEditorInfo") }}</span>
        </div>
        <div class="editorActions">
          <t-button variant="text" size="small" @click="vendorCode = VENDOR_CODE_TEMPLATE">
            <template #icon><t-icon name="rollback" /></template>
            {{ $t("settings.vendor.reset") }}
          </t-button>
          <t-button variant="outline" size="small" @click="fileInputRef?.click()">
            <template #icon><t-icon name="upload" /></template>
            {{ $t("settings.vendor.importFile") }}
          </t-button>
          <input ref="fileInputRef" type="file" accept=".ts,.js,.txt,.json" style="display: none" @change="handleFileChange" />
        </div>
      </div>
      <div class="editorWrapper">
        <CodeEditor v-model:value="vendorCode" language="typescript" theme="vs-dark" :height="600" :options="editorOptions" />
      </div>
    </t-dialog>

    <!-- 模型选择器弹窗 -->
    <t-dialog
      v-model:visible="modelPickerVisible"
      header="选择模型"
      width="600px"
      :footer="true"
      :confirm-btn="{ content: '导入选中模型', theme: 'primary' }"
      :cancel-btn="{ content: '取消' }"
      @confirm="handleConfirmImport"
    >
      <div class="modelPicker">
        <!-- 文本模型 -->
        <div v-if="fetchedModels.chat.length > 0" class="modelCategory">
          <div class="categoryHeader">
            <t-checkbox
              :checked="selectedModels.chat.size === fetchedModels.chat.length"
              :indeterminate="selectedModels.chat.size > 0 && selectedModels.chat.size < fetchedModels.chat.length"
              @change="toggleCategoryAll('chat')"
            >
              <span class="categoryTitle">📝 文本模型 ({{ selectedModels.chat.size }}/{{ fetchedModels.chat.length }})</span>
            </t-checkbox>
          </div>
          <div class="modelGrid">
            <div
              v-for="modelId in fetchedModels.chat"
              :key="modelId"
              class="modelItem"
              :class="{ selected: selectedModels.chat.has(modelId) }"
              @click="toggleModelSelection('chat', modelId)"
            >
              <t-checkbox :checked="selectedModels.chat.has(modelId)" />
              <span class="modelName">{{ modelId }}</span>
            </div>
          </div>
        </div>

        <!-- 图片模型 -->
        <div v-if="fetchedModels.image.length > 0" class="modelCategory">
          <div class="categoryHeader">
            <t-checkbox
              :checked="selectedModels.image.size === fetchedModels.image.length"
              :indeterminate="selectedModels.image.size > 0 && selectedModels.image.size < fetchedModels.image.length"
              @change="toggleCategoryAll('image')"
            >
              <span class="categoryTitle">🖼️ 图片模型 ({{ selectedModels.image.size }}/{{ fetchedModels.image.length }})</span>
            </t-checkbox>
          </div>
          <div class="modelGrid">
            <div
              v-for="modelId in fetchedModels.image"
              :key="modelId"
              class="modelItem"
              :class="{ selected: selectedModels.image.has(modelId) }"
              @click="toggleModelSelection('image', modelId)"
            >
              <t-checkbox :checked="selectedModels.image.has(modelId)" />
              <span class="modelName">{{ modelId }}</span>
            </div>
          </div>
        </div>

        <!-- 视频模型 -->
        <div v-if="fetchedModels.video.length > 0" class="modelCategory">
          <div class="categoryHeader">
            <t-checkbox
              :checked="selectedModels.video.size === fetchedModels.video.length"
              :indeterminate="selectedModels.video.size > 0 && selectedModels.video.size < fetchedModels.video.length"
              @change="toggleCategoryAll('video')"
            >
              <span class="categoryTitle">🎥 视频模型 ({{ selectedModels.video.size }}/{{ fetchedModels.video.length }})</span>
            </t-checkbox>
          </div>
          <div class="modelGrid">
            <div
              v-for="modelId in fetchedModels.video"
              :key="modelId"
              class="modelItem"
              :class="{ selected: selectedModels.video.has(modelId) }"
              @click="toggleModelSelection('video', modelId)"
            >
              <t-checkbox :checked="selectedModels.video.has(modelId)" />
              <span class="modelName">{{ modelId }}</span>
            </div>
          </div>
        </div>

        <div v-if="fetchedModels.other.length > 0" class="modelCategory needsReview">
          <div class="categoryHeader"><div><span class="categoryTitle">❓ 待确认类型 ({{ fetchedModels.other.length }})</span><small>供应商没有返回明确类型，请选择用途后再导入</small></div></div>
          <div class="modelGrid">
            <div v-for="modelId in fetchedModels.other" :key="modelId" class="modelItem selected reviewItem">
              <span class="modelName">{{ modelId }}</span>
              <t-select v-model="modelTypeOverrides[modelId]" size="small" style="width:105px">
                <t-option value="text" label="文本"/><t-option value="image" label="图片"/><t-option value="video" label="视频"/>
              </t-select>
            </div>
          </div>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { MdPreview } from "md-editor-v3";
import { CodeEditor } from "monaco-editor-vue3";
import { DialogPlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import VENDOR_CODE_TEMPLATE from "@/lib/vendorTemplate.ts?raw";
import { providersLogo, modelProviderRules } from "@/utils/providersLogo";
import type { UploadFile } from "tdesign-vue-next";
import { LoadingPlugin } from "tdesign-vue-next";
import { resolveThemeMode } from "@/utils/theme";
import settingStore from "@/stores/setting";
import TextModelTest from "./vendorTest/TextModelTest.vue";
import ImageModelTest from "./vendorTest/ImageModelTest.vue";
import VideoModelTest from "./vendorTest/VideoModelTest.vue";
const { themeSetting } = storeToRefs(settingStore());

// ── 类型 ──
interface TextModel {
  name: string;
  modelName: string;
  type: "text";
  think: boolean;
}

interface ImageModel {
  name: string;
  modelName: string;
  type: "image";
  mode: ("text" | "singleImage" | "multiReference")[];
}

interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: (
    | "singleImage"
    | "startEndRequired"
    | "endFrameOptional"
    | "startFrameOptional"
    | "text"
    | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[]
  )[];
  audio: "optional" | false | true;
  durationResolutionMap: { duration: number[]; resolution: string[] }[];
}

type VendorModel = TextModel | ImageModel | VideoModel;

interface VendorInput {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  required: boolean;
  placeholder?: string;
}

interface VendorItem {
  id: string; //供应商唯一标识，必须全局唯一
  author: string;
  description?: string; //md5格式
  name: string;
  icon?: string; //仅支持base64格式
  code: string;
  inputs: VendorInput[];
  inputValues: Record<string, string>;
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  model?: VendorModel[];
  models?: VendorModel[];
  enable: number; //1启用 0禁用
  version?: string;
}

// ── 常量 ──
const TYPE_LABEL_MAP: Record<string, string> = {
  text: "settings.vendor.textModel",
  image: "settings.vendor.imageModel",
  video: "settings.vendor.videoModel",
};

const MODE_LABEL_MAP: Record<string, string> = {
  singleImage: "settings.vendor.singleImage",
  multiReference: "settings.vendor.multiReference",
  startEndRequired: "settings.vendor.startEndRequired",
  endFrameOptional: "settings.vendor.endFrameOptional",
  startFrameOptional: "settings.vendor.startFrameOptional",
  audioReference: "settings.vendor.audioRef",
  videoReference: "settings.vendor.videoRef",
  imageReference: "settings.vendor.imageRef",
};

function getTypeLabel(type: string) {
  return TYPE_LABEL_MAP[type] || type;
}

function getModeLabel(mode: string, type: string) {
  if (mode === "text") return $t(type === "image" ? "settings.vendor.textToImage" : "settings.vendor.textToVideo");
  // Handle reference:number format like "videoReference:2"
  const refMatch = String(mode).match(/^(videoReference|imageReference|audioReference):(\d+)$/);
  if (refMatch) {
    const label = MODE_LABEL_MAP[refMatch[1]];
    return label ? `${$t(label)} ×${refMatch[2]}` : mode;
  }
  return MODE_LABEL_MAP[mode] ? $t(MODE_LABEL_MAP[mode]) : mode;
}

const editorOptions = {
  fontSize: 14,
  automaticLayout: true,
  tabSize: 2,
  scrollBeyondLastLine: false,
  formatOnPaste: true,
  formatOnType: true,
};

const modelTypeOptions = [
  { value: "text", label: "settings.vendor.textModel" },
  { value: "image", label: "settings.vendor.imageModel" },
  { value: "video", label: "settings.vendor.videoModel" },
];

const imageModeOptions = [
  { label: "settings.vendor.textToImage", value: "text" },
  { label: "settings.vendor.singleImage", value: "singleImage" },
  { label: "settings.vendor.multiReference", value: "multiReference" },
];

const videoModeOptions = [
  { label: "settings.vendor.singleImage", value: "singleImage" },
  { label: "settings.vendor.startEndRequired", value: "startEndRequired" },
  { label: "settings.vendor.endFrameOptional", value: "endFrameOptional" },
  { label: "settings.vendor.startFrameOptional", value: "startFrameOptional" },
  { label: "settings.vendor.textToVideo", value: "text" },
  { label: "settings.vendor.multiReferenceMode", value: "multiReference" },
];
const referenceOptions = [
  { label: "settings.vendor.videoRef", value: "videoReference" },
  { label: "settings.vendor.imageRef", value: "imageReference" },
  { label: "settings.vendor.audioRef", value: "audioReference" },
];

const audioOptions: { label: string; value: "optional" | false | true }[] = [
  { label: "settings.vendor.audioOptional", value: "optional" },
  { label: "settings.vendor.audioOnly", value: true },
  { label: "settings.vendor.noAudio", value: false },
];

// ── 供应商列表 ──
const vendorList = ref<VendorItem[]>([]);

const loading = ref(false);
async function getVendorList() {
  loading.value = true;
  try {
    const res = await axios.post("/setting/vendorConfig/getVendorList");
    vendorList.value = res.data
      .filter((item: any) => item.id !== "xoi")
      .map((item: any) => {
        return {
          ...item,
          enable: item.enable,
        };
      });

    if (vendorList.value.length && !vendorList.value.some((v) => v.id === activeVendorId.value)) {
      activeVendorId.value = vendorList.value[0].id;
    }
  } catch (err: any) {
    window.$message.error(`${$t("settings.vendor.msg.getVendorListFailed")}${err.message}`);
  } finally {
    loading.value = false;
    nextTick(() => {
      lastSavedSnapshot.value = currentVendorSnapshot.value;
      autoSaveReady.value = true;
    });
  }
}

onMounted(() => {
  getVendorList();
});

const activeVendorId = ref<string>();
const currentVendor = computed(() => vendorList.value.find((v) => v.id === activeVendorId.value));
const vendorModels = computed(() => currentVendor.value?.models || currentVendor.value?.model || []);
const modelFilter = ref<"all" | "text" | "image" | "video">("all");
const filteredVendorModels = computed(() => modelFilter.value === "all" ? vendorModels.value : vendorModels.value.filter(model => model.type === modelFilter.value));
const modelTabs = computed(() => [
  { value: "all" as const, label: "全部", icon: "✦", count: vendorModels.value.length },
  { value: "text" as const, label: "文本", icon: "T", count: vendorModels.value.filter(model => model.type === "text").length },
  { value: "image" as const, label: "图片", icon: "▧", count: vendorModels.value.filter(model => model.type === "image").length },
  { value: "video" as const, label: "视频", icon: "▶", count: vendorModels.value.filter(model => model.type === "video").length },
]);
const requiredInputs = computed(() => currentVendor.value?.inputs?.filter((input) => input.required) || []);
const optionalInputs = computed(() => currentVendor.value?.inputs?.filter((input) => !input.required) || []);

// ── 供应商弹窗 ──
const vendorDialogVisible = ref(false);
const codeDialogVisible = ref(false);
const vendorCode = ref(VENDOR_CODE_TEMPLATE);
const fileInputRef = ref<HTMLInputElement | null>(null);
const updating = ref(false);
const autoUpdating = ref(false);
const autoSaveReady = ref(false);
const lastSavedSnapshot = ref("");
const AUTO_SAVE_DELAY = 700;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAutoSave = false;

// ── 测试弹窗状态 ──
const testingModel = ref<VendorModel | null>(null);
const textTestVisible = ref(false);
const imageTestVisible = ref(false);
const videoTestVisible = ref(false);

function getInputIcon(type: VendorInput["type"]) {
  if (type === "password") return "secured";
  if (type === "url") return "link";
  return "edit-1";
}

function getInputPlaceholder(input: VendorInput) {
  return input.placeholder?.trim() || "";
}

/**
 * 检查字符串是否是有效的 base64 格式
 */
function isValidBase64(str?: string): boolean {
  if (!str) return false;
  // 检查是否是 base64 数据 URI 或纯 base64 字符串
  const base64Regex = /^(?:data:[^;]+;base64,)?[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(str) && str.length > 0;
}

function needsUpdate(vendor: VendorItem): boolean {
  // Agnes 1.1 是 XOi 适配器版本，并非模型 API 版本；当前也没有对应的一键升级入口。
  if (vendor.id === "agnes") return false;
  if (!vendor.version) return true;
  const ver = parseFloat(vendor.version);
  return isNaN(ver) || ver < 2.0;
}

function getModelLogo(modelName: string): string | null {
  if (!modelName) return null;
  const rule = modelProviderRules.find((r) => r.pattern.test(modelName));
  return rule ? providersLogo[rule.provider] : null;
}

function buildVendorUpdatePayload(vendor: VendorItem) {
  return {
    id: vendor.id,
    inputValues: vendor.inputValues,
  };
}

const currentVendorSnapshot = computed(() => {
  if (!currentVendor.value) return "";
  return JSON.stringify(buildVendorUpdatePayload(currentVendor.value));
});

function scheduleAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    void handleAutoUpdateVendor();
  }, AUTO_SAVE_DELAY);
}

async function handleAutoUpdateVendor() {
  if (!currentVendor.value || !autoSaveReady.value || loading.value) return;

  const snapshot = currentVendorSnapshot.value;
  if (!snapshot || snapshot === lastSavedSnapshot.value) return;

  if (autoUpdating.value) {
    pendingAutoSave = true;
    return;
  }

  autoUpdating.value = true;
  try {
    await axios.post("/setting/vendorConfig/updateVendorInputs", buildVendorUpdatePayload(currentVendor.value));
    lastSavedSnapshot.value = snapshot;
  } catch (err: any) {
    window.$message.error(`${$t("settings.vendor.msg.updateFailed")}${err.message}`);
  } finally {
    autoUpdating.value = false;
    if (pendingAutoSave) {
      pendingAutoSave = false;
      scheduleAutoSave();
    }
  }
}

watch(
  currentVendorSnapshot,
  (snapshot) => {
    if (!snapshot || !autoSaveReady.value || loading.value) return;
    if (snapshot === lastSavedSnapshot.value) return;
    scheduleAutoSave();
  },
  { flush: "post" },
);

watch(
  activeVendorId,
  () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    pendingAutoSave = false;
    nextTick(() => {
      lastSavedSnapshot.value = currentVendorSnapshot.value;
    });
  },
  { flush: "post" },
);
const id = ref<string>();
function handleAddVendor() {
  addMode.value = "importAdd";
  id.value = undefined;
  vendorCode.value = VENDOR_CODE_TEMPLATE;
  vendorDialogVisible.value = true;
  codeDialogVisible.value = false;
}
function handleConfirmVendor() {
  if (!id.value) {
    const firstConfirm = DialogPlugin.confirm({
      theme: "danger",
      header: $t("settings.vendor.msg.highRiskConfirm"),
      body: $t("settings.vendor.msg.addVendorRiskBody"),
      confirmBtn: { content: $t("settings.vendor.msg.iKnowRisk"), theme: "danger" },
      cancelBtn: $t("settings.vendor.msg.cancel"),
      onConfirm: () => {
        firstConfirm.destroy();
        const secondConfirm = DialogPlugin.confirm({
          theme: "danger",
          header: $t("settings.vendor.msg.confirmAgain"),
          body: $t("settings.vendor.msg.addVendorConfirmBody"),
          confirmBtn: { content: $t("settings.vendor.msg.confirmAndAdd"), theme: "danger" },
          cancelBtn: $t("settings.vendor.msg.goBackCheck"),
          onConfirm: async () => {
            axios
              .post("/setting/vendorConfig/addVendor", { tsCode: vendorCode.value })
              .then((res) => {
                window.$message.success($t("settings.vendor.msg.vendorAdded"));
                vendorDialogVisible.value = false;
                codeDialogVisible.value = false;
                getVendorList();
              })
              .catch((err) => {
                window.$message.error(err.message ?? `${$t("settings.vendor.msg.addFailed")}`);
              })
              .finally(() => {
                secondConfirm.destroy();
              });
          },
          onClose: () => secondConfirm.hide(),
        });
      },
      onClose: () => firstConfirm.hide(),
    });
  } else {
    const firstConfirm = DialogPlugin.confirm({
      theme: "danger",
      header: $t("settings.vendor.msg.highRiskConfirm"),
      body: $t("settings.vendor.msg.updateVendorRiskBody"),
      confirmBtn: { content: $t("settings.vendor.msg.iKnowRisk"), theme: "danger" },
      cancelBtn: $t("settings.vendor.msg.cancel"),
      onConfirm: () => {
        firstConfirm.destroy();
        const secondConfirm = DialogPlugin.confirm({
          theme: "danger",
          header: $t("settings.vendor.msg.confirmAgain"),
          body: $t("settings.vendor.msg.updateVendorConfirmBody"),
          confirmBtn: { content: $t("settings.vendor.msg.confirmAndUpdate"), theme: "danger" },
          cancelBtn: $t("settings.vendor.msg.goBackCheck"),
          onConfirm: async () => {
            axios
              .post("/setting/vendorConfig/updateCode", {
                id: id.value,
                tsCode: vendorCode.value,
              })
              .then((res) => {
                window.$message.success($t("settings.vendor.msg.updateSuccess"));
                vendorDialogVisible.value = false;
                codeDialogVisible.value = false;
                getVendorList();
              })
              .catch((err) => {
                window.$message.error(`${$t("settings.vendor.msg.updateFailed")}${err.message}`);
              })
              .finally(() => {
                secondConfirm.destroy();
              });
          },
          onClose: () => secondConfirm.hide(),
        });
      },
      onClose: () => firstConfirm.hide(),
    });
  }
}
// ── 模型弹窗 ──
const modelDialogVisible = ref(false);
const editingModelIndex = ref<number | null>(null);
const editingModelName = ref<string | null>(null);
interface DrmRow {
  duration: string[];
  resolution: string[];
}

const modelFormData = ref({
  name: "",
  modelName: "",
  type: "text" as "text" | "image" | "video",
  think: false,
  mode: [] as string[],
  mixedMode: [] as string[], // referenceOptions 选中项，单独存放，构建时作为数组元素加入 mode
  mixedModeCount: {} as Record<string, number>, // 每个 reference 的数量限制
  audio: "optional" as "optional" | false | true,
  durationResolutionMap: [{ duration: [] as string[], resolution: [] as string[] }] as DrmRow[],
});

function resetModelForm(type: "text" | "image" | "video" = "text") {
  modelFormData.value = {
    name: "",
    modelName: "",
    type,
    think: false,
    mode: [],
    mixedMode: [],
    mixedModeCount: {},
    audio: "optional",
    durationResolutionMap: [{ duration: [], resolution: [] }],
  };
}

function ensureVendorModels(): VendorModel[] {
  if (!currentVendor.value) return [];
  if (!Array.isArray(currentVendor.value.models)) {
    currentVendor.value.models = Array.isArray(currentVendor.value.model) ? [...currentVendor.value.model] : [];
  }
  currentVendor.value.model = currentVendor.value.models;
  return currentVendor.value.models;
}
function buildModelFromForm(): VendorModel | null {
  const name = modelFormData.value.name.trim();
  const modelName = modelFormData.value.modelName.trim();
  if (!name) {
    window.$message.error($t("settings.vendor.msg.fillDisplayName"));
    return null;
  }
  if (!modelName) {
    window.$message.error($t("settings.vendor.msg.fillModelId"));
    return null;
  }

  if (modelFormData.value.type === "text") {
    return {
      name,
      modelName,
      type: "text",
      think: modelFormData.value.think,
    };
  }

  if (modelFormData.value.type === "image") {
    const mode = modelFormData.value.mode as ImageModel["mode"];
    if (!mode.length) {
      window.$message.error($t("settings.vendor.msg.selectImageMode"));
      return null;
    }
    return {
      name,
      modelName,
      type: "image",
      mode,
    };
  }

  // 把 mixedMode（referenceOptions 选中项）作为带数量的数组元素追加到 mode
  const mode = [...modelFormData.value.mode].filter((m) => m !== "multiReference") as VideoModel["mode"];
  if (modelFormData.value.mixedMode.length > 0) {
    const refs = modelFormData.value.mixedMode.map((ref) => {
      const count = modelFormData.value.mixedModeCount[ref] ?? 1;
      return `${ref}:${count}`;
    });
    (mode as any[]).push(refs);
  }
  if (!mode.length) {
    window.$message.error($t("settings.vendor.msg.selectVideoMode"));
    return null;
  }

  const durationResolutionMap: VideoModel["durationResolutionMap"] = [];
  for (let i = 0; i < modelFormData.value.durationResolutionMap.length; i++) {
    const row = modelFormData.value.durationResolutionMap[i];
    const duration = row.duration.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    const resolution = row.resolution.filter(Boolean);
    if (!duration.length) {
      window.$message.error(`${$t("settings.vendor.msg.groupPrefix", { n: i + 1 })}${$t("settings.vendor.msg.addDuration")}`);
      return null;
    }
    if (!resolution.length) {
      window.$message.error(`${$t("settings.vendor.msg.groupPrefix", { n: i + 1 })}${$t("settings.vendor.msg.addResolution")}`);
      return null;
    }
    durationResolutionMap.push({ duration, resolution });
  }

  return {
    name,
    modelName,
    type: "video",
    mode,
    audio: modelFormData.value.audio,
    durationResolutionMap,
  };
}

function handleAddModel() {
  if (!currentVendor.value) {
    window.$message.error($t("settings.vendor.msg.selectVendorFirst"));
    return;
  }
  editingModelIndex.value = null;
  resetModelForm("text");
  modelDialogVisible.value = true;
}

async function handleConfirmModel() {
  const list = ensureVendorModels();
  if (!list.length && !currentVendor.value) return;

  const model = buildModelFromForm();
  if (!model) return;

  const duplicateIndex = list.findIndex((item, index) => {
    if (editingModelIndex.value !== null && index === editingModelIndex.value) {
      return false;
    }
    return item.modelName === model.modelName;
  });
  if (duplicateIndex !== -1) {
    window.$message.error($t("settings.vendor.msg.modelIdExists"));
    return;
  }

  if (editingModelIndex.value === null) {
    try {
      await axios.post("/setting/vendorConfig/addVendorModel", {
        id: currentVendor.value!.id,
        model,
      });
      window.$message.success($t("settings.vendor.msg.modelAdded"));
      modelDialogVisible.value = false;
      getVendorList();
    } catch (err: any) {
      window.$message.error(err.message ?? $t("settings.vendor.msg.operationFailed"));
    }
    return;
  }
  if (editingModelIndex.value !== null) {
    try {
      await axios.post("/setting/vendorConfig/upVendorModel", {
        id: currentVendor.value!.id,
        modelName: editingModelName.value,
        model,
      });
      window.$message.success($t("settings.vendor.msg.modelUpdated"));
      modelDialogVisible.value = false;
      getVendorList();
    } catch (err: any) {
      window.$message.error(err.message ?? $t("settings.vendor.msg.operationFailed"));
    }
  }
}

function handleEditModel(model: VendorModel) {
  const list = ensureVendorModels();
  editingModelIndex.value = list.findIndex((item) => item.modelName === model.modelName);
  editingModelName.value = model.modelName;

  if (model.type === "text") {
    modelFormData.value = {
      name: model.name,
      modelName: model.modelName,
      type: "text",
      think: model.think,
      mode: [],
      mixedMode: [],
      mixedModeCount: {},
      audio: "optional",
      durationResolutionMap: [{ duration: [], resolution: [] }],
    };
  }

  if (model.type === "image") {
    modelFormData.value = {
      name: model.name,
      modelName: model.modelName,
      type: "image",
      think: false,
      mode: [...model.mode],
      mixedMode: [],
      mixedModeCount: {},
      audio: "optional",
      durationResolutionMap: [{ duration: [], resolution: [] }],
    };
  }

  if (model.type === "video") {
    const rows: DrmRow[] =
      model.durationResolutionMap?.length > 0
        ? model.durationResolutionMap.map((map) => ({
            duration: map.duration.map(String),
            resolution: [...map.resolution],
          }))
        : [{ duration: [], resolution: [] }];
    // 反解：把 mode 中数组类型的元素提取为 mixedMode，其余为普通 mode
    const flatMode: string[] = [];
    let mixedMode: string[] = [];
    const mixedModeCount: Record<string, number> = {};
    for (const m of model.mode) {
      if (Array.isArray(m)) {
        for (const ref of m) {
          const match = String(ref).match(/^(videoReference|imageReference|audioReference):(\d+)$/);
          if (match) {
            mixedMode.push(match[1]);
            mixedModeCount[match[1]] = Number(match[2]);
          }
        }
      } else {
        flatMode.push(m);
      }
    }
    modelFormData.value = {
      name: model.name,
      modelName: model.modelName,
      type: "video",
      think: false,
      mode: mixedMode.length > 0 ? [...flatMode, "multiReference"] : flatMode,
      mixedMode,
      mixedModeCount,
      audio: model.audio,
      durationResolutionMap: rows,
    };
  }

  modelDialogVisible.value = true;
}

function handleTestModel(item: (typeof vendorModels.value)[number]) {
  testingModel.value = item;
  if (item.type === "text") {
    textTestVisible.value = true;
  } else if (item.type === "image") {
    imageTestVisible.value = true;
  } else if (item.type === "video") {
    videoTestVisible.value = true;
  }
}

function handleDeleteModel(modelName: string) {
  if (!currentVendor.value) return;
  const confirmDialog = DialogPlugin.confirm({
    theme: "danger",
    header: $t("settings.vendor.msg.deleteModelConfirm"),
    body: `${$t("settings.vendor.msg.deleteModelBody", { name: modelName })}`,
    confirmBtn: { content: $t("settings.vendor.msg.confirmDelete"), theme: "danger" },
    cancelBtn: $t("settings.vendor.msg.cancel"),
    onConfirm: async () => {
      try {
        await axios.post("/setting/vendorConfig/delVendorModel", {
          id: currentVendor.value!.id,
          modelName,
        });
        window.$message.success($t("settings.vendor.msg.modelDeleted"));
        getVendorList();
      } catch (err: any) {
        window.$message.error(err.message ?? $t("settings.vendor.msg.operationFailed"));
      } finally {
        confirmDialog.destroy();
      }
    },
  });
}
function handleEditVendorCode() {
  if (!currentVendor.value) return;
  if (!currentVendor.value.code) {
    window.$message.warning("服务器部署模式禁止在线执行或编辑供应商代码，请由部署人员更新适配器文件");
    return;
  }
  id.value = currentVendor.value.id;
  vendorCode.value = currentVendor.value.code;
  codeDialogVisible.value = true;
}
function handleDeleteVendor() {
  if (!currentVendor.value) return;
  const confirmDialog = DialogPlugin.confirm({
    theme: "danger",
    header: $t("settings.vendor.msg.deleteVendorConfirm"),
    body: `${$t("settings.vendor.msg.deleteVendorBody", { name: currentVendor.value.name })}`,
    confirmBtn: { content: $t("settings.vendor.msg.confirmDelete"), theme: "danger" },
    cancelBtn: $t("settings.vendor.msg.cancel"),
    onConfirm: () => {
      axios
        .post("/setting/vendorConfig/deleteVendor", { id: currentVendor.value?.id })
        .then(() => {
          window.$message.success($t("settings.vendor.msg.vendorDeleted"));
          if (activeVendorId.value === currentVendor.value?.id) {
            activeVendorId.value = undefined;
          }
          getVendorList();
          confirmDialog.destroy();
        })
        .catch((err) => {
          window.$message.error(`${$t("settings.vendor.msg.deleteFailed")}${err.message}`);
        });
    },
  });
}
function onBlurFn() {
  axios
    .post("/setting/vendorConfig/updateVendorInputs", {
      id: currentVendor.value?.id,
      inputValues: currentVendor.value?.inputValues,
    })
    .then(() => {
      window.$message.success($t("settings.vendor.msg.vendorConfigUpdated"));
      getVendorList();
    })
    .catch((err) => {
      window.$message.error(`${$t("settings.vendor.msg.updateFailed")}${err.message}`);
    });
}

// 模型选择器状态
const modelPickerVisible = ref(false);
const fetchedModels = ref<{ image: string[]; chat: string[]; video: string[]; other: string[] }>({ image: [], chat: [], video: [], other: [] });
const modelTypeOverrides = ref<Record<string, "text" | "image" | "video">>({});
const selectedModels = ref<{ image: Set<string>; chat: Set<string>; video: Set<string> }>({
  image: new Set(),
  chat: new Set(),
  video: new Set(),
});

// 模型类型分类
function guessModelType(name: string, declaredType = ""): "text" | "image" | "video" | "other" {
  const declared = declaredType.toLowerCase();
  if (/(image|vision|text-to-image|image-generation)/.test(declared)) return "image";
  if (/(video|text-to-video|video-generation)/.test(declared)) return "video";
  if (/(chat|text|llm|language)/.test(declared)) return "text";
  const lower = name.toLowerCase();
  if (/(dall-e|stable.diffusion|\bsdxl\b|\bflux\b|image|cogview|midjourney|seedream|nano.banana|gpt-image|imagen)/.test(lower)) {
    return "image";
  }
  if (/(sora|video|kling|cogvideo|pika|runway|luma|seedance|hailuo|veo|wan.*video)/.test(lower)) {
    return "video";
  }
  if (/(gpt|deepseek|claude|gemini|qwen|llama|mistral|kimi|minimax-m\d|chat|instruct|reason|embedding)/.test(lower)) return "text";
  return "other";
}

// 密钥留在服务器，模型目录通过受保护的后端请求获取
async function handleFetchModels() {
  if (!currentVendor.value) return;

  try {
    await axios.post("/setting/vendorConfig/updateVendorInputs", buildVendorUpdatePayload(currentVendor.value));
    const data: any = await axios.post("/setting/vendorConfig/fetchModels", { id: currentVendor.value.id });

    // 支持多种响应格式
    const list = data.data || data.models || data.list || [];
    const normalizedModels = list
      .map((m: any) => ({ id: typeof m === "string" ? m : (m.id || m.name), declaredType: typeof m === "string" ? "" : (m.type || m.modality || m.task || "") }))
      .filter((m: any) => typeof m.id === "string" && m.id.length > 0);
    const modelNames = normalizedModels.map((model: any) => model.id);

    if (modelNames.length === 0) {
      window.$message.warning("未获取到模型列表，请检查API地址和Key");
      return;
    }

    // 分类
    const image_models: string[] = [];
    const chat_models: string[] = [];
    const video_models: string[] = [];
    const other_models: string[] = [];

    for (const model of normalizedModels) {
      const name = model.id;
      const type = guessModelType(name, model.declaredType);
      if (type === "image") image_models.push(name);
      else if (type === "video") video_models.push(name);
      else if (type === "text") chat_models.push(name);
      else other_models.push(name);
    }

    // 保存拉取结果
    fetchedModels.value = { image: image_models, chat: chat_models, video: video_models, other: other_models };
    modelTypeOverrides.value = Object.fromEntries(other_models.map(id => [id, "text"]));

    // 初始化选中状态（已有的模型默认选中）
    const existingModels = currentVendor.value.models || currentVendor.value.model || [];
    const existingIds = new Set(existingModels.map((m: any) => m.modelName));

    selectedModels.value = {
      image: new Set(image_models.filter((id) => existingIds.has(id))),
      chat: new Set(chat_models.filter((id) => existingIds.has(id))),
      video: new Set(video_models.filter((id) => existingIds.has(id))),
    };

    // 打开选择器
    modelPickerVisible.value = true;
    window.$message.success(`获取到 ${modelNames.length} 个模型`);
  } catch (err: any) {
    console.error("拉取模型失败:", err);
    window.$message.error(`获取模型失败: ${err.message}`);
  }
}

// 切换模型选中状态
function toggleModelSelection(category: "image" | "chat" | "video", modelId: string) {
  const set = selectedModels.value[category];
  if (set.has(modelId)) {
    set.delete(modelId);
  } else {
    set.add(modelId);
  }
}

// 全选/取消全选
function toggleCategoryAll(category: "image" | "chat" | "video") {
  const models = fetchedModels.value[category];
  const selected = selectedModels.value[category];
  if (selected.size === models.length) {
    selected.clear();
  } else {
    models.forEach((id) => selected.add(id));
  }
}

// 确认导入模型
async function handleConfirmImport() {
  if (!currentVendor.value) return;

  const models = [];

  // 文本模型
  for (const modelName of selectedModels.value.chat) {
    models.push({ name: modelName, modelName, type: "text", think: false });
  }

  // 图片模型
  for (const modelName of selectedModels.value.image) {
    models.push({ name: modelName, modelName, type: "image", mode: ["text"] });
  }

  // 视频模型
  for (const modelName of selectedModels.value.video) {
    models.push({
      name: modelName,
      modelName,
      type: "video",
      mode: ["singleImage", "text"],
      audio: false,
      durationResolutionMap: [{ duration: [5], resolution: ["1280x720"] }],
    });
  }

  for (const modelName of fetchedModels.value.other) {
    const type = modelTypeOverrides.value[modelName];
    if (type === "text") models.push({ name: modelName, modelName, type: "text", think: false });
    if (type === "image") models.push({ name: modelName, modelName, type: "image", mode: ["text"] });
    if (type === "video") models.push({ name: modelName, modelName, type: "video", mode: ["singleImage", "text"], audio: false, durationResolutionMap: [{ duration: [5], resolution: ["1280x720"] }] });
  }

  if (models.length === 0) {
    window.$message.warning("请至少选择一个模型");
    return;
  }

  try {
    // 逐个添加模型
    let successCount = 0;
    for (const model of models) {
      try {
        await axios.post("/setting/vendorConfig/addVendorModel", {
          id: currentVendor.value.id,
          model,
        });
        successCount++;
      } catch (err: any) {
        console.error(`添加模型 ${model.modelName} 失败:`, err.message);
      }
    }

    window.$message.success(`已导入 ${successCount} 个模型`);
    modelPickerVisible.value = false;
    getVendorList();
  } catch (err: any) {
    window.$message.error(`导入失败: ${err.message}`);
  }
}

//是否启用供应商
function onChange(item: any, val: number) {
  const prevEnable = val === 1 ? 0 : 1;
  axios
    .post("/setting/vendorConfig/enableVendor", {
      id: item.id,
      enable: val,
    })
    .then(() => {})
    .catch((err) => {
      item.enable = prevEnable;
    });
}
const addMode = ref("importAdd");
const link = ref("");
const linkReading = ref(false);

watch(addMode, (val) => {
  if (val == "codeAdd") codeDialogVisible.value = true;
  else codeDialogVisible.value = false;
});

//链接读取
function linkRead() {
  if (linkReading.value) return;
  const firstConfirm = DialogPlugin.confirm({
    theme: "danger",
    header: $t("settings.vendor.msg.highRiskConfirm"),
    body: $t("settings.vendor.msg.linkAddVendorRiskBody"),
    confirmBtn: { content: $t("settings.vendor.msg.iKnowRisk"), theme: "danger" },
    cancelBtn: $t("settings.vendor.msg.cancel"),
    onConfirm: () => {
      firstConfirm.destroy();
      const secondConfirm = DialogPlugin.confirm({
        theme: "danger",
        header: $t("settings.vendor.msg.confirmAgain"),
        body: $t("settings.vendor.msg.addVendorConfirmBody"),
        confirmBtn: { content: $t("settings.vendor.msg.confirmAndAdd"), theme: "danger" },
        cancelBtn: $t("settings.vendor.msg.goBackCheck"),
        onConfirm: async () => {
          const instance = LoadingPlugin({
            fullscreen: true,
            attach: "body",
            preventScrollThrough: false,
          });
          const timer = setTimeout(() => {
            instance.hide();
            clearTimeout(timer);
          }, 1000);
          linkReading.value = true;
          try {
            const { data } = await axios.post("/setting/vendorConfig/getCodeByLink", { link: link.value });
            if (!data.includes("vendor")) {
              let alertBox: any = null;
              if (data.includes("<html>")) {
                alertBox = DialogPlugin.alert({
                  theme: "danger",
                  header: "链接返回了一个网页，添加供应商需要返回TS代码，请确认链接是否正确",
                  body: "请勿输入中转站地址，如需使用中转站请修改OpenAI标准接口的baseUrl使用中转站地址",
                  onConfirm: ({ e }) => {
                    alertBox.hide();
                  },
                });
              } else {
                DialogPlugin.alert({
                  theme: "danger",
                  header: "链接返回的内容不正确，添加供应商需要返回TS代码，请确认链接是否正确",
                  onConfirm: ({ e }) => {
                    alertBox.hide();
                  },
                });
              }
              return;
            }
            if (data) {
              axios.post("/setting/vendorConfig/addVendor", { tsCode: data });
              window.$message.success($t("settings.vendor.msg.vendorAdded"));
              vendorDialogVisible.value = false;
              codeDialogVisible.value = false;
              getVendorList();
            } else {
              window.$message.error($t("settings.vendor.msg.linkAddFailed"));
              codeDialogVisible.value = false;
            }
          } catch (err: any) {
            window.$message.error(`${$t("settings.vendor.msg.addFailed")}${err.message}`);
          } finally {
            clearTimeout(timer);
            instance.hide();
            linkReading.value = false;
            secondConfirm.destroy();
          }
        },
        onClose: () => secondConfirm.hide(),
      });
    },
    onClose: () => firstConfirm.hide(),
  });
}
const uploadRef = ref();
// 上传前校验并解析
async function handleBeforeUpload(file: UploadFile) {
  const rawFile = file.raw;
  if (!rawFile) {
    window.$message.error($t("workbench.novel.import.msg.selectFile"));
    return false;
  }
  LoadingPlugin(true);
  try {
    const firstConfirm = DialogPlugin.confirm({
      theme: "danger",
      header: $t("settings.vendor.msg.highRiskConfirm"),
      body: $t("settings.vendor.msg.importAdd"),
      confirmBtn: { content: $t("settings.vendor.msg.iKnowRisk"), theme: "danger" },
      cancelBtn: $t("settings.vendor.msg.cancel"),
      onConfirm: () => {
        firstConfirm.destroy();
        const secondConfirm = DialogPlugin.confirm({
          theme: "danger",
          header: $t("settings.vendor.msg.confirmAgain"),
          body: $t("settings.vendor.msg.addVendorConfirmBody"),
          confirmBtn: { content: $t("settings.vendor.msg.confirmAndAdd"), theme: "danger" },
          cancelBtn: $t("settings.vendor.msg.goBackCheck"),
          onConfirm: async () => {
            //拿到上传的数据
            const fileReader = new FileReader();
            fileReader.readAsText(rawFile);
            fileReader.onload = () => {
              const content = fileReader.result;
              axios
                .post("/setting/vendorConfig/addVendor", { tsCode: content })
                .then((res) => {
                  window.$message.success($t("settings.vendor.msg.vendorAdded"));
                  vendorDialogVisible.value = false;
                  codeDialogVisible.value = false;
                  getVendorList();
                })
                .catch((err) => {
                  window.$message.error(err.message ?? `${$t("settings.vendor.msg.addFailed")}`);
                })
                .finally(() => {
                  secondConfirm.destroy();
                });
            };
          },
          onClose: () => secondConfirm.hide(),
        });
      },
      onClose: () => firstConfirm.hide(),
    });
  } catch {
    window.$message.error($t("workbench.novel.import.msg.parseFailed"));
  } finally {
    LoadingPlugin(false);
  }
  return false;
}
const fileList = ref<any[]>([]);
// 触发上传
function triggerUpload() {
  uploadRef.value?.triggerUpload();
}
function requestMethod() {
  return Promise.resolve({
    response: {},
    status: "success",
  } as const);
}
// 处理拖拽上传
async function handleDrop(e: DragEvent) {
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    await handleBeforeUpload({ raw: files[0] });
  }
}
function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    vendorCode.value = (ev.target?.result as string) || "";
  };
  reader.readAsText(file);
  input.value = "";
}
</script>

<style lang="scss" scoped>
.modelServe {
  width: 100%;
  height: 100%;
  display: flex;
  gap: 18px;
  .modelList {
    width: 258px;
    min-width:258px;
    height: 100%;
    min-height: 0;
    display:flex;
    flex-direction:column;
    padding:10px;
    border:1px solid #e9e5e2;
    border-radius:16px;
    background:#f8f7f5;
    .listContent {
      flex: 1;
      min-height: 0;
      overflow: auto;
      height: 100%;
    }

    .listFooter {
      padding: 0 0 10px;
      order:2;
      :deep(.t-button){height:42px;border:0;border-radius:12px;background:#292623;color:#fff;font-weight:650}
    }
    :deep(.t-menu){background:transparent}.providerItem{position:relative;height:46px;margin-bottom:5px;padding:0 54px 0 10px;border-radius:10px}.providerItem.t-is-active{background:#fff;color:#272320;box-shadow:0 5px 15px rgba(51,43,37,.05)}
    :deep(.providerItem .t-menu__item-icon){display:flex;align-items:center;justify-content:center;width:24px;height:24px;line-height:1}
    .providerInitial{display:flex;flex:0 0 24px;align-items:center;justify-content:center;box-sizing:border-box;width:24px;height:24px;padding:0;border-radius:7px;background:#ebe7e3;color:#5f5853;font-size:11px;font-weight:750;line-height:1;text-align:center}
    .providerName{display:block;min-width:0;overflow:hidden;color:#4b4642;font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.providerSwitch{position:absolute;right:10px;top:50%;z-index:2;transform:translateY(-50%) scale(.86);transform-origin:right center}
  }

  .modelParameter {
    width: 100%;
    height: 100%;
    min-width:0;
    .providerHero{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding:16px 18px;border:1px solid #ece7e3;border-radius:16px;background:linear-gradient(120deg,#fff 35%,#fff4ec);box-shadow:0 8px 24px rgba(59,45,36,.04)}
    .providerIdentity{display:flex;align-items:center;gap:13px}.providerGlyph{display:grid;place-items:center;width:44px;height:44px;border-radius:13px;background:#282522;color:#fff;font-size:19px;font-weight:800}.providerEyebrow{color:#e66b37;font-size:9px;font-weight:750;letter-spacing:.13em}.providerIdentity h3{margin:3px 0 2px;color:#2a2623;font-size:17px}.providerIdentity p{margin:0;color:#9a928c;font-size:11px}.saveState{padding:7px 10px;border-radius:999px;background:#f1eee9;color:#888078;font-size:10px}
    .infoBox {
      font-size: 12px;
      opacity: 0.6;
    }
    .configuration {
      height: 95%;
      padding-right: 10px;
      overflow-y: auto;
      .modelCard {
        width: 100%;
        margin-top: 10px;
        border:1px solid #ece8e5;
        border-radius:14px;
        box-shadow:none;
        transition:.18s ease;
        &:hover{border-color:#ddd5cf;box-shadow:0 8px 22px rgba(52,43,37,.06);transform:translateY(-1px)}
        .topInfo {
          margin-left: 4px;
          margin-right: 4px;
          .modelCardNameWrap {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .modelCardName {
            font-size: 15px;
            font-weight: 900;
          }
        }
        .tags {
          margin-top: 16px;
          & > * {
            margin-left: 4px;
            margin-right: 4px;
          }
        }
      }
    }

    .updateAction {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
      & > * {
        margin-left: 8px;
      }
    }

    .requiredLabel {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
    }

    .requiredMark {
      color: #d54941;
      font-size: 16px;
      line-height: 1;
    }

    .requiredText {
      color: #d54941;
      font-size: 12px;
      font-weight: 700;
    }

    .inputHelp {
      color: #666;
    }

    .optionalSection {
      margin-bottom: 12px;
    }
    .sectionTitle{margin:16px 0 2px;color:#2c2825;font-size:16px}.sectionHint{margin:0;color:#9b948e;font-size:11px}.modelTypeTabs{display:flex;gap:7px;margin:14px 0 4px;padding:5px;border-radius:13px;background:#f2f0ee}.modelTypeTabs button{display:flex;align-items:center;gap:7px;padding:8px 11px;border:0;border-radius:9px;background:transparent;color:#7d7671;font-size:11px;cursor:pointer}.modelTypeTabs button span{display:grid;place-items:center;width:19px;height:19px;border-radius:6px;background:#fff;font-size:9px;font-weight:800}.modelTypeTabs button b{color:#aaa29c;font-size:10px}.modelTypeTabs button.active{background:#fff;color:#292522;box-shadow:0 4px 12px rgba(48,39,34,.06)}.modelTypeTabs button.active span{background:#fff0e7;color:#ec6b34}
  }

  :deep(.t-default-menu) {
    width: 100% !important;
  }

  .editorToolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;

    .editorInfo {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #666;
      font-size: 13px;
    }

    .editorActions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }

  .editorWrapper {
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e5e5e5;
  }

  .testResult {
    .resultContent {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 300px;
      background: #f5f5f5;
      border-radius: 8px;
      padding: 20px;

      img,
      video {
        max-width: 100%;
        max-height: 70vh;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
    }
  }

  // 模型选择器
  .modelPicker {
    max-height: 500px;
    overflow-y: auto;
  }

  .modelCategory {
    margin-bottom: 20px;
  }

  .categoryHeader {
    padding: 10px 0;
    border-bottom: 1px solid var(--td-border-level-1-color);
    margin-bottom: 10px;
  }

  .categoryTitle {
    font-size: 14px;
    font-weight: 600;
    color: var(--td-text-color-primary);
  }
  .needsReview{padding:13px;border:1px solid #f1d4c4;border-radius:13px;background:#fff8f3}.needsReview .categoryHeader{display:flex;align-items:center;justify-content:space-between;border:0}.needsReview .categoryHeader small{display:block;margin-top:4px;color:#a47d68;font-size:11px}.reviewItem{justify-content:space-between;background:#fff}.reviewItem .modelName{max-width:calc(100% - 118px)}

  .modelGrid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .modelItem {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--td-bg-color-container);
    border: 1px solid var(--td-border-level-1-color);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: var(--td-brand-color);
      background: var(--td-brand-color-light);
    }

    &.selected {
      border-color: var(--td-brand-color);
      background: var(--td-brand-color-light);
    }
  }

  .modelName {
    font-size: 13px;
    color: var(--td-text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .linkAdd,
  .importAdd,
  .codeAdd {
    margin-top: 20px;
    .uploadArea {
      margin-top: 20px;
      padding: 42px 20px;
      border: 2px dashed #969494;
      border-radius: 8px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      &:hover {
        border-color: #000000;
      }

      .dragIcon {
        margin-bottom: 12px;
      }

      .uploadText {
        font-size: 14px;
        margin: 0 0 8px;
      }

      .uploadHint {
        font-size: 12px;
        margin: 0;
      }
    }
  }
}
.addBox {
  padding-left: 16px;
  padding-right: 16px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  max-height: 70vh;
  .drmEditor {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--td-component-border, #e5e5e5);
    border-radius: 6px;
    padding: 10px 12px;

    .drmHeader {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--td-component-border, #e5e5e5);
      margin-bottom: 2px;

      .drmHeaderIndex {
        width: 20px;
        flex-shrink: 0;
      }

      .drmHeaderLabel {
        flex: 1;
        font-size: 12px;
        color: var(--td-text-color-secondary, #888);
        font-weight: 600;
      }

      .drmHeaderArrow {
        width: 20px;
        flex-shrink: 0;
      }

      .drmHeaderAction {
        width: 28px;
        flex-shrink: 0;
      }
    }

    .drmRow {
      display: flex;
      align-items: flex-start;
      gap: 6px;

      .drmRowIndex {
        width: 20px;
        text-align: center;
        color: #999;
        font-size: 12px;
        flex-shrink: 0;
        padding-top: 6px;
      }

      .drmInput {
        flex: 1;
      }

      .drmArrow {
        color: #bbb;
        flex-shrink: 0;
        padding-top: 6px;
        font-size: 16px;
      }

      .t-button {
        margin-top: 2px;
        flex-shrink: 0;
      }
    }
  }
}
</style>
