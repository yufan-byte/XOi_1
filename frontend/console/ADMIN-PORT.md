# 造物后台搬运清单（方案 A 剩余部分）

> 依据：2026-10-02 对造物 `zaowu-engine-main` 与 XOi_1 的逐文件勘察。
> 用户裁定：**造物的后台全套搬过来，XOi 只保留 4 个功能模块，其余后台 UI 全推翻。**

## 一、XOi 只保留的 4 个模块（已精确定位）

来源依据：`frontend/src/pages/login/index.vue` 第 329–334 行的 `landingEntries`，
与 `frontend/src/layouts/WorkbenchLayout.vue` 的 `baseMenu` / `rightBtnList` 一一对应。

| # | 模块 | 入口路由 | 涉及页面 |
|---|---|---|---|
| 1 | **一站式漫剧** | `/project` | `/novel` → `/scriptAgent` → `/script` → `/cornerScape` → `/production` → `/assets`（`rightBtnList` 就是这条流水线）+ `/task` |
| 2 | **对话创作** | `/aiAssistant` | 含 `/inspiration/:idea` 深链 |
| 3 | **导演台** | `/director3d` | 独立 iframe（`utils/iframeTheme.ts` 的 postMessage 主题同步） |
| 4 | **无限画布** | `/canvas` | Atelier 薄壳（vanilla studio，`window.StudioTheme`）@ |

**随之要砍掉**（用户：「什么后台管理 什么玩意的都按照造物的来」）：

- 平台管理组：`/adminCenter`、`/admin/users`、`/admin/pricing`、`/admin/model-billing`
- 积分/交易：`/points`、`/myPoints`、`/order/:trade`
- 其它：`/skills`、`/test`、`/inspiration`（作为独立页时）
- 对应目录：`pages/admin/`、`pages/points/`、`pages/myPoints/`、`pages/order/`、`pages/skills/`

> ⚠️ **删之前必须确认**（`/order` 与支付回调、`stores/user.ts` 的 `points` 字段是否被 4 个模块反向引用）。
> 这一步是破坏性的，先出确认清单再动手。

## 二、造物后台的搬运量（实测）

| 层 | 文件数 | 行数 | 说明 |
|---|---|---|---|
| `src/components/reseller/**` | 27 | 3,883 | **真正要搬的 UI**，已完整实现 |
| `src/app/reseller/**/page.tsx` | 41 | 394 | **全是 3–37 行薄壳**，在 React Router 里坍缩成一张路由表 |
| `src/app/api/reseller/**` | 12 | 614 | 后端，移植成 Express 路由 |
| `src/lib/team-store.ts` | 1 | 371 | 团队结算（团队模式用） |
| **合计** | **81** | **≈ 5.3k** | |

### 41 个薄壳怎么处理

造物每个 page.tsx 只是 `export default function Page() { return <XxxView /> }`。
由于我们已经把 `ResellerShell` + 各 View 作为组件搬进来，
**不需要 41 个文件**，只需要一张「路由 path → 组件」的映射表（放 `main.tsx` 或单独 `routes.tsx`）。

`[section]/page.tsx` 不是主渲染器，是「成为代理商」引导页 / 未授权兜底，单独搬。

## 三、支撑层清单（搬运前必须先补）

console 现状：已有 `cn` / `useApp`(+`setUser`) / `BrandMark` / `SITE` /
`react-router-dom` / `lucide-react` / `sonner` / `@tanstack/react-query` / `next/*` shim。

**缺的（11 个文件 + 2 个依赖）：**

| 要补的东西 | 上游来源 | 行数 | 备注 |
|---|---|---|---|
| `components/shell/viewport-fit-zoom.tsx` | 造物同名 | 21 | 只依赖 react，**逐字拷** |
| `components/ui/select.tsx` | 造物同名 | 30 | 依赖 `@radix-ui/react-select`（已装） |
| `lib/reseller/types.ts` | 造物同名 | 38 | **零 import**，逐字拷（`store.ts` 与它共用类型） |
| `lib/store-local.ts` | 造物同名 | 23 | 依赖 `loadAuth` |
| `lib/skills-client.ts` | 造物同名 | 73 | 依赖 `api()` |
| `components/shell/topbar.tsx` | 造物同名 | 164 | ⚠️ 见下「决策 2」 |
| `components/shell/brand-provider.tsx` | 造物同名 | 80 | 依赖 `@/lib/models`（见下「决策 1」） |
| `lib/reseller/client.ts` | 造物同名 | 28 | `useResellerScope` / `useIsReseller` |
| `lib/queries.ts` | 造物同名 | 24 | 依赖 `@/lib/models` + `api`/`getPricing`/`getSelf` |
| `data/reseller_announcements.json` | 造物同名 | 7.2 KB | 直接拷 |
| `lib/api.ts` **扩展** | 造物同名 | +约 60 | 补 `api()` / `loadAuth` / `saveAuth` / `refreshAuth` / `getSelf` |
| 依赖 `@radix-ui/react-switch` | — | — | 已装 |
| 依赖 `@radix-ui/react-select` | — | — | 已装 |

**不要拷的服务端文件**（它们依赖 `next/server` 与 `node:fs`，属于 Express 侧）：

- `lib/reseller/scope.ts`（`resolveScope()` 权限模型）
- `lib/reseller/auth.ts`（`currentUser()`）
- `lib/reseller/store.ts`（**reseller.json 的存储层**，含 `DEFAULT_DATA`）

## 四、两个必须拍板的决策

### 决策 1：模型管理页的模型目录从哪来（**别照搬**）

`src/components/reseller/models/models-center.tsx` 依赖 `@/lib/models`，
而 `lib/models.ts`（529 行）拖出整套目录数据：

```
logical-models.json   20,978 行   ← 造物自己 new-api 的模型快照
extra-models.json      4,939 行
manual-models.json       376 行
channel-notes.json        24 行   ← 造物的渠道改名/备注
model-series.json
aicost-caps.ts           175 行   ← aicost 线路专用
model-series.ts           35 行
models.ts                529 行
                     ─────────
                     ≈ 26,600 行
```

**照搬的后果**：XOi 的「模型管理」会显示**造物的模型与渠道名**，而不是 XOi 自己网关里的。
且 `aicost-caps` / `channel-notes` 是造物上游线路专属知识，对 XOi 无意义。

**建议**：XOi 自建轻量目录 —— 复用已有的 `backend/data/vendor/newapi.ts` 的
`fetchModels()`（拉 `/v1/models`）+ new-api 的 pricing，只实现
`buildCatalog` / `applyPriceFactor` / `setHiddenModels` / `CatalogModel` 这四个
reseller 真正用到的接口，其余不搬。

### 决策 2：TopBar 要不要造物原版

`ResellerShell` 用了造物的 `<TopBar />`（164 行），但造物的 TopBar 里有指向
`/chat`、`/dashboard`、`/logs` 等**造物自己的页面**的链接，以及造物的通知/用户菜单。

**建议**：写一个精简版 TopBar（只保留返回 + 用户信息 + 登出），避免把造物的站点导航带进 XOi。

## 五、顺带修掉的一个构建阻塞（已修）

### `src/router.ts` 是**生成文件**，而 prod 打包路径永远不会生成它

- `src/core.ts` 的 `generateRouter()` 扫 `src/routes/**/*.ts` 生成 `src/router.ts`
  （带 `// @routes-hash <md5>` 头，内容含 `app.use("/api" + routePath, route)`）。
- 文件映射规则（`fileNameToRoutePath`）：`routes/login/self.ts` → `/api/login/self`；
  `[id]` → `:id`，`[...x]` → `*`，`index.ts` → `/`。
- 因为它是生成物，`backend/.gitignore` 里**显式忽略了 `router.ts`**，所以不进仓库。
- 而 `app.ts` 只在 `if (process.env.NODE_ENV == "dev") await buildRoute();` 时才生成它。

于是干净 clone 上 `yarn build`（**Dockerfile 第 49 行**就是这么干的）必然失败：

```
✘ [ERROR] Could not resolve "./src/router" (originally "@/router")
```

本地/原仓库之所以没事，只是因为 `src/router.ts` 是上次 `npm run dev` 留下的残留文件
（Jing_luo 里有一份 22,603 字节的）。

**已修**：`backend/scripts/build.ts` 在 `esbuild.build()` 之前显式调用 `generateRouter()`。
该问题是**上游自带**的，修复对 Jing_luo 同样有效。

**额外好处**：新增路由（如 `src/routes/reseller/*.ts`）**不需要手改 `router.ts`**，
每次打包/启动 dev 都会自动重新扫描挂载。

## 六、执行顺序（建议）

1. ✅ 支撑层（第三节的 11 个文件 + `lib/api.ts` 扩展）—— 解依赖，先做
2. 决策 1 / 2 拍板
3. 搬 `components/reseller/**` 27 个文件（`next/link` → `react-router-dom`，`href` → `to`）
4. 建 `/console/admin/*` 路由表（41 薄壳 → 1 张表）
5. 后端 `backend/src/routes/reseller/*.ts`（12 个，自动进路由表）
6. 清理 XOi 旧后台 UI（**破坏性，先出确认清单**）
7. 业务库迁 PG
