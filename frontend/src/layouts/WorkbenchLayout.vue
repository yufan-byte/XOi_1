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
        <div class="collapse-btn" @click.stop="isCanvasFullscreen ? (canvasNavOpen = false) : (menuCollapsed = !menuCollapsed)" :aria-label="isCanvasFullscreen ? '关闭工作台导航' : (menuCollapsed ? '展开侧栏' : '收起侧栏')">
          <t-icon :name="menuCollapsed ? 'chevron-right' : 'chevron-left'" size="16px" />
        </div>
        <div class="logo"></div>
        <div class="brand-name" v-show="!menuCollapsed"><strong>光合效应</strong><span>漫剧导演工作台</span></div>
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
            <div class="item" v-if="menu.type === 'btn'" :class="{ active: activeMenu == menu.path }" @click="handleClick(menu)">
              <component :is="menu.icon" class="icon" />
              <span class="item-title" v-show="!menuCollapsed">{{ menuLabel(menu) }}</span>
            </div>
          </t-tooltip>
        </template>
      </div>
      <!-- 底部：会员 + 用户块 -->
      <div class="footItem">
        <div class="member-btn" @click="showMemberPlan = true; fetchUserPoints()">
          <div class="credits-summary" v-show="!menuCollapsed"><span><b>✦</b> Credits</span><span><strong>{{ userPoints }}</strong><em>/ 1,000</em></span></div>
          <div class="member-btn-inner"><span class="member-icon" aria-hidden="true">✦</span><span class="member-text" v-show="!menuCollapsed">升级套餐</span></div>
        </div>
        <!-- 用户块：所有页面常驻，点击弹出 积分明细/开通会员/个人信息/设置/退出 -->
        <div class="user-foot" ref="userFootRef" @click="toggleFootMenu">
          <div class="user-avatar">{{ userInitial }}</div>
          <div class="user-meta" v-show="!menuCollapsed">
            <span class="user-name">{{ username }}</span>
          <span class="user-role">XOi ID · {{ displayId || userId || '—' }}</span>
          </div>
          <div class="user-points" v-show="!menuCollapsed">
            <i-bill />
            <span>{{ userPoints }}</span>
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
          <img class="account-mascot" src="@/assets/XOI_logo.png" alt="XOi" />
          <div class="account-profile"><div class="account-avatar">{{ userInitial }}</div><div><strong>{{ username || 'XOi 创作者' }}</strong><span>XOi ID · {{ displayId || userId || '—' }}</span></div></div>
          <button class="credits-row" type="button" @click="router.push('/myPoints'); footMenuOpen = false"><span><strong>{{ userPoints }}</strong> credits</span><em>{{ userMemberStatus }}</em><i-right /></button>
          <div class="credits-progress"><span :style="{ width: pointsProgress + '%' }"></span></div>
          <button class="upgrade-account" type="button" @click="showMemberPlan = true; fetchUserPoints(); footMenuOpen = false"><i-crown />升级订阅套餐</button>
        </section>
        <section class="account-menu">
          <button type="button" class="drop-item" @click="showSetting = true; footMenuOpen = false"><i-setting-one class="d-icon" /><span>设置</span></button>
          <button type="button" class="drop-item" @click="notifyMenu('语言设置')"><i-earth class="d-icon" /><span>语言</span><em>简体中文</em><i-right class="drop-arrow" /></button>
          <button type="button" class="drop-item" @click="notifyMenu('帮助中心')"><i-help class="d-icon" /><span>帮助</span><i-right class="drop-arrow" /></button>
          <a class="drop-item" href="mailto:support@xoi.studio"><i-mail class="d-icon" /><span>联系我们</span><i-right class="drop-arrow" /></a>
          <button type="button" class="drop-item" @click="notifyMenu('通知公告')"><i-remind class="d-icon" /><span>通知公告</span><span class="notice-dot"></span></button>
          <button type="button" class="drop-item" @click="openFeedback"><i-comments class="d-icon" /><span>问题反馈</span><i-right class="drop-arrow" /></button>
          <div class="drop-divider"></div>
          <button type="button" class="drop-item danger" @click="handleLogout"><i-logout class="d-icon" /><span>登出账号</span></button>
        </section>
      </div>
    </Transition>
  </Teleport>

  <hello />
  <setting />

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
              <!-- 积分显示 -->
              <div class="profile-points">
                <div class="profile-points-num">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
                  </svg>
                  <span>{{ userPoints }}</span>
                </div>
                <button class="profile-points-detail" @click="showUserProfile = false; router.push('/myPoints')">积分明细</button>
              </div>
            </div>

            <!-- 表单区域 -->
            <div class="profile-body">
              <div class="profile-field">
                <label class="profile-label">用户名</label>
                <input
                  v-model="profileForm.name"
                  type="text"
                  class="profile-input"
                  placeholder="请输入用户名"
                />
              </div>
              <div class="profile-field">
                <label class="profile-label">新密码</label>
                <input
                  v-model="profileForm.password"
                  type="password"
                  class="profile-input"
                  placeholder="留空则不修改密码"
                />
              </div>
              <div class="profile-field">
                <label class="profile-label">确认密码</label>
                <input
                  v-model="profileForm.confirmPassword"
                  type="password"
                  class="profile-input"
                  placeholder="请再次输入新密码"
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

  <!-- 会员订阅弹窗 -->
  <Teleport to="body">
    <Transition name="profile-fade">
      <div v-if="showMemberPlan" class="member-overlay" @click.self="showMemberPlan = false">
        <Transition name="profile-scale">
          <div v-if="showMemberPlan" class="member-modal">
            <!-- 关闭按钮 -->
            <div class="member-close" @click="showMemberPlan = false">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>

            <!-- 用户信息头部 -->
            <div class="member-user-header">
              <div class="member-user-left">
                <div class="member-user-avatar">
                  <i-user size="24" />
                </div>
                <div class="member-user-info">
                  <div class="member-user-status" :class="memberLevelClass">
                    <span v-if="memberLevelClass === 'premium'" class="member-crown">👑</span>
                    <span v-if="memberLevelClass === 'standard'" class="member-star">⭐</span>
                    {{ userMemberStatus }}
                  </div>
                  <div class="member-user-points" @click="showPointsRecharge = true">
                    剩余积分
                    <svg class="points-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
                    </svg>
                    <span class="points-value">{{ userPoints }}</span>
                    <svg class="arrow-icon" viewBox="0 0 12 12" width="12" height="12" fill="currentColor">
                      <path d="M4.354 1.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L7.793 6 4.354 2.536a.5.5 0 0 1 0-.708z"/>
                    </svg>
                  </div>
                </div>
              </div>
              <div class="member-user-right">
                <button class="member-action-btn" @click="showPointsRecharge = true" v-if="!isAdmin">购买积分</button>
                <button class="member-action-btn secondary" @click="showSubscription = true; showMemberPlan = false">订阅管理</button>
              </div>
            </div>

            <!-- 标题 -->
            <div class="member-title">开通会员</div>
            <div class="member-subtitle">解锁全部高级功能，提升创作效率</div>

            <!-- 套餐切换 -->
            <div class="member-tabs">
              <div
                v-for="tab in memberTabs"
                :key="tab.id"
                class="member-tab"
                :class="{ active: activeMemberTab === tab.id }"
                @click="activeMemberTab = tab.id"
              >
                {{ tab.name }}
                <span v-if="tab.tag" class="member-tab-tag">{{ tab.tag }}</span>
              </div>
            </div>

            <!-- 限时横幅 - 只在连续包月和单年购买时显示 -->
            <div v-if="activeMemberTab !== 'single'" class="member-banner">
              <span class="member-banner-tag">限时赠送</span>
              <span class="member-banner-text">{{ activeMemberTab === 'monthly' ? '订阅即享首月双倍积分福利！' : 'Wan3.0 720P低至0.18元/秒！订阅当前会员即享首月双倍积分福利！' }}</span>
            </div>

            <!-- 套餐卡片 -->
            <div class="member-cards" :class="{ 'with-banner': activeMemberTab !== 'single' }">
              <!-- 免费版 -->
              <div class="member-card">
                <div class="member-card-header">
                  <span class="member-card-name">免费版</span>
                </div>
                <div class="member-card-price">
                  <span class="price-num">0</span>
                  <span class="price-unit">元/{{ activeMemberTab === 'yearly' ? '年' : '月' }}</span>
                </div>
                <div class="member-card-duration">永久</div>
                <button class="member-card-btn disabled">当前使用</button>
                <ul class="member-card-features">
                  <li>登录送每日积分</li>
                </ul>
              </div>

              <!-- 标准会员 -->
              <div class="member-card popular">
                <div v-if="memberPlans[activeMemberTab].standard.discount" class="member-card-badge">
                  {{ memberPlans[activeMemberTab].standard.discount }}
                </div>
                <div class="member-card-header">
                  <span class="member-card-name">标准会员</span>
                  <span v-if="memberPlans[activeMemberTab].standard.tag" class="member-card-discount">
                    {{ memberPlans[activeMemberTab].standard.tag }}
                  </span>
                </div>
                <div class="member-card-price">
                  <span class="price-num">{{ memberPlans[activeMemberTab].standard.price }}</span>
                  <span class="price-unit">元/{{ activeMemberTab === 'yearly' ? '年' : '月' }}</span>
                </div>
                <div class="member-card-duration">
                  <span v-if="memberPlans[activeMemberTab].standard.originalPrice" class="original-price">
                    ¥{{ memberPlans[activeMemberTab].standard.originalPrice }}
                  </span>
                  {{ activeMemberTab === 'single' ? '' : '可随时取消' }}
                </div>
                <button class="member-card-btn" @click="handleSubscribe('standard')">
                  {{ activeMemberTab === 'monthly' ? '立即订阅' : '购买' }}
                </button>
                <ul class="member-card-features">
                  <li>每月获得 <span class="feature-highlight">800</span> 积分</li>
                  <li v-if="activeMemberTab !== 'single'">
                    首月额外赠送 <span class="feature-highlight cyan">800</span> 积分
                  </li>
                  <li>约生成视频 <span class="feature-highlight">50</span> 个，不限并发畅玩</li>
                </ul>
                <ul class="member-card-benefits">
                  <li>每日赠送积分</li>
                  <li>专享快速生成通道</li>
                  <li>作品去除品牌水印</li>
                  <li>新功能/模型抢先体验权</li>
                </ul>
              </div>

              <!-- 高级会员 -->
              <div class="member-card premium">
                <div v-if="memberPlans[activeMemberTab].premium.discount" class="member-card-badge premium-badge">
                  {{ memberPlans[activeMemberTab].premium.discount }}
                </div>
                <div class="member-card-header">
                  <span class="member-card-name">高级会员</span>
                  <span v-if="memberPlans[activeMemberTab].premium.tag" class="member-card-discount">
                    {{ memberPlans[activeMemberTab].premium.tag }}
                  </span>
                </div>
                <div class="member-card-price">
                  <span class="price-num">{{ memberPlans[activeMemberTab].premium.price }}</span>
                  <span class="price-unit">元/{{ activeMemberTab === 'yearly' ? '年' : '月' }}</span>
                </div>
                <div class="member-card-duration">
                  <span v-if="memberPlans[activeMemberTab].premium.originalPrice" class="original-price">
                    ¥{{ memberPlans[activeMemberTab].premium.originalPrice }}
                  </span>
                  {{ activeMemberTab === 'single' ? '' : '可随时取消' }}
                </div>
                <button class="member-card-btn premium-btn" @click="handleSubscribe('premium')">
                  {{ activeMemberTab === 'monthly' ? '立即订阅' : '购买' }}
                </button>
                <ul class="member-card-features">
                  <li>每月获得 <span class="feature-highlight">3600</span> 积分</li>
                  <li v-if="activeMemberTab !== 'single'">
                    首月额外赠送 <span class="feature-highlight cyan">3600</span> 积分
                  </li>
                  <li>约生成视频 <span class="feature-highlight">240</span> 个，不限并发畅玩</li>
                </ul>
                <ul class="member-card-benefits">
                  <li>每日赠送积分</li>
                  <li>专享快速生成通道</li>
                  <li>作品去除品牌水印</li>
                  <li>新功能/模型抢先体验权</li>
                </ul>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- 积分充值弹窗 -->
  <Teleport to="body">
    <Transition name="profile-fade">
      <div v-if="showPointsRecharge" class="points-overlay" @click.self="showPointsRecharge = false">
        <Transition name="profile-scale">
          <div v-if="showPointsRecharge" class="points-modal">
            <!-- 关闭按钮 -->
            <div class="points-close" @click="showPointsRecharge = false">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>

            <div class="points-content">
              <!-- 左侧积分信息 -->
              <div class="points-left">
                <div class="points-display">
                  <span class="points-num">{{ userPoints }}</span>
                  <svg class="points-icon-large" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
                  </svg>
                </div>
                <div class="points-label">积分</div>

                <div class="points-details">
                  <div class="points-detail-item">
                    <span class="detail-label">签到积分</span>
                    <span class="detail-value">{{ pointsBreakdown.checkin }}</span>
                  </div>
                  <div class="points-detail-item">
                    <span class="detail-label">赠送积分</span>
                    <span class="detail-value">{{ pointsBreakdown.gift }}</span>
                  </div>
                  <div class="points-detail-item">
                    <span class="detail-label">购买积分</span>
                    <span class="detail-value">{{ pointsBreakdown.purchased }}</span>
                  </div>
                  <div class="points-detail-item">
                    <span class="detail-label">会员积分</span>
                    <span class="detail-value">{{ pointsBreakdown.member }}</span>
                  </div>
                </div>
              </div>

              <!-- 右侧充值选项 -->
              <div class="points-right">
                <div class="points-recharge-title">积分充值</div>
                <div class="points-recharge-grid">
                  <div
                    v-for="item in pointsPackages"
                    :key="item.id"
                    class="points-package"
                    :class="{ active: selectedPointsPackage === item.id }"
                    @click="selectedPointsPackage = item.id"
                  >
                    <div class="package-points">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
                      </svg>
                      {{ item.points }}
                      <span v-if="item.bonus > 0" class="package-bonus">+{{ item.bonus }}</span>
                    </div>
                    <div class="package-price">¥{{ item.price }}</div>
                  </div>
                </div>

                <!-- 支付预览 -->
                <div class="points-payment-preview">
                  <div class="payment-method">支付宝扫码支付</div>
                  <div class="payment-price">¥{{ selectedPackagePrice }}</div>
                  <div class="payment-gain">
                    支付完成后获得
                    <span>{{ pointsPackages.find(p => p.id === selectedPointsPackage)?.points || 0 }}</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
                    </svg>
                  </div>
                </div>

                <!-- 支付按钮 -->
                <div class="points-payment-footer">
                  <div class="payment-agreement">
                    <span class="agreement-text">支付前请阅读</span>
                    <span class="agreement-link">《付费服务协议》</span>
                  </div>
                  <button class="payment-btn" @click="handlePurchasePoints">同意并支付</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- 订阅管理弹窗 -->
  <Teleport to="body">
    <Transition name="profile-fade">
      <div v-if="showSubscription" class="subscription-overlay" @click.self="showSubscription = false">
        <Transition name="profile-scale">
          <div v-if="showSubscription" class="subscription-modal">
            <!-- 头部 -->
            <div class="subscription-header">
              <span class="subscription-title">订阅管理</span>
              <div class="subscription-close" @click="showSubscription = false">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
            </div>

            <!-- 标签页 -->
            <div class="subscription-tabs">
              <div class="subscription-tab-bar">
                <div
                  class="subscription-tab"
                  :class="{ active: activeSubscriptionTab === 'manage' }"
                  @click="activeSubscriptionTab = 'manage'"
                >
                  订阅管理
                </div>
                <div
                  class="subscription-tab"
                  :class="{ active: activeSubscriptionTab === 'history' }"
                  @click="activeSubscriptionTab = 'history'"
                >
                  购买记录
                </div>
              </div>
              <div class="subscription-tools">
                <span class="tool-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 8.667V6C3 3.239 5.239 1 8 1s5 2.239 5 5v2m0 4c0 1.473-1.194 2.667-2.667 2.667H9.333M6.667 13.333h2.666c.368 0 .667.299.667.667v1.333c0 .368-.299.667-.667.667H6.667a.667.667 0 01-.667-.667V14c0-.368.299-.667.667-.667zM1.667 8h2.666v3.667H1.667zM11.667 8h2.666v3.667h-2.666z"/>
                  </svg>
                  <span>客服中心</span>
                </span>
                <span class="tool-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 8a.75.75 0 01-1.5 0V4.5a.75.75 0 011.5 0V8z"/>
                  </svg>
                  <span>积分规则</span>
                </span>
              </div>
            </div>

            <!-- 内容区域 -->
            <div class="subscription-content">
              <!-- 订阅管理 -->
              <div v-if="activeSubscriptionTab === 'manage'" class="subscription-empty">
                <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
                  <rect x="17" y="19" width="62" height="24" rx="10" stroke="currentColor" stroke-width="4" opacity="0.3"/>
                  <rect x="17" y="53" width="62" height="24" rx="10" stroke="currentColor" stroke-width="4" opacity="0.3"/>
                </svg>
                <span class="empty-text">暂无订阅管理</span>
              </div>

              <!-- 购买记录 -->
              <div v-else class="subscription-empty">
                <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
                  <rect x="17" y="19" width="62" height="24" rx="10" stroke="currentColor" stroke-width="4" opacity="0.3"/>
                  <rect x="17" y="53" width="62" height="24" rx="10" stroke="currentColor" stroke-width="4" opacity="0.3"/>
                </svg>
                <span class="empty-text">暂无购买记录</span>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- 积分明细弹窗 -->
  <Teleport to="body">
    <Transition name="profile-fade">
      <div v-if="showPointsLog" class="points-log-overlay" @click.self="showPointsLog = false">
        <Transition name="profile-scale">
          <div v-if="showPointsLog" class="points-log-modal">
            <div class="points-log-close" @click="showPointsLog = false">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="points-log-header">
              <span class="points-log-title">积分明细</span>
              <span class="points-log-balance">余额: {{ userPoints }}</span>
            </div>
            <div class="points-log-body">
              <div v-if="pointsLogLoading" class="points-log-empty">加载中...</div>
              <div v-else-if="pointsLogs.length === 0" class="points-log-empty">暂无积分记录</div>
              <div v-else class="points-log-list">
                <div v-for="log in pointsLogs" :key="log.id" class="points-log-item">
                  <div class="log-item-left">
                    <span class="log-item-type" :class="log.type">{{ getTypeText(log.type) }}</span>
                    <span class="log-item-desc">{{ log.description || '-' }}</span>
                  </div>
                  <div class="log-item-right">
                    <span class="log-item-amount" :class="{ positive: log.amount > 0, negative: log.amount < 0 }">
                      {{ log.amount > 0 ? '+' : '' }}{{ log.amount }}
                    </span>
                    <span class="log-item-time">{{ formatTime(log.created_at) }}</span>
                  </div>
                </div>
              </div>
              <!-- 加载更多 -->
              <div v-if="pointsLogs.length < pointsLogTotal" class="points-log-loadmore" @click="loadMorePointsLog">
                加载更多
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- 扫码支付弹窗:create-order 成功后由 openPaymentDialog 注入商户单号 / 码图 / 有效期，
       QrDialog 内部自动轮询到账并 emit paid，再经 onPaidSuccess 关闭浮层、刷新角标、跳转流水页 -->
  <PayQrDialog
    v-model="showPayDialog"
    :out-trade-no="pdOutTradeNo"
    :qr-content="pdQrContent"
    :channel="pdChannel"
    :expires-at="pdExpiresAt"
    :amount="pdAmount"
    :package-name="pdPackageName"
    @paid="onPaidSuccess"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import axios from "@/utils/axios";
import setting from "@/components/setting/index.vue";
import hello from "@/components/hello.vue";
import PayQrDialog from "@/components/payment/QrDialog.vue";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());
import settingStore from "@/stores/setting";
import userStore from "@/stores/user";
// aiAssistant 页运行期逃生口：让 isImmersive 白名单对该路由网开一面以显出全局导航（详见 stores/uiPrefs.ts）
import uiPrefsStore from "@/stores/uiPrefs";
import { MessagePlugin } from "tdesign-vue-next";
const { showSetting } = storeToRefs(settingStore());
const uStore = userStore();
const { username, userId, displayId, isAdmin, userPoints, memberLevel } = storeToRefs(uStore);
const userInitial = computed(() => (username.value || "X").trim().charAt(0).toUpperCase());
const pointsProgress = computed(() => Math.min(100, Math.max(4, Number(userPoints.value) / 10)));

// 侧边栏折叠状态
const menuCollapsed = ref(false);

// 主导航基础项（全员可见）
const baseMenu = [
  { type: "group", label: "创作工作台" },
  { type: "btn", path: "/project", label: "AI影像创作中心", icon: "i-movie-board" },
  { type: "btn", path: "/aiAssistant", label: "创作智能体", icon: "i-magic" },
  { type: "btn", path: "/director3d", label: "镜头导演台", icon: "i-camera-one" },
  { type: "btn", path: "/canvas", label: "无限创意画布", icon: "i-edit" },
  { type: "group", label: "创作资源" },
  { type: "btn", path: "/skills", label: "Skill", icon: "i-toolkit" },
  { type: "btn", path: "/inspiration", label: "灵感资料库", icon: "i-lightning" },
  { type: "btn", path: "/task", label: "创作任务", icon: "i-view-list" },
  { type: "btn", path: "/canvas?view=assets", label: "项目资产库", icon: "i-receive" },
];
// 运营管理组（仅管理员可见）：用户管理 + 计费中心
const adminMenu = [
  { type: "group", label: "平台管理" },
  { type: "btn", path: "/adminCenter", label: "管理员中心", icon: "i-setting-one" },
];
// computed 使降权即时刷新（退出登录切普通号时运营组立刻消失）
const menuList = computed(() => [...baseMenu, ...(isAdmin.value ? adminMenu : [])]);

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

/*
 * 沉浸式创作页（画布/3D）：路由命中白名单即强压顶栏；
 * 特例:/aiAssistant 若创作者台内恒驻 Exit 纽触发了 uiPrefs.aiAssistantChromeVisible=true，
 * 则临时视作脱离沉浸让顶栏回归——使其能在保有当前对话的同时切往 项目列表/画布/定价 等兄弟模块；
 * director3d/canvas 两路继续硬性强制沉浸不可破例（外溢风险最低）。
 */
const isImmersive = computed(() =>
  ['/aiAssistant', '/director3d', '/canvas'].includes(route.path)
    && !(route.path === '/aiAssistant' && uiPrefs.aiAssistantChromeVisible)
);
// 画布本身拥有一套站内导航，因此默认使用全宽焦点模式；外层工作台导航按需以浮层打开。
const isCanvasFullscreen = computed(() => route.path === '/canvas');
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
  },
);

function handleClick(menu: any) {
  if (menu.needProject && !project.value) return;
  router.push(menu.path);
  activeMenu.value = menu.path;
}

// 用户下拉菜单（侧栏底部用户块，Teleport 到 body）
const footMenuOpen = ref(false);
const userFootRef = ref<HTMLElement | null>(null);
const footDropStyle = ref({ left: "224px", bottom: "20px" });

function toggleFootMenu() {
  // 打开时根据用户块位置动态计算菜单定位（fixed 相对视口）
  if (!footMenuOpen.value && userFootRef.value) {
    const rect = userFootRef.value.getBoundingClientRect();
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - 390));
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

onMounted(() => {
  document.addEventListener('pointerdown', closeFootMenuOnOutside);
  window.addEventListener('message', toggleCanvasWorkspaceNav);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeFootMenuOnOutside);
  window.removeEventListener('message', toggleCanvasWorkspaceNav);
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

// 退出登录
function handleLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("userId");
  localStorage.removeItem("role");
  localStorage.removeItem("username");
  window.location.reload();
}

// 个人信息
const showUserProfile = ref(false);
const profileLoading = ref(false);
const profileForm = ref({
  name: username.value || "",
  password: "",
  confirmPassword: "",
});

// 监听抽屉打开，重置表单
watch(showUserProfile, (val) => {
  if (val) {
    profileForm.value = {
      name: username.value || "",
      password: "",
      confirmPassword: "",
    };
  }
});

async function handleUpdateProfile() {
  if (!profileForm.value.name.trim()) {
    MessagePlugin.warning("用户名不能为空");
    return;
  }
  if (profileForm.value.password && profileForm.value.password !== profileForm.value.confirmPassword) {
    MessagePlugin.warning("两次输入的密码不一致");
    return;
  }
  if (profileForm.value.password && profileForm.value.password.length < 6) {
    MessagePlugin.warning("密码长度不能少于6位");
    return
  }
  try {
    profileLoading.value = true;
    const params: any = { name: profileForm.value.name.trim() };
    if (profileForm.value.password) {
      params.password = profileForm.value.password;
    }
    await axios.post("/setting/loginConfig/updateUserPwd", params);
    MessagePlugin.success("修改成功");
    // 更新本地存储的用户名
    localStorage.setItem("username", profileForm.value.name.trim());
    username.value = profileForm.value.name.trim();
    showUserProfile.value = false;
  } catch (e: any) {
    MessagePlugin.error(e.message || "修改失败");
  } finally {
    profileLoading.value = false;
  }
}

// 会员订阅
const showMemberPlan = ref(false);
// 套餐 key：与下方 memberPlans 的键保持一致
type MemberTabKey = keyof typeof memberPlans;
const activeMemberTab = ref<MemberTabKey>('monthly');
const memberTabs: { id: MemberTabKey; name: string; tag: string }[] = [
  { id: 'monthly', name: '连续包月', tag: '限时赠送' },
  { id: 'single', name: '单月购买', tag: '' },
  { id: 'yearly', name: '单年购买', tag: '限时赠送' },
];

// 套餐价格配置
const memberPlans = {
  monthly: {
    standard: { price: 48, originalPrice: 80, discount: '热门推荐', tag: '限时特惠 6 折' },
    premium: { price: 188, originalPrice: 360, discount: '尊享特权', tag: '限时特惠 5 折' },
  },
  single: {
    standard: { price: 78, originalPrice: 80, discount: null, tag: null },
    premium: { price: 328, originalPrice: 360, discount: '尊享特权', tag: null },
  },
  yearly: {
    standard: { price: 458, originalPrice: 960, discount: '热门推荐', tag: '限时特惠 5 折' },
    premium: { price: 1888, originalPrice: 4320, discount: '尊享特权', tag: '限时特惠 4 折' },
  },
};

// ── 扫码付费编排：从所选商品发起到弹出二维码再到到账落地的中枢 ──
const showPayDialog = ref(false);
const pdOutTradeNo = ref("");
const pdQrContent = ref("");
const pdChannel = ref("simulate");
const pdExpiresAt = ref<any>(null);
const pdAmount = ref("");
const pdPackageName = ref("");

/**
 * 创建待支付订单并唤起扫码弹窗（Phase A 固定 simulate 渠道零成本跑通）：
 * 商户单号贯穿下单 / 轮询 / 结果页标识；金额与权益快照在后端一次性冻结入库。
 */
async function openPaymentDialog(packageId: number) {
  try {
    const resp: any = await axios.post("/pay/create-order", {
      packageId,
      channel: "simulate",
    });
    if (!resp || resp.code !== 200) {
      throw new Error(resp?.message || "创建订单失败");
    }
    const d: any = resp.data || {};
    pdOutTradeNo.value = String(d.outTradeNo || "");
    pdQrContent.value = String(d.qrContent || "");
    pdChannel.value = String(d.channel || "simulate");
    pdExpiresAt.value = d.expiresAt ?? null;
    pdAmount.value = d.amount != null ? String(d.amount) : "";
    pdPackageName.value =
      String(d.packageName || "") ||
      (d.grantLevel ? `${d.grantVipDays}天会员` : "");
    showPayDialog.value = true;
  } catch (e: any) {
    MessagePlugin.error(
      e?.message || e?.response?.data?.message || "创建订单失败，请稍后再试",
    );
  }
}

/**
 * 根据 desired 会员等级反查一条已上架(grant_level 匹配)的套餐记录；
 * 种子里目前有 月卡-standard / 季卡-premium / 年卡-premium 三档可供演练。
 */
function findMemberPackageId(level: "standard" | "premium"): number | null {
  const candidates =
    ((pointsPackages?.value as Array<any> | undefined)?.filter(
      (p) => p && p.grant_level === level,
    )) || [];
  if (!candidates.length) {
    MessagePlugin.warning(
      `暂无可购买的${level === "standard" ? "标准" : "高级"}会员套餐，请联系运营在计费中心添加`,
    );
    return null;
  }
  return Number(candidates[0].id);
}

/** 二维码弹窗收到支付到账后的收口：关停相关浮层、刷新角标、跳转积分流水见证权益生效 */
function onPaidSuccess(_payload: any) {
  showPayDialog.value = false;
  showMemberPlan.value = false;
  showPointsRecharge.value = false;
  void fetchUserPoints();
  MessagePlugin.success("支付成功，积分与会员权益已生效");
  setTimeout(() => router.push("/myPoints"), 500);
}

function handleSubscribe(plan: string) {
  const level: "standard" | "premium" = plan === "premium" ? "premium" : "standard";
  const pid = findMemberPackageId(level);
  if (pid != null) void openPaymentDialog(pid);
}

// 积分明细四类统计：充值弹窗左侧补充指标（权威积分余额在 store.userPoints）
const pointsBreakdown = ref({
  checkin: 0,
  gift: 0,
  purchased: 0,
  member: 0,
});

// 会员等级样式与中文称谓均派生自 store.memberLevel，保证跨视图 / 支付后即时联动
const MEMBER_LEVEL_LABEL: Record<string,string> = {
  free: '非会员',
  standard: '标准会员',
  premium: '高级会员',
};
const memberLevelClass = computed(() => memberLevel.value || 'free');
const userMemberStatus = computed(() => MEMBER_LEVEL_LABEL[memberLevel.value] || '非会员');

// 获取用户积分余额（委托 uStore.refreshProfile 同步全局角标权威源；顺带回填充值弹窗的分类明细）
async function fetchUserPoints() {
  try {
    const data: any = await uStore.refreshProfile<any>();
    if (!data) return;
    if ((data as any).breakdown) pointsBreakdown.value = (data as any).breakdown;
  } catch (e) {
    console.error('获取积分失败:', e);
  }
}

// 积分充值
const showPointsRecharge = ref(false);
const selectedPointsPackage = ref(200);
const pointsPackages = ref<Array<{id: number, points: number, price: number, bonus: number}>>([]);

// 获取积分套餐列表
async function fetchPointsPackages() {
  try {
    const { data } = await axios.get('/setting/pointsConfig/purchase/packages');
    if (data && data.length > 0) {
      pointsPackages.value = data;
      selectedPointsPackage.value = data[0].id;
    }
  } catch (e) {
    console.error('获取套餐失败:', e);
  }
}

const selectedPackagePrice = computed(() => {
  const pkg = pointsPackages.value.find(p => p.id === selectedPointsPackage.value);
  return pkg ? pkg.price : 0;
});

async function handlePurchasePoints() {
  if (!selectedPointsPackage.value) {
    MessagePlugin.warning('请选择套餐');
    return;
  }
  // 关闭下层套餐面板以免遮挡二维码窗，随后走统一的 create-order 流程唤出扫码弹窗
  showPointsRecharge.value = false;
  await openPaymentDialog(Number(selectedPointsPackage.value));
}

// 积分明细
const showPointsLog = ref(false);
const pointsLogs = ref<any[]>([]);
const pointsLogLoading = ref(false);
const pointsLogPage = ref(1);
const pointsLogTotal = ref(0);

async function openPointsLog() {
  showPointsLog.value = true;
  pointsLogPage.value = 1;
  pointsLogs.value = [];
  await fetchPointsLog();
}

async function fetchPointsLog() {
  pointsLogLoading.value = true;
  try {
    const { data } = await axios.get('/setting/pointsConfig/log', {
      params: { page: pointsLogPage.value, limit: 20 }
    });
    if (pointsLogPage.value === 1) {
      pointsLogs.value = data.logs;
    } else {
      pointsLogs.value.push(...data.logs);
    }
    pointsLogTotal.value = data.pagination.total;
  } catch (e) {
    console.error('获取积分流水失败:', e);
  } finally {
    pointsLogLoading.value = false;
  }
}

async function loadMorePointsLog() {
  pointsLogPage.value++;
  await fetchPointsLog();
}

function getTypeText(type: string) {
  const map: Record<string, string> = {
    consume: '消费',
    recharge: '充值',
    gift: '赠送',
    refund: '退款',
    checkin: '签到',
    member: '会员'
  };
  return map[type] || type;
}

function formatTime(time: string) {
  if (!time) return '-';
  const d = new Date(time);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// 页面加载时获取积分数据
onMounted(() => {
  fetchUserPoints();
  fetchPointsPackages();
});

// 订阅管理
const showSubscription = ref(false);
const activeSubscriptionTab = ref('manage');

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
      padding: 4px 8px 22px;
      display: flex;
      align-items: center;
      gap: 10px;

      .logo {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        border-radius: 9px;
        overflow: hidden;
        background: url("@/assets/XOI_logo.png") no-repeat center;
        background-size: contain;
        transition: transform 0.3s ease;

        &:hover {
          transform: scale(1.05);
        }
      }

      .brand-name {
        font-size: 16px;
        font-weight: 700;
        color: #182033;
        white-space: nowrap;
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

          .member-icon {
            color: white;
            flex-shrink: 0;
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
        border: 1px solid #edf0f4;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.25s ease;

        &:hover {
          background: #f6f8fb;
          border-color: #e3e9f3;
        }

        .user-avatar {
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: #e8f0ff;
          color: #1d5fd1;
          font-size: 18px;
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
  width: 300px !important;
  padding: 26px 18px 16px !important;
  background: #eeeeee !important;
  border-right: 1px solid #dedede !important;
  overflow: hidden;
}
.main .menu .logoBox .collapse-btn { position:absolute; top:12px; right:0; left:auto; width:32px; height:34px; transform:none; border:1px solid #d3d3d3; border-radius:9px; background:#e7e7e7; box-shadow:none; color:#3e3e3e; opacity:1; }
.main .menu .logoBox .collapse-btn:hover { width:36px; background:#dcdcdc; color:#191919; }
.main .menu.collapsed .logoBox .collapse-btn { top:8px; right:0; width:32px; height:32px; opacity:0; pointer-events:none; }
.main .menu.collapsed .logoBox:hover .collapse-btn,
.main .menu.collapsed .logoBox:focus-within .collapse-btn { opacity:1; pointer-events:auto; }
.main .menu .logoBox { min-height:64px; padding:4px 14px 28px; gap:14px; }
.main .menu .logoBox .logo { width:48px; height:48px; border-radius:13px; background-color:#fff; box-shadow:0 0 0 1px #d4d4d4; }
.main .menu .logoBox .brand-name { font-size:19px; color:#202020; letter-spacing:-.025em; }
.main .menu .itemBox { min-height:0; height:auto; gap:5px; padding:0 2px 10px 0; overflow-y:auto; }
.main .menu .item { height:50px; padding:0 16px; gap:14px; border-radius:15px; }
.main .menu .item .icon { color:#252525; font-size:22px; }
.main .menu .item .item-title { color:#252525; font-size:16px; font-weight:500; }
.main .menu .item:hover { background: #e9e9e9; }
.main .menu .active { background: #dedede !important; }
.main .menu .active .icon,.main .menu .active .item-title { color: #171717 !important; font-weight: 600; }
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
.main .menu.collapsed .logoBox { padding:4px 3px 22px; }
.main .menu.collapsed .footItem .member-btn { width:44px !important; height:44px !important; padding:0 !important; border-radius:12px !important; background:transparent !important; }
.main .menu.collapsed .member-btn .credits-summary { display:none; }
.main .menu.collapsed .footItem .member-btn .member-btn-inner { width:44px !important; height:44px !important; border-radius:12px !important; }

// 侧栏用户菜单（Teleport 到 body 后脱离 .main，需非 scoped 样式；left/bottom 由 JS 计算）
.foot-dropdown {
  position: fixed;
  width: 360px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #dedede;
  border-radius: 24px;
  box-shadow: 0 24px 70px rgba(0,0,0,.2);
  padding: 0;
  z-index: 200;

  .account-card { position:relative; min-height:235px; padding:25px 28px 26px; overflow:hidden; color:#fff; background:radial-gradient(circle at 90% 5%,#353535 0,transparent 36%),#202020; box-sizing:border-box; }
  .account-mascot { position:absolute; z-index:0; top:10px; right:18px; width:126px; height:92px; object-fit:contain; object-position:center; filter:drop-shadow(0 10px 14px rgba(0,0,0,.28)); transform:rotate(5deg); }
  .account-profile { position:relative; z-index:1; display:flex; align-items:center; gap:14px; max-width:210px; }
  .account-profile>div:last-child { display:flex; flex-direction:column; min-width:0; }
  .account-profile strong { overflow:hidden; color:#fff; font-size:21px; text-overflow:ellipsis; white-space:nowrap; }
  .account-profile span { margin-top:5px; color:rgba(255,255,255,.68); font-size:12px; }
  .account-avatar { display:grid; place-items:center; width:58px; height:58px; flex:none; border:2px solid #fff; border-radius:50%; background:#f57400; font-size:22px; font-weight:700; }
  .credits-row { position:relative; z-index:1; display:flex; align-items:baseline; gap:8px; width:100%; margin-top:22px; padding:0; border:0; background:transparent; color:#fff; cursor:pointer; text-align:left; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  .credits-row>span { flex:none; display:flex; align-items:baseline; gap:9px; font-size:14px; line-height:1; font-weight:600; }.credits-row strong{margin:0;font-size:28px;line-height:1;font-weight:750;letter-spacing:-.03em}.credits-row em{margin:0;font-size:14px;line-height:1;font-style:normal;font-weight:500;color:rgba(255,255,255,.82)}.credits-row>svg{margin-left:auto;font-size:16px;align-self:center}
  .credits-progress { position:relative; z-index:1; height:5px; margin:13px 0 22px; overflow:hidden; border-radius:99px; background:#8d8a85; }.credits-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#dfc4ae,#ff780d)}
  .upgrade-account { position:relative; z-index:1; display:flex; align-items:center; justify-content:center; gap:9px; width:100%; height:47px; border:0; border-radius:15px; background:#fff; color:#222; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; font-size:15px; line-height:1; font-weight:650; cursor:pointer; }
  .account-menu { padding:13px 0 10px; }

  .drop-item {
    display: grid;
    grid-template-columns: 28px minmax(0,1fr) auto auto;
    align-items: center;
    column-gap: 14px;
    width: 100%;
    min-height: 44px;
    padding: 8px 25px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #262626;
    font: inherit;
    font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    font-size: 14px;
    line-height: 1.25;
    text-decoration: none;
    box-sizing: border-box;
    cursor: pointer;
    transition: all 0.2s ease;

    .d-icon {
      width: 22px;
      font-size: 20px;
      color: #2b2b2b;
    }

    > span:not(.notice-dot) { min-width:0; text-align:left; }
    > em { color:#555; font-size:13px; line-height:1.25; font-style:normal; }
    .drop-arrow { color:#777; font-size:15px; }
    .notice-dot { width:7px; height:7px; flex:none; border-radius:50%; background:#ff7417; }

    &:hover {
      background: #f2f2f2;
      color: #111;

      .d-icon {
        color: #111;
      }
    }

    &.danger {
      color: var(--td-error-color);
    }

    &.danger:hover {
      background: var(--td-error-color-light);
      color: var(--td-error-color);
    }
  }

  .drop-divider {
    height: 1px;
    background: #e5e5e5;
    margin: 9px 0;
  }
}

/* 光合效应：克制的高级灰侧栏与轻量导航反馈 */
.main .menu {
  background: #eeeeee !important;
  border-right-color: #dedede !important;
}

/* 工作台布局：侧栏保持完整宽度，窗口变窄时悬浮覆盖，不挤压主内容 */
.main .menu {
  width: 300px !important;
  min-width: 300px !important;
  flex: 0 0 300px !important;
}

@media (max-width: 1280px) {
  .main {
    overflow: hidden;
  }

  .main .menu {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
    width: 300px !important;
    min-width: 300px !important;
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
.main .menu .item:hover .icon { color: #111; transform: scale(1.1); filter: drop-shadow(0 0 5px rgba(255,255,255,.82)); }
.main .menu .active { background: #dedede !important; box-shadow: inset 3px 0 0 #202020; }
.main .menu .active .icon { color: #171717 !important; filter: none; }
.main .menu .footItem .member-icon { font-size: 16px; font-weight: 500; line-height: 1; }
.main .menu .logoBox .collapse-btn { background: #e7e7e7; border-color: #d3d3d3; color: #3e3e3e; transition: transform .2s ease, background .2s ease, color .2s ease; }
.main .menu .logoBox .collapse-btn:hover { background: #202020; color: #fff; transform: scale(1.06); }

/* Canvas focus mode: the canvas owns the full viewport. The outer navigation is an on-demand overlay,
   so it never steals canvas space while the user is arranging nodes. */
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
