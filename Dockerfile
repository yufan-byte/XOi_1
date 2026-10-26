# syntax=docker/dockerfile:1
# XOi 一体化镜像：管理台/前端构建 → 后端构建 → 运行时精简层
# 构建后单容器即可对外服务（默认12121）；程序与可变用户数据分离。

# ───────── Stage 0: React 管理台构建 ─────────
FROM node:22-bookworm-slim AS console-build
WORKDIR /app/frontend/console
RUN npm config set registry https://registry.npmjs.org/
COPY frontend/console/package.json frontend/console/package-lock.json ./
RUN --mount=type=cache,id=xoi-console-npm,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY frontend/console/ .
COPY shared/ /app/shared/
# console/src 有一批引用逃出 console 目录，构建前必须存在（否则 vite:css / 资源解析 ENOENT）：
#   globals.css -> frontend/shared/styles/overlay-motion.css
#   one-stop/adapters/provider-logos.ts -> frontend/src/assets/providers/*.webp
COPY frontend/shared/ /app/frontend/shared/
COPY frontend/src/assets/providers/ /app/frontend/src/assets/providers/
COPY frontend/src/utils/points.ts /app/frontend/src/utils/points.ts
COPY frontend/src/utils/dailySpend.ts /app/frontend/src/utils/dailySpend.ts
COPY frontend/src/assets/XOI_logo.png /app/frontend/src/assets/XOI_logo.png
COPY frontend/scripts/sync-platform-brand.mjs /app/frontend/scripts/sync-platform-brand.mjs
COPY frontend/public/brand/ /app/frontend/public/brand/
# vite outDir = <console>/../public/console
RUN npm run build && npm run build:one-stop

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
# Canvas/main import the shared billing/director contracts from /app/shared.
COPY shared/ /app/shared/
RUN cd atelier && npm run build
# console 同样从源码构建，避免把本机陈旧的 public/console 打进镜像
COPY --from=console-build /app/frontend/public/console public/console
COPY --from=console-build /app/frontend/public/one-stop public/one-stop
# 生产走同源相对路径（/api）；当前主站约 1 万模块，Node 默认 2GB 堆会在 Rollup 阶段 OOM。
RUN node scripts/sync-platform-brand.mjs --check && NODE_OPTIONS=--max-old-space-size=4096 npm run build-only

# ───────── Stage 2: 后端打包（esbuild bundle）─────────
FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/backend
# 切 Debian 源加速（中国大陆默认阿里云）；源不可达时自动回退官方源，避免整轮构建卡死。
# 想强制用官方源：--build-arg APT_MIRROR=
ARG APT_MIRROR=mirrors.aliyun.com
RUN <<'EOF'
set -eu
npm config set registry https://registry.npmjs.org/
swap() {
  [ -n "${APT_MIRROR:-}" ] || { echo ">>> APT_MIRROR 为空，使用官方源"; return 0; }
  for f in /etc/apt/sources.list.d/*.sources /etc/apt/sources.list; do
    [ -f "$f" ] || continue
    sed -i "s|$1|$2|g" "$f"
  done
}
swap deb.debian.org "${APT_MIRROR}"
swap security.debian.org "${APT_MIRROR}"
if ! apt-get update -o Acquire::Retries=2 -o Acquire::http::Timeout=25; then
  echo ">>> APT_MIRROR=${APT_MIRROR} 不可达，回退官方源重试"
  swap "${APT_MIRROR}" deb.debian.org
  apt-get update -o Acquire::Retries=3
fi
apt-get install -y --no-install-recommends \
  -o Acquire::Retries=6 -o Acquire::http::Timeout=60 \
  python3 make g++
rm -rf /var/lib/apt/lists/*
EOF
COPY backend/package.json backend/package-lock.json ./
# 打包阶段需要 devDependencies(tsx/esbuild)，全量安装
RUN --mount=type=cache,id=xoi-backend-build-npm,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY backend/ .
COPY shared/ /app/shared/
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

ARG APT_MIRROR=mirrors.aliyun.com
RUN <<'EOF'
set -eu
npm config set registry https://registry.npmjs.org/
swap() {
  [ -n "${APT_MIRROR:-}" ] || { echo ">>> APT_MIRROR 为空，使用官方源"; return 0; }
  for f in /etc/apt/sources.list.d/*.sources /etc/apt/sources.list; do
    [ -f "$f" ] || continue
    sed -i "s|$1|$2|g" "$f"
  done
}
swap deb.debian.org "${APT_MIRROR}"
swap security.debian.org "${APT_MIRROR}"
if ! apt-get update -o Acquire::Retries=2 -o Acquire::http::Timeout=25; then
  echo ">>> APT_MIRROR=${APT_MIRROR} 不可达，回退官方源重试"
  swap "${APT_MIRROR}" deb.debian.org
  apt-get update -o Acquire::Retries=3
fi
# sharp/better-sqlite3 在 glibc linux 上通常有预编译二进制；
# 装 toolchain 仅作兜底现场编译（预编译包拉不到时 npm 会退回源码编译）。
apt-get install -y --no-install-recommends \
  -o Acquire::Retries=6 -o Acquire::http::Timeout=60 \
  python3 make g++ ca-certificates tini gosu ffmpeg
rm -rf /var/lib/apt/lists/*
EOF

COPY backend/package.json backend/package-lock.json ./
# 独立缓存避免 BuildKit 并行阶段互相破坏；缓存挂载不写入最终镜像，无需 npm cache clean。
RUN --mount=type=cache,id=xoi-backend-runtime-npm,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# 入口脚本只补齐缺失的可编辑资源，不向数据卷写程序。
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Immutable program: never hidden/overwritten by a persistent data volume.
COPY --from=backend-build /app/backend/data/serve /app/release/serve
COPY --from=backend-build /app/backend/data/web /app/release/web
COPY --from=backend-build /app/backend/data/fonts /app/release/fonts
COPY --from=backend-build /app/backend/data/skills /app/assets-seed/skills
COPY --from=backend-build /app/backend/data/models /app/assets-seed/models
COPY --from=backend-build /app/backend/data/vendor /app/assets-seed/vendor
COPY --from=backend-build /app/backend/data/modelPrompt /app/assets-seed/modelPrompt
COPY --from=backend-build /app/backend/data/assets /app/assets-seed/assets
ARG XOI_RELEASE_ID=unversioned
RUN mkdir -p data

ENV NODE_ENV=prod \
    TZ=Asia/Shanghai \
    PORT=12121 \
    XOI_RELEASE_DIR=/app/release \
    XOI_RELEASE_ID=${XOI_RELEASE_ID}

EXPOSE 12121

# tini forwards SIGTERM; application draining remains necessary for long tasks.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/backend/docker-entrypoint.sh"]
CMD ["node", "/app/release/serve/app.js"]
