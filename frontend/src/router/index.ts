import { createRouter, createWebHashHistory } from "vue-router";
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 管理后台使用独立顶层布局，不继承工作台的侧栏和右侧内容区
    {
      path: "/adminCenter",
      name: "adminCenterStandalone",
      meta: { role: "admin" },
      component: () => import("@/pages/admin/AdminCenter.vue"),
    },
    {
      path: "/admin/model-billing",
      name: "adminModelBillingStandalone",
      meta: { role: "admin" },
      component: () => import("@/pages/admin/ModelBillingView.vue"),
    },
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
        // {
        //   path: "/detail",
        //   component: () => import("@/views/detail/index.vue"),
        // },
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
          beforeEnter: (to: any) =>
            to.query.mode === "inspiration" ? { path: "/inspiration" } : true,
        },
        {
          path: "/inspiration",
          component: () => import("@/pages/inspiration/index.vue"),
        },
        {
          path: "/inspiration/:idea",
          component: () => import("@/pages/inspiration/index.vue"),
        },
        {
          path: "/skills",
          component: () => import("@/pages/skills/index.vue"),
        },
        {
          path: "/test",
          component: () => import("@/views/test/index.vue"),
        },
        {
          path: "/points",
          meta: { role: "admin" },
          component: () => import("@/pages/points/index.vue"),
        },
        {
          path: "/myPoints",
          component: () => import("@/pages/myPoints/index.vue"),
        },
        {
          path: "/order/:trade",
          meta: { role: ["user", "admin"] },
          component: () => import("@/pages/order/result.vue"),
        },
        {
          path: "/adminCenter",
          meta: { role: "admin" },
          component: () => import("@/pages/admin/AdminCenter.vue"),
        },
        {
          path: "/admin/users",
          name: "adminUsers",
          meta: { role: "admin" },
          component: () => import("@/pages/admin/UsersView.vue"),
        },
        {
          path: "/admin/pricing",
          name: "adminPricing",
          meta: { role: "admin" },
          component: () => import("@/pages/admin/PricingView.vue"),
        },
        {
          path: "/admin/model-billing",
          name: "adminModelBilling",
          meta: { role: "admin" },
          component: () => import("@/pages/admin/ModelBillingView.vue"),
        },
      ],
    },
    {
      path: "/login",
      component: () => import("@/pages/login/index.vue"),
    },
    {
      path: "/register",
      component: () => import("@/pages/register/index.vue"),
    },
  ],
});
router.beforeEach(async (to, from, next) => {
  if (to.path === "/login" || to.path === "/register") {
    next();
    return;
  }
  if (!localStorage.getItem("token")) {
    next("/login");
    return;
  }
  // 角色守卫：仅对显式声明 meta.role 的路由生效（支持 string 或 string[]）
  const requiredRole = (to.meta as any)?.role as string | string[] | undefined;
  if (requiredRole) {
    let currentRole = localStorage.getItem("role") || "";
    if (requiredRole === "admin") {
      try {
        const { default: http } = await import("@/utils/axios");
        const profile = await http.get("/setting/loginConfig/getUser");
        currentRole = profile.data?.role || "user";
        localStorage.setItem("role", currentRole);
      } catch {
        next(localStorage.getItem("token") ? "/project" : "/login");
        return;
      }
    }
    const allowed = Array.isArray(requiredRole)
      ? requiredRole.includes(currentRole)
      : requiredRole === currentRole;
    if (!allowed) {
      window.$message?.warning?.("权限不足");
      next("/project");
      return;
    }
  }
  next();
});
export default router;
