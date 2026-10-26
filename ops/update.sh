#!/usr/bin/env bash
# XOi 服务器更新脚本（管理后台「版本与更新」触发）
# 用法：bash ops/update.sh <tag>
#
# 前提（部署文档《部署方案总纲》）：
#   · 服务器上以 git 仓库方式部署（有 .git）；
#   · 后端由守护进程拉起（ops/local-service.mjs start / systemd），程序退出后自动重启；
#   · XOI_UPDATE_MODE=git-script 已设置。
#
# 安全：目标 tag 由管理后台传参，本脚本再做一道格式白名单；不接收任何其他参数。

set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

TARGET="${1:-}"
if ! [[ "$TARGET" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$ ]]; then
  echo "[update] 目标版本号格式无效：$TARGET"
  exit 1
fi

echo "[update] ===== 开始更新到 $TARGET ====="
echo "[update] 当前提交：$(git rev-parse --short HEAD 2>/dev/null || echo '未知')"

echo "[update] 1/5 拉取远端标签…"
git fetch --tags --prune origin

if ! git rev-parse -q --verify "refs/tags/$TARGET" >/dev/null; then
  echo "[update] 远端不存在标签 $TARGET，终止（未做任何变更）"
  exit 1
fi

echo "[update] 2/5 切换到 $TARGET…"
git checkout -q "refs/tags/$TARGET"

echo "[update] 3/5 安装依赖（npm ci，可能需要几分钟）…"
(cd backend && npm ci --omit=dev --no-audit --no-fund)
(cd frontend && npm ci --no-audit --no-fund)
(cd frontend/console && npm ci --no-audit --no-fund)
(cd frontend/atelier && npm ci --no-audit --no-fund)

echo "[update] 4/5 构建三份前端 + 后端产物…"
(cd frontend && npm run build:all)
(cd backend && npm run build)

echo "[update] 5/5 重启后端（由守护进程拉起新版本）…"
# 平滑退出当前进程；local-service 守护 / systemd 会自动拉起。更新期间请求由反代返回短暂 502。
pkill -f "tsx src/app.ts" 2>/dev/null || true
pkill -f "node data/serve/app.js" 2>/dev/null || true
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "^xoi.service"; then
  systemctl restart xoi || true
fi

echo "[update] ===== 更新脚本执行完毕。等待守护进程拉起新版本后，请到后台核对版本号与 readyz。====="
