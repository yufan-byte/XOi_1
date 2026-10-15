import { createRouter, createWebHashHistory } from "vue-router";
// 范围收敛（按造物方案）：只保留四个创作模块及其流水线。
// 登录/注册/积分/支付/管理员/供应商全部由造物体系接管：
//   · 登录注册 → /console/login /console/signup（React 控制台）
//   · 余额充值 → console 顶栏充值弹窗（new-api quota）
//   · 管理后台 → new-api 自带后台；Skill/灵感库/测试页下线
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
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
      redirect: "/project",
    },
    {
      path: "/workbench",
      component: () => import("@/pages/workbench/index.vue"),
      redirect: "/project",
      children: [
        {
          path: "/project",
          component: () => import("@/views/project/index.vue"),
        },
        {
          path: "/task",
          component: () => import("@/views/task/index.vue"),
        },
        {
          path: "/novel",
          component: () => import("@/views/novel/index.vue"),
        },
        {
          path: "/script",
          component: () => import("@/views/script/index.vue"),
        },
        {
          path: "/scriptAgent",
          component: () => import("@/views/scriptAgent/index.vue"),
        },
        {
          path: "/cornerScape",
          component: () => import("@/views/cornerScape/index.vue"),
        },
        {
          path: "/production",
          component: () => import("@/views/production/index.vue"),
        },
        {
          // 剪辑成片：独立工作台，从分镜/成片节点一步直达（不再走「弹窗第 3 个 Tab」四步套娃）。
          // ?episode=<剧本id> 指定分集；缺省时取该项目的第一集。
          path: "/editor",
          component: () => import("@/views/editor/index.vue"),
        },
        {
          path: "/assets",
          component: () => import("@/views/assets/index.vue"),
        },
        {
          path: "/director3d",
          component: () => import("@/views/director3d/index.vue"),
        },
        {
          path: "/canvas",
          component: () => import("@/views/canvas/index.vue"),
        },
        {
          path: "/aiAssistant",
          component: () => import("@/views/aiAssistant/index.vue"),
        },
        {
          path: "/square",
          component: () => import("@/views/square/index.vue"),
        },
        {
          path: "/viral-replicate",
          component: () => import("@/views/viralReplicate/index.vue"),
        },
        {
          path: "/skills",
          component: () => import("@/views/skills/index.vue"),
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
        window.location.replace(`/console/login${to.fullPath.includes("?") ? to.fullPath.slice(to.fullPath.indexOf("?")) : ""}`);
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
  if (to.path === "/login" || to.path === "/register") {
    next();
    return;
  }
  if (!localStorage.getItem("token")) {
    next({ path: "/login", query: { next: `/#${to.fullPath}` } });
    return;
  }
  next();
});
export default router;
