<!-- 应用壳：侧栏 + 顶栏 + router-view + 全局弹窗（从 pages/workbench/index.vue 抽出，零视觉变化） -->
<template>
  <div class="appShell">
    <!-- 全站公告横幅：横贯整页顶部（侧栏也在它下面），管理员在控制台发布 -->
    <Transition name="drop">
      <div v-if="showSiteBanner && !isEditorWorkspace" class="siteBanner" :class="`theme-${siteBanner?.theme || 'brand'}`" role="region" aria-label="全站公告横幅">
        <span class="siteBannerText">{{ siteBanner?.text }}</span>
        <button v-if="siteBanner?.ctaLabel && siteBanner?.link" type="button" class="siteBannerCta" @click="handleBannerCta">
          {{ siteBanner.ctaLabel }}<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="siteBannerClose" aria-label="关闭横幅" @click="dismissSiteBanner"><i-close size="14px" /></button>
      </div>
    </Transition>
  <div class="main" :class="{ 'menu-collapsed': menuCollapsed, 'canvas-fullscreen': isCanvasFullscreen, 'canvas-nav-open': canvasNavOpen, 'editor-fullscreen': isEditorWorkspace }" :style="{ height: showSiteBanner && !isEditorWorkspace ? 'calc(100vh - 44px)' : '100vh', '--sidebar-width': menuCollapsed ? '72px' : '272px' }">
    <!-- 背景装饰 - 纸面质感点阵 -->
    <div class="bg-decoration"></div>

    <div id="workbench-navigation" class="menu" :class="{ collapsed: menuCollapsed }">
      <!-- Logo 区：点击回到工作台首页（项目列表） -->
      <div class="logoBox" role="button" tabindex="0" aria-label="返回智能创作" @click.stop="router.push('/aiAssistant')" @keydown.enter="router.push('/aiAssistant')" @keydown.space.prevent="router.push('/aiAssistant')">
        <div class="logo" :style="siteBrand.logo ? {backgroundImage: `url(${JSON.stringify(siteBrand.logo)})`} : undefined"></div>
        <div class="brand-name" v-show="!menuCollapsed"><strong>{{ workbenchBrandName }}</strong><span v-if="!siteBrand.hideSubtitle && siteBrand.subtitle" class="studio-signature"><i aria-hidden="true"></i>{{ siteBrand.subtitle }}</span></div>
        <!-- 收起/展开：展开时贴 Logo 行右侧；收起后平时隐藏，光标悬停 Logo 区原地浮现（即梦同款交互） -->
        <button
          v-if="!isCanvasFullscreen || canvasNavOpen"
          type="button"
          class="sidebar-toggle collapse-btn"
          @click.stop="toggleSidebar"
          :aria-expanded="!menuCollapsed"
          aria-controls="workbench-navigation"
          :aria-label="isCanvasFullscreen ? '关闭工作台导航' : (menuCollapsed ? '展开侧栏' : '收起侧栏')"
          :title="isCanvasFullscreen ? '关闭工作台导航' : (menuCollapsed ? '展开侧栏' : '收起侧栏')">
          <!-- 即梦同款收起/展开图标：圆角方框 + 左侧竖条（填充式，hover 只变色不位移） -->
          <svg width="16" height="16" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" role="presentation" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g><path d="M9 8a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Z" fill="currentColor"></path><path d="M17.5 3A4.5 4.5 0 0 1 22 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-11A4.5 4.5 0 0 1 2 16.5v-9A4.5 4.5 0 0 1 6.5 3h11Zm-11 2A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19h11a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 17.5 5h-11Z" clip-rule="evenodd" fill-rule="evenodd" fill="currentColor"></path></g></svg>
        </button>
      </div>
      <!-- 主导航 -->
      <div class="itemBox">
        <template v-for="(menu, index) in menuList" :key="index">
          <div v-if="menu.type === 'group'" class="nav-group-title" v-show="!menuCollapsed"><small aria-hidden="true">{{ menu.label === '创作' ? '01' : '02' }}</small><span>{{ menu.label }}</span><i aria-hidden="true"></i></div>
          <ScriptCreationMenu v-else-if="menu.scriptCenter" :collapsed="menuCollapsed" />
          <t-tooltip
            v-else
            :content="menuLabel(menu)"
            placement="right"
            destroyOnClose
            :showArrow="false">
            <div
              class="item"
              v-if="menu.type === 'btn'"
              role="button"
              tabindex="0"
              :aria-label="menuLabel(menu)"
              :aria-current="activeMenu == menu.path || (menu.canvasCenter && activeMenu.startsWith('/canvas')) ? 'page' : undefined"
              :class="{ active: activeMenu == menu.path || (menu.canvasCenter && activeMenu.startsWith('/canvas')) }"
              @pointerenter="warmPage(menu.path!)"
              @focus="warmPage(menu.path!)"
              @touchstart.passive="warmPage(menu.path!)"
              @click="handleClick(menu)"
              @keydown.enter="handleClick(menu)"
              @keydown.space.prevent="handleClick(menu)">
              <component :is="menu.icon" class="icon" />
              <span class="item-title" v-show="!menuCollapsed">{{ menuLabel(menu) }}</span>
              <button
                v-if="menu.canvasCenter && !menuCollapsed"
                type="button"
                class="item-action"
                aria-label="新建画布"
                title="新建画布"
                @click.stop="handleNewCanvas">+</button>
            </div>
          </t-tooltip>
        </template>
      </div>
      <div class="sidebar-tools">
        <div class="nav-utility-divider" aria-hidden="true"></div>
        <t-tooltip content="更多工具" placement="right" destroyOnClose :showArrow="false">
          <button
            ref="toolsTriggerRef"
            type="button"
            class="item tools-trigger"
            :class="{ active: utilityMenuActive, open: toolsMenuOpen }"
            aria-label="更多创作工具"
            :aria-expanded="toolsMenuOpen"
            @click.stop="toggleToolsMenu">
            <i-toolkit class="icon" />
            <span class="item-title" v-show="!menuCollapsed">更多工具</span>
            <t-icon v-show="!menuCollapsed" class="tools-arrow" name="chevron-right" size="15px" />
            <span v-if="utilityMenuActive && !menuCollapsed" class="tools-active-dot" aria-hidden="true"></span>
          </button>
        </t-tooltip>
      </div>
      <!-- 底部账户区：余额是常用信息，账户菜单是独立入口 -->
      <div class="footItem">
        <p v-if="siteBrand.footer && !menuCollapsed" class="site-brand-footer">{{ siteBrand.footer }}</p>
        <t-tooltip content="积分明细" placement="right" :showArrow="false">
        <div class="member-btn" role="button" tabindex="0" aria-label="查看积分明细" @click="openUsageDetails" @keydown.enter="openUsageDetails">
          <div class="credits-summary" v-show="!menuCollapsed"><span>积分余额</span><strong :class="balanceFitClass">{{ sidebarBalanceText }}</strong></div>
          <button class="member-btn-inner" type="button" :aria-label="menuCollapsed ? '查看积分明细' : '充值积分'" @click.stop="menuCollapsed ? openUsageDetails() : goConsoleTopup()">
            <i-wallet v-if="menuCollapsed" class="wallet-icon" />
            <span class="member-text" v-show="!menuCollapsed">充值积分</span>
          </button>
        </div>
        </t-tooltip>
        <div class="sidebar-account-row">
        <div class="user-foot" ref="userFootRef" role="button" tabindex="0" aria-label="打开账号、团队与余额菜单" @click="toggleFootMenu" @keydown.enter="toggleFootMenu" @keydown.space.prevent="toggleFootMenu">
          <div class="user-avatar">{{ userInitial }}</div>
          <div class="user-meta" v-show="!menuCollapsed">
            <span class="user-name">{{ username }}</span>
            <span class="user-role">XOi ID · {{ displayId || userId || '—' }}</span>
          </div>
          <t-icon v-show="!menuCollapsed" class="user-menu-chevron" name="chevron-up" size="16px" />
        </div>
        </div>
      </div>
    </div>
    <div class="view" :class="{ 'story-workspace': ['/project', '/project/new', '/novel', '/scriptAgent', '/script', '/cornerScape', '/production', '/assets'].includes(route.path) }">
      <div class="topMenu" v-if="!isImmersive && project?.id && isProjectPage">
        <!-- 面包屑（打开项目后显示）：工作台 → 项目列表；项目名 → 该项目首页 -->
        <div class="breadcrumb" v-if="project?.id">
          <button type="button" class="bc-item bc-link" title="返回项目列表" @click="router.push('/project')">项目列表</button>
          <span class="bc-sep">/</span>
          <button
            type="button"
            class="bc-item bc-link"
            :title="project.projectType === 'novel' ? '回到项目首页（原文）' : '回到项目首页（剧本整理）'"
            @click="router.push({ path: project.projectType === 'novel' ? '/novel' : '/script', query: { projectId: String(project.id) } })">{{ project?.name }}</button>
          <span class="bc-sep">/</span>
          <span class="bc-item current">{{ currentPageName }}</span>
        </div>
        <!-- 流水线进度带：跨页面常驻，随时知道这个项目做到哪一步了 -->
        <PipelineProgress
          v-if="project?.progress"
          class="topProgress"
          :progress="project.progress"
          :project-type="project.projectType"
          size="sm" />
        <div class="top-right">
          <!-- 项目级快捷入口 -->
          <div class="shortcuts" v-if="project?.id">
            <template v-for="(menu, index) in rightBtnList" :key="index">
              <div
                class="shortcut"
                v-if="menu.type === 'btn' && (project.projectType === 'novel' || !menu.nodelOnly)"
                :class="{ active: activeMenu == menu.path }"
                :title="menu.description"
                :aria-label="`${menu.label}：${menu.description}`"
                @pointerenter="warmPage(menu.path!)"
              @focus="warmPage(menu.path!)"
              @touchstart.passive="warmPage(menu.path!)"
              @click="handleClick(menu)">
                <component :is="menu.icon" class="icon" />
                <span class="label">{{ menu.label }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
      <div id="pipeline-dock" class="pipelineDock" aria-label="创作流程提示"></div>
      <div class="viewBox">
        <router-view v-slot="{ Component }">
          <component :is="Component" v-if="!['/canvas','/script/one-stop'].includes(route.path)" :key="route.path === '/production' ? `${route.path}:${route.query.projectId || ''}` : route.fullPath" />
        </router-view>
        <CanvasWorkspace v-if="canvasSession" v-show="route.path === '/canvas'" :key="canvasSession" :active="route.path === '/canvas'" @editor-state="canvasEditorOpen = $event" />
        <OneStopWorkspace v-if="oneStopSession" v-show="route.path === '/script/one-stop'" :key="oneStopSession" />
        <div v-if="navigationPending" class="route-progress" role="status" aria-label="正在打开页面"><span></span></div>
      </div>
    </div>
  </div>

  <!-- 侧栏用户菜单（Teleport 到 body，避免被侧栏 overflow 裁剪） -->
  <Teleport to="body">
    <Transition name="drop">
      <div class="foot-dropdown" v-show="footMenuOpen" :style="footDropStyle" @click.stop>
        <section class="account-card">
          <div class="account-profile">
            <div class="account-avatar">{{ userInitial }}</div>
            <div class="account-id">
              <strong>{{ username || 'XOi 创作者' }}</strong>
              <span>XOi ID · {{ displayId || userId || '—' }}</span>
            </div>
            <img class="account-mark" src="@/assets/XOI_logo.png" alt="" aria-hidden="true" />
          </div>
          <div class="credits-row">
            <button class="credits-detail-link" type="button" @click="openUsageDetails"><span class="credits-label">积分余额</span><small>查看明细 →</small><strong :class="balanceFitClass">{{ sidebarBalanceText }}</strong></button>
            <button class="recharge-btn" type="button" @click="goConsoleTopup(); footMenuOpen = false">充值积分</button>
          </div>
        </section>
        <section class="account-menu">
          <button type="button" class="drop-item team-entry" @click="goTeamSpace"><i-people class="d-icon" /><span>{{ teamMenuLabel }}</span><em v-if="teamRole !== 'none'">{{ teamRole === 'owner' ? '主账号' : '成员' }}</em><i-right class="drop-arrow" /></button>
          <div class="drop-divider"></div>
          <button type="button" class="drop-item" @click="notifyMenu('语言设置')"><i-earth class="d-icon" /><span>语言</span><em>简体中文</em><i-right class="drop-arrow" /></button>
          <button type="button" class="drop-item" @click="footMenuOpen = false; welcomeOpen = true"><i-help class="d-icon" /><span>平台介绍</span><i-right class="drop-arrow" /></button>
          <a class="drop-item" href="mailto:support@xoi.studio"><i-mail class="d-icon" /><span>联系我们</span><i-right class="drop-arrow" /></a>
          <button type="button" class="drop-item" @click="openNotices"><i-remind class="d-icon" /><span>通知公告</span><span class="notice-dot" v-if="hasUnreadNotices"></span></button>
          <button type="button" class="drop-item" @click="openFeedback"><i-comments class="d-icon" /><span>问题反馈</span><i-right class="drop-arrow" /></button>
          <button type="button" v-if="isAdmin" class="drop-item admin-entry" @click="goConsoleAdmin"><i-dashboard class="d-icon" /><span>管理控制台</span><em>Admin</em><i-right class="drop-arrow" /></button>
          <div class="drop-divider"></div>
          <button type="button" class="drop-item danger" @click="handleLogout"><i-logout class="d-icon" /><span>登出账号</span></button>
        </section>
      </div>
    </Transition>
  </Teleport>

  <!-- 专项能力从一级导航收进这里，新增功能不会继续挤压侧栏。 -->
  <Teleport to="body">
    <Transition name="tools-pop">
      <aside v-show="toolsMenuOpen" class="tools-popover" :style="toolsDropStyle" @click.stop>
        <header class="tools-popover-head">
          <strong>更多创作工具</strong>
          <small>按创作需要选择</small>
        </header>
        <div class="tools-popover-list">
          <button
            v-for="tool in utilityMenu"
            :key="tool.path"
            type="button"
            class="tools-popover-item"
            :class="{ active: activeMenu === tool.path }"
            @click="handleClick(tool)">
            <span class="tools-popover-icon"><component :is="tool.icon" /></span>
            <span class="tools-popover-copy"><strong>{{ tool.label }}</strong><small>{{ tool.description }}</small></span>
            <em>{{ tool.badge }}</em>
            <t-icon name="chevron-right" size="15px" />
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>


  <!-- 个人信息弹窗 - 苹果风格居中 -->
  <Teleport to="body">
    <Transition name="profile-fade" :duration="{ enter: 240, leave: 160 }">
      <div v-if="showUserProfile" class="profile-overlay" @click.self="showUserProfile = false">
        <Transition name="profile-scale">
          <div v-if="showUserProfile" class="profile-modal">
            <!-- 关闭按钮 -->
            <div class="profile-close" @click="showUserProfile = false">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>

            <!-- 头部区域 -->
            <div class="profile-header">
              <div class="profile-avatar">
                <i-user size="36" />
              </div>
              <div class="profile-name">{{ username }}</div>
              <div class="profile-role" :class="{ 'is-admin': isAdmin }">
                {{ isAdmin ? '管理员' : '普通用户' }}
              </div>
              <!-- 底层仍由 NewAPI quota 结算，产品层统一按 1 元 = 10 积分展示。 -->
              <div class="profile-points">
                <div class="profile-points-num">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
                  </svg>
                  <span :class="balanceFitClass">{{ sidebarBalanceText }}</span>
                </div>
                <button class="profile-points-detail" @click="showUserProfile = false; goConsoleTopup()">充值积分</button>
              </div>
            </div>

            <!-- 表单区域（改密码已收敛到网关侧，这里只支持改显示名称） -->
            <div class="profile-body">
              <div class="profile-field">
                <label class="profile-label">显示名称</label>
                <input
                  v-model="profileForm.name"
                  type="text"
                  class="profile-input"
                  placeholder="请输入显示名称"
                />
              </div>
            </div>

            <!-- 底部按钮 -->
            <div class="profile-footer">
              <button class="profile-btn profile-btn-cancel" @click="showUserProfile = false">取消</button>
              <button class="profile-btn profile-btn-save" @click="handleUpdateProfile" :disabled="profileLoading">
                <span v-if="profileLoading" class="profile-spinner"></span>
                {{ profileLoading ? '保存中...' : '保存修改' }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- 积分明细：复用 console 内已对接 NewAPI logs 的 UsageDialog，不在 Vue 再造第二套账单。 -->
  <Teleport to="body">
    <Transition name="profile-fade" :duration="{ enter: 240, leave: 160 }">
      <div v-if="usageFrameOpen" class="topup-frame-overlay" @click.self="usageFrameOpen = false">
        <iframe class="topup-frame usage-frame" :src="usageFrameSrc" title="积分与消费明细" allowtransparency="true" />
      </div>
    </Transition>
  </Teleport>

  <!-- 充值弹窗：透明 iframe 内嵌 console 充值面板（造物 TopupDialog）。
       轻遮罩 + 模糊，背后主站内容可见；弹窗本体在 iframe 内居中，
       关闭（X / 遮罩 / 支付到账）由 iframe postMessage xoi:topup:close 收起。 -->
  <Teleport to="body">
    <Transition name="profile-fade" :duration="{ enter: 240, leave: 160 }">
      <div v-if="topupFrameOpen" class="topup-frame-overlay" @click.self="topupFrameOpen = false">
        <iframe class="topup-frame" :src="topupFrameSrc" title="在线充值" />
      </div>
    </Transition>
  </Teleport>

  <!-- 通知公告弹窗（照造物 announcements：静态 JSON 驱动，站长热换 backend/data/web/announcements.json） -->
  <Teleport to="body">
    <Transition name="profile-fade" :duration="{ enter: 240, leave: 160 }">
      <div v-if="noticeOpen" class="profile-overlay" @click.self="noticeOpen = false">
        <div class="profile-modal notice-modal">
          <div class="profile-close" @click="noticeOpen = false">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <template v-if="currentNotice">
            <div class="notice-head">
              <span class="notice-tag" :class="`is-${currentNotice.type || 'notice'}`">{{ noticeTypeLabel(currentNotice) }}</span>
              <span class="notice-date">{{ noticeDate(currentNotice) }}</span>
            </div>
            <h3 class="notice-title">{{ currentNotice.title }}</h3>
            <div class="notice-body">{{ currentNotice.content }}</div>
            <div class="notice-pager" v-if="notices.length > 1">
              <span class="notice-count">{{ noticeIndex + 1 }} / {{ notices.length }}</span>
              <div class="notice-dots">
                <button v-for="(n, i) in notices" :key="n.id" type="button" :class="{ on: i === noticeIndex }" @click="noticeIndex = i" :aria-label="`第 ${i + 1} 条`"></button>
              </div>
              <div class="notice-nav">
                <button type="button" :disabled="noticeIndex === 0" @click="noticeIndex--" aria-label="上一条">‹</button>
                <button type="button" :disabled="noticeIndex >= notices.length - 1" @click="noticeIndex++" aria-label="下一条">›</button>
              </div>
            </div>
          </template>
          <div v-else class="notice-empty">暂无公告</div>
        </div>
      </div>
    </Transition>
  </Teleport>

  </div>

  <PlatformWelcome v-if="welcomeOpen" v-model="welcomeOpen" @done="completeWelcome" />
</template>

<script setup lang="ts">
import ScriptCreationMenu from '@/components/ScriptCreationMenu.vue';
import { ref, computed, watch, onMounted, onBeforeUnmount, defineAsyncComponent, provide } from 'vue';
import '@/styles/storyWorkspace.scss';
import { navigationPending, warmPage } from "@/router/pageLoading";
import {siteBrand,workbenchBrandName} from "@/utils/siteBrand";
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());
import userStore from "@/stores/user";
import { formatPoints, yuanToPoints } from "@/utils/points";
// aiAssistant 页运行期逃生口：让 isImmersive 白名单对该路由网开一面以显出全局导航（详见 stores/uiPrefs.ts）
import uiPrefsStore from "@/stores/uiPrefs";
import settingStore from "@/stores/setting";
import { resolveThemeMode } from "@/utils/theme";
import { MessagePlugin } from "tdesign-vue-next";
import PipelineProgress from "@/components/pipeline/PipelineProgress.vue";
const CanvasWorkspace = defineAsyncComponent(() => import("@/views/canvas/index.vue"));
const canvasSession = ref("");
const OneStopWorkspace=defineAsyncComponent(()=>import('@/views/oneStop/index.vue'));
const oneStopSession=ref("");
const scriptQuickDestination = ref('/script/one-stop');
provide('scriptQuickDestination', scriptQuickDestination);
const PlatformWelcome = defineAsyncComponent(() => import("@/components/PlatformWelcome.vue"));
const welcomeOpen = ref(false);
const welcomeKey = () => `xoi.platform-welcome.v1:${uStore.userId || "current"}`;
function completeWelcome() { try { localStorage.setItem(welcomeKey(), "done"); } catch {} }
const uStore = userStore();
const { username, userId, displayId, isAdmin, balance } = storeToRefs(uStore);
const userInitial = computed(() => (username.value || "X").trim().charAt(0).toUpperCase());
/** 底层仍保存人民币口径；产品层按 1 元 = 10 积分展示。 */
const userBalanceText = computed(() => formatPoints(Math.floor(yuanToPoints(Number(balance.value || 0)))));
// 侧栏积分卡专用：整数显示（不带小数点），并按位数给出缩放档位 —— 长数字自动缩小，不再顶到「充值积分」按钮。
// balance 存的是人民币口径，这里必须 ×10 换成积分（此前漏乘，侧栏把元数当积分显示，与画布/账单差 10 倍）。
const sidebarBalanceText = computed(() => formatPoints(Math.floor(yuanToPoints(Number(balance.value || 0)))));
const balanceFitClass = computed(() => {
  const len = sidebarBalanceText.value.length - 3; // 去掉「 积分」后的字符数（含千分位逗号）
  return len >= 9 ? "fit-xs" : len >= 7 ? "fit-sm" : "";
});
/** 充值弹窗（站内透明 iframe 内嵌 /console/topup?embed=1，造物 TopupDialog 弹窗体系）：
 *  不再整页跳 console——跳走后背后是空落点页、弹窗还是深色。现在主站就地弹轻遮罩弹窗，
 *  背后主站内容可见；iframe 里的弹窗关闭时 postMessage(xoi:topup:close) 通知本壳收起。
 *  主题经 ?theme= 传给 console（跟随主站浅色/深色），弹窗配色与主站一致。
 *  ⚠️ 别指到 /console/reseller/finance——那是代理收益/提现管理页，不是充值入口。 */
const topupFrameOpen = ref(false);
const topupFrameSrc = computed(() => {
  const theme = resolveThemeMode(settingStore().themeSetting.mode);
  return `/console/topup?embed=1&theme=${theme}`;
});
function goConsoleTopup() {
  footMenuOpen.value = false;
  topupFrameOpen.value = true;
}
function closeTopupFrameOnMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.data?.type !== 'xoi:topup:close') return;
  topupFrameOpen.value = false;
  // 支付到账后余额角标即时刷新
  void uStore.refreshProfile();
}

// 积分明细与充值共用 console 的账户弹窗体系，底层数据都来自 NewAPI。
const usageFrameOpen = ref(false);
const usageFrameSrc = computed(() => {
  const theme = resolveThemeMode(settingStore().themeSetting.mode);
  return `/console/usage?embed=1&theme=${theme}`;
});
function openUsageDetails() {
  footMenuOpen.value = false;
  usageFrameOpen.value = true;
}
function closeUsageFrameOnMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.data?.type !== 'xoi:usage:close') return;
  usageFrameOpen.value = false;
}

// 主导航只承载高频创作路径；专项能力进入「更多工具」，避免功能增长继续挤压侧栏。
// 2026-10-24 排序与命名（用户拍板）：智能创作置顶并作为首页落地页；导演工作台更名
// 白模预演（页面内全称「白模预演工作台」）；创作项目更名短剧工坊，挂 New 徽标。
const baseMenu = [
  { type: "group", label: "创作" },
  { type: "btn", path: "/aiAssistant", label: "智能创作", icon: "i-sparkle" },
  { type: "btn", path: "/canvas", label: "无限画布", icon: "i-edit", canvasCenter: true },
  { type: "btn", path: "/director3d", label: "白模预演", icon: "i-reel" },
  { type: "btn", path: "/project", label: "短剧工坊", icon: "i-movie-board", scriptCenter:true },
  { type: "group", label: "资源" },
  { type: "btn", path: "/assets", label: "资产中心", icon: "i-receive" },
  { type: "btn", path: "/square", label: "灵感广场", icon: "i-lightning" },
];
const menuList = computed(() => baseMenu);
const utilityMenu = [
  { type: "btn", path: "/editor", query: { mode: "standalone" }, label: "独立剪辑", description: "导入本地素材，直接剪辑与导出", icon: "i-cutting-one", badge: "创作" },
  { type: "btn", path: "/viral-replicate", label: "爆款复刻", description: "拆解视频、反推提示词与复刻节奏", icon: "i-fire", badge: "热门" },
  { type: "btn", path: "/skills", label: "Skill 市场", description: "发现并管理可复用的创作能力", icon: "i-toolkit", badge: "扩展" },
];

const rightBtnList = ref([
  { type: "btn", path: "/novel", label: "导入素材", description: "导入小说原文或已有剧本", icon: "i-file-text", nodelOnly: true },
  { type: "btn", path: "/scriptAgent", label: "AI 改编（可选）", description: "需要把故事改编成短剧时使用，不是必经环节", icon: "i-magic", nodelOnly: true },
  { type: "btn", path: "/script", label: "剧本整理", description: "把原文或已有剧本整理成可制作的分集剧本", icon: "i-editing" },
  { type: "btn", path: "/cornerScape", label: "角色场景", description: "提取并生成角色、场景和道具", icon: "i-user" },
  { type: "btn", path: "/production", label: "分镜成片", description: "制作分镜、画面、视频并合成成片", icon: "i-play" },
  { type: "divider", label: "" },
  { type: "btn", path: "/assets", label: "项目素材", description: "查看当前项目生成的全部素材", icon: "i-folder-open", projectScoped: true },
]);

const router = useRouter();
const route = useRoute();
watch(() => route.fullPath, value => { if (route.path === '/script/one-stop') scriptQuickDestination.value = value; }, { immediate: true });
watch([() => uStore.token, () => uStore.userId], () => { scriptQuickDestination.value = '/script/one-stop'; });
watch([() => route.path, () => uStore.token, () => uStore.userId], ([path, token, account]) => {
  if (!token || (oneStopSession.value && oneStopSession.value !== `${account}:${token}`)) oneStopSession.value = "";
  if (path === "/script/one-stop" && token) oneStopSession.value = `${account}:${token}`;
  if (!token || (canvasSession.value && canvasSession.value !== `${account}:${token}`)) canvasSession.value = "";
  if (path === "/canvas" && token) canvasSession.value = `${account}:${token}`;
}, { immediate: true });
// 仅用于 aiAssistant 页那道 runtime 逃生口；director3d/canvas 维持硬沉浸不受其影响
const uiPrefs = uiPrefsStore();
// 桌面默认展开，仅记住手动选择；手机默认图标栏，点击边缘按钮展开。
const narrowSidebarQuery = window.matchMedia("(max-width: 700px)");
const narrowSidebar = ref(narrowSidebarQuery.matches);
const mobileSidebarOpen = ref(false);
function updateNarrowSidebar(event: MediaQueryListEvent) {
  narrowSidebar.value = event.matches;
  mobileSidebarOpen.value = false;
}
onMounted(() => narrowSidebarQuery.addEventListener("change", updateNarrowSidebar));
onUnmounted(() => narrowSidebarQuery.removeEventListener("change", updateNarrowSidebar));
watch(() => route.path, () => { mobileSidebarOpen.value = false; });
const menuCollapsed = computed(() => narrowSidebar.value ? !mobileSidebarOpen.value : uiPrefs.isSidebarCollapsed());
function expandSidebar(){if(narrowSidebar.value)mobileSidebarOpen.value=true;else if(menuCollapsed.value)uiPrefs.toggleSidebar(true);}
function toggleSidebar() {
  if (isCanvasFullscreen.value) {
    canvasNavOpen.value = false;
    return;
  }
  if (narrowSidebar.value) { mobileSidebarOpen.value = !mobileSidebarOpen.value; return; }
  uiPrefs.toggleSidebar(menuCollapsed.value);
}

/*
 * 沉浸式创作页（画布/3D）：路由命中白名单即强压顶栏；
 * 特例:/aiAssistant 若创作者台内恒驻 Exit 纽触发了 uiPrefs.aiAssistantChromeVisible=true，
 * 则临时视作脱离沉浸让顶栏回归——使其能在保有当前对话的同时切往 项目列表/画布/定价 等兄弟模块；
 * director3d/canvas 两路继续硬性强制沉浸不可破例（外溢风险最低）。
 */
const isEditorWorkspace = computed(() => route.path === "/editor");
const isImmersive = computed(() =>
  // /editor（剪辑成片）是独立工作台：它自带顶栏，这里压掉面包屑让预览拿到整块高度。
  ['/aiAssistant', '/director3d', '/canvas', '/editor'].includes(route.path)
    && !(route.path === '/aiAssistant' && uiPrefs.aiAssistantChromeVisible)
);
// 画布中心保留外层侧栏，只有打开具体画布编辑器后才进入全屏沉浸模式。
// 编辑器路由在 iframe 内，通过 postMessage 同步到这里。
const canvasEditorOpen = ref(false);
const isCanvasFullscreen = computed(() => route.path === '/canvas' && canvasEditorOpen.value);
const canvasNavOpen = ref(false);
// 项目内页面：仅在打开项目后的这些页面显示顶栏（面包屑 + 项目快捷入口）
const projectPages = ['/novel', '/scriptAgent', '/script', '/cornerScape', '/production'];
const isProjectPage = computed(() => projectPages.includes(route.path) || (route.path === '/assets' && !!route.query.projectId));
const { t } = useI18n();
function menuLabel(menu: any) { return menu?.label || (menu?.labelKey ? t(menu.labelKey) : ''); }
const activeMenu = ref(route.path);
const toolsMenuOpen = ref(false);
const toolsTriggerRef = ref<HTMLElement | null>(null);
const toolsDropStyle = ref({ left: "258px", top: "420px" });
const utilityMenuActive = computed(() => utilityMenu.some((item) => item.path === activeMenu.value));

function toggleToolsMenu() {
  if (!toolsMenuOpen.value && toolsTriggerRef.value) {
    const rect = toolsTriggerRef.value.getBoundingClientRect();
    const left = Math.min(rect.right + 12, window.innerWidth - 332);
    const top = Math.max(16, Math.min(rect.top - 18, window.innerHeight - 310));
    toolsDropStyle.value = { left: `${left}px`, top: `${top}px` };
  }
  toolsMenuOpen.value = !toolsMenuOpen.value;
}

function closeToolsMenuOnOutside(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.tools-trigger') || target.closest('.tools-popover')) return;
  toolsMenuOpen.value = false;
}

watch(
  () => route.path,
  (newPath) => {
    activeMenu.value = newPath;
    canvasNavOpen.value = false;
    if (newPath !== '/canvas') canvasEditorOpen.value = false;
  },
);

function handleClick(menu: any) {
  if (menu.needProject && !project.value) return;
  toolsMenuOpen.value = false;
  uiPrefs.collapseSidebarForNavigation();
  if (menu.canvasCenter) {
    router.push({ path: "/canvas" });
    activeMenu.value = menu.path;
    return;
  }
  if (menu.projectScoped && project.value?.id) {
    router.push({ path: menu.path, query: { projectId: String(project.value.id) } });
    activeMenu.value = menu.path;
    return;
  }
  if (menu.path === "/editor" && menu.query?.mode === "standalone") {
    router.push({ path: "/editor", query: { mode: "standalone", returnTo: route.fullPath } });
    activeMenu.value = menu.path;
    return;
  }
  if (projectPages.includes(menu.path) && project.value?.id) {
    router.push({ path: menu.path, query: { projectId: String(project.value.id), ...(route.query.episode ? { episode: route.query.episode } : {}) } });
    activeMenu.value = menu.path;
    return;
  }
  router.push(menu.query ? { path: menu.path, query: menu.query } : menu.path);
  activeMenu.value = menu.path;
}

function handleNewCanvas() {
  uiPrefs.collapseSidebarForNavigation();
  router.push({ path: "/canvas", query: { new: "1", source: "xoi", from: "workbench", t: String(Date.now()) } });
  activeMenu.value = "/canvas";
}

type TeamRole = "owner" | "member" | "none";
const teamRole = ref<TeamRole>("none");
const teamMemberCount = ref(0);
const teamMenuLabel = computed(() => {
  if (teamRole.value === "owner") return teamMemberCount.value > 0 ? `团队管理 · ${teamMemberCount.value} 名成员` : "团队管理";
  if (teamRole.value === "member") return "我的团队";
  return "开启团队版";
});
async function loadTeamSummary() {
  try {
    const response: any = await axios.get("/team", { params: { summary: 1, _t: Date.now() } });
    const data = response?.data ?? response;
    teamRole.value = ["owner", "member"].includes(data?.role) ? data.role : "none";
    teamMemberCount.value = Number(data?.seats?.used || 0);
  } catch {
    // 团队服务暂时不可用时仍保留「开启团队版」入口，详情页会给出明确错误。
    teamRole.value = "none";
  }
}
function goTeamSpace() {
  footMenuOpen.value = false;
  window.location.assign("/console/team");
}

// 用户下拉菜单（侧栏底部用户块，Teleport 到 body）
const footMenuOpen = ref(false);
const userFootRef = ref<HTMLElement | null>(null);
const footDropStyle = ref({ left: "224px", bottom: "20px" });

function toggleFootMenu() {
  // 打开时根据用户块位置动态计算菜单定位（fixed 相对视口）
  if (!footMenuOpen.value && userFootRef.value) {
    const rect = userFootRef.value.getBoundingClientRect();
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - 340));
    const bottom = Math.max(16, window.innerHeight - rect.top + 10);
    footDropStyle.value = { left: left + "px", bottom: bottom + "px" };
  }
  footMenuOpen.value = !footMenuOpen.value;
}

function closeFootMenuOnOutside(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.user-foot') || target.closest('.foot-dropdown')) return;
  footMenuOpen.value = false;
}

function toggleCanvasWorkspaceNav(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.data?.type !== 'xoi:toggle-workbench-nav') return;
  canvasNavOpen.value = !canvasNavOpen.value;
  if (event.source && 'postMessage' in event.source) {
    (event.source as Window).postMessage({ type: 'xoi:workbench-nav-state', open: canvasNavOpen.value }, event.origin);
  }
}

const CANVAS_ROUTE_KEY = "xoi.canvas.lastRoute";
/** 画布内部路由（如 /canvas/35）：白名单校验后落 sessionStorage，刷新后 canvas shell 原地恢复，不再掉回画布列表 */
function syncCanvasRoute(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.data?.type !== 'xoi:canvas-route' || route.path !== '/canvas') return;
  canvasEditorOpen.value = event.data.editor === true;
  const inner = String(event.data.path ?? "");
  if (/^\/canvas(?:\/?|\/[A-Za-z0-9_-]+)$/.test(inner)) {
    try { sessionStorage.setItem(CANVAS_ROUTE_KEY, inner); } catch {}
    // 同步到外层 hash（#/canvas?id=<id>）：刷新/复制链接都能原位回到该画布。
    // id 只接受 nanoid 字符集，防止任意 hash 注入。
    const idMatch = /^\/canvas\/([A-Za-z0-9_-]+)$/.exec(inner);
    if (window.history?.replaceState) {
      // 进编辑器带 id；回到列表则摘掉 id，保证外层 URL 与 iframe 状态一致
      window.history.replaceState({}, "", `${window.location.pathname}#/canvas${idMatch ? `?id=${idMatch[1]}` : ""}`);
    }
  }
}
function warmCanvasWorkspace(){
 const token=uStore.token,account=uStore.userId;
 if(token&&!canvasSession.value)canvasSession.value=`${account}:${token}`;
}
function refreshBillingBalance() { void uStore.refreshProfile(); }
function receiveBillingNotice(event: MessageEvent) {
  if (event.origin === window.location.origin && event.data?.type === "xoi:billing-updated") refreshBillingBalance();
}

onMounted(() => {
  document.addEventListener('pointerdown', closeFootMenuOnOutside);
  document.addEventListener('pointerdown', closeToolsMenuOnOutside);
  window.addEventListener('message', toggleCanvasWorkspaceNav);
  window.addEventListener('message', syncCanvasRoute);
  window.addEventListener('xoi:canvas-warmup',warmCanvasWorkspace);
  window.addEventListener('message', closeTopupFrameOnMessage);
  window.addEventListener('message', closeUsageFrameOnMessage);
  window.addEventListener("xoi:billing-updated", refreshBillingBalance);
  window.addEventListener("message", receiveBillingNotice);
  // A short platform introduction once per account, without intercepting project deep links.
  try { welcomeOpen.value = !route.query.projectId && !route.query.new && localStorage.getItem(welcomeKey()) !== "done"; } catch {}
  // 余额来自 new-api quota（/api/login/self 折算元），壳层挂载时拉一次，
  // 生成扣费/充值到账后由相应页面再调 refreshProfile() 即时刷新角标
  void uStore.refreshProfile();
  void loadTeamSummary();
  // 通知公告：拉取静态 JSON 供未读红点与弹窗使用
  void loadNotices();
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeFootMenuOnOutside);
  document.removeEventListener('pointerdown', closeToolsMenuOnOutside);
  window.removeEventListener('message', toggleCanvasWorkspaceNav);
  window.removeEventListener('message', syncCanvasRoute);
  window.removeEventListener('xoi:canvas-warmup',warmCanvasWorkspace);
  window.removeEventListener('message', closeTopupFrameOnMessage);
  window.removeEventListener('message', closeUsageFrameOnMessage);
  window.removeEventListener("xoi:billing-updated", refreshBillingBalance);
  window.removeEventListener("message", receiveBillingNotice);
});

// 当前页名（顶栏面包屑末级）
const currentPageName = computed(() => {
  if (route.path === '/assets' && route.query.projectId) return '项目素材';
  const menu = [...menuList.value, ...utilityMenu, ...rightBtnList.value].find((item: any) => item.path === route.path);
  return menuLabel(menu);
});

function openFeedback() {
  window.open("https://docs.qq.com/smartsheet/form/EmvmQBrmlPmr%2Fss_vsqk2v%2FvhiGzE?tab=ss_vsqk2v");
}

function notifyMenu(name: string) {
  MessagePlugin.info(`${name}即将开放`);
}

/** 管理控制台入口（造物迁移的 reseller/agent 管理端，/console）：
 *  - 菜单项 v-if="isAdmin"，普通用户看不到；
 *  - console 与主站共用同一份 localStorage 会话，接口越权由后端鉴权兜底；
 *  - 控制台是独立 React 应用，开新标签页不丢创作现场。 */
function goConsoleAdmin() {
  footMenuOpen.value = false;
  window.open("/console", "_blank");
}

// —— 站内通知公告（照造物 announcements 模式）——
// 数据源：/announcements.json（backend/data/web/ 静态托管，站长改完即生效，无需重构建）。
// 未读逻辑：最新一条的 id 与 localStorage 记录不一致即显示小红点，打开弹窗即标记已读。
interface NoticeItem { id: string; title: string; content: string; type?: string; published_at?: string; created_at?: string }
// 全站顶部横幅：控制台「官方公告」页发布，随 /announcements.json 一起下发。
// 关闭按横幅 id 记忆（管理员换一条新横幅 = 换 id，会重新出现）。
interface SiteBanner { id?: string; enabled?: boolean; text?: string; ctaLabel?: string; link?: string; theme?: string }
const siteBanner = ref<SiteBanner | null>(null);
const BANNER_DISMISS_KEY = "xoi_banner_dismissed_id";
const bannerDismissedId = ref("");
try { bannerDismissedId.value = localStorage.getItem(BANNER_DISMISS_KEY) || ""; } catch {}
const showSiteBanner = computed(() => {
  const b = siteBanner.value;
  return !!b && b.enabled === true && !!b.text && bannerDismissedId.value !== (b.id || "banner");
});
function dismissSiteBanner() {
  const b = siteBanner.value;
  if (!b) return;
  bannerDismissedId.value = b.id || "banner";
  try { localStorage.setItem(BANNER_DISMISS_KEY, b.id || "banner"); } catch {}
}
/** 横幅跳转：https 外链新窗口（noopener），站内路径走 router（兼容 /#/hash 与纯 path 两种形态） */
function handleBannerCta() {
  const link = siteBanner.value?.link || "";
  if (!link) return;
  if (/^https:\/\//i.test(link)) { window.open(link, "_blank", "noopener"); return; }
  if (link.startsWith("/#/")) { router.push(link.slice(2)); return; }
  router.push(link);
}
const notices = ref<NoticeItem[]>([]);
const noticeIndex = ref(0);
const noticeOpen = ref(false);
const NOTICE_SEEN_KEY = "xoi_notice_seen_id";
const noticeSeenId = ref<string>("");
try { noticeSeenId.value = localStorage.getItem(NOTICE_SEEN_KEY) || ""; } catch {}
const currentNotice = computed(() => notices.value[noticeIndex.value] || null);
const hasUnreadNotices = computed(() => {
  const latest = notices.value[0];
  return !!latest && noticeSeenId.value !== latest.id;
});
async function loadNotices() {
  try {
    const res = await fetch("/announcements.json", { cache: "no-store" });
    if (!res.ok) return;
    const json: any = await res.json();
    const list: NoticeItem[] = Array.isArray(json) ? json : (json?.data ?? []);
    notices.value = list.filter((n) => n && n.id && n.title);
    if (json?.banner && typeof json.banner === "object") siteBanner.value = json.banner;
  } catch { /* 静态资源缺失时静默降级为「暂无公告」 */ }
}
function openNotices() {
  footMenuOpen.value = false;
  noticeIndex.value = 0;
  noticeOpen.value = true;
  const latest = notices.value[0];
  if (latest) {
    noticeSeenId.value = latest.id;
    try { localStorage.setItem(NOTICE_SEEN_KEY, latest.id); } catch {}
  }
}
function noticeTypeLabel(n: NoticeItem) {
  return n.type === "maintenance" ? "维护" : n.type === "update" ? "更新" : "公告";
}
function noticeDate(n: NoticeItem) {
  const d = new Date(n.published_at || n.created_at || "");
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 退出登录
function handleLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("userId");
  localStorage.removeItem("role");
  localStorage.removeItem("username");
  window.location.reload();
}

// 个人信息（改密码已收敛到网关侧，这里只支持改显示名称）
const showUserProfile = ref(false);
const profileLoading = ref(false);
const profileForm = ref({ name: username.value || "" });

// 监听抽屉打开，重置表单
watch(showUserProfile, (val) => {
  if (val) {
    profileForm.value = { name: username.value || "" };
  }
});

async function handleUpdateProfile() {
  if (!profileForm.value.name.trim()) {
    MessagePlugin.warning("显示名称不能为空");
    return;
  }
  try {
    profileLoading.value = true;
    // PUT /api/user/self 只放通 display_name（见 routes/user/self.ts 的设计说明）；
    // 密码修改由用户在网关侧自行操作，管理员令牌代改是安全红线
    const resp: any = await axios.put("/user/self", { display_name: profileForm.value.name.trim() });
    if (resp && resp.success === false) throw new Error(resp.message || "修改失败");
    MessagePlugin.success("修改成功");
    localStorage.setItem("username", profileForm.value.name.trim());
    username.value = profileForm.value.name.trim();
    showUserProfile.value = false;
  } catch (e: any) {
    MessagePlugin.error(e.message || "修改失败");
  } finally {
    profileLoading.value = false;
  }
}

</script>

<style lang="scss" scoped>
.site-brand-footer { margin:0 4px 10px; max-height:48px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font-size:10px; line-height:16px; color:#92928a; }
.main {
  width: 100vw;
  padding: 0;
  display: flex;
  background: #f4f5f7;
  position: relative;
  transition: all 0.3s ease;
  overflow: hidden;

  /* 背景装饰：暖灰纸面点阵，贴合创作工具的纸感基调 */
  .bg-decoration {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: radial-gradient(rgba(163, 134, 104, 0.10) 0.7px, transparent 0.7px);
      background-size: 28px 28px;
      opacity: 0.5;
    }
  }

  /* 让内容在背景之上 */
  .collapse-btn,
  .menu,
  .view {
    position: relative;
    z-index: 1;
  }

  @keyframes grid-move {
    0% { transform: translate(0, 0); }
    100% { transform: translate(50px, 50px); }
  }


  // 折叠按钮
  .collapse-btn {
    position: absolute;
    left: 224px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 48px;
    background: #ffffff;
    border: 1px solid #e4e8ef;
    border-left: none;
    border-radius: 0 14px 14px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 3px 0 10px rgba(16, 24, 40, .06);
    color: #667085;

    &:hover {
      width: 28px;
      background: #fdf4ec;
      color: #c9662a;
    }

    &:active {
      width: 24px;
    }

    .t-icon {
      transition: transform 0.3s ease;
    }
  }

  // 菜单折叠状态
  &.menu-collapsed {
    .collapse-btn {
      left: 76px;
      border-radius: 14px;
      width: 40px;
      height: 40px;
      border-left: 1px solid var(--material-border-medium);

      &:hover {
        width: 44px;
        height: 44px;
      }
    }
  }

  .menu {
    width: 224px;
    height: 100%;
    flex-shrink: 0;
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    // 苹果风格材质 - 侧边栏使用标准材质 + 中等模糊
    background: #ffffff;
    border-right: 1px solid #e6e9ef;
    border-radius: 0;
    padding: 18px 12px 14px;
    color: var(--text-primary);
    box-shadow: none;
    transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);

    // 折叠态（68px 图标栏）
    &.collapsed {
      width: 68px;
      padding: 14px 10px;

      .item {
        justify-content: center;
        padding: 0;
      }

      .member-btn {
        width: 44px;
        height: 44px;
        margin: 0 auto;
      }

      .member-tag {
        display: none;
      }

      .user-foot {
        justify-content: center;
        padding: 4px 0;

        .user-meta,
        .user-points {
          display: none;
        }

        .user-avatar {
          width: 40px;
          height: 40px;
        }
      }
    }

    .logoBox {
      position: relative;
      z-index: 2;
      cursor: pointer;
      width: 100%;
      height: fit-content;
      padding: 6px 8px 20px;
      display: flex;
      align-items: center;
      gap: 11px;

      .logo {
        width: 38px;
        height: 38px;
        flex-shrink: 0;
        border-radius: 11px;
        transition: transform 0.3s ease;

        /* 白瓷托底：彩色玻璃 logo 在浅灰侧栏上更聚焦，也避免透明底贴灰显得脏 */
        background:
          url("@/assets/XOI_logo.png") center / contain no-repeat,
          linear-gradient(145deg, #ffffff, #f6f3ee);
        box-shadow:
          0 1px 2px rgba(60, 42, 20, 0.08),
          0 4px 10px rgba(60, 42, 20, 0.07),
          inset 0 0 0 1px rgba(60, 42, 20, 0.05);

        &:hover {
          transform: scale(1.06) rotate(-2deg);
        }
      }

      .brand-name {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.2;
        white-space: nowrap;

        strong {
          font-size: 15.5px;
          font-weight: 700;
          letter-spacing: 0.01em;
          color: #242321;
        }

        span {
          margin-top: 3px;
          font-size: 9.5px;
          font-weight: 650;
          letter-spacing: 0.22em;
          color: #b3ada2;
        }
      }
    }

    .itemBox {
      flex: 1;
      margin: 0;
      padding: 0 2px;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .footItem {
      width: 100%;
      height: fit-content;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px 2px 0;
      border-top: 1px solid #edf0f4;

      .member-btn {
        position: relative;
        width: 100%;
        height: 40px;
        cursor: pointer;

        .member-btn-inner {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 9px;
          background: linear-gradient(135deg, #f57400, #ff8f3d);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 8px rgba(245, 116, 0, 0.22);
          border: 0;
          padding: 0;
          cursor: pointer;

          .member-icon {
            color: white;
            flex-shrink: 0;
          }

          .wallet-icon {
            color: white;
            font-size: 19px;
          }

          .member-text {
          font-size: 12px;
            font-weight: 600;
            color: #ffffff;
            line-height: 1;
          }
        }

        .member-tag {
          position: absolute;
          top: -6px;
          right: -2px;
          font-size: 9px;
          font-weight: 600;
          color: #c9662a;
          background: #fdeee1;
          padding: 2px 5px;
          border-radius: 5px;
          line-height: 1.2;
        }

        &:hover .member-btn-inner {
          transform: scale(1.02);
          box-shadow: 0 5px 12px rgba(24, 32, 51, .18);
        }

        &:active .member-btn-inner {
          transform: scale(0.98);
        }
      }

      // 用户块
      .user-foot {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 8px;
        border: 0;
        border-radius: 12px;
        background: transparent;
        cursor: pointer;
        transition: all 0.25s ease;

        &:hover {
          background: #edeee9;
        }

        .user-avatar {
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: linear-gradient(145deg, #ff9b45, #f57400);
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          box-shadow: 0 2px 6px rgba(245, 116, 0, 0.25);
        }

        .user-meta {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;

          .user-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .user-role {
            font-size: 11px;
            color: var(--text-tertiary);
          }
        }

        .user-points {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-secondary);
        }

      }
    }
  }

  // 菜单项样式
  .item {
    cursor: pointer;
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 0 10px;
    border-radius: 8px;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    box-sizing: border-box;

    .icon {
      font-size: 19px;
      color: #667085;
      transition: all 0.25s ease;
      flex-shrink: 0;
    }

    .item-title {
      font-size: 13px;
      font-weight: 500;
      color: #475467;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &:hover {
      background: #fdf3ea;

      .icon,
      .item-title {
        color: #c9662a;
      }
    }

    &:active {
      transform: scale(0.97);
    }
  }

  .active {
    background: #fdeee1 !important;

    .icon,
    .item-title {
      color: #d4601f !important;
      font-weight: 700;
    }
  }

  .nav-group-title {
    padding: 18px 10px 7px;
    color: #98a2b3;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .menu::-webkit-scrollbar {
    width: 4px;
  }
  .menu::-webkit-scrollbar-thumb {
    background: var(--border-primary);
    border-radius: var(--radius-full);
    &:hover {
      background: var(--text-tertiary);
    }
  }
  .menu::-webkit-scrollbar-track {
    background-color: transparent;
  }

  .view {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    margin-left: 0;
    // 苹果风格材质 - 主视图区使用标准材质 + 中等模糊
    background: var(--material-regular);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border: 0;
    border-radius: 0;
    overflow: hidden;
    scrollbar-gutter: stable;
    box-shadow: none;

    .topMenu {
      height: 56px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px 0 20px;
      border-bottom: 1px solid var(--border-primary);

      .breadcrumb {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        min-width: 0;
        flex-shrink: 0;

        .bc-item {
          color: var(--text-tertiary);
          white-space: nowrap;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;

          &.current {
            color: var(--text-primary);
            font-weight: 600;
          }
        }

        // 可点击层级：视觉上仍是面包屑，但悬停给暖橙反馈，提示可跳转
        .bc-link {
          border: 0;
          padding: 2px 4px;
          margin: -2px -4px;
          border-radius: 7px;
          background: transparent;
          font: inherit;
          color: var(--text-tertiary);
          cursor: pointer;
          transition: color .16s ease, background .16s ease;

          &:hover {
            color: #b4551f;
            background: #fdf1e7;
          }

          &:focus-visible {
            outline: 2px solid #d9865f;
            outline-offset: 1px;
          }
        }

        .bc-sep {
          color: var(--text-tertiary);
          opacity: 0.6;
        }
      }

      // 流水线进度带：窄屏空间不够就藏起来（进度在项目卡上仍有）
      .topProgress {
        margin-left: 18px;
        min-width: 0;
        overflow: hidden;
        flex-wrap: nowrap;
      }

      @media (max-width: 1280px) {
        .topProgress {
          display: none;
        }
      }

      .top-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
        margin-left: auto;

        .shortcuts {
          display: flex;
          align-items: center;
          gap: 4px;

          .shortcut {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            color: var(--text-secondary);

            .icon {
              font-size: 16px;
            }

            .label {
              font-size: 13px;
            }

            &:hover {
              background: var(--td-brand-color-light);
              color: var(--td-brand-color);
            }

            &.active {
              background: var(--td-brand-color-light);
              color: var(--td-brand-color);
              font-weight: 500;
            }
          }
        }

      }
    }

    .viewBox {
      flex: 1;
      min-height: 0;
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
    }
  }

  // 用户下拉动画
  .drop-enter-active,
  .drop-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .drop-enter-from,
  .drop-leave-to {
    opacity: 0;
    transform: translateY(-6px);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* —— 全站横幅壳：横幅横贯整页顶部，侧栏与内容在其下 —— */
.appShell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.appShell > .main { flex: 1; min-height: 0; }
.appShell > .siteBanner { flex: none; height: 44px; }


/* 下拉积分卡长数字自适应（与侧栏积分卡同档位） */
.credits-detail-link strong { transition: font-size .15s ease; }
.credits-detail-link strong.fit-sm { font-size: 17px; }
.credits-detail-link strong.fit-xs { font-size: 14.5px; }

</style>

<style lang="less">
// 个人信息弹窗 - 苹果风格
.profile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.profile-modal {
  width: 380px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-radius: 20px;
  border: 0.5px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 0 0 0.5px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  overflow: hidden;
  position: relative;

  [data-theme-mode="dark"] &,
  &[data-theme="dark"] {
    background: rgba(40, 40, 40, 0.85);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.4),
      0 0 0 0.5px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
}

.profile-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(0, 0, 0, 0.4);

  &:hover {
    background: rgba(0, 0, 0, 0.12);
    color: rgba(0, 0, 0, 0.6);
  }

  [data-theme-mode="dark"] & {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.4);

    &:hover {
      background: rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

.profile-header {
  padding: 36px 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(180deg, rgba(0, 82, 217, 0.03) 0%, transparent 100%);
}

.profile-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f57400 0%, #ffab5e 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 16px;
  box-shadow: 0 8px 24px rgba(245, 116, 0, 0.25);
}

.profile-name {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 8px;
  letter-spacing: -0.3px;

  [data-theme-mode="dark"] & {
    color: #fff;
  }
}

.profile-role {
  font-size: 12px;
  font-weight: 500;
  color: #c9662a;
  background: rgba(245, 116, 0, 0.09);
  padding: 4px 12px;
  border-radius: 20px;
  letter-spacing: 0.5px;

  &.is-admin {
    color: #ff6b00;
    background: rgba(255, 107, 0, 0.08);
  }
}

.profile-body {
  padding: 8px 32px 24px;
}

.profile-field {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
}

.profile-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.5);
  margin-bottom: 8px;
  letter-spacing: 0.2px;

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.4);
  }
}

.profile-input {
  width: 100%;
  height: 44px;
  padding: 0 16px;
  font-size: 15px;
  color: #1a1a1a;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;

  &::placeholder {
    color: rgba(0, 0, 0, 0.25);
  }

  &:focus {
    background: rgba(245, 116, 0, 0.04);
    border-color: rgba(245, 116, 0, 0.3);
    box-shadow: 0 0 0 3px rgba(245, 116, 0, 0.1);
  }

  [data-theme-mode="dark"] & {
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);

    &::placeholder {
      color: rgba(255, 255, 255, 0.25);
    }

    &:focus {
      background: rgba(245, 116, 0, 0.1);
      border-color: rgba(245, 116, 0, 0.4);
    }
  }
}

.profile-footer {
  padding: 16px 32px 28px;
  display: flex;
  gap: 12px;
}

.profile-btn {
  flex: 1;
  height: 44px;
  font-size: 15px;
  font-weight: 500;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.profile-btn-cancel {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.6);

  &:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  [data-theme-mode="dark"] & {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.6);

    &:hover {
      background: rgba(255, 255, 255, 0.12);
    }
  }
}

.profile-btn-save {
  background: linear-gradient(135deg, #f57400 0%, #ff8f3d 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(245, 116, 0, 0.3);

  &:hover:not(:disabled) {
    box-shadow: 0 6px 16px rgba(245, 116, 0, 0.4);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(245, 116, 0, 0.3);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
}

.profile-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: profile-spin 0.6s linear infinite;
}

@keyframes profile-spin {
  to { transform: rotate(360deg); }
}

// 动画
.profile-fade-enter-active,
.profile-fade-leave-active {
  transition: opacity 0.25s ease;
}

.profile-fade-enter-from,
.profile-fade-leave-to {
  opacity: 0;
}

.profile-scale-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.profile-scale-leave-active {
  transition: all 0.2s ease;
}

.profile-scale-enter-from {
  opacity: 0;
  transform: scale(0.92);
}

.profile-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

// 充值弹窗（透明 iframe 内嵌 console 充值面板）：轻遮罩让背后主站可见，弹窗本体在 iframe 内居中
.topup-frame-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  // 遮罩只负责压低背景对比度，不再做整页模糊；iframe 已经完全透明，
  // 这样不会出现「iframe 外再套一层黑色矩形/阴影」的双层观感。
  background: rgba(18, 18, 24, 0.18);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  display: flex;
  align-items: center;
  justify-content: center;

  .topup-frame {
    // iframe 只承载内部弹窗；不能给 iframe 自己加圆角阴影，否则透明区域也会被浏览器
    // 当成一张 500×700 的深色卡片投影，视觉上就像弹窗外又套了一层黑框。
    width: min(500px, calc(100vw - 32px));
    height: min(700px, calc(100vh - 48px));
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .usage-frame {
    width: min(640px, calc(100vw - 24px));
    height: min(860px, calc(100vh - 24px));
    background: transparent !important;
  }
}

/* 个人信息弹窗积分区域 */
.profile-points {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(245, 116, 0, 0.08), rgba(255, 155, 69, 0.10));
  border-radius: 12px;
}

.profile-points-num {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
  font-weight: 700;
  color: #e0762e;

  svg {
    opacity: 0.8;
  }
}

.profile-points-detail {
  margin-left: auto;
  padding: 4px 12px;
  font-size: 12px;
  color: #c9662a;
  background: rgba(245, 116, 0, 0.09);
  border: 1px solid rgba(245, 116, 0, 0.2);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(245, 116, 0, 0.18);
  }
}
</style>

<style lang="scss">
// 侧栏用户菜单（Teleport 到 body 后脱离 .main，需非 scoped 样式；left/bottom 由 JS 计算）
// 设计：轻量浅色单卡片——头部（头像/身份/余额+充值）+ 菜单区，与工作台高级灰主题同频。
.foot-dropdown {
  position: fixed;
  width: 316px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e3e0da;
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(42, 38, 31, .14), 0 2px 8px rgba(42, 38, 31, .06);
  padding: 0;
  z-index: 200;

  .account-card {
    padding: 16px 16px 14px;
    border-bottom: 1px solid #efede9;
    background: linear-gradient(180deg, #faf9f7, #fff);
  }
  .account-profile { display: flex; align-items: center; gap: 11px; min-width: 0; }
  .account-avatar {
    display: grid; place-items: center; width: 42px; height: 42px; flex: none;
    border-radius: 50%; background: #f57400; color: #fff;
    font-size: 17px; font-weight: 700;
  }
  .account-id { display: flex; flex-direction: column; min-width: 0; }
  .account-id strong { overflow: hidden; color: #242321; font-size: 15px; line-height: 1.3; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .account-id span { margin-top: 2px; color: #9b968d; font-size: 11.5px; line-height: 1.3; }
  .account-mark { width: 52px; height: 38px; margin-left: auto; flex: none; object-fit: contain; opacity: .9; }

  .credits-row {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px;
    margin-top: 12px; padding: 11px 12px;
    border-radius: 12px; background: #f4f2ee;
  }
  .credits-detail-link {
    min-width: 0;
    display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 4px 8px;
    padding: 0; border: 0; background: transparent;
    font: inherit; text-align: left; cursor: pointer;
  }
  .credits-detail-link small {
    color: #a09b93; font-size: 10.5px; white-space: nowrap;
    transition: color .18s ease;
  }
  .credits-detail-link:hover small { color: #f57400; }
  .credits-label { flex: none; color: #8a867f; font-size: 12px; }
  .credits-row strong { grid-column: 1 / -1; color: #242321; font-size: 18px; line-height: 1.2; font-weight: 750; letter-spacing: -.025em; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .recharge-btn {
    margin-left: auto; flex: none; height: 28px; padding: 0 14px;
    border: 0; border-radius: 999px; background: #f57400; color: #fff;
    font: inherit; font-size: 12.5px; font-weight: 600; line-height: 1;
    cursor: pointer; transition: background .2s ease;
    &:hover { background: #e26500; }
  }

  .account-menu { padding: 8px 0 8px; }

  .drop-item {
    display: grid;
    grid-template-columns: 24px minmax(0,1fr) auto auto;
    align-items: center;
    column-gap: 11px;
    width: calc(100% - 16px);
    min-height: 38px;
    margin: 0 8px;
    padding: 5px 10px 5px 12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #33312d;
    font: inherit;
    font-family: Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    font-size: 13.5px;
    line-height: 1.25;
    text-decoration: none;
    box-sizing: border-box;
    cursor: pointer;
    transition: all 0.18s ease;

    .d-icon {
      width: 18px;
      font-size: 17px;
      color: #75716a;
    }

    > span:not(.notice-dot) { min-width:0; text-align:left; }
    > em { color:#9b968d; font-size:11.5px; line-height:1.25; font-style:normal; }
    .drop-arrow { color:#b5b1a9; font-size:14px; }
    .notice-dot { width:7px; height:7px; flex:none; border-radius:50%; background:#ff7417; }

    &:hover {
      background: #f4f2ee;
      color: #17150f;

      .d-icon {
        color: #17150f;
      }
    }

    &.admin-entry {
      .d-icon { color: #f57400; }
      &:hover .d-icon { color: #e26500; }
    }

    &.team-entry {
      background: rgba(245, 116, 0, .07);
      .d-icon { color: #f57400; }
      &:hover { background: rgba(245, 116, 0, .13); }
    }

    &.danger {
      color: var(--td-error-color);
    }

    &.danger:hover {
      background: var(--td-error-color-light);
      color: var(--td-error-color);

      .d-icon { color: var(--td-error-color); }
    }
  }

  .drop-divider {
    height: 1px;
    background: #efede9;
    margin: 6px 16px;
  }
}

// 通知公告弹窗（复用 .profile-overlay / .profile-modal 玻璃外壳）
.notice-modal {
  width: 460px;
  max-width: calc(100vw - 40px);
  padding: 22px 24px 18px;
  box-sizing: border-box;

  .notice-head { display: flex; align-items: center; gap: 10px; }
  .notice-tag {
    display: inline-flex; align-items: center; height: 22px; padding: 0 10px;
    border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 1;
    background: rgba(245, 116, 0, .12); color: #d96400;
    &.is-maintenance { background: rgba(0, 102, 255, .1); color: #2a6fdb; }
    &.is-update { background: rgba(34, 154, 22, .1); color: #2b8a1c; }
  }
  .notice-date { margin-left: auto; color: #9b968d; font-size: 11.5px; font-variant-numeric: tabular-nums; }

  .notice-title { margin: 12px 0 10px; color: #242321; font-size: 15.5px; font-weight: 700; line-height: 1.45; }
  .notice-body {
    max-height: min(46vh, 380px); overflow: auto;
    color: #4c4944; font-size: 13px; line-height: 1.7;
    white-space: pre-wrap; word-break: break-word;
  }
  .notice-empty { padding: 28px 0 20px; text-align: center; color: #9b968d; font-size: 13px; }

  .notice-pager {
    display: flex; align-items: center; gap: 12px;
    margin-top: 16px; padding-top: 12px;
    border-top: 1px solid #efede9;
  }
  .notice-count { color: #9b968d; font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .notice-dots { display: flex; align-items: center; gap: 5px;
    button { width: 6px; height: 6px; padding: 0; border: 0; border-radius: 999px; background: #dcd9d2; cursor: pointer; transition: all .25s ease;
      &.on { width: 18px; background: #f57400; }
      &:hover:not(.on) { background: #c5c1b8; }
    }
  }
  .notice-nav { margin-left: auto; display: flex; gap: 6px;
    button {
      width: 26px; height: 26px; padding: 0; border: 1px solid #e3e0da; border-radius: 999px;
      background: #fff; color: #6f6b64; font-size: 15px; line-height: 1; cursor: pointer;
      transition: all .18s ease;
      &:hover:not(:disabled) { background: #f4f2ee; color: #242321; }
      &:disabled { opacity: .35; cursor: not-allowed; }
    }
  }
}

/* Canvas editor focus mode: the project center keeps the normal XOi workbench shell;
   only the actual node editor owns the full viewport. */
.main.canvas-fullscreen .menu { display: none; }
.main.canvas-fullscreen .view { width: auto; }
.main.canvas-fullscreen.canvas-nav-open .menu {
  position: relative;
  inset: auto;
  z-index: 1;
  display: flex;
  flex: 0 0 224px;
  box-shadow: 8px 0 24px rgba(15,23,42,.08);
}

/* 工作台侧栏：清晰的导航层级和安静的账户区 */
.main .menu {
  position: relative;
  width: 272px !important;
  min-width: 272px !important;
  flex: 0 0 272px !important;
  padding: 22px 17px 17px !important;
  background: linear-gradient(160deg,#fbfaf7 0%,#f6f6f1 65%,#f4f4ef 100%) !important;
  border-right: 1px solid #e4e3db !important;
  color: #282927;
  transition: width .28s cubic-bezier(.22,1,.36,1), min-width .28s cubic-bezier(.22,1,.36,1), flex-basis .28s cubic-bezier(.22,1,.36,1);
}

.main .menu .logoBox {
  flex-shrink: 0;
  min-height: 64px;
  padding: 4px 8px 12px;
  gap: 13px;
  border-bottom: 1px solid #e5e4db;
  box-sizing: border-box;
}
.main .menu .logoBox .logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(30,30,25,.08), inset 0 0 0 1px rgba(30,30,25,.06);
}
.main .menu .logoBox .brand-name { line-height: 1.25; gap:7px; }
.main .menu .logoBox .brand-name strong {
  color: #232421;
  font-size: 16px;
  font-weight: 680;
  letter-spacing: -.02em;
}
.main .menu .logoBox .collapse-btn {
  position: absolute;
  left: auto;
  top: 50%;
  right: 2px;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  border: 1px solid #e5e5e1;
  border-radius: 9px;
  background: #fff;
  color: #797a76;
  z-index: 3;
  /* 即梦同款：悬停只变色，按钮绝不位移/缩放 */
  transition: background-color .18s ease, color .18s ease, border-color .18s ease;
}
/* 展开时品牌名给按钮留出空间，避免长名称被压到按钮下面 */
.main .menu .logoBox .brand-name { padding-right: 36px; }
.main .menu .logoBox .collapse-btn:hover {
  width: 30px;
  height: 30px;
  transform: translateY(-50%);
  background: #f0f0ed;
  color: #252623;
}

.main .menu .itemBox {
  min-height: 0;
  height: auto;
  gap: 3px;
  padding: 4px 0 12px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #d6d6d1 transparent;
}
.main .menu .nav-group-title {
  display:flex;
  align-items:center;
  gap:9px;
  padding: 10px 14px 6px;
  color: #8c8d80;
  font-size: 10.5px;
  font-weight: 520;
  letter-spacing: .12em;
}
.main .menu .nav-group-title small { color:#b2b2a4; font-size:9px; font-weight:400; letter-spacing:.04em; font-variant-numeric:tabular-nums; }
.main .menu .nav-group-title i { flex:1; height:1px; margin-left:6px; background:linear-gradient(90deg,#e2e3d9,transparent); }
.main .menu .logoBox .studio-signature { display:flex; align-items:center; gap:7px; margin:0; color:#9c9c8c; font-size:8px; font-weight:500; letter-spacing:.12em; }
.studio-signature i { display:block; width:19px; height:5px; border-radius:1px; opacity:.65; background:repeating-linear-gradient(125deg,#8e9280 0 3px,transparent 3px 6px); }
.main .menu .item {
  width: 100%;
  height: 44px;
  min-height: 44px;
  padding: 0 13px;
  gap: 12px;
  border: 1px solid transparent;
  border-radius: 13px;
  background: transparent;
  box-sizing: border-box;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: visible;
  transition: background .18s ease, border-color .18s ease, color .18s ease;
}
.main .menu .item::before {
  content: '';
  position: absolute;
  left: 1px;
  top: 13px;
  width: 3px;
  height: 18px;
  border-radius: 3px;
  background: #f0743e;
  opacity: 0;
  transform: scaleY(.6);
  transition: opacity .18s ease, transform .18s ease;
}
.main .menu .item::after { display: none; }
.main .menu .item .icon {
  width: 20px;
  min-width: 20px;
  color: #656760;
  font-size: 20px;
  filter: none;
}
.main .menu .item .item-title {
  min-width: 0;
  color: #444640;
  font-size: 14px;
  /* 统一字重：所有导航项同一档（580），选中态靠颜色/底色区分，不再忽粗忽细 */
  font-weight: 580;
  white-space: nowrap;
}
.main .menu .item:hover {
  background: #eeefeb !important;
  border-color: #eeefeb;
  box-shadow: none;
  transform: none;
}
.main .menu .item:hover .icon,
.main .menu .item:hover .item-title { color: #252722; transform: none; filter: none; }
.main .menu .active {
  background: #fff !important;
  border-color: #e9e9e5 !important;
  box-shadow: 0 3px 10px rgba(51,48,30,.035), inset 0 0 0 1px #fff !important;
}
.main .menu .active::before { opacity: 1; transform: scaleY(1); }
.main .menu .active .icon { color: #eb6c34 !important; }
.main .menu .active .item-title { color: #252722 !important; font-weight: 620; }
.main .menu .active .item-action { color: #92948e; }
.main .menu .active .item-action:hover { background: #f4f4f1; color: #e9652e; }
.main .menu .item-action {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  flex: none;
  margin-left: auto;
  width: 27px;
  height: 27px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #999b95;
  font-size: 20px;
  line-height: 25px;
}
.main .menu .item-action:hover { background: #e8e9e5; color: #e9652e; transform: none; }
.main .menu .nav-utility-divider {
  height: 1px;
  margin: 15px 12px 9px;
  background: #e6e7e2;
}
.main .menu .sidebar-tools { flex:none; padding:5px 0 14px; }
.main .menu .sidebar-tools .nav-utility-divider { margin:0 12px 10px; }
.main .menu .tools-trigger .tools-arrow { margin-left: auto; color: #a4a69f; transition: transform .18s ease; }
.main .menu .tools-trigger.open .tools-arrow { transform: rotate(90deg); }
.main .menu .tools-trigger .tools-active-dot {
  position: absolute;
  right: 35px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #eb6c34;
}

.main .menu .footItem {
  flex-shrink: 0;
  gap: 10px;
  padding: 10px 2px 0;
  border: 0;
  border-top: 1px solid #e6e7e2;
  border-radius: 0;
  background: transparent;
}
.main .menu .footItem .member-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100% !important;
  height: 60px !important;
  margin: 0 !important;
  padding: 9px 10px 9px 12px !important;
  border: 1px solid #e8e9e4;
  border-radius: 15px !important;
  background: #fff !important;
  box-shadow: 0 1px 3px rgba(32,35,30,.035);
  box-sizing: border-box;
  transition: border-color .18s ease, box-shadow .18s ease;
}
.main .menu .footItem .member-btn:hover {
  background: #fff !important;
  border-color: #d5d8d0;
  box-shadow: 0 2px 7px rgba(32,35,30,.055);
}
.main .menu .footItem .member-btn .credits-summary {
  flex: 1;
  min-width: 0;
  height: auto;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 3px;
}
.main .menu .footItem .member-btn .credits-summary > span {
  color: #898b84;
  font-size: 11.5px;
  font-weight: 550;
  line-height: 1.2;
}
.main .menu .footItem .member-btn .credits-summary strong {
  overflow: hidden;
  color: #252722;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  max-width: 100%;
}
/* 长数字自适应缩档：7-8 位缩一号，9 位以上再缩一号，保证不顶到「充值积分」按钮 */
.main .menu .footItem .member-btn .credits-summary strong.fit-sm { font-size: 15px; letter-spacing: -.015em; }
.main .menu .footItem .member-btn .credits-summary strong.fit-xs { font-size: 13px; letter-spacing: -.01em; }
.main .menu .footItem .member-btn .member-btn-inner {
  flex: none;
  width: auto !important;
  min-width: 64px;
  height: 30px !important;
  padding: 0 13px !important;
  border: 0;
  border-radius: 9px !important;
  /* 修复：之前锁死 44px 宽放不下「充值积分」四个字，文字溢出且浅底橙字几乎不可见；
     改为自适应宽度的实心橙色按钮（与弹出菜单充值按钮同款），保证字样完整可见 */
  background: linear-gradient(135deg, #f57400, #ff8f3d) !important;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(245, 116, 0, 0.22);
}
.main .menu .footItem .member-btn .member-btn-inner .member-text {
  display: block;
  color: #ffffff;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}
.sidebar-account-row { display:flex; align-items:center; width:100%; min-width:0; }
.sidebar-account-row .user-foot { flex:1; min-width:0; }
.sidebar-toggle { display:grid; place-items:center; width:30px; height:34px; padding:5px; border:1px solid #ddded3; border-radius:11px; background:#fffffc; color:#777c6a; box-shadow:0 2px 8px #393c2212; cursor:pointer; }
/* 即梦图标是填充式 path（描边样式会把它描粗变形），统一 fill 渲染 */
.sidebar-toggle svg { width:16px; height:16px; fill:currentColor; stroke:none; }
.sidebar-toggle:hover { color:#a75f35; background:#fff8f0; border-color:#dcbfa7; box-shadow:0 3px 12px #935b2920; }
.sidebar-toggle:focus-visible,.main .menu .logoBox:focus-visible,.main .menu .item:focus-visible { outline:2px solid #d9865f; outline-offset:2px; }

/* —— 全站公告横幅（管理员在控制台发布，随 /announcements.json 下发）—— */
.siteBanner {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 9px 48px 9px 16px;
  color: #fff;
}
.siteBanner .siteBannerText { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 550; letter-spacing: .01em; }
.siteBanner .siteBannerCta { display: inline-flex; align-items: center; gap: 3px; flex: none; height: 26px; padding: 0 12px; border: 0; border-radius: 999px; background: #fff; color: #17181c; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease; }
.siteBanner .siteBannerCta svg { width: 12px; height: 12px; }
.siteBanner .siteBannerCta:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(0, 0, 0, .18); }
.siteBanner .siteBannerClose { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 8px; background: transparent; color: rgba(255, 255, 255, .75); cursor: pointer; transition: background .15s ease, color .15s ease; }
.siteBanner .siteBannerClose:hover { background: rgba(255, 255, 255, .16); color: #fff; }
.siteBanner.theme-brand { background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 55%, #8b5cf6 100%); }
.siteBanner.theme-dark { background: linear-gradient(90deg, #17181c, #2a2c33); }
.siteBanner.theme-green { background: linear-gradient(90deg, #059669, #14b8a6); }
.main .menu .sidebar-account-row .user-menu-chevron { display:block; }
.main .menu .sidebar-account-row .user-meta { min-width:0; }
.main .menu .sidebar-account-row .user-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.main .menu .footItem .member-btn:hover .member-btn-inner {
  transform: none;
  background: linear-gradient(135deg, #ef6c00, #f97f2e) !important;
  box-shadow: 0 3px 10px rgba(245, 116, 0, 0.3);
}
.main .menu .footItem .user-foot {
  min-height: 46px;
  gap: 12px;
  padding: 4px 6px;
  border: 0;
  border-radius: 11px;
  background: transparent;
}
.main .menu .footItem .user-foot:hover { background: #edeee9; }
.main .menu .footItem .user-foot .user-avatar {
  width: 32px;
  height: 32px;
  background: #f47d3d;
  font-size: 14px;
  box-shadow: none;
}
.main .menu .footItem .user-foot .user-meta .user-name { color: #343630; font-size: 14px; font-weight: 650; }
.main .menu .footItem .user-foot .user-meta .user-role { margin-top: 3px; color: #92948e; font-size: 11px; }
.main .menu .footItem .user-menu-chevron { flex: none; margin-left: auto; color: #a0a29b; }

.main .menu.collapsed {
  width: 72px !important;
  min-width: 72px !important;
  flex: 0 0 72px !important;
  padding: 22px 11px 17px !important;
}
.main .menu.collapsed .logoBox {
  min-height: 64px;
  padding: 4px 4px 12px;
  justify-content: center;
}
.main .menu.collapsed .logoBox .logo { width: 36px; height: 36px; transition: opacity .18s ease; }
/* 收起态（即梦同款）：平时只显示 logo；光标移到 Logo 区，logo 淡出、展开按钮原地浮现 */
.main .menu.collapsed .logoBox .collapse-btn {
  top: 50%;
  left: 50%;
  right: auto;
  bottom: auto;
  transform: translate(-50%, -50%);
  width: 34px;
  height: 34px;
  border-radius: 10px;
  opacity: 0;
  pointer-events: none;
}
/* 收起态（即梦同款）：平时只显示 logo；光标移到 Logo 区，logo 淡出、展开按钮原地浮现。
   注意不能用 :focus-within —— 点击 logo 跳转后 logoBox 会保留焦点，按钮就会常驻显示；
   键盘可达性改由按钮自身的 :focus-visible 承担（Tab 到它时浮现）。 */
.main .menu.collapsed .logoBox:hover .logo { opacity: 0; }
.main .menu.collapsed .logoBox:hover .collapse-btn,
.main .menu.collapsed .logoBox .collapse-btn:focus-visible {
  opacity: 1;
  pointer-events: auto;
}
.main .menu.collapsed .nav-utility-divider { margin: 9px 8px 7px; }
.main .menu.collapsed .item { width: 46px; height: 44px; min-height: 44px; margin: 0 auto; padding: 0; }
.main .menu.collapsed .item.active::before { left: -4px; top: 13px; height: 18px; }
.main .menu.collapsed .footItem { gap: 7px; padding: 11px 0 0; }
.main .menu.collapsed .footItem .member-btn {
  display: block;
  width: 44px !important;
  height: 44px !important;
  margin: 0 auto !important;
  padding: 4px !important;
  border: 1px solid #e8e9e4;
  background: #fff !important;
}
.main .menu.collapsed .footItem .member-btn .member-btn-inner {
  width: 34px !important;
  height: 34px !important;
  /* 覆盖展开态的自适应宽/内边距，否则收起态图标按钮被撑到 64px 宽、钱包图标挤偏 */
  min-width: 0 !important;
  padding: 0 !important;
  border: 0;
  background: transparent !important;
  box-shadow: none;
}
.main .menu.collapsed .footItem .member-btn .member-btn-inner .wallet-icon { color: #60625c; }
.main .menu.collapsed .footItem .user-foot { min-height: 44px; padding: 4px 0; }
.main .menu.collapsed .footItem .user-foot .user-avatar { width: 36px; height: 36px; }
.main .menu.collapsed .sidebar-account-row { justify-content:center; }
.main .menu.collapsed .sidebar-account-row .user-foot { flex:none; width:44px; justify-content:center; }
@media (prefers-reduced-motion:reduce) { .main .menu,.sidebar-toggle,.main .menu .item { transition:none!important; } }

@media (max-width: 1040px) {
  .main .menu {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
    width: 272px !important;
    min-width: 272px !important;
    flex: 0 0 272px !important;
    box-shadow: 10px 0 28px rgba(31,34,29,.08);
  }
  .main .menu.collapsed {
    width: 72px !important;
    min-width: 72px !important;
    flex: 0 0 72px !important;
  }
  .main .view { width: 100%; min-width: 0; flex: 1 1 100%; padding-left:var(--sidebar-width); box-sizing:border-box; }
  .main.canvas-fullscreen .view { padding-left:0; }
}

.tools-popover {
  position: fixed;
  z-index: 240;
  width: 304px;
  padding: 10px;
  border: 1px solid rgba(34,32,27,.11);
  border-radius: 17px;
  background: rgba(252,251,248,.96);
  box-shadow: 0 22px 56px rgba(34,31,25,.16), 0 2px 10px rgba(34,31,25,.06);
  backdrop-filter: blur(22px) saturate(1.12);
  box-sizing: border-box;
}
.tools-popover-head { padding: 8px 9px 12px; display: flex; flex-direction: column; }
.tools-popover-head > span { color: #e86831; font-size: 9px; font-weight: 760; letter-spacing: .16em; }
.tools-popover-head > strong { margin-top: 6px; color: #24221e; font-size: 15px; font-weight: 720; }
.tools-popover-head > small { margin-top: 4px; color: #918c83; font-size: 11px; }
.tools-popover-list { display: flex; flex-direction: column; gap: 5px; }
.tools-popover-item {
  display: grid;
  grid-template-columns: 38px minmax(0,1fr) auto 15px;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 58px;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #767169;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background .18s ease, transform .18s ease;
}
.tools-popover-item:hover { background: #fff; transform: translateX(2px); }
.tools-popover-item.active { background: #fff6f1; color: #e86831; }
.tools-popover-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: #f0efeb;
  color: #35322c;
  font-size: 19px;
}
.tools-popover-item:first-child .tools-popover-icon { background: #fff0e8; color: #e86831; }
.tools-popover-copy { display: flex; flex-direction: column; min-width: 0; }
.tools-popover-copy strong { color: #2b2925; font-size: 13px; font-weight: 680; }
.tools-popover-copy small { margin-top: 3px; overflow: hidden; color: #928d84; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.tools-popover-item em {
  padding: 3px 6px;
  border-radius: 999px;
  background: #efeee9;
  color: #928d84;
  font-size: 9px;
  font-style: normal;
  white-space: nowrap;
}
.tools-popover-item:first-child em { background: #fff0e8; color: #d95d29; }
.tools-pop-enter-active, .tools-pop-leave-active { transition: opacity .16s ease, transform .2s cubic-bezier(.2,.8,.2,1); transform-origin: left center; }
.tools-pop-enter-from, .tools-pop-leave-to { opacity: 0; transform: translateX(-7px) scale(.98); }

</style>

<style lang="scss" scoped>
@media (max-width: 700px) {
  .main > .menu { position: absolute !important; z-index: 100; }
  .main > .view { flex: 1 1 100% !important; width: 100%; padding-left: 72px; box-sizing: border-box; }
  .main.canvas-fullscreen > .view { padding-left: 0; }
  .main .view .topMenu { height: auto; min-height: 0; flex-direction: column; align-items: stretch; gap: 8px; padding: 12px; }
  .main .view .topMenu .breadcrumb { min-width: 0; overflow: hidden; white-space: nowrap; font-size: 11px; }
  .main .view .topMenu .top-right { width: 100%; min-width: 0; }
  .main .view .topMenu .shortcuts { max-width: 100%; overflow-x: auto; margin-left: 0; flex-wrap: nowrap; }
  .main .view .topMenu .shortcut { flex: none; }
}
</style>

<style scoped>
.route-progress { position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 200; overflow: hidden; pointer-events: none; background: rgba(242,100,50,.08); }
.route-progress span { display: block; width: 35%; height: 100%; border-radius: 2px; background: #f57432; animation: route-progress 1s ease-in-out infinite; }
@keyframes route-progress { from { transform: translateX(-100%); } to { transform: translateX(390%); } }
@media (prefers-reduced-motion: reduce) { .route-progress span { animation: none; width: 100%; } }
</style>

<style scoped>
.main .view .viewBox { order: 1; min-height: 0; }
.main .view.story-workspace { background: var(--xoi-workspace-bg,#faf8f6); }
.main .view.story-workspace .viewBox { background: transparent; }
.main .view.story-workspace .topMenu { background: #fff; }
.main .view.story-workspace .topProgress { overflow-x: auto; scrollbar-width: none; }
.main .view.story-workspace .topProgress::-webkit-scrollbar { display: none; }
/* 流程提示只在左下角占一小块，页面和聊天面板延伸到视口底部。 */
.pipelineDock { position:absolute; left:24px; bottom:12px; z-index:20; display:flex; width:fit-content; max-width:calc(100% - 48px); padding:0; pointer-events:none; }
.pipelineDock :deep(.pipelineNextBar) { pointer-events:auto; }
.pipelineDock:empty { display:none; }
.view:has(.cornerScape) .pipelineDock { max-width:clamp(250px,21vw,310px); }
@media(max-width:1050px) { .view:has(.cornerScape) .pipelineDock { max-width:calc(100% - 48px); } }
@media(max-width:700px) { .pipelineDock { left:82px; bottom:10px; max-width:calc(100% - 96px); } .view:has(.cornerScape) .pipelineDock { max-width:calc(100% - 96px); } }
</style>

<style scoped>
/* The editor owns the viewport. Closing it restores the normal project workspace. */
.main.editor-fullscreen > .menu { display:none !important; }
.main.editor-fullscreen > .view { flex:1 1 100% !important; width:100% !important; padding:0 !important; }
.main.editor-fullscreen > .view > .viewBox { height:100%; overflow:hidden; padding:0; }
.main.editor-fullscreen .bg-decoration,.main.editor-fullscreen .pipelineDock { display:none; }
</style>
