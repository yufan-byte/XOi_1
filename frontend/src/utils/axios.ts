import axios, { type AxiosRequestConfig } from "axios";
import router from "@/router/index";
import { storeToRefs } from "pinia";
import { MessagePlugin, NotifyPlugin, type TNode } from "tdesign-vue-next";
import settingStore from "@/stores/setting";
import { h } from "vue";
import { authorizeModelCall, modelCallSubmitted } from "./billingGate";
import { billableOperation } from "../../../shared/billableOperations";
import { accountBoundary } from './accountBoundary';
import { clearSession, sessionToken } from './session';
const instance = axios.create();

instance.interceptors.request.use(async function (config) {
  const { baseUrl, otherSetting } = storeToRefs(settingStore());
  config.baseURL = baseUrl.value;
  config.timeout = config.timeout || otherSetting.value.axiosTimeOut;
  const owner = accountBoundary.capture();
  (config as any).accountOwner = owner;
  // F3：凭据只从内存取（登录/迁移那一次放进来的），取不到就不设 header ——
  // 同源请求会自动带上后端下发的 httpOnly 会话 cookie，由后端兜底认证。
  const token = sessionToken();
  if (token) {
    config.headers.Authorization = token;
  }
  const path = String(config.url || "");
  const expectedUser = /^([1-9]\d*):/.exec(owner.token)?.[1];
  if (expectedUser) config.headers.set("X-Xoi-Expected-User", expectedUser);
  if (billableOperation(path, config.method || "GET")) {
    const ticket = await authorizeModelCall(path, config.data, config.signal as AbortSignal | undefined);
    (config as any).billingTicket = ticket;
    if (ticket) config.headers.set("X-Xoi-Billing-Id", ticket.id);
  }
  // A confirmation dialog may have stayed open while the account changed.
  accountBoundary.assert(owner);
  return config;
});

instance.interceptors.response.use(
  function (response) {
    accountBoundary.assert((response.config as any).accountOwner);
    modelCallSubmitted((response.config as any)?.billingTicket);
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
      window.dispatchEvent(new Event("model-catalog-changed"));
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
    if (error.config?.accountOwner) accountBoundary.assert(error.config.accountOwner);
    modelCallSubmitted(error.config?.billingTicket, true);
    const pricingRequest = /\/(?:model-catalog(?:\/quote)?|modelSelect\/getModelList)$/.test(String(error.config?.url || "").split("?")[0]);
    if (error.response?.status === 401) {
      // F3：清本机会话信号 + 内存凭据；cookie 是 httpOnly 的，删不掉也不该删——
      // 真正的失效由后端 session_version 判定，下一次登录会覆盖它。
      clearSession();
      // 带 expired 标记去登录页：登录页落地会弹「登录已过期」提示。
      // 画布强制登出链路也是跳 /#/login?expired=1 —— 这里若不带标记会把那个带标记的跳转覆盖掉（query 丢失）。
      if (router.currentRoute.value.path !== "/login") {
        router.push({ path: "/login", query: { expired: "1", next: `/#${router.currentRoute.value.fullPath}` } });
      }
      MessagePlugin.error(window.$t("common.sessionExpired"));
    }
    if (!pricingRequest && (error.message?.includes("Network Error") || error.response?.data?.message === "Network Error")) {
      NotifyPlugin.error({
        title: "暂时无法连接服务",
        closeBtn: true,
        duration: 6000,
        className: "customNotifyFull", // 自定义类名
        content: () =>
          h("div", [
            h("div", { style: { marginBottom: "8px" } }, "请检查网络连接，稍后重试；如果持续出现，请联系平台管理员。"),
            h("div", "如果刚提交过生成或付款，请先查看任务记录或积分明细，确认结果后再操作，避免重复提交。"),
          ]),
      });
    }

    // Pricing components own their inline feedback/retry and need the HTTP status.
    return Promise.reject(pricingRequest || error.config?.preserveHttpError ? error : error?.response?.data ?? error);
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
