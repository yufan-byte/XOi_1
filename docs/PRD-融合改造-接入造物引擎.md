# PRD · XOi 融合改造（接入造物引擎 / 统一走 new-api）

> 版本：**v3.0（决策已锁定，可开工）**  
> 范围：仅改造 **XOi**（`/Users/zhaochenyu/Desktop/C_code/XOi_1`）  
> 原作者仓库 Jing_luo 与新仓库 XOi_1 的改造均在本仓库进行  
> 铁律：**造物引擎（zaowu-engine-main）只读不改**，造物线上用户数据**一个字都不动**

---

## 0. 版本记录

| 版本       | 变更                                                                       |
| -------- | ------------------------------------------------------------------------ |
| v1.0     | 首版：三块需求（账号/模型接入/团队）可行性分析                                                 |
| v2.0     | 补造物后台盘点；金额体系改为整体替换；取消用户迁移                                                |
| **v3.0** | **锁定六条决策**；登录页改为「照搬造物源码」的 React 子应用；明确「邮箱验证」根本不需要；业务库迁 PG；旧积分清零；团队作品默认私有 |

---

## 1. 一句话目标

> 把 XOi 从「自建轻量账号 + 自建积分 + 自建模型直连」的单体，改造成  
> **「账号与账本都归 new-api、模型调用全走 new-api、业务数据进 new-api 同库 PostgreSQL」** 的商用形态，  
> 前端体验与后台能力**直接复用造物引擎已经跑通的那一套**。



---

## 2. 决策锁定（v3.0 定稿）

| 编号     | 决策项  | 定稿结论                                      | 影响                   |
| ------ | ---- | ----------------------------------------- | -------------------- |
| **D1** | 登录页  | **完全照搬造物登录页**（源码级复用，仅换品牌为 XOi）            | 见 §5                 |
| **D2** | 业务库  | **迁移到 new-api 同一套 PostgreSQL**            | 见 §8，这是最大的一条工程量      |
| **D3** | 用户余额 | **XOi 旧积分体系全部清除**，统一用 new-api `quota`     | 见 §7                 |
| **D4** | 邮箱   | **不做邮箱验证**（没有 SMTP 服务）；邮箱只作为「登录名」使用       | 见 §5.5 —— 这条你的理解需要修正 |
| **D5** | 存量用户 | XOi **当前无真实用户**，全新起步，**不迁移、不搬迁**；造物用户完全隔离 | 见 §3                 |
| **D6** | 团队作品 | **可选私有**（默认只有 owner 可见，可显式共享给团队）          | 见 §9                 |

### 我方补充定义（需要你知晓，但不阻塞开工）

| 编号 | 事项                      | 结论                                                                                                                                             |
| -- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 | 后端是否照搬造物的「无账号系统」        | **否**。XOi 后端保留自己的 JWT 外壳，用户身份以 **new-api 用户 id** 为准（`o_user.id` 直接等于 `newapi uid`），这样 XOi 全站 92 张表的外键、`resolveIdentity()`、`requireAdmin` 全部不用改 |
| C2 | XOi 与造物是否同一个 new-api 实例 | 按「**同一个网关、不同用户组**」设计。XOi 只写 `group=xoi` 的用户，后台只对 `xoi` 组做操作 —— 见 §3                                                                            |
| C3 | 支付通道                    | 造物**没有在线支付**（只有兑换码）。XOi 的支付宝/微信适配器**保留**，入账动作从 `rechargePoints()` 换成 `adjustQuota()`                                                           |
| C4 | 管理后台                    | 复用造物 `/reseller` 那套 React 源码，与登录页放进**同一个 React 子应用**                                                                                           |

---

## 3. 边界与铁律（不可违反）

1. **造物仓库只读**：任何改动都不写回 `zaowu-engine-main`；需要复用的代码用「拷贝到 XOi 再改」的方式。
2. **造物用户零触碰**：
   - 不迁移、不修改、不删除任何既有 new-api 用户；
   - XOi 新建用户一律打 `group = xoi`；
   - XOi 后台的用户列表/财务/团队，查询条件强制带 `group = xoi`；
   - 绝不对「非 xoi 组」的用户执行 quota 调整。
3. **XOi 旧数据不迁**：`o_user` / `o_points_*` 起始为空。上线前对线上旧库做一次 `dump` 归档（成本≈0，出事有据可查）。
4. **一个令牌方向**：XOi 服务端 → new-api 用**站点级单一令牌**（管理员令牌或高权限令牌）。  
   **绝不**给每个 XOi 用户签发 new-api 子令牌 —— 那会变成「用户额度扣一次 + 站长额度扣一次」的双扣。  
   计费模型：new-api 扣站长额度（**成本**），XOi 展示/限制用户可用量（**收入**）。

---

## 4. 目标架构

```
┌──────────────────────────────────────────────────────────────┐
│  浏览器                                                        │
│   ├─ Vue 主站 (:10588, 业务/画布/导演台)                        │
│   └─ React 子应用 console (/console/ 登录页 + 管理后台)          │
└───────────────────────────┬──────────────────────────────────┘
                            │  同一个 JWT（XOi 签发，payload.id = newapi uid）
┌───────────────────────────▼──────────────────────────────────┐
│  XOi Express 后端 (:10588)                                     │
│   鉴权层   /api/login/{login,register,captcha}  ← 代理 new-api  │
│   业务层   project/novel/script/storyboard/video/canvas/…      │
│   计费层   （原 points.ts 退役）→ new-api quota / 本地镜像表    │
│   模型层   新增 vendor: newapi（文本/图片/视频/音频全走网关）    │
└───────────┬────────────────────────────┬─────────────────────┘
            │ 站点级令牌 + /v1/*          │ 业务数据（同库）
┌───────────▼────────────────────────────▼─────────────────────┐
│         new-api 站点（与造物共用实例，用户以 group 隔离）        │
│   /api/user/*   账号体系（注册/登录/self/令牌/额度）             │
│   /v1/*         模型网关（chat / images / video / audio）       │
│   PostgreSQL    users / tokens / logs / channels                │
│                 + XOi 业务表 o_project / o_novel / … + mc_teams │
└──────────────────────────────────────────────────────────────┘
```

**关键点**：XOi 的业务表和 new-api 的 `users.quota` 在**同一个 PostgreSQL** 里，  
所以「扣额度」和「写业务记录」可以放在**同一个事务**，不需要跨库对账。

---

## 5. 工程一：账号与登录体系（照搬造物）

### 5.1 交付形态

造物登录页是 **React 19 + Tailwind v4 + R3F（three.js 模型地球）**，体量约 3.5k 行、含 26KB 的着色器场景。  
XOi 主站是 Vue，无法直接内嵌。

**方案：新建 `frontend/console/` React 子应用**（Vite + React 19 + Tailwind v4），把造物登录页**源码拷过来**，  
只替换 4 类 import。这与 XOi 已有的 `atelier`（React 子应用用同源 iframe 嵌进 Vue 宿主）是**同一套模式**，  
桥接协议、构建流程都有现成先例。

```
frontend/console/                     ← 新增（React 19 + Vite + Tailwind v4）
  ├─ src/components/login/            ← 从造物 src/components/login/ 原样拷贝
  │    orbit-scene.tsx  (26KB R3F 场景，一字不改)
  │    orbit-data.ts / globe.tsx / showreel.tsx / filing.tsx / partner-dialog.tsx
  ├─ src/components/signup/auth-stage.tsx   ← 造物登录注册主组件（改 import）
  ├─ src/components/shell/brand.tsx         ← 品牌标记（换成 XOi Logo）
  ├─ src/lib/{site,api,utils}.ts            ← SITE 改 XOi；login/register 指向 XOi 后端
  ├─ src/store/app.ts                       ← 造物 useApp 的等价 zustand store
  └─ 构建产物 → backend/data/web/console/   ← 由 Express 静态托管，访问 /console/
```

Vue 侧改动极小：`/login` 路由改为跳转 `/console/`。

**只替换这 4 类 import**（其余一字不动，保证「完全一样」）：

| 造物写法                                               | console 里替换为                                          |
| -------------------------------------------------- | ----------------------------------------------------- |
| `next/dynamic`                                     | `React.lazy` + `<Suspense>`（只有 `globe.tsx` 用到）        |
| `next/navigation`（`useRouter` / `useSearchParams`） | 自研 15 行 hook（读 `location.search` / `location.assign`） |
| `@/lib/api` 的 `login` / `register`                 | 指向 XOi `/api/login/*`（契约见 §5.3）                       |
| `@/components/shell/brand-provider` 的 `useBrand()` | 静态 XOi 品牌配置（不接白标后端）                                   |

**品牌替换点**（把「造物」字样全部换成 XOi，对应你之前要求的「login 的字样要改成 XOi 的」）：

| 位置                        | 造物                 | XOi                      |
| ------------------------- | ------------------ | ------------------------ |
| `lib/site.ts` `SITE.name` | `造物引擎`             | `XOi`                    |
| 页头 Logo                   | `BrandMark` 内置 SVG | XOi Logo（`XOI_logo.png`） |
| 浏览器标题 / Dialog 标题         | 造物                 | XOi                      |
| `ensureSk()` 里的令牌名        | `造物引擎`             | `XOi`                    |
| 备案/客服/合作弹窗文案              | 造物                 | XOi（深圳市…备案信息待你提供，可先留空）   |

### 5.2 登录页功能清单（照搬后 XOi 得到什么）

- **密码登录**：邮箱或登录名 + 密码 + 记住我 + 三项合规勾选
- **团队登录**：同邮箱下的员工账号入口（对应 §9 团队模式）
- **创建账号**：邮箱、密码（≥8）、确认密码、邀请码（可选）、服务条款
- **体验细节**：三维模型地球舞台、聚光卡逐字打字、作品展映切换、开放重定向防护（`safeNext`）
- **已有的后端加固**：失败计数 → 数字图形验证码闸门（**XOi 现有实现更好，保留**）

> 说明：造物用「邮箱」当登录名（`username` 字段实际存邮箱），登录时 `username = ? OR email = ?`。  
> 这一套 XOi 直接继承。

### 5.3 后端代理层（新增/改造）

**为什么不让前端直连 new-api**：cookie 直连会连带引入跨域、`SameSite`、域名、防重放等一串改造，  
而且 `o_user` 相关的外键全部会断。**后端代理**只改 3 个文件，前端契约与全站 92 张表都不动。

| 接口                         | 现状                                     | 改造后                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/login/login`    | 查本地 `o_user` + `bcrypt.compare`        | ① 保留 `loginLimiter` + 验证码闸门 + `failCounter`<br />② 调 new-api `/api/user/login` → 拿 `{access_token, user}`<br />③ 按 `newapi uid` upsert 本地 `o_user` 镜像行<br />④ 仍签发 **XOi 自己的 JWT**，payload `{id: uid, session_version}` |
| `POST /api/login/register` | 本地建号 + `bcrypt.hash` + `welcomePoints` | ① 保留限流 + 验证码闸门 + 「注册开关」<br />② 调 new-api `/api/user/register`（`group=xoi`）<br />③ 邮箱直连 PG 补写（见 §5.5）<br />④ upsert `o_user` 镜像行 + 签发 XOi JWT（注册即登录）                                                                    |
| `GET /api/login/captcha`   | 本地 SVG 验证码                             | **不动**（new-api 没有验证码，这是 XOi 的加分项）                                                                                                                                                                                      |
| `POST /api/logout`         | 无                                      | 新增：清 cookie、会话版本 +1                                                                                                                                                                                                    |
| `GET /api/login/self`      | 无                                      | 新增：返回本地镜像 + 实时 `quota`（`BALANCE_MODE=newapi` 时实时拉）                                                                                                                                                                     |

**关键设计：`o_user.id` 直接等于 `newapi uid`。**  
这样 `resolveIdentity()` 按 `id` 查 `o_user` 的逻辑、所有 `userId` 外键、`requireAdmin` 判定，全部零改动。  
`o_user.password` 列保留但不再使用（写入占位符 `external`）。

### 5.4 数据模型变更（`o_user`）

```
o_user
  id            INTEGER PK        ← 语义变更：现在 == new-api users.id
  name          TEXT              ← 登录名（可能是邮箱）
  password      TEXT              ← 废弃，写占位符
  role          TEXT              ← 本地角色；与 new-api role 解耦，但管理员需显式同步
  status        TEXT              ← banned 时同步 new-api 禁用
  session_version INTEGER         ← 保留（改密/登出时 +1，用于踢下线）
  display_id    TEXT              ← 保留（前端展示用 6 位数字）
  newapi_uid    INTEGER UNIQUE    ← 新增（= id，冗余但便于反查与校验）
  email         TEXT              ← 新增（登录名以外的真实邮箱，可空）
  group         TEXT DEFAULT 'xoi'← 新增（隔离标记，硬编码，不允许被外部写入）
  created_at / last_login_at
```

**新增表**：

```
o_auth_audit      登录审计：id, uid, name, ip, ua, result, reason, at
o_team            团队：id, name, owner_uid, quota_pool, cycle_days, member_limit, status, created_at
o_team_member     id, team_id, uid, role(owner/admin/member), allocated(划拨出去的额度), limit_quota, status, joined_at
o_team_ledger     团队账本：id, team_id, uid, type(allocate/reclaim/consume/topup), amount, balance_after, ref, at
o_project 增加列   team_id, visibility(private|team|public), owner_uid
```

**删除的表**（§7）：`o_points_account` / `o_points_ledger` / `o_points_log` / `o_points_reservation` /  
`o_points_price` / `o_points_package` / `o_points_price_override`（共 7 张）。

### 5.5 【重要澄清】「邮箱验证」根本不需要

你说的「邮箱验证还没开服务」，这里有个误会需要先说清 —— **造物那套登录页的「邮箱」不是「邮箱验证」**：

1. 用户在注册框填的邮箱，**服务端会把它当作 new-api 的 `username` 存进去**；
2. 登录时 new-api 查 `username = ? OR email = ?`，**全程不发任何邮件**；
3. 造物自己也没接 SMTP —— 它的「忘记密码」按钮点了之后，提示语是  
   「**请联系右下角客服重置密码**」（源码注释在侧，见 `auth-stage.tsx`）。

**所以：不需要邮件服务，也能用邮箱当登录名。** 你现在就可以照搬。

**真正因为「没有邮件服务」而缺失的只有两件事**，用替代方案补：

| 缺失能力         | 替代方案                                                              |
| ------------ | ----------------------------------------------------------------- |
| 忘记密码（邮件重置链接） | ① 后台管理员重置（造物同款）；② 客服人工重置；③ 后续接短信/微信                               |
| 注册邮箱真实性      | 不做验证。**邮箱仅作登录标识**，不作为找回凭据 —— 后面接了邮件服务再打开验证开关即可，数据模型已经预留 `email` 列 |

> 如果你连「邮箱当登录名」都不想要、只想用纯用户名：也没问题，  
> 把注册页的「邮箱」标签改成「登录名」即可，代码零改动（造物本来就两种都支持）。  
> **默认按「邮箱或用户名都可以」实现**。

### 5.6 商用级补齐项（相对造物的增强，非必须但建议）

XOi 现有实现里这几项其实**比造物强**，保留不动：数字图形验证码闸门、`failCounter` 软持有、  
登录不套字符集正则（防枚举）、`X-Frame-Options` 等安全头。

需要补的（按优先级）：

| # | 项目        | 说明                                                            |
| - | --------- | ------------------------------------------------------------- |
| 1 | 限流状态持久化   | 现在 `HITS`/`failCounter` 在**进程内存**：多实例不共享、重启清零 → 迁到 PG 或 Redis |
| 2 | 登录审计表     | `o_auth_audit`，记录 IP/UA/结果，支持「异地登录」风控                         |
| 3 | 会话版本贯通    | 改密、封禁、管理员踢下线时 `session_version + 1`，并同步 new-api 侧禁用           |
| 4 | 注册开关与维护模式 | 已在 `platformPolicy` 里，改造后继续生效（拦截在代理层）                         |
| 5 | 账户安全中心    | 改密（同时改 new-api 与镜像）、查看/登出设备                                   |
| 6 | 管理员身份同步   | XOi 后台管理员 ↔ new-api `role>=10`，双向校验，避免「本地是 admin 但网关没权限」      |

---

## 6. 工程二：模型接入统一（全走 new-api）

**XOi 的 vendor 层天然可插拔** —— `backend/data/vendor/*.ts`（自定义的存 `o_vendorConfig.code`），  
运行时经 sucrase 转译丢进 vm2 沙箱执行，沙箱注入 `axios / pollTask / urlToBase64 / createOpenAI /
createOpenAICompatible / …`。每个适配器只需导出 `vendor` 配置 + `textRequest / imageRequest /
videoRequest / ttsRequest` 四个函数。

**动作：新增一个 `newapi.ts` vendor 适配器**，`baseUrl` 指向 new-api `/v1`，`apiKey` 用站点级令牌。

| 能力 | 现状（造物自带的 `openai.ts` 模板）         | 工作量                                                 |
| -- | -------------------------------- | --------------------------------------------------- |
| 文本 | `textRequest` **已可用**            | 几乎为零                                                |
| 图片 | `imageRequest` 是空实现（`return ""`） | 打 `/v1/images/generations` + `/v1/images/edits`，几十行 |
| 视频 | `videoRequest` 空实现               | **唯一有真风险**：端点形态 + 异步轮询                              |
| 音频 | `ttsRequest` 空实现                 | 参照图片实现                                              |

**不花钱验证的四条**（对应你「不要花钱测试连通」的要求）：

1. **契约单测**：mock HTTP 层，断言请求体/头部符合 new-api 契约；
2. **模型清单静态导入**：直接抄造物 `src/data/*-models.json`，不调接口就能看到渠道；
3. **后台 `modelTest` 只在管理员手点时才真打上游**，自动化流程永不触发；
4. **本地假网关**：起一个 30 行的 Node 假 new-api，返回固定响应，跑通全链路（含轮询）。

**视频适配器开工前必须先确认一件事**：线上 new-api 的视频中转端点形态  
（统一任务端点 `/v1/video/generations`，还是 MJ/Suno 专用端点）。这个定了才能写。

---

## 7. 工程三：金额体系整体替换

**唯一账本 = new-api `users.quota`（500000 quota = ¥1）。**

### 7.1 要搬过来的六层（造物已跑通）

| 层    | 造物实现                                              | XOi 落地                  |
| ---- | ------------------------------------------------- | ----------------------- |
| 余额   | `users.quota`                                     | 直接读 new-api             |
| 额度事务 | `lib/quota.ts`（缓存 + 刷写）                           | 抄                       |
| 入账   | 兑换码 / 充值档位 / 满赠 / 每日签到                            | 抄，**+ 接 XOi 自己的支付宝/微信** |
| 团队   | `mc_teams` / `mc_team_members` / `mc_team_ledger` | 见 §9                    |
| 代理   | `mc_agents` + `agt_<id>` 专属倍率                     | 抄                       |
| 后台   | `/reseller`                                       | 见 §10                   |


### 7.2 要拆掉的（XOi 侧）

- 表：`o_points_account` / `o_points_ledger` / `o_points_log` / `o_points_reservation` /
  `o_points_price` / `o_points_package` / `o_points_price_override`
- 代码：`backend/src/utils/points.ts`（377 行）、会员等级、前端积分页
- **最关键**：所有 Agent 里的 `checkAndDeductPoints()` 调用点（散布在 agents / routes / vendor）

### 7.3 扣费时机的变化（不是退步，是简化）

| | 现在 | 改造后 |
|---|---|---|
| 时机 | 调用前检查 → 扣 → 调模型 → 失败退款 | 网关转发那一刻扣（**后扣**） |
| 额度不足 | 拒绝调用 | 调用前**软校验**（只提示不扣） |
| 退款 | 一整套并发扣款/退款/冻结逻辑 | **整个删掉** |

### 7.4 你的支付通道要保留

造物**没有在线支付**，钱只能从兑换码/手工来。XOi 的支付宝/微信适配器别丢：
把入账动作从 `rechargePoints(uid, n)` 换成 `adjustQuota(uid, n × 500000)`，一段胶水代码，支付主流程不动。
**这是 XOi 比造物强的地方。**

---

## 8. 工程四：业务库迁移 new-api PostgreSQL（D2）

### 8.1 为什么必须迁

- 现在的「不安全」根因有两个：**限流状态在内存**、**数据层 SQLite**（单写者、无主从/备份生态）。
  只做账号改造而不动数据库，等于没解决根因。
- 迁到 new-api 同库后，「扣额度」与「写业务记录」可同事务，团队分配不再需要跨库对账。

### 8.2 怎么做

XOi 用 **Knex**，改 `knexfile` 的 client（`better-sqlite3` → `pg`）即可，**92 张表的 DDL 是 Knex builder 写的，不用手改**。

```
1. 安装 pg 依赖，改 knexfile：client: "pg", connection: {host,port,database,user,password}
2. 建一个独立 schema（建议 database = newapi，schema = xoi 或直接同库不同表名前缀 o_）
3. 一次性建表：跑现有 initDB（92 张表自动创建）
4. 类型风险点：
   - SQLite 的 INTEGER/TEXT 无长度限制 → PG 的 TEXT 可以，但 varchar(n) 要核对
   - 布尔值：SQLite 存 0/1 → PG 需 boolean，Knex 会自动转换但原始 SQL 要查
   - 时间：现在是 ISO 字符串存 TEXT → 建议保留 TEXT，不改 DATETIME（减少改动面）
   - 自增主键：SQLite 的 rowid 自增 → PG 用 SERIAL/IDENTITY，需显式声明
5. 逐表验证：建表后跑一遍现有单测 + 关键接口 smoke test
6. 全量数据不迁（D5：无存量用户）
```

**预估风险**：中等。工作量集中在「自增主键」「布尔/时间类型」「少量原生 SQL 方言」三处。

---

## 9. 工程五：团队模式与作品归属（D6：可选私有）

### 9.1 造物已有的机制（直接抄，机制零改动）

造物的 `src/lib/team-store.ts`（372 行）已经写完了整套：

```
划拨入池 → 按周期把成员余额补到「限额 − 本期已消费」→ 超额只退回团队划拨的部分 → 全程写流水 → 60 秒定时结算
```

**必须继承的关键设计：`allocated` 列**
它区分「团队划拨出去的额度」和「成员自己充值/签到得的额度」。
60 秒一轮的定时结算会默默回收差额，没有这一列就会**把成员自己的钱划进主账号池子**。

### 9.2 移植到 XOi 的映射

| 造物 | XOi |
|---|---|
| `adjustQuota(uid, n)` | `adjustQuota(uid, n)`（§7 后两者是同一个函数） |
| new-api `logs` 表 | 同一张 `logs`（同库，可直读） |
| `mc_team_*` 三张表 | `o_team` / `o_team_member` / `o_team_ledger` |
| 60 秒定时结算 | 同 |

### 9.3 作品归属（XOi 独有的增量）

**这才比「分额度」更本质的一点。** 建议：

```
o_project 增加三列：
  team_id     INTEGER NULL   ← 属于哪个团队
  owner_uid   INTEGER        ← 谁创建的
  visibility  TEXT DEFAULT 'private'    ← private | team | public
```

- **默认 private**（按 D6）：只有 owner 自己在项目列表里看到；
- 显式改为 `team`：团队成员可见（只读或可编辑，由 `o_team_member.role` 决定）；
- 团队负责人能看到全队作品，用于交付验收。

配套权限：`dashboard`/项目列表查询时按 `visibility` + `team_id` + `owner_uid` 组合过滤。
**这是本次改造里唯一需要改「业务查询逻辑」的地方**，其余都是搬。

### 9.4 团队登录入口

造物登录页的「团队登录」Tab 直接继承（§5.2）。语义：
同一邮箱下的员工账号 → 用团队邀请链接注册时自动 `o_team_member` 建行 → 登录后进入团队工作区。

---

## 10. 工程六：管理后台（复用造物 reseller）

**造物没有 `/admin`，后台就是 `/reseller` 代理商中心**，按身份自动变脸：

| 身份 | 判定 | 菜单 |
|---|---|---|
| 站长/平台 | new-api `role ≥ 10` | 12 项全套运营后台 |
| 代理 | `mc_agents.status ∈ approved/frozen` | 6 项（概览/我的客户/加价/财务/邀请/日志） |
| 其他 | — | 进不去，跳 `/agent-apply` |

站长 12 项：白标配置、模型管理（含**全站加价 markupPct**）、我的客户、下级代理（审核+分配专属域名）、
财务管理（收益/提现/流水/发票）、客户服务、我的留言、内容审核、官方公告、招商合作、
设置（**团队开关 / 充值档位 / 邀请奖励 / 活动**）、主题管理。

**落地**：与登录页放进**同一个 `frontend/console/` 子应用**，路由 `/console/admin/*`。
需要替换的 import 与 §5.1 相同，另加 `/api/reseller/*` → XOi Express 新路由。

> 注意：造物后台的配置**不存数据库，存 `DATA_DIR/reseller.json`**。
> XOi 侧建议改存 PG（`o_reseller_config` 表），避免多实例部署时配置不同步。

---

## 11. 分期与验收

### P0 · 地基 ✅ **已完成**

| # | 交付物 | 状态 |
|---|---|---|
| 0.1 | `frontend/console/` React 子应用（登录页） | ✅ 造物 6 个源文件**原样拷贝**（含 26KB R3F 场景）；`tsc --noEmit` + `vite build` 通过；`/console/` 与 `/console/login` 深链均 200 |
| 0.2 | `backend/src/utils/newapi.ts` 客户端 | ✅ login / register / self / 用户管理 / 额度调整 / 邮箱直连 PG / `probeContract()` 契约探测 |
| 0.3 | `/api/login/login` 代理改造 | ✅ 保留验证码闸门 + failCounter；网关异常返回 503 且**不计入失败计数**（否则网关一抖就把正常用户锁进验证码） |
| 0.4 | `/api/login/register` 代理改造 | ✅ 支持邮箱/用户名与邀请码；>20 字符邮箱自动生成短登录名；注册即登录 |
| 0.5 | `o_user` 表结构扩展 | ✅ 新增 `newapi_uid / email / user_group / last_login_at`；`id` 语义对齐 newapi uid |
| 0.6 | 配置项 | ✅ `.env.docker.example` 新增 6 项；仓库根新增 `.npmrc` 换国内镜像 |

**额外产出**：`login/logout.ts`（session_version +1 踢下线）、`login/self.ts`（实时余额）、
`o_auth_audit` 审计表、`app.ts` 的 `/console/*` SPA 回落、`scripts/newapi-probe.ts`、
`ops/dev-mock-api.mjs` + `ops/dev-serve.sh`（零依赖本地演示环境）。

### P1 · 账本与模型 🚧 **约 80%**

| # | 交付物 | 状态 |
|---|---|---|
| 1.1 | `backend/data/vendor/newapi.ts` 适配器 | ✅ 文本 / 图片（含参考图 multipart）/ 视频（提交 + 轮询 + 四种端点策略）/ 语音 / 拉模型列表 |
| 1.2 | 不花钱的适配器自检 | ✅ `ops/check-vendor.mjs`：起本地假网关真跑一遍，**20/20 通过**；全仓 13 个 vendor 结构自检全通过 |
| 1.3 | `backend/src/utils/quota.ts` 额度层 | ✅ 唯一账本 = new-api `users.quota`；读走 PG 直读（降级缓存 → 网关），写走网关管理接口；`o_quota_ledger` 审计 + 幂等 |
| 1.4 | `points.ts` 退役为兼容层 | ✅ 对外 11 个导出签名不变，内部全部指向 quota；**19 个文件、约 90 处调用点零改动** |
| 1.5 | 余额接口切 new-api | ✅ `/api/login/self` 新增；`/setting/pointsConfig/balance` 数据源换掉但**字段名不变**（前端零改动） |
| 1.6 | 清除 7 张 `o_points_*` 表 + 全部调用点 | ⏳ 剩余工作，见下 |
| 1.7 | 支付宝/微信入账接 `creditYuan()` | ⏳ 入账函数已就绪，待接入 |

#### P1 剩余工作（可验证的机械动作）

`bash ops/check-points-residue.sh` 随时查看进度，当前残留：

```
1. 仍 import @/utils/points 的文件：19 个
2. 兼容层 src/utils/points.ts：仍存在
3. initDB 中仍定义的 o_points_* 表：7 张
4. 仍直接读写 o_user.points 的位置：3 处   ← 危险项，优先
5. 预留制计费引擎 src/utils/billing.ts：仍存在（302 行）
```

> **⚠️ 第 4 项是既有 bug，不只是待办。**
> `o_user` 表**从来没有 `points` 列**（`initDB.ts` 的 o_user 定义里没有，`fixDB.ts` 也从未加过），
> 但 `billing.ts` 在 `where("points", ">=", ...)` 与 `update({ points: ... })` 上直接读写它。
> 线上老库可能因历史版本的 initDB 恰好吃过这一列而没炸，**全新安装的库一定会报 SQL 错**。
> 清理顺序建议：先干掉 `billing.ts` 这三处，再做 import 的机械替换。

**清理路线**：
1. 19 个文件的 `import { ... } from "@/utils/points"` → `@/utils/quota`（纯机械替换）
2. 处理 `billing.ts` 的调用方：预扣 → 调用前软校验 + 网关后扣
3. 删掉 `points.ts` 兼容层与 7 张 `o_points_*` 表定义（老库另走 DROP TABLE 迁移）
4. 删掉门禁脚本并更新本节

### P2 · 数据与团队

- Knex 切 PostgreSQL（§8）
- 团队三表 + 60 秒结算 + `allocated` 语义
- `o_project` 作品归属（team_id / visibility）
- 限流状态持久化（现在还在进程内存，多实例不共享）

### P3 · 后台与代理

- `frontend/console/admin/*` 移植 reseller（12 项）
- 代理 `mc_agents` 四表 + 专属域名 + 加价
- 白标配置存 PG

---

## 12. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| **new-api 版本差异**：登录返回结构（是否含 `access_token`）、视频端点形态 | **高** | P0 先做「契约探测脚本」，一次跑完打印实际响应结构，再写死适配层 |
| **PG 迁移的类型坑**（自增/布尔/时间） | 中 | 分批：先账号/团队表，再业务表；每批跑 smoke test |
| 双账本风险（new-api quota + 残留积分） | 中 | 一次性删干净（§7.2），代码里用 `grep checkAndDeductPoints` 做**零残留门禁** |
| 造物用户被误操作 | **高** | 所有 user 查询强制 `group=xoi`；管理员令牌加白名单校验；代码评审清单固定项 |
| 邮箱绑不上（new-api 管理员接口假成功） | 中 | 必须**直连 PG 写 `users.email`**（造物同款教训：管理员接口返回 success 却不改） |
| 视频适配器（唯一可能花钱的环节） | 中 | 用本地假网关跑通轮询逻辑；真实调用只由管理员手动触发 |
| 登录页移植后的三库构建（pnpm + 两个 Vite + Express） | 低 | 沿用 atelier 已验证的构建脚本模式 |

---

## 13. 待你确认（不阻塞 P0，越早越好）

| # | 事项 | 为什么重要 |
|---|---|---|
| A1 | **线上 new-api 的视频中转端点形态** | 决定视频适配器怎么写 |
| A2 | new-api 是否与造物**共用实例**？若是，XOi 用哪个管理员账号 | 决定隔离策略细节 |
| A3 | 站点域名 / 备案号 / 客服联系方式 | 登录页页脚与客服弹窗要填 |
| A4 | 邮箱要不要保留为登录名（默认保留，见 §5.5） | 影响注册页文案 |
| A5 | 管理员初始账号（`o_user.id` 不再是 1 了） | 上线首日需要一个 admin |
