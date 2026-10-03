import axios from "@/utils/axios";

export default defineStore(
  "user",
  () => {
    const token = ref(localStorage.getItem("token") || "");
    const role = ref(localStorage.getItem("role") || "user");
    const userId = ref(localStorage.getItem("userId") || "");
    const displayId = ref(localStorage.getItem("displayId") || "");
    const username = ref(localStorage.getItem("username") || "");

    /* 余额：统一来自 new-api quota（经 /api/login/self 折算成元）。
       旧的 XOi 本地积分体系已删除，这里只保留单一余额源，供侧栏角标与个人中心展示。 */
    const balance = ref<number>(0);

    const isAdmin = computed(() => role.value === "admin");

    function setUser(data: { token: string; role: string; id: string; display_id?: string; name: string }) {
      token.value = data.token;
      role.value = data.role;
      userId.value = data.id;
      displayId.value = data.display_id || "";
      username.value = data.name;
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("userId", data.id);
      localStorage.setItem("displayId", displayId.value);
      localStorage.setItem("username", data.name);
      // 切换账号立刻抹除旧余额离散态，随后由所在页 onMounted 调 refreshProfile 重拉
      balance.value = 0;
    }

    function clearUser() {
      token.value = "";
      role.value = "user";
      userId.value = "";
      displayId.value = "";
      username.value = "";
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("userId");
      localStorage.removeItem("displayId");
      localStorage.removeItem("username");
      balance.value = 0;
    }

    /**
     * 拉取镜像资料 + 实时余额（new-api quota 折算元）并写入 store。
     * 支付到账、生成扣费之后均可主动调用以即时刷新所有依赖角标。
     */
    async function refreshProfile<T = any>(): Promise<T | undefined> {
      if (!token.value) return;
      try {
        const res: any = await axios.get("/login/self", {
          params: { _t: Date.now() },
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });
        const data: any = res?.data;
        if (!data) return;
        if (data.display_id) {
          displayId.value = String(data.display_id);
          localStorage.setItem("displayId", displayId.value);
        }
        if (data.name) {
          username.value = String(data.name);
        }
        balance.value = Number(data.balance) || 0;
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
  { persist: true },
);
