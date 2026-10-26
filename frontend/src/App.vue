<template>
  <div v-if="loading" class="app-loading">
    <t-loading :loading="true" size="large" text="加载中..." />
  </div>
  <template v-else>
    <t-config-provider :global-config="globalConfig">
      <router-view></router-view>
    </t-config-provider>
    <ZoomTip />
  </template>
</template>

<script setup lang="ts">
import { merge } from "lodash";
import ZoomTip from "@/components/ZoomTip.vue";
import zhConfig from "tdesign-vue-next/es/locale/zh_CN";
import enConfig from "tdesign-vue-next/es/locale/en_US";
import { cachedLocale, languageList } from "@/locales";
import { initTheme } from "@/utils/theme";
import { initIframeTheme } from "@/utils/iframeTheme";
import { type GlobalConfigProvider } from "tdesign-vue-next";
import { useI18n } from "vue-i18n";

const { locale } = useI18n();

const loading = ref(false);

onBeforeMount(() => {
  document.addEventListener("keydown", function (event) {
    if (event.key === "F8") {
      event.preventDefault();
      debugger;
    }
  });
});

async function handleLinkClick(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  const target = event.currentTarget as HTMLAnchorElement | null;
  const url = target?.getAttribute("data-link") || target?.getAttribute("href");
  if (!url) return false;

  window.open(url, "_blank", "noopener,noreferrer");
  return false;
}

onMounted(() => {
  // 初始化主题/端口后解除全局 loading 遮罩
  getPort();
  (window as any).handleLinkClick = handleLinkClick;
});

async function getPort() {
  try {
    const language = navigator.language;
    if (language && languageList.some((item) => item.value === language)) {
      cachedLocale.value = language;
      locale.value = language;
    }
  } catch (e) {
    console.error("获取语言失败", e);
  }
}

const tdesignLocaleMap: Record<string, object> = {
  "zh-CN": zhConfig,
  en: enConfig,
};

const customConfig: GlobalConfigProvider = {
  calendar: {},
  table: {},
  pagination: {},
};
const globalConfig = computed<GlobalConfigProvider>(() => merge({}, tdesignLocaleMap[cachedLocale.value] || zhConfig, customConfig));

onBeforeMount(() => {
  initTheme();
  // 主题决策源：同步到画布 / 3D 等独立应用
  initIframeTheme();
});
</script>

<style lang="scss">
.app-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  background: var(--td-bg-color-page, #f5f5f5);
}
</style>
