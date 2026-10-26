# XOi AI 短剧工厂

面向短剧创作的 XOi 商业化平台。

## 项目结构

```
├── backend/          # 后端服务 (Express + TypeScript)
│   ├── src/          # 源代码
│   ├── data/         # 数据目录
│   └── scripts/      # 构建脚本
│
└── frontend/         # 前端应用 (Vue 3 + TypeScript + Vite)
    ├── src/          # 源代码
    └── public/       # 静态资源
```

## 技术栈

### 后端
- Express.js + TypeScript
- PostgreSQL（Knex，与 NewAPI 共用数据库）
- JWT 认证
- Socket.IO
- Multi-Agent AI 系统

### 前端
- Vue 3 + TypeScript
- Vite
- Pinia 状态管理
- TDesign UI
- Vue Router

## 快速开始

日常本地使用：运行 `./start.sh`，统一打开 `http://localhost:12121`。网页、API 和实时连接使用同一入口，不启动额外的前端开发服务或调试端口。修改网页后执行 `./stop.sh`、`./start.sh --build` 更新产物；已有数据库和模型网关时可加 `--skip-docker`。数据库与模型网关作为内部依赖保留。

以下命令仅用于按需开发调试：

### 后端开发
```bash
cd backend
yarn install
yarn dev
```

### 前端开发
```bash
cd frontend
yarn install
yarn dev
```

## 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-07-13 | XOi 商业化版本初始化 |

## 当前部署与容量规划

请以 [服务器部署与2000并发评估](docs/服务器部署与2000并发评估-2026-10-11.md) 为准，包含上线步骤、配置参考和只读压测。历史 SQLite 部署说明不适用于当前版本。
