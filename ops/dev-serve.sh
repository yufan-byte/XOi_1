#!/usr/bin/env bash
# =====================================================================
# XOi 本地演示环境（一条命令拉起全部）
#
#   · ops/dev-mock-api.mjs   假后端，实现 XOI 后端的登录/注册/验证码契约
#   · vite preview           伺服 frontend/console 的生产构建，并把 /api 代理到假后端
#
# 用法：
#   bash ops/dev-serve.sh              # 前台运行，Ctrl-C 结束
#   bash ops/dev-serve.sh --daemon     # 交给 macOS launchd 常驻（关掉终端也不停）
#   bash ops/dev-serve.sh --stop       # 停掉常驻实例
#
# 演示账号：demo / demo1234   或   demo@xoi.net / demo1234
# 连续输错 3 次会触发图形验证码闸门。
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.xoi.console.demo"
PORT_API="${PORT_API:-12121}"
PORT_WEB="${PORT_WEB:-4173}"

stop_daemon() {
  launchctl remove "$LABEL" 2>/dev/null && echo "已停止常驻实例 $LABEL" || echo "没有正在运行的常驻实例"
  pkill -f "dev-mock-api.mjs" 2>/dev/null || true
  pkill -f "vite preview" 2>/dev/null || true
}

run_stack() {
  # 假后端
  node "$ROOT/ops/dev-mock-api.mjs" &
  MOCK_PID=$!
  trap 'kill $MOCK_PID 2>/dev/null || true' EXIT
  # 等它就绪
  for _ in $(seq 1 30); do
    curl -s -o /dev/null "http://127.0.0.1:${PORT_API}/api/login/captcha" && break
    sleep 0.2
  done
  echo ""
  echo "=========================================="
  echo "  登录页   http://127.0.0.1:${PORT_WEB}/console/"
  echo "  注册页   http://127.0.0.1:${PORT_WEB}/console/signup"
  echo "  账号     demo / demo1234"
  echo "=========================================="
  echo ""
  # 生产构建的预览（前台，靠它常驻）
  cd "$ROOT/frontend/console"
  exec npx vite preview --port "$PORT_WEB" --host 127.0.0.1 --strictPort
}

case "${1:-}" in
  --stop)
    stop_daemon
    ;;
  --daemon)
    stop_daemon >/dev/null 2>&1 || true
    launchctl submit -l "$LABEL" -- /bin/bash "$ROOT/ops/dev-serve.sh" run
    sleep 6
    echo "已通过 launchd 常驻。打开： http://127.0.0.1:${PORT_WEB}/console/"
    echo "停止： bash ops/dev-serve.sh --stop"
    ;;
  run|"")
    run_stack
    ;;
  *)
    echo "未知参数：$1"; echo "可用：--daemon | --stop | （空 = 前台）"; exit 1 ;;
esac
