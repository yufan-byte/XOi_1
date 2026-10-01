#!/usr/bin/env bash
# clean-orphans.sh — 回收 backend 开发态累积成山的孤儿 tsx/nodemon 进程
#
# 根因:nodemon 被 Ctrl-C / SIGHUP / IDE 关终端强退时,自身收到信号优雅退出,
#      却没能把它经 `--exec tsx` 通过 `/bin/sh -c` spawn 出来的工作子带走,
#      孩子瞬间 ppid=1 被 launchd 收养、既不死也不占端口、长年堆积。
# 本脚仅清除这些残留,严格保全当前真正提供服务的 listener 及其整条祖系守护链。
#
# 用法:
#     cd backend && bash scripts/clean-orphans.sh                 # 默认端口 10588
#     cd backend && KEEP_PORT=10589 bash scripts/clean-orphans.sh  # 其它端口场景
set -u

PROJ_KEY="Jing_luo/backend"
PORT="${KEEP_PORT:-10588}"
export LC_ALL=C

CF=$(mktemp); CFS=$(mktemp); KF=$(mktemp); KFS=$(mktemp)
trap 'rm -f "$CF" "$CFS" "$KF" "$KFS"' EXIT

echo "== STEP A · 枚举候选 =="
ps -axo pid=,command= \
    | grep "$PROJ_KEY" \
    | grep -E 'src/app\.ts|data/serve/app\.js|node_modules/.bin/(cross-env|nodemon)' \
    | grep -v grep | awk '{print $1}' > "$CF"
CAND_N=$(wc -l < "$CF" | tr -d ' ')
echo "backend 相关总候选 = $CAND_N 个"

echo ""
echo "== STEP B · 锁定白名单(端口 $PORT 现役者及其祖系)=="
LPID=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)
if [ -z "${LPID:-}" ]; then
    echo "[ABORT] 当前没有进程监听 ${PORT} —— 为防误伤放弃操作。请确认服务是否已启动。"
    exit 7
fi
cur="$LPID"; depth=0
while [ -n "$cur" ] && [ "$cur" != "0" ] && [ "$cur" != "1" ]; do
    printf '%s\n' "$cur" >> "$KF"
    pp=$(ps -p "$cur" -o ppid= 2>/dev/null | tr -d ' ')
    case "$pp" in '' | '0' | '1') break ;; esac
    cur="$pp"; depth=$((depth + 1))
    [ "$depth" -ge 16 ] && break
done
echo "现役 listener=$LPID ; 受保护祖系($(wc -l <$KF|tr -d ' ')层): $(tr '\n' ' ' <"$KF")"

sort -nu "$KF" > "$KFS"
sort -nu "$CF" > "$CFS"
TK=$(comm -23 "$CFS" "$KFS")

N_KILL=$(printf '%s\n' $TK | wc -w | tr -d ' ')
echo ""
echo "== STEP C · 待终结清单($N_KILL 条),前8预览:"
printf '%s %s %s %s %s %s %s %s\n' $(printf '%s\n' $TK | head -8)

FAIL=""
if [ "$N_KILL" -gt 0 ]; then
    # 只对“下单瞬间”拍下的 TK 快照施以 TERM→KILL 两轮；绝不在中途重扫候选！
    # 否则:nodemon 受到首次打击后会 respawn 全新的工作子,PID 既不在白名单也不在旧快照,
    # 二次 comm 差集就会把它们判作新孤儿一并干掉 → 连锁反应直到连有效祖系都被端掉(实测翻车).
    FAIL=""
    for sig in TERM KILL; do
        for x in $TK; do
            kill -$sig "$x" 2>/dev/null || {
                [ "$sig" = "KILL" ] && FAIL="${FAIL}${x} "
            }
        done
        sleep .8
    done
fi

sleep 1.5

REM_APPTS=$(ps -axo command= | grep Jing_luo/backend/src/app.ts | grep -v grep | wc -l | tr -d ' ')
REMANDON_TOT=$(ps -axo pid=,command= \
    | grep "$PROJ_KEY" \
    | grep -E 'src/app\.ts|data/serve/app\.js|node_modules/.bin/(cross-env|nodemon)' \
    | grep -v grep | wc -l | tr -d ' ')
LPID_AFTER=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)
LCODE=$(curl -so/dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:$PORT/api/login/login -X POST -H ct -d '{}' 2>/dev/null)
CCODE=$(curl -so/dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:$PORT/api/pay/channels 2>/dev/null)
TCODE=$(curl -so/dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:$PORT/api/pay/_dev/trigger/x 2>/dev/null)

echo ""
echo "== STEP D · 终局状态 =="
printf '%-34s %s\n' "残余 backend 相关进程总数 :" "$REMANDON_TOT  (期望≈白名单层数)"
printf '%-34s %s\n' "其中 src/app.ts 形态      :" "$REM_APPTS"
if [ "$LPID_AFTER" = "$LPID" ]; then
    LSTATE="YES ($LPID 未被动摇)"
elif [ -z "${LPID_AFTER:-}" ]; then
    LSTATE="NO 已无人监听 ${PORT}"
else
    LSTATE="NO 已换主为新 PID=$LPID_AFTER"
fi
printf '%-34s %s\n' "现役 listener 是否仍在    :" "$LSTATE"
[ -n "$FAIL" ] && printf '%-34s %s\n' "无法 KILL 的 PID         :" "$FAIL"
printf '\n-- 服务可用性探针 --\n'
printf 'login/login -> %s  channels -> %s  _dev/trigger -> %s\n' "$LCODE" "$CCODE" "$TCODE"
