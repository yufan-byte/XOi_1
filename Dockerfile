# syntax=docker/dockerfile:1
# XOi 一体化镜像：管理台/前端构建 → 后端构建 → 运行时精简层
# 构建后单容器即可对外服务（前端静态页 / API / WebSocket / 资源 全在 10588 端口）

# ───────── Stage 0: React 管理台构建 ─────────
FROM node:22-bookworm-slim AS console-build
WORKDIR /app/frontend/console
RUN npm config set registry https://registry.npmjs.org/
COPY frontend/console/package.json frontend/console/package-lock.json ./
RUN --mount=type=cache,id=xoi-console-npm,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY frontend/console/ .
# vite outDir = <console>/../public/console
RUN npm run build

# ───────── Stage 1: Vue 前端构建 ─────────
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
RUN npm config set registry https://registry.npmjs.org/ \
 && npm config set fund false
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,id=xoi-frontend-npm,target=/root/.npm \
    npm ci --no-audit --no-fund
# 无限画布已完整收进 frontend/atelier/upstream；单独安装其依赖后在镜像内构建，
# 不再依赖开发机上的 infinite-canvas-main 或预先提交的静态产物。
COPY frontend/atelier/package.json frontend/atelier/package-lock.json atelier/
RUN --mount=type=cache,id=xoi-atelier-npm,target=/root/.npm \
    cd atelier && npm ci --no-audit --no-fund
COPY frontend/ .
RUN cd atelier && npm run build
# console 同样从源码构建，避免把本机陈旧的 public/console 打进镜像
COPY --from=console-build /app/frontend/public/console public/console
# 生产走同源相对路径（/api）；当前主站约 1 万模块，Node 默认 2GB 堆会在 Rollup 阶段 OOM。
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build-only

# ───────── Stage 2: 后端打包（esbuild bundle）─────────
FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/backend
# 切到阿里云 Debian 源加速 apt（兼容新版 .sources 与传统 sources.list 两种格式）
RUN npm config set registry https://registry.npmjs.org/ \
 && { sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
          /etc/apt/sources.list.d/*.sources 2>/dev/null \
     ; sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
          /etc/apt/sources.list 2>/dev/null || true; } \
 && apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
# 打包阶段需要 devDependencies(tsx/esbuild)，全量安装
RUN --mount=type=cache,id=xoi-backend-build-npm,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY backend/ .
ENV NODE_ENV=prod
RUN npm run build
# svg-captcha 被 esbuild 打进 data/serve 后，__dirname 会解析到 data/serve；补齐它预期的 ../fonts。
RUN mkdir -p data/fonts && cp node_modules/svg-captcha/fonts/Comismsh.ttf data/fonts/Comismsh.ttf

# 把前端产物放进 data/web，由后端静态托管
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
RUN rm -rf data/web && mkdir -p data/web \
 && cp -r /app/frontend/dist/. data/web/

# 清理运行时不需要的源码与开发产物，保留 serve/web/skills/models/vendor/modelPrompt/assets
RUN rm -rf src scripts build dist tsconfig.json nodemon.json docs .dockerignore .gitattributes

# ───────── Stage 3: 运行时 ─────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app/backend
LABEL org.opencontainers.image.title="XOi" \
      org.opencontainers.image.description="AI 短剧工厂一体化部署"

RUN npm config set registry https://registry.npmjs.org/ \
 # 切到阿里云 Debian 源加速 apt
 && { sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
          /etc/apt/sources.list.d/*.sources 2>/dev/null \
     ; sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
          /etc/apt/sources.list 2>/dev/null || true; } \
 # sharp/better-sqlite3/sqlite3 在 glibc linux 上通常有预编译二进制；
 # 装 toolchain 仅作兜底现场编译。
 && apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates tini gosu \
 && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
# 独立缓存避免 BuildKit 并行阶段互相破坏；缓存挂载不写入最终镜像，无需 npm cache clean。
RUN --mount=type=cache,id=xoi-backend-runtime-npm,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

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
