import axios from "@/utils/axios";
import {accountBoundary} from '@/utils/accountBoundary';
import {prepareMediaSession} from '../../shared/mediaSession';
import {clearSession, sessionSignal, setSessionToken, writeSessionSignal} from '@/utils/session';

export default defineStore(
  "user",
  () => {
    /**
     * F3：这里的 token 已**不是凭据原文**，而是非敏感会话信号（uid:nonce）。
     * 凭据本身只在两处：后端 httpOnly cookie + 内存（见 utils/session.ts）。
     * 保留这个 ref 是为了不动下游一堆「账号是否切换」的 watch / 比对逻辑。
     */
    const token = ref(sessionSignal());
    const role = ref(localStorage.getItem("role") || "user");
    const userId = ref(localStorage.getItem("userId") || "");
    const displayId = ref(localStorage.getItem("displayId") || "");
    const username = ref(localStorage.getItem("username") || "");

    /* 余额真源：new-api quota（经 /api/login/self 折算成人民币）。
       产品层再按 1 元 = 10 积分展示；这里不另建积分账本，避免双扣与对账漂移。 */
    const balance = ref<number>(0);

    const isAdmin = computed(() => role.value === "admin");

    function setUser(data: { token: string; role: string; id: string; display_id?: string; name: string }) {
      // 凭据原文只进内存（供 socket 握手 / 老代码拼 header），持久化交给后端 httpOnly cookie。
      setSessionToken(data.token);
      token.value = writeSessionSignal(data.id);
      role.value = data.role;
      userId.value = data.id;
      displayId.value = data.display_id || "";
      username.value = data.name;
      localStorage.setItem("role", data.role);
      localStorage.setItem("userId", data.id);
      localStorage.setItem("displayId", displayId.value);
      localStorage.setItem("username", data.name);
      accountBoundary.capture();
      void prepareMediaSession().catch(()=>{});
      // 切换账号立刻抹除旧余额离散态，随后由所在页 onMounted 调 refreshProfile 重拉
      balance.value = 0;
    }

    function clearUser() {
      token.value = "";
      role.value = "user";
      userId.value = "";
      displayId.value = "";
      username.value = "";
      // 会话信号 + 残留的老凭据 + 内存凭据一起清；cookie 由后端 /login/logout 清。
      clearSession();
      localStorage.removeItem("role");
      localStorage.removeItem("userId");
      localStorage.removeItem("displayId");
      localStorage.removeItem("username");
      accountBoundary.capture();
      void prepareMediaSession().catch(()=>{});
      balance.value = 0;
    }

    /**
     * 拉取镜像资料 + 实时余额（new-api quota 折算元）并写入 store。
     * 支付到账、生成扣费之后均可主动调用以即时刷新所有依赖角标。
     */
    let profileRequest: Promise<any> | undefined;
    let profileToken = "";
    async function refreshProfile<T = any>(): Promise<T | undefined> {
      if (!token.value) return;
      const requestedToken = token.value;
      try {
        if (!profileRequest || profileToken !== requestedToken) {
          profileToken = requestedToken;
          const request = axios.get("/login/self", {
          params: { _t: Date.now() },
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
          });
          const tracked = request.finally(() => { if (profileRequest === tracked) profileRequest = undefined; });
          profileRequest = tracked;
        }
        const res: any = await profileRequest;
        if (token.value !== requestedToken) return;
        const data: any = res?.data;
        if (!data) return;
        if (data.display_id) {
          displayId.value = String(data.display_id);
          localStorage.setItem("displayId", displayId.value);
        }
        if (data.name) {
          username.value = String(data.name);
        }
        if (data.balance !== null && data.balance !== undefined) balance.value = Number(data.balance) || 0;
        return data as unknown as T;
      } catch (e) {
        console.error("[user/store] refreshProfile 失败:", e);
      }
    }

    return {
      token,
      role,
      userId,
      displayId,
      username,
      isAdmin,
      balance,
      setUser,
      clearUser,
      refreshProfile,
    };
  },
);
