# XOi Console

XOi 的前端控制台（React 19 + Vite + Tailwind v4），与 `atelier` 一样是嵌在 Vue 主站体系里的 React 子应用。

当前承载：

- **登录页 / 注册页** —— 照搬造物引擎的登录页设计（三维模型地球舞台 + 登录注册弹窗），品牌换成 XOi
- **代理商中心（管理后台）** —— 造物 `/reseller` 的 12 项运营后台已整套搬入，挂在 `/console/reseller/*`
  （另加 XOi 补位的「平台运营」组：任务监控 / 充值记录 / 兑换码 / 运营设置）

## 为什么是独立子应用

造物登录页是 React 19 + R3F（three.js 模型地球，`orbit-scene.tsx` 26KB 着色器场景），
XOi 主站是 Vue，无法直接内嵌。这个子应用的做法与 `atelier` 完全一致：
**源码级复用 + 同源托管**，不重写、不迁就框架。

## 从造物拷过来的文件（不要手改，改了就与上游脱钩）

| 文件 | 说明 |
|---|---|
| `src/components/login/orbit-scene.tsx` | 三维模型地球（R3F + GLSL），26KB，**一字未改** |
| `src/components/login/orbit-data.ts` | 轨道模型数据与时间轴，**一字未改** |
| `src/components/login/globe.tsx` | R3F 场景按需加载（`next/dynamic` 由别名兜住），**一字未改** |
| `src/components/login/showreel.tsx` | 作品展映轮播，**一字未改** |
| `src/components/login/filing.tsx` | 页脚备案，**一字未改** |
| `src/components/login/partner-dialog.tsx` | 商务合作弹窗，**一字未改** |
| `src/components/signup/auth-stage.tsx` | 登录/注册主组件，**改了 4 处**（见下） |

### `auth-stage.tsx` 相对造物的 4 处改动

1. **登录成功后的跳转**：造物 `router.replace(safeNext(...))` 跳站内页面；
   XOi 改成 `window.location.replace(toAppUrl(safeNext(...)))` 回 Vue 主站。
2. **接了 XOI 的验证码闸门**：XOI 后端在失败累计到阈值后返回 HTTP 461 +
   `{requireCaptcha, captchaId, captchaSvg, hint}`，不接的话用户会被闸门永久挡住。
3. **注册即登录**：XOI 的 `/api/login/register` 直接返回 token，不再多打一次 login。
4. **去掉了代理招募点击上报**（`/api/reseller/recruit`，XOI 属 P3，接口还不存在）。

### 为「零改动拷贝」而存在的替身

| 上游 import | 替身 | 位置 |
|---|---|---|
| `next/navigation` | 基于 react-router 的 hook 实现（含 `useSearchParams`） | `src/shims/next-navigation.ts` |
| `next/dynamic` | React.lazy + Suspense | `src/shims/next-dynamic.tsx` |
| `@/components/ui/button`、`dialog` | shadcn 的最小等价实现 | `src/components/ui/` |
| `@/components/shell/brand` | XOi 内联 SVG 品牌标记 | `src/components/shell/brand.tsx` |
| `@/lib/site` | 品牌换成 XOi 的站点常量 | `src/lib/site.ts` |
| `@/lib/api` | 指向 XOI 后端的鉴权客户端 | `src/lib/api.ts` |
| `@/store/app` | zustand store（同名 `useApp` / `setUser`） | `src/store/app.ts` |
| `./use-public-settings` | 安全的默认值（reseller 后台属 P3） | `src/components/signup/use-public-settings.ts` |
| `@/data/gallery_works.json` | 空列表（展映回落为渐变底） | `src/data/gallery_works.json` |

## 会话交接（关键）

主站的 pinia store（`frontend/src/stores/user.ts`）直接读 localStorage 的 5 个平铺键：

```
token / role / userId / displayId / username
```

`src/lib/api.ts` 的 `writeSession()` 会写这 5 个键，所以控制台登录成功后主站立刻认为已登录，
无需任何 IPC / postMessage。

> 注意：`token` 存的是 `"Bearer xxx"` 整串（主站的 axios 直接把它塞进 `Authorization`）。

## 开发

```bash
cd frontend/console
npm install
npm run dev          # http://localhost:3100，/api 自动代理到 127.0.0.1:10588
```

主站联调时也可以直接走主站的 dev server（产物在 `frontend/public/console`）。

## 构建

```bash
cd frontend/console && npm run build     # → frontend/public/console
# 或在 frontend 下一次性构建三个应用
cd frontend && npm run build:all
```

后端 Express 已为 `/console/*` 加了 SPA 回落（见 `backend/src/app.ts`），
所以 `/console/login`、`/console/signup?ref=xxx` 这类深链可以直接刷新、直接分享。

## 环境变量（构建期注入）

| 变量 | 默认 | 说明 |
|---|---|---|
| `VITE_SITE_NAME` | `XOi` | 页头品牌名 |
| `VITE_SITE_DOMAIN` | `xoi.net` | 对外域名 |
| `VITE_APP_HOME` | `/` | 登录成功后跳回的主站地址 |
| `VITE_BRAND_LOGO` | 空 | 自定义品牌图（**必须是透明底**，留空则用内置 SVG 标记） |
| `VITE_ICP` / `VITE_POLICE` / `VITE_POLICE_CODE` | 空 | 备案信息，留空则页脚不显示备案链接 |
| `VITE_SUPPORT_CONTACT` | 空 | 客服联系方式（忘记密码走人工重置） |

> ⚠️ 仓库里现有的 `XOI_logo.png`（3.4MB）和 `atelier/public/xoi-logo.png`（106KB）**都是白底图**，
> 直接放在深色登录页上会是一块白方块，因此品牌标记改用内联 SVG。
> 有透明底素材时，放进 `VITE_BRAND_LOGO` 即可整体替换。

## 素材依赖（缺了就会「看起来跟造物不一样」）

登录页有三处素材是从造物那边取用的，**必须补齐**，否则视觉会明显缺一块：

| 缺什么 | 表现 | 补齐方式 |
|---|---|---|
| 模型图标 39 个 SVG | **三维地球上的模型图标全空**（`orbit-data.ts` 用 `${import.meta.env.BASE_URL}icons/providers/{sculpted,external}/*.svg` 拼路径） | 见下方命令 |
| 字体 2 个 woff2 | 标题/正文字体回落到系统字体，观感不同 | 见下方命令 |
| 作品展映数据 | 展映卡片只剩渐变底，没有图和视频 | `src/data/gallery_works.json`；封面走造物媒体接口 `/api/media/x/<id>` |

一条命令补齐（在仓库根执行；**源仓库只读，不要改它**）：

```bash
SRC=/Users/zhaochenyu/Downloads/zaowu-engine-main/public
DST=/Users/zhaochenyu/Desktop/C_code/XOi_1/frontend/console/public
mkdir -p "$DST/icons/providers" "$DST/fonts"
cp -R "$SRC/icons/providers/." "$DST/icons/providers/"
cp "$SRC/fonts/lexend-latin-wght-normal.woff2" "$SRC/fonts/archivo-latin-wght-normal.woff2" "$DST/fonts/"
```

> ⚠️ 不要对源仓库的 `public/` 跑 `ls` / `find` / `du` —— 那个目录有 770+ 文件，
> 目录扫描会把沙箱资源打满，之后所有 shell 命令都会被 SIGTERM（Exit 137）。
> 直接用上面这条 `cp -R`，不要先列目录。

## 静态资源路径规则（踩过坑，务必遵守）

子应用挂在 `/console/` 下（`vite.config.ts` 的 `base`），所以**不能写站点根绝对路径**：

| 写法 | dev | prod | 说明 |
|---|---|---|---|
| `/icons/providers/x.svg` | ❌ 404 | ❌ 404 | 造物原源码就是这样，**照抄会坏** |
| `/console/icons/providers/x.svg` | ✅ | ✅ | 能跑，但是字面量，别硬编码 |
| `` `${import.meta.env.BASE_URL}icons/providers/x.svg` `` | ✅ | ✅ | **正确写法** |

为什么裸根路径两边都坏：

- **dev**：Vite 的 `baseMiddleware` 会先把 `/console/` 从 URL 上剥掉，再拿 `/icons/...`
  去匹配 public 目录白名单。所以 `/console/icons/...` 反而能命中，裸 `/icons/...`
  会落到「did you mean /console/icons/...」的 404 分支。
- **prod**：Express 只挂 `/console/*`（`backend/src/app.ts` 的 SPA 回落 + 静态托管），
  站点根的 `/icons/...` 没有任何人服务。

> 这个 bug 真实发生过：登录页「模型地球」的 20 个模型图标**全部 404** 而无人察觉，
> 因为之前只核对了「图标文件在不在」，没核对 URL 前缀。

**从造物源码拷来的文件，凡是带素材路径的都要改成 BASE_URL 拼接。** 截至 2026-10-02 已改三处：

| 文件 | 改了什么 |
|---|---|
| `src/components/login/orbit-data.ts` | 20 个模型地球图标前缀 |
| `src/lib/models.ts` | `ICONS` 表 19 个厂商图标前缀（`ICON_BASE`） |
| `src/lib/agents.ts` | 5 个智能体面板配图前缀（`A`）。**注意**：同文件里的 `href` / `EC` 是页面路由，不能加 base |

防回归门禁（源码 + 产物 + 地球图标三条）：

```bash
node ops/check-console-assets.mjs           # 完整（要求已构建产物）
node ops/check-console-assets.mjs --no-dist # 没构建过产物时用这个
```

门禁的源码扫描是**按扩展名判定**的，不依赖目录白名单 —— 任何裸根路径 + 素材扩展名
（`svg/png/webp/mp4/woff2…`）都会被拦。加这条规则的原因：2026-10-02 从造物拷
`lib/agents.ts` 时带进来 5 个 `/agents/*.png`，而当时门禁只认 `icons` / `fonts` 两个目录，
**漏掉了**。`/api/...` 与 `/console/...` 前缀不参与判定（前者是接口，后者已带 base）。

产物扫描遇到不以扩展名结尾的引用（模板串拼出来的动态文件名，如 `showreel/reel-${i+1}.mp4`
编译后只剩 `/console/showreel/reel-`）时，改为核对「所在目录存在且非空」。

## 作品展映：封面/视频走造物的媒体接口

造物登录页的「作品展映」用的封面上是它自己的媒体地址 `/api/media/x/<id>`
（对未登录用户也公开可读）。本项目**本地测试时直接代理过去**：

```
frontend/console/vite.config.ts
  "/api/media" → process.env.XOI_MEDIA_TARGET || http://127.0.0.1:3000   ← 造物本地服务
  "/api"       → process.env.XOI_API_TARGET   || http://127.0.0.1:10588  ← 本项目后端
```

⚠️ 两个 key 的**顺序不能换**：`/api/media` 必须在 `/api` 前面，否则会被 `/api` 抢走。

`src/data/gallery_works.json` 已经是造物那份的**整份拷贝**（24 条作品，其中 7 条视频封面），
逐字节相同。要更新就重新 `cp` 一次覆盖，格式完全一致（顶层 `{success, data, error, meta}`，
展映只用 `data[].cover_url` 与 `cover_kind`）。

展映固定只挑 5 个媒体：**优先视频封面，不够再用图片封面补齐**（见 `showreel.tsx` 的 `REEL_MEDIA`）。
所以数据里 7 条视频的那部分是有意义的 —— 删掉只剩图片时，展映会退化成 5 张静态图。

## 已知待办

- [x] 作品展映数据补齐（造物 `src/data/gallery_works.json` 已整份拷入，24 条）
- [x] 代理商中心（搬造物 `/reseller`）挂在 `/console/reseller/*`；「平台运营」补位组挂在 `/console/reseller/admin/*`
- [ ] 字体在 `src/styles/globals.css` 里的 `@font-face` 已写好，但要先把 woff2 放进 `public/fonts/`
