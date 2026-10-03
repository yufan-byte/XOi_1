#!/usr/bin/env bash
# =====================================================================
# XOi 本地关闭
#   ./stop.sh        停后端 + 前端（Docker 网关保留，数据不动）
#   ./stop.sh --all  额外停掉 Docker 栈（postgres + new-api，数据卷保留）
#   ./stop.sh --purge 连数据卷一起清空（⚠️ 不可逆：PG 里所有数据都会没）
# =====================================================================
set -u

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$PROJECT_ROOT/.xoi-run"
STOP_DOCKER=0
PURGE=0
for arg in "$@"; do
  case "$arg" in
    --all) STOP_DOCKER=1 ;;
    --purge) STOP_DOCKER=1; PURGE=1 ;;
  esac
done

stop_tree() {
  local pid="$1" child
  kill -0 "$pid" 2>/dev/null || return
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do stop_tree "$child"; done
  kill -TERM "$pid" 2>/dev/null || true
}

wait_gone() {
  local pid="$1"
  for _ in {1..20}; do kill -0 "$pid" 2>/dev/null || return; sleep 0.25; done
  kill -KILL "$pid" 2>/dev/null || true
}

echo "⏹  关闭 XOi 服务..."
for file in "$RUN_DIR/backend.pid" "$RUN_DIR/frontend.pid"; do
  if [ -f "$file" ]; then
    pid="$(cat "$file" 2>/dev/null || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]]; then stop_tree "$pid"; wait_gone "$pid"; fi
    rm -f "$file"
  fi
done

# 兜底清理本项目端口，避免 nodemon/vite 子进程残留；不使用全局 pkill。
for port in 10588 50188; do
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$command" in *"$PROJECT_ROOT"*|*nodemon*|*vite*) stop_tree "$pid"; wait_gone "$pid";; esac
  done
done

rm -f "$RUN_DIR/backend.pid" "$RUN_DIR/frontend.pid"
if lsof -nP -iTCP:10588 -iTCP:50188 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠️  仍有端口占用，请执行：lsof -nP -iTCP:10588 -iTCP:50188 -sTCP:LISTEN"
  exit 1
fi
echo "✅ 后端与前端已完全关闭，子进程和端口均已清理。"

# ---------------------------------------------------------------------
# Docker 栈（可选）：默认保留运行中的网关，避免每次重启都要等容器。
# ---------------------------------------------------------------------
if [ "$STOP_DOCKER" -eq 1 ]; then
  if docker info >/dev/null 2>&1; then
    if [ "$PURGE" -eq 1 ]; then
      echo "⚠️  --purge：停止并删除 new-api / postgres 容器与数据卷（不可逆）..."
      docker compose -f "$PROJECT_ROOT/ops/dev-newapi.yml" down -v
      echo "✅ Docker 栈与数据卷已清空。"
    else
      echo "🐳 停止 Docker 网关栈（数据卷保留，下次 ./start.sh 秒起）..."
      docker compose -f "$PROJECT_ROOT/ops/dev-newapi.yml" stop
      echo "✅ Docker 栈已停止（数据未动；要清空数据用 ./stop.sh --purge）。"
    fi
  else
    echo "ℹ️  Docker daemon 未运行，跳过 Docker 栈清理。"
  fi
else
  echo "ℹ️  Docker 网关（:3000）仍在运行，属预期行为。要一起停用：./stop.sh --all"
fi
