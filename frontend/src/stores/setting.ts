export default defineStore(
  "setting",
  () => {
    const showSetting = ref(false);
    const canvasWheelEvent = ref("zoom");
    const activeMenu = ref("ui");

    // 开发环境直连后端；生产构建后前后端同源部署，走相对路径由 Nginx 反代
    const baseUrl = ref<string>(import.meta.env.DEV ? "http://localhost:10588/api" : "/api");

    const otherSetting = ref({
      axiosTimeOut: 60 * 10 * 1000,
      assetsBatchGenereateSize: 5,
      chapterReg: "/第\\s*([0-9０-９零一二三四五六七八九十百千万]+)\\s*[章回节]\\s*([^\\n\\r]*)/g",
      interacting: true,
      scriptEpisodeLength: 5000,
    });

    const themeSetting = ref<{
      mode: "auto" | "light" | "dark";
      primaryColor: string;
      fontSize: number;
    }>({
      mode: "auto",
      primaryColor: "#0052D9",
      fontSize: 16,
    });

    const language = ref<string>("zh-CN");

    return { showSetting, baseUrl, otherSetting, themeSetting, language, activeMenu, canvasWheelEvent };
  },
  { persist: { pick: ["baseUrl", "otherSetting", "themeSetting", "language"] } },
);
