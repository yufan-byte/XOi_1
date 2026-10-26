# 造物账号 UID 830 直拉结果（2026-10-20）

## 结论

本批数据来自账号 `3225449809@qq.com` 的已登录会话，不是从造物源码、XOi 本地数据库或公开宣传价推测出来的。

- 账号：UID `830`，账号分组 `default`，页面余额 `¥200`。
- 最新抓取时间：`2026-10-20 11:54:06`（Asia/Shanghai）。
- 账号价格接口：`GET /api/pricing`，价格版本 `a42d372ccf0b5dd13ecf71203521f9d2`。
- 原始计价记录：185 条；其中 Seedance 相关记录 49 条。
- NewAPI 上游渠道：87 条；已输出脱敏后的完整渠道、分组、模型映射和上游地址清单。
- 创建密钥页面可选渠道集合：40 组，共显示 186 条渠道位置，其中 6 组标记“重点推荐”。渠道位置会包含同一模型在不同固定分组下的入口，因此不等同于 185 个唯一计价模型。
- 全程只访问 GET 型账号、目录和价格接口；未请求 `/v1/*`，未创建任务，未调用任何图片、视频、音频或文本生成接口。抓取后账号的 `request_count=0`、`used_quota=0`。

## 账号 API 分组

“账号/密钥分组”和首页展示的“渠道集合”是两个层级，不能混为一谈。

| 密钥分组 | 倍率 | 可见计价模型数 | 说明 |
|---|---:|---:|---|
| `auto` | — | 183 | 智能路由，当前实际路由到 `default` |
| `default` | 1.00x | 183 | UID 830 当前默认分组；除两个 Fable 专属模型外覆盖全部计价记录 |
| `claude-kiro` | 0.35x | 7 | Claude 固定线路 |
| `claude-official` | 1.80x | 9 | Claude 官方固定线路；含两个只在本组可用的 Fable 模型 |
| `gpt-pro` | 0.25x | 6 | GPT Pro 号池 |
| `gpt-pro-enterprise` | 0.50x | 4 | GPT Pro 企业号池 |

另外价格接口仍保留 `vip` 分组定义，但当前该分组为 0 个渠道、0 个模型，不能实际调用。87 条上游渠道里，85 条含 `default`；Claude/GPT 专属分组各有 1 条渠道记录，部分渠道同时属于 `default` 和专属分组，所以各分组渠道数不能简单相加当作唯一渠道总数。

40 个渠道集合及各自线路数量见 `channel-groups.csv`；185 条模型计价记录见 `all-model-prices.csv`。

## `xoi` 专用分组实测

更正：`seedance2.0-line1-xoi`、`seedance2.0-line1-fast-xoi`、`seedance2.5-line1-xoi` 是对方承诺放入新分组 `xoi` 的专用型号，不应按无后缀型号做别名映射。

2026-10-20 对线上 NewAPI 做了三层只读核验：

1. `GET /api/channel/?p=1&page_size=100` 返回 87 个上游渠道，按渠道 `group`、`models`、`name` 和 `model_mapping` 全量检查，`xoi` 及三条专用型号命中数均为 0。
2. `GET /api/pricing` 返回 185 个计价模型；`group_ratio`、`usable_group`、模型名和 `enable_groups` 中均没有 `xoi`。
3. 临时创建 `group=xoi` 的密钥能够保存成功，但该密钥请求 `GET /v1/models` 返回 HTTP 403、0 个模型；同样方法创建 `default` 对照密钥可正常返回 183 个模型。两把临时检查密钥均已立即删除。

因此，当前线上配置的客观状态是：`xoi` 字符串可以写进密钥记录，但 NewAPI 尚未为 UID 830 建立可用的 `xoi` 渠道能力，三条专用型号也尚未进入价格表。现阶段无法从线上拉到它们的真实进货价；无后缀 `line1` 的价格不能冒充专用型号价格。

如果上游每小时才同步一次配置，不影响先使用这批既有渠道数据；影响仅是 `xoi` 在下一次同步完成前不会出现在渠道、模型和价格接口中。同步完成后应重新运行只读拉取并比较 `pricing_version`、渠道总数和 `xoi` 命中数。当前不要基于这份“尚缺 xoi”的快照删除或覆盖本地渠道。

完整核验证据见 `xoi-live-check.json`。

## 重点推荐渠道集合

创建密钥页面当前标记为“重点推荐”的渠道集合有：

| 渠道集合 | 创建密钥页线路数 |
|---|---:|
| Seedance 2.5 · 按秒 | 10 |
| Seedance 2.5 · 按次 | 7 |
| Seedance · 官转 | 6 |
| Seedance 2.0 · 按次 | 22 |
| Seedance 2.0 · 按秒 | 5 |
| Wan 3.0 · 按秒 | 3 |

首页卡片对前两组分别显示 12 条和 9 条，而创建密钥页面分别显示 10 条和 7 条。这是造物当前前端两个入口之间的实时口径差异，不应在 XOi 导入时自行猜补；完整计价仍以 `pricing.raw.json` 的 185 条记录为准。

## 原始结构与字段边界

价格接口每条记录直接提供：

```json
{
  "model_name": "seedance2.0-line1",
  "description": "...",
  "quota_type": 0,
  "model_ratio": 37.5,
  "model_price": 0,
  "completion_ratio": 1,
  "enable_groups": ["default"],
  "supported_endpoint_types": ["openai"],
  "billing_mode": "tiered_expr",
  "billing_expr": "...",
  "pricing_version": "a42d372ccf0b5dd13ecf71203521f9d2"
}
```

账号、价格和模型目录接口均不返回 `cgt`、生成结果官方 URL 或视频消费 token。这些属于任务创建/结果响应字段，只有发起实际生成任务才能验证；由于本次严禁产生扣费调用，因此没有也不应伪造这些字段。目录里只有部分 `gz-*` 官转线路明确写了“返回官方 URL / URL 可溯源”，三条 `line1` 线路的价格响应没有这项承诺。

## 上线前必须处理

当前两把账号密钥都不能直接作为可用生产密钥：

- `XOi 上游专用·零额度·20261016`：启用，但剩余额度为 0，状态为已用尽。
- `XOi 上游·造物视频`：不限额度，但处于禁用状态。

如果后续确定造物为唯一上游，应先让上游把 `xoi` 渠道组、三条专用型号及其计价记录真正发布到当前 NewAPI；在 `/v1/models` 能返回三条型号、`/api/pricing` 能返回对应计费参数之前，不应导入无后缀线路的价格代替。核验过程中只创建过临时检查密钥，并已全部删除；没有修改两把原有密钥，也没有删除 NewAPI 现有渠道。

## 文件说明

- `account-and-groups.sanitized.json`：账号、密钥状态和分组倍率，已去除密码、JWT、完整 API Key。
- `pricing.raw.json`：账号价格接口原始返回。
- `catalog-logical.raw.json`：账号可见逻辑模型和参数能力。
- `catalog-sources.raw.json`：目录来源/渠道标签映射。
- `upstream-channels.sanitized.json`：87 条 NewAPI 上游渠道的脱敏原始结构，不含渠道密钥。
- `upstream-channels.csv`：87 条上游渠道及其分组、模型、映射、状态和地址。
- `groups-and-channel-counts.csv`：账号可见分组的渠道数、模型数和倍率汇总。
- `all-model-prices.csv`：185 条计价记录的扁平表。
- `seedance-model-prices.csv`：49 条 Seedance 计价记录。
- `xoi-live-check.json`：NewAPI 渠道、价格分组和 `/v1/models` 的 `xoi` 专组实测结果。
- `channel-groups.csv`：创建密钥页面的 40 个渠道集合。
- `pull-account-pricing.mjs`：可复跑的只读拉取脚本；不保存登录令牌，不调用生成接口。
