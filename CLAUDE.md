# XOi 商业化项目

## 基本设置

- **语言**: 始终使用中文回复
- **Git**: 每次修改代码后自动提交并推送

## 项目概述

XOi AI 短剧工厂商业化版本。

## 技术栈

### 后端 (backend/)
- Express.js + TypeScript
- SQLite (Knex.js ORM)
- JWT 认证
- Socket.IO 实时通信
- Multi-Agent AI 系统

### 前端 (frontend/)
- Vue 3 + TypeScript
- Vite 构建工具
- Pinia 状态管理
- TDesign UI 组件库
- Vue Router

## 目录结构

```
├── backend/           # 后端服务
│   ├── src/
│   │   ├── agents/    # AI Agent 逻辑
│   │   ├── routes/    # API 路由
│   │   ├── lib/       # 核心库（数据库初始化等）
│   │   ├── utils/     # 工具函数
│   │   └── socket/    # Socket.IO 逻辑
│   └── data/          # 静态资源、模型、技能文件
│
└── frontend/          # 前端应用
    └── src/
        ├── views/     # 页面组件
        ├── components/# 公共组件
        ├── stores/    # Pinia 状态管理
        ├── router/    # 路由配置
        └── utils/     # 工具函数
```

## 开发规范

### Git 工作流

- `main` - 主分支，稳定版本
- `feature/xxx` - 功能分支
- `fix/xxx` - 修复分支

每次开发新功能：
```bash
git checkout -b feature/xxx
# 开发...
git add .
git commit -m "feat: 描述"
git push origin feature/xxx
# 在 GitHub 创建 PR 合并到 main
```

### 代码风格

- 后端：遵循现有 Express 路由写法
- 前端：Vue 3 组合式 API + TypeScript

## 常用命令

```bash
# 后端开发
cd backend && yarn dev

# 前端开发
cd frontend && yarn dev

# 提交代码
git add . && git commit -m "描述" && git push
```

## 注意事项

- node_modules 已被 .gitignore 忽略
- 数据库文件 (*.db) 已被忽略
- 环境变量文件 (.env) 已被忽略
