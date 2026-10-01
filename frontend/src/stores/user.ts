import axios from "@/utils/axios";

export default defineStore(
  "user",
  () => {
    const token = ref(localStorage.getItem("token") || "");
    const role = ref(localStorage.getItem("role") || "user");
    const userId = ref(localStorage.getItem("userId") || "");
    const displayId = ref(localStorage.getItem("displayId") || "");
    const username = ref(localStorage.getItem("username") || "");

    /* 跨视图共享：积分余额 + 会员等级与有效期；统一由 refreshProfile() 自后端 balance 同步，
       令侧栏角标 / 个人中心徽章 / 充值弹窗在任何路由下都能反映付费后的实时变化（F5 由 persist 保活）。 */
    const userPoints = ref<number>(0);
    const memberLevel = ref<string>("free");
    const memberExpireAt = ref<string>("");

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
      // 切换账号立刻抹除可能残留的旧会员/积分离散态，随后由所在页 onMounted 调 refreshProfile 重拉
      userPoints.value = 0;
      memberLevel.value = "free";
      memberExpireAt.value = "";
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
      userPoints.value = 0;
      memberLevel.value = "free";
      memberExpireAt.value = "";
    }

    /**
     * 拉取最新积分余额 + 会员等级 + 有效期并写入 store；
     * 支付到账、签到送分、后台手工调配之后均可主动调用以即时刷新所有依赖角标。
     * 返回原始 balance 数据，便于调用方额外消费 breakdown 明细等扩展字段。
     */
    async function refreshProfile<T = any>(): Promise<T | undefined> {
      if (!token.value) return;
      try {
        const res: any = await axios.get("/setting/pointsConfig/balance", {
          params: { _t: Date.now() },
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });
        const data: any = res?.data;
        if (!data) return;
        if (data.display_id) {
          displayId.value = String(data.display_id);
          localStorage.setItem("displayId", displayId.value);
        }
        userPoints.value = Number(data.points) || 0;
        memberLevel.value = String(data.member_level || "free");
        memberExpireAt.value = String(data.vip_expire_at || "");
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
      userPoints,
      memberLevel,
      memberExpireAt,
      setUser,
      clearUser,
      refreshProfile,
    };
  },
  { persist: true },
);
