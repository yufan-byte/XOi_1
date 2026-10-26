#!/usr/bin/env bash
# XOi independent single-origin local service. No foreign process adoption.
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
SKIP_DOCKER=0
BUILD_WEB=0
FOREGROUND=0
for arg in "$@"; do
  case "$arg" in
    --skip-docker) SKIP_DOCKER=1 ;;
    --build) BUILD_WEB=1 ;;
    --foreground) FOREGROUND=1 ;;
    *) echo "用法：./start.sh [--skip-docker] [--build] [--foreground]"; exit 1 ;;
  esac
done
if [ "$SKIP_DOCKER" -eq 0 ]; then
  docker info >/dev/null 2>&1 || { echo "请先启动 Docker，或使用 --skip-docker。"; exit 1; }
  docker compose -f "$PROJECT_ROOT/ops/dev-newapi.yml" up -d
  curl -fsS --max-time 10 http://127.0.0.1:3000/api/status >/dev/null || { echo "网关尚未就绪，请稍后重试。"; exit 1; }
fi
if [ "$BUILD_WEB" -eq 1 ] || [ ! -f "$PROJECT_ROOT/backend/data/web/index.html" ]; then
  (cd "$PROJECT_ROOT/frontend" && npm run build:all && node scripts/sync-backend-web.mjs)
fi
if [ "$FOREGROUND" -eq 1 ]; then
  exec node "$PROJECT_ROOT/ops/local-service.mjs" start --foreground
fi
exec node "$PROJECT_ROOT/ops/local-service.mjs" start
