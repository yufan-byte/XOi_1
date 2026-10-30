#!/usr/bin/env bash
# XOi 服务器一次性初始化（在服务器上以 root 运行）
# =====================================================================
#  作用：铺好 /opt/xoi/deploy（编排文件 + 随机密钥 .env），并给出下一步命令。
#  不做：不启动容器、不改防火墙、不动系统服务 —— 这些步骤在文档里手工确认。
#
#  用法：
#    上传目录到服务器后执行：
#      bash bootstrap.sh --domain studio.example.com --image xoi:20261026-r1
#    ★ 还没有域名？--domain 直接填公网 IP（如 39.96.61.15），会生成
#      XOI_ALLOWED_ORIGINS=https://39.96.61.15；此时必须自签证书才能走 HTTPS
#      （生产闸门只认 https origin）。详见 docs/宝塔部署-仅IP自签证书.md
#    起容器后同步反向代理来源 IP（可选但推荐）：
#      bash bootstrap.sh --sync-trust-proxy
#    2G 内存机器建议同时建 2G swap（可选）：
#      bash bootstrap.sh --with-swap
#    想换目录（默认 /opt/xoi/deploy 与 /opt/xoi/data）：
#      --dir /www/wwwroot/xoi/deploy --data-dir /www/wwwroot/xoi/data
# =====================================================================
set -euo pipefail

DEPLOY_DIR="/opt/xoi/deploy"
DATA_DIR="/opt/xoi/data"
DOMAIN=""
IMAGE=""
SYNC_TRUST_PROXY=0
WITH_SWAP=0

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --image) IMAGE="${2:-}"; shift 2 ;;
    --dir) DEPLOY_DIR="${2:-}"; shift 2 ;;
    --data-dir) DATA_DIR="${2:-}"; shift 2 ;;
    --sync-trust-proxy) SYNC_TRUST_PROXY=1; shift ;;
    --with-swap) WITH_SWAP=1; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "未知参数：$1（--help 看用法）" >&2; exit 1 ;;
  esac
done

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[失败] %s\033[0m\n' "$*" >&2; exit 1; }

# ── 模式二：把反向代理来源 IP 写进 .env（宿主机 Nginx → 容器看到的来源）──
if [ "$SYNC_TRUST_PROXY" -eq 1 ]; then
  [ -f "$DEPLOY_DIR/.env" ] || die "找不到 $DEPLOY_DIR/.env，先跑一次初始化"
  command -v docker >/dev/null 2>&1 || die "未找到 docker"
  GW=$(docker network inspect xoi_prod_net -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)
  [ -n "$GW" ] || die "找不到 xoi_prod_net 网络，先执行 compose up -d（至少启动 postgres/new-api）"
  # 用 | 作分隔符，IP 里有 . 无需转义
  if grep -q '^XOI_TRUST_PROXY=' "$DEPLOY_DIR/.env"; then
    sed -i "s|^XOI_TRUST_PROXY=.*|XOI_TRUST_PROXY=$GW|" "$DEPLOY_DIR/.env"
  else
    printf 'XOI_TRUST_PROXY=%s\n' "$GW" >> "$DEPLOY_DIR/.env"
  fi
  echo "已写入 XOI_TRUST_PROXY=$GW（重启 xoi 后生效：docker compose ... up -d --no-deps xoi）"
  exit 0
fi

# ── 权限与依赖检查 ──
[ "$(id -u)" = "0" ] || die "请用 root 运行（sudo bash $0 ...）"
command -v docker >/dev/null 2>&1 || die "未找到 docker：先在宝塔『软件商店』安装 Docker，或参考文档第 2 步"
docker compose version >/dev/null 2>&1 || die "docker compose（v2 插件）不可用：宝塔 Docker 一般自带；或用 docker-compose（把文档里的 docker compose 换成 docker-compose）"
[ -n "$DOMAIN" ] || die "缺少 --domain，例如 --domain studio.example.com"
[ -n "$IMAGE" ] || die "缺少 --image，例如 --image xoi:20261026-r1"

case "$DOMAIN" in
  *://*|*/*) die "域名不要带 https:// 或路径，只写 studio.example.com（没有域名就填公网 IP）" ;;
esac

# 镜像是否已在宿主机（没导入不算错，只是提醒）
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "[提醒] 本机还没有镜像 $IMAGE —— 记得先 docker load（见文档第 5 步）"
fi

# ── 目录与编排文件 ──
say "准备目录 $DEPLOY_DIR 与数据目录 $DATA_DIR"
mkdir -p "$DEPLOY_DIR" "$DATA_DIR"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$DEPLOY_DIR/compose.prod.yml" ]; then
  cp "$SRC_DIR/compose.prod.example.yml" "$DEPLOY_DIR/compose.prod.yml"
  echo "已生成 compose.prod.yml（来自模板）"
else
  echo "compose.prod.yml 已存在，保留不动"
fi
cp -f "$SRC_DIR/compose.2c2g.override.yml" "$DEPLOY_DIR/compose.2c2g.override.yml"

# 自定义 --data-dir 时同步改挂载点（模板默认 /opt/xoi/data，不改就挂到旧路径上）
if [ "$DATA_DIR" != "/opt/xoi/data" ] && grep -q '/opt/xoi/data:/app/backend/data' "$DEPLOY_DIR/compose.prod.yml"; then
  sed -i "s|/opt/xoi/data:/app/backend/data|${DATA_DIR}:/app/backend/data|" "$DEPLOY_DIR/compose.prod.yml"
  echo "已把 xoi 数据挂载改为 $DATA_DIR"
fi

# ── .env：绝不覆盖已有文件（避免把在用的密钥冲掉）──
if [ -f "$DEPLOY_DIR/.env" ]; then
  die "$DEPLOY_DIR/.env 已存在，为防误覆盖已停止。要重新生成请先手工备份并移走旧 .env"
fi

say "生成随机密钥并写入 .env"
PG_PW=$(openssl rand -hex 24)
SESS=$(openssl rand -hex 24)
CRYPTO=$(openssl rand -hex 24)
ADMIN_PW=$(openssl rand -hex 12)
REL_TAG="${IMAGE##*:}"

cp "$SRC_DIR/production.env.example" "$DEPLOY_DIR/.env"

set_kv() {  # set_kv KEY VALUE  只改已存在的键，避免手滑造出重复键
  local k="$1" v="$2"
  if grep -q "^${k}=" "$DEPLOY_DIR/.env"; then
    # 值里可能有 / & |，用 awk 整行替换最稳
    awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' \
      "$DEPLOY_DIR/.env" > "$DEPLOY_DIR/.env.tmp" && mv "$DEPLOY_DIR/.env.tmp" "$DEPLOY_DIR/.env"
  else
    printf '%s=%s\n' "$k" "$v" >> "$DEPLOY_DIR/.env"
  fi
}

set_kv POSTGRES_PASSWORD "$PG_PW"
set_kv NEWAPI_SESSION_SECRET "$SESS"
set_kv NEWAPI_CRYPTO_SECRET "$CRYPTO"
set_kv XOI_ADMIN_PASSWORD "$ADMIN_PW"
set_kv XOI_IMAGE "$IMAGE"
set_kv XOI_RELEASE_ID "$REL_TAG"
set_kv XOI_ALLOWED_ORIGINS "https://$DOMAIN"
set_kv NEWAPI_IMAGE "calciumion/new-api:latest"
set_kv NEWAPI_ADMIN_TOKEN "REPLACE_AFTER_GATEWAY_INITIALIZATION"
set_kv XOI_TRUST_PROXY ""
# 让 compose 自动叠加 2c2g 限内存变体：以后直接 docker compose up -d 即可，不用每次带 -f
if ! grep -q '^COMPOSE_FILE=' "$DEPLOY_DIR/.env"; then
  printf 'COMPOSE_FILE=compose.prod.yml:compose.2c2g.override.yml\n' >> "$DEPLOY_DIR/.env"
fi
chmod 600 "$DEPLOY_DIR/.env"

# ── 可选：2G swap（只在明确要求时动系统）──
if [ "$WITH_SWAP" -eq 1 ]; then
  if [ -f /swapfile ]; then
    echo "/swapfile 已存在，跳过"
  else
    say "创建 2G swap（/swapfile）"
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "swap 已启用：$(free -h | awk '/Swap/{print $2}')"
  fi
fi

# ── 收尾提示 ──
say "完成。接下来按顺序执行（在 $DEPLOY_DIR 下）："
cat <<EOF

  cd $DEPLOY_DIR

  # 1) 先只起数据库与网关（xoi 有 profiles:[app]，此时不会启动）
  docker compose up -d

  # 2) 配网关管理令牌（SSH 隧道后浏览器开 http://localhost:3000）
  #    ssh -L 3000:127.0.0.1:3000 root@<服务器IP>
  #    登录 root/123456 → 改密码 → 令牌 → 新建（无限额度/永不过期）→ 复制 sk-xxx
  #    然后写回 .env：
  #    sed -i 's|^NEWAPI_ADMIN_TOKEN=.*|NEWAPI_ADMIN_TOKEN=sk-你的令牌|' .env

  # 3) 起 XOi 本体
  docker compose --profile app up -d

  # 4) 反向代理来源 IP（推荐，宿主机 Nginx 走 docker 网桥）
  bash $SRC_DIR/bootstrap.sh --sync-trust-proxy
  docker compose up -d --no-deps xoi

  # 5) 自检
  curl -fsS http://127.0.0.1:12121/api/readyz && echo OK

密钥已写入 $DEPLOY_DIR/.env（600 权限），请自行备份该文件。
EOF
