#!/usr/bin/env bash
# =====================================================================
# 积分体系残留门禁（v3.0 P1.5 用）
#
# 目标：把 XOi 的旧积分体系清干净 —— 表、代码、调用点三样都不能剩。
# 这个脚本不修改任何东西，只负责**数清楚还剩多少**，让 P1.5 的清理变成可验证的机械动作。
#
# 用法：
#   bash ops/check-points-residue.sh              # 只报告
#   bash ops/check-points-residue.sh --strict     # 超过基线就退出码 1（CI 用）
#
# 基线会随着清理进度往下调；改基线前请先确认减少的部分是「真的清掉了」。
# =====================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"
STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1

# 当前基线（2026-10-02 首次统计）。清理进度推进后请手动调小。
BASE_IMPORTERS=19
BASE_POINTS_TS=1
BASE_TABLES=7
BASE_BILLING=1

red()   { printf "\033[31m%s\033[0m" "$1"; }
green() { printf "\033[32m%s\033[0m" "$1"; }
dim()   { printf "\033[2m%s\033[0m" "$1"; }

echo ""
echo "══════ 积分体系残留统计 ══════"
echo ""

# 1) 还 import 旧 points 模块的文件（不含 points.ts 自己）
IMPORTERS=$(grep -rl 'from "@/utils/points"' src 2>/dev/null | grep -v 'src/utils/points.ts' | wc -l | tr -d ' ')
echo "1. 仍 import @/utils/points 的文件：$IMPORTERS 个   $(dim "基线 $BASE_IMPORTERS")"
grep -rl 'from "@/utils/points"' src 2>/dev/null | grep -v 'src/utils/points.ts' | sed 's|^src/|     · src/|' | sort

echo ""
# 2) 兼容层本体是否还在
if [ -f src/utils/points.ts ]; then
  PTS=1
  echo "2. 兼容层 src/utils/points.ts：$(red "仍存在")   $(dim "基线 $BASE_POINTS_TS")"
else
  PTS=0
  echo "2. 兼容层 src/utils/points.ts：$(green "已删除")"
fi

echo ""
# 3) initDB 里还定义着几张 o_points_* 表
TABLES=$(grep -oE 'name: "o_points_[a-z_]+"' src/lib/initDB.ts 2>/dev/null | sort -u | wc -l | tr -d ' ')
echo "3. initDB 中仍定义的 o_points_* 表：$TABLES 张   $(dim "基线 $BASE_TABLES")"
grep -oE 'name: "o_points_[a-z_]+"' src/lib/initDB.ts 2>/dev/null | sed 's/name: /     · /' | sort -u

echo ""
# 4) 仍在写 o_user.points 的代码（这是真正的危险项：列根本不存在）
#    注意：必须用 grep -E。macOS 自带的是 BSD grep，不支持 BRE 里的 `\|` 交替，
#    写成 `a\|b` 会静默匹配不到任何东西 —— 这个坑踩过一次了。
WRITE_PAT='points: trx\.raw|"points", *">="|update\(\{ *points'
WRITES=$(grep -rnE "$WRITE_PAT" src 2>/dev/null | grep -v 'src/utils/points.ts' | wc -l | tr -d ' ')
echo "4. 仍直接读写 o_user.points 的位置：$WRITES 处"
grep -rnE "$WRITE_PAT" src 2>/dev/null | grep -v 'src/utils/points.ts' | sed 's|^|     · |' | head -20
if [ "$WRITES" -gt 0 ]; then
  echo "     $(red "⚠ 注意：o_user 表里没有 points 列（见 src/lib/initDB.ts 的 o_user 定义），")"
  echo "     $(red "   这些写入在全新安装的库上会直接报 SQL 错。优先清理。")"
fi

echo ""
# 5) billing.ts 这套「预扣 + 预留 + 退款」引擎是否还在
if [ -f src/utils/billing.ts ]; then
  BILL=1
  echo "5. 预留制计费引擎 src/utils/billing.ts：$(red "仍存在") ($(wc -l < src/utils/billing.ts | tr -d ' ') 行)   $(dim "基线 $BASE_BILLING")"
else
  BILL=0
  echo "5. 预留制计费引擎 src/utils/billing.ts：$(green "已删除")"
fi

echo ""
echo "───────────────────────────────"
echo "清理路线（P1.5）："
echo "  a. 把 20 个文件的 import 从 @/utils/points 换成 @/utils/quota（纯机械替换）"
echo "  b. 删掉 src/utils/points.ts 兼容层"
echo "  c. 处理 src/utils/billing.ts 的调用方，改成调用前软校验 + 网关后扣"
echo "  d. 从 initDB 移除 7 张 o_points_* 表定义（老库另行走 DROP TABLE 迁移）"
echo "  e. 删掉本脚本并更新 PRD"
echo ""

if [ "$STRICT" = "1" ]; then
  if [ "$IMPORTERS" -gt "$BASE_IMPORTERS" ] || [ "$PTS" -gt "$BASE_POINTS_TS" ] || [ "$TABLES" -gt "$BASE_TABLES" ] || [ "$BILL" -gt "$BASE_BILLING" ]; then
    echo "$(red "✗ 残留比基线更多，检查是不是又引回了旧积分体系")"
    exit 1
  fi
  echo "$(green "✓ 残留未超过基线")"
fi
exit 0
