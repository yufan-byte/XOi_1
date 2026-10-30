<template>
  <div class="cornerScape f">
    <StoryWorkspaceHeader current="cornerScape" :project-type="project?.projectType" title="人物 · 场景 · 道具" description="先确认资产设定，再选择创作方法、检查提示词并生成图片。">
      <template #meta><span>{{ dataList.length }} 个资产</span><span>已出图 {{ cornerReadyCount }}</span></template>
    </StoryWorkspaceHeader>
    <div class="cornerWorkspaceBody">
    <t-dialog v-model:visible="batchStudioVisible" header="批量创作" width="1000px" placement="center" :footer="false" :close-on-overlay-click="false" class="creationDialog">
      <div class="creationStudio">
        <div class="creationTop"><div><h3>{{ batchStage === 'settings' ? '设置创作方向' : '检查每个资产' }}</h3><p>{{ batchStage === 'settings' ? '风格和创作方法都可以自由选择，只影响本次生成。' : '查看并编辑提示词，确认后再生成图片。' }}</p></div><div class="creationSteps"><span :class="{ active: batchStage === 'settings' }"><b>1</b> 创作设置</span><i></i><span :class="{ active: batchStage === 'review' }"><b>2</b> 检查与生成</span></div></div>
        <div v-if="batchStage === 'settings'" class="creationScroll">
          <section class="creationSection"><div class="sectionHeading"><div><h4>画面风格</h4><p>可参考项目既有风格，也可以为这次创作单独指定。</p></div></div>
            <div class="styleChoices">
              <button type="button" :class="{ active: batchStyleMode === 'free' }" @click="batchStyleMode = 'free'"><strong>自由创作</strong><small>不套用预设，由描述和 Skill 决定</small></button>
              <button type="button" :class="{ active: batchStyleMode === 'project' }" @click="batchStyleMode = 'project'"><strong>参考项目风格</strong><small>{{ hasArtStyle ? '沿用项目已有的画面方向' : '项目未设置风格，可自由创作' }}</small></button>
              <button type="button" :class="{ active: batchStyleMode === 'custom' }" @click="batchStyleMode = 'custom'"><strong>自定义风格</strong><small>为本次创作描述想要的视觉效果</small></button>
            </div>
            <t-textarea v-if="batchStyleMode === 'custom'" v-model="batchStyleDescription" class="styleDescription" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="例如：细腻国风水墨，留白构图，柔和暖色与纸张肌理" />
          </section>
          <section class="creationSection"><div class="sectionHeading"><div><h4>创作 Skill</h4><p>按人物、场景、道具分别应用，不想使用也可以移除。</p></div><t-button size="small" variant="outline" @click="() => openSkillPicker()">选择 Skill</t-button></div>
            <div class="selectedSkillRows"><div v-for="category in skillCategoryTabs" :key="category.value"><span>{{ category.label }}</span><strong>{{ selectedSkillItems.filter(skill => skill.category === category.value).map(skill => skill.name).join('、') || '未选择' }}</strong><button type="button" @click="openSkillPicker(category.value)">调整</button></div></div>
          </section>
          <section class="creationSection"><div class="sectionHeading"><div><h4>补充要求 <em>可选</em></h4><p>告诉 AI 这批资产有什么共同要求。</p></div></div><div class="skillPromptComposer"><t-textarea v-model="otherTextPrompt" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="例如：服装符合宋代背景，角色气质自然。输入 @ 选择 Skill，输入 / 查看命令。" @change="handlePromptComposerInput" /><div v-if="promptCommandVisible" class="promptCommandMenu"><template v-if="promptTrigger === '@'"><button v-for="skill in promptSkillSuggestions" :key="skill.path" type="button" @mousedown.prevent="chooseMentionSkill(skill)"><span class="commandIcon">@</span><span><strong>{{ skill.name }}</strong><small>{{ skillCategoryLabel(skill.category) }} · {{ skill.description }}</small></span></button><div v-if="promptSkillSuggestions.length === 0" class="promptCommandEmpty">没有匹配的 Skill，输入 /自定义 创建一个</div></template><template v-else><button v-for="command in slashCommands" :key="command.id" type="button" @mousedown.prevent="runSlashCommand(command.id)"><span class="commandIcon">/</span><span><strong>{{ command.label }}</strong><small>{{ command.description }}</small></span></button></template></div></div></section>
          <details class="generationSettings"><summary><strong>模型与图片设置</strong><span>{{ selectValue || '选择图片模型' }} · {{ resolution }} · {{ batchAspectRatio }}</span></summary><div class="generationGrid"><label>图片模型<modelSelect v-model="selectValue" type="image" /></label><label>提示词模型<modelSelect v-model="textModelValue" type="text" :placeholder="$t('workbench.cornerScape.textModelPh')" /></label><label>分辨率<t-select v-model="resolution" :options="resolutionOptions" /></label><label>比例<t-select v-model="batchAspectRatio" :options="aspectRatioOptions" /></label><label>画面构成<t-select v-model="batchComposition" :options="compositionOptions" /></label><label>同时处理<t-input-number v-model="batchConcurrency" :min="1" :max="6" /></label></div></details>
        </div>
        <div v-else class="reviewWorkspace">
          <div class="reviewSidebar"><div class="reviewSidebarTitle"><strong>本次资产</strong><span>{{ selectedBatchItems.length }} 项</span></div><button v-for="item in selectedBatchItems" :key="item.id" type="button" class="reviewNavItem" :class="{ active: activeReviewId === item.id }" @click="activeReviewId = item.id"><span class="reviewNavIcon">{{ item.type === 'role' ? '人' : item.type === 'scene' ? '景' : '物' }}</span><span><strong>{{ item.name }}</strong><small>{{ reviewStatus(item) }}</small></span><i v-if="reviewDrafts[item.id] !== undefined && reviewDrafts[item.id] !== item.prompt">未保存</i></button></div>
          <div v-if="activeReviewItem" class="reviewEditor"><div class="reviewEditorHead"><div><span>{{ typeName(activeReviewItem.type) }}</span><h4>{{ activeReviewItem.name }}</h4></div><span class="reviewStatus" :class="{ pending: activeReviewItem.promptState === '生成中', failed: promptNotReady(activeReviewItem) }">{{ reviewStatus(activeReviewItem) }}</span></div><p class="assetDescription">{{ activeReviewItem.describe || '暂无资产描述' }}</p><div class="editorLabel"><strong>图片提示词</strong><span>可直接修改，保存后用于生图</span></div><t-textarea :model-value="reviewDrafts[activeReviewItem.id] ?? activeReviewItem.prompt ?? ''" :disabled="activeReviewItem.promptState === '生成中'" :autosize="{ minRows: 6, maxRows: 12 }" placeholder="填写提示词，或返回上一步生成" @change="(value) => updateReviewDraft(activeReviewItem!.id, String(value))" /><p v-if="activeReviewItem.promptState === '生成中'" class="editorHint">正在生成，可先查看其他资产。</p><p v-else-if="activeReviewItem.promptErrorReason" class="editorError">{{ activeReviewItem.promptErrorReason }}</p><div class="editorAction"><t-button v-if="reviewDrafts[activeReviewItem.id] !== undefined && reviewDrafts[activeReviewItem.id] !== activeReviewItem.prompt" size="small" theme="primary" variant="outline" :loading="savingReviewId === activeReviewItem.id" @click="saveReviewPrompt(activeReviewItem)">保存提示词</t-button></div><details class="itemOverrides"><summary>单独调整此资产的图片设置</summary><div class="overrideGrid"><label>模型<modelSelect v-model="getItemOverride(activeReviewItem.id).model" type="image" placeholder="使用批量模型" /></label><label>分辨率<t-select v-model="getItemOverride(activeReviewItem.id).resolution" :options="resolutionOptions" clearable placeholder="使用批量设置" /></label><label>比例<t-select v-model="getItemOverride(activeReviewItem.id).aspectRatio" :options="aspectRatioOptions" clearable placeholder="使用批量设置" /></label><label>构成<t-select v-model="getItemOverride(activeReviewItem.id).composition" :options="compositionOptions" clearable placeholder="使用批量设置" /></label><label class="overrideWide">风格<t-select v-model="getItemOverride(activeReviewItem.id).styleMode" :options="itemStyleOptions" clearable placeholder="使用本次风格" /></label><label v-if="getItemOverride(activeReviewItem.id).styleMode === 'custom'" class="overrideWide">自定义风格<t-textarea v-model="getItemOverride(activeReviewItem.id).styleDescription" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="描述此资产的画面风格" /></label></div><p class="editorHint">单独风格会在生成图片时应用；如需反映到提示词，返回上一步重新生成。</p></details></div>
        </div>
        <div class="creationFooter"><span>{{ batchStage === 'settings' ? `已选择 ${selectedBatchItems.length} 个资产` : `${readyBatchCount} / ${selectedBatchItems.length} 项已就绪` }}</span><div v-if="batchStage === 'settings'"><t-button variant="text" :disabled="batchPromptSubmitting" @click="showBatchReview">检查现有提示词</t-button><t-button theme="primary" :loading="batchPromptSubmitting" @click="confirmBatchPrompts">生成提示词</t-button></div><div v-else><t-button variant="text" :disabled="batchImageSubmitting" @click="batchStage = 'settings'">返回设置</t-button><t-button variant="outline" :disabled="batchReviewBlocked || batchImageSubmitting" @click="confirmBatchImages(true)">先生成试样</t-button><t-button theme="primary" :loading="batchImageSubmitting" :disabled="batchReviewBlocked" @click="confirmBatchImages(false)">生成全部</t-button></div></div>
      </div>
    </t-dialog>
    <!-- 主内容区 -->
    <div class="content">
      <div class="contentHeader">
        <div class="assetsHeading">
          <div><h2>项目资产</h2><p>选择资产开始创作，点击卡片查看或编辑设定</p></div>
          <div class="headingLinks"><button type="button" @click="() => openSkillPicker()"><t-icon name="app" /> 创作 Skill</button><button type="button" @click="router.push({ path: '/assets', query: { projectId: String(project?.id || '') } })"><t-icon name="sound" /> 声音素材</button></div>
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
          <!-- 全选放在明面上：不必再进"智能选择"下拉里找 -->
          <button type="button" class="selectAllBtn" :class="{ active: allVisibleSelected }" @click="toggleSelectAll">
            <t-icon :name="allVisibleSelected ? 'check-rectangle-filled' : 'check-rectangle'" />
            <span>{{ allVisibleSelected ? $t("workbench.cornerScape.clearSelection") : $t("workbench.cornerScape.selectAll") }}</span>
            <span class="cnt">{{ displayList.length }}</span>
          </button>
          <span class="selectionCount" v-if="selectedIds.length > 0">已选 <strong>{{ selectedIds.length }}</strong> 项</span>
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
          <div class="selectionActions"><t-button v-if="selectedIds.length > 0 && deliverableItems.length > 0" variant="outline" @click="sendSelectedToCanvas"><template #icon><t-icon name="send" /></template>送至画布 ({{ deliverableItems.length }})</t-button><t-button theme="primary" :disabled="selectedIds.length === 0" @click="openBatchStudio">{{ selectedIds.length ? `批量创作 · ${selectedIds.length}` : '选择资产开始创作' }}</t-button></div>
        </div>
      </div>
      <div class="grid">
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
            <!-- 提示词生成失败：把真实原因摆出来，而不是继续转圈 -->
            <t-popup :content="item.promptErrorReason || $t('workbench.cornerScape.promptFailedHint')" v-if="!item.state && (item.promptState === '失败' || item.promptState === '生成失败')">
              <t-empty type="fail" :title="$t('workbench.cornerScape.promptFailed')" />
            </t-popup>
            <div v-else-if="!item.state && item.promptState !== '生成中'" class="assetPlaceholder" :class="`assetPlaceholder--${item.type}`"><div class="placeholderGlyph"><t-icon :name="item.type === 'role' ? 'user' : item.type === 'scene' ? 'image' : 'component'" /></div><span>尚未生成图片</span><small>点击查看资产设定</small></div>
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
            <div v-if="candidatePendingFor(item.id)" class="candidateProgress"><t-loading size="14px" /> 候选图生成中 · 当前图保留</div>
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
          <t-image v-if="previewHistoryImage?.filePath" class="image" :src="previewHistoryImage.filePath" fit="contain">
            <template #error><t-empty type="fail" :title="$t('workbench.cornerScape.imageError')" /></template>
            <template #overlayContent><div class="imageToolsWrap show"><ImageTools :src="previewHistoryImage.filePath" position="br" /></div></template>
          </t-image>
          <t-empty v-else-if="!currentItem.state" type="maintenance" :title="$t('workbench.cornerScape.waitingGen')" />
          <div v-else-if="currentItem.state === '生成中'" class="generatingBox">
            <t-loading />
            <span class="generatingText">{{ $t("workbench.cornerScape.generating") }}</span>
          </div>
          <t-empty v-else-if="currentItem.state === '生成失败'" type="fail" :title="$t('workbench.cornerScape.genFailed')" />
          <t-image v-else-if="previewHistoryImage?.filePath || currentItem.filePath" class="image" :src="previewHistoryImage?.filePath || currentItem.filePath || ''" fit="contain">
            <template #error>
              <t-empty type="fail" :title="$t('workbench.cornerScape.imageError')" />
            </template>
            <template #overlayContent>
              <div class="imageToolsWrap show">
                <ImageTools :src="previewHistoryImage?.filePath || currentItem.filePath || ''" position="br" />
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
            <div class="historyVersionActions">
              <span>{{ previewHistoryImage ? (previewHistoryImage.id === currentItem.imageId ? '正在查看当前采用的图片' : '正在预览历史图片，尚未替换') : '选择历史图片预览，再决定是否采用' }}</span>
              <t-button v-if="previewHistoryImage && previewHistoryImage.id !== currentItem.imageId" size="small" theme="primary" :loading="adoptingHistory" @click="adoptHistoryImage">采用这张图片</t-button>
            </div>
            <t-button v-if="currentItem.filePath" size="small" variant="outline" @click="sendCurrentToCanvas">在无限画布编辑 ↗</t-button>
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
          <t-form-item v-if="currentItem.type === 'role'" label="角色声音素材">
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
              <div v-else class="assets-empty">尚未绑定声音，可选择项目中的音频素材</div>
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
      <!-- Skill 选择器：只列元数据，正文在生成时由后端按路径读取 -->
      <t-dialog
        v-model:visible="skillPickerVisible"
        header="角色场景 Skill"
        :footer="false"
        width="560px"
        placement="center">
        <div class="skillPickerBody">
          <div class="skillPickerLead">
            <p class="skillPickerDesc">只保留人物、场景、道具三类。选中的 Skill 会进入提示词模型，生成时按资产类型自动隔离。</p>
            <t-button size="small" theme="primary" @click="openCustomSkillDialog"><template #icon><t-icon name="add" /></template>自定义 Skill</t-button>
          </div>
          <div class="skillCategoryTabs">
            <button v-for="category in skillCategoryTabs" :key="category.value" type="button" :class="{ active: skillPickerCategory === category.value }" @click="skillPickerCategory = category.value">
              <span>{{ category.icon }}</span>{{ category.label }}<small>{{ skillCountByCategory(category.value) }}</small>
            </button>
          </div>
          <t-input v-model="skillKeyword" placeholder="搜索 Skill 名称或说明" clearable>
            <template #prefix-icon><t-icon name="search" /></template>
          </t-input>
          <div class="skillPickerList">
            <div v-if="skillCatalogLoading" class="skillPickerEmpty">正在读取 Skills…</div>
            <div v-else-if="filteredSkillItems.length === 0" class="skillPickerEmpty">
              {{ skillItems.length === 0 ? "还没有可用的 Skill，先去 Skills 页安装" : "没有匹配的 Skill" }}
            </div>
            <button
              v-for="skill in filteredSkillItems"
              :key="skill.path"
              type="button"
              class="skillOption"
              :class="{ selected: selectedSkillPaths.includes(skill.path) }"
              @click="toggleSkill(skill.path)">
              <span class="skillOptionMain">
                <strong>{{ skill.name }}</strong>
                <small>{{ skill.description || skill.path }}</small>
              </span>
              <span class="skillOptionTag">{{ selectedSkillPaths.includes(skill.path) ? "已选" : skill.builtIn ? "内置" : skill.installed ? "已安装" : "可用" }}</span>
            </button>
          </div>
          <div class="skillPickerFooter">
            <span>已选 {{ selectedSkillPaths.length }} / 6</span>
            <t-button size="small" theme="primary" @click="skillPickerVisible = false">完成</t-button>
          </div>
        </div>
      </t-dialog>
      <t-dialog v-model:visible="customSkillVisible" header="新建自定义 Skill" width="560px" placement="center" :confirm-btn="{ content: '保存并启用', loading: customSkillSaving }" @confirm="createCustomSkill">
        <div class="customSkillForm">
          <p>自定义 Skill 会保存到“我的创建”，并立即在当前角色场景页启用。</p>
          <label>分类</label>
          <div class="skillCategoryTabs compact">
            <button v-for="category in skillCategoryTabs" :key="category.value" type="button" :class="{ active: customSkillForm.category === category.value }" @click="customSkillForm.category = category.value"><span>{{ category.icon }}</span>{{ category.label }}</button>
          </div>
          <label>名称</label><t-input v-model="customSkillForm.name" placeholder="例如：民国女性角色定妆" maxlength="40" />
          <label>一句话说明</label><t-input v-model="customSkillForm.description" placeholder="说明它适合什么时候、解决什么画面问题" maxlength="120" />
          <label>Skill 正文</label><div class="skillImport"><label class="uploadSkillButton">上传 .md / .txt<input type="file" accept=".md,.txt,text/plain,text/markdown" @change="importSkillFile" /></label><span>上传后可检查和修改，确认后保存</span></div><t-textarea v-model="customSkillForm.body" :autosize="{ minRows: 8, maxRows: 14 }" placeholder="写清工作流程、必须遵守的规则、输出格式和负面约束。" />
        </div>
      </t-dialog>
    </div>
    </div>
    <!-- 流水线下一步：角色场景 → 分镜成片 -->
    <NextStepBar current="cornerScape" :status="pipelineStatus" :status-tone="pipelineStatusTone" next-label="下一步：分镜成片" />
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import { thumbUrl } from "@/utils/mediaUrl";
import projectStore from "@/stores/project";
import userStore from "@/stores/user";
import modelSelect from "@/components/modelSelect.vue";
import settingStore from "@/stores/setting";
import openAssetsSelector from "@/utils/assetsCheck";
import { sendToCanvas, sendProjectImageToCanvas } from "@/utils/sendToCanvas";
import { showPointsToast } from "@/utils/pointsToast";
import NextStepBar from "@/components/pipeline/NextStepBar.vue";
import StoryWorkspaceHeader from "@/components/pipeline/StoryWorkspaceHeader.vue";
import { guardCornerScape } from "@/utils/pipelineGuard";
import {takeBrowserHandoff} from "../../../../shared/browserHandoff";
import {sessionSignal} from "@/utils/session";

const { otherSetting } = storeToRefs(settingStore());
const router = useRouter();
const route = useRoute();
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
const { userId } = storeToRefs(userStore());
const selectValue = ref(project.value?.imageModel ?? "");
// 提示词生成用的文本模型：默认取项目配置，可在面板里临时切换
const textModelValue = ref(project.value?.textModel ?? "");
/** 项目是否真的配了画风：空串 = 没选，提示词会走通用兜底（后端也一样降级，不会报"视觉手册未定义"） */
const hasArtStyle = computed(() => Boolean(String(project.value?.artStyle ?? "").trim()));

/** ---------- 创作 Skill（加载进提示词 system） ---------- */
type SkillCategory = "character" | "scene" | "prop";
interface SkillItem {
  path: string;
  name: string;
  description: string;
  category: SkillCategory;
  hasFiles: boolean;
  installed: boolean;
  builtIn: boolean;
}
const skillCategoryTabs: Array<{ value: SkillCategory; label: string; icon: string }> = [
  { value: "character", label: "人物", icon: "人" },
  { value: "scene", label: "场景", icon: "景" },
  { value: "prop", label: "道具", icon: "物" },
];
const skillCategoryLabel = (category: SkillCategory) => skillCategoryTabs.find((item) => item.value === category)?.label || "人物";
function normalizeSkillCategory(raw: unknown, searchable = ""): SkillCategory | null {
  const value = String(raw || "").toLowerCase();
  if (["character", "role", "person"].includes(value)) return "character";
  if (["scene", "environment", "location"].includes(value)) return "scene";
  if (["prop", "object", "tool", "product"].includes(value)) return "prop";
  if (/(人物|角色|捏脸|人像|肖像|character|portrait|face)/i.test(searchable)) return "character";
  if (/(场景|空间|环境|地点|布景|scene|environment|location)/i.test(searchable)) return "scene";
  if (/(道具|物件|物品|产品|器物|prop|object|product)/i.test(searchable)) return "prop";
  return null;
}
const skillItems = ref<SkillItem[]>([]);
const skillCatalogLoading = ref(false);
const selectedSkillPaths = ref<string[]>([]);
const skillPickerVisible = ref(false);
const skillKeyword = ref("");
const skillPickerCategory = ref<SkillCategory>("character");
const SKILL_LIMIT = 6;
const skillsStorageKey = computed(() => `xoi_cornerscape_skills_v2:${userId.value || "anonymous"}:${project.value?.id || route.query.projectId || "unknown"}`);
const selectedSkillItems = computed(() =>
  selectedSkillPaths.value.map((path) => skillItems.value.find((item) => item.path === path)).filter((item): item is SkillItem => Boolean(item)),
);
const selectedSkillPayload = computed(() => selectedSkillItems.value.map((skill) => ({ path: skill.path, category: skill.category })));
const filteredSkillItems = computed(() => {
  const keyword = skillKeyword.value.trim().toLowerCase();
  const list = skillItems.value.filter((item) => item.category === skillPickerCategory.value && (!keyword || `${item.name} ${item.description} ${item.path}`.toLowerCase().includes(keyword)));
  return [...list].sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || Number(b.installed) - Number(a.installed) || a.name.localeCompare(b.name));
});
const skillCountByCategory = (category: SkillCategory) => skillItems.value.filter((item) => item.category === category).length;

function persistSkills() {
  try {
    localStorage.setItem(skillsStorageKey.value, JSON.stringify(selectedSkillPaths.value));
  } catch { /* 存储被禁也不影响本次生成 */ }
}

async function loadSkillCatalog() {
  skillCatalogLoading.value = true;
  try {
    const { data } = await axios.get("/skills/catalog");
    const installed = new Set<string>((data?.installedIds ?? []).map((id: string) => String(id)));
    const files = Array.isArray(data?.items) ? data.items : [];
    skillItems.value = files.flatMap((item: any) => {
      const path = String(item.path || "");
      const name = String(item.name || item.path || "");
      const description = String(item.description || "");
      const category = normalizeSkillCategory(item.category, `${path} ${name} ${description}`);
      if (!category) return [];
      const builtIn = ["super-original-face.md", "cinematic-scene-blueprint.md", "hero-prop-design.md", "character-continuity.md", "scene-continuity.md", "prop-continuity.md"].some((file) => path.endsWith(file));
      return [{ path, name, description, category, hasFiles: Boolean(item.hasFiles), builtIn, installed: builtIn || [...installed].some((id) => path.includes(id)) }];
    });
    // 只保留仍然存在的选择
    const savedRaw = localStorage.getItem(skillsStorageKey.value);
    const saved = JSON.parse(savedRaw || "[]");
    const valid = new Set(skillItems.value.map((item) => item.path));
    const keep = (Array.isArray(saved) ? saved : []).filter((path: unknown) => typeof path === "string" && valid.has(path));
    const defaults = skillItems.value.filter((item) => ["super-original-face.md", "cinematic-scene-blueprint.md", "hero-prop-design.md"].some(file => item.path.endsWith(file))).map((item) => item.path);
    selectedSkillPaths.value = (savedRaw === null ? defaults : keep).slice(0, SKILL_LIMIT);
    if (savedRaw === null) persistSkills();
  } catch (e) {
    console.warn("加载 Skill 目录失败:", e);
    skillItems.value = [];
  } finally {
    skillCatalogLoading.value = false;
  }
}

function toggleSkill(path: string): boolean {
  const picked = selectedSkillPaths.value.includes(path);
  if (!picked && selectedSkillPaths.value.length >= SKILL_LIMIT) {
    window.$message.warning(`最多加载 ${SKILL_LIMIT} 个 Skill，先移除一个再选`);
    return false;
  }
  selectedSkillPaths.value = picked ? selectedSkillPaths.value.filter((item) => item !== path) : [...selectedSkillPaths.value, path];
  persistSkills();
  return true;
}

function clearSkills() {
  selectedSkillPaths.value = [];
  persistSkills();
}

function openSkillPicker(category?: SkillCategory) {
  if (category) skillPickerCategory.value = category;
  skillPickerVisible.value = true;
  if (skillItems.value.length === 0 && !skillCatalogLoading.value) void loadSkillCatalog();
}

const promptTrigger = ref<"@" | "/" | null>(null);
const promptTriggerQuery = ref("");
const promptCommandVisible = computed(() => promptTrigger.value !== null);
const recommendedSkillCategory = computed<SkillCategory | null>(() => {
  if (["role", "scene", "tool"].includes(activeFilter.value)) return activeFilter.value === "role" ? "character" : activeFilter.value === "scene" ? "scene" : "prop";
  const pickedTypes = new Set(dataList.value.filter((item) => selectedIds.value.includes(item.id)).map((item) => item.type));
  return pickedTypes.size === 1 ? (pickedTypes.has("role") ? "character" : pickedTypes.has("scene") ? "scene" : "prop") : null;
});
const promptSkillSuggestions = computed(() => {
  const query = promptTriggerQuery.value.toLowerCase();
  return skillItems.value
    .filter((item) => (!recommendedSkillCategory.value || item.category === recommendedSkillCategory.value) && (!query || `${item.name} ${item.description}`.toLowerCase().includes(query)))
    .sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name))
    .slice(0, 6);
});
const slashCommands = computed(() => [
  { id: "character", label: "人物 Skill", description: "打开人物设计、捏脸和角色一致性技能" },
  { id: "scene", label: "场景 Skill", description: "打开空间、布景、光线和环境设计技能" },
  { id: "prop", label: "道具 Skill", description: "打开关键道具、产品和物件设计技能" },
  { id: "custom", label: "自定义 Skill", description: "创建自己的工作流并立即启用" },
  { id: "clear", label: "清空已选 Skill", description: "本次只按项目与附加要求生成" },
].filter((item) => !promptTriggerQuery.value || `${item.label} ${item.description}`.includes(promptTriggerQuery.value)));

function handlePromptComposerInput(value: unknown) {
  const text = typeof value === "string"
    ? value
    : value instanceof Event && value.target instanceof HTMLTextAreaElement
      ? value.target.value
      : otherTextPrompt.value;
  const match = text.match(/(?:^|\s)([@/])([^\s@/]*)$/);
  promptTrigger.value = match ? match[1] as "@" | "/" : null;
  promptTriggerQuery.value = match?.[2] || "";
}
function removePromptTrigger() {
  otherTextPrompt.value = otherTextPrompt.value.replace(/(?:^|\s)[@/][^\s@/]*$/, (value) => value.startsWith(" ") ? " " : "");
  promptTrigger.value = null;
  promptTriggerQuery.value = "";
}
function chooseMentionSkill(skill: SkillItem) {
  if (!selectedSkillPaths.value.includes(skill.path) && !toggleSkill(skill.path)) return;
  otherTextPrompt.value = otherTextPrompt.value.replace(/(?:^|\s)@[^\s@/]*$/, (value) => `${value.startsWith(" ") ? " " : ""}@${skill.name} `);
  promptTrigger.value = null;
  promptTriggerQuery.value = "";
}
function runSlashCommand(command: string) {
  removePromptTrigger();
  if (command === "clear") return clearSkills();
  if (command === "custom") return openCustomSkillDialog();
  openSkillPicker(command as SkillCategory);
}

const customSkillVisible = ref(false);
const customSkillSaving = ref(false);
const customSkillForm = ref<{ category: SkillCategory; name: string; description: string; body: string }>({ category: "character", name: "", description: "", body: "" });
function openCustomSkillDialog() {
  skillPickerVisible.value = false;
  customSkillForm.value = { category: skillPickerCategory.value, name: "", description: "", body: "" };
  customSkillVisible.value = true;
}
async function importSkillFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 256 * 1024) throw new Error("请选择不超过 256 KB 的 .md 或 .txt 文件");
    const content = await file.text();
    if (!content.trim() || content.includes("\0")) throw new Error("文件为空或不是有效文本");
    const frontmatter = content.match(/^\uFEFF?---\s*\n([\s\S]*?)\n---\s*\n/);
    const metadata = frontmatter?.[1] || "";
    const field = (name: string) => metadata.match(new RegExp(`^${name}:\\s*[\"']?(.+?)[\"']?\\s*$`, "m"))?.[1]?.trim() || "";
    customSkillForm.value.name = (field("name") || file.name.replace(/\.(md|txt)$/i, "")).slice(0, 40);
    customSkillForm.value.description = field("description").slice(0, 120);
    customSkillForm.value.body = (frontmatter ? content.slice(frontmatter[0].length) : content).trim();
    const category = normalizeSkillCategory(field("category"));
    if (category) customSkillForm.value.category = category;
    window.$message.success("文件已读取，请检查分类、说明与正文后保存");
  } catch (e: any) { window.$message.error(e?.message || "读取文件失败"); }
  finally { input.value = ""; }
}
async function createCustomSkill() {
  const form = customSkillForm.value;
  if (!form.name.trim() || !form.description.trim() || !form.body.trim()) return window.$message.warning("请完整填写名称、说明和 Skill 正文");
  customSkillSaving.value = true;
  try {
    const created = await axios.post<{ id: string }>("/skills", { name: form.name.trim(), description: form.description.trim(), body: form.body, agentScope: "promptwriter", categoryId: form.category, visible: true });
    const id = created.data?.id;
    if (!id) throw new Error("Skill 保存结果无效");
    const installed = await axios.post<{ path: string }>(`/skills/${id}/install`);
    const path = installed.data?.path;
    if (!path) throw new Error("Skill 安装结果无效");
    await loadSkillCatalog();
    if (!selectedSkillPaths.value.includes(path)) toggleSkill(path);
    skillPickerCategory.value = form.category;
    customSkillVisible.value = false;
    window.$message.success(`已创建并启用「${form.name.trim()}」`);
  } catch (e: any) {
    window.$message.error(e?.message || "创建 Skill 失败");
  } finally {
    customSkillSaving.value = false;
  }
}

const resolution = ref("1K");
const batchAspectRatio = ref("16:9");
const batchComposition = ref("prompt");
const batchConcurrency = ref(Math.min(6, Math.max(1, Number(otherSetting.value.assetsBatchGenereateSize) || 1)));
const aspectRatioOptions = ["16:9", "9:16", "1:1", "4:3", "3:4"].map(value => ({label:value,value}));
const compositionOptions = [{label:"按提示词自由构图",value:"prompt"},{label:"单张画面",value:"single"},{label:"四视图",value:"four-view"},{label:"按资产类型默认",value:"default"}];
const itemOverrides = reactive<Record<number, {model:string;resolution:string;aspectRatio:string;composition:string}>>({});
function getItemOverride(id: number) { return itemOverrides[id] ||= { model:"", resolution:"", aspectRatio:"", composition:"" }; }
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
  void loadSkillCatalog();
  await getFilteredData();
  try {
    const saved = JSON.parse(localStorage.getItem(candidateStorageKey()) || "[]");
    if (Array.isArray(saved)) startCandidatePolling(saved.filter((item: any) => Number.isSafeInteger(item?.assetsId) && Number.isSafeInteger(item?.imageId) && dataList.value.some(row => row.id === item.assetsId)));
  } catch { /* 存储不可用时仍可在资产历史中查看结果 */ }
  const canvasTarget = Number(route.query.canvasTarget);
  if (Number.isSafeInteger(canvasTarget) && canvasTarget > 0) {
    const target = dataList.value.find(item => item.id === canvasTarget);
    if (target) { await openDrawer(target); window.$message.success('画布图片已保存到历史，选择后可预览并采用。'); }
    const { canvasTarget: _canvasTarget, ...query } = route.query;
    await router.replace({ query });
  }
  // P2 前置校验：一个资产都没有 = 还没在「剧本整理」页提取过，明确引导（别让用户对着空列表猜）
  guardCornerScape(router, dataList.value.length > 0);
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
  if (candidatePollingTimer) clearInterval(candidatePollingTimer);
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
const batchStudioVisible = ref(false);
const batchPromptSubmitting = ref(false);
const batchImageSubmitting = ref(false);
const batchStage = ref<"settings" | "review">("settings");
const selectedBatchItems = computed(() => dataList.value.filter(item => selectedIds.value.includes(item.id)));
const reviewDrafts = reactive<Record<number, string>>({});
const savingReviewId = ref<number | null>(null);
const batchReviewBlocked = computed(() => !selectedBatchItems.value.length || selectedBatchItems.value.some(item => item.promptState === "生成中" || promptNotReady(item) || (reviewDrafts[item.id] !== undefined && reviewDrafts[item.id] !== item.prompt)));
function openBatchStudio() {
  if (!selectedIds.value.length) return window.$message.warning("请先选择资产");
  batchStage.value = "settings";
  Object.keys(reviewDrafts).forEach(key => delete reviewDrafts[Number(key)]);
  batchStudioVisible.value = true;
}
function updateReviewDraft(id: number, value: string) { reviewDrafts[id] = value; }
async function saveReviewPrompt(item: DataItem) {
  savingReviewId.value = item.id;
  try {
    const prompt = reviewDrafts[item.id] ?? item.prompt;
    await axios.post("/assets/saveAssets", { id: item.id, type: item.type, projectId: project.value?.id, prompt });
    item.prompt = prompt;
    item.promptState = "";
    delete reviewDrafts[item.id];
    window.$message.success("提示词已保存");
  } catch (e: any) { window.$message.error(e?.message || "保存失败"); }
  finally { savingReviewId.value = null; }
}
function confirmBatchPrompts() {
  if (batchPromptSubmitting.value) return;
  const existing = selectedBatchItems.value.filter(item => item.prompt?.trim()).length;
  const submit = () => { Object.keys(reviewDrafts).forEach(key => delete reviewDrafts[Number(key)]); void batchGenerationPrompt(); batchStage.value = "review"; };
  if (!existing) return submit();
  const dialog = DialogPlugin.confirm({ header: "重新生成提示词？", body: `${existing} 个选中资产已有提示词，生成后会更新这些提示词。请确认后继续。`, confirmBtn: "确认生成", cancelBtn: "取消", theme: "warning", onConfirm: () => { dialog.destroy(); submit(); } });
}
function confirmBatchImages(sample = false) {
  if (batchImageSubmitting.value) return;
  if (batchReviewBlocked.value) return window.$message.warning("请先完成并保存所有提示词");
  const targets = sample ? selectedBatchItems.value.filter((item, index, all) => all.findIndex(other => other.type === item.type) === index) : selectedBatchItems.value;
  const dialog = DialogPlugin.confirm({ header: sample ? "确认生成试样" : "确认提交图片生成", body: `将为 ${targets.length} 个资产生成图片（${targets.map(item => item.name).join('、')}）。生成会消耗积分，新图将作为候选保留。`, confirmBtn: "确认生成", cancelBtn: "返回检查", onConfirm: () => { dialog.destroy(); void batchGenerationImage(targets); } });
}

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
  if (item.promptState === "失败" || item.promptState === "生成失败") return { label: $t("workbench.cornerScape.promptFailed"), cls: "failed", loading: false };
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

/** 当前筛选范围内是否已全选（全选按钮的勾选态） */
const allVisibleSelected = computed(() => displayList.value.length > 0 && displayList.value.every((item) => selectedIds.value.includes(item.id)));

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

/** ---------- 流水线（角色场景 → 分镜成片） ---------- */
const cornerReadyCount = computed(() => dataList.value.filter((item) => !!item.filePath).length);

const pipelineStatus = computed(() => {
  if (dataList.value.length === 0) return "还没有角色/场景资产，回剧本整理页提取";
  return `${dataList.value.length} 个资产 · 已出图 ${cornerReadyCount.value} 个`;
});

const pipelineStatusTone = computed<"ok" | "warn" | "idle">(() =>
  dataList.value.length > 0 && cornerReadyCount.value > 0 ? "ok" : "warn",
);

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
    const result = takeBrowserHandoff<{images: Array<{id?:number;src?:string}>;timestamp:number}>(sessionStorage,sessionSignal(),'canvas-result');
    if (!result) return;
    // 检查是否是最近 5 分钟内的结果
    if (Date.now() - result.timestamp > 5 * 60 * 1000) {
      return;
    }
    // 清除结果（避免重复处理）
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
          filePath, projectId: Number(project.value?.id), candidateOnly: true,
        });
        // 更新本地数据
        const item = dataList.value.find(i => i.id === img.id);
        if (item && data.imageId) {
          // 添加到历史图片
          if (!item.historyImages) item.historyImages = [];
          item.historyImages.unshift({ id: data.imageId, filePath: data.filePath || filePath });
        }
      } catch (e) {
        console.error('保存画布结果失败:', e);
        throw e;
      }
    }
    window.$message?.success('画布结果已保存为历史候选，打开资产后可预览并采用');
  } catch (e) {
    console.error('检查画布保存结果失败:', e);
    window.$message?.error('部分画布结果未确认保存，请核对素材；未保存的原图保留');
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
      dialog.destroy(); // TDesign 插件式弹窗需手动收起
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
const adoptingHistory = ref(false);
const previewHistoryImage = computed(() => currentItem.value?.historyImages?.find((img) => img.id === selectedHistoryId.value));
async function sendCurrentToCanvas() {
  const item = currentItem.value;
  if (!item?.filePath || !project.value?.id) return;
  try { await sendProjectImageToCanvas({ kind: 'asset', projectId: Number(project.value.id), targetId: item.id }, [{ src: item.filePath, name: item.name, id: item.id }]); }
  catch (e: any) { window.$message.error(e?.message || '发送到画布失败'); }
}

function toggleHistorySelect(id: number) {
  selectedHistoryId.value = selectedHistoryId.value === id ? null : id;
}
async function adoptHistoryImage() {
  if (!currentItem.value || !previewHistoryImage.value || adoptingHistory.value) return;
  const selectedImage = previewHistoryImage.value;
  const item = currentItem.value;
  adoptingHistory.value = true;
  try {
    await axios.post("/assets/saveAssets", {
      id: item.id,
      type: item.type,
      projectId: project.value?.id,
      prompt: item.prompt,
      imageId: selectedImage.id,
      expectedImageId: item.imageId ?? null,
    });
    if (currentItem.value?.id === item.id) {
      currentItem.value.filePath = selectedImage.filePath;
      currentItem.value.imageId = selectedImage.id;
      currentItem.value.state = "已完成";
    }
    await getFilteredData();
    window.$message.success($t("workbench.cornerScape.msg.replaceSuccess"));
  } catch (e: any) { window.$message.error(e?.message || $t("workbench.cornerScape.msg.replaceFailed")); }
  finally { adoptingHistory.value = false; }
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
  if (promptNotReady({ prompt: editForm.prompt, promptState: currentItem.value.promptState })) {
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
      // 与批量生成共用同一批已加载 Skill
      skills: selectedSkillPayload.value,
    });
    window.$message.success($t("workbench.cornerScape.msg.promptGenSuccess"));
    if (Array.isArray(data?.warnings) && data.warnings.length) window.$message.warning(data.warnings[0], 6000);
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
/** 提示词是否可直接用于出图：空、失败态、或模型拒答句子都算没准备好。 */
function promptNotReady(item: { prompt?: string | null; promptState?: string | null }) {
  const text = String(item.prompt ?? "").trim();
  if (!text) return true;
  if (item.promptState === "失败" || item.promptState === "生成失败") return true;
  return /(无法生成|无法提供|无法按|抱歉|违反.{0,12}(规则|约束|规范)|不符合.{0,12}(风格|规则))/i.test(text.slice(0, 120));
}
//批量生成提示词
async function batchGenerationPrompt() {
  if (batchPromptSubmitting.value) return;
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastOne"));
    return;
  }

  const items = dataList.value.filter((item) => selectedIds.value.includes(item.id));

  batchPromptSubmitting.value = true;
  try {
    const { data } = await axios.post("/assetsGenerate/batchPolishAssetsPrompt", {
      projectId: project.value?.id,
      items: items.map((item) => ({
        assetsId: item.id,
        type: item.type ?? "props",
        name: item.name,
        describe: item.describe,
      })),
      concurrentCount: batchConcurrency.value,
      otherTextPrompt: otherTextPrompt.value,
      textModel: textModelValue.value || undefined,
      // 加载的 Skill 正文由后端读取并注入 system
      skills: selectedSkillPayload.value,
    });
    items.forEach((item) => { item.promptState = "生成中"; });
    // 画风缺失等可降级问题：后端不阻断生成，只回 warning，这里如实提示一次
    const warnings: string[] = Array.isArray(data?.warnings) ? data.warnings : [];
    if (warnings.length) window.$message.warning(warnings[0], 6000);
    else window.$message.success(`已提交 ${items.length} 个资产的提示词生成`);
  } catch (e: any) {
    window.$message.error(e?.message ?? $t("workbench.cornerScape.msg.promptGenFail"));
    // 生成失败时重置 promptState
    items.forEach((item) => {
      const target = dataList.value.find((row) => row.id === item.id);
      if (target) target.promptState = "";
    });
  } finally { batchPromptSubmitting.value = false; }
}
//绑定音频
async function batchSelectBindAudio() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastBindOne"));
    return;
  }

  const items = dataList.value.filter((item) => selectedIds.value.includes(item.id));

  try {
    const { data } = await axios.post("/cornerScape/batchBindAudio", {
      projectId: project.value?.id,
      assetsIds: items.map((item) => item.id),
      concurrentCount: batchConcurrency.value,
    });
    const queued = Array.isArray(data?.queuedIds) ? data.queuedIds : [];
    items.forEach(item => { if (queued.includes(item.id)) item.audioBindState = "生成中"; });
    window.$message.success(`已提交 ${queued.length} 个未绑定人物，跳过 ${items.length - queued.length} 个已绑定或非人物资产`);
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
async function batchGenerationImage(targetItems?: DataItem[]) {
  if (batchImageSubmitting.value) return;
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

  const items = targetItems || dataList.value.filter((item) => selectedIds.value.includes(item.id));
  //检查如果勾选的数据prompt有空的，提示用户勾选的哪一个提示词未生成，然后终止批量生成
  const emptyPrompts = items.filter((item) => promptNotReady(item));
  if (emptyPrompts.length > 0) {
    const emptyPromptNames = emptyPrompts.map((item) => item.name).join(", ");
    window.$message.warning(
      $t("workbench.cornerScape.msg.emptyPrompt", {
        emptyPromptNames,
      }),
    );
    return;
  }

  batchImageSubmitting.value = true;
  try {
    const { data } = await axios.post("/assetsGenerate/batchGenerateImageAssets", {
      projectId: project.value?.id,
      model: selectValue.value,
      resolution: resolution.value,
      aspectRatio: batchAspectRatio.value,
      composition: batchComposition.value,
      candidateOnly: true,
      concurrentCount: batchConcurrency.value,
      items: items.map((item) => ({
        id: item.id,
        type: item.type ?? "props",
        name: item.name ?? $t("workbench.cornerScape.unnamed"),
        prompt: item.prompt,
        ...Object.fromEntries(Object.entries(getItemOverride(item.id)).filter(([, value]) => !!value)),
      })),
    });
    const images = Array.isArray(data?.images) ? data.images : [];
    if (images.length) startCandidatePolling(images);
    batchStudioVisible.value = false;
    window.$message.success(`已提交 ${items.length} 个资产，新图片生成后可在资产详情中预览并采用`);
  } catch (e: any) {
    if (e.name === "CanceledError" || e.code === "ERR_CANCELED") return;
    window.$message.error(e.message ?? $t("workbench.cornerScape.msg.batchFailed"));
  } finally { batchImageSubmitting.value = false; }
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
let candidatePollingTimer: ReturnType<typeof setInterval> | null = null;
const pendingCandidates = reactive(new Map<number, number>());
const candidateStorageKey = () => `xoi_asset_candidates_v1:${userId.value || "anonymous"}:${project.value?.id || route.query.projectId || "unknown"}`;
function persistCandidates() { try { localStorage.setItem(candidateStorageKey(), JSON.stringify([...pendingCandidates].map(([imageId, assetsId]) => ({ imageId, assetsId })))); } catch { /* 非必需缓存 */ } }
function candidatePendingFor(id: number) { return [...pendingCandidates.values()].includes(id); }
function startCandidatePolling(images: Array<{assetsId: number; imageId: number}>) {
  images.forEach(({ assetsId, imageId }) => pendingCandidates.set(Number(imageId), Number(assetsId)));
  if (!pendingCandidates.size) return;
  persistCandidates();
  if (candidatePollingTimer) return;
  candidatePollingTimer = setInterval(async () => {
    const assets = [...new Set(pendingCandidates.values())];
    for (const assetsId of assets) {
      try {
        const { data } = await axios.post("/assets/getImage", { assetsId });
        for (const image of data?.tempAssets || []) {
          if (!pendingCandidates.has(Number(image.id))) continue;
          if (["已完成", "生成失败", "失败"].includes(image.state)) {
            pendingCandidates.delete(Number(image.id));
            persistCandidates();
            if (image.state !== "已完成") window.$message.error(`资产 ${dataList.value.find(row => row.id === assetsId)?.name || assetsId} 的图片生成失败`);
          }
        }
      } catch (e) { console.error("检查候选图片失败", e); }
    }
    if (!pendingCandidates.size && candidatePollingTimer) {
      clearInterval(candidatePollingTimer); candidatePollingTimer = null;
      await getFilteredData();
      window.$message.success("本批图片处理完成，可在资产详情中查看候选版本");
    }
  }, 4000);
}

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

  /* ---------- 主操作按钮：暖橙实心 ---------- */
  :deep(.t-button--theme-primary.t-button--variant-base) {
    background: linear-gradient(135deg, #f2803f, #e0641f) !important;
    border: none !important;
    color: #fff !important;
    border-radius: 10px !important;
    font-weight: 600;
    box-shadow: 0 6px 14px rgba(224, 100, 31, 0.18);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    &:not(.t-is-disabled):hover {
      box-shadow: 0 8px 18px rgba(224, 100, 31, 0.26);
      background: linear-gradient(135deg, #f88746, #e96a26) !important;
    }
    &.t-is-disabled {
      background: #efe9e3 !important;
      color: #b3a79c !important;
      box-shadow: none;
    }
  }
  /* ---------- 次级按钮：暖橙描边 ---------- */
  :deep(.t-button--theme-primary.t-button--variant-outline) {
    border-color: #f0c4a8 !important;
    color: #d06a33 !important;
    background: #fff6ef !important;
    border-radius: 10px !important;
    font-weight: 550;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    &:not(.t-is-disabled):hover {
      border-color: #e8a377 !important;
      background: #ffefe3 !important;
    }
  }

  /* ---------- 左侧：批量生成面板 ---------- */
  .left {
    width: clamp(250px, 21vw, 310px);
    height: 100%;
    min-height: 0;
    flex-shrink: 0;
    /* 外边距会叠加 height:100% 把卡片底边推出可视区（按钮被裁掉），间距交给父容器 gap */
    margin: 0;
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
      :deep(.t-card__header-wrapper) {
        /* TDesign 默认 flex:1，会把卡片高度分走一半，必须按住 */
        flex: 0 0 auto;
        min-height: 0;
      }
      :deep(.t-card__body) {
        flex: 1 1 auto;
        min-height: 0;
        display: block;
        /* body 是唯一滚动区：内容超高出现滚动条，可一直往下滚 */
        overflow-y: auto;
        overflow-x: hidden;
        padding: 14px 18px;
      }
      :deep(.t-card__footer-wrapper) {
        /* TDesign 默认 flex:1，必须按住，否则会抢卡片高度把 body 挤扁 */
        flex: 0 0 auto;
        min-height: 0;
      }
      :deep(.t-card__footer) {
        padding: 0;
        display: block;
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
      color: #8d8177;
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
      background: #fff3ea;
      color: #c25c22;
      border: 1px solid #f7dcc6;
      margin-bottom: 12px;
      transition: all 0.25s;
      &.scoped {
        background: #ffe9d8;
        font-weight: 550;
      }
    }
    .paramForm {
      /* 不再自己开滚动，交给 .t-card__body 统一滚，避免双重滚动条 */
      flex: 0 0 auto;
      min-height: 0;
      overflow: visible;
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
    /* ---------- 创作 Skill ---------- */
    .skillField {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
      .skillFieldTop {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .skillHint {
        font-size: 12px;
        color: #a3968b;
      }
      .skillClear {
        margin-left: auto;
        border: none;
        background: none;
        padding: 0;
        font-size: 12px;
        color: #c26a37;
        cursor: pointer;
        &:hover {
          text-decoration: underline;
        }
      }
      .skillChips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
    }
    /* 画风缺失提示：可降级，不是错误 */
    .styleWarn {
      display: flex;
      gap: 6px;
      align-items: flex-start;
      padding: 8px 10px;
      margin: -2px 0 2px;
      border-radius: 10px;
      background: #fff7e8;
      border: 1px solid #f5dfb8;
      color: #9a6b28;
      font-size: 12px;
      line-height: 1.55;
      :deep(.t-icon) {
        margin-top: 1px;
        flex-shrink: 0;
      }
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
        border-color: #eba575;
        box-shadow: 0 0 0 3px rgba(240, 138, 90, 0.1);
      }
    }
    .panelActions {
      /* 位于卡片 footer，天然固定在卡片底部，body 滚动时它不动 */
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--td-bg-color-container, #fff);
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      padding: 12px 18px;
      margin: 0;
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
          border: 1px solid #ecdfd4;
          background: #fff;
          border-radius: 999px;
          padding: 5px 14px;
          font-size: 13px;
          cursor: pointer;
          color: #5c534b;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          .count {
            font-size: 12px;
            line-height: 18px;
            padding: 0 7px;
            border-radius: 999px;
            background: #f4ece4;
            color: #8d8177;
          }
          &:hover {
            border-color: #e8b795;
            color: #c25c22;
          }
          &.active {
            background: linear-gradient(135deg, #ff8847, #f26432);
            border-color: transparent;
            color: #fff;
            box-shadow: 0 3px 10px rgba(239, 100, 48, 0.22);
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

        /* 全选：一眼可见的常驻按钮，不再藏进"智能选择"下拉 */
        .selectAllBtn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 32px;
          padding: 0 12px;
          border: 1px solid #e3ddd3;
          border-radius: 999px;
          background: #fff;
          color: #5d564d;
          font: inherit;
          font-size: 13px;
          cursor: pointer;
          transition: color .16s ease, border-color .16s ease, background .16s ease;

          .cnt {
            min-width: 18px;
            padding: 0 5px;
            border-radius: 999px;
            background: #f2ede6;
            color: #8a8076;
            font-size: 11px;
            line-height: 18px;
            text-align: center;
          }

          &:hover { border-color: #e0c3ad; color: #b4551f; }
          &.active { border-color: #f0c7a8; background: #fff5ec; color: #b4551f; }
          &.active .cnt { background: #fbe3d1; color: #a8541f; }
        }
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
        border-color: #ef9f70 !important;
        background: #fffaf5 !important;
        box-shadow: 0 0 0 2px rgba(240, 130, 70, 0.16), 0 8px 22px #302b2812 !important;
      }
      &:hover {
        box-shadow: 0 10px 26px #302b2814 !important;
        border-color: #e6c3ab !important;
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
        background: #faf7f3;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-bottom: 1px solid #f4ece4;
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
            color: #c9804e;
            .dot {
              background: #c9804e;
            }
          }
          &.generating {
            color: #d4601f;
            border-color: rgba(240, 138, 90, 0.45);
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
          background: linear-gradient(135deg, #fff6ef, #ffefe3);
          .generatingText {
            font-size: 13px;
            color: #d4601f;
            letter-spacing: 0.05em;
            font-weight: 550;
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
          color: #8d8177;
          line-height: 1.55;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          -webkit-box-orient: vertical;
          &.empty {
            color: #bfb3a8;
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
              color: #c9804e;
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
    background: linear-gradient(135deg, #f2803f, #e0641f) !important;
    border: none !important;
    color: #fff !important;
    border-radius: 10px !important;
    font-weight: 600;
    box-shadow: 0 6px 14px rgba(224, 100, 31, 0.18);
    &:hover {
      box-shadow: 0 8px 18px rgba(224, 100, 31, 0.26);
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
      color: #d4601f;
      font-weight: 550;
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
        color: #c9804e;
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #c9804e;
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
    border-color: rgba(240, 138, 90, 0.4);
  }
  &.selected {
    border-color: #ef9f70;
    box-shadow: 0 0 0 2px rgba(240, 130, 70, 0.16);
  }
}
.historyVersionActions { display:flex; width:100%; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; color:#93877e; font-size:11px; }

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
/* 全局覆盖：本页根节点不scoped的部分（分页器、按钮统一暖橙） */
.cornerScape {
  .paginationBar { display:flex; justify-content:center; flex:none; padding:0 4px 12px; }
  .paginationBar .t-pagination { background:#fff; border:1px solid #eee7e2; border-radius:12px; padding:5px 8px; }
}
</style>

<style lang="scss" scoped>
.cornerScape { box-sizing:border-box; padding:20px 24px 16px; display:flex; flex-direction:column; align-items:stretch; overflow:hidden; background:var(--xoi-workspace-bg,#faf8f6) !important; }
.cornerScape :deep(.storyWorkspaceHeader) { margin-bottom:14px; flex:none; }
.cornerWorkspaceBody { position:relative; display:flex; flex:1; min-height:0; gap:16px; }
.cornerScape .left { height:100%; min-height:0; margin:0; width:clamp(250px,21vw,310px); }
.cornerScape .content { margin:0; }
.cornerScape .left .card { border-color:var(--xoi-workspace-border,#eee7e2) !important; border-radius:14px !important; background:#fff !important; box-shadow:none !important; }
/* 内容头：宽屏时筛选 chips 与批量操作同一行，窄屏自动换行 */
.cornerScape .contentHeader { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:10px 14px !important; border:1px solid var(--xoi-workspace-border,#eee7e2) !important; border-radius:14px !important; background:#fff !important; box-shadow:none !important; }
.cornerScape .contentHeader .filterChips { margin-top:0; }
.cornerScape .contentHeader .selectionBar { margin-top:0; padding:0; border-radius:0; border:0; background:transparent; }
.cornerScape .grid .card { border-color:var(--xoi-workspace-border,#eee7e2) !important; border-radius:14px !important; background:#fff !important; box-shadow:0 3px 12px #302b2806 !important; }
.cornerScape .grid .card.selected { border-color:#ef9f70 !important; }
@media(max-width:1050px) { .cornerScape { overflow:auto; } .cornerWorkspaceBody { flex:none; flex-direction:column; } .cornerScape .left { width:100%; height:auto; } .cornerScape .left .card { height:auto; } .cornerScape .content { height:auto; overflow:visible; } .cornerScape .grid { overflow:visible; } }
@media(max-width:700px) { .cornerScape { padding:14px; } .cornerScape .grid { grid-template-columns:minmax(0,1fr); } }
</style>

<style scoped>
/* 提示浮层在左下角绝对定位，给面板底部预留高度（--pipeline-hint-space，默认 104px）。
   结构：左栏不滚 → 卡片 flex 吃掉「高度 - 预留」→ 卡片 body 唯一滚动
   → 底部 .panelActions 用 sticky 钉住，三个按钮永远可见。 */
.cornerScape .left {
  box-sizing:border-box;
  /* 给左下角流程提示浮层留位：浮层绝对定位，会盖住面板底边 */
  padding-bottom:var(--pipeline-hint-space,104px);
  /* 关键：左栏自身不能做滚动容器，否则卡片（连同底部操作按钮）会被一起推出可视区 */
  overflow:hidden;
  display:flex;
  flex-direction:column;
  min-height:0;
  /* 兜底：即使上游高度链异常，面板也不会超过可视区（topMenu 56 + 上下 padding 40） */
  max-height:calc(100dvh - 96px);
}
/* 卡片撑满「左栏高度 - 浮层预留」；底部按钮由 body 内 sticky 保证可见 */
.cornerScape .left > .card {
  flex:1 1 auto;
  height:auto;
  max-height:100%;
  min-height:0;
}
/* Card's loading wrapper sits BETWEEN flex card and body. It must shrink too. */
.cornerScape .left > .card :deep(> .t-loading__parent) {
  display:flex;
  flex:1 1 0;
  min-height:0;
  overflow:hidden;
}
.cornerScape .left > .card :deep(.t-card__body) {
  flex:1 1 0;
  min-height:0;
  overflow:auto;
}
.cornerScape .left > .card :deep(> .t-card__footer) {
  flex:0 0 auto;
  background:#fff;
  z-index:1;
}
.cornerScape .left .paramForm {
  /* 与卡片 body 统一滚动，避免双重滚动条 */
  flex:0 0 auto;
  min-height:0;
  overflow:visible;
}
.cornerScape .left::-webkit-scrollbar { width:8px; }
.cornerScape .left::-webkit-scrollbar-thumb { background:#ddd6cf; border-radius:8px; }
.cornerScape .left::-webkit-scrollbar-thumb:hover { background:#cfc6bd; }
.cornerScape .left::-webkit-scrollbar-track { background:transparent; }

/* 交互反馈只用颜色/阴影，一律不做位移和缩放：
   之前 hover 会 translateY(-1px)、按下 scale(.97)、卡片悬停上移 3px，
   观感上就是"光标过去/点确认，按钮自己跑了一下"。 */
.cornerScape :deep(.t-button),
.cornerScape .grid .card,
.cornerScape .contentHeader {
  transition: background-color .16s ease, border-color .16s ease, box-shadow .16s ease, color .16s ease;
}
.cornerScape :deep(.t-button:not(.t-is-disabled):hover),
.cornerScape :deep(.t-button:not(.t-is-disabled):active),
.cornerScape .grid .card:hover,
.cornerScape .grid .card:active { transform: none !important; }
.cornerScape .contentHeader .filterChips { margin-top:0; }
@media(max-width:1050px) {
  .cornerScape .left { height:auto; overflow:visible; padding-bottom:0; }
  .cornerScape .left .card { height:auto; }
  /* 页面整体滚动：底部留出浮层高度，滚到底时「开始批量生成图片」正好在浮层上方 */
  .cornerScape { padding-bottom:calc(var(--pipeline-hint-space, 104px) + 12px); }
}
</style>

<style lang="scss" scoped>
.workflowGuide { width:245px; flex:none; align-self:stretch; padding:25px 21px; border:1px solid #eee5dc; border-radius:18px; background:linear-gradient(155deg,#fffaf6,#f7f1eb); color:#342d27; }
.guideEyebrow,.batchEyebrow { color:#b9805a; font-size:10px; font-weight:700; letter-spacing:.14em; }
.workflowGuide h2 { margin:17px 0 10px; font-size:21px; line-height:1.35; letter-spacing:-.03em; }
.workflowGuide > p { margin:0; color:#93867c; font-size:12px; line-height:1.8; }
.guideSteps { display:flex; flex-direction:column; gap:20px; margin:27px 0 30px; }
.guideSteps > div { display:flex; align-items:flex-start; gap:11px; }
.guideSteps b { display:grid; width:27px; height:27px; flex:none; place-items:center; border-radius:9px; background:#f8e5d7; color:#cc7442; font-size:10px; }
.guideSteps span { display:flex; flex-direction:column; gap:3px; }.guideSteps strong { font-size:12px; }.guideSteps small { color:#a1958b; font-size:11px; }
.guideLink { width:100%; border:0; padding:14px 0; background:none; color:#b36a3f; font-size:12px; cursor:pointer; }
.batchStudio { color:#382f29; }.batchStudioHead { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; padding:4px 0 18px; border-bottom:1px solid #eee8e3; }.batchStudioHead h3 { margin:7px 0; font-size:20px; }.batchStudioHead p,.reviewLead { margin:0; color:#96897f; font-size:12px; line-height:1.7; }.batchStage { display:flex; gap:8px; white-space:nowrap; }.batchStage span { padding:7px 10px; border-radius:8px; background:#f6f3f0; color:#a3978d; font-size:11px; }.batchStage span.active { color:#b65522; background:#fff0e4; }
.batchSettings,.batchReview { max-height:65vh; overflow:auto; padding:18px 3px 2px; }.batchSettings .paramForm { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 18px; }.batchSettings .paramForm :deep(.t-form__item) { margin:0; }.batchSettings .paramForm :deep(.t-form__item:nth-child(n+4)),.batchSettings .styleWarn { grid-column:1 / -1; }.batchSettings .scopeBar { margin-bottom:14px; color:#b46132; font-size:12px; }.batchActions { display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }.reviewList { display:flex; flex-direction:column; gap:10px; margin-top:14px; }.reviewItem { padding:14px; border:1px solid #ece5df; border-radius:12px; background:#fcfaf8; }.reviewTitle { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }.reviewTitle strong { font-size:13px; }.reviewTitle span { color:#b37955; font-size:11px; }.reviewItem :deep(.t-button) { margin-top:8px; }
.fieldHint { display:block; margin-top:5px; color:#9b8d82; font-size:11px; }
.candidateProgress { display:flex; align-items:center; gap:5px; margin-top:7px; color:#b66e42; font-size:11px; }
.skillImport { display:flex; align-items:center; gap:10px; color:#9b8c80; font-size:11px; }.uploadSkillButton { position:relative; display:inline-flex; padding:7px 10px; border:1px solid #e6d7ca; border-radius:8px; color:#b46538; background:#fff9f4; cursor:pointer; }.uploadSkillButton input { position:absolute; width:1px; height:1px; opacity:0; }.skillSummary { display:flex; flex-direction:column; gap:4px; margin-top:8px; color:#92857b; font-size:11px; line-height:1.5; }.itemOverrides { margin-top:10px; color:#a0633e; font-size:12px; }.itemOverrides summary { cursor:pointer; }.overrideGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:10px; }.overrideGrid label { display:flex; flex-direction:column; gap:4px; color:#766a61; font-size:11px; }
@media (max-width:1050px) { .workflowGuide { width:100%; align-self:auto; }.guideSteps { flex-direction:row; flex-wrap:wrap; margin:16px 0; }.batchSettings .paramForm { grid-template-columns:1fr; }.batchSettings .paramForm :deep(.t-form__item:nth-child(n+4)),.batchSettings .styleWarn { grid-column:auto; }.batchStudioHead { align-items:flex-start; flex-direction:column; } }
/* Skill 选择器：dialog 会 teleport 到 body，但元素仍由本组件渲染，scoped 属性跟着走 */
.skillPickerBody { display:flex; flex-direction:column; gap:12px; }
.skillPickerLead { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
.skillPickerDesc { margin:0; font-size:12px; line-height:1.6; color:#8d8177; }
.skillCategoryTabs { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.skillCategoryTabs button {
  display:flex; align-items:center; justify-content:center; gap:7px; min-height:42px; padding:8px 10px;
  border:1px solid #e8e1db; border-radius:10px; background:#fff; color:#625a53; font-size:13px; font-weight:600; cursor:pointer;
  transition:border-color .16s ease,background-color .16s ease,color .16s ease;
  span { display:grid; width:23px; height:23px; place-items:center; border-radius:7px; background:#f3efeb; font-size:11px; }
  small { margin-left:auto; color:#a59990; font-size:10px; font-weight:500; }
  &.active { border-color:#ef9f70; background:#fff3ea; color:#b85624; }
  &.active span { background:#ffddc7; }
}
.skillCategoryTabs.compact button { min-height:38px; }
.skillPickerList { display:flex; flex-direction:column; gap:6px; max-height:min(52vh,420px); overflow-y:auto; padding-right:2px; }
.skillPickerEmpty { padding:22px 0; text-align:center; font-size:13px; color:#a3968b; }
.skillOption {
  display:flex; align-items:flex-start; gap:10px; width:100%; text-align:left;
  padding:10px 12px; border:1px solid #eee7e2; border-radius:10px; background:#fff; cursor:pointer;
  transition:border-color .16s ease, background-color .16s ease, box-shadow .16s ease;
  &:hover { border-color:#f0c4a8; background:#fff8f2; }
  &.selected { border-color:#ef9f70; background:#fff3ea; box-shadow:0 0 0 3px rgba(240,138,90,.08); }
  .skillOptionMain { display:flex; flex-direction:column; gap:3px; min-width:0; }
  strong { font-size:13px; font-weight:600; color:#2f2a26; }
  small {
    font-size:12px; line-height:1.5; color:#8d8177;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  }
  .skillOptionTag { margin-left:auto; flex-shrink:0; font-size:11px; color:#b8845f; background:#fff5ec; border-radius:6px; padding:2px 6px; }
}
.skillPickerFooter { display:flex; align-items:center; justify-content:space-between; font-size:12px; color:#8d8177; }
.customSkillForm { display:flex; flex-direction:column; gap:9px; }
.customSkillForm p { margin:0 0 4px; color:#8d8177; font-size:12px; line-height:1.6; }
.customSkillForm label { margin-top:3px; color:#544c45; font-size:12px; font-weight:650; }

.skillPromptComposer { position:relative; width:100%; }
.composerHint { display:flex; flex-wrap:wrap; gap:7px 12px; margin-top:7px; color:#9a8e84; font-size:10px; line-height:1.45; }
.composerHint span:last-child { color:#b46a3e; }
.composerHint kbd { padding:1px 5px; border:1px solid #ddd4cd; border-bottom-width:2px; border-radius:5px; background:#fff; color:#6e6259; font:600 10px/1.4 ui-monospace,monospace; }
.promptCommandMenu {
  position:absolute; z-index:50; left:8px; right:8px; top:auto; bottom:calc(100% - 2px); overflow:auto; max-height:min(280px,45vh);
  padding:6px; border:1px solid #ded5ce; border-radius:12px; background:#fff; box-shadow:0 14px 36px rgba(54,42,34,.16);
}
.promptCommandMenu button { display:flex; align-items:center; gap:10px; width:100%; padding:9px 10px; border:0; border-radius:8px; background:transparent; text-align:left; cursor:pointer; }
.promptCommandMenu button:hover { background:#fff3ea; }
.promptCommandMenu button > span:nth-child(2) { display:flex; min-width:0; flex-direction:column; gap:2px; }
.promptCommandMenu strong { color:#352f2a; font-size:12px; }
.promptCommandMenu small { overflow:hidden; color:#93877e; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
.commandIcon { display:grid; width:27px; height:27px; flex:none; place-items:center; border-radius:8px; background:#fff0e5; color:#c55f28; font-weight:750; }
.promptCommandEmpty { padding:18px 10px; color:#9d9289; font-size:12px; text-align:center; }
</style>
