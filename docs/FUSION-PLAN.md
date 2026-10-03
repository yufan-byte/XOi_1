# XOi × 造物 融合方案 v2（评审修订版）

> 修订依据：外部评审 8 条意见 + 代码逐条核实（工作区 `XOi_1`）。
> 结论：**评审的 6 条新增设计有效并已采纳；2 条（#1 基线、#7 部分）基于错误前提，已在下方标注核实结果。**

---

## 0. 基线澄清（评审"当前工作区还有一个基线问题"的回应）

评审称"当前工作区找不到 console 源码、`/api/login/self`、`pricing.ts`"。
**核实结果：评审看的是 `/Users/zhaochenyu/Desktop/C_code/Jing_luo`，那是另一个项目目录。**
真正的工作区是 `XOi_1`，以下基线全部存在且已实测：

| 基线 | XOi_1 实际状态 |
|---|---|
| console 源码 | `frontend/console/`（React + Vite，41 页） |
| `/api/login/self` | `backend/src/routes/login/self.ts` — 返回 o_user 镜像 + new-api quota 折算余额 |
| `pricing.ts` | `backend/src/routes/pricing.ts` — 代理网关 `/api/pricing`，显式挂全局 JWT 之前 |
| console 构建产物 | `frontend/dist/console` + `backend/data/web/console` |

→ 第 0 步无需迁移工作，直接在 XOi_1 上实施。

---

## 1. 身份底座（评审 #1）—— 部分已成立，补 3 项

**评审判断**：键名一致 ≠ 后端鉴权兼容；需要统一 `resolvePlatformIdentity()`。

**代码核实**：
- `backend/src/app.ts:226` 与 `backend/src/socket/index.ts:20` **读的是同一个** `o_setting.tokenKey`，HTTP 与 Socket 校验的是**同一把 XOi JWT**——这层面是通的。
- XOi 的 JWT 是**登录时凭 new-api 凭据裁定后签发**的，`o_user` 是 new-api 用户的镜像 → 身份源头已经是 new-api。
- `backend/src/socket/routes/aiAssistant.ts:6` 确实存在**第二次** `jwt.verify`（冗余，非破坏性）。

**采纳的修正（进入第 1 步）**：
1. 删除 `aiAssistant` Socket 内的重复 JWT 校验，统一走 Socket 握手期已解析的身份。
2. 新增 `GET /api/auth/me`（**画布 atelier 明确依赖，当前后端缺失**，`frontend/atelier/src/xoi/owner.ts:44` 失败即降级匿名桶）。
3. Socket 断线重连：明确 access token 过期后的行为（401 → 清会话 → 回 console 登录页），不允许静默转匿名。

## 2. 用户级生成令牌（评审 #2）—— 全盘采纳

**问题成立**：不能用一把平台全局 `sk-`，否则所有消费记到一个账号。

**设计：`NewApiGateway`（`backend/src/lib/gateway/`）**

```
用户 access token
  → resolvePlatformIdentity()（HTTP/Socket 共用）
  → 取得/创建该用户的「XOi Studio」生成令牌（调 new-api 管理接口，服务端持有管理员令牌）
  → 令牌加密缓存（o_user_agent_token 或复用 new-api tokens 表）
  → chat / image / video 请求统一用这把令牌
```

铁律：**任何生成入口不得自行拼 new-api 请求**，必须过 Gateway 层（否则计费口径会散）。
注意与既有红线不冲突：站点级管理员令牌只用于「管理类」调用（建令牌、查渠道），**生成调用一律用用户级令牌**。

## 3. 生成与计费合并为一步（评审 #3）—— 全盘采纳

**问题成立**：`grep` 实测 **19 个后端文件**引用 `reservePoints / pointsDeducted / deductPoints / getUserPoints`，
`canvas-stubs.ts:4` 还 import 了 `capturePoints, releasePoints, reservePoints`。
分两步做必然出现「双重扣费」中间态。

→ 原来拆开的「第 2 步模型层」「第 3 步计费」**合并为一个原子阶段**：
切执行器 = 删对应路由的 XOI 预扣/退款/余额返回，同一次改动完成。
旧 points 表与工具**先留着**，确认零引用后再删。

## 4. 模型目录适配（评审 #4）—— 全盘采纳

`/api/pricing` 只有名称与价格，缺类型/能力/时长/分辨率/参数 Schema/展示名。
造物已有归一化层（`zaowu-engine-main/src/lib/models.ts`）。

**设计：`ModelCatalogAdapter`**
```
/v1/models        → 当前用户实际可调用的模型
/api/pricing      → 价格与分组
造物模型元数据    → 类型 / 能力 / 参数 / 展示信息
        ↓
XOi 页面的统一模型格式（modelSelect / 项目模型详情 / 画布 /api/config）
```
联动校验：channel 启用 + 模型映射 + 用户分组权限 + 价格存在 + `/v1/models` 对该用户确有返回。

## 5. 镜头导演台（评审 #5）—— 采纳

- `frontend/src/views/director3d/index.vue:214-215` 实测使用固定键 `director3d-projects-v1` / `director3d-active-project-v1`
  → 改 `:u<userId>` 后缀分桶（正式版落服务端）。
- 同文件 `:438` 的 `postMessage` 接收器只查字段
  → 增加 `event.source === iframeRef.contentWindow && event.origin === location.origin` 校验。

## 6. 无限画布（评审 #6）—— 采纳，三个问题均已核实存在

| 问题 | 核实位置 | 处理 |
|---|---|---|
| 依赖 `/api/auth/me`，后端无此端点 → 降级匿名桶 | `atelier/src/xoi/owner.ts:44` | 随第 1 步补端点；画布改为**禁止降级匿名**，无身份直接拒绝 |
| 图片/视频任务状态存内存 `Map`，重启即失联 | 后端画布任务路由 | 落库保存 `上游任务 ID + 用户 ID`，重启后继续可查 |
| `generation-logs.ts` 写死本机绝对路径 | `atelier/src/services/api/generation-logs.ts:1` 实为 `export * from "/Users/.../infinite-canvas-main/web/src/..."` | 部署前必须改为包内相对导入 |

## 7. 删除清单修正（评审 #7）—— 采纳

- `data/web/miora-home` **并非零引用**：`views/aiAssistant/index.vue:113` 引用
  `/miora-home/mascot-preview.webm` → **保留该视频文件**，其余静态资源随死代码清理时再评估。
- `/aiAssistant?mode=inspiration` 的守卫：**已随本轮路由重写删除** ✓
- `/assets` 定位：**项目内 `/assets` 页面保留**（分镜成片链路要用），
  仅删除独立侧栏导航项（侧栏"项目资产库"已指向 `/canvas?view=assets`）。

## 8. 路由白名单（评审 #8）—— 已落地 ✓

`backend/src/core.ts` 已从"扫全部"改为**白名单制**（不再依赖排除列表）：

```
project / novel / script / scriptAgent / cornerScape / assets / assetsGenerate
production / task / artStyle / general / common / other
modelSelect / agents / aiAssistant / canvas / canvas-files
setting/skillManagement:read-only   setting/modelMap:read-only
setting/agentDeploy:read-only       setting/memoryConfig:read-only
setting/dev:read-only               setting/promptManage:read-only
login / user
```
生成器对 `:read-only` 域输出 405 guard（非 GET 一律拒绝）。
实测：路由从 **196 → 153 条**，`admin / pay / pointsConfig / vendorConfig / userManage / loginConfig / dbConfig` 全部不再挂载。

---

## 调整后的实施顺序

| 步骤 | 内容 | 状态 |
|---|---|---|
| **0** | 基线确认 | ✅ 已完成（评审看错目录；XOi_1 基线齐全） |
| **1** | 身份与路由底座：路由白名单 ✓、删 Socket 冗余校验、新增 `/api/auth/me`、过期/重连语义 | 白名单已完成；其余进行中 |
| **2** | 模型目录适配：`ModelCatalogAdapter`（`/v1/models` + `/api/pricing` + 造物元数据） | 待做 |
| **3** | 生成与计费**原子切换**：`NewApiGateway` 用户级令牌 + 删 19 文件积分预扣 + 任务落库 | 待做 |
| **4** | 主站瘦身：删页面/路由/壳层积分支付、余额切 new-api quota | ✅ 本轮已完成（见下） |
| **5** | 数据隔离：导演台分桶 + origin 校验、画布不降级匿名、项目/画布接口校验 userId | 待做 |
| **6** | 死代码清理：`o_user.points` / `vendorConfig` / `pay` `admin` routes / `miora-home` 其余静态 | 待做 |

### 第 4 步本轮实际完成明细

- 删除页面：`pages/{admin,inspiration,login,myPoints,order,points,register,skills}`、`views/test`
- 删除组件：`components/setting/`（整个设置面板）、`components/hello.vue`（首引导，入口全指向已删面板）、`utils/scanSkills.ts`（零引用）
- `router/index.ts` 重写：只留四模块 + 流水线；`/login` `/register` 保留整页跳 console 的守卫；删除角色守卫里对 `loginConfig/getUser` 的调用
- `WorkbenchLayout.vue`：删设置入口、会员订阅/积分充值/订阅管理/积分明细四弹窗、`PayQrDialog`、改密码表单；余额改读 `/api/login/self`；充值按钮跳 console 财务页
- `stores/user.ts`：`userPoints/memberLevel/memberExpireAt` → 单一 `balance`（new-api quota 折算元）
- `components/modelSelect.vue`：删"去配置"入口，空状态改为提示管理员在网关配线路
- 后端 `core.ts`：白名单 + 405 guard，`router.ts` 重新生成

---

## 验收标准（评审增强版，采纳）

- 用户 A 无法读取/修改用户 B 的项目、画布、导演台数据
- 登录过期后 HTTP 与 Socket 均能正确退出或重连（不静默匿名）
- 文本/图片/视频各生成一次，**只产生一条** new-api 消费日志
- 失败/取消/超时**不触发** XOi 二次退款或二次扣费
- 服务重启后视频任务仍可继续查询
- `/v1/models` 返回的模型在各页面分类正确
- iframe 消息只接受当前导演台 iframe
- 删页后无动态导入失败、无静态资源 404

---

## 长期形态（评审的最终判断，认同）

这不是"彻底放弃 XOi"，而是**把 XOi 变成造物账号与 API 底座之上的创作子系统**：
Vue + Express + Socket 仍会长期维护，只是不再承担登录/计费/管理/供应商这些本该由网关负责的部分。
若目标改为"只维护造物一个工程"，则应走另一条路（在造物里复刻四模块），本方案不适用。
