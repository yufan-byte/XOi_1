#!/usr/bin/env bash
# =====================================================================
# XOi 本地一键启动
#   ./start.sh              启动全部：Docker(PG+new-api 网关) → 后端 → 前端
#   ./start.sh --skip-docker 跳过 Docker 栈（网关已在别处跑时用）
# 日志与 pid：.xoi-run/
# =====================================================================
set -u

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$PROJECT_ROOT/.xoi-run"
SKIP_DOCKER=0
[[ "${1:-}" == "--skip-docker" ]] && SKIP_DOCKER=1
mkdir -p "$RUN_DIR"

if { [ -f "$RUN_DIR/backend.pid" ] && kill -0 "$(cat "$RUN_DIR/backend.pid")" 2>/dev/null; } ||
   { [ -f "$RUN_DIR/frontend.pid" ] && kill -0 "$(cat "$RUN_DIR/frontend.pid")" 2>/dev/null; }; then
  # 不能只相信 pid：nodemon 子进程崩溃后父进程仍活着，但端口已经消失，旧逻辑会永远误报“已运行”。
  if lsof -nP -iTCP:10588 -sTCP:LISTEN >/dev/null 2>&1 &&
     lsof -nP -iTCP:50188 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "XOi 已在运行中，如需重启请先执行 ./stop.sh"
    exit 1
  fi
  echo "♻️  检测到无监听端口的残留进程，先自动清理再启动..."
  "$PROJECT_ROOT/stop.sh" >/dev/null 2>&1 || true
fi

rm -f "$RUN_DIR/backend.pid" "$RUN_DIR/frontend.pid"

for port in 10588 50188; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "错误：端口 $port 已被占用，请先执行 ./stop.sh 或检查占用进程。"
    exit 1
  fi
done

# ---------------------------------------------------------------------
# 第 0 步：Docker 栈（postgres 5434 + new-api 网关 3000）
# XOi 业务库与 new-api 共用同一个 PG（决策 D2），没有它后端起得来也全盘不可用。
# ---------------------------------------------------------------------
if [ "$SKIP_DOCKER" -eq 1 ]; then
  echo "⏭  按参数跳过 Docker 栈（请确认 new-api 网关已在别处运行）"
else
  if ! docker info >/dev/null 2>&1; then
    echo "🐳 Docker daemon 未运行，尝试启动 Docker Desktop..."
    open -a Docker 2>/dev/null || { echo "错误：Docker 不可用。请手动启动 Docker Desktop，或用 ./start.sh --skip-docker"; exit 1; }
    ok=0
    for _ in {1..60}; do
      docker info >/dev/null 2>&1 && { ok=1; break; }
      sleep 1
    done
    [ "$ok" -eq 1 ] || { echo "错误：等待 Docker daemon 超时（60s）。"; exit 1; }
    echo "   Docker daemon 已就绪"
  fi
  echo "🐳 启动 new-api 网关 + PostgreSQL（ops/dev-newapi.yml）..."
  docker compose -f "$PROJECT_ROOT/ops/dev-newapi.yml" up -d
  echo -n "   等待网关就绪 "
  for _ in {1..60}; do
    curl -fsS http://localhost:3000/api/status >/dev/null 2>&1 && break
    echo -n "."; sleep 1
  done
  echo
  if ! curl -fsS http://localhost:3000/api/status >/dev/null 2>&1; then
    echo "错误：new-api 网关未就绪，查看日志：docker compose -f ops/dev-newapi.yml logs new-api"
    exit 1
  fi
  echo "   网关已就绪：http://localhost:3000（PG: 127.0.0.1:5434）"
fi

# ---------------------------------------------------------------------
# 第 1 步：后端（10588，nodemon 热更新）
# ---------------------------------------------------------------------
echo "🚀 启动后端..."
(
  cd "$PROJECT_ROOT/backend" || exit 1
  # 后端要直连上游供应商与本机网关，清掉终端里可能存在的代理变量
  env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
    npm run dev >>"$RUN_DIR/backend.log" 2>&1
) &
echo $! > "$RUN_DIR/backend.pid"

echo -n "   等待后端就绪 "
for _ in {1..45}; do
  curl -fsS http://localhost:10588/api/healthz >/dev/null 2>&1 && break
  echo -n "."; sleep 1
done
echo
if ! curl -fsS http://localhost:10588/api/healthz >/dev/null 2>&1; then
  echo "后端启动失败，请查看 $RUN_DIR/backend.log"
  "$PROJECT_ROOT/stop.sh"
  exit 1
fi
echo "   后端已就绪：http://localhost:10588"

# ---------------------------------------------------------------------
# 第 2 步：前端 dev（vite，50188）
# ---------------------------------------------------------------------
echo "🚀 启动前端..."
(
  cd "$PROJECT_ROOT/frontend" || exit 1
  exec npm run dev >>"$RUN_DIR/frontend.log" 2>&1
) &
echo $! > "$RUN_DIR/frontend.pid"

echo -n "   等待前端就绪 "
for _ in {1..20}; do
  curl -fsS http://localhost:50188/ >/dev/null 2>&1 && break
  echo -n "."; sleep 1
done
echo
if ! curl -fsS http://localhost:50188/ >/dev/null 2>&1; then
  echo "前端启动失败，请查看 $RUN_DIR/frontend.log"
  "$PROJECT_ROOT/stop.sh"
  exit 1
fi

echo
echo "✅ XOi 全部就绪："
echo "   主站       http://localhost:50188"
echo "   后端 API   http://localhost:10588"
echo "   网关后台   http://localhost:3000"
echo "   项目列表   http://localhost:50188/#/project"
echo "关闭服务请执行：./stop.sh（加 --all 连同 Docker 网关一起停）"
