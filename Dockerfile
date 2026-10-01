# syntax=docker/dockerfile:1
# XOi 一体化镜像：前端构建 → 后端构建 → 运行时精简层
# 构建后单容器即可对外服务（前端静态页 / API / WebSocket / 资源 全在 10588 端口）

# ───────── Stage 0: atelier React 画布构建 ─────────
# 产物落 frontend/public/atelier-canvas，随 Stage 1 的 public 静态链进入最终 dist；
# 以源码构建为准，避免本地忘跑 npm run build 时把旧画布产物打进镜像
FROM node:20-bookworm-slim AS atelier-build
WORKDIR /app/atelier
RUN npm config set registry https://registry.npmmirror.com/
COPY frontend/atelier/package.json frontend/atelier/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY frontend/atelier/ .
# vite outDir = <atelier>/../public/atelier-canvas → /app/frontend/public/atelier-canvas
RUN npm run build

# ───────── Stage 1: 前端构建 ─────────
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
RUN npm config set registry https://registry.npmmirror.com/ \
 && yarn config set registry https://registry.npmmirror.com/
COPY frontend/package.json frontend/yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn yarn install --frozen-lockfile
COPY frontend/ .
# atelier 画布产物以 Stage 0 源码构建结果为准（覆盖仓库内随版本提交的产物副本）
COPY --from=atelier-build /app/frontend/public/atelier-canvas public/atelier-canvas
# 生产走同源相对路径（/api），无需注入域名；直接 build-only 跳过 vue-tsc 加速
RUN yarn build-only

# ───────── Stage 2: 后端打包（esbuild bundle）─────────
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app/backend
# 切到阿里云 Debian 源加速 apt（兼容新版 .sources 与传统 sources.list 两种格式）
RUN npm config set registry https://registry.npmmirror.com/ \
 && { sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
          /etc/apt/sources.list.d/*.sources 2>/dev/null \
     ; sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
          /etc/apt/sources.list 2>/dev/null || true; } \
 && apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/yarn.lock ./
# 打包阶段需要 devDependencies(tsx/esbuild)，全量安装
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn yarn install --frozen-lockfile --ignore-optional
COPY backend/ .
ENV NODE_ENV=prod
RUN yarn build

# 把前端产物放进 data/web，由后端静态托管
RUN rm -rf data/web && mkdir -p data/web \
 && cp -r /app/frontend/dist/. data/web/

# 清理运行时不需要的源码与开发产物，保留 serve/web/skills/models/vendor/modelPrompt/assets
RUN rm -rf src scripts build dist tsconfig.json nodemon.json docs .dockerignore .gitattributes

# ───────── Stage 3: 运行时 ─────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app/backend
LABEL org.opencontainers.image.title="XOi" \
      org.opencontainers.image.description="AI 短剧工厂一体化部署"

RUN npm config set registry https://registry.npmmirror.com/ \
 # 切到阿里云 Debian 源加速 apt
 && { sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
          /etc/apt/sources.list.d/*.sources 2>/dev/null \
     ; sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
          /etc/apt/sources.list 2>/dev/null || true; } \
 # sharp/better-sqlite3/sqlite3 在 glibc linux 上通常有预编译二进制；
 # 装 toolchain 仅作兜底现场编译。
 && apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/yarn.lock ./
# 与构建阶段相同的缓存路径(id 一致可在同机复用)，仅装生产依赖
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn yarn install --production --frozen-lockfile --ignore-optional \
 && yarn cache clean

# 入口脚本：负责把镜像内的“程序与资源资产”同步到数据卷
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# 内置程序与资源资产（assets-seed）：serve/app.js、前端 web 静态站、
# AI 技能包(skills)、模型(models)、厂商配置(vendor)、提示词(modelPrompt)、片尾素材(assets)。
# 这些是不可变的“代码侧”资产；由入口脚本在每次启动时同步到外挂数据卷，
# 既保证首次开箱即用，又能跟随镜像升级自动刷新，且绝不会覆盖用户的
# 数据库(db2.sqlite)/上传资源(oss)/画布(canvases)等创作数据。
COPY --from=backend-build /app/backend/data /app/assets-seed
RUN mkdir -p data

ENV NODE_ENV=prod \
    TZ=Asia/Shanghai

EXPOSE 10588

# tini 作 PID1 正确收割僵尸进程与转发 SIGTERM（优雅关闭 Socket.IO / SQLite）
ENTRYPOINT ["/usr/bin/tini", "--", "/app/backend/docker-entrypoint.sh"]
CMD ["node", "data/serve/app.js"]
