<template>
  <div class="addProject">
    <t-dialog
      attach="body"
      class="createProjectDialog"
      @closed="emit('closed')"
      placement="center"
      v-model:visible="dialogVisible"
      :header="false"
      :close-btn="false"
      width="min(1180px, 94vw)"
      @confirm="handleOk"
      @close-btn-click="handleCancel"
      @cancel="handleCancel"
      :confirm-btn="isEdit ? $t('workbench.project.dialog.save') : $t('workbench.project.dialog.ok')"
      :cancel-btn="$t('workbench.project.dialog.cancel')">
      <div class="createWorkspace">
        <aside class="createSteps">
          <div class="createStepsEyebrow">创作参数</div>
          <div class="createStepsTitle">创作参数预设</div>
          <div class="setupNote"><strong>先确定创作基调</strong><span>预先设定项目类型、制作规格、视觉参考与导演叙事方案，后续可随时调整。</span></div>
          <div class="setupMeta"><span>内容来源</span><strong>{{ formState.projectType === 'novel' ? '小说改编' : '剧本创作' }}</strong></div>
          <div class="setupMeta"><span>预设范围</span><strong>类型 · 规格 · 视觉 · 叙事</strong></div>
          <div class="createStepsFooter">保存后，这些创作参数仍可在项目设置中修改。</div>
        </aside>
        <div class="createContent">
        <div class="formColumns">
        <div class="formLeft">
          <t-form :data="formState" label-align="top">
            <t-form-item :label="$t('workbench.project.dialog.projectType')">
              <t-select v-model="formState.projectType" :placeholder="$t('workbench.project.dialog.selectType')">
                <t-option key="基于小说原文" :label="$t('workbench.project.dialog.basedOnNovel')" value="novel" />
                <t-option key="基于剧本" :label="$t('workbench.project.dialog.basedOnScript')" value="script" />
              </t-select>
            </t-form-item>
            <t-form-item :label="$t('workbench.project.dialog.projectName')">
              <t-input v-model="formState.name" :placeholder="$t('workbench.project.dialog.projectNamePh')" />
            </t-form-item>
            <t-form-item :label="$t('workbench.project.dialog.novelType')">
              <t-input v-model="formState.type" :placeholder="$t('workbench.project.dialog.novelTypePh')" />
            </t-form-item>
            <t-form-item :label="$t('workbench.project.dialog.modelData')">
              <div class="modelParameters">
                <modelSelect v-model="formState.imageModel" type="image" />
                <t-select v-model="formState.imageQuality" class="paramSelect" :placeholder="$t('workbench.production.editImage.quality')">
                  <t-option value="1K" label="1K" />
                  <t-option value="2K" label="2K" />
                  <t-option value="4K" label="4K" />
                </t-select>
              </div>
            </t-form-item>
            <t-form-item :label="$t('workbench.project.dialog.videoModelData')">
              <div class="modelParameters">
                <modelSelect v-model="formState.videoModel" type="video" @change="changeFn" :changeConfig="true" />
                <t-select v-model="formState.mode" class="paramSelect" :placeholder="$t('workbench.production.editImage.mode')">
                  <t-option v-for="value in mode" :key="value.value" :value="value.value" :label="value.label" />
                </t-select>
              </div>
            </t-form-item>
            <t-form-item :label="$t('workbench.project.dialog.videoRatio')">
              <t-select v-model="formState.videoRatio" :options="RATIO_OPTIONS" />
            </t-form-item>
            <t-form-item :label="$t('workbench.project.dialog.textModelData')">
              <div class="modelParameters">
                <modelSelect v-model="formState.textModel" type="text" :placeholder="$t('workbench.project.dialog.textModelPh')" />
              </div>
            </t-form-item>
            <t-form-item :label="$t('workbench.project.dialog.novelIntro')">
              <t-textarea
                v-model="formState.intro"
                :autosize="{ minRows: 3, maxRows: 6 }"
                :placeholder="$t('workbench.project.dialog.novelIntroPh')" />
            </t-form-item>
          </t-form>
        </div>
        <div class="formRight">
          <t-form label-align="top">
            <t-form-item>
              <div class="artStylePicker">
                <div class="artStyleHeader">
                  <div><strong>视觉风格方案</strong><small>选择画面质感、色彩与美术方向</small></div>
                  <t-button v-if="visualPreference.mode === 'preset'" size="small" variant="text" @click="openVisualManualDialog()">
                    <template #icon><i-plus size="14" /></template>
                    专业手册
                  </t-button>
                </div>
                <div class="preferenceChoices"><button v-for="choice in preferenceChoices" :key="choice.value" type="button" :class="{ active: visualPreference.mode === choice.value }" @click="setPreferenceMode('artStyle', choice.value)">{{ choice.label }}</button></div>
                <p v-if="visualPreference.mode === 'none'" class="preferenceNote">暂不限定画面风格，先创建项目。后续可在导演助理中逐步明确。</p>
                <t-textarea v-else-if="visualPreference.mode === 'custom'" :value="visualPreference.text" @change="(value: unknown) => setCustomPreference('artStyle', String(value))" placeholder="例如：宋代写实电影，低饱和自然光；人物服装、房间布局保持一致。" :maxlength="4000" :autosize="{ minRows: 4, maxRows: 7 }" />
                <div v-else class="artStyleContent">
                  <t-loading :loading="visualManualLoading" :text="$t('workbench.project.dialog.loading')">
                    <div class="gridContainer">
                      <div
                        v-for="(item, index) in visualManualOptions"
                        :key="index"
                        class="gridItem"
                        :class="[`preset-${index % 8}`, { active: formState.artStyle === item.stylePath }]"
                        @click="formState.artStyle = item.stylePath">
                        <div class="imageWrapper">
                          <img :src="item.images && item.images[0]" alt="" class="artImage" loading="lazy" />
                        </div>
                        <div class="styleName">{{ item.name.replace(/^#\s*/, '').replace(/风格说明$/, '') }}</div>
                        <t-button class="editBtn" shape="square" @click.stop="openVisualManualDialog(item)">
                          <i-edit theme="outline" size="14" />
                        </t-button>
                        <t-button class="delBtn" shape="square" @click.stop="deleteVisualManual(item)">
                          <i-delete theme="outline" size="14" />
                        </t-button>
                        <t-button class="preview" shape="square" @click.stop="handlePreview(item.images && item.images[0])">
                          <i-preview-open theme="outline" size="14" />
                        </t-button>
                      </div>
                    </div>
                  </t-loading>
                </div>
              </div>
            </t-form-item>
            <t-form-item>
              <div class="directorManual">
                <div class="directorManualHeader">
                  <div><strong>导演叙事方案</strong><small>选择节奏、镜头语言与叙事基调</small></div>
                  <t-button v-if="narrativePreference.mode === 'preset'" size="small" variant="text" @click="openDirectorManualDialog()">
                    <template #icon><i-plus size="14" /></template>
                    专业手册
                  </t-button>
                </div>
                <div class="preferenceChoices"><button v-for="choice in preferenceChoices" :key="choice.value" type="button" :class="{ active: narrativePreference.mode === choice.value }" @click="setPreferenceMode('directorManual', choice.value)">{{ choice.label }}</button></div>
                <p v-if="narrativePreference.mode === 'none'" class="preferenceNote">暂不套用叙事模板。导演助理以剧本为准，重要决策由你确认。</p>
                <t-textarea v-else-if="narrativePreference.mode === 'custom'" :value="narrativePreference.text" @change="(value: unknown) => setCustomPreference('directorManual', String(value))" placeholder="例如：悬疑慢揭示，少旁白，通过人物反应和环境细节交代信息。" :maxlength="4000" :autosize="{ minRows: 4, maxRows: 7 }" />
                <div v-else class="artStyleContent">
                  <t-loading :loading="directorManualLoading" :text="$t('workbench.project.dialog.loading')">
                    <div class="gridContainer">
                      <div
                        v-for="(item, index) in directorManualOptions"
                        :key="index"
                        class="gridItem"
                        :class="{ active: formState.directorManual === item.directorManual }"
                        @click="formState.directorManual = item.directorManual">
                        <div class="imageWrapper">
                          <img :src="item.images && item.images[0]" alt="" class="artImage" loading="lazy" />
                        </div>
                        <div class="styleName">{{ item.name.replace(/^#\s*/, '').replace(/风格说明$/, '') }}</div>
                        <t-button class="editBtn" shape="square" @click.stop="openDirectorManualDialog(item)">
                          <i-edit theme="outline" size="14" />
                        </t-button>
                        <t-button class="delBtn" shape="square" @click.stop="deleteDirectorManual(item)">
                          <i-delete theme="outline" size="14" />
                        </t-button>
                        <t-button class="preview" shape="square" @click.stop="handlePreview(item.images && item.images[0])">
                          <i-preview-open theme="outline" size="14" />
                        </t-button>
                      </div>
                    </div>
                  </t-loading>
                </div>
              </div>
            </t-form-item>
          </t-form>
        </div>
        </div>
        </div>
      </div>
    </t-dialog>
    <!-- 新建/编辑视觉手册弹窗 -->
    <t-dialog
      attach="body"
      v-if="visualManualDialogVisible"
      class="artStyleDialog"
      v-model:visible="visualManualDialogVisible"
      :header="editingVisualManual ? $t('workbench.project.dialog.editVisualManualTitle') : $t('workbench.project.dialog.newVisualManualTitle')"
      width="90vw"
      placement="center"
      @confirm="handleVisualManualSubmit"
      @close-btn-click="resetDirectorManualDialog"
      @cancel="resetDirectorManualDialog"
      :confirm-btn="$t('workbench.project.dialog.ok')"
      :cancel-btn="$t('workbench.project.dialog.cancel')">
      <t-loading :loading="loading">
        <t-form label-align="top">
          <t-form-item>
            <div class="nameAndCoverRow">
              <div class="nameField">
                <label class="fieldLabel">{{ $t("workbench.project.dialog.visualManualName") }}</label>
                <t-input v-model="visualManualForm.name" :placeholder="$t('workbench.project.dialog.visualManualNamePh')" />
              </div>
              <div class="mdFileLocation">
                <label class="fieldLabel">{{ $t("workbench.project.dialog.mdFile") }}</label>
                <t-input v-model="visualManualForm.stylePath" :disabled="!!editingVisualManual" />
              </div>
              <div class="coverField">
                <label class="fieldLabel">{{ $t("workbench.project.dialog.visualManualCover") }}</label>
                <div class="coverUploadArea multiCoverUploadArea">
                  <div v-for="(img, idx) in visualManualForm.images" :key="idx" class="coverPreview">
                    <img :src="img" class="coverImg" @click.stop="handlePreview(img && img)" style="cursor: pointer" />
                    <div class="coverImgRemove" @click="removeVisualManualCover(idx)">
                      <i-close size="10" />
                    </div>
                  </div>
                  <div class="coverUploadTrigger" @click="triggerVisualManualCoverUpload">
                    <input
                      ref="visualManualCoverInputRef"
                      type="file"
                      accept="image/*"
                      multiple
                      style="display: none"
                      @change="handleVisualManualCoverFileChange" />
                    <i-plus size="24" />
                    <span>{{ $t("workbench.project.dialog.uploadCover") }}</span>
                  </div>
                </div>
              </div>
            </div>
          </t-form-item>
          <t-form-item :label="$t('workbench.project.dialog.visualManualPrompt')">
            <div class="promptEditorWrapper">
              <div class="promptEditorHeader">
                <div class="aiExtractInline">
                  <t-tabs :value="visualManualTabValue" size="medium" @change="(v: string | number) => (visualManualTabValue = v as any)">
                    <t-tab-panel v-for="tab in visualManualTabData" :key="tab.value" :value="tab.value" :label="tab.label">
                      <MdEditor
                        v-model="tab.data"
                        :theme="resolveThemeMode(themeSetting.mode)"
                        :toolbars="promptToolbars"
                        :footers="[]"
                        :placeholder="$t('workbench.project.dialog.promptPlaceholder')"
                        style="height: 30vh; margin-top: 5px"
                        @onUploadImg="() => {}" />
                    </t-tab-panel>
                  </t-tabs>
                </div>
              </div>
            </div>
          </t-form-item>
        </t-form>
      </t-loading>
    </t-dialog>
    <!-- 新建/编辑导演手册弹窗 -->
    <t-dialog
      attach="body"
      v-if="directorDialogVisible"
      class="artStyleDialog"
      v-model:visible="directorDialogVisible"
      :header="editingDirectorManual ? $t('workbench.project.dialog.editingDirectorManual') : $t('workbench.project.dialog.newDirecorManualTitle')"
      width="90vw"
      placement="center"
      @confirm="handleDirectorManualSubmit"
      @close-btn-click="resetVisualManualDialog"
      @cancel="resetVisualManualDialog"
      :confirm-btn="$t('workbench.project.dialog.ok')"
      :cancel-btn="$t('workbench.project.dialog.cancel')">
      <t-loading :loading="loading">
        <t-form label-align="top">
          <t-form-item>
            <div class="nameAndCoverRow">
              <div class="nameField">
                <label class="fieldLabel">{{ $t("workbench.project.dialog.directorManualName") }}</label>
                <t-input v-model="directorManualForm.name" :placeholder="$t('workbench.project.dialog.directorManualNamePh')" />
              </div>
              <div class="mdFileLocation">
                <label class="fieldLabel">{{ $t("workbench.project.dialog.directorFile") }}</label>
                <t-input v-model="directorManualForm.directorManual" :disabled="!!editingDirectorManual" />
              </div>
              <div class="coverField">
                <label class="fieldLabel">{{ $t("workbench.project.dialog.directorManualCover") }}</label>
                <div class="coverUploadArea multiCoverUploadArea">
                  <div v-for="(img, idx) in directorManualForm.images" :key="idx" class="coverPreview">
                    <img :src="img" class="coverImg" />
                    <div class="coverImgRemove" @click="removeVisualManualCover(idx)">
                      <i-close size="10" />
                    </div>
                  </div>
                  <div class="coverUploadTrigger" @click="triggerDirectorManualCoverUpload">
                    <input
                      ref="visualManualCoverInputRef"
                      type="file"
                      accept="image/*"
                      multiple
                      style="display: none"
                      @change="handleDirectorManualCoverFileChange" />
                    <i-plus size="24" />
                    <span>{{ $t("workbench.project.dialog.uploadCover") }}</span>
                  </div>
                </div>
              </div>
            </div>
          </t-form-item>
          <t-form-item :label="$t('workbench.project.dialog.directorManualPrompt')">
            <div class="promptEditorWrapper">
              <div class="promptEditorHeader">
                <div class="aiExtractInline">
                  <t-tabs :value="directorManualTabValue" size="medium" @change="(v: string | number) => (directorManualTabValue = v as any)">
                    <t-tab-panel v-for="tab in directorManualTabData" :key="tab.value" :value="tab.value" :label="tab.label">
                      <MdEditor
                        v-model="tab.data"
                        :theme="resolveThemeMode(themeSetting.mode)"
                        :toolbars="promptToolbars"
                        :footers="[]"
                        :placeholder="$t('workbench.project.dialog.promptPlaceholder')"
                        style="height: 30vh; margin-top: 5px"
                        @onUploadImg="() => {}" />
                    </t-tab-panel>
                  </t-tabs>
                </div>
              </div>
            </div>
          </t-form-item>
        </t-form>
      </t-loading>
    </t-dialog>
    <t-image-viewer v-model="visible" :images="[trigger]" :closeOnOverlay="true" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { readCreativePreference, customCreativePreference, type CreativePreference } from '../../../../../shared/creativePreference';
import axios from "@/utils/axios";
import { MdEditor } from "@/utils/markdown";
import { resolveThemeMode } from "@/utils/theme";
import settingStore from "@/stores/setting";
const { themeSetting } = storeToRefs(settingStore());
import type { ToolbarNames } from "md-editor-v3";
import modelSelect from "@/components/modelSelect.vue";
import type { TabValue } from "tdesign-vue-next";
import { DialogPlugin } from "tdesign-vue-next";
import anime90sCover from "@/assets/visual-presets/style-90s-japan.png";
import guochao2dCover from "@/assets/visual-presets/style-guochao-2d.png";
import flatDesignCover from "@/assets/visual-presets/style-flat-design.png";
import urbanRomanceAnimeCover from "@/assets/visual-presets/style-urban-romance-anime.png";
import animation3dCover from "@/assets/visual-presets/style-3d-animation.png";
import guofeng3dCover from "@/assets/visual-presets/style-guofeng-3d.png";
import clayCover from "@/assets/visual-presets/style-clay-stopmotion.png";
import guofengCyberCover from "@/assets/visual-presets/style-guofeng-cyber.png";
import realAncientCover from "@/assets/visual-presets/style-real-ancient.png";
import realUrbanCinematicCover from "@/assets/visual-presets/style-real-urban-cinematic.png";
import realUrbanCover from "@/assets/visual-presets/style-real-urban.png";

const addProjectShow = defineModel<boolean>();
// Lazy mounting starts hidden so TDesign can run its first enter transition.
const dialogVisible = ref(false);
onMounted(() => { dialogVisible.value = !!addProjectShow.value; });
watch(addProjectShow, (visible) => { dialogVisible.value = !!visible; });
watch(dialogVisible, (visible) => {
  if (visible !== addProjectShow.value) addProjectShow.value = visible;
});
const props = defineProps<{
  projectData?: ProjectData | null;
}>();
const emit = defineEmits<{
  (e: "closed"): void;
  (e: "add", data: ProjectFormData): void;
  (
    e: "edit",
    data: {
      id: string;
      name: string;
      intro: string;
      type: string;
      artStyle: string;
      directorManual: string;
      videoRatio: string;
      imageModel: string;
      videoModel: string;
      textModel: string;
      projectType: string;
      imageQuality: "1K" | "2K" | "4K" | "";
      mode: string;
    },
  ): void;
}>();

// ===== 类型定义 =====
interface ProjectData {
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string | null;
  directorManual: string | null;
  videoRatio: string | null;
  imageModel: string;
  videoModel: string;
  textModel?: string;
  projectType: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  visualManual?: string;
  mode: string;
}

interface ProjectFormData {
  projectType: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  textModel: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  mode: string;
}
interface VisualManualItem {
  name: string;
  images?: string[];
  data?: Data[];
  stylePath: string;
}
interface Data {
  label: string;
  value: string;
  data: string;
}
//预览
const trigger = ref();
const visible = ref(false);
function handlePreview(src: string | undefined) {
  visible.value = true;
  trigger.value = src;
}

const DEFAULT_TAB_DATA: () => Data[] = () => [
  { label: "README", value: "README", data: "" },
  { label: "前缀", value: "prefix", data: "" },
  { label: "角色", value: "art_character", data: "" },
  { label: "角色衍生", value: "art_character_derivative", data: "" },
  { label: "道具", value: "art_prop", data: "" },
  { label: "道具衍生", value: "art_prop_derivative", data: "" },
  { label: "场景", value: "art_scene", data: "" },
  { label: "场景衍生", value: "art_scene_derivative", data: "" },
  { label: "分镜", value: "director_storyboard", data: "" },
  { label: "分镜视频", value: "art_storyboard_video", data: "" },
  { label: "技法-导演规划", value: "director_planning_style", data: "" },
  { label: "技法-分镜表设计", value: "director_storyboard_table_style", data: "" },
];

const isEdit = computed(() => !!props.projectData);

// ===== 常量 =====
const RATIO_OPTIONS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];

const DEFAULT_FORM: () => ProjectFormData & { id: number; era: string; createTime: number; userId: number } = () => ({
  id: 0,
  projectType: "novel",
  name: "",
  intro: "",
  type: "",
  artStyle: "",
  era: "",
  videoRatio: "16:9",
  createTime: 0,
  userId: 0,
  imageModel: "",
  videoModel: "",
  textModel: "",
  imageQuality: "",
  mode: "",
  directorManual: "",
});

// ===== 表单 =====
const formState = ref(DEFAULT_FORM());
type PreferenceField = 'artStyle' | 'directorManual';
const preferenceChoices = [{ value: 'none', label: '暂不设置' }, { value: 'preset', label: '选用方案' }, { value: 'custom', label: '自己描述' }] as const;
const preferenceModes = ref<Record<PreferenceField, CreativePreference['mode']>>({ artStyle: 'none', directorManual: 'none' });
const preferenceCache: Record<PreferenceField, Partial<Record<CreativePreference['mode'], string>>> = { artStyle: {}, directorManual: {} };
const visualPreference = computed(() => ({ ...readCreativePreference(formState.value.artStyle), mode: preferenceModes.value.artStyle }));
const narrativePreference = computed(() => ({ ...readCreativePreference(formState.value.directorManual), mode: preferenceModes.value.directorManual }));
function setPreferenceMode(field: PreferenceField, mode: CreativePreference['mode']) {
  preferenceCache[field][preferenceModes.value[field]] = formState.value[field];
  preferenceModes.value[field] = mode;
  formState.value[field] = mode === 'none' ? '' : preferenceCache[field][mode] || (mode === 'custom' ? customCreativePreference('') : '');
}
function setCustomPreference(field: PreferenceField, text: string) { formState.value[field] = customCreativePreference(text); }
function resetPreferenceModes() {
  for (const field of ['artStyle', 'directorManual'] as const) {
    preferenceCache[field] = {};
    preferenceModes.value[field] = readCreativePreference(formState.value[field]).mode;
  }
}

function resetForm() {
  formState.value = DEFAULT_FORM();
  resetPreferenceModes();
}

function handleCancel() {
  addProjectShow.value = false;
  resetForm();
}

function handleOk() {
  if (!formState.value.name) return window.$message.warning($t("workbench.project.msg.enterProjectName"));
  if (!formState.value.type) return window.$message.warning($t("workbench.project.msg.enterProjectType"));
  if (!formState.value.imageModel) return window.$message.warning($t("workbench.project.msg.enterImageModel"));
  if (!formState.value.videoModel) return window.$message.warning($t("workbench.project.msg.enterVideoModel"));
  // 文本模型是剧本对话与资产提取的唯一入口，缺它项目无法运作，必须在创建/编辑时选好
  if (!formState.value.textModel) return window.$message.warning($t("workbench.project.msg.enterTextModel"));
  if (preferenceModes.value.artStyle === 'preset' && !formState.value.artStyle) return window.$message.warning('请选择视觉方案，或选择暂不设置');
  if (preferenceModes.value.directorManual === 'preset' && !formState.value.directorManual) return window.$message.warning('请选择叙事方案，或选择暂不设置');
  if (visualPreference.value.mode === 'custom' && !visualPreference.value.text.trim()) return window.$message.warning('请填写视觉要求，或选择暂不设置');
  if (narrativePreference.value.mode === 'custom' && !narrativePreference.value.text.trim()) return window.$message.warning('请填写叙事要求，或选择暂不设置');
  if (!formState.value.videoRatio) return window.$message.warning($t("workbench.project.msg.enterVideoRatio"));
  if (!formState.value.intro) return window.$message.warning($t("workbench.project.msg.enterProjectIntro"));
  if (!formState.value.imageQuality) return window.$message.warning($t("workbench.project.msg.enterProjectQuality"));
  if (!formState.value.mode) return window.$message.warning($t("workbench.project.msg.selectMode"));
  if (isEdit.value) {
    emit("edit", {
      id: formState.value.id as unknown as string,
      name: formState.value.name,
      intro: formState.value.intro,
      type: formState.value.type,
      artStyle: formState.value.artStyle,
      videoRatio: formState.value.videoRatio,
      imageModel: formState.value.imageModel,
      videoModel: formState.value.videoModel,
      textModel: formState.value.textModel || "",
      projectType: formState.value.projectType || "novel",
      directorManual: formState.value.directorManual,
      imageQuality: formState.value.imageQuality,
      mode: formState.value.mode,
    });
  } else {
    emit("add", {
      projectType: formState.value.projectType || "novel",
      name: formState.value.name,
      intro: formState.value.intro,
      type: formState.value.type,
      artStyle: formState.value.artStyle,
      videoRatio: formState.value.videoRatio || "16:9",
      imageModel: formState.value.imageModel,
      videoModel: formState.value.videoModel,
      textModel: formState.value.textModel || "",
      imageQuality: formState.value.imageQuality,
      directorManual: formState.value.directorManual,
      mode: formState.value.mode,
    });
  }
  resetForm();
  addProjectShow.value = false;
}

// ===== 视觉手册 Prompt 工具栏 =====

const promptToolbars: ToolbarNames[] = [
  "bold",
  "italic",
  "strikeThrough",
  "-",
  "unorderedList",
  "orderedList",
  "-",
  "revoke",
  "next",
  "=",
  "preview",
];


// ===== 视觉手册 =====
const visualManualOptions = ref<VisualManualItem[]>([]);
const visualManualLoading = ref(false);
const visualManualDialogVisible = ref(false);
const editingVisualManual = ref<VisualManualItem | null>(null);
const visualManualForm = ref({ name: "", images: [] as string[], stylePath: "" });
const visualManualCoverInputRef = ref<HTMLInputElement>();
const visualManualTabValue = ref<TabValue>("README");
const visualManualTabData = ref<Data[]>(DEFAULT_TAB_DATA());

function fetchVisualManuals() {
  visualManualLoading.value = true;
  axios
    .post("/project/getVisualManual")
    .then(({ data }) => {
      visualManualOptions.value = data.map(
        (item: { id?: string | number; name: string; image?: string | string[]; images?: string[]; data?: Data[]; stylePath: string }) => ({
          id: item.id,
          name: item.name,
          stylePath: item.stylePath,
          images: [getPresetCover(item.name, undefined, item.images ?? (Array.isArray(item.image) ? item.image : item.image ? [item.image] : []))],
          data: item.data,
        }),
      );
    })
    .finally(() => {
      visualManualLoading.value = false;
    });
}

function getPresetCover(name: string, _index?: number, original: string[] = []) {
  const styleCovers: Array<[RegExp, string]> = [
    [/90年代日式/, anime90sCover],
    [/国风二次元新国潮/, guochao2dCover],
    [/2D扁平|Flat Design/, flatDesignCover],
    [/成熟都市言情二次元/, urbanRomanceAnimeCover],
    [/3D 动画渲染/, animation3dCover],
    [/国风3D/, guofeng3dCover],
    [/定格动画黏土/, clayCover],
    [/国风赛博3D/, guofengCyberCover],
    [/真人古风写实/, realAncientCover],
    [/真人都市影像/, realUrbanCinematicCover],
    [/真人都市写实/, realUrbanCover],
  ];
  return styleCovers.find(([pattern]) => pattern.test(name))?.[1] || original[0] || flatDesignCover;
}

function openVisualManualDialog(item?: VisualManualItem) {
  editingVisualManual.value = item ?? null;
  if (item) {
    visualManualForm.value.name = item.name;
    visualManualForm.value.stylePath = item.stylePath;
    visualManualForm.value.images = item.images ? [...item.images] : [];
    const existingData: Data[] = Array.isArray(item.data) ? item.data : [];
    visualManualTabData.value = DEFAULT_TAB_DATA().map((tab) => {
      const found = existingData.find((d) => d.value === tab.value);
      return found ? { ...tab, data: found.data } : { ...tab };
    });
  } else {
    visualManualForm.value = { name: "", images: [], stylePath: "" };
    visualManualTabData.value = DEFAULT_TAB_DATA();
  }
  visualManualTabValue.value = "README";
  visualManualDialogVisible.value = true;
}

function resetVisualManualDialog() {
  visualManualDialogVisible.value = false;
  editingVisualManual.value = null;
  visualManualForm.value = { name: "", images: [], stylePath: "" };
  visualManualTabData.value = DEFAULT_TAB_DATA();
  visualManualTabValue.value = "README";
}

function triggerVisualManualCoverUpload() {
  visualManualCoverInputRef.value?.click();
}

function handleVisualManualCoverFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      visualManualForm.value.images.push(reader.result as string);
    };
    reader.readAsDataURL(file);
  });
  (e.target as HTMLInputElement).value = "";
}

function removeVisualManualCover(idx: number) {
  visualManualForm.value.images.splice(idx, 1);
}
const loading = ref(false);
async function handleVisualManualSubmit() {
  if (!visualManualForm.value.name.trim()) {
    window.$message.warning($t("workbench.project.msg.enterVisualManualName"));
    return;
  }
  if (!visualManualForm.value.images.length) {
    window.$message.warning($t("workbench.project.msg.enterVisualManualImage"));
    return;
  }
  const emptyTab = visualManualTabData.value.find((tab) => !tab.data.trim());
  if (emptyTab) return window.$message.warning(`「${emptyTab.label}」${$t("workbench.project.msg.enterVisualManualTabData")}`);
  try {
    loading.value = true;
    if (editingVisualManual.value) {
      await axios.post("/project/editVisualManual", {
        name: visualManualForm.value.name,
        images: visualManualForm.value.images,
        data: visualManualTabData.value,
        stylePath: visualManualForm.value.stylePath,
      });
    } else {
      await axios.post("/project/addVisualManual", {
        name: visualManualForm.value.name,
        images: visualManualForm.value.images,
        data: visualManualTabData.value,
        stylePath: visualManualForm.value.stylePath,
      });
    }

    loading.value = false;
    if (editingVisualManual.value) {
      window.$message.success($t("workbench.project.msg.visualManualUpdated"));
    } else {
      window.$message.success($t("workbench.project.msg.visualManualAdded"));
    }
    resetVisualManualDialog();
    fetchVisualManuals();
  } catch (e: any) {
    loading.value = false;
    window.$message.error(e.message ?? $t("workbench.project.msg.operationFailed"));
  }
}
function deleteVisualManual(item: VisualManualItem) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.project.msg.deleteVisualManualHeader"),
    body: $t("workbench.project.msg.deleteVisualManualBody", { name: item.stylePath }),
    confirmBtn: $t("workbench.project.msg.deleteVisualManualConfirm"),
    cancelBtn: $t("workbench.project.msg.deleteVisualManualCancel"),
    onConfirm: () => {
      axios
        .post("/project/deleteVisualManual", { name: item.stylePath })
        .then(() => {
          fetchVisualManuals();
          resetVisualManualDialog();
          window.$message.success($t("workbench.project.msg.visualManualDeleted"));
        })
        .catch((e) => {
          window.$message.error(e.message ?? $t("workbench.project.msg.operationFailed"));
        })
        .finally(() => {
          fetchVisualManuals();
          dialog.destroy();
        });
    },
  });
}
type VideoMode =
  | "singleImage" //单图参考
  | "startEndRequired" //首尾帧（两张都得有）
  | "endFrameOptional" //首尾帧（尾帧可选）
  | "startFrameOptional" //首尾帧（首帧可选）
  | "text" //文本
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[]; //多参考（数字代表限制数量）
const mode = ref<{ label: string; value: string }[]>([]);
const MODE_LABEL: Record<string, string> = {
  singleImage: $t("workbench.production.generate.modeSingleImage"),
  startEndRequired: $t("workbench.production.generate.modeStartEnd"),
  endFrameOptional: $t("workbench.production.generate.modeStartEnd"),
  startFrameOptional: $t("workbench.production.generate.modeStartEnd"),
  text: $t("workbench.production.generate.modeText"),
  videoReference: $t("workbench.production.generate.modeVideoRef"),
  imageReference: $t("workbench.production.generate.modeImageRef"),
  audioReference: $t("workbench.production.generate.modeAudioRef"),
};
// 模式转换为统一的 key 形式，方便后续处理
function getModeLabel(mode?: VideoMode): string {
  if (!mode) return "";
  if (Array.isArray(mode)) return mode.map((r) => MODE_LABEL[r.replace(/:.*$/, "")] ?? r).join("、");
  return MODE_LABEL[mode] ?? mode;
}
//模式数组转换为字符串 key，方便在前端使用和比较
function modeToKey(m: VideoMode): string {
  return Array.isArray(m) ? JSON.stringify(m) : m;
}
//获取模式
function changeFn(val: string, data: any) {
  mode.value = data.mode.map((item: any) => ({
    label: getModeLabel(item),
    value: modeToKey(item),
  }));
}
//导演手册
interface DirectorManualItem {
  name: string;
  images?: string[];
  data?: Data[];
  directorManual: string;
}
const DIRECTOR_DEFAULT_TAB_DATA: () => Data[] = () => [
  { label: "README", value: "README", data: "" },
  { label: "导演规划", value: "director_planning_narrative", data: "" },
  { label: "分镜表", value: "director_storyboard_table_narrative", data: "" },
];
const directorManualForm = ref({ name: "", images: [] as string[], directorManual: "" });
const directorManualLoading = ref(false);
const editingDirectorManual = ref<DirectorManualItem | null>(null);
const directorDialogVisible = ref(false);
const directorManualOptions = ref<DirectorManualItem[]>([]);
const directorManualTabValue = ref<TabValue>("README");
const directorManualTabData = ref<Data[]>(DIRECTOR_DEFAULT_TAB_DATA());
//查询导演手册
function queryDirectorManual() {
  directorManualLoading.value = true;
  axios
    .post("/project/queryDirectorManual")
    .then(({ data }) => {
      directorManualOptions.value = data.map(
        (item: { id?: string | number; name: string; image?: string | string[]; images?: string[]; data?: Data[]; directorManual: string }) => ({
          id: item.id,
          name: item.name,
          directorManual: item.directorManual,
          images: item.images ?? (Array.isArray(item.image) ? item.image : item.image ? [item.image] : []),
          data: item.data,
        }),
      );
    })
    .finally(() => {
      directorManualLoading.value = false;
    });
}
//新建导演手册
function openDirectorManualDialog(item?: DirectorManualItem) {
  editingDirectorManual.value = item ?? null;
  if (item) {
    directorManualForm.value.name = item.name;
    directorManualForm.value.directorManual = item.directorManual;
    directorManualForm.value.images = item.images ? [...item.images] : [];
    const existingData: Data[] = Array.isArray(item.data) ? item.data : [];
    directorManualTabData.value = DIRECTOR_DEFAULT_TAB_DATA().map((tab) => {
      const found = existingData.find((d) => d.value === tab.value);
      return found ? { ...tab, data: found.data } : { ...tab };
    });
  } else {
    directorManualForm.value = { name: "", images: [], directorManual: "" };
    directorManualTabData.value = DIRECTOR_DEFAULT_TAB_DATA();
  }
  directorManualTabValue.value = "README";
  directorDialogVisible.value = true;
}
function resetDirectorManualDialog() {
  directorDialogVisible.value = false;
  editingDirectorManual.value = null;
  directorManualForm.value = { name: "", images: [], directorManual: "" };
  directorManualTabData.value = DIRECTOR_DEFAULT_TAB_DATA();
  directorManualTabValue.value = "README";
}
function deleteDirectorManual(item: DirectorManualItem) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.project.msg.deleteDirectorManualHeader"),
    body: $t("workbench.project.msg.deleteDirectorManualBody", { name: item.directorManual }),
    confirmBtn: $t("workbench.project.msg.deleteVisualManualConfirm"),
    cancelBtn: $t("workbench.project.msg.deleteVisualManualCancel"),
    onConfirm: () => {
      axios
        .post("/project/deleteDirectorManual", { name: item.directorManual })
        .then(() => {
          queryDirectorManual();
          resetDirectorManualDialog();
          window.$message.success($t("workbench.project.msg.visualManualDeleted"));
        })
        .catch((e) => {
          window.$message.error(e.message ?? $t("workbench.project.msg.operationFailed"));
        })
        .finally(() => {
          queryDirectorManual();
          dialog.destroy();
        });
    },
  });
}
//导演手册编辑和新增保存
async function handleDirectorManualSubmit() {
  if (!directorManualForm.value.name.trim()) {
    window.$message.warning($t("workbench.project.msg.enterVisualManualName"));
    return;
  }
  if (!directorManualForm.value.images.length) {
    window.$message.warning($t("workbench.project.msg.enterVisualManualImage"));
    return;
  }
  const emptyTab = directorManualTabData.value.find((tab) => !tab.data.trim());
  if (emptyTab) return window.$message.warning(`「${emptyTab.label}」${$t("workbench.project.msg.enterVisualManualTabData")}`);
  try {
    loading.value = true;
    if (editingDirectorManual.value) {
      await axios.post("/project/editDirectorlManual", {
        name: directorManualForm.value.name,
        images: directorManualForm.value.images,
        data: directorManualTabData.value,
        directorManual: directorManualForm.value.directorManual,
      });
    } else {
      await axios.post("/project/addDirectorManual", {
        name: directorManualForm.value.name,
        images: directorManualForm.value.images,
        data: directorManualTabData.value,
        directorManual: directorManualForm.value.directorManual,
      });
    }

    loading.value = false;
    if (editingDirectorManual.value) {
      window.$message.success($t("workbench.project.msg.directorManualUpdated"));
    } else {
      window.$message.success($t("workbench.project.msg.directorManualAdded"));
    }
    resetDirectorManualDialog();
    queryDirectorManual();
  } catch (e: any) {
    loading.value = false;
    window.$message.error(e.message ?? $t("workbench.project.msg.operationFailed"));
  }
}
function triggerDirectorManualCoverUpload() {
  visualManualCoverInputRef.value?.click();
}

function handleDirectorManualCoverFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      directorManualForm.value.images.push(reader.result as string);
    };
    reader.readAsDataURL(file);
  });
  (e.target as HTMLInputElement).value = "";
}
watch(addProjectShow, async (visible) => {
  if (visible) {
    if (props.projectData) {
      formState.value = {
        ...DEFAULT_FORM(),
        id: props.projectData.id as unknown as number,
        name: props.projectData.name || "",
        intro: props.projectData.intro || "",
        type: props.projectData.type || "",
        artStyle: props.projectData.artStyle || "",
        videoRatio: props.projectData.videoRatio || "16:9",
        imageModel: props.projectData.imageModel || "",
        videoModel: props.projectData.videoModel || "",
        textModel: props.projectData.textModel || "",
        imageQuality: props.projectData.imageQuality || "",
        projectType: props.projectData.projectType || "novel",
        mode: props.projectData.mode || "text",
        directorManual: props.projectData.directorManual || "",
      };
      resetPreferenceModes();
      // 编辑模式下主动获取视频模型详情，填充 mode 列表以回显 label
      if (props.projectData.videoModel) {
        try {
          const { data } = await axios.post("/modelSelect/getModelDetail", {
            modelId: props.projectData.videoModel,
          });
          if (data?.mode) {
            mode.value = data.mode.map((item: any) => ({
              label: getModeLabel(item),
              value: modeToKey(item),
            }));
          }
        } catch (e) {
          // 获取失败不影响其他功能
        }
      }
    } else {
      resetForm();
    }
    fetchVisualManuals();
    queryDirectorManual();
  }
}, { immediate: true });
</script>

<style lang="scss" scoped>
.preferenceChoices { display:flex; gap:8px; margin:16px 0; flex-wrap:wrap; }
.preferenceChoices button { border:1px solid #e5dfd6; border-radius:9px; padding:8px 14px; background:#fff; color:#777066; cursor:pointer; }
.preferenceChoices button.active { color:#b6552a; border-color:#e8bda3; background:#fff4eb; }
.preferenceNote { padding:18px; margin:0; color:#847a6e; background:#f3f0ea; border-radius:10px; font-size:13px; line-height:1.8; }
.dialogIntro {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: -8px 0 22px;
  padding: 16px 18px;
  border: 1px solid rgba(245, 116, 0, 0.14);
  border-radius: 14px;
  background: linear-gradient(110deg, rgba(255, 243, 230, 0.8), rgba(250, 249, 245, 0.72));

  .dialogIntroMark {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: #c25a22;
    background: rgba(245, 116, 0, 0.12);
  }
  .dialogIntroTitle { font-size: 16px; font-weight: 700; color: var(--text-primary); }
  .dialogIntroText { margin-top: 4px; color: var(--text-tertiary); font-size: 12px; }
}

.createWorkspace {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 0;
  background: #fcfbf8;
}

.createSteps {
  display: flex;
  flex-direction: column;
  padding: 30px 24px;
  background: #eeece6;
  color: #242321;
  border-right: 1px solid #dcd9d2;
}

.createStepsEyebrow { color: #817b70; font-size: 10px; letter-spacing: .16em; font-weight: 700; }
.createStepsTitle { margin: 8px 0 34px; font-size: 24px; font-weight: 700; letter-spacing: -.04em; }
.step { display: flex; gap: 12px; align-items: flex-start; padding: 14px 10px; margin-bottom: 6px; color: #8f8a80; border-radius: 12px; }
.step span { font-size: 11px; font-weight: 700; color: #79746a; padding-top: 2px; }
.step strong { display: block; color: inherit; font-size: 13px; }
.step small { display: block; margin-top: 4px; color: #79746a; font-size: 11px; }
.step.active { color: #fff; background: rgba(245, 116, 0, .16); box-shadow: inset 3px 0 #f57400; }
.step.active span { color: #ffc59b; }
.step.active small { color: #e2c9b2; }
.createStepsFooter { margin-top: auto; padding-top: 16px; border-top: 1px solid #d3cfc6; color: #817b70; font-size: 11px; line-height: 1.7; }
.setupNote { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid #d6d1c7; border-radius: 8px; background: #f7f6f2; }
.setupNote strong { color: #2c2a26; font-size: 14px; }
.setupNote span { color: #716c63; font-size: 12px; line-height: 1.7; }
.setupMeta { display: flex; flex-direction: column; gap: 5px; margin-top: 24px; padding-bottom: 14px; border-bottom: 1px solid #d8d4cc; }
.setupMeta span { color: #8a847a; font-size: 11px; }
.setupMeta strong { color: #403c36; font-size: 12px; font-weight: 600; }
.createContent { min-width: 0; padding: 30px; overflow: auto; background: #fcfbf8; }

:deep(.t-dialog__body) {
  max-height: min(calc(100dvh - 140px), 760px);
  overflow-y: auto;
  padding: 0;
}

:deep(.t-dialog) {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(42, 38, 31, .18);
}

/* 新建项目弹窗：TDesign 会把自定义 class 落在 __ctx 包裹层而非 .t-dialog 卡片上，
   必须用后代选择器。让弹窗卡片本身成为工作区容器（单一卡片），不再有外层白框。 */
:deep(.createProjectDialog .t-dialog) {
  background: #fcfbf8;
  border: 1px solid #dcd9d2;
  border-radius: 14px;
  box-shadow: 0 24px 80px rgba(42, 38, 31, .18);
  overflow: hidden;

  .t-dialog__header {
    background: transparent;
    border-bottom: 1px solid #e2dfd8;
  }

  .t-dialog__body { background: transparent; }

  .t-dialog__footer {
    background: transparent;
    border-top: 1px solid #e2dfd8;
  }
}

:deep(.t-dialog__header) {
  padding: 22px 28px;
  color: #242321;
  font-size: 18px;
  border-bottom: 1px solid #e2dfd8;
}

:deep(.t-dialog__footer) {
  padding: 16px 28px 22px;
  border-top: 1px solid var(--td-component-border);
}

/* Keep form labels and model quotes in normal flow, including narrow dialogs. */
.createContent :deep(.t-form__item) { display: flex; flex-direction: column; align-items: stretch; margin-bottom: 18px; }
.createContent :deep(.t-form__label) { float: none; width: 100% !important; height: auto; min-height: 24px; padding: 0 0 8px; line-height: 20px; text-align: left; }
.createContent :deep(.t-form__controls) { width: 100%; min-width: 0; margin-left: 0 !important; }
.createContent :deep(.t-form__controls-content) { display: block; min-width: 0; }
.modelParameters { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; width: 100%; }
.modelParameters :deep(.modelSelectField), .modelParameters :deep(.paramSelect) { width: 100%; min-width: 0; }
.modelParameters :deep(.modelSelectControl) { width: 100%; min-width: 0; }
.modelParameters :deep(.modelSelectControl > span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.formColumns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  animation: fadeSlideIn 300ms ease-out;

  .formLeft {
    flex: 1;
    min-width: 0;
    animation: fadeSlideIn 350ms ease-out;
    padding: 0 4px 8px;
    border: 0;
    border-radius: 16px;
    background: transparent;
  }

  .formRight {
    flex: 1;
    min-width: 0;
    animation: fadeSlideIn 400ms ease-out;
    display: flex;
    flex-direction: column;
    gap: 16px;

    > :deep(.t-form-item) { margin: 0; }
  }
}

.formLeft :deep(.t-input),
.formLeft :deep(.t-select),
.formLeft :deep(.t-textarea),
.formLeft :deep(.t-input-adornment),
.formLeft :deep(.t-select-input) {
  border-radius: 7px;
}
.formLeft :deep(.t-input), .formLeft :deep(.t-select-input) { min-height: 42px; background: #fff; border-color: #d8d5ce; }
.formLeft :deep(.t-input:hover), .formLeft :deep(.t-select-input:hover) { border-color: #6c675d; }
.formLeft :deep(.t-input--focused), .formLeft :deep(.t-select-input--focused) { border-color: #2f2d29; box-shadow: 0 0 0 2px rgba(47, 45, 41, .08); }
.formLeft :deep(.t-form__item) { margin-bottom: 18px; }
.formLeft :deep(.t-form__label) { color: #302e2a; font-weight: 600; font-size: 13px; }

.directorManual {
  width: 100%;
  height: 50%;
  .directorManualHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;

    strong { display: block; font-size: 15px; color: var(--text-primary); }
    small { display: block; margin-top: 4px; color: var(--text-tertiary); font-size: 12px; font-weight: 400; }
  }
  .artStyleContent {
    height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px;
    &::-webkit-scrollbar {
      width: 5px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(245, 116, 0, 0.28);
      border-radius: 999px;
      &:hover {
        background: rgba(242, 100, 50, 0.48);
      }
    }
  }
}

.artStylePicker {
  width: 100%;
  height: 50%;
  .artStyleHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;

    strong { display: block; font-size: 15px; color: var(--text-primary); }
    small { display: block; margin-top: 4px; color: var(--text-tertiary); font-size: 12px; font-weight: 400; }
  }
  .artStyleContent {
    height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px;
    &::-webkit-scrollbar {
      width: 5px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(245, 116, 0, 0.28);
      border-radius: 999px;
      &:hover {
        background: rgba(242, 100, 50, 0.48);
      }
    }
  }
}

.gridContainer {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
  gap: 14px;

  .gridItem {
    cursor: pointer;
    transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
    border: 1px solid #dedbd4;
    border-radius: 8px;
    background: #fff;
    position: relative;
    overflow: hidden;

    &:hover {
      box-shadow: 0 8px 24px rgba(31, 27, 72, 0.14);
      border-color: #8b8478;
      .editBtn { z-index: 2; opacity: 1; transform: scale(1); }
      .delBtn { z-index: 2; opacity: 1; transform: scale(1); }
      .preview { z-index: 2; opacity: 1; }
      .imageWrapper .artImage { transform: scale(1.06); }
    }

    /* 不再做几何缩放/平移，避免内部的查看等浮层按钮跟着“跑” */
    &:active {
      box-shadow: 0 4px 12px rgba(31, 27, 72, 0.12);
      border-color: rgba(245, 116, 0, 0.6);
    }

    &.active {
      border-color: #2f2d29;
      box-shadow: 0 0 0 2px rgba(47, 45, 41, .12), 0 4px 12px rgba(47, 45, 41, .08);
      position: relative;
      &::after {
        content: "✓";
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(2px);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        font-weight: 700;
        height: 100%;
        border-radius: 11px 11px 0 0;
        animation: checkPop 200ms ease-out;
      }
    }

    .imageWrapper {
      position: relative;
      overflow: hidden;
      border-radius: 8px;

      .artImage {
        width: 100%;
        aspect-ratio: 1.3;
        object-fit: cover;
        display: block;
        transition: transform 300ms ease;
      }

    }
    .styleName { min-height: 38px; padding: 10px 10px 9px; color: #2d2b3b; font-size: 12px; line-height: 1.45; font-weight: 600; }


    .editBtn {
      position: absolute;
      top: 6px;
      left: 6px;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50% !important;
      cursor: pointer;
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 150ms ease, transform 150ms ease, background-color 150ms ease, box-shadow 150ms ease;

      /* —— 抵消全局 base+primary 品牌渐变对本浮层按钮的污染 —— */
      padding: 0 !important;
      min-height: auto !important;
      backdrop-filter: blur(8px) saturate(150%);
      -webkit-backdrop-filter: blur(8px) saturate(150%);
      background-image: none !important;
      background-color: rgba(28, 28, 32, 0.55) !important;
      -webkit-text-fill-color: #fff;
      color: #fff !important;
      border: none !important;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        inset 0 -1px 0 rgba(0, 0, 0, 0.25);

      i-edit,
      svg,
      svg path { stroke: #fff; }
      svg [fill],
      svg circle[fill],
      svg rect[fill] { fill: #fff; }

      &:hover {
        background-image: none !important;
        background-color: rgba(255, 155, 69, 0.95) !important;
        color: #fff !important;
        -webkit-text-fill-color: #fff;
        transform: scale(1.08);
        box-shadow: 0 4px 10px rgba(37, 99, 235, 0.45);
        i-edit,
        svg,
        svg path { stroke: #fff; }
      }

      &:active {
        transform: scale(0.92) !important;
      }
    }

    .delBtn {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50% !important;
      cursor: pointer;
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 150ms ease, transform 150ms ease, background-color 150ms ease, box-shadow 150ms ease;

      /* —— 抵消全局 base+primary 品牌渐变对本浮层按钮的污染 —— */
      padding: 0 !important;
      min-height: auto !important;
      backdrop-filter: blur(8px) saturate(150%);
      -webkit-backdrop-filter: blur(8px) saturate(150%);
      background-image: none !important;
      background-color: rgba(28, 28, 32, 0.55) !important;
      -webkit-text-fill-color: #fff;
      color: #fff !important;
      border: none !important;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        inset 0 -1px 0 rgba(0, 0, 0, 0.25);

      i-delete,
      svg,
      svg path { stroke: #fff; }
      svg [fill],
      svg circle[fill],
      svg rect[fill] { fill: #fff; }

      &:hover {
        background-image: none !important;
        background-color: rgba(239, 68, 68, 0.95) !important;
        color: #fff !important;
        -webkit-text-fill-color: #fff;
        transform: scale(1.08);
        box-shadow: 0 4px 10px rgba(225, 29, 72, 0.45);
        i-delete,
        svg,
        svg path { stroke: #fff; }
      }

      &:active {
        transform: scale(0.92) !important;
      }
    }

    .preview {
      position: absolute;
      top: 50%;
      left: 50%;
      /* 关键：居中定位的 transform 设为常量，绝不让 hover/显现/按下参与几何缩放，
         否则会出现“光标一过去按钮就跑”——尤其按下时全局主色规则的
         transform:translateY(0) 会顶掉这里的 translate(-50%,-50%)。 */
      transform: translate(-50%, -50%);
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50% !important;
      cursor: pointer;
      opacity: 0;
      transition: opacity 150ms ease, background-color 150ms ease, box-shadow 150ms ease;

      /* —— 抵消全局 base+primary 品牌渐变对本浮层按钮的污染 —— */
      padding: 0 !important;
      min-height: auto !important;
      backdrop-filter: blur(8px) saturate(150%);
      -webkit-backdrop-filter: blur(8px) saturate(150%);
      background-image: none !important;
      background-color: rgba(28, 28, 32, 0.55) !important;
      -webkit-text-fill-color: #fff;
      color: #fff !important;
      border: none !important;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        inset 0 -1px 0 rgba(0, 0, 0, 0.25);

      i-preview-open,
      svg,
      svg path { stroke: #fff; }
      svg [fill],
      svg circle[fill],
      svg rect[fill] { fill: #fff; }

      &:hover {
        background-image: none !important;
        background-color: rgba(245, 116, 0, 0.95) !important;
        color: #fff !important;
        -webkit-text-fill-color: #fff;
        /* 锁住居中 transform：阻止全局主色规则的 :hover{transform:translateY(-1px)}
           再次顶掉这里的 translate(-50%,-50%) 导致查看按钮“一悬停就跑” */
        transform: translate(-50%, -50%) !important;
        /* 不再用 scale 放大；仅靠阴影+外光环表达反馈，形状位置恒定 */
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.4),
          0 6px 16px rgba(242, 100, 50, 0.52),
          0 0 0 3px rgba(245, 116, 0, 0.25);
        i-preview-open,
        svg,
        svg path { stroke: #fff; }
      }

      /* 保护罩：无论全局规则如何改写 active 的 transform，
         都强制保持居中 translate，杜绝按下一瞬的位移窜逃 */
      &:active {
        transform: translate(-50%, -50%) !important;
        background-image: none !important;
        background-color: rgba(242, 100, 50, 0.92) !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.4),
          0 3px 10px rgba(242, 100, 50, 0.5);
      }
    }
  }
}

// 视觉手册名称与封面同行布局
.nameAndCoverRow {
  gap: 16px;
  width: 100%;
  .nameField {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mdFileLocation {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }

  .coverField {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 20px;
  }

  .fieldLabel {
    font-size: 14px;
    color: var(--td-text-color-primary);
    font-weight: 500;
  }
}

// 画风弹窗样式
.coverUploadArea {
  width: 100%;

  .coverPreview {
    display: flex;
    align-items: center;
    gap: 12px;

    .coverImg {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid var(--td-component-border);
      transition: transform 200ms ease, box-shadow 200ms ease;
      &:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
    }
  }

  &.multiCoverUploadArea {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;

    .coverPreview {
      position: relative;
      flex-shrink: 0;

      .coverImg {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 8px;
        border: 1px solid var(--td-component-border);
        display: block;
        transition: transform 200ms ease, box-shadow 200ms ease;
        &:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
      }

      .coverImgRemove {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--td-error-color);
        color: #fff;
        border-radius: 50%;
        cursor: pointer;
        font-size: 10px;
        z-index: 1;
        transition: transform 150ms ease, background-color 150ms ease;
        &:hover {
          background: var(--td-error-color-hover);
          transform: scale(1.15);
        }
        &:active {
          transform: scale(0.9);
        }
      }
    }
  }

  .coverUploadTrigger {
    width: 80px;
    height: 80px;
    border: 2px dashed var(--td-component-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--td-text-color-placeholder);
    gap: 4px;
    font-size: 12px;
    transition: border-color 200ms ease, color 200ms ease, background-color 200ms ease;
    white-space: nowrap;
    &:hover {
      border-color: var(--td-brand-color);
      color: var(--td-brand-color);
      background: rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.04);
    }
    &:active {
      transform: scale(0.96);
    }
  }
}

.promptEditorWrapper {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  .promptEditorHeader {
    display: flex;
    margin-bottom: 8px;

    .aiExtractInline {
      width: 100%;
      .aiImageList {
        display: flex;
        align-items: center;
        gap: 4px;

        .aiImageItem {
          position: relative;
          width: 36px;
          height: 36px;

          .aiImg {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 4px;
            border: 1px solid var(--td-component-border);
          }

          .aiImgRemove {
            position: absolute;
            top: -5px;
            right: -5px;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--td-error-color);
            color: #fff;
            border-radius: 50%;
            cursor: pointer;
            font-size: 9px;
          }
        }

        .aiImageAdd {
          width: 36px;
          height: 36px;
          border: 2px dashed var(--td-component-border);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--td-text-color-placeholder);
          transition: border-color 200ms ease, color 200ms ease;

          &:hover {
            border-color: var(--td-brand-color);
            color: var(--td-brand-color);
          }
        }
      }
    }
  }
}

@media (max-width: 600px) {
  .createSteps { display: none; }
  .createContent { padding: 20px 16px; }
  .artStyleHeader, .directorManualHeader { flex-wrap: wrap; gap: 8px; }
  .gridContainer { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .formColumns { grid-template-columns: minmax(0, 1fr); }
  .createStepsTitle { margin-bottom: 14px; }
  .setupMeta { display: none; }
  .createWorkspace { grid-template-columns: 1fr; }
  .createSteps { padding: 18px; }
  .createStepsTitle { margin-bottom: 16px; }
  .createStepsFooter { display: none; }
  .step { display: inline-flex; width: calc(25% - 6px); margin: 0 4px 0 0; padding: 10px 6px; }
  .step div { display: none; }
  .step span { margin: auto; }
  .createContent { padding: 18px; }
}

// MdEditor 在弹窗内的样式调整
:deep(.md-editor) {
  border-radius: 8px;
}

// 画风弹窗整体高度72vh
:deep(.artStyleDialog) {
  .t-dialog__body {
    height: 75vh;
    overflow-y: auto;
    &::-webkit-scrollbar {
      width: 5px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(245, 116, 0, 0.28);
      border-radius: 999px;
    }
  }
}

// 主对话框优化 —— 苹果风材质化升级
:deep(.t-dialog) {
  border-radius: 20px;
  overflow: hidden;
  box-shadow:
    0 24px 64px -12px rgba(31, 27, 72, 0.22),
    0 8px 20px -6px rgba(15, 23, 42, 0.08);
  background: #ffffff;

  .t-dialog__header {
    padding: 18px 24px;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #0f1729;
    background: linear-gradient(180deg, #ffffff, #fafaff);
    border-bottom: 1px solid rgba(15, 23, 42, 0.06);

    /* 关闭按钮：苹果风圆形命中区 + 悬停旋转 */
    .t-dialog__close {
      width: 28px;
      height: 28px;
      margin-right: -4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      color: rgba(15, 23, 42, 0.45);
      transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
      &:hover {
        background: rgba(245, 116, 0, 0.14);
        color: #c25a22;
        transform: rotate(90deg);
      }
    }
  }

  .t-dialog__body {
    &::-webkit-scrollbar {
      width: 5px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(245, 116, 0, 0.28);
      border-radius: 999px;
    }
  }
}

// 输入框聚焦动效
:deep(.t-input),
:deep(.t-textarea),
:deep(.t-select) {
  transition: box-shadow 200ms ease, border-color 200ms ease;
  &:focus-within {
    box-shadow: 0 0 0 3px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.15);
  }
}

/* 必须放在所有通用 .t-dialog 规则之后，避免被主题样式重新刷回白色。
   注意：createProjectDialog 落在 __ctx 层，用后代选择器命中弹窗卡片。 */
:deep(.createProjectDialog .t-dialog) {
  background: #fcfbf8 !important;
  border: 1px solid #dcd9d2 !important;
  border-radius: 14px !important;
  box-shadow: 0 24px 80px rgba(42, 38, 31, .18) !important;
  overflow: hidden;

  .t-dialog__header,
  .t-dialog__body,
  .t-dialog__footer {
    background: transparent !important;
  }

  .t-dialog__header { border-bottom: 1px solid #e2dfd8 !important; }
  .t-dialog__footer { border-top: 1px solid #e2dfd8 !important; }
}

// 按钮交互优化
:deep(.t-button) {
  transition: transform 100ms ease, box-shadow 150ms ease;
  &:active {
    transform: scale(0.97);
  }
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

@keyframes checkPop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

<style lang="scss">
/* Dialogs teleport to body so fixed positioning stays relative to the viewport. */
.createProjectDialog .t-dialog, .t-dialog.createProjectDialog { padding: 0 !important; overflow: hidden; border-radius: 16px; border: 1px solid #dcd9d2; background: #fcfbf8; box-shadow: 0 24px 80px rgba(42,38,31,.18); }
.createProjectDialog .t-dialog__body { padding: 0 !important; max-height: min(calc(100dvh - 128px), 760px); overflow-y: auto; overscroll-behavior: contain; }
.createProjectDialog .t-dialog__footer { margin: 0; padding: 16px 24px; border-top: 1px solid #e2dfd8; background: #fcfbf8; }
</style>
