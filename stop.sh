#!/usr/bin/env bash
# Stops only the recorded and ownership-verified XOi backend, never by port.
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
STOP_DOCKER=0
for arg in "$@"; do
  case "$arg" in
    --all) STOP_DOCKER=1 ;;
    --purge) echo "为保护商业数据，停止脚本不再提供一键清空数据；请通过审核后的备份/恢复流程处理。"; exit 1 ;;
    *) echo "用法：./stop.sh [--all]"; exit 1 ;;
  esac
done
node "$PROJECT_ROOT/ops/local-service.mjs" stop
if [ "$STOP_DOCKER" -eq 1 ]; then
  docker compose -f "$PROJECT_ROOT/ops/dev-newapi.yml" stop
fi
