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
- SQLite (Knex.js)
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

### 后端
```bash
cd backend
yarn install
yarn dev
```

### 前端
```bash
cd frontend
yarn install
yarn dev
```

## 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-07-13 | XOi 商业化版本初始化 |
