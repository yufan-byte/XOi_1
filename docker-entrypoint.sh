#!/bin/sh
# 容器启动前准备：把镜像内的“程序/资源资产”刷新到外挂数据卷，
# 同时严格保留用户的创作数据(db2.sqlite 数据库、oss 上传资源、canvases 画布等)。
# 这样首次启动开箱即用，后续重建容器也能自动带上最新版 app.js/web/skills。
set -e

SEED_DIR="/app/assets-seed"
DATA_DIR="/app/backend/data"

mkdir -p "${DATA_DIR}"

# 仅这些“代码侧”资产随镜像版本同步；其余任何路径都不触碰。
# 每次（重新）启动都强制对齐：既完成首启播种，又能在重建/升级后带上新版程序文件。
for d in serve web skills models modelPrompt assets vendor fonts; do
  if [ -d "${SEED_DIR}/${d}" ]; then
    echo "[entrypoint] 同步资产 → ${d}"
    # 经 .tmp 中转后原子替换，避免半截覆盖状态下进程读取到损坏资产
    rm -rf "${DATA_DIR}/${d}.tmp"
    cp -a "${SEED_DIR}/${d}" "${DATA_DIR}/${d}.tmp"
    rm -rf "${DATA_DIR}/${d}"
    mv "${DATA_DIR}/${d}.tmp" "${DATA_DIR}/${d}"
  fi
done

echo "[entrypoint] 资产就绪，启动服务…"
exec "$@"
