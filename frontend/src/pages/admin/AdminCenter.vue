<template>
  <main class="admin-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">X</span><div><b>管理后台</b><small>ADMIN CONSOLE</small></div></div>
      <div class="nav-title">运营管理</div>
      <button v-for="item in sideNav" :key="item.id" :title="item.label" :aria-label="item.label" :aria-current="activeTab === item.id ? 'page' : undefined" :class="['side-item',{active: activeTab===item.id}]" @click="activeTab=item.id as TabId"><span>{{ item.icon }}</span>{{ item.label }}</button>
      <div class="nav-title settings-title">系统</div>
      <button :class="['side-item',{active: activeTab==='settings'}]" @click="activeTab='settings'"><span>⚙</span>系统设置</button>
      <div class="side-foot">管理员工作区<br><small>v1.0 · {{ currentDate }}</small></div>
      <button class="home-item" type="button" @click="goHome"><span>⌂</span><span class="home-copy"><b>回到首页</b><small>返回创作工作台</small></span><i>↗</i></button>
    </aside>
    <section class="admin-main">
    <header class="topbar"><div><span class="crumb">管理员后台</span><span class="slash">/</span><strong>{{ activeLabel }}</strong></div><div class="operator"><i></i>{{ operatorName }}<button @click="logout">退出</button></div></header>
    <div class="admin-center">
    <header class="admin-center-head">
      <div>
        <span class="eyebrow">ADMIN WORKSPACE</span>
        <h1>管理员中心</h1>
        <p>集中管理账号、积分和平台计费规则。</p>
      </div>
      <span class="status"><i></i>管理员工作区</span>
    </header>

    <section class="admin-panel">
      <component :is="activeComponent" />
    </section>
    </div>
    </section>
    <SettingDialog v-if="settings.showSetting" />
  </main>
</template>

<script setup lang="ts">
import { computed, ref, defineAsyncComponent, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import userStore from "@/stores/user";
import settingStore from "@/stores/setting";
const AdminOverviewView = defineAsyncComponent(() => import("@/pages/admin/AdminOverviewView.vue"));
const UsersView = defineAsyncComponent(() => import("@/pages/admin/UsersView.vue"));
const PointsView = defineAsyncComponent(() => import("@/pages/points/index.vue"));
const PricingView = defineAsyncComponent(() => import("@/pages/admin/PricingView.vue"));
const SystemSettingsView = defineAsyncComponent(() => import("@/pages/admin/SystemSettingsView.vue"));
const AdminOrdersView = defineAsyncComponent(() => import("@/pages/admin/AdminOrdersView.vue"));
const AdminTasksView = defineAsyncComponent(() => import("@/pages/admin/AdminTasksView.vue"));
const AdminProvidersView = defineAsyncComponent(() => import("@/pages/admin/AdminProvidersView.vue"));
const SettingDialog = defineAsyncComponent(() => import("@/components/setting/index.vue"));

type TabId = "overview" | "users" | "points" | "orders" | "tasks" | "pricing" | "providers" | "settings";
const route = useRoute(), router = useRouter(), account = userStore(), settings = settingStore();
const allowedTabs = ["overview","users","points","orders","tasks","pricing","providers","settings"];
const activeTab = ref<TabId>(allowedTabs.includes(String(route.query.tab)) ? route.query.tab as TabId : "overview");
watch(activeTab, (tab) => router.replace({ query: { ...route.query, tab } }));
watch(() => route.query.tab, (tab) => { if (allowedTabs.includes(String(tab))) activeTab.value = tab as TabId; });
const operatorName = computed(() => account.username || '管理员');
const currentDate = new Date().toLocaleDateString('zh-CN');
const sideNav = [
  { id: 'overview' as const, label: '运营总览', icon: '⌁' },
  { id: 'users' as const, label: '用户与权限', icon: '♙' },
  { id: 'points' as const, label: '积分与套餐', icon: '◇' },
  { id: 'orders' as const, label: '支付订单', icon: '￥' },
  { id: 'tasks' as const, label: '任务监控', icon: '⌁' },
  { id: 'pricing' as const, label: '模型与计费', icon: '◈' },
  { id: 'providers' as const, label: '供应商', icon: '♢' },
];
const activeLabel = computed(() => sideNav.find(i=>i.id===activeTab.value)?.label || '系统设置');
function logout(){ account.clearUser(); settings.showSetting = false; router.replace('/login'); }
function goHome(){ location.hash='#/project'; }
const tabs = [
  { id: "overview" as const, label: "运营总览", description: "关键指标与平台动态", icon: "i-dashboard", component: AdminOverviewView },
  { id: "users" as const, label: "用户管理", description: "账号与权限", icon: "i-peoples-two", component: UsersView },
  { id: "points" as const, label: "计费中心", description: "积分与流水", icon: "i-wallet", component: PointsView },
  { id: "orders" as const, label: "支付订单", description: "充值与回调", icon: "i-wallet", component: AdminOrdersView },
  { id: "tasks" as const, label: "任务监控", description: "生成状态与异常", icon: "i-dashboard", component: AdminTasksView },
  { id: "pricing" as const, label: "定价规则", description: "模型计费倍率", icon: "i-funds", component: PricingView },
  { id: "providers" as const, label: "供应商", description: "上游连接与模型", icon: "i-setting", component: AdminProvidersView },
  { id: "settings" as const, label: "系统设置", description: "平台开关与安全策略", icon: "i-setting", component: SystemSettingsView },
];
const activeComponent = computed(() => tabs.find((tab) => tab.id === activeTab.value)?.component || UsersView);
function navigate(event: Event) { const tab = (event as CustomEvent).detail; if (allowedTabs.includes(tab)) activeTab.value = tab; }
onMounted(() => window.addEventListener('admin:navigate', navigate));
onUnmounted(() => window.removeEventListener('admin:navigate', navigate));
</script>

<style lang="scss" scoped>
.admin-shell { min-height:100%; display:flex; background:#f6f7fb; color:#202020; }.sidebar{width:224px;flex:none;background:#151a2d;color:#fff;padding:22px 14px;display:flex;flex-direction:column;min-height:100vh}.brand{display:flex;align-items:center;gap:10px;padding:2px 10px 20px}.brand-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:#f2762e;font-weight:800}.brand b{display:block;font-size:15px}.brand small{display:block;font-size:9px;letter-spacing:.12em;color:#8991aa;margin-top:3px}.nav-title{padding:20px 12px 8px;color:#737d9c;font-size:10px;letter-spacing:.12em}.home-item{width:100%;border:1px solid #303751;background:#1d2440;color:#e7ebf7;padding:10px 12px;border-radius:9px;text-align:left;font-size:13px;cursor:pointer;display:flex;gap:11px;align-items:center;transition:.2s}.home-item span{width:18px;text-align:center;font-size:17px}.home-item:hover{background:#2a3355;border-color:#f2762e;color:#fff}.side-item{width:100%;border:0;background:transparent;color:#aab1c7;padding:11px 12px;border-radius:9px;text-align:left;font-size:13px;cursor:pointer;display:flex;gap:11px;align-items:center}.side-item span{width:18px;text-align:center;font-size:16px}.side-item:hover{background:#232a46;color:#fff}.side-item.active{background:#f2762e;color:#fff;box-shadow:0 5px 14px #f2762e44}.settings-title{margin-top:14px}.side-foot{margin-top:auto;padding:14px 12px;border-top:1px solid #2b324b;color:#7f89a6;font-size:11px;line-height:1.7}.admin-main{flex:1;min-width:0}.topbar{height:62px;background:#fff;border-bottom:1px solid #e9ebf2;padding:0 28px;display:flex;align-items:center;justify-content:space-between;font-size:13px}.crumb{color:#98a0b1}.slash{margin:0 10px;color:#d0d4dc}.operator{display:flex;align-items:center;gap:8px;color:#4c5568}.operator i{width:8px;height:8px;border-radius:50%;background:#22b573}.operator button{border:0;background:none;color:#f2762e;cursor:pointer;margin-left:10px}.admin-center { min-height:calc(100vh - 62px); overflow:visible; padding:28px clamp(18px,3vw,42px) 42px; color:#202020; }
.admin-center-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:24px; }
.eyebrow { color:#f2762e; font-size:11px; font-weight:700; letter-spacing:.16em; }
h1 { margin:7px 0 0; font-size:30px; letter-spacing:-.04em; }
.admin-center-head p { margin:8px 0 0; color:#858585; font-size:13px; }
.status { display:inline-flex; align-items:center; gap:7px; padding:8px 12px; border:1px solid #dfeee6; border-radius:999px; background:#f4fbf7; color:#258154; font-size:12px; font-weight:600; white-space:nowrap; }.status i{width:7px;height:7px;border-radius:50%;background:#25a56a;box-shadow:0 0 0 3px rgba(37,165,106,.12)}
.admin-tabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:18px; }
.admin-tabs button { display:flex; align-items:center; gap:13px; min-height:72px; padding:13px 17px; border:1px solid #e5e5e5; border-radius:16px; background:#fff; color:#555; text-align:left; cursor:pointer; transition:.2s ease; }
.admin-tabs button:hover { border-color:#f2b58d; transform:translateY(-1px); }.admin-tabs button.active { border-color:#f2762e; background:#f2762e; color:#fff; box-shadow:0 9px 22px rgba(242,118,46,.24); }.admin-tabs button>svg{font-size:22px;flex:none}.admin-tabs button span{display:flex;flex-direction:column;gap:4px}.admin-tabs strong{font-size:14px}.admin-tabs small{color:#999;font-size:11px}.admin-tabs .active small{color:#fff0e5}
.admin-panel { min-height:500px; overflow:visible; border:1px solid #f0dfd2; border-radius:20px; background:rgba(255,255,255,.88); box-shadow:0 10px 30px rgba(242,118,46,.06); }.admin-panel :deep(.admin-users-page),.admin-panel :deep(.points-management),.admin-panel :deep(.pricingWrap){padding-left:24px;padding-right:24px}
@media(max-width:760px){.sidebar{width:64px;padding:18px 8px}.brand div,.nav-title,.side-item:not(.active)::after,.side-item{font-size:0}.side-item span{font-size:18px}.side-foot{display:none}.topbar{padding:0 14px}.operator button{display:block}.admin-center-head{align-items:flex-start;flex-direction:column}.admin-tabs{grid-template-columns:1fr}.admin-panel :deep(.admin-users-page),.admin-panel :deep(.points-management),.admin-panel :deep(.pricingWrap){padding-left:12px;padding-right:12px}}
.sidebar{background:linear-gradient(180deg,#171b35 0%,#202548 52%,#242a52 100%);padding:24px 14px 16px;box-shadow:inset -1px 0 rgba(255,255,255,.05)}
.brand{padding:0 10px 24px}.brand-mark{background:linear-gradient(135deg,#f2a07a,#e46983);box-shadow:0 8px 18px rgba(229,105,131,.25)}.brand b{letter-spacing:.01em}.brand small{color:#9da5c5}
.nav-title{color:#8f99bf;padding-top:18px}.side-item{color:#b1b9d5;margin:2px 0}.side-item:hover{background:rgba(157,167,224,.12);color:#fff}.side-item.active{background:linear-gradient(100deg,#8179d9,#7268c6);box-shadow:0 8px 20px rgba(91,82,180,.34)}
.settings-title{margin-top:20px}.side-foot{border-top-color:rgba(255,255,255,.1);color:#9aa4c5;padding:16px 12px 13px}.side-foot small{color:#747fa5}
.home-item{margin-top:2px;padding:11px 12px;border:1px solid rgba(198,205,245,.18);background:rgba(255,255,255,.06);color:#e7eaff;border-radius:12px;gap:10px}.home-item:hover{background:rgba(255,255,255,.12);border-color:rgba(242,160,122,.55);color:#fff}.home-item>span:first-child{width:22px;color:#f1a080;font-size:17px}.home-item .home-copy{display:flex;flex-direction:column;align-items:flex-start;gap:2px;flex:1;width:auto}.home-item .home-copy b{font-size:12px;font-weight:650}.home-item .home-copy small{font-size:10px;color:#aab2d0}.home-item>i{font-size:14px;color:#8e98bc;font-style:normal}
.topbar{background:rgba(255,255,255,.96)}
@media(max-width:760px){.home-item{justify-content:center;padding:11px 8px}.home-item .home-copy,.home-item>i{display:none}.home-item>span:first-child{width:auto}}
:where(button):focus-visible { outline:3px solid #a79df0; outline-offset:3px; }
</style>
