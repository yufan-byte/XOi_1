import { createRouter, createWebHashHistory } from "vue-router";
import projectStore from "@/stores/project";
import { pageLoaders, navigationPending } from "./pageLoading";
import { createLoginUrl, readLoginReturn } from "../../../shared/loginNavigation";
// 范围收敛（按造物方案）：只保留四个创作模块及其流水线。
// 登录/注册/积分/支付/管理员/供应商全部由造物体系接管：
//   · 登录注册 → /console/login /console/signup（React 控制台）
//   · 余额充值 → console 顶栏充值弹窗（new-api quota）
//   · 管理后台 → new-api 自带后台；Skill/灵感库/测试页下线
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/phone-upload", component: () => import("@/views/phoneUpload/index.vue") },
    {
      path: "/:catchAll(.*)",
      name: "404",
      meta: {
        title: "404",
      },
      component: () => import("@/pages/error/404.vue"),
    },
    {
      path: "/",
      redirect: "/aiAssistant",
    },
    {
      path: "/workbench",
      component: () => import("@/pages/workbench/index.vue"),
      redirect: "/aiAssistant",
      children: [
        {
          path: "/script/one-stop",
          component: () => import("@/views/oneStop/index.vue"),
        },
        {
          path: "/project",
          component: pageLoaders["/project"],
        },
        {
          path: "/task",
          component: pageLoaders["/task"],
        },
        {
          path: "/novel",
          component: pageLoaders["/novel"],
        },
        {
          path: "/script",
          component: pageLoaders["/script"],
        },
        {
          path: "/scriptAgent",
          component: pageLoaders["/scriptAgent"],
        },
        {
          path: "/cornerScape",
          component: pageLoaders["/cornerScape"],
        },
        {
          path: "/production",
          component: pageLoaders["/production"],
        },
        {
          // 剪辑工作台：?mode=standalone 为不绑定项目的独立草稿；
          // ?episode=<剧本id> 为项目内剪辑，并按该分集素材自动装配。
          path: "/editor",
          component: pageLoaders["/editor"],
        },
        {
          path: "/assets",
          component: pageLoaders["/assets"],
        },
        {
          // 场景库页（无 ?scene=）留在 workbench 布局里，保留左侧导航；
          // 点进具体场景后由页面自己的 .director3d-container 铺满视口盖住布局（见 index.vue 的 CSS）。
          path: "/director3d",
          component: pageLoaders["/director3d"],
        },
        {
          path: "/canvas",
          component: pageLoaders["/canvas"],
        },
        {
          path: "/aiAssistant",
          component: pageLoaders["/aiAssistant"],
        },
        {
          path: "/square",
          component: pageLoaders["/square"],
        },
        {
          path: "/viral-replicate",
          component: pageLoaders["/viral-replicate"],
        },
        {
          path: "/skills",
          component: pageLoaders["/skills"],
        },
      ],
    },
    // 登录 / 注册已整体迁到 React 控制台（frontend/console，构建产物挂 /console/）。
    // 这里只做整页跳转：控制台是独立的 React 应用，必须让浏览器真正加载 /console/index.html，
    // 用 Vue 内部路由是过不去的（宿主用的是 hash 模式，/console/* 走的是浏览器 history）。
    // 查询串原样带过去，?ref= 邀请码 与 ?next= 登录后落点 都不会丢。
    {
      path: "/login",
      beforeEnter: (to) => {
        const url = new URL(createLoginUrl(typeof to.query.next === "string" ? to.query.next : readLoginReturn(), { expired: to.query.expired === "1" }), window.location.origin);
        for (const key of ["ref", "aff", "stay"]) if (typeof to.query[key] === "string") url.searchParams.set(key, to.query[key] as string);
        window.location.replace(url.pathname + url.search);
        return false;
      },
      component: () => Promise.resolve({ render: () => null }),
    },
    {
      path: "/register",
      beforeEnter: (to) => {
        window.location.replace(`/console/signup${to.fullPath.includes("?") ? to.fullPath.slice(to.fullPath.indexOf("?")) : ""}`);
        return false;
      },
      component: () => Promise.resolve({ render: () => null }),
    },
  ],
});
router.beforeEach(async (to, from, next) => {
  navigationPending.value = to.fullPath !== from.fullPath;
  if (to.path === "/login" || to.path === "/register") {
    next();
    return;
  }
  if (!localStorage.getItem("token")) {
    window.location.replace(createLoginUrl(`/#${to.fullPath}`));
    next(false);
    return;
  }
  const needsProject = ["/novel", "/scriptAgent", "/script", "/cornerScape", "/production"].includes(to.path)
    || (to.path === "/editor" && to.query.mode !== "standalone");
  if (needsProject) {
    const store = projectStore();
    const requestedId = typeof to.query.projectId === "string" ? to.query.projectId : "";
    if (!requestedId) {
      if (!store.project?.id) {
        next("/project");
        return;
      }
      next({ path: to.path, query: { ...to.query, projectId: String(store.project.id) }, replace: true });
      return;
    }
    if (String(store.project?.id || "") !== requestedId) {
      try {
        // 深链接、刷新或切换项目时，以服务端按当前用户过滤的项目列表恢复上下文。
        const { default: axios } = await import("@/utils/axios");
        const response = await axios.post("/project/getProject");
        const selected = response.data.find((item: { id: string | number }) => String(item.id) === requestedId);
        if (!selected) {
          next("/project");
          return;
        }
        store.project = selected;
      } catch {
        next("/project");
        return;
      }
    }
    // 项目必须配置完整（关键项：文本模型）才允许进入创作流水线，否则回项目列表补配置
    if (!String((store.project as { textModel?: string } | null)?.textModel || "").trim()) {
      const warn = window.$t?.("workbench.project.msg.completeConfigBeforeOpen") || "这个项目还没配完文本模型，请先在项目设置里补全再进入运作";
      window.$message?.warning(warn);
      next("/project");
      return;
    }
  }
  next();
});
router.afterEach(() => { navigationPending.value = false; });
router.onError(() => { navigationPending.value = false; });
export default router;
