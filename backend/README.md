<div align="center">

# 🎬 XOi · AI 短剧工厂

**一站式 AI 短剧生产引擎：从小说到成片，全流程自动化。**

围绕"策划 → 编剧 → 分镜 → 出片"构建完整闭环，支持本地化、可编程、可持续迭代的生产流程，创作效率提升 10 倍以上。

</div>

---

## 🌐 多语言支持

| 语言       | Language              |
| ---------- | --------------------- |
| 简体中文   | Chinese (Simplified)  |
| 繁體中文   | Chinese (Traditional) |
| English    | English               |
| ไทย        | Thai                  |
| Tiếng Việt | Vietnamese            |
| 日本語     | Japanese              |
| Русский    | Russian               |

> 💡 更多语言适配中，欢迎贡献翻译！

---

## 🌟 主要功能

XOi 是面向短剧生产的 AI 工作台，围绕"策划 → 编剧 → 分镜 → 出片"构建完整闭环，并支持本地化、可编程、可持续迭代的生产流程。

- ✅ **无限画布生产工作台**
  以类无限画布形式组织剧本、角色、分镜、素材与视频节点，支持自由编排、回溯与并行生产，不受线性步骤限制。
- ✅ **三层 Agent 协作体系**
  决策层、执行层、监督层协同工作，覆盖任务拆解、内容生成、质量审阅与修订反馈，提升稳定性与成片一致性。
- ✅ **持久化 Agent 记忆**
  基于本地 ONNX 向量检索的跨会话记忆系统，支持短期消息、长期摘要和语义召回，确保多轮创作连续性。
- ✅ **可编程供应商系统**
  支持在设置中心直接编写供应商 TypeScript 逻辑并即时生效，无需改源码或重启，便于私有化和多模型接入。
- ✅ **章节事件图谱驱动改编**
  自动提取原著章节事件并结构化存储，剧本改编按事件图谱精准调用上下文，减少长文本信息丢失。
- ✅ **Skill 文件化配置**
  ScriptAgent 与 ProductionAgent 的核心提示词外化为 Markdown Skill 文件，支持在线编辑与快速调优。

---

## 📦 应用场景

- 短视频内容创作
- 小说影视化实验
- AI 文学改编工具
- 剧本开发与快速原型
- 视频素材生成

---

## 🔰 使用指南

### 快速上手

1. 启动应用并登录（默认账号：`admin` / `admin123`）。
2. 在设置中心完成模型供应商配置（文本/图像/视频模型）。
3. 新建项目并导入原著，执行章节事件提取。
4. 进入 ScriptAgent 生成故事骨架、改编策略与结构化剧本。
5. 切换到 ProductionAgent，在无限画布中组织分镜、素材与视频节点。
6. 对分镜图进行节点化精调后回流工作台，完成视频拼接与导出。

> ⚠️ **首次登录** 账号：`admin`，密码：`admin123`。生产环境请通过 `XOI_ADMIN_PASSWORD` 环境变量修改默认口令。

---

## 🚀 安装部署

### 前置条件

在安装和使用本软件之前，请准备以下内容：

- ✅ 大语言模型 AI 服务接口地址
- ✅ 视频生成服务接口地址
- ✅ 图片生成模型服务接口

### 本机运行

```bash
# 安装依赖
yarn install

# 开发模式启动（端口 10588）
yarn dev

# 生产模式运行（需先构建）
yarn build
yarn start
```

> 生产模式访问地址：`http://localhost:10588`，前端页面已内置。

### Docker 部署

- 已安装 [Docker](https://docs.docker.com/get-docker/)（版本 20.10+）

```shell
docker build -t xoi .
docker run -d -p <本地端口>:10588 -v <本地数据路径>:/app/data xoi
```

### 服务端口说明

| 端口    | 用途     | 部署映射      |
| ------- | -------- | ------------- |
| `10588` | 软件界面 | `10588:10588` |

**环境变量说明：**

| 变量               | 说明                                      |
| ------------------ | ----------------------------------------- |
| `NODE_ENV`         | 运行环境，`prod` 表示生产环境             |
| `PORT`             | 服务监听端口（默认 10588）                |
| `OSSURL`           | 文件存储访问地址，用于静态资源访问        |
| `XOI_ADMIN_USERNAME` | 管理员用户名（仅首次初始化生效，默认 admin） |
| `XOI_ADMIN_PASSWORD` | 管理员密码（仅首次初始化生效，默认 admin123） |

### 云服务器部署

**系统要求**：Ubuntu 20.04+ / CentOS 7+，Node.js 24.x（最低 23.11.1+），内存 2GB+。

```bash
# 1. 安装 Node.js / Yarn / PM2
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 24
npm install -g yarn pm2

# 2. 部署项目
cd /opt
git clone <您的 XOi 仓库地址>
cd <repo>
yarn install
yarn build

# 3. 配置 PM2（pm2.json）
```

```json
{
  "name": "xoi",
  "script": "data/serve/app.js",
  "instances": "max",
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "prod",
    "PORT": 10588,
    "OSSURL": "http://127.0.0.1:10588/"
  }
}
```

```bash
# 4. 启动服务
pm2 start pm2.json
pm2 startup
pm2 save

# 5. 常用命令
pm2 list              # 查看进程
pm2 logs xoi          # 查看日志
pm2 restart all       # 重启服务
pm2 monit             # 监控面板
```

---

## 🔧 开发指南

### 技术栈

| 类别     | 技术                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| 运行时   | Node.js 23.11.1+                                                                          |
| 语言     | TypeScript 5.x                                                                            |
| 后端框架 | Express 5                                                                                 |
| 数据库   | SQLite（better-sqlite3 / knex）                                                           |
| AI 集成  | Vercel AI SDK（OpenAI / Anthropic / Google / DeepSeek / 智谱 / MiniMax / 通义千问 / xAI） |
| 本地推理 | @huggingface/transformers（ONNX）                                                         |
| 实时通信 | Socket.IO                                                                                 |
| 图像处理 | Sharp                                                                                     |
| 容器化   | Docker                                                                                    |

### 快速启动项目

```bash
# 1. 克隆项目
git clone <您的 XOi 仓库地址>
cd <repo>

# 2. 安装依赖
yarn install

# 3. 启动后端开发环境（端口 10588）
yarn dev

# 4. 生产模式启动（需先执行 yarn build）
yarn start

# 5. 代码质量检查
yarn lint
```

### 项目结构

```
📂 data/                     # 运行时数据
│  ├─ 📂 canvases/          # 无限画布数据
│  ├─ 📂 models/            # 本地推理模型（ONNX）
│  ├─ 📂 oss/               # 对象存储（素材/角色/场景）
│  ├─ 📂 serve/             # 生产环境入口
│  ├─ 📂 skills/            # Agent 技能提示词
│  ├─ 📂 vendor/            # 模型供应商适配器
│  └─ 📂 web/               # 前端编译产物（内置）
📂 docs/                     # 文档资源
📂 scripts/                  # 构建与辅助脚本
📂 src/
├─ 📂 agents/               # AI Agent 模块
│  ├─ 📂 productionAgent/   # 生产 Agent
│  └─ 📂 scriptAgent/       # 剧本 Agent
├─ 📂 lib/                  # 公共库（数据库初始化、响应格式）
├─ 📂 middleware/            # 中间件
├─ 📂 routes/               # 路由模块
│  ├─ 📂 setting/           # 系统设置
│  ├─ 📂 task/              # 任务管理
│  ├─ 📂 test/              # 测试接口
│  └─ ...                   # 其余业务模块
├─ 📂 socket/               # WebSocket 实时通信
├─ 📂 types/                # TypeScript 类型声明
├─ 📂 utils/                # 工具函数
├─ 📄 app.ts                # 应用入口
├─ 📄 core.ts               # 核心初始化
├─ 📄 env.ts                # 环境变量处理
├─ 📄 err.ts                # 错误处理
├─ 📄 logger.ts             # 日志模块
├─ 📄 router.ts             # 路由注册
└─ 📄 utils.ts              # 通用工具
📄 Dockerfile                # Docker 构建文件
📄 skillList.json            # 技能清单
📄 LICENSE                   # 许可证（专有软件）
📄 NOTICES.txt               # 第三方依赖声明
📄 package.json              # 项目配置
📄 tsconfig.json             # TypeScript 配置
```

---

## 💌 联系我们

- 🌐 官网：https://xoi.net
- 📧 邮箱：contact@xoi.net

---

## 📜 许可证

XOi 为**专有（闭源）商业软件**。未经 XOi 书面授权，禁止复制、分发、反编译或二次分发。第三方开源依赖遵循各自许可证，详见 `NOTICES.txt`。

完整协议详见 [LICENSE](./LICENSE) 文件。

---

## 🙏 致谢

感谢以下开源项目为 XOi 提供强大支持：

- [Express](https://expressjs.com/) - 快速、开放、极简的 Node.js Web 框架
- [AI SDK](https://ai-sdk.dev/) - 面向 TypeScript 的 AI 工具包
- [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) - 高性能 SQLite3 绑定库
- [Sharp](https://sharp.pixelplumbing.com/) - 高性能 Node.js 图像处理库
- [Axios](https://axios-http.com/) - 基于 Promise 的 HTTP 客户端
- [Zod](https://zod.dev/) - TypeScript 优先的模式验证库
- [Socket.IO](https://socket.io/) - 实时双向事件通信引擎
- [Hugging Face Transformers](https://huggingface.co/docs/transformers.js) - 本地 ML 推理库

完整的第三方依赖清单请查阅 `NOTICES.txt`

---

##### © 2026 XOi. All rights reserved.
