<template>
  <t-dialog :footer="false" placement="center" width="1180px" v-model:visible="showSetting" class="xoi-settings-dialog">
    <template #header><div class="dialogHeading"><span class="headingMark">✦</span><div><strong>XOi 设置</strong><small>管理你的创作偏好与平台能力</small></div></div></template>
    <div class="settingPanel">
      <aside class="settingMenu">
        <div v-for="group in menuGroups" :key="group.label" class="menuGroup">
          <span class="groupLabel">{{ group.label }}</span>
          <button v-for="item in group.items" :key="item.key" type="button" :class="{active:activeMenu===item.key}" @click="activeMenu=item.key">
            <component :is="item.icon" class="icon"/><span>{{ $t(item.label) }}</span><i>›</i>
          </button>
        </div>
        <button class="logoutEntry" type="button" :class="{active:activeMenu==='logoutConfig'}" @click="activeMenu='logoutConfig'"><i-logout class="icon"/><span>退出登录</span></button>
      </aside>
      <div class="settingRight">
        <div class="sectionTitle"><span>{{ currentMenuItem ? $t(currentMenuItem.label) : "" }}</span><small>{{ currentMenuItem?.desc || '' }}</small></div>
        <div class="settingContent">
          <uiConfig v-if="activeMenu === 'ui'" />
          <languageConfig v-if="activeMenu === 'language'" />
          <vendorConfig v-if="activeMenu === 'vendorConfig'" />
          <requestConfig v-if="activeMenu === 'requestConfig'" />
          <loginConfig v-if="activeMenu === 'loginConfig'" />
          <agentConfog v-if="activeMenu === 'agentConfog'" />
          <promptManage v-if="activeMenu === 'promptManage'" />
          <logoutConfig v-if="activeMenu === 'logoutConfig'" />
          <memoryConfig v-if="activeMenu === 'memoryConfig'" />
          <modelMap v-if="activeMenu === 'modelMap'" />
        </div>
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import settingStore from "@/stores/setting";
import userStore from "@/stores/user";
const { showSetting, activeMenu } = storeToRefs(settingStore());
const user = userStore();

import uiConfig from "./components/uiConfig.vue";
import languageConfig from "./components/languageConfig.vue";
import requestConfig from "./components/requestConfig.vue";
import loginConfig from "./components/loginConfig.vue";
import agentConfog from "./components/agentConfog.vue";
import logoutConfig from "./components/logoutConfig.vue";
import vendorConfig from "./components/vendorConfig.vue";
import memoryConfig from "./components/memoryConfig.vue";
import promptManage from "./components/promptManage.vue";
import modelMap from "./components/modelMap.vue";

const menuItems = [
  { key: "ui", label: "settings.menu.ui", icon: "i-theme", group: "personal", desc: "外观、主题与创作界面偏好" },
  { key: "language", label: "settings.menu.language", icon: "i-translate", group: "personal", desc: "选择平台显示语言" },
  { key: "memoryConfig", label: "settings.menu.memoryConfig", icon: "i-memory-card-one", group: "personal", desc: "管理平台记忆检索与存储策略", adminOnly: true },
  { key: "vendorConfig", label: "settings.menu.vendorConfig", icon: "i-computer", group: "model", desc: "接入文本、图片、视频与音频模型", adminOnly: true },
  { key: "modelMap", label: "settings.menu.modelMap", icon: "i-connection", group: "model", desc: "为创作场景指定默认模型", adminOnly: true },
  { key: "agentConfog", label: "settings.menu.agentConfig", icon: "i-color-filter", group: "ai", desc: "配置平台 Agent 的模型与行为", adminOnly: true },
  { key: "promptManage", label: "settings.menu.promptManage", icon: "i-tips", group: "ai", desc: "维护平台级提示词模板", adminOnly: true },
  { key: "loginConfig", label: "settings.menu.loginConfig", icon: "i-lock", group: "platform", desc: "修改个人用户名与密码" },
  { key: "logoutConfig", label: "settings.menu.logoutConfig", icon: "i-logout" },
];

const visibleMenuItems = computed(() => {
  return menuItems.filter((item) => {
    if (item.adminOnly && !user.isAdmin) return false;
    return true;
  });
});

const currentMenuItem = computed(() => menuItems.find((item) => item.key === activeMenu.value));
const menuGroups = computed(() => {
  const visible = visibleMenuItems.value.filter(item => item.key !== "logoutConfig");
  return [
    { key: "personal", label: "个人偏好" },
    { key: "model", label: "模型与生成" },
    { key: "ai", label: "AI 工作流" },
    { key: "platform", label: "平台管理" },
  ].map(group => ({ ...group, items: visible.filter(item => item.group === group.key) })).filter(group => group.items.length);
});

watchEffect(() => {
  if (!visibleMenuItems.value.some(item => item.key === activeMenu.value)) activeMenu.value = "ui";
});
</script>

<style lang="scss" scoped>
.settingPanel {
  display: flex;
  height: min(74vh, 760px);
  overflow: hidden;
  margin: -8px -16px -16px;
  background: #fbfaf9;

  .settingMenu {
    width: 230px;
    min-width: 230px;
    padding: 18px 12px 14px;
    border-right: 1px solid rgba(66, 55, 48, .07);
    background: linear-gradient(180deg, #f8f7f5 0%, #f6f4f2 100%);
    flex-shrink: 0;
    overflow-y: auto;
    .icon {
      font-size: 20px;
      font-size: 17px;
    }
    .menuGroup{margin-bottom:20px}.groupLabel{display:block;padding:0 12px 8px;color:#a19b96;font-size:10px;font-weight:700;letter-spacing:.12em;line-height:16px}.menuGroup button,.logoutEntry{display:grid;grid-template-columns:24px minmax(0,1fr) 16px;align-items:center;column-gap:10px;width:100%;height:44px;padding:0 12px;border:0;border-radius:11px;background:transparent;color:#625d59;font-size:13px;line-height:1;text-align:left;cursor:pointer;transition:.18s ease}.menuGroup button .icon,.logoutEntry .icon{display:block;justify-self:center;width:18px;height:18px;margin:0}.menuGroup button span,.logoutEntry span{display:block;min-width:0;line-height:20px}.menuGroup button i{justify-self:end;color:#b7b1ac;font-size:18px;font-style:normal;line-height:1}.menuGroup button:hover{background:rgba(255,255,255,.65);color:#252220}.menuGroup button.active,.logoutEntry.active{background:rgba(255,255,255,.88);color:#252220;box-shadow:0 4px 14px rgba(54,45,40,.045),inset 0 0 0 1px rgba(75,62,54,.04)}.menuGroup button.active .icon{color:#ef6c35}.logoutEntry{margin-top:auto;color:#d84b43}.logoutEntry::after{content:"";width:16px}
  }

  .settingRight {
    flex: 1;
    padding: 24px 26px;
    height: 100%;
    overflow-y: auto;

    .sectionTitle {
      display:flex;flex-direction:column;gap:4px;
      padding-bottom: 18px;
      border-bottom: 1px solid #ece8e5;
      margin-bottom: 18px;
      height: auto;
      span{font-size:22px;font-weight:750;color:#282421}small{color:#948e89;font-size:12px;font-weight:400}
    }

    .settingContent {
      width: 100%;
      height: calc(100% - 72px);
    }
  }
}
.dialogHeading{display:flex;align-items:center;gap:11px}.headingMark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:#fff1e9;color:#ed6a34}.dialogHeading div{display:flex;flex-direction:column}.dialogHeading strong{font-size:17px}.dialogHeading small{margin-top:2px;color:#a09a95;font-size:11px}
:global(.xoi-settings-dialog .t-dialog){overflow:hidden;border:1px solid rgba(68,55,47,.06);border-radius:22px;background:#fbfaf9;box-shadow:0 28px 90px rgba(38,31,28,.16)}
:deep(.t-menu) {
  padding: 0;
  padding-right: 8px;
}
:deep(.t-is-active) {
  .t-badge {
    color: var(--td-brand-color) !important;
  }
}
</style>
