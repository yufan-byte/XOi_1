#!/usr/bin/env bash
# =====================================================================
# 本地测试用的 PostgreSQL（决策 D2：业务库与 new-api 同库）
# =====================================================================
# 为什么要有这个脚本：
#   项目原来的业务库是 SQLite 文件（db2.sqlite），开箱即用；改成 PG 之后
#   本地必须先有一个库才能启动后端。这个脚本用 Homebrew 的 postgresql@16
#   在仓库内建一个**隔离的**测试集群（端口 5433，数据在 .local/pg），
#   不碰系统默认的 5432，也不会注册成开机自启的服务。
#
# 用法：
#   bash ops/dev-pg.sh start     启动（首次会自动 initdb + 建库）
#   bash ops/dev-pg.sh stop      停止
#   bash ops/dev-pg.sh status    状态
#   bash ops/dev-pg.sh reset     删库重建（清空所有数据）
#   bash ops/dev-pg.sh psql      连进去看看
#
# 连接串（backend/.env 里用这个）：
#   postgres://xoi@127.0.0.1:5433/new-api
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@16/bin}"
DATA="$ROOT/.local/pg"
LOG="$ROOT/.local/pg.log"
PORT="${XOI_DEV_PG_PORT:-5433}"
DB="new-api"
USER_NAME="xoi"

if [ ! -x "$PGBIN/pg_ctl" ]; then
  echo "找不到 $PGBIN/pg_ctl。先装：brew install postgresql@16" >&2
  exit 1
fi

init() {
  if [ -d "$DATA" ]; then return 0; fi
  echo "首次初始化测试集群 → $DATA"
  mkdir -p "$ROOT/.local"
  "$PGBIN/initdb" -D "$DATA" -U "$USER_NAME" -A trust --encoding=UTF8 --locale=en_US.UTF-8 >/dev/null
}

case "${1:-start}" in
  start)
    init
    if "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      echo "已经在跑（端口 $PORT）"
    else
      "$PGBIN/pg_ctl" -D "$DATA" \
        -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" \
        -l "$LOG" start
    fi
    if ! "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -lqt | cut -d'|' -f1 | grep -qw "$DB"; then
      "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" "$DB"
      echo "已建库：$DB"
    fi
    echo "就绪 → postgres://$USER_NAME@127.0.0.1:$PORT/$DB"
    ;;
  stop)
    "$PGBIN/pg_ctl" -D "$DATA" stop -m fast || true
    ;;
  status)
    "$PGBIN/pg_ctl" -D "$DATA" status || true
    "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d "$DB" -tAc \
      "select '业务表 ' || count(*) || ' 张' from pg_tables where schemaname='public'" 2>/dev/null || true
    ;;
  reset)
    "$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 || true
    rm -rf "$DATA"
    "$0" start
    ;;
  psql)
    "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d "$DB"
    ;;
  *)
    echo "用法：bash ops/dev-pg.sh {start|stop|status|reset|psql}" >&2
    exit 1
    ;;
esac
