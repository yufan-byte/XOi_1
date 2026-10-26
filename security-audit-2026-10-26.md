# XOi_1 源码级安全审计报告

- 审计日期：2026-10-26
- 审计范围：后端 `backend/src` + `backend/data`、前端 `frontend`（主站 / console / atelier）、`shared`、配置
- 审计方式：源码静态分析（四分工面平行侦察：认证授权 / 密钥凭证 / 注入·SSRF·路径穿越 / 支付清算），未做破坏性运行期验证
- 总体结论：**未发现可直接未授权进入 admin 或越权操作他人核心资源的“硬漏洞”**；核心鉴权（JWT 算法锁定 + 角色从 DB 重查 + 资源级所有权校验）、参数化查询、路径护栏、SSRF 防护、并发锁均扎实。残余风险集中在 **2 个 P1 资金类缺陷 + 若干 P2 加固项**，以及 atelier 画布前端渲染与少量死代码盲区。

---

## 一、严重度汇总（P0 / P1 / P2）

| 编号 | 面 | 问题 | 严重度 | 状态 |
|---|---|---|---|---|
| F1 | 支付 | 在线充值额度记到 root 账号（资金归属错误） | **P1** | ✅ 已真修复（2026-10-26 二轮，见 §七-F1b） |
| F2 | 支付 | 一站式 `automatic` 任务跳过余额校验 | **P1** | ✅ 已修（§七） |
| F3 | 认证 | 前端 JWT 存 localStorage，XSS 即账号接管 | P2 | 已确认 |
| F4 | 认证 | Socket.IO CORS 未随白名单收紧，默认放行任意 Origin | P2 | ✅ 已修（§七） |
| F5 | 认证 | `/assets` 静态目录免鉴权（信息泄露面待确认） | P2 | ✅ 复核为非漏洞（公开品牌素材，§七） |
| F6 | 密钥 | `.gitignore` 未覆盖 `.env.production/.env.staging` 等（未来误提交密钥缺口） | P2 | ✅ 已修（§七） |
| F7 | 注入 | `dbAdmin.ts` `dropTables/truncateTable` 字符串插值（当前死代码） | P2 | ✅ 已修（§七：`??` 占位符 + 白名单，文件保留、无调用方） |
| F8 | SSRF | `download-output` 外部 http 分支未显式校验登录 | P2 | ✅ 已修（纵深防御，§七） |
| F9 | 支付 | `points.ts` 软校验 + 后扣并发超额（薅额度） | P2 | 设计缺陷 |
| F10 | 支付 | `SimulateChannel` 不验签（当前不可达，防将来误接） | P2 | ✅ 已修（§七） |
| F11 | 前端 | atelier 画布 LLM 输出渲染是否转义（待验） | P2 | ✅ 已核查：三端均安全（见 §七-F11） |
| F12 | 密钥 | 构建产物入库（`backend/data/web`）+ CORS 通配放大 token 泄露面 | P2 | 加固项 |

> 未发现 P0（严重/可直接打穿）漏洞。

---

## 二、F1–F2：资金类缺陷（优先修）

### F1 在线充值资金归属错误 → 用户付钱拿不到额度
- 位置：`backend/src/routes/user/pay.ts:35-51`
- 现象：`enable_online_topup=true` 时，把 `amount/payment_method` 原样代理 `POST /api/user/pay`，带 `Authorization: Bearer <NEWAPI_ADMIN_TOKEN>` + `New-Api-User: <uid>`。但**网关忽略 `New-Api-User` 头**，管理令牌下单 → 订单/额度记到平台 root 账号。
- 影响：用户付款成功但余额仍为 0（资损 + 客诉 + 合规风险），平台收入归集也混乱。
- 修复：参照已修好的 `user/topup.ts` 模式——服务端自有下单 → 回调（带签名校验）→ `adjustQuota(uid, 真实面额)` 记到**登录用户**，不再透传网关 pay 端点。
- 验证点：先确认生产 `enable_online_topup` 是否 true（代码默认关闭）。

### F2 一站式 `automatic` 任务跳过余额校验 → 计费绕过
- 位置：`backend/src/lib/gateway/budgets.ts:62-64`
- 现象：`automatic=true` 时 `held=0` 且 `if(!automatic && limit>available)` 的余额闸门被整体跳过，仅对单请求做 ≈¥1,000,000 硬上限检查；整条扣费完全依赖网关后扣。
- 影响：若网关侧该用户额度已耗尽、或调用免费/零价模型，可在余额不足时持续下发任务（超额使用）。
- 修复：`automatic` 任务同样在 `createModelBudget` 里以 `users.quota FOR UPDATE` 行锁做余额闸门；或强制 `XOI_NEWAPI_QUOTA_MODE=sync` 让网关实时拒付。

---

## 三、F3–F5：认证授权加固项

### F3 前端 JWT 存 localStorage（XSS 联动 = 账号接管）
- 位置：`frontend/src/router/index.ts:131`、`frontend/src/utils/billingGate.ts:20`、`frontend/src/layouts/WorkbenchLayout.vue:788-791`
- 现象：登录响应 `token:"Bearer "+jwt` 用 `localStorage.setItem("token",...)` 持久化。任意同源 XSS 即可读取并外泄，token 有效期 24h，失窃后完整冒充用户。后端 `resolveIdentity` 忽略 token 中的角色声明、始终从 DB 重查 role（所以**篡改 localStorage 的 role 不能提权**），但 token 本身失窃仍等于账号接管。
- 修复：参照后端已有的 `xoi_media_session` httpOnly cookie 范式（`app.ts:430-435`），把会话主 token 改为 `httpOnly+SameSite=Lax` cookie 下发（fetch 带 `credentials`）；至少缩短有效期 + 引入刷新令牌。

### F4 Socket.IO CORS 默认放行任意 Origin
- 位置：`backend/src/app.ts:92`
- 现象：HTTP API 的 CORS 在未配置 `XOI_ALLOWED_ORIGINS` 时正确回退为 `false`，但 **socket.io 回退为 `"*"`**，允许任意外部站点建连。握手须带有效 token，数据不会因 CORS 自动泄露，但仍是不必要攻击面。
- 修复：socket.io 的 origin 复用与 HTTP CORS 同一份白名单；未配置时默认拒绝/同源。

### F5 `/assets` 免鉴权静态伺服（信息泄露面）
- 位置：`backend/src/app.ts:277` `app.use("/assets", express.static(...))`
- 现象：与经 `privateMedia` 鉴权的 `/oss` 不同，`/assets` 直接 `express.static` **无鉴权**。若目录含用户生成内容且文件名可预测，匿名可枚举/读取。
- 修复：确认 `assetsDir` 文件名是否随机不可枚举；若含敏感内容，接入 `privateMedia`/归属校验。

---

## 四、F6–F12：其余 P2 与疑点

- **F6 `.gitignore` 缺口**（密钥面）：根 `.gitignore` 只忽略 `.env`/`.env.local`/`.env.*.local`，**未忽略** `.env.production`/`.env.staging`/`.env.development`/`.env.test`。运维新建 `.env.production` 写 `NEWAPI_ADMIN_TOKEN`/`数据库密码`/`XOI_ADMIN_PASSWORD` 会被直接入库。→ 补 `.env.*`（保留 `!.env.example` `!.env.docker.example` 例外），并接 CI 密钥扫描（gitleaks/trufflehog）。
- **F7 `dbAdmin.ts:37-43`** `dropTables/truncateTable` 用 `"${n}"` 插值进 `DROP/TRUNCATE`，当前**无任何调用方（死代码）**；一旦接管理端“清空/导出”且表名来自用户输入即注入+破坏。→ 改 `db.raw("DROP TABLE ?? CASCADE",[n])` 或白名单校验表名。
- **F8 `canvas-stubs.ts:1271-1341`** `GET /api/download-output` 外部 http(s) 分支未显式校验登录（仅 `/oss/`、`/assets/` 分支做归属校验）。已有 SSRF 防护 + 30/min 限流，但属开放代理面。→ 补登录校验或收紧来源。
- **F9 `points.ts:93-113`** `checkAndDeductPoints` 仅校验 `quota>0` 即放行，约 20 处调用仍走此软校验再下发；并发请求可在网关扣到 0 前全部进入执行（薅额度）。→ 收敛到 `createModelBudget`+`prepareBudgetedGatewayRequest` 硬校验路径（带 `xoi_model_budgets FOR UPDATE` + `reserved_quota` 累加）。
- **F10 `pay/simulate.ts:28-35`** `parseAndVerify` 无条件 `paid:true`，信任任意 `out_trade_no`；当前 `fulfillPaidOrder` 未被任何路由挂载（死代码），生产不可达。→ 生产永远禁用 simulate；将来接 XOi 自有 `/api/pay/callback/*` 时按订单存储的 `channel` 反查并校验签名。
- **F11 atelier 画布**：LLM / 画布返回内容若以 `innerHTML`/`dangerouslySetInnerHTML` 渲染且未转义，结合 token 存储于 JS 可见位置，可被模型输出型 XSS 利用。`frontend/atelier` 渲染层未深读 → 需补充核查是否转义。
- **F12 构建产物入库 + CORS 通配**：`backend/data/web/**` 提交了前端 bundle（当前未检出内嵌真实 key，但若将来向 `VITE_*` 注入私密值会泄露）；CORS 通配（F4 同源问题）放大 F3 的 token 泄露面。→ 前端密钥一律走后端代理，构建产物改为部署期生成不入库；生产必显式设 `XOI_ALLOWED_ORIGINS`。

---

## 五、已确认安全（给结论背书，不必重复审计）

- **JWT**：`authIdentity.ts:9` 强制 `algorithms:["HS256"]`，无 `alg:none`/RS→HS 混淆；secret 取自 DB `o_setting.tokenKey`（`crypto.randomBytes(32)` 生成，短密钥有升级迁移），无硬编码。
- **角色信任最小化**：忽略 token 内全部身份/权限声明，仅信 DB 主键并重查 role/status/session_version。
- **中间件顺序**：全局鉴权覆盖全部 `/api`（除健康/登录/验证码/白名单代理）；`/api/admin` 前缀 `requireAdmin` 注册于子路由之前，无“先挂载后鉴权”绕过。
- **越权(IDOR)**：`resourceScope` 对 project/novel/script/asset/storyboard 做 DB 级所有权校验（admin 豁免）；team/works/skills 均按 token.id 归属。
- **注入**：核心接口全程 `?`/`??` 占位符，未发现用户输入进 raw SQL。
- **SSRF**：`ai-proxy`/`safeUrl` 多重防护（禁 localhost/私有地址、DNS rebinding 二次校验、不跟随 302）；`allowedGatewayTail` 拒绝 `.`/`..`/控制字符且不代理 `/api/token/*`。
- **路径穿越**：`oss.ts` `resolveSafeLocalPath`+`isPathInside`+`realpath` 符号链接检测覆盖所有读写盘；上传 ext 白名单 + uuid 文件名。
- **命令注入**：`execFile("bash",[SCRIPT,target],{shell:false})` 且 `target` 经 `TAG_RE` 白名单；ffmpeg 永不接收远程 URL。
- **支付红线**：不代理 `/api/token/*`、不代用户改密码；`reserve()` 用 `FOR UPDATE` 行锁、`QuotaOperations.apply` 用 `pg_advisory_xact_lock` 串行化、`createModelBudget` 对 `users` 行 `FOR UPDATE`，并发安全。
- **密钥**：全仓扫描未命中任何真实硬编码密钥/API key/DB 密码；模板文件均为空占位，真实凭证来自环境变量 + 运行时 DB。

---

## 六、修复优先级路线（建议）

1. **立即（资金 P1）**：修 F1（充值归属）、F2（automatic 余额闸门）；先确认线上 `enable_online_topup` / `XOI_NEWAPI_QUOTA_MODE` 配置。
2. **近期（P2 高杠杆）**：F3 把 token 改为 httpOnly cookie；F6 补 `.gitignore` + 接 CI 密钥扫描；F9 收敛计费到硬校验路径。
3. **加固**：F4 socket CORS 收紧、F12 显式设 `XOI_ALLOWED_ORIGINS` 且构建产物不入库。
4. **清理盲区**：F7 删死代码或改标识符占位符、F5 确认 `/assets` 不可枚举、F8 给 download-output 加登录、F10 生产禁用 simulate、F11 核查 atelier 渲染转义。

> 所有结论基于静态分析；标注“需运行时验证”的项建议结合网关配置与生产日志复核一遍（用匿名请求打 `/api/admin/*`、`/api/setting/*`、`/api/user/*` 确认均 401/403）。

---

## 七、修复记录（2026-10-26）

已落地的代码修复（后端 `tsc --noEmit` 通过）：

| 编号 | 文件 | 改动 |
|---|---|---|
| F1 | `backend/src/routes/user/pay.ts` | 改为**默认拒绝 + 显式放行**：①读 `payment_setting` 失败不再 fail-open 透传，直接 503；②在线充值未开启 → 引导卡密；③即使开启，未设 `XOI_ONLINE_TOPUP_VERIFIED=1` 仍拒绝，避免用户付款额度进 root |
| F2 | `backend/src/lib/gateway/budgets.ts` | `automatic` 一站式任务补余额闸门：`available<=0` 直接拒绝，堵住余额耗尽仍能无限建预算的漏洞 |
| F4 | `backend/src/app.ts` | Socket.IO CORS 与 HTTP 共用同一份 `XOI_ALLOWED_ORIGINS` 白名单，未配置时回退 `false`（不再 `"*"`） |
| F6 | `.gitignore` + `backend/.gitignore` | 增加 `.env.*` 规则并保留 `!.env.example`/`!.env.docker.example`；已用 `git check-ignore` 验证 `.env.production`/`.env.staging` 被忽略、示例文件仍保留 |
| F7 | `backend/src/utils/dbAdmin.ts` | `dropTables/truncateTable` 改用 knex 标识符占位符 `??` + 表名白名单正则，杜绝拼接注入 |
| F8 | `backend/src/routes/canvas-stubs.ts` | `download-output` 增加显式 `req.user` 校验（纵深防御；全局鉴权本已覆盖） |
| F10 | `backend/src/utils/pay/simulate.ts` | `parseAndVerify` 增加生产环境硬拒，双保险防止模拟回调被误接 |

### 二轮修复（2026-10-26 晚，真修复 + 核查）

| 编号 | 文件 | 改动 |
|---|---|---|
| **F1b（F1 真修复）** | `backend/src/utils/pay/topupAttribution.ts`（新增）+ `routes/user/pay.ts` | 不再只是"默认拒绝"：网关建单成功后、下发收银台地址**之前**，把这笔 `pending` 订单 **CAS 回写为真实登录用户**（`UPDATE ... WHERE status='pending' AND user_id=<创建者>`，状态锚点必须是 `'pending'` 字面量——锚"读取时刻的 status"恒等于当前值等于没锁，首轮实现已因此被验证脚本打穿后修正）。回写失败 → 删除未支付挂单 + 不发链接（fail-closed，回调因"订单不存在"被网关拒）。金额/epay 签名仍 100% 网关口径，不重实现。依据：new-api 源码 `controller/topup.go`（user_id=`c.GetInt("id")`=令牌归属者）与 `model.RechargeEpay`（按 trade_no 找单、入账给 topup.UserId、校验支付方式与状态、幂等）。**验证**：`npx tsx scripts/verify-pay-attribution.ts` 5 项断言全过（归属改写/终态拒绝/fail-closed 清理），`tsc --noEmit` 0 错误。上线前仍需 `XOI_ONLINE_TOPUP_VERIFIED=1` 显式放行 + 真实回调端到端实测 |
| **F11 核查** | 三端渲染层 | 主站 `frontend/src/utils/safeAssistantMarkup.ts`：**先全量 HTML 转义（& < > " '）再套固定展示标签**（pre/code/strong/em/br），无用户可控标签注入面 → 安全；atelier 全目录无 `innerHTML`/`dangerouslySetInnerHTML`（React 默认转义）→ 安全；console 仅 `auth-stage.tsx:387` 一处 `dangerouslySetInnerHTML`，内容为服务端 svg-captcha 生成的验证码 SVG，非攻击者可控 → 可接受；console/one-stop 用 react-markdown 且**未启用 rehype-raw**（默认转义原始 HTML）→ 安全 |
| 补充扫描 | 全仓 | 无 `eval`/`new Function` 调用方；`dbAdmin.ts` 经复核**文件保留**（含 `??` 占位符+白名单修复，当前无调用方，属可保留的运维方言助手）；Socket.IO CORS 共用白名单已核实（app.ts:96） |

### 复核后判定为「非漏洞 / 无需改代码」的项
- **F5 `/assets` 免鉴权**：目录内实际是公开品牌素材（`ending.mp4` 片尾），非用户内容，无需鉴权。
- **F8 原始判断**：全局 `/api` 鉴权中间件（`app.ts:387`）已覆盖 `download-output`，并非匿名可达；仅补了显式校验做纵深防御。
- **F10 原始判断**：`factory.getChannel` 已用 `simulationPaymentEnabled()` 把 simulate 限制在 dev/test，生产本就不可达。

### 暂缓项（需专项 / 设计决策，不在本轮强改）
- **F3 前端 JWT 存 localStorage**：转 httpOnly cookie 会牵动登录态、axios 拦截器、console/atelier 多处，且与现有「Cookie 不用于 API 写操作」的设计相冲突，属独立改造，建议单独立项。
- **F9 `points.ts` 软校验并发超额**：F2 已堵住最关键的 automatic 缺口；`checkAndDeductPoints` 是 20+ 调用点的兼容层，彻底收敛到硬预算路径需较大重构。
- **F12 构建产物入库**：属发布流程治理，非代码改动。

