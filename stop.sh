#!/usr/bin/env bash
set -u

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$PROJECT_ROOT/.xoi-run"

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
echo "✅ XOi 已完全关闭，子进程和端口均已清理。"
