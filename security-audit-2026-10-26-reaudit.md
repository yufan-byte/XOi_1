# XOi_1 源码级安全重审报告（2026-10-26 · 第二轮 · 纯只读 → 已核验+修复）

> 范围：对 `backend/src`、`frontend/src`、`frontend/console`、`frontend/atelier` 做**逐项源码级**审计，覆盖 5 个面：认证授权 / 密钥凭证 / 注入·SSRF·路径穿越 / 支付额度 / 前端 XSS-CORS。
> 触发：代码已被并发会话修改（pay.ts 接入 topupAttribution.ts、console 补 cookie 依赖、新增 verify 脚本等），按新状态复核。
> **18:30 第三轮：对下表逐条人工核验真伪（7 真 1 假），真项已修复**，见文末「核验与修复记录」。

---

## 0. 总览（按严重度）

| 编号 | 面 | 严重度 | 状态 | 一句话 |
|---|---|---|---|---|
| **R-A** | 支付 | **P0·潜伏** | 未挂载（悬而未决） | `utils/pay/*`（simulate 零验签回调）已就绪但无路由挂载，一旦误挂即资损 |
| **R-B** | 前端 | **P0**（建议升） | 已确认未修 | F3 JWT 存 localStorage，XSS 即账号接管根因 |
| **R-C** | 前端 | P2 | 已确认 | console 验证码 SVG 走 innerHTML，唯一现存内联 HTML sink |
| **R-D** | 认证 | P2 | 已确认缺口 | reseller/agent 路由挂在全局限流之前 → 无任何速率限制 |
| **R-E** | 认证 | P2 | 已确认 | 错误分支偶发回显 `e.message`（canvas.ts / canvas-stubs.ts） |
| **R-F** | 密钥 | P2 | 建议加固 | `.gitignore` 缺 `secrets.json`/`secret.*` 防御性忽略 |
| **R-G** | 密钥 | P2 | dev-only | `ops/dev-mock-api.mjs` 写死 demo 密码、`dev-newapi.yml` 写死本地 PG 密码 |
| **R-H** | 支付 | P2·疑点 | 需运行时验证 | `adjustQuota` 仍用 adminToken；网关侧"用用户 access_token"合规落点未在源码定位到 |
| **R-I** | 支付 | ~~P1·疑点~~ | ✅ 已查证安全 | 静态查证：全部生成入口经 claim+行锁预扣三重闭环，无旁路（见 §9） |
| **R-J** | 认证 | ~~P2·疑点~~ | ✅ 已查证安全 | team 6 端点全部 DB 重查 owner/membership，资金操作 owner-only+行锁（见 §9） |
| **R-K** | 认证 | ~~P2·疑点~~ | ✅ 已查证安全 | 预算归属被 AsyncLocalStorage 钉死为 JWT 身份，无法伪造（见 §9） |
| **R-L** | 注入 | P2·疑点 | 需人工确认 | `ops/update.sh` 对传入 git ref `$1` 是否 `eval`/未引号拼接 |

---

## 1. 认证授权 / CSRF / 速率限制 / 错误泄露

**已确认良好的点（复核有效）：**
- JWT：`jwt.verify(token, secret, { algorithms:["HS256"] })`（`utils/authIdentity.ts:9`）锁定 HS256，抗 `alg:none`；secret 来自 DB `o_setting.tokenKey`（非硬编码）；`resolveIdentity` 一律按 DB 重查 role/status/session_version，篡改声明无法提权。
- 路由白名单：`/api/admin` 在全局 JWT 之后二次 `requireAdmin` 拦截（`app.ts:476-483`），`other/deleteAllData` 生产返回 403；`requireAdmin` 与 new-api `role≥10→"admin"` 口径一致。
- 创作域 IDOR：`middleware/resourceScope.ts` 统一兜底 `rows.some(r=>r.userId!==user.id)→403`，admin 可绕过——强。
- CORS：`app.ts:109` `origin: allowedOrigins||false`、`credentials:false`；未配 `XOI_ALLOWED_ORIGINS` 时回退 `false`（F4 生效）。Socket.IO 同白名单（F4 生效）。

**遗留/缺口：**
- **R-D（P2）**：`app.ts:330-335` 的 reseller/agent 挂载在全局限流 `app.ts:462`(max:1200/min) **之前**，因此这两组（含 `/api/reseller/finance` POST、`/redemption` 资金写）无任何速率限制。建议补独立限流。
- **R-E（P2）**：`canvas.ts:33`、`canvas-stubs.ts:1342` 在 500 分支回显 `e.message`，可能夹带内部细节；建议统一收敛到 `app.ts` 全局错误处理。
- **R-LimKey（P2 验证）**：限流 key 默认 `req.ip`；若前置反代且**未设** `XOI_TRUST_PROXY`（`app.ts:66`），`req.ip` 会变成反代 IP → 限流失效。生产须显式设置。

---

## 2. 密钥与凭证泄露

**总判定：P0/P1 真实泄露 = 0 条。** 全仓（含新增 topupAttribution.ts、verify-pay-attribution.ts）无任何真实 agnes key / new-api 令牌 / JWT 密钥 / DB 密码硬编码；git 历史从未提交 `secrets/*.pem/*.key/credentials/*.local`。"零硬编码泄露"在新代码里**仍然成立**。

- 所有 `NEWAPI_ADMIN_TOKEN` 均 `process.env` 读取；`vendor/newapi.ts:175`、`initDB.ts:647` 的 apiKey 为空占位；测试夹具 `apiKey:"secret"/"fixture"` 均非真实。
- `verify-pay-attribution.ts` 仅 `import dotenv` + DB，合成挂单 `user_id=1/2/3` 假数据并自清理，**无真实凭据**。
- 前端**无硬编码 API key**；`localStorage.getItem("token")` 存的是用户会话 JWT（非平台密钥）→ 归 F3。

**加固项：**
- **R-F（P2）**：`git check-ignore` 实测 `backend/data/secrets.json` 与 `config/secret.ts` 均 **NOT IGNORED**。补 `*.secret.*`、`**/secrets.json`、`config/secret*` 做防御性忽略（防未来手滑提交）。
- **R-G（P2，dev-only）**：`ops/dev-mock-api.mjs:45` 写死 `password:"demo1234"`；`ops/dev-newapi.yml:36` 写死 `POSTGRES_PASSWORD: xoi_local_dev_pw`。仅本地 dev compose，勿部署。
- **R-文档（P3）**：`docs/zaowu-account-830-direct-2026-10-20/upstream-channels.csv` 含 Zaowu 上游网关域名（URL 内无 token/key 参数），属信息暴露非凭证泄露。

---

## 3. 注入 / SSRF / 路径穿越 / 命令注入

**总判定：五个专面内未发现新的 P0/P1 可利用漏洞。** 历史"无注入/无路径穿越/无命令注入"在新增代码（topupAttribution CAS、canvas 视频/图片增强、budgets schema、dbAdmin `??`+白名单）中**仍然成立**。

- SQL 注入：全仓 `.raw(` 检索均为 `?`/`??` 绑定或静态 DDL；`topupAttribution.ts:46` CAS `UPDATE ... WHERE id=$2 AND status='pending' AND user_id=$3` 全参数化；`dbAdmin.ts:41-52` 用 `??` + `IDENT_RE` 白名单。
- SSRF：`ai-proxy.ts:87` upstream 来自服务端 `NEWAPI_BASE_URL`（不可用户控）+ `allowedGatewayTail` 白名单；`redirect:"manual"` 不跟随 302；`canvas-stubs.ts:1271` download-output 外部分支 `validateOutboundUrl(allowPrivate=false)` + DNS 解析二次校验防 rebinding。
- 路径穿越：`oss.ts` `resolveSafeLocalPath`+`isPathInside`+`realpath` 双护栏；`canvas-files.ts:158` `FILE_NAME_RE` 防符号链接跨租户；`skills/[id].ts:48` `safeId` 剥离非法字符。
- 命令注入：`admin/update.ts:109` `execFile("bash",[SCRIPT],{shell:false})` + `TAG_RE` 校验 git ref → 不进 shell；全仓**无 `eval(`/`new Function(`**。

**需运行时/人工确认（低危）：**
- **R-L（P2）**：`ops/update.sh` 对 `$1` 的处理需人工确认未做 `eval`/未引号拼接（管理端口、需 root，影响有限）。
- `ai-proxy.ts:41` tail 仅校验 pathname、query 不过滤（query 不改 host，低危）。
- 建议 CI 加静态检查，禁止任何 `spawn/exec` 误改为 `shell:true` 并拼接用户数据。

---

## 4. 支付与额度清算

**已确认修复有效（代码层）：**
- F1 闸门（默认拒绝 + `XOI_ONLINE_TOPUP_VERIFIED=1`）+ F2 budgets `available<=0` 硬校验 + `topupAttribution.ts` CAS 归属回写（双锚 `status='pending' AND user_id=原值`、fail-closed、回写早于收银台 URL 下发）→ **已支付订单无法被改归属、竞争窗口为零**。
- `adjustQuota`（`newapi.ts:292`）仅服务端调用，无客户端可传任意 id+value 的 add_quota 入口；`/admin/credits` 二次校验 role≥100 才动钱 → 越权改额度路径已堵。
- 计费：`budgets.ts` 用 `forUpdate()` 行锁 + reserved_quota 事务累加；`quota.ts` 条件更新 `WHERE quota>=$3` 原子防负余额；`quotaOperations.ts` `pg_advisory_xact_lock` + 唯一 operation_key 防重放。本地预扣是**带行锁的真实校验**，非纯软校验。
- 红线未踩：不代理 `/api/token/*`；代用户改密码仅团队模式团队主重置且同步 session_version+1。

**关键潜伏风险：**
- **R-A（P0·潜伏）**：`backend/src/utils/pay/{simulate,factory,guards,delivery}.ts` + `o_order` 表已就绪但**无任何路由挂载**。一旦误挂成 `POST /api/pay/callback/:channel`：`simulate.parseAndVerify`（simulate.ts:29）对请求体**零验签** → 攻击者可触发 `fulfillPaidOrder` → `rechargePoints` → 加额度。**建议：保持不挂载；若启用，禁止挂 simulate、真实回调必须 HMAC/平台证书验签 + 金额一致 + 仅 production 域名。**
- **R-H（P2 疑点）**：`adjustQuota` 仍用 `client(adminToken())` + `id`（newapi.ts:296）；源码未定位到"改用用户 access_token 确认合规"的落点。需运行时验证 new-api 对该路径是否真返回 `AUTH_SESSION_REQUIRED`（否则注册欢迎额度会失败）。
- **R-I（P1 疑点）**：需逐一核对所有生成入口是否都经 `createModelBudget`/`prepareBudgetedGatewayRequest`；存在旁路即只剩 `quota>0` 软校验，可并发薅。
- 网关侧回调（`/api/user/epay/notify` 签名/幂等/金额一致）不在本仓库，上线前必须对网关侧做渗透（伪造 notify / 重放 / 改金额）。
- `payment_compliance` 用户 access_token 背景要求未在 `complianceConfirmed`（topup.ts:38）落到用户凭证，仅读服务端 options——需核对网关语义。

---

## 5. 前端 XSS / CORS / token 存储 / iframe

**已确认安全（复核有效）：**
- F11 三端 XSS 转义结论仍成立：主站 `safeAssistantMarkup` 先全量转义再套固定标签；Markdown 走 `filterXSS`；atelier `ReactMarkdown` 未启用 `rehype-raw`（源码无 import）、`urlTransform` 剥 `javascript:`；console 其他 innerHTML 均 `esc()` 转义；`resourceScope` 创作域兜底。
- CORS 已无通配（见 §1）。iframe/postMessage 均校验 `event.origin===location.origin`，无任意域嵌入/被嵌入窃取风险。
- 前端无硬编码密钥、无 `console.log(token)`。

**核心待修项：**
- **R-B（F3 → 建议升 P0）**：`frontend/src/stores/user.ts:26`、console `api.ts:62` 把 token/role/userId 平铺写 `localStorage`；`api.ts:395` new-api 子令牌也缓存在 localStorage 的 `mc.sk.*`（凭据也落 JS 可见存储）。无 httpOnly cookie、CSRF 面小但 XSS 接管面极大。任意同源 XSS 即外泄 24h token=完整账号接管。建议参照后端 `xoi_media_session` 范式改 httpOnly cookie + `fetch credentials:'include'`。
- **R-C（P2）**：console 验证码 `auth-stage.tsx:387` `dangerouslySetInnerHTML={{__html: gate.svg}}` 未 sanitize —— 唯一现存内联 HTML 注入 sink。建议改 `<img>`+data URI 或 DOMPurify 清洗。

**疑点/遗漏：**
- 主站 `router/index.ts:131` 仅校验 token 存在、不验有效期/签名（失效由后端 401 兜底），角色越权后端兜底——可接受但属体验层。
- atelier 双源码并存：`frontend/atelier/src`（线上 React SPA）与 `frontend/atelier/upstream/src`（Next.js 含 layout 固定脚本）——需确认线上哪份生效。
- `fetchPrompts` 当前是本地静态，若改后端返回 LLM 提示词需重核查渲染路径。

---

## 6. 历史修复点当前状态（复核表）

| 修复 | 状态 | 证据 |
|---|---|---|
| F1 支付闸门 + 资金归属 CAS | ✅ 有效 | pay.ts:55-71 默认拒绝；topupAttribution.ts:46 双锚 CAS |
| F2 budgets `available<=0` | ✅ 有效 | budgets.ts:68 |
| F4 CORS 复用白名单 | ✅ 有效 | app.ts:97 / 109 |
| F6 `.gitignore` + `.env.*` | ✅ 有效 | check-ignore 实测 |
| F7 dbAdmin `??`+白名单 | ✅ 有效 | dbAdmin.ts:41-52 |
| F8 download-output 显式鉴权 | ✅ 有效 | canvas-stubs.ts:1274 + safeUrl 验证 |
| F10 simulate 生产拒 | ✅ 有效 | simulate.ts:31 + factory.ts:42 |
| F3 localStorage JWT | ❌ 未修（建议升 P0） | stores/user.ts:26 |
| F11 三端 XSS 转义 | ✅ 有效 | 逐点复核 |

---

## 7. 下一步建议（按杠杆排序，纯审计未改动）

1. **R-A**：确保 `utils/pay/*` 永不以未验签渠道挂载（加注释/构建门禁）。
2. **R-B（F3）**：单独立项把 JWT 迁 httpOnly cookie（先出方案+影响面清单 review，避免弄挂登录）。
3. **R-C**：console 验证码 SVG 改 `<img>`/DOMPurify。
4. **R-I / R-H / R-J / R-K**：对网关侧 + 生成入口全链路 + team 域 + ai-proxy 预算归属做运行时验证。
5. **R-D / R-E / R-F / R-L**：补 reseller/agent 限流、收敛错误回显、补 gitignore 防御忽略、人工核对 update.sh。

> 全部为只读静态分析，未执行任何写文件/安装/运行命令；标注"需运行时验证"项无法仅凭源码定论，建议结合 new-api 实际响应与集成测试闭环。

---

## 8. 第三轮：逐条人工核验真伪 + 修复记录（18:30）

| 发现 | 核验结论 | 修复 |
|---|---|---|
| R-A pay 模块未挂载 | ✅ 真（全仓 grep 无任何路由 import factory/simulate/delivery，纯死代码但内含零验签回调） | ✅ `utils/pay/index.ts` 加安全门禁注释：禁止未验签挂载，启用须 HMAC 验签+金额一致+幂等 |
| R-B JWT 存 localStorage | ✅ 真（stores/user.ts:8-30、console api.ts:62 均确认） | ⏸ 需专项（httpOnly cookie 改造涉及登录态/axios/console/atelier 四处，此前已约定先出方案 review 再动） |
| R-C 验证码 SVG innerHTML | ✅ 真（auth-stage.tsx:387 dangerouslySetInnerHTML） | ✅ 改 `<img src="data:image/svg+xml;utf8,...">` 渲染，sink 彻底消除 |
| R-D reseller/agent 无限流 | ✅ 真（挂载于 app.ts:330/335，全局限流在 462 之后才生效） | ✅ 挂载点前补 `sharedRateLimiter("reseller-agent-ip", 60s, 300/IP)`，后台管理接口绰绰有余 |
| R-E 500 分支回显 e.message | ✅ 真（canvas-stubs.ts:1342） | ✅ 改通用文案「下载服务暂时不可用」，细节只进服务端日志（canvas.ts:33 处只回显受控业务错误文案，不动） |
| R-F secrets.json 未被忽略 | ✅ 真（git check-ignore exit 1） | ✅ .gitignore 补 `**/secrets.json`/`*.secret.*`/`config/secret*`/`*.pem`/`*.key`；实测生效且无误伤（仓库无已跟踪 pem/key） |
| R-G dev mock 密码 | ⚠️ 半真（`demo1234` 未找到（可能已被并发会话清理）；仅 dev-newapi.yml 本地 PG 密码，dev-only 有意为之） | 不修（本地 compose 专用） |
| R-L update.sh 注入风险 | ❌ **假**（脚本实际有 `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` 白名单正则 + 全程引号包裹 + 无 eval，写得规范） | 无需修复 |

**修复后验证**：backend `npx tsc --noEmit` exit 0；console `tsc --noEmit` 0 errors；gitignore 规则 `git check-ignore` 实测全部生效、`.env.example` 仍可入库。

**仍开放的唯一大项**：R-B（F3）token 迁 httpOnly cookie——确认为真，但属专项改造，需先出方案与影响面清单 review。

---

## 9. 第四轮：三个「需验证疑点」静态查证闭环（18:45）

| 疑点 | 结论 | 关键证据 |
|---|---|---|
| R-I 生成入口是否全经预算闸门 | ✅ **全覆盖，无旁路** | 强制点在 `prepareBudgetedGatewayRequest`（budgets.ts:164，每次网关 POST 前行锁预扣）；预算创建仅接受 billable 路径（budgets.ts:30）、认领由 claim 中间件（app.ts:449-458）+ socket 合成路径（socket/index.ts:74）强制；12 类入口（ai-proxy/canvas-llm/图片/视频/音频/一站式/aiAssistant HTTP+socket/scriptAgent/productionAgent/utils/ai.ts chokepoint/vendorConfig 测试）逐一映射全部覆盖。`points.ts:93` 是注释明确的退役兼容层（恒 0 预扣），画布另有 `reservePoints` 事务预扣兜底。残余风险仅为既定设计取舍：automatic 预算 2h/1000 次的「后扣」敞口（budgets.ts:64-68 注释已明知） |
| R-J team 域归属 | ✅ **安全** | /api/team 挂 router.ts:326-330，6 端点全以 `req.user.id` 为唯一起点 DB 实时重查（teamOfOwner/membershipOf/owned）；资金操作（池划拨 movePool store.ts:119-141 事务+FOR UPDATE、成员额度 settleMember :154-178 封顶池余额、删除先结算后删 :268-315）全 owner-only；入参经 zod strict。观察级：can_view_all 成员可见全队明细（设计内）；席位计数非事务 check-then-insert 理论并发超卖（非资金面） |
| R-K ai-proxy 预算归属 | ✅ **安全** | 归属者被 AsyncLocalStorage 钉死（app.ts:428 runWithGatewayUser，JWT→req.user→context），无任何 header/body 可伪造；Authorization 最终被按 context.userId 取得的 bounded.apiKey 覆盖（receipts.ts:50）；路径白名单 6 前缀防 traversal 无 catch-all；模型白名单 assertUserModelAccess + budgetModelDecision 双复核；额度不足提交上游前 402。/v1/canvas 图片/视频/音频走本人 o_points 预扣 + getForUser 本人限定 |

**至此，两轮审计的全部「需运行时验证疑点」中，可静态查证的均已闭环；仍需真实环境的是网关侧（new-api 进程内）的 epay/notify 签名/幂等/金额一致性——不在本仓库，上线前需对网关做一次渗透验证。**

## 10. F3 迁移方案已出（待 review）

F3（token 迁 httpOnly cookie）的事实调研与迁移方案已落盘：`docs/F3-token迁移httpOnly-cookie-方案-2026-10-26.md`。要点：推荐 **A 路线双轨过渡**（cookie 兜底先行 → 前端逐步删 localStorage → socket 保留内存 token 握手），后端 cookie 兜底上线后前端漏改自动被兜住不会白屏，可灰度可回滚；预估 3 个工作日。
