# F3 迁移方案：前端 JWT 从 localStorage 迁移到 httpOnly Cookie

> 状态：**待 review**（此前约定：此改造涉及登录态，先出方案与影响面清单 review 后再动手）
> 事实来源：2026-10-26 源码调研（全部 file:line 均已人工核实）

---

## 1. 为什么要做

前端把 JWT 平铺写 `localStorage`（主站 `stores/user.ts:26`、console `api.ts:62`），任意同源 XSS 即可窃取 24h 令牌 = 完整账号接管。这是两轮审计中唯一确认未修的 P0 级问题（R-B）。

## 2. 现状事实（决定方案走向的硬事实）

1. **后端全局中间件只认 `Authorization` header**（`app.ts:397`），完全不读 cookie；但已有可照抄的 cookie 范式：`xoi_media_session`（`app.ts:435-440` 签发，httpOnly+sameSite:lax+secure:prod+path 限定；`middleware/privateMedia.ts` 校验，**header 优先、cookie 兜底**，写操作不收 cookie 的纪律已立）。
2. **JWT payload 极简**：`{id, session_version}`，role 一律 DB 重查——迁移不影响权限模型。
3. **不存在第三方直连**：浏览器与 new-api 网关之间没有任何直接请求（console「直连登录」已改为同源代理，`mc.sk.*` 子令牌是空实现）→ cookie 化没有「网关不认 XOi cookie」的阻碍。
4. **dev/prod 均同源**：主站 vite 代理 `/api`、`/oss`、`/socket.io` → 12121；console 同理。浏览器视角始终同源，cookie 回种无跨站问题。生产必须保持同源部署（CORS `credentials:false`，`app.ts:112`）。
5. **三个独立认证通道**：①HTTP Authorization header（40+ 处前端读点）；②socket.io 握手 `auth:{token}`（`useSocket.ts:37`，后端 `socket/index.ts:30-50` 独立验签，**cookie 不会自动覆盖**）；③SSE 走 fetch 流式（同源 fetch 默认带 cookie，可平滑切换）。
6. **防串号机制遍布全栈**：前端大量 `localStorage token !== capturedToken` 比对 + `accountBoundary` storage 事件监听。cookie 化后前端读不到凭据原文，这套机制全部需要换信号。
7. **登录判定散布三端**：主站 `router/index.ts:131`、console `hasSession()`（`api.ts:98`，纯客户端解 JWT exp）、atelier `initOwner()`（`owner.ts:52`）都以「localStorage 有 token」为据。

## 3. 路线选项对比

| 路线 | 做法 | 优 | 劣 |
|---|---|---|---|
| **A 双轨过渡**（推荐） | 登录响应照旧回 token（前端仅存内存+影子键），同时 Set-Cookie；后端加「header 优先、cookie 兜底」；逐步删 localStorage | 可灰度、随时回滚、老标签页不断；XSS 持久窃取面立刻消除 | socket.io 握手仍需内存 token（XSS 理论上可读内存，但无持久化后攻击面大幅收窄） |
| B 一步切 cookie | 登录只 Set-Cookie；前端 5 键换 uid/role/exp 影子键；全部请求靠同源 cookie | 一次清干净，与媒体 cookie 同构 | 改动面最大（全部读点+守卫语义重写+socket 需同步改造），无灰度期 |
| C 窄 cookie | 只把 `/oss` 模式推广到全部 GET，写操作保留 header | 风险最小 | XSS 仍可拿内存 token 发写请求，接管面只收窄未消除，不解决问题 |
| D cookie+ticket | HTTP 走 cookie，socket 握手改一次性 ticket | 连内存 token 也消除 | 多一套 ticket 机制，工程量最大 |

**推荐：A 路线**（socket.io 保留内存 token 握手）。理由：①消除的是真正的攻击面——XSS 无法再**持久化**窃取令牌（localStorage 是 XSS 载荷最容易读的地方，内存变量需要 payload 恰好活在那个闭包里，难度差一个量级）；②媒体 cookie 范式现成可抄，后端改动很小；③可灰度可回滚，符合「不能把登录弄挂」的红线。若后续想把内存 token 也消掉，再单独立项做 D 的 ticket 机制。

## 4. A 路线实施计划（4 个阶段）

### 阶段 1：后端（小改动，先行落地）
1. `app.ts` 全局中间件加 cookie 兜底：`rawToken = req.headers.authorization || readSessionCookie(req)`——照抄 `privateMedia.ts:9-12` 的解析；**保持 header 优先**（兼容未迁移客户端）。
2. 登录/注册响应在返回 token 的同时 `res.cookie("xoi_session", token, {httpOnly:true, sameSite:"lax", secure:prod, path:"/", maxAge:24h})`；登出/改密（session_version+1）时清 cookie。
3. 新增 `GET /api/auth/me` 已存在（`routes/auth/me.ts`）——前端影子会话信号直接用它 + 登录响应里的 id/role/display_id（存 localStorage 作**非敏感影子键**：uid/role/exp，不含 token）。

### 阶段 2：主站 Vue（改动集中）
1. `stores/user.ts`：setUser 不再写 `token` 键（只写影子键）；token 仅存内存 ref。
2. `axios.ts` 拦截器：有内存 token 用 header（含 socket 握手）；没有就靠 cookie（fetch/axios 同源默认携带，axios 需 `withCredentials: true` 或走 same-origin 默认）。
3. `accountBoundary.ts` 防串号：改用影子键 uid 比对（storage 事件监听 uid 变化即可，机制保留只是换了比较对象）。
4. `router/index.ts` 守卫：改判影子键 + 过期时间。
5. 401 处理不变（清影子键 → 跳登录）。
6. 逐个清理手拼 Authorization 的 20+ 处读点（billingGate/useSocket/useChat/workspace/director* 等）：能靠 cookie 的删 header，socket 握手继续用内存 token。

### 阶段 3：console + atelier
1. `api.ts`：writeSession/saveAuth 停写 token 键；hasSession() 改用影子键 exp；`clearSession` 补调后端清 cookie。
2. atelier `owner.ts`/`upstream-auth-bridge.ts`：getAuthToken 改内存态或依赖 cookie；上游 persist 键 `infinite-canvas-auth-token-v1`（:87）**必须停写**（这是另一个 localStorage 持久化点）；失效桥逻辑改影子键驱动。

### 阶段 4：清理与验证
1. 全仓 grep `localStorage.*token` 确认清零（影子键除外）。
2. 端到端验证清单：登录→刷新页面保持登录→生成请求→socket 对话→SSE 流式→图片/视频任务→登出→改密踢下线→跨标签页换号→atelier iframe 内全流程→console 全流程→401 过期跳转。
3. `tsc`/`vue-tsc`（主站要 `--max-old-space-size=2048`）/console 构建全过。

## 5. 风险与回滚

- **最大风险**：阶段 2/3 改动面大，个别手拼 fetch 漏改导致「请求 401」。对策：后端 cookie 兜底先行上线后，前端任何漏改都自动被 cookie 兜住（同源自动携带），**不会白屏**——这是 A 路线的安全垫。
- **回滚**：cookie 与 header 双轨期，任何一步都可单独回退前端改动，后端兜底逻辑保留无害。
- **不能省的红线**：cookie 必须 httpOnly + sameSite:lax + secure(prod) + host-only（不设 Domain）；写操作继续走 header/cookie 双认（同源场景无 CSRF 面，CORS credentials:false 不变）。

## 6. 工作量评估

后端半天、主站 1 天、console+atelier 1 天、端到端验证半天 ≈ **3 个工作日**（灰度可拆多次发布）。

---

## 附：不需要担心的（调研确认）

- console 无 new-api 直连、无 sk- 子令牌残留（`clearSkCache` 空实现是刻意的）。
- 文件下载全走 axios blob + createObjectURL，无裸 `<a href>` 带凭据的模式。
- dev 环境无跨域 cookie 问题（vite 代理同源）。

---

# 实施记录（2026-10-26 已落地，A 路线全量）

## 一、后端

| 文件 | 改动 |
| --- | --- |
| `utils/sessionCookie.ts`（新增） | `xoi_session` 读写、`cookieAuthAllowed()`（Sec-Fetch-Site + Origin/Host 双确认）、`secureForRequest()`、媒体 cookie（`xoi_media_owner` + `xoi_media_session_<id>`，path=/oss）、`sessionTokenFromHandshake()` |
| `routes/login/session.ts`（新增） | `POST /api/login/session`：老 header 换 cookie + 刷新后身份回读；只回 `{id,name,display_id,role,exp,session}`，**不回 token**；顺带滑动续期并重发媒体 cookie |
| `app.ts` | 全局鉴权 `const token = headerToken \|\| (cookieAuthAllowed(req) ? readSessionToken(req) : "")`；`/api/login/media-session` 同样支持 cookie 兜底 |
| `routes/login/login.ts`、`register.ts` | 登录/注册即下发 `xoi_session` + 媒体 cookie |
| `routes/login/logout.ts` | 新增 `scope=local`（只清 cookie、不 bump session_version，供前端主动登出）；两分支都清 cookie + 清媒体 cookie |
| `routes/setting/loginConfig/updateUserPwd.ts` | 改密成功即清会话 cookie（强制重新登录） |
| `middleware/requestBodyGuard.ts` | 写操作闸门的 `hasCredentials()` 接受同源 cookie，否则「仅 cookie」的 POST 全被 401 |
| `socket/index.ts` | 握手 `auth.token` 为空时从 handshake headers 取 cookie（socket 不会自动带 cookie 到 auth 字段） |

## 二、前端（三端）

- 新增同构会话工具：主站 `src/utils/session.ts`、console `src/lib/session.ts`。语义统一 ——
  **凭据**只存在 httpOnly cookie + 页内存变量；**localStorage 只留非敏感信号** `xoi_session`（`uid:nonce`）。
- 新增 `bootstrapSession()` / `bootstrapConsoleSession()`：老 `localStorage.token` 换 cookie 后立刻删除；只有 cookie 时把信号补回来（刷新不踢人）。
- 三端 44+ 处 `localStorage.getItem("token")` 读点全部改为 `sessionSignal()`（身份比对）+ `authHeaders()`（只在有内存凭据时带 header）。
- `billingGate` 的串号保护基准从 token 换成 `accountSignal()`（会话信号），语义不变但不再持有凭据。
- atelier：`owner.ts` 改用 `/api/auth/me` + `credentials:"same-origin"`；`backend.ts` 不再拼 Authorization，401 派发 `xoi:session-expired` 由上游桥强制回登录；`upstream-auth-bridge.ts` 重写为「播种信号而非 JWT」。
- console `lib/api.ts`：`writeSession` 把凭据只放内存；`loadAuth` 靠信号 + 过期时间；`saveAuth` 仅在真拿到凭据时更新内存。

## 三、运行时验证矩阵（curl + 无头 Chrome，全通过）

| # | 场景 | 结果 |
| --- | --- | --- |
| 1 | 无任何凭据 `GET /api/auth/me` | 401 |
| 2 | 仅 header | 200 |
| 3 | 仅 cookie | 200 |
| 4 | cookie + `Sec-Fetch-Site: cross-site` | 401 |
| 5 | cookie + 跨站 Origin | 401 |
| 6 | cookie + 同源 Origin | 200 |
| 7 | `POST /api/login/session`（仅 cookie） | 200，回身份不回 token，续期 3 个 cookie |
| 8 | 写操作仅 cookie / 跨站 | 200 / 401 |
| 9 | `POST /api/billing/daily-notice/claim`、`/api/one-stop-uploads`、`/api/canvas-files` 仅 cookie | 200 |
| 10 | `PUT /api/director-scenes/<不存在 id>` 仅 cookie | 404（已过鉴权，非 401） |
| 11 | `/oss/...` 静态资源：带媒体 cookie / 无 cookie / 只带 xoi_session | 200 / 403 / 403 |
| 12 | `scope=local` 登出 | 清 cookie，旧 token 仍有效（不踢其他设备） |
| 13 | 全量登出 | 清 cookie 且 bump session_version，旧 token 变 401 |
| 14 | 浏览器：仅注入 cookie 进 `/#/project` | 正常进入，`localStorage.token` 为空，信号由 cookie 回填 |
| 15 | 浏览器：F5 刷新 | 信号不被改写，保持登录 |
| 16 | 浏览器：清 cookie 后刷新 | 壳层先渲染，首个 API 401 → 跳 `/login?expired=1` |

构建：主站 `vue-tsc --build --force` + `vite build` 通过；console `tsc --noEmit` + `build` 通过；atelier `build` 通过；产物已同步 `backend/data/web`。
产物内 `getItem("token")` / `setItem("token")` 残留为 0。

## 四、遗留与注意

1. **main 站路由守卫仍只看「有没有信号」**，不看 `xoi_session_exp`。cookie 过期时先渲染壳层、等首个 401 再跳登录 —— 与改造前行为一致（服务端始终是唯一权威），故未加本地过期闸门，避免客户端时钟偏差造成误踢。
2. **`xoi_media_owner` 刻意非 httpOnly**（`uid:sha256` 摘要，供前端判断「这个媒体是不是我的」），不含可复用凭据。
3. **dev 环境注意**：cookie 不区分端口，`localhost:3100`（console dev）与 `:12121` 共享同一 cookie，无需额外配置。
4. 本地测试留下的探针账号 `f3_probe_01`（id=24）与测试上传文件已清理文件、账号保留（删账号会动 new-api users 表，未擅自动）。

## 五、浏览器实测发现并补掉的三处回归（关键）

首次全页面实测（无头 Chrome，仅注入 cookie）暴露了「header 优先」策略的连带损伤，已全部修复：

| # | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| R1 | `#/canvas` 的 `/api/v1/user-config`、`/api/v1/canvas/projects` 全 401，响应 `{"message":"无效的token"}` | 画布上游把**会话信号**当 token 传给 `apiGet/apiPost`，被拼成 `Authorization: Bearer 24:mvp…`；后端 header 优先，验签失败即 401，cookie 被无视 | ① `atelier/src/services/api/request.ts` 新增 `credentialHeaders()`：只有三段点分的真 JWT 才进 Authorization；② 后端 `app.ts` 加**兜底**：header 验签失败且同源 cookie 有真凭据时，按 cookie 身份放行（跨站读不到 cookie → 不构成绕过） |
| R2 | 控制台 `/console/agent-apply` 报「请先登录」，`/api/agent/apply` 401 | `routes/agent`、`routes/reseller` 挂在全局鉴权**之前**，自带 `lib/reseller/auth` 只读 `req.headers.authorization` | `lib/reseller/auth.ts` 的 `currentUid()` 改为 header → cookie 依次尝试 |
| R3 | 主站 `dailySpend`、`directorHandoff`、`director3d` 把信号塞进 Authorization | 迁移时把 `localStorage.getItem("token")` 机械替换成 `sessionSignal()`，顺带把「身份比对值」当成了「凭据」 | 全部改为 `credentials:"same-origin"` + 删 Authorization；信号只用于「账号是否切换」比对 |

**教训（已写入项目长期记忆）**：cookie 时代的铁律是「身份比对用的信号 ≠ 凭据」。后端 `headerToken || cookie` 是强优先，任何垃圾 header 都会让 cookie 兜底失效。

### 复测结果（重启后端 + 重建三端 + 无头 Chrome）

- `#/project`、`#/canvas`、`/console/*`：**0 个 4xx/5xx、0 个控制台报错、0 个未捕获异常**，`localStorage.token` 恒为空。
- 画布 `/api/v1/*`（含 iframe 内）全 200；控制台 `/api/agent/apply`、`/api/reseller/config` 全 200。
- 旧画布携带 `Bearer <信号>` 的同源请求 200（兜底生效）；同一请求带 `Sec-Fetch-Site: cross-site` 仍 401（无绕过）。
