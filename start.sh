#!/usr/bin/env bash
set -u

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$PROJECT_ROOT/.xoi-run"
mkdir -p "$RUN_DIR"

if { [ -f "$RUN_DIR/backend.pid" ] && kill -0 "$(cat "$RUN_DIR/backend.pid")" 2>/dev/null; } ||
   { [ -f "$RUN_DIR/frontend.pid" ] && kill -0 "$(cat "$RUN_DIR/frontend.pid")" 2>/dev/null; }; then
  echo "XOi 已在运行中，如需重启请先执行 ./stop.sh"
  exit 1
fi

rm -f "$RUN_DIR/backend.pid" "$RUN_DIR/frontend.pid"

for port in 10588 50188; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "错误：端口 $port 已被占用，请先执行 ./stop.sh 或检查占用进程。"
    exit 1
  fi
done

echo "🚀 启动 XOi 服务..."
(
  cd "$PROJECT_ROOT/backend" || exit 1
  exec npm run dev >>"$RUN_DIR/backend.log" 2>&1
) &
echo $! > "$RUN_DIR/backend.pid"

for _ in {1..30}; do
  curl -fsS http://localhost:10588/api/login/captcha >/dev/null 2>&1 && break
  sleep 1
done
if ! curl -fsS http://localhost:10588/api/login/captcha >/dev/null 2>&1; then
  echo "后端启动失败，请查看 $RUN_DIR/backend.log"
  "$PROJECT_ROOT/stop.sh"
  exit 1
fi

(
  cd "$PROJECT_ROOT/frontend" || exit 1
  exec npm run dev >>"$RUN_DIR/frontend.log" 2>&1
) &
echo $! > "$RUN_DIR/frontend.pid"

for _ in {1..15}; do
  curl -fsS http://localhost:50188/ >/dev/null 2>&1 && break
  sleep 1
done
if ! curl -fsS http://localhost:50188/ >/dev/null 2>&1; then
  echo "前端启动失败，请查看 $RUN_DIR/frontend.log"
  "$PROJECT_ROOT/stop.sh"
  exit 1
fi

echo "✅ XOi 已启动：前端 http://localhost:50188，后端 http://localhost:10588"
echo "关闭服务请执行：./stop.sh"
