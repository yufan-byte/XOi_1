import axios, { type AxiosRequestConfig } from "axios";
import router from "@/router/index";
import { storeToRefs } from "pinia";
import { MessagePlugin, NotifyPlugin, type TNode } from "tdesign-vue-next";
import settingStore from "@/stores/setting";
import { h } from "vue";
const instance = axios.create();

instance.interceptors.request.use(function (config) {
  const { baseUrl, otherSetting } = storeToRefs(settingStore());
  config.baseURL = baseUrl.value;
  config.timeout = otherSetting.value.axiosTimeOut;
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = token;
  }

  return config;
});

instance.interceptors.response.use(
  function (response) {
    // 后台动了真正影响「可选型号与钥匙」的那几类供应商写入动作后,向名为 studio-api 的跨标签通道喊一声,
    // 让每个还打开着的画布标签接住信号即时重拉 /api/config 自我刷新下拉(classic 见 canvas.js / smart 见 smart-canvas.js 都挂着同名接收器);
    // 用白名单而不是按整段 /setting/vendorConfig 子串匹配,是为了把同样走 POST 但其实没改表的 getVendorList / modelTest 排除掉免得误触空转刷新。
    const reqTail =
      (((response as any)?.config?.url || "") as string).split("?")[0].split("/").pop() ||
      "";
    if (
      [
        "updateVendorInputs",
        "addVendor",
        "deleteVendor",
        "addVendorModel",
        "delVendorModel",
        "upVendorModel",
        "enableVendor",
      ].includes(reqTail)
    ) {
      try {
        const chan = new BroadcastChannel("studio-api");
        chan.postMessage({ type: "providers-changed" });
        chan.close(); // 即用即弃防累积,BroadcastChannel 无后续复用需求
      } catch (_) {
        /* 极旧浏览器不支持 BroadcastChannel 时静默降级,等同回退到手刷模式 */
      }
    }
    return response.data;
  },
  function (error) {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      // 带 expired 标记去登录页：登录页落地会弹「登录已过期」提示。
      // 画布强制登出链路也是跳 /#/login?expired=1 —— 这里若不带标记会把那个带标记的跳转覆盖掉（query 丢失）。
      if (router.currentRoute.value.path !== "/login") {
        router.push({ path: "/login", query: { expired: "1", next: `/#${router.currentRoute.value.fullPath}` } });
      }
      MessagePlugin.error(window.$t("common.sessionExpired"));
    }
    if (error.message?.includes("Network Error") || error.response?.data?.message === "Network Error") {
      NotifyPlugin.error({
        title: "Network Error",
        closeBtn: true,
        duration: 3000, // 不自动关闭，让用户有时间看
        className: "customNotifyFull", // 自定义类名
        content: () =>
          h("div", [
            h("div", { style: { marginBottom: "8px" } }, "网络连接失败，请依次尝试："),
            h("div", { style: { marginBottom: "4px" } }, "1. 右键程序图标 → 以管理员身份运行"),
            h("div", { style: { marginBottom: "4px" } }, "2. 检查后端服务是否已正常启动"),
            h("div", [
              "3. 安装 Visual C++ 运行库：",
              h("div", { style: { display: "flex", gap: "8px", marginTop: "4px" } }, [
                h(
                  "a",
                  {
                    href: "https://aka.ms/vs/17/release/vc_redist.x86.exe",
                    target: "_blank",
                    rel: "noopener noreferrer",
                    style: { color: "#0052d9" },
                  },
                  "32位下载",
                ),
                h(
                  "a",
                  {
                    href: "https://aka.ms/vs/17/release/vc_redist.x64.exe",
                    target: "_blank",
                    rel: "noopener noreferrer",
                    style: { color: "#0052d9" },
                  },
                  "64位下载",
                ),
              ]),
            ]),
          ]),
      });
    }

    return Promise.reject(error?.response?.data ?? error);
  },
);

// 后端统一响应结构 { code, message, data }，拦截器已解包 response.data
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface XoiHttp {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>>;
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>>;
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>>;
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>>;
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>>;
}

export default instance as unknown as XoiHttp;
