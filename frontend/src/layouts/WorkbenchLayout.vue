<!-- 应用壳：侧栏 + 顶栏 + router-view + 全局弹窗（从 pages/workbench/index.vue 抽出，零视觉变化） -->
<template>
  <div class="main" :class="{ 'menu-collapsed': menuCollapsed, 'canvas-fullscreen': isCanvasFullscreen, 'canvas-nav-open': canvasNavOpen }" style="height: 100vh">
    <!-- 背景装饰 - 科技感发光线条 -->
    <div class="bg-decoration">
      <div class="circle circle-1"></div>
      <div class="circle circle-2"></div>
      <div class="circle circle-3"></div>
      <div class="circle circle-4"></div>
    </div>

    <div class="menu" :class="{ collapsed: menuCollapsed }">
      <!-- Logo 区：点击回到工作台首页（项目列表） -->
      <div class="logoBox" @click.stop="router.push('/project')">
        <button type="button" class="collapse-btn" @click.stop="toggleSidebar" :aria-label="isCanvasFullscreen ? '关闭工作台导航' : (menuCollapsed ? '展开侧栏' : '收起侧栏')">
          <t-icon :name="menuCollapsed ? 'chevron-right' : 'chevron-left'" size="16px" />
        </button>
        <div class="logo"></div>
        <div class="brand-name" v-show="!menuCollapsed"><strong>导演工作台</strong><span>XOI STUDIO</span></div>
      </div>
      <!-- 主导航 -->
      <div class="itemBox">
        <template v-for="(menu, index) in menuList" :key="index">
          <div v-if="menu.type === 'group'" class="nav-group-title" v-show="!menuCollapsed">{{ menu.label }}</div>
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
      <!-- 底部：余额 + 用户块（积分/会员/支付体系已按造物方案下线，余额来自 new-api quota，单位元） -->
      <div class="footItem">
        <t-tooltip content="算力明细" placement="right" :showArrow="false">
        <div class="member-btn" role="button" tabindex="0" aria-label="查看算力明细" @click="openUsageDetails" @keydown.enter="openUsageDetails">
          <div class="credits-summary" v-show="!menuCollapsed"><span><b>✦</b> 算力余额</span><span><strong>{{ userBalanceText }}</strong></span></div>
          <button class="member-btn-inner" type="button" :aria-label="menuCollapsed ? '查看算力明细' : '充值'" @click.stop="menuCollapsed ? openUsageDetails() : goConsoleTopup()">
            <i-wallet v-if="menuCollapsed" class="wallet-icon" />
            <span v-else class="member-icon" aria-hidden="true">＋</span><span class="member-text" v-show="!menuCollapsed">充值</span>
          </button>
        </div>
        </t-tooltip>
        <!-- 用户块：所有页面常驻（余额只在上方卡片显示一次，这里不再重复） -->
        <div class="user-foot" ref="userFootRef" role="button" tabindex="0" aria-label="打开账号、团队与余额菜单" @click="toggleFootMenu" @keydown.enter="toggleFootMenu" @keydown.space.prevent="toggleFootMenu">
          <div class="user-avatar">{{ userInitial }}</div>
          <div class="user-meta" v-show="!menuCollapsed">
            <span class="user-name">{{ username }}</span>
          <span class="user-role">XOi ID · {{ displayId || userId || '—' }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="view">
      <div class="topMenu" v-if="!isImmersive && project?.id && isProjectPage">
        <!-- 面包屑（打开项目后显示） -->
        <div class="breadcrumb" v-if="project?.id">
          <span class="bc-item">工作台</span>
          <span class="bc-sep">/</span>
          <span class="bc-item">{{ project?.name }}</span>
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
                @click="handleClick(menu)">
                <component :is="menu.icon" class="icon" />
                <span class="label">{{ menu.label }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
      <div class="viewBox">
        <router-view v-slot="{ Component }">
          <component :is="Component" :key="$route.fullPath" />
        </router-view>
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
            <button class="credits-detail-link" type="button" @click="openUsageDetails"><span class="credits-label">算力余额</span><strong>{{ userBalanceText }}</strong><small>查看明细</small></button>
            <button class="recharge-btn" type="button" @click="goConsoleTopup(); footMenuOpen = false">充值</button>
          </div>
        </section>
        <section class="account-menu">
          <button type="button" class="drop-item team-entry" @click="goTeamSpace"><i-people class="d-icon" /><span>{{ teamMenuLabel }}</span><em v-if="teamRole !== 'none'">{{ teamRole === 'owner' ? '主账号' : '成员' }}</em><i-right class="drop-arrow" /></button>
          <div class="drop-divider"></div>
          <button type="button" class="drop-item" @click="notifyMenu('语言设置')"><i-earth class="d-icon" /><span>语言</span><em>简体中文</em><i-right class="drop-arrow" /></button>
          <button type="button" class="drop-item" @click="notifyMenu('帮助中心')"><i-help class="d-icon" /><span>帮助</span><i-right class="drop-arrow" /></button>
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


  <!-- 个人信息弹窗 - 苹果风格居中 -->
  <Teleport to="body">
    <Transition name="profile-fade">
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
              <!-- 余额显示（new-api quota 折算元） -->
              <div class="profile-points">
                <div class="profile-points-num">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
                  </svg>
                  <span>{{ userBalanceText }}</span>
                </div>
                <button class="profile-points-detail" @click="showUserProfile = false; goConsoleTopup()">充值</button>
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

  <!-- 算力明细：复用 console 内已对接 NewAPI logs 的 UsageDialog，不在 Vue 再造第二套账单。 -->
  <Teleport to="body">
    <Transition name="profile-fade">
      <div v-if="usageFrameOpen" class="topup-frame-overlay" @click.self="usageFrameOpen = false">
        <iframe class="topup-frame usage-frame" :src="usageFrameSrc" title="算力与消费明细" />
      </div>
    </Transition>
  </Teleport>

  <!-- 充值弹窗：透明 iframe 内嵌 console 充值面板（造物 TopupDialog）。
       轻遮罩 + 模糊，背后主站内容可见；弹窗本体在 iframe 内居中，
       关闭（X / 遮罩 / 支付到账）由 iframe postMessage xoi:topup:close 收起。 -->
  <Teleport to="body">
    <Transition name="profile-fade">
      <div v-if="topupFrameOpen" class="topup-frame-overlay" @click.self="topupFrameOpen = false">
        <iframe class="topup-frame" :src="topupFrameSrc" title="在线充值" />
      </div>
    </Transition>
  </Teleport>

  <!-- 通知公告弹窗（照造物 announcements：静态 JSON 驱动，站长热换 backend/data/web/announcements.json） -->
  <Teleport to="body">
    <Transition name="profile-fade">
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

</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());
import userStore from "@/stores/user";
// aiAssistant 页运行期逃生口：让 isImmersive 白名单对该路由网开一面以显出全局导航（详见 stores/uiPrefs.ts）
import uiPrefsStore from "@/stores/uiPrefs";
import settingStore from "@/stores/setting";
import { resolveThemeMode } from "@/utils/theme";
import { MessagePlugin } from "tdesign-vue-next";
import PipelineProgress from "@/components/pipeline/PipelineProgress.vue";
const uStore = userStore();
const { username, userId, displayId, isAdmin, balance } = storeToRefs(uStore);
const userInitial = computed(() => (username.value || "X").trim().charAt(0).toUpperCase());
/** 余额展示文本：refreshProfile 现在取 new-api quota 折算后的「元」（两位小数） */
const userBalanceText = computed(() => `¥${Number(balance.value || 0).toFixed(2)}`);
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

// 算力明细与充值共用 console 的账户弹窗体系，数据都来自 NewAPI。
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

// 主导航（范围收敛：只留四个创作模块 + 画布资产库入口；
// Skill/灵感资料库/创作任务/管理员中心已按造物方案下线）
const baseMenu = [
  { type: "group", label: "创作工作台" },
  { type: "btn", path: "/project", label: "剧本一键创作", icon: "i-movie-board" },
  { type: "btn", path: "/canvas", label: "无限画布", icon: "i-edit", canvasCenter: true },
  { type: "btn", path: "/aiAssistant", label: "Agent 智能创作", icon: "i-magic" },
  { type: "btn", path: "/director3d", label: "导演工作台", icon: "i-camera-one" },
  { type: "group", label: "创作资源" },
  { type: "btn", path: "/assets", label: "项目资产库", icon: "i-receive" },
  { type: "btn", path: "/square", label: "灵感广场", icon: "i-lightning" },
  { type: "btn", path: "/skills", label: "Skill 市场", icon: "i-toolkit" },
];
const menuList = computed(() => baseMenu);

const rightBtnList = ref([
  { type: "btn", path: "/novel", label: "导入素材", description: "导入小说原文或已有剧本", icon: "i-file-text", nodelOnly: true },
  { type: "btn", path: "/scriptAgent", label: "AI 改编（可选）", description: "需要把故事改编成短剧时使用，不是必经环节", icon: "i-magic", nodelOnly: true },
  { type: "btn", path: "/script", label: "剧本整理", description: "把原文或已有剧本整理成可制作的分集剧本", icon: "i-editing" },
  { type: "btn", path: "/cornerScape", label: "角色场景", description: "提取并生成角色、场景和道具", icon: "i-user" },
  { type: "btn", path: "/production", label: "分镜成片", description: "制作分镜、画面、视频并合成成片", icon: "i-play" },
  { type: "divider", label: "" },
  { type: "btn", path: "/assets", label: "项目素材", description: "集中查看项目生成的全部素材", icon: "i-folder-open" },
]);

const router = useRouter();
const route = useRoute();
// 仅用于 aiAssistant 页那道 runtime 逃生口；director3d/canvas 维持硬沉浸不受其影响
const uiPrefs = uiPrefsStore();
// 进入业务后收成 72px 图标栏；用户手动选择会被记住，不被后续路由强制覆盖。
const menuCollapsed = computed(() => uiPrefs.isSidebarCollapsed());
function toggleSidebar() {
  if (isCanvasFullscreen.value) {
    canvasNavOpen.value = false;
    return;
  }
  uiPrefs.toggleSidebar(menuCollapsed.value);
}

/*
 * 沉浸式创作页（画布/3D）：路由命中白名单即强压顶栏；
 * 特例:/aiAssistant 若创作者台内恒驻 Exit 纽触发了 uiPrefs.aiAssistantChromeVisible=true，
 * 则临时视作脱离沉浸让顶栏回归——使其能在保有当前对话的同时切往 项目列表/画布/定价 等兄弟模块；
 * director3d/canvas 两路继续硬性强制沉浸不可破例（外溢风险最低）。
 */
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
const projectPages = ['/novel', '/scriptAgent', '/script', '/cornerScape', '/production', '/assets'];
const isProjectPage = computed(() => projectPages.includes(route.path));
const { t } = useI18n();
function menuLabel(menu: any) { return menu?.label || (menu?.labelKey ? t(menu.labelKey) : ''); }
const activeMenu = ref(route.fullPath);

watch(
  () => route.fullPath,
  (newPath) => {
    activeMenu.value = newPath;
    canvasNavOpen.value = false;
    if (newPath !== '/canvas') canvasEditorOpen.value = false;
  },
);

function handleClick(menu: any) {
  if (menu.needProject && !project.value) return;
  uiPrefs.collapseSidebarForNavigation();
  if (menu.canvasCenter) {
    router.push({ path: "/canvas" });
    activeMenu.value = menu.path;
    return;
  }
  router.push(menu.path);
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

function syncCanvasRoute(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.data?.type !== 'xoi:canvas-route') return;
  canvasEditorOpen.value = event.data.editor === true;
}

onMounted(() => {
  document.addEventListener('pointerdown', closeFootMenuOnOutside);
  window.addEventListener('message', toggleCanvasWorkspaceNav);
  window.addEventListener('message', syncCanvasRoute);
  window.addEventListener('message', closeTopupFrameOnMessage);
  window.addEventListener('message', closeUsageFrameOnMessage);
  // 余额来自 new-api quota（/api/login/self 折算元），壳层挂载时拉一次，
  // 生成扣费/充值到账后由相应页面再调 refreshProfile() 即时刷新角标
  void uStore.refreshProfile();
  void loadTeamSummary();
  // 通知公告：拉取静态 JSON 供未读红点与弹窗使用
  void loadNotices();
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeFootMenuOnOutside);
  window.removeEventListener('message', toggleCanvasWorkspaceNav);
  window.removeEventListener('message', syncCanvasRoute);
  window.removeEventListener('message', closeTopupFrameOnMessage);
  window.removeEventListener('message', closeUsageFrameOnMessage);
});

// 当前页名（顶栏面包屑末级）
const currentPageName = computed(() => {
  const menu = [...menuList.value, ...rightBtnList.value].find((item: any) => item.path === route.path);
  return menuLabel(menu);
});

function jumpGithub() {
  window.open("https://github.com/yufan-byte");
}

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
.main {
  width: 100vw;
  padding: 0;
  display: flex;
  background: #f4f5f7;
  position: relative;
  transition: all 0.3s ease;
  overflow: hidden;

  /* 背景装饰 - 科技感发光线条 */
  .bg-decoration {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;

    /* 极淡的纸张纹理：保留科技感，但不形成明显的蓝色背景 */
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: radial-gradient(rgba(99, 102, 241, 0.08) 0.7px, transparent 0.7px);
      background-size: 28px 28px;
      opacity: 0.22;
    }

    .circle {
      position: absolute;
      border-radius: 50%;
      filter: blur(110px);
      opacity: 0.12;
    }

    .circle-1 {
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, #c7d2fe, transparent 68%);
      top: -150px;
      left: -150px;
      animation: float-1 20s ease-in-out infinite;
    }

    .circle-2 {
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, #bae6fd, transparent 68%);
      top: 60%;
      right: -100px;
      animation: float-2 25s ease-in-out infinite;
    }

    .circle-3 {
      width: 350px;
      height: 350px;
      background: radial-gradient(circle, #ddd6fe, transparent 68%);
      bottom: -100px;
      left: 40%;
      animation: float-3 22s ease-in-out infinite;
    }

    /* 额外的光点 */
    .circle-4 {
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, #ccfbf1, transparent 68%);
      top: 30%;
      left: 20%;
      animation: float-4 18s ease-in-out infinite;
      opacity: 0.08;
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

  @keyframes float-1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(60px, 60px) scale(1.1); }
  }

  @keyframes float-2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(-40px, -50px) scale(0.9); }
  }

  @keyframes float-3 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(50px, -40px) scale(1.05); }
  }

  @keyframes float-4 {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(-30px, 30px); }
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
      background: #f6f8fb;
      color: #1d5fd1;
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
          background: #182033;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: none;
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
            color: white;
            line-height: 1;
          }
        }

        .member-tag {
          position: absolute;
          top: -6px;
          right: -2px;
          font-size: 9px;
          font-weight: 600;
          color: #1d5fd1;
          background: #e8f0ff;
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
        border: 1px solid #f0ece5;
        border-radius: 12px;
        background: #fdfcfa;
        cursor: pointer;
        transition: all 0.25s ease;

        &:hover {
          background: #faf8f5;
          border-color: #e5dfd4;
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
      background: #f4f7fb;

      .icon,
      .item-title {
        color: #1d5fd1;
      }
    }

    &:active {
      transform: scale(0.97);
    }
  }

  .active {
    background: #eaf2ff !important;

    .icon,
    .item-title {
      color: #1d5fd1 !important;
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
    backdrop-filter: var(--blur-medium);
    -webkit-backdrop-filter: var(--blur-medium);
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
  background: linear-gradient(135deg, #0052d9 0%, #00d4ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 16px;
  box-shadow: 0 8px 24px rgba(0, 82, 217, 0.25);
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
  color: #0052d9;
  background: rgba(0, 82, 217, 0.08);
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
    background: rgba(0, 82, 217, 0.04);
    border-color: rgba(0, 82, 217, 0.3);
    box-shadow: 0 0 0 3px rgba(0, 82, 217, 0.1);
  }

  [data-theme-mode="dark"] & {
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);

    &::placeholder {
      color: rgba(255, 255, 255, 0.25);
    }

    &:focus {
      background: rgba(0, 82, 217, 0.1);
      border-color: rgba(0, 82, 217, 0.4);
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
  background: linear-gradient(135deg, #0052d9 0%, #0066ff 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(0, 82, 217, 0.3);

  &:hover:not(:disabled) {
    box-shadow: 0 6px 16px rgba(0, 82, 217, 0.4);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(0, 82, 217, 0.3);
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

// 会员弹窗样式
.member-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.member-modal {
  width: 820px;
  max-height: 90vh;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-radius: 24px;
  border: 0.5px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 0 0 0.5px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  padding: 36px;
  position: relative;

  [data-theme-mode="dark"] & {
    background: rgba(40, 40, 40, 0.95);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.4),
      0 0 0 0.5px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
}

.member-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(0, 0, 0, 0.4);

  &:hover {
    background: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.6);
  }

  [data-theme-mode="dark"] & {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.4);

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

.member-title {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  text-align: center;
  margin-bottom: 8px;
  letter-spacing: -0.5px;

  [data-theme-mode="dark"] & {
    color: #fff;
  }
}

.member-subtitle {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.45);
  text-align: center;
  margin-bottom: 28px;

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.4);
  }
}

.member-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 16px;

  [data-theme-mode="dark"] & {
    background: rgba(255, 255, 255, 0.06);
  }
}

.member-tab {
  flex: 1;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.5);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;

  &.active {
    background: white;
    color: #1a1a1a;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

    [data-theme-mode="dark"] & {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
  }

  .member-tab-tag {
    font-size: 10px;
    font-weight: 600;
    color: #ff3b30;
    background: rgba(255, 59, 48, 0.1);
    padding: 1px 5px;
    border-radius: 4px;
  }

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.5);

    &.active {
      color: #fff;
    }
  }
}

.member-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(255, 154, 92, 0.08) 100%);
  border: 1px solid rgba(255, 107, 53, 0.15);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 24px;

  .member-banner-tag {
    font-size: 11px;
    font-weight: 600;
    color: white;
    background: linear-gradient(135deg, #ff6b35, #ff9a5c);
    padding: 2px 8px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .member-banner-text {
    font-size: 13px;
    color: #ff6b35;

    [data-theme-mode="dark"] & {
      color: #ff9a5c;
    }
  }
}

.member-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.member-card {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: all 0.2s ease;

  [data-theme-mode="dark"] & {
    background: rgba(255, 255, 255, 0.03);
    border-color: rgba(255, 255, 255, 0.08);
  }

  &.popular {
    border-color: rgba(0, 82, 217, 0.3);
    background: linear-gradient(180deg, rgba(0, 82, 217, 0.03) 0%, transparent 100%);
    box-shadow: 0 4px 16px rgba(0, 82, 217, 0.1);
  }

  &.premium {
    border-color: rgba(255, 107, 53, 0.3);
    background: linear-gradient(180deg, rgba(255, 107, 53, 0.03) 0%, transparent 100%);
    box-shadow: 0 4px 16px rgba(255, 107, 53, 0.1);
  }
}

.member-card-badge {
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #0052d9, #0066ff);
  padding: 3px 12px;
  border-radius: 0 0 8px 8px;

  &.premium-badge {
    background: linear-gradient(135deg, #ff6b35, #ff9a5c);
  }
}

.member-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-top: 8px;
}

.member-card-name {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;

  [data-theme-mode="dark"] & {
    color: #fff;
  }
}

.member-card-discount {
  font-size: 11px;
  font-weight: 600;
  color: #ff3b30;
  background: rgba(255, 59, 48, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.member-card-price {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin-bottom: 4px;
}

.price-num {
  font-size: 36px;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1;

  [data-theme-mode="dark"] & {
    color: #fff;
  }
}

.price-unit {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.4);

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.4);
  }
}

.member-card-duration {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.35);
  margin-bottom: 20px;

  .original-price {
    text-decoration: line-through;
  }

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.35);
  }
}

.member-card-btn {
  width: 100%;
  height: 40px;
  font-size: 14px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #0052d9 0%, #0066ff 100%);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(0, 82, 217, 0.25);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0, 82, 217, 0.35);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &.disabled {
    background: rgba(0, 0, 0, 0.08);
    color: rgba(0, 0, 0, 0.3);
    cursor: default;
    box-shadow: none;
  }

  &.premium-btn {
    background: linear-gradient(135deg, #ff6b35 0%, #ff9a5c 100%);
    box-shadow: 0 4px 12px rgba(255, 107, 53, 0.25);

    &:hover:not(:disabled) {
      box-shadow: 0 6px 16px rgba(255, 107, 53, 0.35);
    }
  }

  [data-theme-mode="dark"] & {
    &.disabled {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.3);
    }
  }
}

.member-card-features {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  li {
    font-size: 13px;
    color: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;

    [data-theme-mode="dark"] & {
      color: rgba(255, 255, 255, 0.5);
    }
  }

  .feature-highlight {
    font-weight: 700;
    color: #0052d9;
    margin: 0 2px;

    &.cyan {
      color: #00b4d8;
    }

    [data-theme-mode="dark"] & {
      color: #4d9fff;

      &.cyan {
        color: #00d4ff;
      }
    }
  }
}

.member-card-benefits {
  list-style: none;
  padding: 0;
  margin: 0;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  [data-theme-mode="dark"] & {
    border-color: rgba(255, 255, 255, 0.06);
  }

  li {
    font-size: 12px;
    color: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    gap: 6px;

    &::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #0052d9;
      flex-shrink: 0;
    }

    [data-theme-mode="dark"] & {
      color: rgba(255, 255, 255, 0.4);

      &::before {
        background: #4d9fff;
      }
    }
  }
}

// 会员用户信息头部
.member-user-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: linear-gradient(135deg, rgba(0, 82, 217, 0.06) 0%, rgba(0, 180, 216, 0.06) 100%);
  border-radius: 16px;
  margin-bottom: 24px;
}

.member-user-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.member-user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0052d9 0%, #00d4ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.member-user-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.member-user-status {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.05);

  &.free {
    color: #666;
    background: rgba(0, 0, 0, 0.05);
  }

  &.standard {
    color: #ff9a5c;
    background: linear-gradient(135deg, rgba(255, 154, 92, 0.15) 0%, rgba(255, 107, 107, 0.15) 100%);
    border: 1px solid rgba(255, 154, 92, 0.3);
  }

  &.premium {
    color: #ff6b6b;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 107, 107, 0.2) 100%);
    border: 1px solid rgba(255, 215, 0, 0.4);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.2);
  }

  .member-crown, .member-star {
    font-size: 14px;
  }

  [data-theme-mode="dark"] & {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);

    &.standard {
      color: #ff9a5c;
      background: rgba(255, 154, 92, 0.2);
      border-color: rgba(255, 154, 92, 0.4);
    }

    &.premium {
      color: #ffd700;
      background: rgba(255, 215, 0, 0.2);
      border-color: rgba(255, 215, 0, 0.5);
      box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
    }
  }
}

.member-user-points {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: #0052d9;
  }

  .points-icon {
    color: #ff9a5c;
  }

  .points-value {
    font-weight: 600;
    color: #1a1a1a;

    [data-theme-mode="dark"] & {
      color: #fff;
    }
  }

  .arrow-icon {
    color: rgba(0, 0, 0, 0.25);
  }

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.4);

    .arrow-icon {
      color: rgba(255, 255, 255, 0.25);
    }
  }
}

.member-user-right {
  display: flex;
  gap: 10px;
}

.member-action-btn {
  height: 36px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 500;
  color: white;
  background: linear-gradient(135deg, #0052d9 0%, #0066ff 100%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 82, 217, 0.3);
  }

  &.secondary {
    background: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.6);

    &:hover {
      background: rgba(0, 0, 0, 0.1);
      box-shadow: none;
    }

    [data-theme-mode="dark"] & {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.6);

      &:hover {
        background: rgba(255, 255, 255, 0.12);
      }
    }
  }
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
}

// 积分充值弹窗
.points-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.points-modal {
  width: 720px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-radius: 24px;
  border: 0.5px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 0 0 0.5px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  position: relative;
  overflow: hidden;

  [data-theme-mode="dark"] & {
    background: rgba(40, 40, 40, 0.95);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.4),
      0 0 0 0.5px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
}

.points-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(0, 0, 0, 0.4);
  z-index: 1;

  &:hover {
    background: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.6);
  }

  [data-theme-mode="dark"] & {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.4);

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

.points-content {
  display: flex;
  min-height: 420px;
}

.points-left {
  width: 280px;
  padding: 32px;
  background: linear-gradient(180deg, rgba(0, 82, 217, 0.04) 0%, transparent 100%);
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;

  [data-theme-mode="dark"] & {
    border-right-color: rgba(255, 255, 255, 0.06);
  }
}

.points-display {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.points-num {
  font-size: 48px;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1;

  [data-theme-mode="dark"] & {
    color: #fff;
  }
}

.points-icon-large {
  color: #ff9a5c;
}

.points-label {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.45);
  margin-bottom: 32px;

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.4);
  }
}

.points-details {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.points-detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.4);
  }
}

.detail-value {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;

  [data-theme-mode="dark"] & {
    color: #fff;
  }
}

.points-right {
  flex: 1;
  padding: 32px;
  display: flex;
  flex-direction: column;
}

.points-recharge-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 20px;

  [data-theme-mode="dark"] & {
    color: #fff;
  }
}

.points-recharge-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.points-package {
  padding: 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;

  &.active {
    border-color: #0052d9;
    background: rgba(0, 82, 217, 0.04);
    box-shadow: 0 0 0 1px #0052d9;
  }

  &:hover:not(.active) {
    border-color: rgba(0, 82, 217, 0.3);
  }

  [data-theme-mode="dark"] & {
    border-color: rgba(255, 255, 255, 0.08);

    &.active {
      border-color: #4d9fff;
      background: rgba(77, 159, 255, 0.1);
      box-shadow: 0 0 0 1px #4d9fff;
    }

    &:hover:not(.active) {
      border-color: rgba(77, 159, 255, 0.3);
    }
  }
}

.package-points {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 8px;

  svg {
    color: #ff9a5c;
  }

  .package-bonus {
    font-size: 12px;
    color: #ff6b6b;
    font-weight: 500;
  }

  [data-theme-mode="dark"] & {
    color: #fff;

    .package-bonus {
      color: #ff8a8a;
    }
  }
}

.package-price {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.4);
  }
}

.points-payment-preview {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;

  [data-theme-mode="dark"] & {
    background: rgba(255, 255, 255, 0.03);
  }
}

.payment-method {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  margin-bottom: 8px;

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.4);
  }
}

.payment-price {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 8px;

  [data-theme-mode="dark"] & {
    color: #fff;
  }
}

.payment-gain {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  gap: 4px;

  span {
    font-weight: 600;
    color: #0052d9;

    [data-theme-mode="dark"] & {
      color: #4d9fff;
    }
  }

  svg {
    color: #ff9a5c;
  }

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.4);
  }
}

.points-payment-footer {
  margin-top: auto;
}

.payment-agreement {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
  font-size: 12px;
}

.agreement-text {
  color: rgba(0, 0, 0, 0.35);

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.35);
  }
}

.agreement-link {
  color: #0052d9;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  [data-theme-mode="dark"] & {
    color: #4d9fff;
  }
}

.payment-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #0052d9 0%, #0066ff 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 82, 217, 0.25);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0, 82, 217, 0.35);
  }

  &:active {
    transform: translateY(0);
  }
}

// 订阅管理弹窗
.subscription-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.subscription-modal {
  width: 560px;
  max-height: 70vh;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-radius: 24px;
  border: 0.5px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 0 0 0.5px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  [data-theme-mode="dark"] & {
    background: rgba(40, 40, 40, 0.95);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.4),
      0 0 0 0.5px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
}

.subscription-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 0;
}

.subscription-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;

  [data-theme-mode="dark"] & {
    color: #fff;
  }
}

.subscription-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(0, 0, 0, 0.4);

  &:hover {
    background: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.6);
  }

  [data-theme-mode="dark"] & {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.4);

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

.subscription-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.subscription-tab-bar {
  display: flex;
  gap: 8px;
}

.subscription-tab {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.45);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &.active {
    color: #1a1a1a;
    background: rgba(0, 0, 0, 0.04);
  }

  &:hover:not(.active) {
    color: rgba(0, 0, 0, 0.6);
  }

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.45);

    &.active {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
    }

    &:hover:not(.active) {
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

.subscription-tools {
  display: flex;
  gap: 16px;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: #0052d9;
  }

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.45);

    &:hover {
      color: #4d9fff;
    }
  }
}

.subscription-content {
  flex: 1;
  padding: 24px;
  min-height: 300px;
}

.subscription-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 250px;
  color: rgba(0, 0, 0, 0.15);

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.15);
  }
}

.empty-text {
  margin-top: 16px;
  font-size: 14px;
  color: rgba(0, 0, 0, 0.35);

  [data-theme-mode="dark"] & {
    color: rgba(255, 255, 255, 0.35);
  }
}

/* 个人信息弹窗积分区域 */
.profile-points {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
  border-radius: 12px;
}

.profile-points-num {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
  font-weight: 700;
  color: #667eea;

  svg {
    opacity: 0.8;
  }
}

.profile-points-detail {
  margin-left: auto;
  padding: 4px 12px;
  font-size: 12px;
  color: #667eea;
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(102, 126, 234, 0.2);
  }
}

/* 积分明细弹窗 */
.points-log-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.points-log-modal {
  width: 420px;
  max-height: 70vh;
  background: var(--material-thick, #fff);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid var(--material-border-medium, rgba(0, 0, 0, 0.08));
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.points-log-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.45);
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.88);
  }
}

.points-log-header {
  padding: 20px 24px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.points-log-title {
  font-size: 18px;
  font-weight: 600;
}

.points-log-balance {
  font-size: 14px;
  color: #667eea;
  font-weight: 500;
}

.points-log-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 24px 20px;
}

.points-log-empty {
  text-align: center;
  padding: 40px 0;
  color: rgba(0, 0, 0, 0.35);
  font-size: 14px;
}

.points-log-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.points-log-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);

  &:last-child {
    border-bottom: none;
  }
}

.log-item-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.log-item-type {
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 6px;
  font-weight: 500;

  &.consume {
    background: rgba(227, 77, 89, 0.1);
    color: #e34d59;
  }
  &.gift, &.checkin {
    background: rgba(0, 168, 112, 0.1);
    color: #00a870;
  }
  &.recharge, &.member {
    background: rgba(102, 126, 234, 0.1);
    color: #667eea;
  }
  &.refund {
    background: rgba(255, 154, 92, 0.1);
    color: #ff9a5c;
  }
}

.log-item-desc {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
}

.log-item-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.log-item-amount {
  font-size: 15px;
  font-weight: 600;

  &.positive {
    color: #00a870;
  }
  &.negative {
    color: #e34d59;
  }
}

.log-item-time {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.35);
}

.points-log-loadmore {
  text-align: center;
  padding: 12px;
  font-size: 13px;
  color: #667eea;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.8;
  }
}
</style>

<style lang="scss">
/* Miora 式创作侧栏：更宽松的节奏、中性选中态、底部双卡片 */
.main .menu {
  width: 248px !important;
  padding: 22px 14px 14px !important;
  background: #eeeeee !important;
  border-right: 1px solid #dedede !important;
  overflow: hidden;
}
.main .menu .logoBox .collapse-btn { position:absolute; top:12px; right:0; left:auto; width:32px; height:34px; transform:none; border:1px solid #d3d3d3; border-radius:9px; background:#e7e7e7; box-shadow:none; color:#3e3e3e; opacity:1; }
.main .menu .logoBox .collapse-btn:hover { width:36px; background:#dcdcdc; color:#191919; }
.main .menu.collapsed .logoBox .collapse-btn {
  top:auto; right:5px; bottom:1px; width:26px; height:26px;
  opacity:1; pointer-events:auto; border-radius:8px;
  background:#f7f7f7; box-shadow:0 1px 4px rgba(0,0,0,.08);
}
.main .menu.collapsed .logoBox .collapse-btn:hover { width:28px; background:#fff; color:#f57400; }
.main .menu .logoBox { min-height:64px; padding:4px 14px 28px; gap:14px; }
.main .menu .logoBox .logo { width:48px; height:48px; border-radius:13px; background-color:#fff; box-shadow:0 0 0 1px #d4d4d4; }
.main .menu .logoBox .brand-name { font-size:19px; color:#202020; letter-spacing:-.025em; }
.main .menu .itemBox { min-height:0; height:auto; gap:5px; padding:0 2px 10px 0; overflow-y:auto; }
.main .menu .item { height:50px; padding:0 16px; gap:14px; border-radius:15px; }
.main .menu .item .icon { color:#252525; font-size:22px; }
.main .menu .item .item-title { color:#252525; font-size:16px; font-weight:500; }
.main .menu .item:hover { background: #e9e9e9; }
.main .menu .nav-group-title { padding:23px 16px 8px; color:#888; font-size:12px; font-weight:500; letter-spacing:.02em; text-transform:none; }
.main .menu .footItem { flex-shrink:0; gap:10px; padding:14px 0 0; border-top:0; background:#eee; }
.main .menu .footItem .member-btn { width:100% !important; height:126px !important; margin:0 !important; padding:18px !important; border-radius:24px !important; background:#fff !important; box-sizing:border-box; box-shadow:0 1px 0 rgba(0,0,0,.02); }
.main .menu .footItem .member-btn::before { display:none; }
.main .menu .footItem .member-btn .credits-summary { display:flex; align-items:center; justify-content:space-between; height:28px; margin-bottom:16px; color:#343434; font-size:13px; }
.main .menu .footItem .member-btn .credits-summary>span { display:flex; align-items:baseline; gap:5px; }
.main .menu .footItem .member-btn .credits-summary b { font-size:17px; font-weight:500; }
.main .menu .footItem .member-btn .credits-summary strong { color:#1e1e1e; font-size:17px; }
.main .menu .footItem .member-btn .credits-summary em { color:#8a8a8a; font-size:12px; font-style:normal; }
.main .menu .footItem .member-btn .member-btn-inner { width:100% !important; height:46px !important; border-radius:14px !important; background:#202020 !important; }
.main .menu .footItem .member-btn .member-btn-inner .member-text { font-size:14px; }
.main .menu .footItem .user-foot { gap:12px; padding:11px 14px; border:0; border-radius:18px; background:transparent; }
.main .menu .footItem .user-foot:hover { background: #e7e7e7; border-color: transparent; }
.main .menu .footItem .user-foot .user-avatar { width: 42px; height: 42px; border-radius: 50%; background: #f57400; color: #fff; font-size: 17px; font-weight: 700; }
.main .menu .footItem .user-foot .user-meta .user-name { color: #222; font-size: 13px; }
.main .menu .footItem .user-foot .user-meta .user-role { margin-top: 3px; color: #7d7d7d; font-size: 10px; }
.main .menu .footItem .user-foot .user-points { display: none; }
.main .menu.collapsed { width:68px !important; padding:14px 10px !important; }
.main .menu.collapsed .logoBox { padding:4px 3px 30px; }
.main .menu.collapsed .footItem .member-btn { width:44px !important; height:44px !important; padding:0 !important; border-radius:12px !important; background:transparent !important; }
.main .menu.collapsed .member-btn .credits-summary { display:none; }
.main .menu.collapsed .footItem .member-btn .member-btn-inner { width:44px !important; height:44px !important; border-radius:12px !important; }

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
    display: flex; align-items: center; gap: 8px;
    margin-top: 12px; padding: 9px 10px 9px 13px;
    border-radius: 12px; background: #f4f2ee;
  }
  .credits-detail-link {
    min-width: 0; flex: 1;
    display: flex; align-items: center; gap: 8px;
    padding: 0; border: 0; background: transparent;
    font: inherit; text-align: left; cursor: pointer;
  }
  .credits-detail-link small {
    margin-left: auto; color: #a09b93; font-size: 10.5px; white-space: nowrap;
    transition: color .18s ease;
  }
  .credits-detail-link:hover small { color: #f57400; }
  .credits-label { flex: none; color: #8a867f; font-size: 12px; }
  .credits-row strong { color: #242321; font-size: 17px; line-height: 1; font-weight: 750; letter-spacing: -.02em; }
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

/* 导演工作台：克制的高级灰侧栏与轻量导航反馈 */
.main .menu {
  background: #eeeeee !important;
  border-right-color: #dedede !important;
}

/* 工作台布局：侧栏保持完整宽度，窗口变窄时悬浮覆盖，不挤压主内容 */
.main .menu {
  width: 248px !important;
  min-width: 248px !important;
  flex: 0 0 248px !important;
}

/* 折叠态：窄条 + 图标居中（必须放在展开宽度规则之后才能赢过同等 !important） */
.main .menu.collapsed {
  width: 72px !important;
  min-width: 72px !important;
  flex: 0 0 72px !important;
  padding: 14px 8px 14px !important;
}
.main .menu.collapsed .item { display: flex; align-items: center; justify-content: center; padding: 0; }
.main .menu.collapsed .item.active::before {
  content: '';
  position: absolute;
  left: -8px;
  width: 3px;
  height: 22px;
  border-radius: 0 999px 999px 0;
  background: #f57400;
}
.main .menu.collapsed .footItem .user-foot { justify-content: center; padding: 4px 0; }
.main .menu.collapsed .footItem .user-foot .user-meta { display: none; }
.main .menu.collapsed .footItem .user-foot .user-avatar { width: 40px; height: 40px; }
.main .menu.collapsed .footItem .member-btn .member-btn-inner {
  background: #fff !important;
  color: #252525;
  box-shadow: 0 1px 0 rgba(0,0,0,.04), inset 0 0 0 1px rgba(0,0,0,.07);
}
.main .menu.collapsed .footItem .member-btn .member-btn-inner .wallet-icon { color: #252525; }
.main .menu.collapsed .footItem .member-btn:hover .member-btn-inner {
  background: #202020 !important;
}
.main .menu.collapsed .footItem .member-btn:hover .member-btn-inner .wallet-icon { color: #fff; }

@media (max-width: 1280px) {
  .main {
    overflow: hidden;
  }

  .main .menu.collapsed {
    position: absolute;
    width: 72px !important;
    min-width: 72px !important;
  }

  .main .menu {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
    width: 248px !important;
    min-width: 248px !important;
    height: 100%;
    flex: none !important;
    box-shadow: 14px 0 34px rgba(15, 23, 42, .12);
  }

  .main .view {
    width: 100%;
    min-width: 0;
    flex: 1 1 100%;
  }
}

.main .menu .logoBox { padding: 7px 14px 27px; }
.main .menu .logoBox .logo {
  width: 48px; height: 48px; border: 0; border-radius: 15px;
  box-shadow: 0 8px 18px rgba(0, 0, 0, .08), inset 0 0 0 1px rgba(0, 0, 0, .08);
}
.main .menu .logoBox .brand-name { display: flex; flex-direction: column; gap: 3px; line-height: 1; letter-spacing: -.02em; }
.main .menu .logoBox .brand-name strong { color: #202020; font-size: 18px; font-weight: 750; }
.main .menu .logoBox .brand-name span { color: #8a8a8a; font-size: 10px; font-weight: 600; letter-spacing: .08em; }
.main .menu .nav-group-title { color: #888; font-weight: 650; letter-spacing: .08em; }
.main .menu .item { position: relative; overflow: hidden; transition: background .22s ease, transform .22s ease, box-shadow .22s ease; }
.main .menu .item::after { content: ''; position: absolute; inset: 0; opacity: 0; pointer-events: none; background: linear-gradient(90deg, rgba(255,255,255,.82), transparent 58%); transition: opacity .22s ease; }
.main .menu .item:hover { background: #e4e4e4 !important; transform: translateX(2px); box-shadow: 0 5px 14px rgba(0, 0, 0, .045); }
.main .menu .item:hover::after { opacity: 1; }
.main .menu .item .icon { position: relative; z-index: 1; transition: color .22s ease, transform .22s cubic-bezier(.2,.8,.2,1), filter .22s ease; }
.main .menu .item .icon svg path { stroke-width: 2.35px; }
.main .menu .item .item-title { position: relative; z-index: 1; }
.main .menu .item-action {
  position: relative; z-index: 2; margin-left: auto; width: 28px; height: 28px;
  border: 0; border-radius: 9px; background: transparent; color: #888;
  font-size: 21px; line-height: 26px; cursor: pointer; transition: all .18s ease;
}
.main .menu .item-action:hover { background: #202020; color: #fff; transform: scale(1.05); }
.main .menu .item:hover .icon { color: #111; transform: scale(1.1); filter: drop-shadow(0 0 5px rgba(255,255,255,.82)); }
.main .menu .active { background: #ffffff !important; box-shadow: 0 2px 8px rgba(0, 0, 0, .07), 0 0 0 1px rgba(0, 0, 0, .05); }
.main .menu .active .icon { color: #f57400 !important; filter: none; }
.main .menu .active .item-title { color: #171717 !important; font-weight: 650; }
.main .menu .footItem .member-icon { font-size: 16px; font-weight: 500; line-height: 1; }
.main .menu .logoBox .collapse-btn { background: #e7e7e7; border-color: #d3d3d3; color: #3e3e3e; transition: transform .2s ease, background .2s ease, color .2s ease; }
.main .menu .logoBox .collapse-btn:hover { background: #202020; color: #fff; transform: scale(1.06); }

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

</style>
