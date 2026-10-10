<template>
  <div class="aiAssistant" :class="{ focusMode, emptyMode: messages.length === 0 }">
    <div class="assistantPanel">

      <!-- ===== 顶部 HeaderBar ===== -->
      <header v-show="!focusMode" class="panelHeader">
        <div class="projectRow">
          <img class="logoAvatar" src="@/assets/XOI_logo.png" alt="XOi" />
          <span class="projectTitle" aria-label="项目名称">XOi 创作工坊</span>
          <button type="button" class="pageTrigger" aria-label="画布页码" @click="toastRoadmap('Page 多标签隔离')">
            <span>Page&nbsp;{{ pageNumber }}</span>
            <i-arrow-down size="14px" />
          </button>
        </div>
        <div class="sessionRow">
          <span class="sessionTitle">{{ activeSessionTitle }}</span>
          <div class="sessionActions">
            <button type="button" class="iconBtn" title="新建对话" @click="newConversation">
              <!-- lucide message-square-plus 同款手感·inline svg 免依赖 sprite 缺失问题 -->
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h9"></path>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="10" y1="10" x2="14" y2="10"></line>
              </svg>
            </button>
            <button type="button" class="iconBtn" title="历史会话" @click="showHistory = !showHistory">
              <i-history size="18px" />
            </button>
            <button type="button" class="iconBtn"
                    :title="focusMode ? '沉浸专注模式（外围导航已屏蔽）' : '收拢至沉浸专注创作'"
                    @click="uiPrefs.toggleAiAssistantChrome()">
              <i-menu-unfold v-if="focusMode" size="18px" />
              <i-menu-fold v-else size="18px" />
            </button>
          </div>
        </div>
      </header>

      <!-- ===== 历史抽屉 · 内存态刷新即丢(view-back 行为非真持久化)===== -->
      <transition name="slide-fade">
        <aside v-if="showHistory" class="historyDrawer">
          <header class="drawerHead">
            <span>历史会话</span>
            <button class="closeBtn" @click="showHistory = false"><i-close /></button>
          </header>
          <ul class="conversationList">
            <li v-if="conversations.length === 0" class="emptyHint">暂无历史记录(Pinia 内存态,刷新即丢)</li>
            <li
              v-for="(cv, idx) in [...conversations].reverse()"
              :key="cv.id"
              :class="{ active: cv.id === activeId }"
              @click="switchConversation(cv.id)">
              <div class="cvTitle">#{{ conversations.length - idx }}&nbsp;{{ cv.title }}</div>
              <div class="cvMeta">共 {{ cv.messages.length }} 条 · 提问 {{ cv.messages.filter((m:any)=>m.role==='user').length }}</div>
            </li>
          </ul>
          <footer class="drawerFoot">
            <button class="clearAllBtn" @click="clearConversations"><i-delete-one />清空历史</button>
          </footer>
        </aside>
      </transition>

      <!-- ===== 中央 MainContent · 空态 ↔ 消息流自适应切换 ===== -->
      <main ref="mainRef" class="mainScrollArea">
        <transition name="fade" mode="out-in">
          <!-- ── 空态:IP 吉祥物 + 业务化 PromptCard ×3 ── -->
          <section v-if="messages.length === 0" key="empty" class="emptyStage">
            <section class="mioraBanner" aria-label="无限画布功能轮播">
              <div ref="bannerCarouselRef" class="bannerStage">
                <button
                  v-for="banner in visibleBanners"
                  :key="banner.position"
                  type="button"
                  class="bannerCard"
                  :data-banner-offset="banner.offset"
                  :class="{ active: banner.offset === 0, clickable: Boolean(banner.linkUrl || banner.videoUrl) }"
                  :style="bannerCardStyle(banner)"
                  :aria-label="banner.alt"
                  @pointerdown="handleBannerPointerDown"
                  @pointermove="handleBannerPointerMove"
                  @pointerup="handleBannerPointerUp"
                  @pointercancel="handleBannerPointerCancel"
                  @click="openBanner(banner)">
                  <span class="bannerCardInner">
                    <img
                      v-if="banner.imageUrl"
                      :src="banner.imageUrl"
                      :alt="banner.alt"
                      draggable="false"
                      decoding="async"
                      loading="eager"
                      fetchpriority="high"
                    />
                    <span class="bannerFeatureCard" :class="{ withImage: Boolean(banner.imageUrl) }" :style="banner.imageUrl ? undefined : { background: banner.grad }">
                      <small>XOi CREATIVE STUDIO</small>
                      <strong>{{ banner.title }}</strong>
                      <p>{{ banner.desc }}</p>
                      <em>打开工作区 <span>↗</span></em>
                    </span>
                    <span v-if="banner.offset === 0 && banner.videoUrl" class="bannerPlay" aria-hidden="true">▶</span>
                  </span>
                </button>
                <button type="button" class="bannerArrow bannerArrowLeft" aria-label="上一张" @click.stop="changeBanner(-1)">‹</button>
                <button type="button" class="bannerArrow bannerArrowRight" aria-label="下一张" @click.stop="changeBanner(1)">›</button>
              </div>
              <div class="bannerDots" aria-label="轮播切换">
                <button v-for="(banner, index) in canvasBanners" :key="banner.alt" type="button" :class="{ active: index === activeBannerIndex }" :aria-label="`切换到第 ${index + 1} 张`" @click="selectBanner(index)"></button>
              </div>
            </section>

            <section class="launchIntro" aria-labelledby="launch-title">
              <div class="launchIntroCopy">
                <span class="launchEyebrow"><i-magic /> 创作 Agent</span>
                <h1 id="launch-title">先把想法讲清楚，剩下的交给画布</h1>
                <p>文本模型先理解与拆解需求，进入画布后再按任务选择图片或视频模型。进入画布本身不扣媒体积分。</p>
              </div>
              <ol class="launchSteps" aria-label="创作流程">
                <li><b>01</b><span><strong>描述想法</strong><small>支持素材与 Skill</small></span></li>
                <li><b>02</b><span><strong>AI 规划</strong><small>当前文本模型思考</small></span></li>
                <li><b>03</b><span><strong>画布生成</strong><small>按需选择图片 / 视频模型</small></span></li>
              </ol>
            </section>

            <div class="legacyEmpty" aria-hidden="true">
            <div class="mascotWrap">
              <!--
                IP 吉祥物·三件事严守 plan 第四部分策略:
                  ① viewBox 直搬 Miora 原值 "0 0 48 48"(此前误写成 -12/-12/72/72 致坐标系整体错位);
                  ② ip-body 方块的 width/height/transform 三元组一字不改地照搬 ref-miora-sidebar.html L56 原值
                     (width=63.8367 height=63.8367 transform=matrix(-1 0 0 1 55.1021 -7.34692)),
                     只把 fill 由 url(#pattern0_8850_1320)[指向被 docx 掐剩孤'i'无法解码的PNG data-uri]
                       换成纯黑 #000000 以弃外图版权依赖;
                     该 mirror 平移矩阵决定了身躯边界框的实际落点 ≈ (-8.74,-7.35)-(55.10,56.49),
                     必须保留否则后续双眼会相对躯壳位移失准;
                  ③ 四条 ip-eye-white/pupil 贝塞尔曲线 path 因同样遭 docx 字符上限截断不可 verbatim 还原,
                    抽象化为与原 viewBox 同系下的竖椭圆+实心圆替代;圆心按原文各 path 起点
                      (M22.1682/M13.9745/M23.6896/M15.6084)所提示的两簇光学区估位列于身躯上方左右对称.
                   .ip-eye-white/.ip-eye-pupil/.ip-body 类名沿用使全局 xo-ipBlink* 关键帧与暗模式 filter 不破链.
              -->
              <svg class="mascotArt" width="48" height="48" viewBox="0 0 48 48" fill="none" role="img" aria-label="XOi 助手吉祥物">
                <defs>
                  <!-- 身躯贴图 · verbatim 直录 ref-miora-sidebar.html L62-L68 的 pattern/use/image 三件套骨架；
                       patternContentUnits=objectBoundingBox 使 pattern 局部坐标系归一到 [0..1]×[0..1]；
                       use scale(0.0013587)=1/736 将 736×736 image 缩进单位框恰好铺满 rect 边界。
                       ref 里 xlink:href 是被 docx w:t 上限掐剩孤 'i' 无法 decode 的内嵌 base64 data-uri，
                       此处改引本仓 assets/ip_body.png(user 已下到的原图)经 Vite 解析为 URL 同源加载：
                         一甩脱万级 base64 致源码膨胀、二还原 Miora IP 形象真貌、
                         三暗模式 .ip-body filter brightness/invert 整体作用于位图仍转中度灰辨识未损。-->
                  <pattern id="pattern0_8850_1320" patternContentUnits="objectBoundingBox" width="1" height="1">
                    <use href="#image0_8850_1320" transform="scale(0.0013587)" />
                  </pattern>
                  <image id="image0_8850_1320" width="736" height="736" preserveAspectRatio="none"
                         :href="ipBodyUrl" :xlink:href="ipBodyUrl"></image>
                </defs>
                <!-- 身躯方块 · 三元组(width63.8367 / height63.8367 / transform matrix(-1 0 0 1 55.1021 -7.34692))
                     连同 viewBox "0 0 48 48" 四件全部直录 ref L53/L56 守 geometry-verbatim 底线一字不改；
                     fill 复刻 url(#pattern0_8850_1320) 指 pattern → image → 本仓 ip_body.png 真·IP 贴图；
                     rx 移除回归原文方正轮廓 —— PNG 位图自身已含角色造型细节不再需 css 圆角软化补救。-->
                <rect class="ip-body" width="63.8367" height="63.8367"
                      transform="matrix(-1 0 0 1 55.1021 -7.34692)"
                      fill="url(#pattern0_8850_1320)"></rect>
                <!-- 双白眼球·两道贝塞尔曲线 path 直录自 ref(docx 行宽折叠曾误判其残缺实则各以 X.XXXXZ 闭合并无缺失),
                     配合下方 @keyframes ipBlinkWhite scaleY 缩放完成眨眼上半动作 -->
                <path class="ip-eye-white" d="M22.1682 25.68C22.1682 28.7196 23.9078 31.1836 26.5445 31.1836C29.1812 31.1836 31.7166 28.5869 31.7166 25.5474C31.7166 22.5079 29.5791 20.0438 26.9424 20.0438C24.3057 20.0438 22.1682 22.6405 22.1682 25.68Z" fill="#ffffff"></path>
                <path class="ip-eye-white" d="M13.9745 23.8886C13.1461 26.2792 13.9581 28.6821 15.4825 29.2103C17.0069 29.7385 18.7027 28.0878 19.5311 25.6972C20.3594 23.3066 19.7952 20.9404 18.2707 20.4122C16.7463 19.884 14.8028 21.498 13.9745 23.8886Z" fill="#ffffff"></path>
                <!-- 双瞳孔·配 @keyframes ipBlinkPupil translateY 微移收尾下半眨眼 -->
                <path class="ip-eye-pupil" d="M23.6896 23.5078C23.4533 24.8850 23.9870 26.1849 25.29 26.4085C26.5929 26.6321 28.2994 25.7017 28.5357 24.3246C28.7720 22.9474 28.0932 21.6309 26.7903 21.4073C25.4874 21.1838 23.9259 22.1307 23.6896 23.5078Z" fill="#000000"></path>
                <path class="ip-eye-pupil" d="M15.6084 22.5914C15.2502 23.6791 15.3989 24.7558 16.2037 25.0209C17.0084 25.2859 18.2456 24.6530 18.6038 23.5652C18.9621 22.4775 18.7225 21.3780 17.9178 21.1129C17.1130 20.8479 15.9667 21.5036 15.6084 22.5914Z" fill="#000000"></path>
              </svg>
              <h3 class="greetTitle">{{ inspirationMode ? '打开灵感盒' : '你好！我是' }} <span class="gradient-text">{{ inspirationMode ? '✦' : 'XOi' }}</span></h3>
              <p class="greetSub">{{ inspirationMode ? '从一个提示词开始，也可以继续改写成你的版本' : '短剧创作搭档 · 点张灵感卡起步' }}</p>
            </div>
            <div class="promptCards">
              <article
                v-for="(card, ci) in promptCards"
                :key="ci"
                class="promptCard"
                @click="pickPrompt(card.prompt)">
                <h4 class="cardTitle">{{ card.title }}</h4>
                <p class="cardDesc">{{ card.desc }}</p>
              </article>
            </div>
            <footer class="cardsFootnote">内容由 AI 生成，仅供参考</footer>
            </div>
          </section>

          <!-- ── 有消息时:沿用原有气泡体系(user 紫→蓝渐变右贴边 / assistant material 半透毛玻璃头像靠左)── -->
          <section v-else key="list" ref="messagesRef" class="messageList">
            <div v-for="message in messages" :key="message.id" class="messageWrapper" :class="message.role">
              <img v-if="message.role === 'assistant'" src="@/assets/XOI_logo.png" alt="AI" class="messageAvatarImg" />
              <div class="messageBubble" :class="message.role">
                <div class="messageContent" v-html="formatMessage(message.content)"></div>
                <button
                  v-if="message.role === 'assistant' && message.status === 'complete'"
                  type="button"
                  class="msgCopyBtn"
                  :title="copiedId === message.id ? '已复制到剪贴板' : '复制本条回复'"
                  @click="handleMsgCopy(message, $event)"
                >
                  <!-- lucide copy 同款手感·inline svg 免依赖 sprite 缺失问题 -->
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>{{ copiedId === message.id ? "已复制" : "复制" }}
                </button>
                <div v-if="message.status === 'pending' || (message.status === 'streaming' && !message.content)" class="typingIndicator agentPendingState">
                  <div class="agentPendingTop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg><span>正在理解画布和创作目标</span></div>
                  <div class="agentPendingProgress"><span></span></div>
                </div>
              </div>
            </div>
          </section>
        </transition>
      </main>

      <section v-if="messages.length === 0" class="creationDock" aria-label="选择创作类型">
        <div class="creationDockMascot" aria-hidden="true">
          <video src="/miora-home/mascot-preview.webm" autoplay muted loop playsinline></video>
        </div>
        <div class="creationTabs" role="tablist">
          <button v-for="category in creationCategories" :key="category.key" type="button" :class="{ active: activeCategory === category.key }" :aria-selected="activeCategory === category.key" @click="activeCategory = category.key">
            <span class="categoryIcon" v-html="category.icon"></span>
            <span>{{ category.label }}</span>
          </button>
        </div>
      </section>

      <!-- 与无限画布共用交互语义的完整 Agent Composer；保留本页 Tab 灵感提示。 -->
      <footer
        ref="composerRef"
        class="composerToolbar upstreamComposer"
        :class="{ popoverOpen: showAssetMenu || showSkillPicker || Boolean(openSetting) }"
        @click.self="focusComposer">
        <div v-if="messages.length === 0" class="composerMascot" aria-hidden="true">
          <video src="/miora-home/mascot-preview.webm" autoplay muted loop playsinline></video>
        </div>
        <transition name="skill-pop">
          <aside
            v-if="showSkillPicker"
            ref="skillPickerRef"
            class="skillPicker"
            :style="{ height: `${skillPickerHeight}px`, maxHeight: `${skillPickerHeight}px` }"
            aria-label="选择创作技能">
            <h3>Skill</h3>
            <div class="skillPickerTop">
              <div class="skillTabs"><button type="button" :class="{ active: skillTab === 'general' }" @click="skillTab = 'general'">通用</button><button type="button" :class="{ active: skillTab === 'mine' }" @click="skillTab = 'mine'">我的</button></div>
              <div class="skillSearchRow"><t-icon name="search" /><input v-model="skillKeyword" type="search" placeholder="搜索 Skill" aria-label="搜索技能" /></div>
            </div>
            <div v-if="skillsLoading" class="skillEmpty">正在读取 Skills…</div>
            <div v-else-if="!filteredSkills.length" class="skillEmpty"><strong>还没有可调用的 Skill</strong><span>先去 Skills 页面安装需要的写作、视觉或导演能力</span><router-link to="/skills">浏览 Skills →</router-link></div>
            <div v-else class="skillList">
              <button v-for="skill in filteredSkills" :key="skill.path" type="button" class="skillOption" :class="{ selected: selectedSkills.includes(skill.path) }" @click="toggleSkill(skill.path)">
                <span class="skillGlyph"><i-toolkit size="20px" /></span><span class="skillCopy"><strong>{{ skill.name }}</strong><small>{{ skill.desc }}</small></span><span class="skillOfficial">{{ selectedSkills.includes(skill.path) ? '已选' : (skill.source === 'general' ? '通用' : '已安装') }}</span>
              </button>
            </div>
            <div class="skillPickerDivider"></div>
            <div class="skillPickerActions">
              <router-link to="/skills"><i-plus /><span>添加技能</span><i-right class="actionArrow" /></router-link>
              <router-link to="/skills"><i-cube /><span>管理技能</span></router-link>
              <button v-if="selectedSkills.length" type="button" class="clearSkills" @click="clearSelectedSkills">清空本轮已选</button>
            </div>
          </aside>
        </transition>
        <div class="editorRow" :class="{ hasInput: Boolean(inputValue), hasSkills: composerAttachments.length || activeSkillOptions.length }" @click="focusComposer">
          <div v-if="composerAttachments.length || activeSkillOptions.length" class="editorSkills">
            <button v-for="file in composerAttachments" :key="file.id" type="button" :title="`移除 ${file.name}`" @click.stop="removeComposerAttachment(file.id)">
              <span>{{ file.type.startsWith('image/') ? '🖼' : file.type.startsWith('video/') ? '🎬' : '🎵' }}</span>{{ file.name }}<i-close size="12px" />
            </button>
            <button v-for="skill in activeSkillOptions" :key="skill.path" type="button" :title="`移除 ${skill.name}`" @click.stop="toggleSkill(skill.path)">
              <span>{{ skill.emoji }}</span>{{ skill.name }}<i-close size="12px" />
            </button>
          </div>
          <textarea
            ref="taRef"
            v-model="inputValue"
            rows="1"
            :disabled="status === 'pending' || status === 'streaming'"
            :placeholder="inputValue ? '描述创作目标，或让我继续操作画布' : ''"
            aria-label="描述创作目标，或让我继续操作画布"
            @keydown.tab="handleSkillTab"
            @keydown.backspace="handleComposerBackspace"
            @keydown.delete="handleComposerDelete"
            @keydown.enter.exact.prevent="handleSend"
            @input="autogrowTextarea"></textarea>
          <div v-if="!inputValue" class="completionHint promptCycleHint" aria-hidden="true">
            <span class="promptSpark">✦</span><span class="promptCycleLabel">{{ completionSuggestion || cyclePromptText }}</span><kbd>Tab 补全</kbd>
          </div>
        </div>

        <div v-if="messages.length === 0" class="composerBillingBar">
          <div class="billingNow">
            <span class="billingStatusDot" aria-hidden="true"></span>
            <span class="billingLabel">当前思考</span>
            <strong>{{ selectedModelLabel || defaultTextModel || '系统默认模型' }}</strong>
            <ModelCostHint
              v-if="selectedModelName || defaultTextModel"
              class="inlineCostHint"
              :model="selectedModelName || defaultTextModel"
              type="text"
              :input-length="inputValue.length"
              compact />
          </div>
          <button type="button" class="billingGuideToggle" :aria-expanded="showBillingGuide" @click.stop="showBillingGuide = !showBillingGuide">
            {{ showBillingGuide ? '收起计费详情' : '查看生成模型与积分' }}
            <i-down :class="{ rotated: showBillingGuide }" />
          </button>
        </div>

        <transition name="billing-guide">
          <section v-if="messages.length === 0 && showBillingGuide" class="billingGuide" aria-label="模型与积分说明">
            <article class="billingGuideCard textCard">
              <span class="billingGuideIcon">✦</span>
              <div><small>对话规划</small><strong>{{ selectedModelLabel || defaultTextModel || '系统默认文本模型' }}</strong><ModelCostHint :model="selectedModelName || defaultTextModel" type="text" :input-length="inputValue.length" compact /></div>
            </article>
            <article class="billingGuideCard">
              <span class="billingGuideIcon">▧</span>
              <div><small>图片生成 · 进入画布后可更换</small><strong>{{ defaultImageModel || '选择图片模型后显示价格' }}</strong><ModelCostHint v-if="defaultImageModel" :model="defaultImageModel" type="image" compact /></div>
            </article>
            <article class="billingGuideCard">
              <span class="billingGuideIcon">▣</span>
              <div><small>视频生成 · 进入画布后可更换</small><strong>{{ defaultVideoModel || '选择视频模型后显示价格' }}</strong><ModelCostHint v-if="defaultVideoModel" :model="defaultVideoModel" type="video" compact /></div>
            </article>
            <p>仅在实际调用模型时结算；图片 / 视频不会因进入画布而扣费，最终以网关返回的实际用量为准。</p>
          </section>
        </transition>

        <div class="toolbarLeft">
          <input ref="attachmentInputRef" hidden type="file" multiple accept="image/*,video/*,audio/*" @change="onComposerFilesSelected" />
          <button type="button" class="roundIconBtn assetTrigger" aria-label="添加素材" title="添加素材" @click.stop="toggleAssetMenu">
            <i-paperclip size="16px" /><span class="toolLabel">素材</span>
          </button>
          <div v-if="showAssetMenu" class="assetMenu">
            <div class="assetMenuHeader"><strong>添加素材</strong><span>把参考内容带入这次创作</span></div>
            <button type="button" @click="attachmentInputRef?.click(); showAssetMenu = false"><span class="assetMenuIcon"><i-paperclip size="18px" /></span><span class="assetMenuCopy"><b>上传文件</b><small>图片、视频、音频</small></span><kbd>⌘ U</kbd></button>
            <button type="button" @click="openAssetPicker"><span class="assetMenuIcon"><i-folder-open size="18px" /></span><span class="assetMenuCopy"><b>我的素材</b><small>从无限创意画布资产库选择</small></span><kbd>⌘ M</kbd></button>
          </div>
          <button ref="skillButtonRef" type="button" class="roundIconBtn skillButton" :class="{ active: showSkillPicker || selectedSkills.length }" title="搭配 Skills" @click="toggleSkillPicker">
            <i-toolkit size="16px" /><span class="toolLabel">Skill</span>
            <span v-if="selectedSkills.length" class="skillCount">{{ selectedSkills.length }}</span>
          </button>
          <div class="modelSlot" aria-label="选择负责思考的文本模型">
            <span class="modelSlotLabel">思考模型</span>
            <modelSelect
              v-model="selectedModelValue"
              v-model:label="selectedModelLabel"
              type="text"
              size="small"
              placeholder="选择模型"
              @change="onPickModel" />
            <ModelCostHint
              v-if="selectedModelValue"
              class="composerCostHint"
              :model="selectedModelName"
              type="text"
              :input-length="inputValue.length" />
          </div>
          <div class="composerSetting">
            <button type="button" class="settingPill" title="图片设置" @click="openComposerSetting('image')">▧ <span>{{ imageQuality }} · {{ imageSize }}</span></button>
            <div v-if="openSetting === 'image'" class="settingMenu mediaSettingMenu imageSettingMenu">
              <h3>图像设置</h3><label>质量</label>
              <div class="settingSegment"><button v-for="value in imageQualities" :key="value" type="button" :class="{ selected: imageQuality === value }" @click="imageQuality = value">{{ value }}</button></div>
              <div class="settingTitleRow"><label>尺寸</label><label class="alignToggle">16倍数对齐 <input v-model="alignImageSize" type="checkbox"><span></span></label></div>
              <div class="dimensionRow"><span>W</span><strong>{{ imageDimensions.width }}</strong><em>↔</em><span>H</span><strong>{{ imageDimensions.height }}</strong></div>
              <label>宽高比</label>
              <div class="ratioGrid"><button v-for="value in imageSizes" :key="value" type="button" :class="{ selected: imageSize === value }" @click="imageSize = value"><i :style="ratioPreviewStyle(value)"></i><span>{{ value }}</span></button></div>
            </div>
          </div>
          <div class="composerSetting">
            <button type="button" class="settingPill" title="视频设置" @click="openComposerSetting('video')">▣ <span>{{ videoQuality }} · {{ videoSize }}</span></button>
            <div v-if="openSetting === 'video'" class="settingMenu mediaSettingMenu videoSettingMenu">
              <h3>视频设置</h3><label>清晰度</label>
              <div class="settingSegment"><button v-for="value in videoQualities" :key="value" type="button" :class="{ selected: videoQuality === value }" @click="videoQuality = value">{{ value }}</button></div>
              <label>尺寸</label><div class="dimensionRow"><span>W</span><strong>{{ videoDimensions.width }}</strong><em>↔</em><span>H</span><strong>{{ videoDimensions.height }}</strong></div>
              <div class="videoSizeGrid"><button v-for="item in videoSizeOptions" :key="item.value" type="button" :class="{ selected: videoSize === item.value }" @click="videoSize = item.value"><i :class="`shape-${item.shape}`"></i><span>{{ item.value }}</span><small>{{ item.label }}</small></button></div>
            </div>
          </div>
        </div>

        <div class="toolbarRight">
          <button type="button" class="roundIconBtn reasoningButton" :class="{ active: reasoningEnabled }" :title="reasoningEnabled ? '推理已开启' : '推理已关闭'" :aria-label="reasoningEnabled ? '关闭推理' : '开启推理'" :aria-pressed="reasoningEnabled" @click="reasoningEnabled = !reasoningEnabled">✦<span class="toolLabel">推理</span></button>
          <t-button
            v-if="status !== 'streaming'"
            theme="primary"
            shape="square"
            class="sendButton"
            :disabled="!inputValue.trim() || status === 'pending'"
            :loading="status === 'pending'"
            @click="handleSend"
            aria-label="发送">
            <template #icon><i-send size="15px" /></template>
            <span v-if="messages.length === 0" class="sendButtonLabel">进入画布</span>
          </t-button>
          <t-button
            v-else
            theme="warning"
            shape="square"
            class="stopButton"
            @click="handleStop"
            aria-label="停止">
            <template #icon><i-pause-one size="15px" /></template>
          </t-button>
        </div>

      </footer>

      <Teleport to="body">
        <div v-if="showAssetPicker" class="assetPickerOverlay" role="dialog" aria-modal="true" aria-label="选择我的素材" @click.self="closeAssetPicker">
          <div class="assetPickerDialog">
            <iframe :key="assetPickerKey" class="assetPickerFrame" :src="assetPickerSrc" title="无限创意画布素材库"></iframe>
          </div>
        </div>
      </Teleport>

      <section v-if="messages.length === 0" class="inspirationShowcase" aria-labelledby="inspiration-heading">
        <header>
          <h2 id="inspiration-heading"><i-bulb />优质灵感</h2>
          <div class="inspirationActions">
            <button type="button" @click="shuffleInspirations">↻ 换一批</button>
            <router-link to="/inspiration">查看更多灵感 <i-right /></router-link>
          </div>
        </header>
        <div class="inspirationGrid">
          <article v-for="item in inspirationItems" :key="item.title" class="inspirationCard">
            <router-link class="inspirationMedia" :to="`/inspiration/${item.detailIndex}`" :aria-label="`在 XOi 查看灵感：${item.title}`">
              <img :src="item.image" :alt="item.title" loading="lazy" />
            </router-link>
            <span class="inspirationInfo"><strong>{{ item.title }}</strong><small>{{ item.category }}</small><button type="button" @click="useInspiration(item.prompt)">使用提示词</button></span>
          </article>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { MessagePlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import { showPointsToast } from "@/utils/pointsToast";
// Miora IP 身躯贴图 · 736×737 PNG 经 Vite ESM-import 解析为运行期 hashed URL，
// 注入下方 <image :href=:xlink:href> 以还原本仓此前无法解码的那张外图真貌。
import ipBodyUrl from "@/assets/ip_body.png";
import inspirationCyber from "@/assets/visual-presets/cyber-3d.png";
import inspirationGuofeng from "@/assets/visual-presets/style-guofeng-cyber.png";
import inspirationUrban from "@/assets/visual-presets/urban-romance.png";
import inspirationAnime from "@/assets/visual-presets/style-urban-romance-anime.png";
import inspirationCinematic from "@/assets/visual-presets/style-real-urban-cinematic.png";
import inspirationGuochao from "@/assets/visual-presets/style-guochao-2d.png";
import inspirationClay from "@/assets/visual-presets/style-clay-stopmotion.png";
import inspirationFantasy from "@/assets/visual-presets/guochao-fantasy.png";
// 全局 UI 偏好·承载 aiAssistant 页「暂请显露外围工作台 chrome 以便横向跳转兄弟模块」一道应急开关；
// 与 layouts/WorkbenchLayout.isImmersive 共享同源布尔令内外两层同步联动杜绝脱节(详见 @/stores/uiPrefs.ts)。
import uiPrefsStore from "@/stores/uiPrefs";
import userStore from "@/stores/user";
import modelSelect from "@/components/modelSelect.vue";
import ModelCostHint from "@/components/ModelCostHint.vue";
const { baseUrl } = storeToRefs(settingStore());
// Pinia 同 id 单例：此处拿到的 uiPrefs 与 WorkbenchLayout 内读到的指向同一份 reactive state，
// 任一处翻 toggle 都会让本地伪工具条显隐与外层 topMenu 显隐成对联动。
const uiPrefs = uiPrefsStore();
const { userId } = storeToRefs(userStore());
const route = useRoute();
const router = useRouter();
const inspirationMode = computed(() => route.query.mode === "inspiration");

const activeCategory = ref("branding");
const creationCategories = [
  { key: "branding", label: "品牌设计", icon: "◉" },
  { key: "video", label: "影视创意", icon: "▦" },
  { key: "commerce", label: "电商广告", icon: "▣" },
  { key: "gaming", label: "互动游戏", icon: "⌘" },
  { key: "web", label: "网页应用", icon: "▱" },
];
type CanvasBanner = { imageUrl?: string; videoUrl?: string; linkUrl?: string; alt: string; title?: string; desc?: string; grad?: string; route?: string };
// 功能导流卡：全部指向站内四个创作模块（第三方推广/返佣广告已按「统一走 new-api」方案清除，不再依赖外部 CDN 图）。
const canvasBanners: CanvasBanner[] = [
  { alt: "无限创意画布", title: "让灵感成为作品", desc: "把提示词、参考图、分镜与生成结果放进同一张画布，持续推演你的创意。", imageUrl: "/miora-home/ai-creative-canvas.png", route: "/canvas" },
  { alt: "镜头导演台", title: "镜头导演台", desc: "搭建 3D 场景、安排人物走位、设计镜头与关键帧，把导演想法变成可预演的分镜。", imageUrl: "/miora-home/director-stage.png", route: "/director3d" },
  { alt: "AI影像创作中心", title: "AI 影像创作中心", desc: "从故事、剧本到镜头与成片，漫剧创作在同一条流水线上持续推进。", imageUrl: "/miora-home/film-pipeline.png", route: "/project" },
  { alt: "创作智能体", title: "创作智能体", desc: "一句话描述创意，智能体帮你拆解成海报、视频、品牌视觉等可执行的创作任务。", imageUrl: "/miora-home/creative-agent.png", route: "/aiAssistant" },
];
const bannerCarouselRef = ref<HTMLElement | null>(null);
const activeBannerPosition = ref(0);
const activeBannerIndex = computed(() => (activeBannerPosition.value % canvasBanners.length + canvasBanners.length) % canvasBanners.length);
const bannerDragX = ref(0);
let bannerPointerStart: number | null = null;
let bannerDragged = false;
const visibleBanners = computed(() => [-1, 0, 1].map((offset) => {
  const position = activeBannerPosition.value + offset;
  const index = (position % canvasBanners.length + canvasBanners.length) % canvasBanners.length;
  return { ...canvasBanners[index], offset, position, index };
}));
// 轮播两侧的卡片仍然在 DOM 中，但因为 3D 变换和容器溢出，浏览器可能把它们
// 误判为不可见并推迟 lazy image 的请求。提前把整组素材放入浏览器缓存，切换时
// 只做位置变化，不再出现“滑到中间才加载”的白色占位。
const preloadedBannerImages = new Set<string>();
function preloadBannerImages() {
  for (const banner of canvasBanners) {
    if (!banner.imageUrl || preloadedBannerImages.has(banner.imageUrl)) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = banner.imageUrl;
    preloadedBannerImages.add(banner.imageUrl);
  }
}
// Keep the carousel visually compact while preserving its reserved layout height.
const BANNER_WIDTH = "min(calc(100vw - 2rem), 740px)";
const SIDE_BANNER_WIDTH = "min(82vw, 520px)";
function bannerAngle(offset: number) { return offset === 0 ? 0 : offset < 0 ? 12 : -12; }
function bannerCardStyle(banner: { offset: number }) {
  const progress = Math.max(-1, Math.min(1, bannerDragX.value / 160));
  const angle = bannerAngle(banner.offset) - progress * 12;
  const active = banner.offset === 0;
  return {
    left: active ? `calc(50% + ${bannerDragX.value}px)` : banner.offset < 0 ? `calc(50% - ${SIDE_BANNER_WIDTH} + 16px + ${bannerDragX.value}px)` : `calc(50% + ${SIDE_BANNER_WIDTH} - 16px + ${bannerDragX.value}px)`,
    width: active ? BANNER_WIDTH : SIDE_BANNER_WIDTH,
    translate: "-50% -50%",
    zIndex: active ? 3 : 1,
    // The stage owns the perspective. Applying a second perspective to each
    // card can make off-centre descendants get culled by WebKit's compositor.
    transform: `rotateY(${angle}deg)`,
    transformOrigin: "center center",
    // A 12deg side card is still front-facing. Hiding its backface here can
    // otherwise turn the card into a blank painted surface in Safari/WebKit.
    backfaceVisibility: "visible" as const,
    touchAction: "pan-y",
  };
}
function selectBanner(index: number) {
  activeBannerPosition.value = index;
}
function changeBanner(step: number) {
  activeBannerPosition.value += step;
}
function handleBannerPointerDown(event: globalThis.PointerEvent) {
  bannerPointerStart = event.clientX;
  bannerDragged = false;
  (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
}
function handleBannerPointerMove(event: globalThis.PointerEvent) {
  if (bannerPointerStart === null) return;
  bannerDragX.value = Math.max(-180, Math.min(180, event.clientX - bannerPointerStart));
  bannerDragged = Math.abs(bannerDragX.value) > 4;
}
function finishBannerDrag(step = 0) {
  bannerPointerStart = null;
  if (step) activeBannerPosition.value += step;
  window.requestAnimationFrame(() => { bannerDragX.value = 0; });
}
function handleBannerPointerUp(event: globalThis.PointerEvent) {
  if (bannerPointerStart === null) return;
  const distance = event.clientX - bannerPointerStart;
  bannerDragged = Math.abs(distance) > 4;
  finishBannerDrag(Math.abs(distance) > 60 ? (distance < 0 ? 1 : -1) : 0);
}
function handleBannerPointerCancel() { bannerDragged = false; finishBannerDrag(); }
function openBanner(banner: CanvasBanner & { index: number; position: number }) {
  if (bannerDragged) { bannerDragged = false; return; }
  if (banner.position !== activeBannerPosition.value) { activeBannerPosition.value = banner.position; return; }
  // 功能导流卡一律站内跳转（外部推广链接已清除）
  if (banner.route) router.push(banner.route);
}
function openCanvasWithPrompt(preset = inputValue.value.trim()) {
  const prompt = preset.trim();
  try {
    localStorage.setItem("xoi_canvas_handoff_v1", JSON.stringify({
      prompt,
      category: activeCategory.value,
      skills: activeSkillOptions.value.map((skill) => ({ path: skill.path, name: skill.name, group: skill.group })),
      image: { size: imageSize.value, quality: imageQuality.value },
      video: { size: videoSize.value, quality: videoQuality.value },
      model: selectedModelValue.value || "",
      reasoning: reasoningEnabled.value,
      assets: composerAttachments.value,
      source: "aiAssistant",
      createdAt: Date.now(),
    }));
  } catch {
    MessagePlugin.warning("画布入口数据暂时无法保存，请重试");
    return;
  }
  router.push("/canvas?source=xoi&handoff=1");
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "pending" | "streaming" | "complete" | "error";
}
interface Conversation {
  id: number;
  title: string;
  messages: Message[];
}
interface SkillOption { path: string; name: string; group: string; desc: string; emoji: string; source: "general" | "mine" }
const showSkillPicker = ref(false);
const showAssetMenu = ref(false);
const showAssetPicker = ref(false);
const assetPickerKey = ref(0);
const assetPickerSrc = computed(() => `/atelier-canvas/index.html?view=asset-picker&locale=zh-CN&picker=${assetPickerKey.value}`);
const composerRef = ref<HTMLElement | null>(null);
const skillTab = ref<"general" | "mine">("general");
const skillPickerRef = ref<HTMLElement | null>(null);
const skillButtonRef = ref<HTMLButtonElement | null>(null);
const skillPickerHeight = ref(420);
const skillKeyword = ref("");
const skillsLoading = ref(false);
const skillOptions = ref<SkillOption[]>([]);
const selectedSkills = ref<string[]>([]);
const selectedSkillsKey = computed(() => `xo_assistant_selected_skills_v1:${userId.value || 'anonymous'}`);
const installedSkillsKey = computed(() => `xoi_installed_creative_skills_v1:${userId.value || 'anonymous'}`);
const skillEmoji = ["🎬", "✦", "🎨", "🧩", "✍️", "🎞️", "💡", "🪄"];
const generalSkills: SkillOption[] = [
  { path: "builtin-ecommerce", name: "电商视觉", group: "视觉风格", desc: "商品主图、详情页、促销海报与统一系列视觉", emoji: "🔧", source: "general" },
  { path: "builtin-xhs", name: "小红书内容", group: "视觉风格", desc: "封面、种草图文、生活方式场景与系列内容", emoji: "🔧", source: "general" },
  { path: "builtin-comic", name: "漫剧制作", group: "短剧工作流", desc: "角色设定、分镜网格、场景一致性与镜头节奏", emoji: "🔧", source: "general" },
  { path: "builtin-film", name: "影视分镜", group: "导演叙事", desc: "景别、机位、运镜、光线、声音和转场设计", emoji: "🔧", source: "general" },
  { path: "builtin-storyboard", name: "品牌故事板", group: "短剧工作流", desc: "品牌、产品、网站与项目宣传片完整创作流程", emoji: "🔧", source: "general" },
];
const normalizeSkillName = (path: string) => path.split("/").pop()?.replace(/\.md$/i, "").replace(/[_-]+/g, " ") || path;
const skillName = (path: string) => skillOptions.value.find((item) => item.path === path)?.name || normalizeSkillName(path);
const activeSkillOptions = computed(() => selectedSkills.value.map((path) => skillOptions.value.find((item) => item.path === path)).filter((item): item is SkillOption => Boolean(item)));
const completionSuggestion = computed(() => {
  const skill = activeSkillOptions.value.at(-1);
  if (!skill) return "";
  const suggestions: Record<string, string> = {
    "短剧工作流": `使用「${skill.name}」从创意梳理到可执行成片方案，先向我确认缺失的关键信息。`,
    "文学写作": `根据我的描述完成${skill.name}，强化人物目标、冲突升级与情绪节奏。`,
    "导演叙事": `根据我的故事使用${skill.name}设计镜头语言、调度、节奏与情绪表达。`,
    "视觉风格": `根据我的描述使用${skill.name}建立统一的构图、色彩、光影与材质风格。`,
  };
  return suggestions[skill.group] || `根据我的描述使用「${skill.name}」完成创作，并给出可直接使用的结果。`;
});
const cyclePrompts = [
  "帮我画一组卡通 IP 形象设计",
  "为品牌设计一套高级感视觉识别",
  "生成一支 60 秒电影感短片分镜",
  "做一张适合电商首页的产品主视觉",
  "设计一个东方奇幻世界观和角色设定",
];
const cyclePromptIndex = ref(0);
const cyclePrompt = computed(() => cyclePrompts[cyclePromptIndex.value]);
const cyclePromptText = ref(cyclePrompts[0]);
let cyclePromptPhase: "typing" | "holding" | "deleting" = "typing";
let cyclePromptTimer: number | undefined;
const filteredSkills = computed(() => {
  const keyword = skillKeyword.value.trim().toLowerCase();
  const sourceItems = skillOptions.value.filter((item) => item.source === skillTab.value);
  return keyword ? sourceItems.filter((item) => `${item.name} ${item.group} ${item.desc}`.toLowerCase().includes(keyword)) : sourceItems;
});
function persistSelectedSkills() { try { localStorage.setItem(selectedSkillsKey.value, JSON.stringify(selectedSkills.value)); } catch {} }
function toggleSkill(path: string) {
  const removing = selectedSkills.value.includes(path);
  selectedSkills.value = removing ? selectedSkills.value.filter((item) => item !== path) : [...selectedSkills.value, path].slice(-4);
  persistSelectedSkills();
  if (!removing) {
    showSkillPicker.value = false;
    nextTick(() => taRef.value?.focus());
  }
}
function clearSelectedSkills() { selectedSkills.value = []; persistSelectedSkills(); }
function updateSkillPickerHeight() {
  const triggerTop = skillButtonRef.value?.getBoundingClientRect().top ?? window.innerHeight;
  skillPickerHeight.value = Math.min(520, Math.max(160, Math.floor(triggerTop - 24)));
}
function toggleSkillPicker() {
  if (showSkillPicker.value) {
    showSkillPicker.value = false;
    return;
  }
  showAssetMenu.value = false;
  openSetting.value = null;
  updateSkillPickerHeight();
  showSkillPicker.value = true;
}
function toggleAssetMenu() {
  const nextOpen = !showAssetMenu.value;
  showSkillPicker.value = false;
  openSetting.value = null;
  showAssetMenu.value = nextOpen;
}
async function loadSkills() {
  skillsLoading.value = true;
  try {
    const [{ data }, market, catalogResponse] = await Promise.all([
      axios.post<string[]>("/setting/skillManagement/getSkillList"),
      axios.get<{ items: any[]; installedIds: string[] }>("/skills?tab=market").catch(() => null),
      fetch("/skill-market/catalog.json", { cache: "no-store" }).catch(() => null),
    ]);
    const files = Array.isArray(data) ? data : [];
    const installed = JSON.parse(localStorage.getItem(installedSkillsKey.value) || "[]");
    const installedMeta = Array.isArray(installed) ? [...installed] : [];
    const catalog = catalogResponse?.ok ? await catalogResponse.json().catch(() => ({ data: [] })) : { data: [] };
    const sources = [...(market?.data?.items ?? []), ...(Array.isArray(catalog?.data) ? catalog.data : [])];
    for (const id of market?.data?.installedIds ?? []) {
      const path = `community/${id}.md`;
      if (!files.includes(path) || installedMeta.some((item: any) => item?.path === path)) continue;
      const source = sources.find((item: any) => String(item?.id ?? item?.skill_id) === id);
      installedMeta.push({ id, path, name: String(source?.name ?? normalizeSkillName(path)), kind: "市场技能", desc: String(source?.description ?? "来自 Skill 市场的创作技能"), emoji: "🧩" });
    }
    localStorage.setItem(installedSkillsKey.value, JSON.stringify(installedMeta));
    const installedMap = new Map<string, any>(installedMeta.map((item: any) => [item.path, item]));
    const installedPaths = new Set(installedMap.keys());
    const uniqueNames = new Set<string>();
    const mine = files.filter((path) => {
      const meta = installedMap.get(path);
      const name = meta?.name || normalizeSkillName(path);
      if (!installedPaths.has(path) || !/\.md$/i.test(path) || uniqueNames.has(name)) return false;
      uniqueNames.add(name);
      return true;
    }).slice(0, 60).map((path, index): SkillOption => { const meta = installedMap.get(path); const group = meta?.kind || (path.includes("/") ? path.split("/")[0].replace(/[_-]+/g, " ") : "通用创作"); return { path, name: meta?.name || normalizeSkillName(path), group, desc: meta?.desc || `${group}创作工作流，可在当前对话中搭配使用`, emoji: meta?.emoji || skillEmoji[index % skillEmoji.length], source: "mine" }; });
    skillOptions.value = [...generalSkills, ...mine];
    const saved = JSON.parse(localStorage.getItem(selectedSkillsKey.value) || "[]");
    if (Array.isArray(saved)) selectedSkills.value = saved.filter((path) => generalSkills.some((skill) => skill.path === path) || (files.includes(path) && installedPaths.has(path))).slice(0, 4);
  } catch { skillOptions.value = [...generalSkills]; } finally { skillsLoading.value = false; }
}
loadSkills().then(() => { if (route.query.skills === "1") showSkillPicker.value = true; });
watch(userId, () => {
  selectedSkills.value = [];
  skillOptions.value = [];
  void loadSkills();
});
function closeSkillPickerOnOutside(event: PointerEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (showSkillPicker.value && !skillPickerRef.value?.contains(target) && !skillButtonRef.value?.contains(target)) showSkillPicker.value = false;
  const element = target instanceof Element ? target : null;
  if (showAssetMenu.value && !element?.closest(".assetMenu,.assetTrigger")) showAssetMenu.value = false;
  if (openSetting.value && !element?.closest(".settingMenu,.settingPill")) openSetting.value = null;
}
onMounted(() => document.addEventListener("pointerdown", closeSkillPickerOnOutside));
onMounted(() => window.addEventListener("message", handleAssetPickerMessage));
onMounted(() => window.addEventListener("resize", updateSkillPickerHeight));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeSkillPickerOnOutside));
onBeforeUnmount(() => window.removeEventListener("message", handleAssetPickerMessage));
onBeforeUnmount(() => window.removeEventListener("resize", updateSkillPickerHeight));
onMounted(preloadBannerImages);
function scheduleCyclePrompt(delay = 60) {
  cyclePromptTimer = window.setTimeout(runCyclePrompt, delay);
}
function runCyclePrompt() {
  if (inputValue.value || status.value !== "idle" || document.hidden || completionSuggestion.value) {
    scheduleCyclePrompt(240);
    return;
  }
  const target = cyclePrompt.value;
  if (cyclePromptPhase === "typing") {
    cyclePromptText.value = target.slice(0, cyclePromptText.value.length + 1);
    if (cyclePromptText.value === target) {
      cyclePromptPhase = "holding";
      scheduleCyclePrompt(1800);
    } else scheduleCyclePrompt(62);
    return;
  }
  if (cyclePromptPhase === "holding") {
    cyclePromptPhase = "deleting";
    scheduleCyclePrompt(45);
    return;
  }
  cyclePromptText.value = cyclePromptText.value.slice(0, -1);
  if (!cyclePromptText.value) {
    cyclePromptIndex.value = (cyclePromptIndex.value + 1) % cyclePrompts.length;
    cyclePromptPhase = "typing";
    scheduleCyclePrompt(320);
  } else scheduleCyclePrompt(34);
}
onMounted(() => scheduleCyclePrompt(180));
onBeforeUnmount(() => cyclePromptTimer && window.clearTimeout(cyclePromptTimer));

// ----- 会话内存态 -----
const messages = ref<Message[]>([]);
const conversations = ref<Conversation[]>([]);
const activeId = ref<number | null>(null);
const seqCounter = ref(0);
// Page N 徽章标号·静态装饰(R6 多 tab 隔离与跨次持久化属 C 方案边界本期不做真实联动)
const pageNumber = ref(1);
function genTitle(seed?: string) {
  return seed?.slice(0, 20)?.replace(/\s+/gim, "") ?? "";
}
const activeSessionTitle = computed(() => {
  if (!messages.value.length) {
    // 「第 N 个」反映已归档到 conversations 数组里的往期会话条数 + 正在新建这一张,自然随使用增长;
    // 弃用 seqCounter 作基数因其量纲极易被恢复期错误注入(如他曾尝试 push Date.now id 进去)
    // 渲染成长达十几位的怪异长串。固定锚定 conversations.length 才稳。
    return `第 ${(conversations.value?.length || 0) + 1} 个空白画布`;
  }
  return (
    conversations.value.find((c) => c.id === activeId.value)?.title ||
    messages.value.find((m) => m.role === "user")?.content.slice(0, 22) ||
    "进行中的对话"
  );
});

// ----- 浅档历史 · 本地 localStorage 兜底(R6 内存态升级版:同设备跨刷新保 · 换号靠 JWT uid 分桶隔离互不可见)-----
// 协议守稳(R3):0 后端改动、chat.ts handler 一行不动;sessions 仅在前端给既有内存 ref[] 叠一份序列化镜像存入浏览器。
const SESSIONS_BASE_KEY = "xo_assistant_sessions_v1";
const SESSION_MAX_KEEP = 20;              // 容量上限超则弃最旧条防长期累积撑破 5MB localStorage 配额
const SESSION_PERSIST_DEBOUNCE_MS = 320;  // debounce 窗口合并高频流式增量追加避免逐字触发写盘抖动

interface PersistedMessageLite {           // 仅留三核字段 strip 掉 streaming/pending/error transient 态防恢复后现假性进行中气泡
  id?: string;
  role: "assistant" | "user";
  content: string;
}
interface PersistedSessionLite {
  id: number;
  title: string;
  msgs: PersistedMessageLite[];
}

// 从本仓 token 解 JWT payload 取 uid 作命名空间后缀实现「换号互不可见」语义;
// token 缺失/格式破损/chat.ts auth-optional 匿名场景降级共享 anon 桶不阻断聊天主线。
function sessionBucketKey(): string {
  let uid = "anon";
  try {
    const tk = typeof localStorage !== "undefined" ? localStorage.getItem("token") || "" : "";
    const seg = tk.split(".")[1];
    if (seg && /^[A-Za-z0-9_-]+$/.test(seg)) {
      // base64url → base64 → 正确 UTF-8 文本(payload 含中文 name 不能裸用 atob 否则乱码但不影响取数字 id 此处仍走严谨解码保险)
      const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
      const jsonStr = decodeURIComponent(
        escape(atob(b64)) /* legacy byte-string bridge 仍广泛支持且兼容旧版 Safari */
      );
      const pld = JSON.parse(jsonStr);
      if (pld?.id != null) uid = String(pld.id);
    }
  } catch {/* decode 失败静默降级 anon */}
  return `${SESSIONS_BASE_KEY}:${uid}`;
}

let __persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (__persistTimer != null) clearTimeout(__persistTimer);
  __persistTimer = setTimeout(() => {
    __persistTimer = null;
    try {
      const liteArr: PersistedSessionLite[] =
        [...conversations.value]
          .slice(-SESSION_MAX_KEEP)
          .map((c) => ({
            id: c.id,
            title: c.title || "",
            msgs: c.messages.map<PersistedMessageLite>((m) => ({
              id: m.id,
              role: m.role,
              content: m.content ?? "",     // abort 中途 content 可能 undefined → 兜底空串避 JSON.stringify 输出 undefined 致 NaN 行为
            })),
          }));
      localStorage.setItem(sessionBucketKey(), JSON.stringify(liteArr));
    } catch {/* quota-exceeded / 序列化失败 静默放弃此次落盘 UI 主线不受损 */}
  }, SESSION_PERSIST_DEBOUNCE_MS);
}

function restorePersistedSessions(): void {
  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(sessionBucketKey()) || "" : "";
    if (!raw) return;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return;
    const restored: Conversation[] = [];
    for (const s of arr as Array<Record<string, unknown>>) {
      if (!s || typeof s !== "object") continue;
      const sid = typeof s["id"] === "number" ? (s["id"] as number) : ++seqCounter.value;
      const srcMsgs = Array.isArray(s["msgs"]) ? (s["msgs"] as Array<Record<string, unknown>>) : [];
      const msgs: Message[] = srcMsgs.map((m) => ({
        id: m?.["id"] != null ? String(m["id"]) : String(Math.random()),
        role: m?.["role"] === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m?.["content"] ?? ""),
        status: "complete",               // 恢复一律置终态即便原曾 streaming 也视作已结束免卡死动画占位符
      }));
      restored.push({
        id: sid,
        title: s["title"] ? String(s["title"]) : "(无标题)",
        messages: msgs,
      });
    }
    if (!restored.length) return;
    conversations.value = restored;
    // ⚠️ 显式 NOT 推进 seqCounter ——[index.vue L386] 新 Conversation 的 id 实际取自 Date.now()
    //   而 non-dependent 于 ++seqCounter,故此处无需调整它;
    //   若按早前设想跑 Math.max(restored.map(c=>c.id)) 会把 Date.now 量级的十万亿级大整数灌进
    //   seqCounter,经下方 activeSessionTitle 渲染出「第 178691500xxxxx 个空白画布」这种荒谬长串。
    //   seqCounter 维持自身小计数量纲供标题文案正常即可。
    // 用户自行展开右上角历史抽屉点击某条 view-back 回填输入框查看往期文字(view-back = 展示复刻非真接续上下文,R3 SSE body messages[] 由 handleSend 当场组历史10条发服务端不受抽屉切换影响)。
  } catch {/* 数据损坏/schema 漂移反序列化失败 静默退化为空白画布默认态 */}
}
restorePersistedSessions();

// ----- 编辑器/SSE 流式核心(沿用原 handler,协议字段零变动)-----
const inputValue = ref("");
type ComposerAttachment = { id: string; name: string; type: string; size: number; dataUrl: string };
const attachmentInputRef = ref<HTMLInputElement | null>(null);
const composerAttachments = ref<ComposerAttachment[]>([]);

function readComposerFile(file: File): Promise<ComposerAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

async function onComposerFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  if (!files.length) return;
  const allowed = files.filter((file) => /^(image|video|audio)\//.test(file.type));
  const total = allowed.reduce((sum, file) => sum + file.size, 0);
  if (total > 4 * 1024 * 1024) {
    MessagePlugin.warning("为确保素材能完整发送到画布，单次附件总大小请控制在 4MB 内");
    return;
  }
  try {
    composerAttachments.value.push(...await Promise.all(allowed.map(readComposerFile)));
    if (allowed.length !== files.length) MessagePlugin.info("当前支持图片、视频和音频素材");
  } catch {
    MessagePlugin.error("附件读取失败，请重新选择");
  }
}

function removeComposerAttachment(id: string) {
  composerAttachments.value = composerAttachments.value.filter((file) => file.id !== id);
}

function openAssetPicker() {
  showAssetMenu.value = false;
  assetPickerKey.value += 1;
  showAssetPicker.value = true;
}

function closeAssetPicker() {
  showAssetPicker.value = false;
}

function handleAssetPickerMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "xoi:asset-picker-close") {
    closeAssetPicker();
    return;
  }
  if (data.type !== "xoi:asset-picker-insert" || !data.payload) return;
  const payload = data.payload as { kind?: string; title?: string; content?: string; dataUrl?: string; url?: string };
  if (payload.kind === "text" && payload.content) {
    inputValue.value = inputValue.value ? `${inputValue.value}\n${payload.content}` : payload.content;
  } else if (payload.kind === "image" && payload.dataUrl) {
    composerAttachments.value = [...composerAttachments.value, {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: payload.title || "画布图片素材",
      type: "image/*",
      size: 0,
      dataUrl: payload.dataUrl,
    }].slice(-4);
  } else if (payload.kind === "video" && payload.url) {
    composerAttachments.value = [...composerAttachments.value, {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: payload.title || "画布视频素材",
      type: "video/*",
      size: 0,
      dataUrl: payload.url,
    }].slice(-4);
  }
  closeAssetPicker();
  nextTick(() => taRef.value?.focus());
}

function applyDraftFromRoute() {
  const draft = route.query.draft;
  if (typeof draft === "string") inputValue.value = draft;
}

applyDraftFromRoute();
watch(() => route.query.draft, applyDraftFromRoute);
const status = ref<"idle" | "pending" | "streaming">("idle");
const taRef = ref<HTMLTextAreaElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
const mainRef = ref<HTMLElement | null>(null);
let abortController: AbortController | null = null;

const savedSnapshotOfMessages = (): Message[] => JSON.parse(JSON.stringify(messages.value));

function pickPrompt(text: string) {
  inputValue.value = text;
  nextTick(() => taRef.value?.focus());
}

// 滚动到底部(mainScroll 与 messageList 共享滚动容器,统一操作 mainRef)
function scrollToBottom() {
  nextTick(() => {
    if (mainRef.value) mainRef.value.scrollTop = mainRef.value.scrollHeight;
  });
}

// Markdown 简易格式化(同原件 verbatim)
function formatMessage(content: string): string {
  if (!content) return "";
  return content.trim()
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// 复制助手回复·所见即所得纯文本优先(md 星号会污染普通粘贴场景),
// DOM 缺失时退回原始 md 源兜底;navigator.clipboard 不可用时降级 execCommand('copy') 兼容 http / 受限环境(devConfig.vue 同款套路)
function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackExec(text));
  }
  return Promise.resolve(fallbackExec(text));
}
function fallbackExec(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
async function handleMsgCopy(msg: Message, e: MouseEvent) {
  // 从当前气泡内取已渲染的可见文本(br/pre 自然映射成换行·保留分段结构),保证贴出去干净不夹 md 符号
  const node = (e.currentTarget as HTMLElement)?.closest(".messageBubble")?.querySelector<HTMLElement>(".messageContent");
  const text = (node?.innerText ?? msg.content ?? "").trim();
  if (!text) return;
  const ok = await writeClipboard(text);
  copiedId.value = ok ? msg.id : null;
  MessagePlugin.info({ content: ok ? "已复制本条回复" : "复制失败·请手动选取", duration: 1500 });
  window.setTimeout(() => {
    if (copiedId.value === msg.id) copiedId.value = null;
  }, 1800);
}

// 发送(HTTP SSE 流式)— 原 endpoint/body 字段契约完全保留
async function handleSend() {
  if (!inputValue.value.trim() || status.value !== "idle") return;
  openCanvasWithPrompt();
}

function handleStop() {
  abortController?.abort();
}

function syncCurrentIntoActiveConv(snapshot: Message[]) {
  if (activeId.value == null) return;
  const cv = conversations.value.find((x) => x.id === activeId.value);
  if (cv) {
    cv.messages = snapshot;
    // 任一活跃对话内容更替后即刻排程落盘(debounce 合并连续流式追加单次写盘节流);
    // 与下方 clearConversations 内显式 removeItem 双出口共同覆盖所有 mutation 路径达成同设备跨刷新保留语义。
    schedulePersist();
  }
}

// ----- 会话管理动作 -----
function newConversation() {
  // 当前若有完整完成的消息则先把它们归档好(便于稍后从历史里看回来),然后开启新的一张空白
  if (activeId.value != null) {
    syncCurrentIntoActiveConv(savedSnapshotOfMessages());
  }
  messages.value = [];
  activeId.value = null;
  showHistory.value = false;
  nextTick(() => taRef.value?.focus());
}

function switchConversation(id: number) {
  const cv = conversations.value.find((x) => x.id === id);
  if (!cv) return;
  // 先存住当前活跃对话最新进度再做视图替换(view-back 行为:展示历史不代表真接续上下文)
  syncCurrentIntoActiveConv(savedSnapshotOfMessages());
  activeId.value = id;
  messages.value = JSON.parse(JSON.stringify(cv.messages));
  showHistory.value = false;
  scrollToBottom();
}

function clearConversations() {
  conversations.value = [];
  activeId.value = null;
  messages.value = [];
  // 同步清掉浅档历史 localStorage 桶避免刷新后又冒出来与刚清空的内存态不一致
  try { localStorage.removeItem(sessionBucketKey()); } catch {}
  MessagePlugin.success("已清空历史会话");
}

// ----- 执行模式 Pill · 「询问 ⇄ 自动」localStorage 记忆(handler ignore 待二代真分支 system prompt)-----
type ExecMode = "询问" | "自动";
const EXEC_KEY = "xo_assistant_exec_mode";
const initExecRaw =
  typeof localStorage !== "undefined" ? localStorage.getItem(EXEC_KEY) : null;
const execMode = ref<ExecMode>((initExecRaw === "询问" || initExecRaw === "自动") ? initExecRaw : "自动");
const imageSizes = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"];
const imageQualities = ["自动", "高", "中", "低"];
const videoQualities = ["720p", "480p", "1080p"];
const videoSizeOptions = [
  { value: "横屏", label: "1280x720", shape: "wide" }, { value: "竖屏", label: "720x1280", shape: "tall" }, { value: "方形", label: "960x960", shape: "square" },
  { value: "标准横屏", label: "1112x834", shape: "standard-wide" }, { value: "标准竖屏", label: "834x1112", shape: "standard-tall" }, { value: "宽银幕", label: "1470x630", shape: "cinema" },
];
const imageSize = ref("1:1");
const imageQuality = ref("自动");
const videoSize = ref("横屏");
const videoQuality = ref("720p");
const alignImageSize = ref(true);
const qualityPixels: Record<string, number> = { 自动: 1024, 高: 2048, 中: 1024, 低: 512 };
const imageDimensions = computed(() => {
  const [rw, rh] = imageSize.value.split(":").map(Number);
  const base = qualityPixels[imageQuality.value] || 1024;
  let width = rw >= rh ? base : Math.round(base * rw / rh);
  let height = rh >= rw ? base : Math.round(base * rh / rw);
  if (alignImageSize.value) { width = Math.max(16, Math.round(width / 16) * 16); height = Math.max(16, Math.round(height / 16) * 16); }
  return { width, height };
});
const videoDimensions = computed(() => {
  const option = videoSizeOptions.find((item) => item.value === videoSize.value) || videoSizeOptions[0];
  let [width, height] = option.label.split("x").map(Number);
  if (videoQuality.value === "480p") { const scale = 480 / Math.min(width, height); width = Math.round(width * scale); height = Math.round(height * scale); }
  if (videoQuality.value === "1080p") { const scale = 1080 / Math.min(width, height); width = Math.round(width * scale); height = Math.round(height * scale); }
  return { width, height };
});
function ratioPreviewStyle(value: string) {
  const [width, height] = value.split(":").map(Number);
  return { aspectRatio: `${width}/${height}` };
}
const reasoningEnabled = ref(false);
const openSetting = ref<"image" | "video" | null>(null);
function openComposerSetting(kind: "image" | "video") {
  showAssetMenu.value = false;
  showSkillPicker.value = false;
  openSetting.value = openSetting.value === kind ? null : kind;
}
function toggleExecMode() {
  execMode.value = execMode.value === "询问" ? "自动" : "询问";
  try { localStorage.setItem(EXEC_KEY, execMode.value); } catch {}
  MessagePlugin.info(`已切到${execMode.value}模式`);
}

// ----- 模型 Pill · 复用 ModelSelect 选完即显本地存储(label=value pair)-----
const MODEL_VAL_KEY = "xo_assistant_model_value";
const MODEL_LBL_KEY = "xo_assistant_model_label";
const selectedModelValue = ref<string>(
  typeof localStorage !== "undefined" ? localStorage.getItem(MODEL_VAL_KEY) || "" : "",
);
const selectedModelLabel = ref<string>(
  typeof localStorage !== "undefined" ? localStorage.getItem(MODEL_LBL_KEY) || "" : "",
);
const selectedModelName = computed(() => String(selectedModelValue.value || "").split(/:(.+)/)[1] || String(selectedModelValue.value || ""));
const defaultTextModel = ref("");
const defaultImageModel = ref("");
const defaultVideoModel = ref("");
const showBillingGuide = ref(false);

async function loadCreationDefaults() {
  try {
    const response = await fetch("/api/config", { headers: { Authorization: localStorage.getItem("token") || "" } });
    if (!response.ok) return;
    const config = await response.json();
    defaultTextModel.value = String(config?.chat_model || config?.chat_models?.[0] || "");
    defaultImageModel.value = String(config?.image_model || config?.image_models?.[0] || "");
    defaultVideoModel.value = String(config?.video_model || config?.video_models?.[0] || "");
    if (!selectedModelValue.value && defaultTextModel.value) {
      selectedModelValue.value = `newapi:${defaultTextModel.value}`;
      selectedModelLabel.value = defaultTextModel.value;
      onPickModel(selectedModelValue.value);
    }
  } catch {
    // 默认模型读取失败不阻断创作，模型选择器仍可单独加载。
  }
}
onMounted(loadCreationDefaults);
function onPickModel(value: string /* , _detail?: any */) {
  try {
    localStorage.setItem(MODEL_VAL_KEY, value);
    localStorage.setItem(MODEL_LBL_KEY, String(selectedModelLabel.value || ""));
  } catch {}
  // 注:B 方案下选中值只作客户端偏好,body 不附 modelHint 以彻底保全 chat.ts 向后兼容性;
  // 未来欲真生效仅需在此追加 axios.post('/setting/agentDeploy/updateAgentModel',{key:'universalAi-test',modelName:value}) 走测试位
}

// ----- 杂项 UI state/action -----
const showHistory = ref(false);
/*
 * focusMode 由全局 uiPrefs.aiAssistantChromeVisible 反向派生而非独立 ref，
 * 使 layouts/WorkbenchLayout.topMenu 与本地面板伪工具条共享同一份 reactive state 同步联动：
 *   chromeVisible=false ⇨ focusMode=true ⇨ 进入即是纯净沉浸(panelHeader 收起 & 外层 topMenu 隐藏)
 *   chromeVisible=true  ⇨ focusMode=false ⇨ 双层 chrome 回归便于跳转 项目列表/画布/定价等兄弟模块。
 * 写入经 setter 统一走 store.toggleAiAssistantChrome()，杜绝旧版那种「切换钮藏在会被自己关掉的 header 子树里、
 * 进了沉浸就再也点不到它」的自陷死锁缺陷（退出动作改由底部恒驻 ExitBtn 承担，详见 composerToolbar meta 底行）。
 */
const focusMode = computed({
  get: () => !uiPrefs.aiAssistantChromeVisible,
  set: () => uiPrefs.toggleAiAssistantChrome(),
});
const copiedId = ref<string | null>(null);

function toastRoadmap(featureName: string, extraNote = "") {
  const suffix = extraNote ? `\n${extraNote}` : "";
  MessagePlugin.info({
    content: `${featureName} 即将开放敬请期待${suffix}`,
    duration: 2200,
  });
}

function autogrowTextarea() {
  const el = taRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}
function focusComposer() {
  if (status.value === "pending" || status.value === "streaming") return;
  const editor = taRef.value;
  editor?.focus();
  // 空输入时，视觉上的 Tab 提示占据前缀位置；真实输入仍从第一个字符开始。
  if (editor && !inputValue.value) editor.setSelectionRange(0, 0);
}
function acceptSkillCompletion() {
  if (!completionSuggestion.value || inputValue.value) return;
  inputValue.value = completionSuggestion.value;
  nextTick(() => { autogrowTextarea(); taRef.value?.focus(); });
}
function acceptCyclePrompt() {
  if (completionSuggestion.value) return acceptSkillCompletion();
  inputValue.value = cyclePrompt.value;
  nextTick(() => { autogrowTextarea(); taRef.value?.focus(); });
}
function handleSkillTab(event: KeyboardEvent) {
  if (!inputValue.value && completionSuggestion.value) {
    event.preventDefault();
    acceptSkillCompletion();
  } else if (!inputValue.value) {
    event.preventDefault();
    acceptCyclePrompt();
  }
}
function handleComposerBackspace(event: KeyboardEvent) {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  if (textarea.selectionStart !== 0 || textarea.selectionEnd !== 0) return;
  if (composerAttachments.value.length) {
    event.preventDefault();
    removeComposerAttachment(composerAttachments.value.at(-1)!.id);
    return;
  }
  if (!selectedSkills.value.length) return;
  event.preventDefault();
  toggleSkill(selectedSkills.value[selectedSkills.value.length - 1]);
}
function handleComposerDelete(event: KeyboardEvent) {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  if (textarea.selectionStart !== textarea.selectionEnd || textarea.selectionStart !== textarea.value.length) return;
  if (composerAttachments.value.length) {
    event.preventDefault();
    removeComposerAttachment(composerAttachments.value.at(-1)!.id);
    return;
  }
  if (selectedSkills.value.length) {
    event.preventDefault();
    toggleSkill(selectedSkills.value[selectedSkills.value.length - 1]);
  }
}

const defaultPromptCards = [
  { title: "帮我写剧本开头", desc: "三幕式开场范例·人物地点冲突一句话立起来", prompt: "帮我把一部都市情感短剧的开场戏写得有张力,要求第一镜出现钩子。" },
  { title: "脑暴故事灵感", desc: "同一题材给出三种截然不同的展开走向供挑选", prompt: "围绕\"深夜便利店相遇\",为我提供三条差异化的剧情发展方向简述各自看点。" },
  { title: "生成角色设定", desc: "性别年龄职业性格背景欲望弧光一套档案", prompt: "为一部校园悬疑短剧的主角设计一份详尽的角色设定卡片包含外貌内在矛盾成长弧光。" },
] as const;
const inspirationPromptCards = [
  { title: "反常规人物关系", desc: "让最不可能并肩的人被迫共同完成一件事", prompt: "设计一个反常规的双主角关系：两人立场完全对立，却必须在24小时内共同完成同一目标。给出人物、冲突和三次关系反转。" },
  { title: "一分钟高能开场", desc: "用一个视觉奇观和一个秘密立刻抓住观众", prompt: "为一部悬疑短剧写60秒高能开场：前10秒出现视觉钩子，30秒揭露一个秘密，结尾留下必须点下一集的悬念。" },
  { title: "东方奇幻世界观", desc: "从一条独特规则长出完整故事世界", prompt: "以“人的影子会替主人保守秘密”为核心规则，设计一个东方奇幻世界观，包括社会秩序、职业、禁忌与主线冲突。" },
  { title: "品牌微电影", desc: "把产品价值藏进人物选择，而不是硬广", prompt: "为一个年轻化生活方式品牌构思3分钟微电影，产品只作为人物行动中的关键道具出现，主题关于重新出发。" },
  { title: "角色视觉设定", desc: "从性格、经历推导服装、色彩与标志物", prompt: "为一个表面温柔、实际极有控制欲的女性角色做视觉设定：轮廓、服装、材质、配色、发型、标志物和镜头表现。" },
  { title: "同题三种风格", desc: "电影感、轻喜剧、赛博寓言一次比较", prompt: "围绕“凌晨三点收到来自未来的外卖”这个命题，分别用电影感悬疑、都市轻喜剧、赛博寓言写三个故事梗概。" },
] as const;
const promptCards = computed(() => inspirationMode.value ? inspirationPromptCards : defaultPromptCards);
type InspirationItem = { title:string; category:string; image:string; prompt:string; detailIndex:number };
const inspirationPool: InspirationItem[] = [
  { title:"城市电影感",category:"影视与分镜",image:inspirationCinematic,detailIndex:5,prompt:"为雨夜城市题材微短剧设计一段电影感开场，用霓虹、倒影和人物动作推进情绪，输出分镜表。" },
  { title:"都市心动故事",category:"摄影短片",image:inspirationUrban,detailIndex:6,prompt:"构思一部成熟都市情感短剧，用暖色摄影和人物空间距离表现关系变化，给出角色与前3集钩子。" },
  { title:"青春窗边",category:"摄影短片",image:inspirationAnime,detailIndex:3,prompt:"策划一支窗边自然光风格的青春短片，使用日系胶片质感，给出60秒剧情和逐镜头拍摄方案。" },
  { title:"新国潮品牌视觉",category:"品牌与广告",image:inspirationGuochao,detailIndex:11,prompt:"为年轻消费品牌设计新国潮视觉系统，把东方符号转成现代二维语言，输出 Logo、色彩、图形和海报方向。" },
  { title:"黏土奇遇记",category:"影视与分镜",image:inspirationClay,detailIndex:8,prompt:"策划一支黏土定格动画短片，突出手作纹理和微缩布景，输出故事梗概、角色和12镜分镜。" },
  { title:"月下国潮幻想",category:"东方美学",image:inspirationFantasy,detailIndex:4,prompt:"设计一张月下国潮幻想海报，把传统纹样、神兽和超现实空间结合，给出构图、配色、材质和生成提示词。" },
  { title:"赛博国风世界",category:"东方美学",image:inspirationGuofeng,detailIndex:13,prompt:"搭建一个赛博国风短剧世界，将古典建筑、数字霓虹和机械角色融合，输出世界观、角色和首集分镜。" },
  { title:"三维动画角色",category:"角色与 IP",image:inspirationCyber,detailIndex:9,prompt:"设计一个适合商业动画的3D角色 IP，给出体块语言、配色、表情、动作和衍生品方向。" },
];
const inspirationItems = ref<InspirationItem[]>([]);
function shuffleInspirations() {
  const shuffled = [...inspirationPool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  inspirationItems.value = shuffled;
}
shuffleInspirations();
function useInspiration(prompt: string) {
  inputValue.value = prompt;
  nextTick(() => { autogrowTextarea(); taRef.value?.focus(); taRef.value?.scrollIntoView({ behavior: "smooth", block: "center" }); });
}

// 注:baseUrl 经 storeToRefs 解构后用于 handleSend 的 SSE URL `${baseUrl.value.replace("/api","")}/api/aiAssistant/chat/stream`,
//    不需要额外 void 占位语句(会引入 unused 表达式告警)。
</script>

<style lang="scss" scoped>
.aiAssistant {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
  --sidebar-w: clamp(280px, 30vw, 360px);
}
.assistantPanel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  box-sizing: border-box;
}
.skillPicker{position:absolute;z-index:45;left:14px;bottom:155px;display:flex;flex-direction:column;width:min(540px,calc(100% - 28px));height:min(421px,calc(100vh - 230px));padding:8px;box-sizing:border-box;overflow:hidden;border:1px solid rgba(0,0,0,.1);border-radius:18px;background:rgba(255,255,255,.97);box-shadow:0 18px 48px rgba(23,23,28,.16);backdrop-filter:blur(20px)}
.skillSearchRow{display:flex;align-items:center;gap:7px;height:42px;flex:none;padding:0 13px;border-radius:13px;background:#f1f1f1;color:#858585;font-size:19px}.skillSearchRow input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#252525;font:400 15px/1.4 Inter,"PingFang SC",sans-serif}.skillSearchRow input::placeholder{color:#858585}.skillSearchRow input::-webkit-search-cancel-button{display:none}.skillSectionLabel{height:42px;padding:17px 13px 0;box-sizing:border-box;color:#b6b6b6;font-size:13px}.skillList{min-height:0;flex:1;overflow-y:auto;padding-right:2px;scrollbar-width:thin}.skillOption{display:flex;align-items:center;width:100%;height:38px;gap:8px;padding:0 13px;border:0;border-radius:11px;background:transparent;color:#222;text-align:left;cursor:pointer;transition:background .15s ease}.skillOption:hover,.skillOption.selected{background:#f0f0f0}.skillGlyph{display:grid;place-items:center;width:20px;flex:none;font-size:16px;filter:grayscale(1)}.skillCopy{display:flex;align-items:baseline;min-width:0;flex:1;gap:7px}.skillCopy strong{flex:none;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;letter-spacing:.01em}.skillCopy small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#929292;font-size:13px}.skillOfficial{flex:none;color:#aaa;font-size:12px}.skillOption.selected .skillOfficial{color:#ff7417}.skillPickerDivider{height:1px;flex:none;margin:8px -8px;background:#e8e8e8}.skillPickerActions{position:relative;display:flex;flex-direction:column;flex:none}.skillPickerActions a,.skillPickerActions button{display:flex;align-items:center;gap:9px;height:38px;padding:0 13px;border:0;border-radius:11px;background:transparent;color:#222;text-decoration:none;font-size:14px;cursor:pointer}.skillPickerActions a:hover,.skillPickerActions button:hover{background:#f1f1f1}.skillPickerActions svg{font-size:17px}.actionArrow{margin-left:auto;color:#888}.skillPickerActions .clearSkills{position:absolute;right:6px;bottom:0;height:38px;color:#999;font-size:12px}.skillEmpty{flex:1;padding:34px;text-align:center;color:var(--text-tertiary,#999);font-size:13px}.activeSkills{grid-column:1/-1;display:flex;align-items:center;gap:7px;overflow-x:auto;padding:0 2px 8px}.activeSkillsLabel{flex:none;color:var(--text-tertiary,#8b9099);font-size:11px}.activeSkills button{display:inline-flex;align-items:center;gap:5px;flex:none;padding:5px 9px;border:1px solid rgba(255,122,26,.2);border-radius:999px;background:rgba(255,122,26,.08);color:#d85d00;font-size:11px;cursor:pointer}.skillButton{position:relative}.skillButton.active{color:#ff7417;background:#fff0e7}.skillCount{position:absolute;right:-3px;top:-4px;display:grid;place-items:center;min-width:15px;height:15px;padding:0 3px;border-radius:9px;background:#ff7417;color:#fff;font-size:9px;font-weight:700}.skill-pop-enter-active,.skill-pop-leave-active{transition:.18s cubic-bezier(.16,1,.3,1);transform-origin:left bottom}.skill-pop-enter-from,.skill-pop-leave-to{opacity:0;transform:translateY(8px) scale(.98)}
@media(max-width:720px){.skillPicker{left:8px;bottom:150px;width:calc(100% - 16px)}.skillCopy strong{max-width:48%}}

/* ===== HeaderBar ===== */
.panelHeader {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 4px 10px;
  border-bottom: 1px solid rgba(120, 120, 140, 0.08);
}
.projectRow {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logoAvatar {
  width: 34px;
  height: 34px;
  object-fit: contain;
  border-radius: 50%;
  border: 1px solid rgba(120, 120, 140, 0.16);
  cursor: pointer;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
.logoAvatar:hover {
  box-shadow: 0 4px 14px rgba(102, 126, 234, 0.28);
  transform: translateY(-1px);
}
.projectTitle {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
  cursor: pointer;
  color: var(--text-primary, inherit);
  padding: 4px 6px;
  border-radius: 6px;
  transition: background 0.2s ease;
  &:hover { background: rgba(118, 75, 162, 0.06); }
}
.pageTrigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 4px 10px;
  background: transparent;
  border: none;
  border-radius: 999px;
  color: var(--text-secondary, inherit);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease;
  &:hover { background: rgba(120, 120, 140, 0.06); }
}
.sessionRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.sessionTitle {
  font-size: 13px;
  color: var(--text-secondary, inherit);
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sessionActions {
  display: inline-flex;
  gap: 4px;
}
.iconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--text-primary, #444);
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
  &:hover { background: rgba(120, 120, 140, 0.1); color: #667eea; }
}

/* ===== History Drawer ===== */
.historyDrawer {
  position: absolute;
  top: 64px;
  bottom: 168px;
  right: 16px;
  width: 320px;
  background: var(--td-bg-color-container, #ffffffcc);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(120, 120, 140, 0.12);
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
  z-index: 40;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.drawerHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid rgba(120, 120, 140, 0.08);
}
.closeBtn { border: none; background: transparent; cursor: pointer; padding: 4px; }
.conversationList {
  flex: 1;
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
}
.emptyHint {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-disabled, #aaa);
}
.conversationList li {
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.18s ease;
  &:not(:last-child) { margin-bottom: 4px; }
  &:hover { background: rgba(102, 126, 234, 0.07); }
  &.active { background: linear-gradient(135deg, rgba(0,212,255,.12), rgba(123,97,255,.12)); }
}
.cvTitle { font-size: 13px; font-weight: 600; color: var(--text-primary,#222); white-space: nowrap; overflow:hidden;text-overflow:ellipsis;}
.cvMeta { font-size: 11px; color: var(--text-disabled,#bbb); margin-top: 2px; }
.drawerFoot { padding: 8px; border-top: 1px solid rgba(120,120,140,.08);}
.clearAllBtn{display:inline-flex;gap:6px;align-items:center;border:none;background:transparent;color:#e05b5b;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;&:hover{background:rgba(255,90,90,.09);} }

/* ===== Main Scroll Area(empty-state <-> message-list fade-switcher)===== */
.mainScrollArea {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
  padding-bottom: 8px;
}
.mainScrollArea::-webkit-scrollbar { width: 6px; }
.mainScrollArea::-webkit-scrollbar-thumb { background: rgba(120,120,140,.18); border-radius: 3px;}

.emptyStage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 70%;
  padding: 40px 20px 60px;
  animation: stage-fade-in 0.45s cubic-bezier(0.16,1,0.3,1);
}
@keyframes stage-fade-in { from {opacity:0; transform:translateY(14px);} to {opacity:1; transform:none;} }
.mascotWrap { display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:24px;}
.mascotArt { width:96px;height:96px;display:block;filter:drop-shadow(0 8px 24px rgba(0,0,0,.18));}
.greetTitle { font-size: 22px; font-weight:700; margin:6px 0 2px;letter-spacing:-0.02em;line-height:1.2;}
.greetSub {font-size:13px;color:var(--text-secondary,inherit);margin:0;}
.gradient-text{
  background:linear-gradient(135deg,#00d4ff,#667eea 60%,#7b61ff);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.promptCards {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(min(220px,42vw),1fr));
  gap:12px;width:min(720px,92%);
}
.promptCard {
  background:rgba(245,245,245,.86);
  border:1px solid rgba(120,120,140,.08);
  border-radius:14px;padding:14px 16px;cursor:pointer;
  transition:all 0.25s cubic-bezier(0.16,1,0.3,1);
  &:hover{background:#EEEEEECC;transform:translateY(-2px);border-color:rgba(102,126,234,.35);box-shadow:0 10px 28px rgba(102,126,234,.14);}
}
.cardTitle{margin:0 0 6px;font-size:14px;font-weight:700;color:var(--text-primary,#111);}
.cardDesc{margin:0;font-size:12px;line-height:1.55;color:var(--text-secondary,#777);}
.cardsFootnote{margin-top:22px;font-size:11px;color:var(--text-disabled,#bbb);}

/* message-list(沿用原 bubble 体格·渐变保色不改) */
.fade-enter-active,.fade-leave-active{transition:opacity .2s ease;}
.fade-enter-from,.fade-leave-to{opacity:0;}
.slide-fade-enter-active,.slide-fade-leave-active{transition:all .28s cubic-bezier(.16,1,.3,1);}
.slide-fade-enter-from,.slide-fade-leave-to{opacity:0;transform:translateX(28px);}
.messageList{padding:18px 0 24px;}
.messageWrapper{display:flex;gap:12px;margin-bottom:22px;animation:mIn .3s cubic-bezier(.16,1,.3,1);}
.messageWrapper.user{flex-direction:row-reverse;}
@keyframes mIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
.messageAvatarImg{width:32px;height:32px;object-fit:contain;flex-shrink:0;}

/* 助手气泡尾部一键复制条·默认即常驻微显(opacity>.8 免得在浅色毛玻璃底上看漏·触屏无悬停盲区亦可见) */
.msgCopyBtn{
  margin-top:11px;padding:4px 11px;border:1px solid rgba(118,75,162,.24);border-radius:9px;
  display:inline-flex;align-items:center;gap:5px;font-size:12px;line-height:1.15;
  color:#5a6271;background-color:rgba(118,75,162,.09);cursor:pointer;opacity:.86;
  transition:opacity .18s ease,color .18s ease,border-color .18s ease,background-color .18s ease;
}
.msgCopyBtn:hover,.msgCopyBtn:focus-visible{opacity:1;color:#764ba2;border-color:#764ba2;background-color:rgba(118,75,162,.16);outline:none;}
.msgCopyBtn:active{opacity:.85;}
.messageBubble{max-width:78%;padding:13px 17px;border-radius:18px;font-size:14px;line-height:1.62;display:inline-block;word-break:break-word;}
.messageBubble.user{
  background:linear-gradient(135deg,#00d4ff,#7b61ff);color:white;border-bottom-right-radius:6px;
  box-shadow:0 4px 16px rgba(0,212,255,.3);
}
.messageBubble.assistant{
  background:rgba(245,245,245,.85);backdrop-filter:blur(10px);
  border:1px solid rgba(120,120,140,.12);color:var(--text-primary,#1d1d1d);
  border-bottom-left-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.06);
}
.messageBubble.user strong,.messageBubble.user em,.messageBubble.user code{color:#fff;}
.messageContent :deep(pre){
  background:rgba(0,0,0,.18);border-radius:10px;padding:12px;margin:8px 0;overflow-x:auto;border:1px solid rgba(120,120,140,.14);
}
.messageContent :deep(code){background:rgba(0,0,0,.08);padding:2px 7px;border-radius:6px;font-family:var(--font-mono,Menlo,monospace);font-size:13px;}
.messageContent :deep(pre code){background:none;padding:0;}
.typingIndicator{display:flex;gap:5px;margin-top:10px;}
.typingIndicator{align-items:center;gap:9px;color:#777;font-size:12px;min-height:26px;overflow:hidden}
.thinkingOrb{position:relative;display:grid;place-items:center;width:22px;height:22px;border:1px solid rgba(112,96,212,.3);border-radius:50%;background:linear-gradient(135deg,rgba(0,212,255,.18),rgba(123,97,255,.22));animation:thinking-orb 1.8s ease-in-out infinite}
.thinkingOrb:before,.thinkingOrb:after{content:"";position:absolute;border-radius:50%;border:1px solid currentColor;opacity:.45}.thinkingOrb:before{inset:4px;color:#6d5bd0;animation:thinking-ring 1.4s linear infinite}.thinkingOrb:after{inset:8px;background:#7b61ff;border:0;opacity:.8;box-shadow:0 0 8px rgba(123,97,255,.65)}
.thinkingOrb i{display:none}.thinkingText{white-space:nowrap;animation:thinking-text 1.6s ease-in-out infinite}.thinkingSweep{width:54px;height:8px;border-radius:8px;background:linear-gradient(90deg,transparent,#b8b0ea,transparent);animation:thinking-sweep 1.6s ease-in-out infinite}
@keyframes thinking-orb{0%,100%{transform:scale(.92);filter:saturate(.85)}50%{transform:scale(1.08);filter:saturate(1.3)}}
@keyframes thinking-ring{to{transform:rotate(360deg)}}
@keyframes thinking-text{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes thinking-sweep{0%{transform:translateX(-18px);opacity:0}40%{opacity:.8}100%{transform:translateX(18px);opacity:0}}
.agentPendingState{display:flex;flex-direction:column;align-items:stretch;gap:12px;width:250px;min-height:88px;padding:16px;border:1px solid #e2e2e2;border-radius:16px;background:#f5f5f5;color:#777;box-sizing:border-box}
.agentPendingTop{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:#737373}.agentPendingTop span{width:auto;height:auto;background:none;opacity:1;border-radius:0;animation:none}.agentPendingTop svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;animation:agent-loader-spin 1s linear infinite}.agentPendingProgress{height:6px;overflow:hidden;border-radius:8px;background:#ddd}.agentPendingProgress span{display:block;width:18%;height:100%;border-radius:8px;background:#292929;opacity:1;animation:agent-progress 2.5s ease-in-out infinite}@keyframes agent-loader-spin{to{transform:rotate(360deg)}}@keyframes agent-progress{0%{transform:translateX(-120%);width:20%}55%{transform:translateX(150%);width:42%}100%{transform:translateX(360%);width:20%}}
@keyframes typing{0%,60%,100%{transform:translateY(0);opacity:.3;}30%{transform:translateY(-7px);opacity:1;}}

/* ===== Composer Toolbar ===== */
.composerToolbar{
  flex-shrink:0;padding:12px 14px 16px;
  display:grid;
  grid-template-columns:auto 1fr auto;
  grid-template-rows:auto auto;
  grid-template-areas:
    "left mid right"
    "editor editor editor";
  column-gap:10px;row-gap:9px;
  background:transparent;
}
.toolbarLeft{grid-area:left;display:inline-flex;align-items:center;gap:8px;}
.toolbarRight{grid-area:right;display:inline-flex;align-items:center;gap:8px;}
.editorRow{
  grid-area:editor;display:flex;align-items:flex-start;align-content:flex-start;flex-wrap:wrap;gap:8px;
  border-radius:14px;padding:8px 14px;background:rgba(245,245,245,.72);
  border:1px solid rgba(125,125,150,.18);
  transition:border-color .22s ease,background .22s ease,box-shadow .22s ease;
  &:focus-within{border-color:#f57400;background:#fff;box-shadow:0 0 0 3px rgba(245,116,0,.10);}
}
.editorSkills{display:flex;align-items:center;flex-wrap:wrap;gap:6px;max-width:100%}.editorSkills button{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 11px;border:0;border-radius:999px;background:#171717;color:#fff;font:500 13px/1 Inter,"PingFang SC",sans-serif;cursor:pointer;white-space:nowrap}.editorSkills button:hover{background:#333}.editorSkills button>span{font-size:14px;filter:grayscale(1) brightness(3)}.completionHint{display:flex;align-items:center;min-width:0;height:32px;gap:9px;padding:0;border:0;background:transparent;color:#999;text-align:left;cursor:pointer;font:400 14px/1.4 Inter,"PingFang SC",sans-serif}.completionHint kbd{display:grid;place-items:center;height:24px;padding:0 9px;border:1px solid #d5d5d5;border-radius:9px;background:#fff;color:#999;font:400 12px/1 Inter,sans-serif;box-shadow:0 1px 1px rgba(0,0,0,.03)}.completionHint span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.completionHint:hover span{color:#707070}
.roundIconBtn{
  display:inline-flex;align-items:center;justify-content:center;
  width:30px;height:30px;border:none;border-radius:50%;
  background:transparent;color:var(--text-primary,#333);padding:0;cursor:pointer;
  transition:all .2s ease;
  &:hover{background:rgba(120,120,140,.1);color:#667eea;}
  &.ghost{color:var(--text-disabled,#aaa);cursor:not-allowed;&:hover{background:transparent;color:inherit;}}
}
.execPill{
  display:inline-flex;align-items:center;gap:5px;
  height:28px;padding:0 10px;border-radius:200px;border:none;
  background:rgba(245,245,245,.88);color:var(--text-primary,#333);
  font-size:12px;letter-spacing:.02em;cursor:pointer;
  transition:background .2s ease,color .2s ease;
  &:hover{background:#eeeeeecc;color:#667eea;}
  .pillText{white-space:nowrap;}
}
.execPillArrow{opacity:.55;display:inline-flex;align-items:center;}
.composerSetting{position:relative;display:inline-flex;min-width:0}.settingPill{display:inline-flex;align-items:center;gap:5px;max-width:124px;height:30px;padding:0 10px;border:0;border-radius:999px;background:rgba(245,245,245,.88);color:var(--text-primary,#333);font-size:12px;cursor:pointer}.settingPill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.settingMenu{position:absolute;z-index:60;left:0;bottom:36px;display:flex;flex-wrap:wrap;gap:5px;width:180px;padding:10px;border:1px solid rgba(0,0,0,.1);border-radius:12px;background:#fff;box-shadow:0 12px 30px rgba(0,0,0,.16)}.settingMenu strong{width:100%;font-size:12px;color:#777}.settingMenu button{padding:5px 8px;border:0;border-radius:7px;background:#f2f2f2;color:#444;font-size:11px;cursor:pointer}.settingMenu button.selected{background:#202020;color:#fff}.reasoningButton.active{background:#ece5ff;color:#6741d9}
.modelSlot{position:relative;display:inline-flex;align-items:center;gap:6px;min-width:190px;}
.modelSlotLabel{flex:none;color:#8b8790;font-size:11px;}
.modelSlot :deep(.t-select__wrap),.modelSlot :deep(.t-select){
  width:150px;border-radius:11px!important;
}
.modelSlot :deep(.t-input){height:34px!important;border-radius:11px!important;background:#f4f4f5!important;border-color:transparent!important;font-size:12px!important;}
.modelSlot :deep(.modelCostHint){display:none!important;}
.composerCostHint{position:absolute;left:0;top:38px;z-index:2;white-space:nowrap;pointer-events:none;}
.sendButton,.stopButton{
  flex-shrink:0;width:38px;height:38px;border-radius:19px;border:none;
  display:inline-flex;align-items:center;justify-content:center;
  transition:all .25s cubic-bezier(.16,1,.3,1);
}
.sendButton{background:linear-gradient(135deg,#00d4ff,#7b61ff)!important;box-shadow:0 2px 10px rgba(0,212,255,.35);}
.sendButton:hover:not(:disabled){transform:scale(1.05);box-shadow:0 4px 14px rgba(0,212,255,.46);}
.sendButton:active:not(:disabled){transform:scale(.94);}
.sendButton:disabled{opacity:.45;cursor:not-allowed;}
.stopButton{background:linear-gradient(135deg,#ff6b6b,#ee5a24)!important;box-shadow:0 2px 8px rgba(238,90,36,.3);}
.stopButton:hover{transform:scale(1.05);}

.editorRow textarea{
  width:100%;flex:1 0 100%;resize:none;border:none;background:none;outline:none;
  font-family:inherit;font-size:14px;line-height:1.55;letter-spacing:.01em;
  color:var(--text-primary,#222);min-height:44px;max-height:160px;
  padding:4px 6px;
}
.editorRow textarea::placeholder{color:var(--text-disabled,#bbbbc5);}

/* focusMode 收掉顶栏腾出更多书写空间 */
.focusMode .assistantHeaderPlaceholder{}
.focusMode .mainScrollArea{padding-top:18px;}
.skillEmpty{display:flex;flex-direction:column;align-items:center;gap:7px}.skillEmpty strong{color:var(--text-primary,#333);font-size:14px}.skillEmpty a{margin-top:5px;color:#ff7417;text-decoration:none;font-weight:600}

/* Miora 首页式创作首屏：所有选择器都限定在 aiAssistant 内，避免影响其它业务页。 */
.emptyMode .assistantPanel{max-width:1000px;padding:0;overflow:visible}
.emptyMode .panelHeader{display:none!important}
.emptyMode .mainScrollArea{flex:0 0 436px;overflow:visible;padding:40px 0 0;overflow-x:clip}
.emptyMode .emptyStage{display:block;min-height:0;padding:0;overflow:visible}
.legacyEmpty{display:none}
.mioraBanner{position:relative;display:flex;flex-direction:column;gap:4px;width:100vw;height:356px;margin:0 calc((1000px - 100vw)/2);overflow-x:clip}
.bannerStage{position:relative;width:100%;height:350px;perspective:900px;overflow:visible}
.bannerCard{position:absolute;top:50%;left:50%;aspect-ratio:16/9;height:auto;min-height:0;padding:0;overflow:hidden;border:0;border-radius:16px;background:#f5f5f5;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.24);cursor:pointer;transition:left .3s ease,width .3s ease,transform .3s ease;transform-style:flat;backface-visibility:visible;-webkit-backface-visibility:visible;isolation:isolate;outline:none}
.bannerCard:not(.active){box-shadow:0 0 0 1px rgba(0,0,0,.08),0 8px 20px rgba(0,0,0,.2)}.bannerCardInner{position:relative;display:block;width:100%;height:100%;overflow:hidden;border-radius:inherit;background:#f5f5f5;transform:translateZ(0)}.bannerFeatureCard{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;gap:12px;width:100%;height:100%;padding:8% 9%;box-sizing:border-box;color:#fff;text-align:left}.bannerFeatureCard strong{font-size:clamp(20px,2.2vw,30px);font-weight:750;letter-spacing:-.02em}.bannerFeatureCard p{margin:0;max-width:34em;color:rgba(255,255,255,.82);font-size:clamp(12px,1.1vw,15px);line-height:1.7}.bannerFeatureCard em{margin-top:6px;color:#fff;font-size:13px;font-style:normal;font-weight:600;opacity:.92}.bannerCard img{position:relative;z-index:1;display:block;width:100%;height:100%;object-fit:cover;user-select:none;opacity:1}.bannerPlay{position:absolute;inset:50% auto auto 50%;display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:18px;transform:translate(-50%,-50%)}
.bannerArrow{position:absolute;top:50%;z-index:5;display:grid;place-items:center;width:38px;height:38px;padding:0;border:1px solid rgba(255,255,255,.22);border-radius:50%;background:rgba(20,20,20,.55);color:#fff;font-size:28px;line-height:1;cursor:pointer;transform:translateY(-50%);transition:.2s ease}.bannerArrow:hover{background:#202020;transform:translateY(-50%) scale(1.05)}.bannerArrowLeft{left:calc(50% - min(742px, calc(50vw - 32px)))}.bannerArrowRight{right:calc(50% - min(742px, calc(50vw - 32px)))}
.bannerDots{position:relative;z-index:4;display:flex;justify-content:center;gap:4px;height:4px}
.bannerDots button{width:32px;height:4px;padding:0;border:0;border-radius:99px;background:#d2d2d2;cursor:pointer;transition:.25s ease}
.bannerDots button.active{background:#222}
.mioraHero{position:relative;display:flex;width:996px;height:170px;margin:-80px 2px 0;gap:24px;z-index:5;pointer-events:none}
.creationTabs{position:absolute;left:0;bottom:0;display:flex;width:692px;height:32px;padding:4px;gap:4px;border-radius:18px;background:rgba(247,247,247,.92);box-shadow:inset 0 0 0 1px rgba(0,0,0,.025);pointer-events:auto}
.creationTabs button{display:flex;align-items:center;justify-content:center;gap:8px;flex:1;height:24px;padding:0 10px;border:0;border-radius:14px;background:transparent;color:#252525;font:500 13px/1 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;cursor:pointer;transition:.2s ease;white-space:nowrap}
.creationTabs button:hover{background:#eee}
.creationTabs button.active{background:#202020;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.18)}
.categoryIcon{display:grid;place-items:center;width:18px;font-size:16px}
.mascotPreview{position:absolute;right:60px;top:0;width:220px;height:170px;pointer-events:none}
.mascotPreview img,.mascotPreview video{position:absolute;inset:0;width:220px;height:170px;object-fit:contain}
.mascotPreview img{transform:scale(.72);filter:drop-shadow(0 12px 15px rgba(0,0,0,.12))}
.floatTag{position:absolute;display:flex;align-items:center;justify-content:center;height:28px;border:1px solid rgba(0,0,0,.07);border-radius:99px;background:rgba(255,255,255,.34);backdrop-filter:blur(7px);color:#222;font-size:12px;white-space:nowrap}
.tagPoster{left:98px;top:15px;width:62px;opacity:.5}.tagVideo{left:164px;top:5px;width:62px;opacity:.3}.tagBrand{left:177px;top:42px;width:64px}.tagVisual{left:139px;top:78px;width:84px}.tagImage{left:185px;top:116px;width:64px;opacity:.7}
.emptyMode .composerToolbar{position:relative;z-index:8;flex:0 0 160px;display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:1fr 36px;grid-template-areas:"editor editor editor" "left mid right";width:996px;height:160px;margin:20px 2px 0;padding:14px 12px 10px;gap:0 8px;border:2px solid transparent;border-radius:20px;background:linear-gradient(#fff,#fff) padding-box,radial-gradient(circle at 65% 100%,rgba(57,188,248,.35),transparent 42%),radial-gradient(circle at 42% 100%,rgba(253,126,20,.3),transparent 40%),#f0f0f0 border-box;box-sizing:border-box;overflow:visible}
.emptyMode .editorRow{grid-area:editor;align-items:flex-start;align-content:flex-start;padding:6px 14px;border:0;border-radius:0;background:#fff;box-shadow:none!important;cursor:text}
.emptyMode .editorRow:focus-within{border:0;background:#fff;box-shadow:none!important}
.emptyMode .editorRow textarea,.emptyMode .editorRow textarea:focus,.emptyMode .editorRow textarea:hover{border:0!important;outline:0!important;box-shadow:none!important;background:transparent!important;-webkit-appearance:none;appearance:none}
.promptCycleHint{width:auto;max-width:calc(100% - 14px);min-height:34px;pointer-events:none;animation:prompt-cycle-in .28s ease}
.promptCycleHint .promptCycleLabel{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#777;font-size:16px;line-height:1.55}
.promptCycleHint:hover .promptCycleLabel{color:#222}
@keyframes prompt-cycle-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.emptyMode .editorRow textarea{min-height:54px;max-height:90px;height:54px;padding:4px 2px;font-size:16px;line-height:1.65;color:#222;letter-spacing:0}
.emptyMode .editorRow:not(.hasInput) textarea{flex:0 0 2px;width:2px;min-width:2px;max-width:2px;height:34px;min-height:34px;padding:4px 0;overflow:hidden;caret-color:#222}
.emptyMode .editorRow.hasInput textarea{flex:1 0 100%;width:100%;max-width:100%}
.emptyMode .editorRow:not(.hasInput) .promptCycleHint{flex:0 1 auto;order:2}
.emptyMode .editorRow.hasInput .promptCycleHint{display:none}
.emptyMode .editorRow textarea::placeholder{color:#9d9d9d}
.emptyMode .toolbarLeft,.emptyMode .toolbarRight{align-self:center;height:32px}
.emptyMode .modelSlot{display:inline-flex}
.emptyMode .sendButton,.emptyMode .stopButton{width:32px;height:32px;border-radius:50%;background:#f1f1f1!important;color:#aaa!important;box-shadow:none}
.emptyMode .sendButton:not(:disabled){background:#202020!important;color:#fff!important}
.emptyMode .activeSkills{display:none}
.emptyMode .skillPicker{left:12px;bottom:146px;width:min(540px,calc(100% - 24px));height:min(421px,calc(100vh - 250px))}
.emptyMode.aiAssistant{overflow-y:auto;background:#fff}
.emptyMode .assistantPanel{height:auto;min-height:100%}
/* Infinite Canvas composer visual language. The surrounding page and its Tab
   suggestion animation remain owned by this Vue view. */
.upstreamComposer,.emptyMode .upstreamComposer{
  position:relative;z-index:8;flex:0 0 auto;display:grid;
  grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto 40px;
  grid-template-areas:"editor editor" "left right";
  width:min(996px,calc(100% - 4px));height:auto;min-height:136px;
  margin:18px 2px 0;padding:12px;gap:8px;
  border:1px solid #dedede;border-radius:16px;
  background:rgba(255,255,255,.96);box-shadow:0 16px 42px rgba(45,45,50,.10);
  box-sizing:border-box;overflow:visible;
}
.upstreamComposer .editorRow,.emptyMode .upstreamComposer .editorRow{
  grid-area:editor;display:flex;min-height:72px;max-height:220px;align-items:flex-start;
  align-content:flex-start;flex-wrap:wrap;gap:7px;padding:0 4px;border:0;border-radius:0;
  background:transparent;box-shadow:none!important;cursor:text;overflow-y:auto;
}
.upstreamComposer .editorRow:focus-within,.emptyMode .upstreamComposer .editorRow:focus-within{border:0;background:transparent;box-shadow:none!important}
.upstreamComposer .editorRow textarea,.emptyMode .upstreamComposer .editorRow textarea,
.upstreamComposer .editorRow textarea:focus,.emptyMode .upstreamComposer .editorRow textarea:focus{
  flex:1 0 100%;width:100%;height:52px;min-height:52px;max-height:160px;padding:0 1px;
  border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important;
  color:#252525;font-size:14px;line-height:20px;caret-color:#222;
}
.upstreamComposer .editorRow textarea::placeholder{color:#929292}
.upstreamComposer .toolbarLeft,.emptyMode .upstreamComposer .toolbarLeft{grid-area:left;align-self:center;height:40px;gap:4px}
.upstreamComposer .toolbarRight,.emptyMode .upstreamComposer .toolbarRight{grid-area:right;align-self:center;height:40px;gap:4px}
.upstreamComposer .roundIconBtn{width:32px;height:32px;color:#3f3f46}
.upstreamComposer .roundIconBtn:hover{background:#f0f0f0;color:#111}
.upstreamComposer .settingPill{height:32px;max-width:148px;background:#f2f2f2;color:#333}
.upstreamComposer .settingPill:hover{background:#e9e9e9}
.upstreamComposer .sendButton,.emptyMode .upstreamComposer .sendButton,.upstreamComposer .stopButton,.emptyMode .upstreamComposer .stopButton{width:40px;height:40px;border-radius:50%;box-shadow:none}
.upstreamComposer .sendButton,.emptyMode .upstreamComposer .sendButton{background:#202020!important;color:#fff!important}
.upstreamComposer .sendButton:disabled,.emptyMode .upstreamComposer .sendButton:disabled{background:#ededed!important;color:#aaa!important}
.upstreamComposer .reasoningButton.active{background:#ece8ff;color:#6046c8}
.upstreamComposer .editorSkills button{background:#f3f3f3;color:#333;border:1px solid #e2e2e2}
.upstreamComposer .promptCycleHint{position:absolute;left:4px;top:0;color:#8a8a8a}
.upstreamComposer .promptCycleHint .promptCycleLabel{color:#8a8a8a;font-size:14px}
.upstreamComposer .promptCycleHint kbd{border-color:#d7d7d7;background:#fff;color:#777}
.assetMenu{position:absolute;left:12px;bottom:52px;z-index:70;display:flex;flex-direction:column;width:224px;padding:8px;border:1px solid #e3e3e3;border-radius:16px;background:rgba(255,255,255,.98);box-shadow:0 18px 42px rgba(30,30,35,.16);animation:asset-menu-in .16s ease-out}.assetMenu:after{content:"";position:absolute;left:20px;bottom:-6px;width:10px;height:10px;border-right:1px solid #e3e3e3;border-bottom:1px solid #e3e3e3;background:#fff;transform:rotate(45deg)}.assetMenu button{display:grid;grid-template-columns:30px 1fr;grid-template-rows:auto auto;column-gap:9px;align-items:center;padding:11px 12px;border:0;border-radius:10px;background:transparent;color:#252525;text-align:left;cursor:pointer;transition:.16s}.assetMenu button:hover{background:#fff1e7;color:#e95f00}.assetMenu button svg{grid-row:1/3;width:18px;height:18px}.assetMenu button span{font-size:13px;font-weight:650}.assetMenu button small{margin-top:2px;color:#999;font-size:11px}.assetMenu button:hover small{color:#c47a4d}@keyframes asset-menu-in{from{opacity:0;transform:translateY(5px) scale(.98)}to{opacity:1;transform:none}}
/* Skill overlay: general system skills + the user's previously installed skills. */
.skillPicker,.emptyMode .skillPicker{left:14px;bottom:155px;width:min(740px,calc(100% - 28px));height:min(520px,calc(100vh - 210px));padding:22px 26px;border-color:#dedede;border-radius:22px;background:rgba(255,255,255,.98)}
.skillPicker h3,.mediaSettingMenu h3{margin:0;color:#242424;font-size:24px;font-weight:650}
.skillPickerTop{display:grid;grid-template-columns:auto minmax(220px,1fr);gap:16px;align-items:center;margin:22px 0 18px}
.skillTabs{display:flex;padding:4px;border-radius:13px;background:#f1f1f1}.skillTabs button{height:38px;padding:0 22px;border:0;border-radius:10px;background:transparent;color:#555;font-size:15px;cursor:pointer}.skillTabs button.active{background:#fff;color:#222;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.skillSearchRow{height:46px;border:1px solid #dedede;background:#fafafa}
.skillOption{height:72px;padding:0 14px}.skillGlyph{width:42px;height:42px;border:1px solid #dedede;border-radius:12px;background:#fafafa;color:#333;font-size:23px}.skillCopy{display:flex;flex-direction:column;align-items:flex-start;gap:5px}.skillCopy strong{max-width:100%;font-size:16px;font-weight:600}.skillCopy small{width:100%;font-size:13px}.skillOfficial{display:none}
.skillPickerDivider,.skillPickerActions{display:none}
/* Full image/video panels, adapted from the Infinite Canvas controls to this light page. */
.upstreamComposer .mediaSettingMenu{bottom:42px;display:flex;flex-direction:column;flex-wrap:nowrap;gap:14px;width:620px;max-height:min(660px,calc(100vh - 190px));padding:26px;border:1px solid #dedede;border-radius:20px;background:rgba(255,255,255,.98);color:#252525;box-shadow:0 22px 60px rgba(25,25,30,.18);overflow-y:auto}
.skillPicker,.emptyMode .skillPicker{bottom:214px;max-height:min(520px,calc(100vh - 180px));box-shadow:0 22px 58px rgba(25,25,30,.16)}
.mediaSettingMenu>label,.settingTitleRow>label{color:#555;font-size:14px;font-weight:600}.settingSegment{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.upstreamComposer .mediaSettingMenu .settingSegment button{height:48px;border:1px solid #ddd;border-radius:24px;background:#fff;color:#333;font-size:16px}.upstreamComposer .mediaSettingMenu button.selected{border-color:#222;background:#222;color:#fff}
.settingTitleRow{display:flex;align-items:center;justify-content:space-between}.alignToggle{display:flex;align-items:center;gap:9px;font-weight:500!important}.alignToggle input{display:none}.alignToggle span{position:relative;width:34px;height:20px;border-radius:12px;background:#d5d5d5}.alignToggle span:after{content:"";position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:.18s}.alignToggle input:checked+span{background:#222}.alignToggle input:checked+span:after{left:17px}
.dimensionRow{display:grid;grid-template-columns:auto 1fr 36px auto 1fr;align-items:center;gap:10px}.dimensionRow span{margin-right:-42px;z-index:1;color:#777}.dimensionRow strong{height:52px;padding:0 18px 0 52px;border-radius:13px;background:#f4f4f4;font-size:17px;font-weight:500;line-height:52px}.dimensionRow em{text-align:center;color:#999;font-style:normal}
.ratioGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.upstreamComposer .mediaSettingMenu .ratioGrid button,.upstreamComposer .mediaSettingMenu .videoSizeGrid button{display:flex;min-height:112px;align-items:center;justify-content:center;flex-direction:column;gap:8px;border:1px solid #ddd;border-radius:16px;background:#fff;color:#333;font-size:15px}.ratioGrid button i{display:block;width:42px;max-height:42px;border:3px solid currentColor}.ratioGrid button span{font-size:16px}
.videoSizeGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.videoSizeGrid button i{display:block;width:45px;height:30px;border:3px solid currentColor;border-radius:4px}.videoSizeGrid button i.shape-tall,.videoSizeGrid button i.shape-standard-tall{width:25px;height:42px}.videoSizeGrid button i.shape-square{width:36px;height:36px}.videoSizeGrid button i.shape-standard-wide{width:40px;height:31px}.videoSizeGrid button i.shape-cinema{width:50px;height:21px}.videoSizeGrid button small{color:#999;font-size:12px}.videoSizeGrid button.selected small{color:rgba(255,255,255,.7)}
.mioraHero{height:260px;margin:36px 2px 0}
.creationTabs{top:0;bottom:auto;transform:none;height:42px;padding:5px;border:1px solid rgba(0,0,0,.06);box-shadow:0 4px 16px rgba(0,0,0,.08)}
.creationTabs button{height:32px;border-radius:16px;color:#6a6a70;font-size:13px}.creationTabs button:hover{background:#f3f3f5;color:#252525}.creationTabs button.active{background:#222;color:#fff;box-shadow:0 3px 8px rgba(0,0,0,.18)}
.emptyMode .upstreamComposer{margin-top:28px}
.upstreamComposer .editorRow{align-items:center;flex-wrap:nowrap;overflow:hidden;min-height:76px}
.upstreamComposer .editorSkills{display:flex;flex:0 0 auto;flex-wrap:nowrap;max-width:48%;overflow-x:auto;align-items:center}
.upstreamComposer .editorRow textarea,.emptyMode .upstreamComposer .editorRow textarea{order:1;flex:1 1 auto;width:auto;min-width:80px;height:52px;min-height:52px;margin:0}
.upstreamComposer .promptCycleHint,.emptyMode .upstreamComposer .promptCycleHint{position:absolute;left:8px;top:10px;z-index:2;order:0;max-width:calc(100% - 16px);transform:none}
.upstreamComposer .editorRow:not(.hasInput) textarea,.emptyMode .upstreamComposer .editorRow:not(.hasInput) textarea{flex:0 0 2px;width:2px;min-width:2px;height:34px;min-height:34px;padding:0}
.upstreamComposer .editorRow.hasInput .promptCycleHint,.emptyMode .upstreamComposer .editorRow.hasInput .promptCycleHint{display:none}
.upstreamComposer .editorRow.hasSkills .promptCycleHint,.emptyMode .upstreamComposer .editorRow.hasSkills .promptCycleHint{position:static;flex:0 1 auto;max-width:55%;order:2}
.emptyMode .mioraHero{margin-bottom:24px}
.emptyMode .upstreamComposer{margin-top:36px}
.upstreamComposer .editorRow,.emptyMode .upstreamComposer .editorRow{position:relative;overflow:visible}
.upstreamComposer .editorRow:not(.hasSkills) textarea,.emptyMode .upstreamComposer .editorRow:not(.hasSkills) textarea{flex:1 1 100%;width:100%;min-width:0;max-width:none;height:54px;min-height:54px;padding:4px 2px;overflow:auto}
.upstreamComposer .editorRow:not(.hasSkills) textarea::placeholder,.emptyMode .upstreamComposer .editorRow:not(.hasSkills) textarea::placeholder{color:transparent}
.upstreamComposer .editorRow:not(.hasSkills):focus-within textarea::placeholder,.emptyMode .upstreamComposer .editorRow:not(.hasSkills):focus-within textarea::placeholder{color:#929292}
.upstreamComposer .editorRow:not(.hasSkills) .promptCycleHint,.emptyMode .upstreamComposer .editorRow:not(.hasSkills) .promptCycleHint{position:absolute;left:8px;right:8px;top:8px;z-index:2;display:flex;max-width:none;pointer-events:none;order:initial;transition:opacity .14s ease,visibility .14s ease}
.upstreamComposer .editorRow:not(.hasSkills):focus-within .promptCycleHint,.emptyMode .upstreamComposer .editorRow:not(.hasSkills):focus-within .promptCycleHint{opacity:0;visibility:hidden}
.upstreamComposer .editorRow .editorSkills,.emptyMode .upstreamComposer .editorRow .editorSkills{order:0;flex:1 1 100%;width:100%;max-width:100%;min-height:32px;overflow-x:auto;overflow-y:hidden}
.upstreamComposer .editorRow textarea,.emptyMode .upstreamComposer .editorRow textarea{order:1;flex:1 1 100%;width:100%;min-width:0;max-width:none;height:54px;min-height:54px;padding:2px 2px 0;line-height:26px;overflow:auto}
.upstreamComposer .editorRow .promptCycleHint,.emptyMode .upstreamComposer .editorRow .promptCycleHint{position:absolute;left:8px;right:8px;top:8px;z-index:2;display:flex;max-width:none;pointer-events:none;order:2;align-items:center;height:28px;min-height:28px;gap:8px;transition:opacity .14s ease,visibility .14s ease}
.upstreamComposer .editorRow.hasSkills .promptCycleHint,.emptyMode .upstreamComposer .editorRow.hasSkills .promptCycleHint{top:47px}
.upstreamComposer .editorRow:focus-within .promptCycleHint,.emptyMode .upstreamComposer .editorRow:focus-within .promptCycleHint{opacity:0;visibility:hidden}
.upstreamComposer .editorRow:not(.hasInput) textarea::placeholder,.emptyMode .upstreamComposer .editorRow:not(.hasInput) textarea::placeholder{color:transparent}
.upstreamComposer .editorRow:not(.hasInput):focus-within textarea::placeholder,.emptyMode .upstreamComposer .editorRow:not(.hasInput):focus-within textarea::placeholder{color:#929292}
.upstreamComposer .promptCycleHint kbd,.emptyMode .upstreamComposer .promptCycleHint kbd{height:26px;line-height:26px}
.upstreamComposer .promptCycleHint .promptCycleLabel,.emptyMode .upstreamComposer .promptCycleHint .promptCycleLabel{line-height:26px}
.emptyMode .mioraHero{height:280px;margin-top:64px}
.emptyMode .upstreamComposer{margin-top:56px}
.emptyMode .mioraHero{top:28px;margin-bottom:52px}
.emptyMode .upstreamComposer{top:44px;margin-bottom:44px}
.emptyMode .inspirationShowcase{margin-top:74px}
.upstreamComposer .editorRow:not(.hasInput) textarea,.emptyMode .upstreamComposer .editorRow:not(.hasInput) textarea{padding-left:58px}
.upstreamComposer .editorRow.hasInput textarea,.emptyMode .upstreamComposer .editorRow.hasInput textarea{padding-left:2px}
.upstreamComposer .editorRow:not(.hasInput):focus-within .promptCycleHint,.emptyMode .upstreamComposer .editorRow:not(.hasInput):focus-within .promptCycleHint{opacity:1;visibility:visible}
.assetMenu{width:250px;max-width:calc(100vw - 32px);padding:10px;border-radius:18px;box-shadow:0 20px 48px rgba(25,25,30,.18)}
.assetMenuHeader{display:flex;flex-direction:column;gap:3px;padding:7px 10px 10px;border-bottom:1px solid #ededed;margin-bottom:4px}
.assetMenuHeader strong{color:#242424;font-size:14px;font-weight:650;line-height:1.25}
.assetMenuHeader span{color:#999;font-size:11px;line-height:1.25}
.assetMenu button{grid-template-columns:36px minmax(0,1fr) auto;grid-template-rows:auto;column-gap:10px;padding:10px}
.assetMenu button:hover{background:#fff3ea}
.assetMenuIcon{display:grid;place-items:center;width:32px;height:32px;border:1px solid #e6e6e6;border-radius:10px;background:#fafafa;color:#555;transition:.16s}
.assetMenu button:hover .assetMenuIcon{border-color:#ffd7bd;background:#fff7f1;color:#e95f00}
.assetMenuCopy{display:flex;min-width:0;flex-direction:column;gap:3px}
.assetMenuCopy b{font-size:13px;font-weight:650;line-height:1.2}
.assetMenuCopy small{margin:0;line-height:1.2;color:#999;font-size:11px}
.assetMenu button:hover .assetMenuCopy small{color:#c47a4d}
.assetMenu kbd{padding:3px 6px;border:1px solid #e5e5e5;border-radius:6px;background:#f7f7f7;color:#aaa;font:500 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;transition:.16s}
.assetMenu button:hover kbd{border-color:#ffc69f;background:#fff4ea;color:#d85d00}
.assetMenu button:focus-visible{outline:2px solid #ff9a5a;outline-offset:-2px}
.assetPickerOverlay{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:24px;background:rgba(20,20,24,.42);backdrop-filter:blur(5px);animation:asset-picker-fade .16s ease-out}
.assetPickerDialog{position:relative;width:min(900px,calc(100vw - 36px));height:min(680px,calc(100vh - 48px));overflow:hidden;border:1px solid rgba(0,0,0,.12);border-radius:20px;background:#fff;box-shadow:0 30px 90px rgba(20,20,25,.28)}
.assetPickerFrame{display:block;width:100%;height:100%;border:0;background:#fff}
@keyframes asset-picker-fade{from{opacity:0}to{opacity:1}}
.inspirationShowcase{width:996px;margin:36px 2px 80px;padding-bottom:30px}.inspirationShowcase>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.inspirationShowcase h2{display:flex;align-items:center;gap:8px;margin:0;color:#242424;font-size:20px;font-weight:650}.inspirationShowcase h2 svg{font-size:20px}.inspirationActions{display:flex;align-items:center;gap:8px}.inspirationActions button,.inspirationShowcase header a{display:flex;align-items:center;gap:5px;padding:7px 11px;border:0;border-radius:9px;background:#f1f1f1;color:#555;text-decoration:none;font-size:12px;cursor:pointer;transition:.18s ease}.inspirationActions button:hover,.inspirationShowcase header a:hover{background:#e8e8e8;color:#111}.inspirationGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.inspirationCard{min-width:0;overflow:hidden;border:1px solid #ececef;border-radius:15px;background:#fff;text-align:left;box-shadow:0 5px 18px rgba(25,27,35,.035);transition:transform .22s ease,box-shadow .22s ease}.inspirationCard:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(25,27,35,.1)}.inspirationMedia{position:relative;display:block;aspect-ratio:1.55/1;overflow:hidden;background:#f2f2f3}.inspirationMedia img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .35s ease}.inspirationCard:hover .inspirationMedia img{transform:scale(1.035)}.inspirationInfo{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px 8px;padding:11px 12px 12px}.inspirationInfo strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#26262a;font-size:14px;font-weight:600}.inspirationInfo small{grid-column:1;color:#9a9aa1;font-size:11px}.inspirationInfo button{grid-column:2;grid-row:1/3;padding:6px 9px;border:0;border-radius:8px;background:#f2f2f3;color:#555;font-size:11px;cursor:pointer}.inspirationInfo button:hover{background:#171717;color:#fff}

@media(max-width:1100px){
  .emptyMode .assistantPanel{max-width:calc(100% - 40px)}
  .mioraBanner{width:calc(100% + 80px);margin-left:-40px;margin-right:-40px}
  .mioraHero,.emptyMode .composerToolbar{width:100%;margin-left:0;margin-right:0}
  .creationTabs{width:calc(100% - 250px)}
  .inspirationShowcase{width:100%;margin-left:0;margin-right:0}.inspirationGrid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:760px){
  .emptyMode .assistantPanel{max-width:100%;padding:0 12px}
  .emptyMode .mainScrollArea{flex-basis:385px;padding-top:20px;overflow:hidden}
  .mioraBanner{width:100vw;height:230px;margin:0 calc((100% - 100vw)/2)}.bannerStage{height:224px;overflow:hidden}.bannerCard{width:82%;}.bannerArrow{width:32px;height:32px;font-size:23px}.bannerArrowLeft{left:8px}.bannerArrowRight{right:8px}
  .mioraHero{height:145px;margin-top:-45px}.creationTabs{width:100%;overflow-x:auto}.creationTabs button{min-width:112px}.mascotPreview{display:none}
  .emptyMode .composerToolbar{width:100%;margin-top:10px}.toolbarRight{gap:3px}
  .inspirationShowcase{margin-top:28px;padding:0 2px 24px}.inspirationGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.inspirationShowcase h2{font-size:18px}
}

/* Desktop composition aligned with the spacious upstream Miora landing page. */
@media(min-width:761px){
  .emptyMode .assistantPanel{max-width:min(1440px,calc(100% - 64px));padding:0}
  .emptyMode .mainScrollArea{flex-basis:auto;padding-top:24px;overflow:visible}
  .emptyMode .mioraBanner{height:clamp(300px,42vh,390px);margin:0 calc((1440px - 100vw)/2)}
  .emptyMode .bannerStage{height:calc(100% - 18px)}
  .emptyMode .bannerDots{height:6px;gap:7px}
  .emptyMode .bannerDots button{width:42px;height:5px}
  .emptyMode .mioraHero{position:relative;top:auto;z-index:12;width:100%;height:176px;margin:24px 0 0;margin-bottom:0}
  .emptyMode .creationTabs{left:0;top:auto;bottom:18px;width:min(1040px,calc(100% - 292px));height:52px;padding:5px;border-radius:28px}
  .emptyMode .creationTabs button{height:42px;border-radius:22px;font-size:15px}
  .emptyMode .categoryIcon{width:21px;font-size:18px}
  .emptyMode .mascotPreview{right:4px;top:auto;bottom:-6px;z-index:4;width:270px;height:190px;opacity:1}
  .emptyMode .mascotPreview img,.emptyMode .mascotPreview video{width:270px;height:190px}
  .emptyMode .mascotPreview img{transform:scale(.82);filter:drop-shadow(0 16px 20px rgba(0,0,0,.14))}
  .emptyMode .upstreamComposer{top:auto;width:100%;min-height:198px;margin:8px 0 0;margin-bottom:0;padding:16px 20px 14px;grid-template-rows:minmax(108px,auto) 46px;gap:10px;border-radius:24px;box-shadow:0 18px 50px rgba(40,40,48,.11)}
  .emptyMode .upstreamComposer .editorRow{min-height:108px;padding:0 4px;gap:8px}
  .emptyMode .upstreamComposer .editorRow textarea{height:64px;min-height:64px;padding:7px 4px 0;font-size:17px;line-height:30px}
  .emptyMode .upstreamComposer .editorRow:not(.hasInput) textarea{padding:7px 4px 0}
  .emptyMode .upstreamComposer .editorRow.hasInput textarea{padding-left:4px}
  .emptyMode .upstreamComposer .editorRow:not(.hasInput) .promptCycleHint{left:28px;right:14px;top:7px;height:30px;min-height:30px;gap:10px}
  .emptyMode .upstreamComposer .editorRow.hasSkills:not(.hasInput) .promptCycleHint{top:52px}
  .emptyMode .upstreamComposer .promptCycleHint kbd{width:48px;height:30px;padding:0;border-radius:10px;line-height:30px}
  .emptyMode .upstreamComposer .promptCycleHint .promptCycleLabel{font-size:17px;line-height:30px}
  .emptyMode .upstreamComposer .toolbarLeft,.emptyMode .upstreamComposer .toolbarRight{height:46px;gap:7px}
  .emptyMode .upstreamComposer .roundIconBtn{width:38px;height:38px}
  .emptyMode .upstreamComposer .settingPill{height:38px;padding:0 14px;font-size:14px}
  .emptyMode .upstreamComposer .sendButton,.emptyMode .upstreamComposer .stopButton{width:46px;height:46px}
  .emptyMode .inspirationShowcase{width:100%;margin:46px 0 100px;padding-bottom:40px}
  .emptyMode .inspirationShowcase h2{font-size:24px}
  .emptyMode .inspirationGrid{gap:20px}
}

/* Composer popovers must sit above the hero tabs and carousel, while the mascot
   labels stay readable without covering the character. */
.emptyMode .creationTabs{z-index:2}
.upstreamComposer.popoverOpen,.emptyMode .upstreamComposer.popoverOpen{z-index:120}
.upstreamComposer .skillPicker,.emptyMode .upstreamComposer .skillPicker{left:54px;bottom:66px;z-index:100;width:min(740px,calc(100% - 68px));box-sizing:border-box}
.emptyMode .upstreamComposer:has(.mediaSettingMenu){z-index:80}
.emptyMode .mediaSettingMenu{z-index:100}
.emptyMode .upstreamComposer .mediaSettingMenu .ratioGrid button,
.emptyMode .upstreamComposer .mediaSettingMenu .videoSizeGrid button{position:relative;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,color .16s ease}
.emptyMode .upstreamComposer .mediaSettingMenu .ratioGrid button:hover,
.emptyMode .upstreamComposer .mediaSettingMenu .videoSizeGrid button:hover{border-color:#ff7417;background:#fff8f2}
.emptyMode .upstreamComposer .mediaSettingMenu .ratioGrid button.selected,
.emptyMode .upstreamComposer .mediaSettingMenu .videoSizeGrid button.selected{border:2px solid #ff7417;background:#fff1e6;color:#a94300;box-shadow:0 0 0 3px rgba(255,116,23,.14)}
.emptyMode .upstreamComposer .mediaSettingMenu .ratioGrid button.selected i,
.emptyMode .upstreamComposer .mediaSettingMenu .videoSizeGrid button.selected i{border-color:#ff7417}
.emptyMode .mascotPreview{right:clamp(44px,4vw,76px)}
.emptyMode .mascotPreview .floatTag{z-index:3;background:rgba(255,255,255,.88);box-shadow:0 2px 9px rgba(30,30,30,.08)}
.emptyMode .mascotPreview .tagPoster{left:auto;right:94px}
.emptyMode .mascotPreview .tagVideo{left:auto;right:28px}
.emptyMode .mascotPreview .tagBrand{left:auto;right:4px}
.emptyMode .mascotPreview .tagVisual{left:auto;right:16px}
.emptyMode .mascotPreview .tagImage{left:auto;right:0}

/* 2026-10 landing polish: one clear hero, a compact creation mode row, and a
   composer whose hierarchy stays readable before and after attachments. */
.emptyMode .assistantPanel{max-width:min(1360px,calc(100% - 48px))}
.emptyMode .mainScrollArea{padding-top:22px}
.emptyMode .mioraBanner{height:326px;margin:0 calc((1360px - 100vw)/2)}
.emptyMode .bannerStage{height:312px}
.bannerCard{aspect-ratio:2.35/1;border-radius:22px;transition:left .34s cubic-bezier(.22,1,.36,1),width .34s cubic-bezier(.22,1,.36,1),transform .34s cubic-bezier(.22,1,.36,1),filter .25s ease,opacity .25s ease}
.bannerCard:not(.active){opacity:.68;filter:saturate(.72) brightness(.82)}
.bannerCard.active{box-shadow:0 0 0 1px rgba(255,255,255,.22),0 24px 60px rgba(16,18,28,.26)}
.bannerCard img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.bannerFeatureCard{position:absolute;inset:0;z-index:2;justify-content:center;gap:11px;padding:8% 8.5%;background:linear-gradient(90deg,rgba(5,10,20,.92) 0%,rgba(7,12,24,.78) 38%,rgba(7,12,24,.12) 72%,transparent 100%);box-sizing:border-box}
.bannerFeatureCard.withImage{background:linear-gradient(90deg,rgba(4,9,18,.94) 0%,rgba(4,9,18,.76) 38%,rgba(4,9,18,.10) 73%,transparent 100%)}
.bannerFeatureCard small{color:rgba(255,255,255,.58);font-size:10px;font-weight:700;letter-spacing:.16em}
.bannerFeatureCard strong{max-width:12em;font-size:clamp(24px,2.15vw,34px);line-height:1.16}
.bannerFeatureCard p{max-width:30em;color:rgba(255,255,255,.72);font-size:clamp(12px,1vw,14px);line-height:1.65}
.bannerFeatureCard em{display:inline-flex;align-items:center;gap:8px;width:max-content;margin-top:7px;padding:8px 12px;border:1px solid rgba(255,255,255,.18);border-radius:99px;background:rgba(255,255,255,.10);font-size:12px;backdrop-filter:blur(8px)}
.bannerFeatureCard em span{font-size:14px}
.bannerArrow{width:36px;height:36px;border-color:rgba(255,255,255,.35);background:rgba(17,18,24,.58);font-size:24px;backdrop-filter:blur(8px)}
.bannerArrowLeft{left:max(18px,calc(50% - 465px))}.bannerArrowRight{right:max(18px,calc(50% - 465px))}
.emptyMode .bannerDots{height:6px;gap:7px}.emptyMode .bannerDots button{width:26px;height:4px;background:#d8d8dc}.emptyMode .bannerDots button.active{width:48px;background:#252529}

.emptyMode .mioraHero{top:auto;height:64px;margin:12px 0 0}
.emptyMode .creationTabs{inset:auto 0 8px 0;width:100%;height:48px;padding:5px;border:1px solid #e8e8eb;border-radius:24px;background:#f7f7f8;box-shadow:none}
.emptyMode .creationTabs button{height:36px;border-radius:18px;color:#666;font-size:14px}
.emptyMode .creationTabs button.active{background:#222;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.16)}
.emptyMode .mascotPreview{display:none}

.upstreamComposer,.emptyMode .upstreamComposer{top:auto;width:100%;min-height:214px;margin:8px 0 20px;padding:16px 18px 12px;grid-template-rows:minmax(138px,auto) 44px;gap:8px;border:1px solid #dddddf;border-radius:22px;background:#fff;box-shadow:0 14px 38px rgba(30,32,38,.09)}
.upstreamComposer:focus-within,.emptyMode .upstreamComposer:focus-within{border-color:#b8b8bd;box-shadow:0 16px 42px rgba(30,32,38,.12),0 0 0 3px rgba(35,35,38,.04)}
.upstreamComposer .editorRow,.emptyMode .upstreamComposer .editorRow{min-height:138px;max-height:260px;padding:2px 4px;gap:6px}
.upstreamComposer .editorRow textarea,.emptyMode .upstreamComposer .editorRow textarea{height:108px;min-height:108px;padding:5px 4px 0;font-size:16px;line-height:28px}
.upstreamComposer .editorRow:not(.hasInput) textarea,.emptyMode .upstreamComposer .editorRow:not(.hasInput) textarea{height:108px;min-height:108px;padding:5px 4px 0}
.upstreamComposer .editorRow .promptCycleHint,.emptyMode .upstreamComposer .editorRow .promptCycleHint{left:8px;right:8px;top:7px;height:34px;min-height:34px;gap:9px}
.upstreamComposer .editorRow.hasSkills .promptCycleHint,.emptyMode .upstreamComposer .editorRow.hasSkills .promptCycleHint{top:44px}
.promptSpark{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:9px;background:#fff1e7;color:#e76308;font-size:13px}
.upstreamComposer .promptCycleHint .promptCycleLabel,.emptyMode .upstreamComposer .promptCycleHint .promptCycleLabel{flex:1;color:#73737a;font-size:15px;line-height:28px}
.upstreamComposer .promptCycleHint kbd,.emptyMode .upstreamComposer .promptCycleHint kbd{width:auto;height:25px;padding:0 8px;border-color:#e0e0e3;background:#f7f7f8;color:#929298;line-height:25px}
.upstreamComposer .toolbarLeft,.emptyMode .upstreamComposer .toolbarLeft,.upstreamComposer .toolbarRight,.emptyMode .upstreamComposer .toolbarRight{height:44px;gap:6px}
.upstreamComposer .roundIconBtn.assetTrigger,.upstreamComposer .roundIconBtn.skillButton,.upstreamComposer .roundIconBtn.reasoningButton{width:auto;height:34px;gap:7px;padding:0 11px;border-radius:11px;background:#f4f4f5;color:#4a4a50;font-size:13px}
.upstreamComposer .roundIconBtn.assetTrigger:hover,.upstreamComposer .roundIconBtn.skillButton:hover,.upstreamComposer .roundIconBtn.reasoningButton:hover{background:#eaeaec;color:#1f1f22}
.upstreamComposer .roundIconBtn.skillButton.active,.upstreamComposer .roundIconBtn.reasoningButton.active{background:#fff0e6;color:#d95700}
.toolLabel{font:600 12px/1 Inter,"PingFang SC",sans-serif}
.upstreamComposer .settingPill{height:34px;padding:0 11px;border-radius:11px;background:#f4f4f5}
.upstreamComposer .sendButton,.emptyMode .upstreamComposer .sendButton,.upstreamComposer .stopButton,.emptyMode .upstreamComposer .stopButton{width:38px;height:38px}
.composerMascot{position:absolute;z-index:3;right:26px;top:-138px;width:210px;height:150px;overflow:hidden;pointer-events:none;mix-blend-mode:multiply;filter:drop-shadow(0 13px 18px rgba(25,25,30,.16))}
.composerMascot video{display:block;width:100%;height:100%;object-fit:contain}
.emptyMode .inspirationShowcase{margin-top:18px}

@media(min-width:761px){
  .emptyMode .upstreamComposer{z-index:20;margin-top:clamp(12px,calc(100vh - 600px),320px)}
}

@media(max-width:760px){
  .emptyMode .assistantPanel{max-width:100%}
  .emptyMode .mioraBanner{height:238px;margin:0 calc((100% - 100vw)/2)}
  .emptyMode .bannerStage{height:224px}
  .bannerCard{aspect-ratio:1.8/1;border-radius:17px}
  .bannerFeatureCard{padding:8%}.bannerFeatureCard p{display:none}.bannerFeatureCard small{font-size:8px}.bannerFeatureCard strong{font-size:22px}
  .bannerArrowLeft{left:8px}.bannerArrowRight{right:8px}
  .emptyMode .mioraHero{height:66px;margin-top:12px}
  .emptyMode .creationTabs{overflow-x:auto}.emptyMode .creationTabs button{min-width:108px}
  .emptyMode .upstreamComposer{min-height:142px;margin-top:10px;padding:12px;grid-template-rows:minmax(66px,auto) auto}
  .emptyMode .composerMascot{right:18px;top:-126px;width:168px;height:116px}
  .upstreamComposer .toolbarLeft,.emptyMode .upstreamComposer .toolbarLeft{flex-wrap:wrap;height:auto}
  .toolLabel{display:none}
  .upstreamComposer .roundIconBtn.assetTrigger,.upstreamComposer .roundIconBtn.skillButton,.upstreamComposer .roundIconBtn.reasoningButton{width:34px;padding:0}
  .modelSlot{min-width:0}.modelSlotLabel{display:none}.modelSlot :deep(.t-select__wrap),.modelSlot :deep(.t-select){width:130px}.composerCostHint{display:none!important}
  .upstreamComposer .settingPill{max-width:118px;padding:0 9px;font-size:11px}
}

/* 2026-10-08 creation launch redesign: compact the oversized carousel, remove
   the accidental viewport-height spacer, and make model ownership / billing
   understandable before the user enters the canvas. */
.emptyMode.aiAssistant{
  background:
    radial-gradient(circle at 58% 18%,rgba(255,132,52,.075),transparent 28%),
    linear-gradient(180deg,#fff 0%,#fbfbfc 72%,#fff 100%);
}
.emptyMode .assistantPanel{max-width:min(1160px,calc(100% - 44px))}
.emptyMode .mainScrollArea{padding-top:18px;overflow:visible}
.emptyMode .emptyStage{width:100%}
.emptyMode .mioraBanner{height:280px;margin:0 calc((1160px - 100vw)/2)}
.emptyMode .bannerStage{height:272px}
.emptyMode .bannerCard{aspect-ratio:2.62/1;border-radius:20px}
.emptyMode .bannerFeatureCard{padding:7% 8.5%;gap:8px}
.emptyMode .bannerFeatureCard strong{font-size:clamp(23px,1.8vw,30px)}
.creationDock{position:relative;width:100%;height:116px;flex:none;margin:8px 0 0}
.emptyMode .creationTabs{inset:auto 0 0 0;width:100%;height:46px;padding:5px;border:1px solid #e8e8eb;border-radius:24px;background:rgba(247,247,248,.92);box-shadow:none;backdrop-filter:blur(14px)}
.emptyMode .creationTabs button{height:36px;border-radius:18px;color:#666;font-size:14px}.emptyMode .creationTabs button.active{background:#222;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.16)}
.creationDockMascot{position:absolute;right:26px;bottom:43px;z-index:3;width:156px;height:96px;overflow:hidden;pointer-events:none;mix-blend-mode:multiply;filter:drop-shadow(0 10px 14px rgba(25,25,30,.14))}
.creationDockMascot video{display:block;width:100%;height:100%;object-fit:contain}

.launchIntro{
  display:grid;grid-template-columns:minmax(0,1fr) minmax(470px,.95fr);align-items:center;gap:36px;
  width:100%;margin:18px 0 4px;padding:4px 2px 0;box-sizing:border-box;
}
.launchEyebrow{display:inline-flex;align-items:center;gap:7px;color:#db5e08;font-size:12px;font-weight:720;letter-spacing:.08em;text-transform:uppercase}
.launchEyebrow svg{font-size:15px}
.launchIntro h1{margin:8px 0 6px;color:#171719;font-size:clamp(25px,2vw,32px);font-weight:740;line-height:1.16;letter-spacing:-.035em}
.launchIntro p{max-width:560px;margin:0;color:#77777f;font-size:13px;line-height:1.7}
.launchSteps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0;padding:0;list-style:none}
.launchSteps li{position:relative;display:flex;align-items:center;gap:10px;min-width:0;padding:12px 13px;border:1px solid #e9e9eb;border-radius:15px;background:rgba(255,255,255,.88);box-shadow:0 5px 18px rgba(30,30,35,.035)}
.launchSteps li:not(:last-child):after{content:"";position:absolute;right:-9px;top:50%;z-index:2;width:9px;height:1px;background:#dedee1}
.launchSteps b{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:9px;background:#fff1e7;color:#d95700;font-size:10px}
.launchSteps span{display:flex;min-width:0;flex-direction:column;gap:2px}.launchSteps strong{overflow:hidden;color:#29292d;font-size:12px;font-weight:680;text-overflow:ellipsis;white-space:nowrap}.launchSteps small{overflow:hidden;color:#9999a1;font-size:10px;text-overflow:ellipsis;white-space:nowrap}

.upstreamComposer,.emptyMode .upstreamComposer{border-color:#e2e2e5;background:rgba(255,255,255,.96);box-shadow:0 18px 55px rgba(34,35,42,.10),0 1px 0 rgba(255,255,255,.8) inset}
.emptyMode .upstreamComposer{
  grid-template-columns:minmax(0,1fr) auto;
  grid-template-rows:minmax(88px,auto) auto auto 44px;
  grid-template-areas:"editor editor" "billing billing" "guide guide" "left right";
  min-height:0;margin:8px 0 18px;padding:14px 16px 12px;gap:8px 12px;border-radius:24px;
}
.emptyMode .upstreamComposer .editorRow{min-height:88px;max-height:210px;padding:2px 6px}
.emptyMode .upstreamComposer .editorRow textarea,.emptyMode .upstreamComposer .editorRow:not(.hasInput) textarea{height:68px;min-height:68px;font-size:16px;line-height:27px}
.emptyMode .upstreamComposer .editorRow .promptCycleHint{top:6px}
.composerMascot{display:none}

.composerBillingBar{grid-area:billing;display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:34px;padding:7px 10px;border:1px solid #eeeef0;border-radius:12px;background:#fafafa;color:#6f6f77;font-size:11px}
.billingNow{display:flex;min-width:0;align-items:center;gap:7px;overflow:hidden}.billingNow strong{max-width:220px;overflow:hidden;color:#29292d;font-size:12px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.billingLabel{flex:none}.billingStatusDot{width:7px;height:7px;flex:none;border-radius:50%;background:#27a66a;box-shadow:0 0 0 4px rgba(39,166,106,.10)}
.inlineCostHint{margin-left:5px;padding-left:10px;border-left:1px solid #e4e4e7;white-space:nowrap}
.billingGuideToggle{display:inline-flex;align-items:center;gap:5px;flex:none;padding:5px 7px;border:0;border-radius:8px;background:transparent;color:#d45a08;font-size:11px;font-weight:650;cursor:pointer}.billingGuideToggle:hover{background:#fff0e6}.billingGuideToggle svg{font-size:13px;transition:transform .18s ease}.billingGuideToggle svg.rotated{transform:rotate(180deg)}
.billingGuide{grid-area:guide;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:2px 0 4px}.billingGuide>p{grid-column:1/-1;margin:0;padding:3px 3px 0;color:#9a9aa1;font-size:10px;line-height:1.5}
.billingGuideCard{display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:9px;min-width:0;padding:10px 11px;border:1px solid #e9e9ec;border-radius:13px;background:#fff}.billingGuideCard.textCard{border-color:#ffdcca;background:#fffaf7}.billingGuideIcon{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:#f4f4f5;color:#555;font-size:14px}.textCard .billingGuideIcon{background:#fff0e6;color:#d95700}.billingGuideCard>div{display:flex;min-width:0;flex-direction:column;gap:2px}.billingGuideCard small{overflow:hidden;color:#929299;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.billingGuideCard strong{overflow:hidden;color:#29292d;font-size:12px;font-weight:680;text-overflow:ellipsis;white-space:nowrap}.billingGuideCard :deep(.modelCostHint){font-size:9px}.billingGuideCard :deep(.modelCostHint .dot){display:none}
.billing-guide-enter-active,.billing-guide-leave-active{transition:.18s ease}.billing-guide-enter-from,.billing-guide-leave-to{opacity:0;transform:translateY(-4px)}

.emptyMode .modelSlot{min-width:250px;padding:0 5px 0 9px;border:1px solid #e7e7e9;border-radius:11px;background:#f7f7f8}.emptyMode .modelSlotLabel{color:#77777e;font-size:10px;font-weight:650}.emptyMode .modelSlot :deep(.t-select__wrap),.emptyMode .modelSlot :deep(.t-select){width:164px}.emptyMode .modelSlot :deep(.t-input){background:transparent!important}
.emptyMode .composerCostHint{display:none}
.emptyMode .sendButton{display:inline-flex!important;width:auto!important;min-width:104px!important;padding:0 16px!important;border-radius:12px!important;gap:7px;background:#1f1f21!important;box-shadow:0 7px 16px rgba(25,25,28,.17)!important}
.sendButtonLabel{font-size:12px;font-weight:670;white-space:nowrap}
.emptyMode .reasoningButton:after{content:"文本";font-size:10px;font-weight:500;opacity:.58}
.emptyMode .inspirationShowcase{margin-top:30px}

@media(min-width:761px){.emptyMode .upstreamComposer{margin-top:8px}}
@media(max-width:980px){
  .launchIntro{grid-template-columns:1fr;gap:16px}.launchSteps{max-width:680px}.emptyMode .toolbarLeft{overflow-x:auto;overflow-y:hidden;padding-bottom:2px}.emptyMode .modelSlot{min-width:220px}
}
@media(max-width:760px){
  .emptyMode .assistantPanel{max-width:100%;padding:0 12px}.emptyMode .mainScrollArea{padding-top:12px;overflow:visible}.emptyMode .mioraBanner{height:226px}.emptyMode .bannerStage{height:218px}.emptyMode .bannerCard{aspect-ratio:1.75/1}.launchIntro{margin-top:12px}.launchIntro h1{font-size:24px}.launchSteps{display:flex;overflow-x:auto}.launchSteps li{min-width:154px}.creationDock{height:98px;margin-top:6px}.creationDockMascot{right:12px;bottom:41px;width:120px;height:72px}.emptyMode .upstreamComposer{grid-template-rows:minmax(72px,auto) auto auto auto;margin-top:7px}.emptyMode .upstreamComposer .editorRow{min-height:72px}.emptyMode .upstreamComposer .editorRow textarea,.emptyMode .upstreamComposer .editorRow:not(.hasInput) textarea{height:54px;min-height:54px}.composerBillingBar{align-items:flex-start}.billingNow{flex-wrap:wrap}.billingLabel,.inlineCostHint{display:none}.billingGuide{grid-template-columns:1fr}.billingGuide>p{grid-column:1}.emptyMode .toolbarLeft{grid-column:1/-1;flex-wrap:nowrap}.emptyMode .toolbarRight{grid-column:1/-1;justify-content:flex-end}.emptyMode .modelSlot{min-width:210px}.emptyMode .modelSlotLabel{display:inline}.emptyMode .sendButton{min-width:96px!important}.emptyMode .reasoningButton:after{display:none}
}

/* Final visual polish: a calm creation surface with one clear primary action. */
.creationDock{height:110px;margin-top:10px}
.emptyMode .creationTabs{
  height:54px;padding:6px;border:1px solid rgba(44,39,35,.07);border-radius:19px;
  background:rgba(247,246,245,.82);box-shadow:0 8px 26px rgba(37,32,28,.045),inset 0 1px 0 rgba(255,255,255,.85);
}
.emptyMode .creationTabs button{
  position:relative;height:40px;gap:9px;border:1px solid transparent;border-radius:14px;color:#77736f;
  font-size:13px;font-weight:590;transition:background .18s ease,border-color .18s ease,color .18s ease,box-shadow .18s ease,transform .18s ease;
}
.emptyMode .creationTabs button:hover{background:rgba(255,255,255,.74);color:#35312e}
.emptyMode .creationTabs button.active{
  border-color:rgba(235,103,20,.15);background:linear-gradient(180deg,#fff 0%,#fff8f3 100%);color:#26221f;
  box-shadow:0 5px 16px rgba(54,45,38,.08),0 1px 2px rgba(54,45,38,.045);
}
.emptyMode .creationTabs button.active:after{content:"";position:absolute;left:50%;bottom:3px;width:18px;height:2px;border-radius:2px;background:#ef6b14;transform:translateX(-50%)}
.emptyMode .creationTabs .categoryIcon{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:rgba(255,255,255,.72);color:#8d8883;font-size:14px;transition:.18s ease}
.emptyMode .creationTabs button.active .categoryIcon{background:#fff0e6;color:#e66008}
.creationDockMascot{right:30px;bottom:47px;width:148px;height:90px;filter:drop-shadow(0 12px 17px rgba(25,25,30,.12))}

.upstreamComposer,.emptyMode .upstreamComposer{
  border:1px solid rgba(46,39,33,.085);border-radius:26px;background:linear-gradient(180deg,rgba(255,255,255,.99) 0%,rgba(255,253,251,.98) 100%);
  box-shadow:0 24px 70px rgba(40,34,29,.09),0 3px 12px rgba(40,34,29,.035),inset 0 1px 0 #fff;
}
.emptyMode .upstreamComposer{margin-top:8px;padding:15px 16px 13px;gap:7px 12px}
.upstreamComposer:focus-within,.emptyMode .upstreamComposer:focus-within{border-color:rgba(229,104,26,.24);box-shadow:0 26px 74px rgba(40,34,29,.105),0 0 0 3px rgba(238,108,25,.055)}
.emptyMode .upstreamComposer .editorRow{padding:4px 8px 0}
.emptyMode .upstreamComposer .promptCycleHint{left:9px;right:9px;top:8px;gap:11px}
.promptSpark{width:32px;height:32px;border-radius:11px;background:linear-gradient(145deg,#fff5ee,#ffe9db);color:#e75f07;box-shadow:0 5px 14px rgba(225,92,8,.09)}
.upstreamComposer .promptCycleHint .promptCycleLabel,.emptyMode .upstreamComposer .promptCycleHint .promptCycleLabel{color:#7d7874;font-size:15px}
.upstreamComposer .promptCycleHint kbd,.emptyMode .upstreamComposer .promptCycleHint kbd{border:0;background:#f4f2f0;color:#aaa49f;box-shadow:none}

.composerBillingBar{
  min-height:32px;padding:7px 5px 8px;border:0;border-top:1px solid #f0ece9;border-radius:0;background:transparent;color:#827d78;
}
.billingNow{gap:7px}.billingNow strong{color:#302c29;font-size:11px;font-weight:680}.billingStatusDot{width:6px;height:6px;background:#32aa72;box-shadow:0 0 0 4px rgba(50,170,114,.09)}
.inlineCostHint{border-left-color:#e9e4e0;color:#928d88}
.billingGuideToggle{padding:6px 9px;border-radius:9px;color:#d85b08;font-size:10px}.billingGuideToggle:hover{background:#fff1e7}
.billingGuide{gap:7px;padding:3px 0 5px}
.billingGuideCard{grid-template-columns:30px minmax(0,1fr);gap:9px;padding:9px 10px;border-color:#eeeae7;border-radius:12px;background:rgba(255,255,255,.8);box-shadow:0 3px 12px rgba(44,38,34,.025)}
.billingGuideCard.textCard{border-color:#f4d8c5;background:#fff8f3}.billingGuideIcon{width:30px;height:30px;border-radius:9px}.billingGuide>p{color:#a09a95}

.emptyMode .toolbarLeft,.emptyMode .toolbarRight{height:42px}
.upstreamComposer .roundIconBtn.assetTrigger,.upstreamComposer .roundIconBtn.skillButton,.upstreamComposer .roundIconBtn.reasoningButton,.upstreamComposer .settingPill{
  height:36px;border:1px solid transparent;border-radius:12px;background:#f5f3f1;color:#55504c;transition:.17s ease;
}
.upstreamComposer .roundIconBtn.assetTrigger:hover,.upstreamComposer .roundIconBtn.skillButton:hover,.upstreamComposer .roundIconBtn.reasoningButton:hover,.upstreamComposer .settingPill:hover{border-color:#e9e3df;background:#fff;color:#2c2926;box-shadow:0 4px 11px rgba(44,38,34,.06)}
.emptyMode .modelSlot{height:36px;min-width:238px;padding:0 4px 0 10px;border:1px solid transparent;border-radius:12px;background:#f5f3f1;gap:7px}
.emptyMode .modelSlot:hover{border-color:#e9e3df;background:#fff}
.emptyMode .modelSlotLabel{color:#8a847f;font-size:10px;letter-spacing:.02em}
.emptyMode .modelSlot :deep(.t-input){height:32px!important;padding-left:7px!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#302c29!important}
.emptyMode .modelSlot :deep(.t-input__inner){font-size:12px;font-weight:620}
.emptyMode .sendButton{height:38px!important;min-width:108px!important;border-radius:13px!important;background:linear-gradient(135deg,#262321,#171615)!important;box-shadow:0 9px 20px rgba(25,22,20,.18)!important}
.emptyMode .sendButton:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 12px 24px rgba(25,22,20,.23)!important}
.emptyMode .sendButton:disabled{background:#f2f0ee!important;color:#b8b3af!important;box-shadow:none!important}

@media(max-width:760px){
  .creationDock{height:96px}.creationDockMascot{right:12px;bottom:46px;width:116px;height:70px}
  .emptyMode .creationTabs{height:48px;padding:5px;border-radius:17px}.emptyMode .creationTabs button{height:36px;min-width:104px;border-radius:12px}
  .emptyMode .creationTabs .categoryIcon{width:21px;height:21px}.emptyMode .upstreamComposer{border-radius:22px;padding:12px}
  .composerBillingBar{align-items:center}.billingGuideToggle{white-space:nowrap}.emptyMode .modelSlot{min-width:205px}
}
</style>

<!-- 非 scoped 全局段:IP mascot 眨眼动效 + 暗模式身体灰度适配 + 减弱运动守护(affectation 不能受 scoped 数据属性哈希约束否则 :root/.dark 选择器失配)-->
<style lang="scss">
.ip-eye-white,.ip-eye-pupil{transform-box:fill-box;transform-origin:center;}
.ip-eye-white{animation:xo-ipBlinkWhite 4.2s ease-in-out infinite;}
.ip-eye-pupil{animation:xo-ipBlinkPupil 4.2s ease-in-out infinite;}
@keyframes xo-ipBlinkWhite{0%,44%,48%,100%{transform:scaleY(1);}46%{transform:scaleY(.08);}}
@keyframes xo-ipBlinkPupil{0%,44%,48%,100%{transform:translateY(0) scaleY(1);}46%{transform:translateY(.8px) scaleY(.12);}}
@media(prefers-reduced-motion:reduce){.ip-eye-white,.ip-eye-pupil{animation:none;}}
/* 暗模式:IP 身躯亮度反相转中度灰维持辨识度 */
:root[data-theme=dark] .ip-body,:root.dark .ip-body{filter:brightness(0) invert(.45);}
</style>
