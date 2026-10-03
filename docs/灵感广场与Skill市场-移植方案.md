# 灵感广场 + Skill 市场 —— 移植方案

> 目标：把造物引擎（`~/Downloads/zaowu-engine-main`）的「灵感广场」与「Skill 市场」搬到 XOi 主站。
> 已定三件事：**前台落 Vue 主站** / **内置素材全搬** / **照造物搬一套 `/api/media`**。

---

## 0. 一页结论

| 项 | 结论 |
|---|---|
| 前台落点 | `frontend/src/views/square`（灵感广场）、`frontend/src/views/skills`（Skill 市场），挂进 `/workbench` 子路由 |
| 后端 | 复用已移植的 `backend/src/lib/market/{work-store,skill-store}.ts`（366 行，逐字移植已存在），**只补路由层** |
| 素材 | 228 条内置 Skill（目录 + 正文 + 39M 封面）+ 广场 4 个静态快照（2.2M）+ 外链媒体映射（345K）全搬 |
| 媒体 | 新增 `/api/media` 通道，外链封面本地化缓存 |
| 审核 | **零工作量** —— 控制台 `/reseller/moderation` 已有 `SkillReview` + `WorkReview`，菜单项也已在 |
| 最先要做的 | **修一个现成的致命 bug**：`/api/skills/review`、`/api/works/review` 目前是 404（见 §2） |
| 粗估 | 后端 3~4 人日 / 素材迁移 1 人日 / 主站两个页面 8~11 人日 / 联调验收 2 人日 |

---

## 1. 造物那边这两个东西到底是什么

| 名称 | 路由 | 数据性质 |
|---|---|---|
| **灵感广场** | `/square`（侧栏 label 就是「灵感广场」） | **静态快照（mock）+ 站内用户发布（真 PG）** 混合 |
| **Skill 市场** | `/skills`、`/skills/new` | **内置 JSON 228 条（只读）+ 服务端自建/收藏（真 PG）** 混合 |

⚠️ 造物另有一个 `/inspiration` 页标题也叫「灵感广场」，但那是 12 条写死的提示词模板页、无后端、侧栏也不指向它 —— **不要搬错**。

### 1.1 灵感广场文件清单

| 造物路径 | 行数 | 职责 |
|---|---|---|
| `src/app/square/page.tsx` | 8 | 路由入口 |
| `src/components/square/square-gallery.tsx` | 134 | 主组件：三页签(画布/图片/视频)、分类胶囊、最热/最新、无限滚动、我发布的 |
| `src/components/square/data.ts` | 124 | 数据层：静态快照加载、`ServerWork→SqWork`、点赞/计数、Node→Flow 转换 |
| `src/components/square/gallery-card.tsx` | 84 | 瀑布流卡片 |
| `src/components/square/masonry.tsx` | 25 | 瀑布流布局 |
| `src/components/square/media-detail.tsx` | 77 | 图片/视频详情（复刻 = sessionStorage 传参跳 /image、/video） |
| `src/components/square/canvas-detail.tsx` | 117 | 画布详情（ReactFlow 只读预览 + 免费复刻同款） |
| `src/components/square/detail-shell.tsx` | 39 | 详情外壳 + LikeButton |
| `src/components/square/publish-dialog.tsx` | 56 | 发布弹窗（24 个分类） |
| `src/components/square/pill-strip.tsx` | 44 | 分类胶囊条 |
| `src/components/square/glitch-text.tsx` + `.module.css` | 7 + 12 | 故障字标题 |
| `src/lib/works-store.ts` | 141 | 服务端存储（**已移植**） |
| `src/app/api/works/**` | 85 | 4 个接口（route / [id] / review） |

### 1.2 Skill 市场文件清单

| 造物路径 | 行数 | 职责 |
|---|---|---|
| `src/app/skills/page.tsx` | 350 | 市场页：市场/我的创建/我的保存三 Tab、搜索、筛选、卡片网格、详情、导入 |
| `src/components/skills/skill-editor.tsx` | 291 | 编辑器（新建/编辑） |
| `src/lib/skill-store.ts` | 203 | 服务端存储（**已移植**） |
| `src/lib/skills-client.ts` | 73 | 前端数据层（**console 侧已移植**） |
| `src/lib/user-skills.ts` | 40 | 旧版本机 Skill（localStorage） |
| `src/data/skills_marketplace_all.json` | 208 KB / 228 条 | 内置目录（**不含正文**） |
| `src/data/skills_categories.json` | 4 KB / 16 条 | 分类 |
| `public/skills/bodies/<id>.md` | 1.8 MB / 228 个 | 内置正文，详情页才拉 |
| `public/skills/covers/<id>.webp` | 39 MB / 228 个 | 内置封面 |

---

## 2. ⚠️ 先修：一个现成的致命问题

`backend/src/routes/skills/review.ts`(41) 与 `routes/works/review.ts`(41) **已经写好了，但现在访问是 404**：

- `backend/src/core.ts` 的 `ROUTE_WHITELIST`（第 34–68 行）**没有 `skills`、也没有 `works`** → 自动挂载根本不会生成这两条；
- `backend/src/app.ts` 也没有像 reseller/agent/pricing 那样显式前置挂载；
- 实测生成的 `backend/src/router.ts`（141 条挂载）里逐条核对确实没有。

后果：控制台「内容审核」页（菜单项已在 `reseller-menu.ts`）点进去直接报错。项目记忆 `MEMORY.md` 第 107/122 行仍写着「已挂载」，与代码不符。

**修法（P0，10 分钟）**：往 `core.ts` 的 `ROUTE_WHITELIST` 补 `"skills"`、`"works"`、`"media"`，然后重新生成：

```bash
cd backend && ./node_modules/.bin/tsx -e "import('./src/core.ts').then(m=>((m.default as any).default??m.default)())"
```

> 为什么不前置挂到 `app.ts`：这三条走的是 **XOi 自签 JWT**（主站 `localStorage.token`），和 `user/self` 同类，交给 `core.ts` 自动挂天然吃到全局鉴权与维护模式保护。前置挂那条路是给「new-api 自带鉴权」的（reseller/agent/pricing）。
>
> 注意 `:read-only` 是按**处理函数文件名**判定的（`RE_READ_HANDLER = /^(get|list|query|read|scan|fetch)/i`），不是 HTTP 方法 —— 本项目读接口常写成 `router.post("/")`。新建路由文件时按这个命名。

---

## 3. 已经有的家底（不用重写）

| 层 | 内容 | 路径 |
|---|---|---|
| 业务逻辑 | Skill 全量 CRUD / 收藏 / 分享码导入 / 审核；Work 发布 / feed / 点赞 / 计数 / 审核 | `backend/src/lib/market/skill-store.ts`(215)、`work-store.ts`(151) |
| 数据表 | `mc_skills`、`mc_skill_saves`、`mc_works`、`mc_work_likes`（模块内 `ensure*Tables()` 自建，刻意不进 `initDB`） | 同上 |
| 审核路由 | GET role≥10 / POST role≥100 | `routes/skills/review.ts`、`routes/works/review.ts` |
| 审核 UI | `SkillReview` + `WorkReview` | `frontend/console/src/components/reseller/moderation/skill-review.tsx`(115) |
| 控制台菜单 | 「内容审核 → /reseller/moderation」（`NEW_MENU` 第 54 行） | `frontend/console/src/components/reseller-menu.ts` |
| 前端数据层 | `listSkills / getSkillApi / putSkill / removeSkill / toggleSaved / importSkill` | `frontend/console/src/lib/skills-client.ts`(73) |
| 依赖（Vue 端） | `@vue-flow/core`（画布预览）、`md-editor-v3`（Markdown 渲染）、`tdesign-vue-next`、`axios`、`pinia` | `frontend/package.json` |

**缺口（要新写的）**：
1. 业务路由：`routes/skills/*`、`routes/works/*`（只有 review）
2. 媒体通道：`routes/media/*`（后端完全没有）
3. 主站两个页面 + 侧栏入口
4. 素材搬迁与导入脚本

---

## 4. 跨栈差异与对策（移植的真正难点）

| # | 造物的做法 | XOi 的对应 | 对策 |
|---|---|---|---|
| 1 | Next.js App Router API | Express + `core.ts` 扫目录生成 | 按「处理函数文件名」命名规则新建路由文件，白名单放行 |
| 2 | 鉴权 = new-api JWT 透传给网关 | XOi 自签 JWT（`o_setting.tokenKey`），全局中间件写 `req.user` | 普通用户取 `req.user.id`；要 role 的用 `lib/reseller/auth.currentUser(req)`（内部走管理员令牌反查，与「站点级单一令牌」铁律一致） |
| 3 | ⚠️ **用户 id 口径**：造物 `mc_*.user_id` 是 new-api 的 int id | XOi 的 `o_user.id` 是 UUID | **一律用 `currentUser(req).id`（new-api int）**，绝不能拿 `o_user.id` 去 JOIN `users`，否则作者名全空 |
| 4 | 静态资源放 `public/` | `backend/data/*` + `app.ts` 静态挂载 | 见 §5，**不能占用 `/skills`** |
| 5 | 画布预览用 `@xyflow/react` | 主站是 Vue，但**已依赖 `@vue-flow/core`** | 用 `@vue-flow/core` 重写只读预览（约 120 行） |
| 6 | 复刻同款 = 写 zustand `collection("canvas")` | XOi 画布是 **React atelier 跑在同源 iframe**（`/atelier-canvas/`），Vue 只做外壳 | 复用**已有的跨端 handoff**：`frontend/atelier/src/xoi/bridge.ts` 的 `runXoiImportEntry()` / `parseXoiImportFromLocation()`；外壳 `views/canvas/index.vue` 的 `buildIframeSrc()` 已支持 `?import=&source=xoi&from=` 透传进 iframe，**Vue 侧零改动**，只需在 atelier 加一个 `from=square` 分支 |
| 7 | ⚠️ 图片/视频作品的「复刻」跳到 `/image`、`/video` | **XOi 主站范围收敛后没有 image/video 生成页** | 这两个页签的复刻按钮降级为「复制提示词 / 下载封面」，或直接隐藏复刻只保留浏览+点赞。**不要照搬一个点了没反应的按钮** |
| 8 | Skill 注入 = `marketSkillsPrompt()` 拼 system prompt | XOi 主站 `aiAssistant` 已有 Skill 选择器（`skillOptions` 分 `general`/`mine`） | 见 §8.2，安装 = 落盘 + 写 localStorage，直接喂给现有选择器 |
| 9 | 造物「本机发布」写 `localStorage["mc.canvas.share.*"]` | XOi 的画布项目在 atelier（后端存储） | 广场的「我发布的」改为**只读服务端** `GET /api/works?scope=mine`，不搬本机快照那套 |
| 10 | 审核页在 `/reseller/moderation` | 同 | ✅ 已完成，直接用 |

---

## 5. 素材搬迁落点（决定要不要写新代码）

**关键发现**：`app.ts:175` 的 `express.static(webDir)` 是把 **`backend/data/web` 当根**挂的。所以放进 `backend/data/web/square-data/` 的文件，访问路径就是 `/square-data/xxx.json` —— 与造物前端的 `DATA_BASE = "/square-data"` **完全一致，前端零改动**。

| 造物源 | XOi 落点 | 访问 URL | 前端改动 |
|---|---|---|---|
| `public/square-data/{canvas,image,video,canvas-previews}.json`（2.2 M） | `backend/data/web/square-data/` | `/square-data/*.json` | **无** |
| `public/skills/covers/*.webp`（39 M / 228） | `backend/data/skills/covers/` | `/skills/covers/<id>.webp` | 仅目录名 |
| `public/skills/bodies/*.md`（1.8 M / 228） | `backend/data/web/skill-market/bodies/` | `/skill-market/bodies/<id>.md` | 改 `useSkillBody` 的 URL |
| `src/data/skills_marketplace_all.json`、`skills_categories.json` | `backend/data/web/skill-market/` | `/skill-market/catalog.json`、`/categories.json` | 改 fetch |
| `src/data/external-media-map.json`（345 K） | `backend/src/lib/market/external-media-map.json` | 不对外 | 后端读取 |
| 造物 catalog 里的 `cover_url` | —— | —— | **导入脚本要重写成 `/skills/covers/<id>.webp`** |

**两条硬约束**：
1. ❌ **正文 `.md` 不能放 `/skills` 目录**：`app.ts:153` 的 `/skills` 挂载有一道过滤器，只放行 `jpe?g|png|gif|webp|svg|ico|bmp`，`.md` 一律 **403**。封面（webp）可以走 `/skills`，正文必须走 `/skill-market`（webDir 静态，无过滤）。
2. ❌ `backend/data/skills` 已经被 **XOi 自己的智能体提示词资产**占着（29 M：`art_skills/`、`community/`、`production_*.md`、`script_*.md`、`story_skills/`），那是 `getSkillList` 扫的目录，**别混进去**。

---

## 6. `/api/media` 通道设计

造物有 327 行的 `media-store.ts`（成品副本、绘图日志、附件上传、Range、过期清理）。**不建议整包搬**，因为 XOi 已有 `/oss` 静态通道 + 缩略图能力 + 上传链路。分层建议：

| 端点 | 优先级 | 说明 |
|---|---|---|
| `GET /api/media/x/:id` | **P1 必做** | 外链本地化：查 `external-media-map.json` → 取回上游 → 落盘 `backend/data/media/x/` → 流式返回。**广场那 2.2 M 静态作品的封面全指向这里，不做就是一片灰** |
| `POST /api/media/u` + `GET /api/media/u/:id` | P1 | 用户上传封面。**建议复用现有 `/oss` 落盘目录**（`backend/data/oss/media/`），只新增一层「随机 id → 文件」映射，避免两套上传体系 |
| `GET /api/media/i/:id` | P2 | 站内生成的图片，XOi 已有 `/oss`，可只做别名映射 |
| `GET /api/media/v/:id` | P2 | 视频成品，XOi 侧来自 new-api 的 `tasks` 表 |
| 过期清理 | P2 | 挂个定时任务，扫 `backend/data/media/` 里超过 N 天且无引用的文件 |

> 安全：`/api/media/*` 建议**不挂登录校验**（造物就是这样，靠随机 id 保密），否则瀑布流里几十张图会各带一次鉴权开销。但要加**目录穿越防护**（`path.resolve` 后校验前缀）和**上游域名白名单**（只允许 map 里登记过的 host，避免变成开放代理）。

---

## 7. 后端接口清单（要新写的部分）

| Method | Path | 入参 | 出参 | 鉴权 | 落点文件 |
|---|---|---|---|---|---|
| GET | `/api/works` | `?type=canvas\|image\|video`、`?scope=feed\|mine` | `{items: WorkRow[]}` | feed 可匿名 / mine 需登录 | `routes/works/getWorks.ts`（读接口按名判定） |
| POST | `/api/works` | `{workType,title,description,category,coverUrl,coverKind,payload}` | `WorkRow`（新建 status=pending） | 登录 | `routes/works/publishWork.ts` |
| DELETE | `/api/works` | `?id` | `{}` / 404 | 登录（仅本人） | `routes/works/deleteWork.ts` |
| GET | `/api/works/:id` | path | `WorkRow`（含 payload） | 可匿名（非 published 且非本人 404） | `routes/works/getWork.ts` |
| POST | `/api/works/:id` | `{action:"like"\|"unlike"\|"view"\|"replicate"}` | `{likes}` 或 `{}` | like 需登录 | `routes/works/likeWork.ts` |
| GET | `/api/skills` | `?tab=market\|mine\|saved` | `{items, ids?}` | market 匿名 | `routes/skills/getSkills.ts` |
| POST | `/api/skills` | `{id?,name,description,body,agentScope,categoryId,coverUrl,tools,models,visible,submit}` | `SkillRow` | 登录；`submit=true` 需 role≥100 | `routes/skills/saveSkill.ts` |
| DELETE | `/api/skills` | `?id` | `{}` | 登录（仅本人） | `routes/skills/deleteSkill.ts` |
| GET | `/api/skills/:id` | path | `SkillRow` | 可匿名 | `routes/skills/getSkill.ts` |
| POST/DELETE | `/api/skills/:id/save` | path | `{}` | 登录 | `routes/skills/saveSkillItem.ts` |
| POST | `/api/skills/import` | `{code}` | `SkillRow` | 登录 | `routes/skills/importSkill.ts` |
| POST | `/api/skills/:id/install` | path | `{path}` | 登录 | **XOi 新增**，见 §8.2 |
| GET | `/api/media/x/:id` 等 | 见 §6 | 二进制流 | 无需登录 | `routes/media/getMedia.ts` |

> 后端 6 个 store 函数（`feedWorks`/`publishWork`/`marketSkills`/`saveSkill`…）目前在项目里是**孤儿**（只有 review 用到 `pending*`/`review*`），补路由正好把它们接上，**不需要动 store 一行**。

---

## 8. 主站 Vue 页面

### 8.0 入口（2 行代码）

`frontend/src/layouts/WorkbenchLayout.vue` 第 206–214 行的 `baseMenu`：

```js
const baseMenu = [
  { type: "group", label: "创作工作台" },
  { type: "btn", path: "/project", label: "剧本一键创作", icon: "i-movie-board" },
  ...
  { type: "btn", path: "/canvas", label: "新建画布", icon: "i-edit" },
  { type: "group", label: "创作资源" },
  { type: "btn", path: "/canvas?view=assets", label: "项目资产库", icon: "i-receive" },
  + { type: "btn", path: "/square", label: "灵感广场", icon: "i-star" },
  + { type: "btn", path: "/skills", label: "Skill 市场", icon: "i-toolkit" },
];
```

路由挂进 `frontend/src/router/index.ts` 的 `/workbench` children。两个页面都**不进沉浸白名单**（`isImmersive` 只管 `/aiAssistant`、`/director3d`、`/canvas`），所以会自动带顶栏和侧栏。

> ⚠️ 主站是 **hash 路由**（`createWebHashHistory`），分享链接是 `https://xxx/#/square`。另外 `/console` 走的是 history 路由，两者别混。

### 8.1 灵感广场 `/square`

Vue 版组件（建议目录 `frontend/src/views/square/`）：

| 文件 | 对应造物 | 说明 |
|---|---|---|
| `index.vue` | `page.tsx` + `square-gallery.tsx` | 三页签、分类、排序、无限滚动 |
| `components/Masonry.vue` | `masonry.tsx` | 列数 `clamp(1..5, floor((w+18)/278))` |
| `components/GalleryCard.vue` | `gallery-card.tsx` | 封面/官方角标/悬浮遮罩 |
| `components/PillStrip.vue` | `pill-strip.tsx` | 胶囊条（可先用 tdesign 的 `t-tabs` 简化） |
| `components/DetailDialog.vue` | `detail-shell.tsx` + 两个 detail | 详情 + 点赞 |
| `components/CanvasPreview.vue` | `canvas-detail.tsx` 的 ReactFlow | 改 `@vue-flow/core` 只读模式 |
| `components/PublishDialog.vue` | `publish-dialog.tsx` | 开通发布 |
| `api.ts` | `data.ts` | 静态快照 + `/api/works` 合并 |

**复刻同款（画布）链路**（复用现成 handoff，Vue 侧几乎零改）：

```
广场「免费复刻同款」
  → GET /api/works/:id 拿 payload（{nodes, edges}）
  → localStorage.setItem("xoi.square.replicate", JSON.stringify(payload))
  → location.href = "/#/canvas?import=square&source=xoi&from=square"
  → views/canvas/index.vue 的 buildIframeSrc() 已放行（条件就是 import && source=xoi）✅ 不用改
  → iframe 内 atelier 的 bridge.ts 新增 from=square 分支：读 localStorage → 建画布项目
```

**待你拍板的一个取舍**：造物广场是**暗色全屏 + 故障字标题**的沉浸风格，XOi 工作台是 **tdesign 浅色**。我建议**套用 XOi 现有设计语言**，只保留广场的信息结构（瀑布流 + 分类 + 详情）。照搬暗色会让站内风格割裂，而且主站没有 Tailwind，`glitch-text.module.css` 那套要重写。

### 8.2 Skill 市场 `/skills` —— 这个页面本来就有占位在等它

XOi 主站 `aiAssistant/index.vue` 里**已经写了三处指向 `/skills` 的死链**（第 239、247、248 行：「浏览 Skills →」「添加技能」「管理技能」）。这个路由在范围收敛时被删了但链接没清 —— **Skill 市场正好填这个洞**。

**安装（= 让它在智能体的 Skill 选择器里出现）的硬约束**：

看 `aiAssistant/index.vue:619-639` 的 `loadSkills()`，选择器「我的」页签是把 `getSkillList` 返回的文件列表按 localStorage 里已安装的 path 过滤出来的：

```js
const mine = files.filter((path) => installedPaths.has(path) ...)
```

⇒ 光把 Skill 存进数据库**不够**，选择器看不见。必须**落盘 + 双写**：

```
POST /api/skills/:id/install
  ① 把 skill.body 写到 backend/data/skills/community/<id>.md   ← getSkillList 能扫到
  ② 返回 { path: "community/<id>.md" }
前端：
  ③ localStorage["xoi_installed_creative_skills_v1:<uid>"]
     push { path, name, desc, kind: "市场技能", emoji }
```

涉及 localStorage 键（都在 `aiAssistant/index.vue`）：
- `xoi_installed_creative_skills_v1:<uid>`（第 548 行）—— 已安装列表
- `xo_assistant_selected_skills_v1:<uid>`（第 547 行）—— 当前会话选中的（**上限 4 个**，见 `toggleSkill` 的 `.slice(-4)`）
- 落盘目录 `backend/data/skills/community/` 已存在（现有 `drama-skills/`），**符合既有约定**

其余页面元素照搬：三 Tab（市场/我的创建/我的保存）、搜索、scope 胶囊、分类、`aspect-[16/10]` 卡片、详情弹窗（正文用 `md-editor-v3` 预览）、导入弹窗（本地 `.md` / 分享码）、编辑器 `skill-editor.tsx` → `/skills/new`。

**保留造物的容错解析**：`skills_marketplace_all.json` 里 `required_tools` / `module_scopes` / `author` 有 Python repr 字符串脏数据，`listOf()` / `authorOf()` 那套别丢。

---

## 9. 分期计划

| 期 | 内容 | 交付 | 验收 |
|---|---|---|---|
| **P0** | 修挂载：`core.ts` 白名单补 `skills`/`works`/`media` + 重生成 `router.ts` | 2 行改动 | `curl -H "Authorization: Bearer <jwt>" /api/skills/review` 返 200 而非 404 |
| **P1** | `/api/media` 通道（先做 `x` 外链本地化 + `u` 上传） | `routes/media/*` + `lib/market/media-store.ts` | 造物静态快照里的首张封面能显示 |
| **P2** | 作品广场后端路由 | `routes/works/*` 6 个文件 | 发布→feed→点赞→计数 全通 |
| **P3** | Skill 后端路由 + install | `routes/skills/*` 7 个文件 | 保存→收藏→导入→安装落盘 全通 |
| **P4** | 素材搬迁 + 导入脚本 | `ops/tools/import-zaowu-market.mjs` + 三类静态目录 | catalog 条数 = 228，封面 228 张可访问，正文可取 |
| **P5** | 主站「灵感广场」 | `views/square/**` + 路由 + 侧栏 | 三页签能翻、详情能开、点赞计数、画布复刻能进 atelier |
| **P6** | 主站「Skill 市场」 | `views/skills/**` + 路由 | 三个 Tab、搜索筛选、详情正文、安装后能在 aiAssistant 选择器看到 |
| **P7** | 审核闭环 | 复用 console 现有页面 | 用户提交 → `/reseller/moderation` 可见 → 通过后广场/市场出现 |
| **P8** | 联调验收 | `ops/check-market.sh`（照 `check-agent.ts` 做零依赖自检器） | 端到端脚本全绿 |

**为什么必须先做 P0**：不做，控制台审核页继续 404；而且 P2/P3 的路由要靠同一套白名单机制挂上去。

---

## 10. 风险与坑（照单核对）

| # | 风险 | 规避 |
|---|---|---|
| 1 | `review` 路由 404（现存 bug） | P0 修；同时更正 `MEMORY.md` 第 107/122 行的过期描述 |
| 2 | `/skills` 已被 XOi 自己的智能体提示词资产（29 M）占用，且只放行图片、`.md` 一律 403 | 封面借 `/skills/covers/`，正文走 `/skill-market/bodies/` |
| 3 | 广场静态作品封面**全部**依赖 `/api/media/x/:id` | 与 P1 强绑定，先做 media 再上广场，否则页面一片灰 |
| 4 | 用户 id 口径错（`o_user.id` UUID vs new-api int） | 统一 `currentUser(req).id`；`mc_*` 表 JOIN `users` 取作者名 |
| 5 | 图片/视频作品的「复刻」在 XOi 无落点 | 降级为复制提示词 / 下载封面 |
| 6 | 广场首屏一次拉几十张 webp（单张 60–90 KB） | 瀑布流分页（每页 15）+ 懒加载 + 用 `/oss?size=200x` 那套缩略能力 |
| 7 | `@xyflow/react` → `@vue-flow/core` 的节点/边结构不是 1:1 | 做一层 `toVueFlow(payload)` 适配；先只读渲染，不支持编辑 |
| 8 | 素材 41 M 进仓库，构建变慢 | 封面是否进 git 单独决策；正文 1.8 M 可以进 |
| 9 | 造物 catalog 脏数据（Python repr） | 保留 `listOf()`/`authorOf()` 容错 |
| 10 | 沙箱构建坑 | console 构建会卡批量删除保护，先把 `frontend/public/console` **mv** 走再 build；批量删文件一次 ≤50 个 |
| 11 | 后端类型检查假阳性 | 必须用 `backend/node_modules/.bin/tsc --noEmit` 且确认命令本身没报错（`| grep -c` 那个写法会给假的 0） |

---

## 11. 开工前需要你确认的三件事

1. **视觉**：灵感广场套 XOi 现有的 tdesign 浅色工作台风格（我的建议），还是照搬造物的暗色沉浸风？
2. **图片/视频作品的复刻**：降级为「复制提示词 / 下载封面」，还是干脆不显示复刻按钮？
3. **39 M 封面**：进 git 仓库，还是放服务器 `backend/data/` 由运维单独同步（推荐后者，代码仓库只留导入脚本）？
