#!/bin/sh
# Operator-run only. No restore, quota changes, or model requests.
set -eu
umask 077
if [ "${XOI_BACKUP_CHECKPOINT_CONFIRMED:-}" != "yes" ]; then
  echo "先暂停写入、等待生成任务结算并确认检查点，再设置 XOI_BACKUP_CHECKPOINT_CONFIRMED=yes。" >&2
  exit 1
fi
output_dir="${1:-}"
case "$output_dir" in /*) ;; *) echo "请指定备份输出目录的绝对路径" >&2; exit 1;; esac
app_container="${XOI_BACKUP_APP_CONTAINER:-xoi}"
pg_container="${XOI_BACKUP_PG_CONTAINER:-xoi-newapi-pg}"
for container in "$app_container" "$pg_container"; do
  case "$container" in ""|*[!a-zA-Z0-9_.-]*) echo "无效的容器名称" >&2; exit 1;; esac
done
command -v docker >/dev/null
mkdir -p "$output_dir"
backup_dir="$(mktemp -d "$output_dir/xoi-checkpoint-XXXXXXXX")"
# Credentials stay inside the selected PostgreSQL container, never in shell arguments/logs.
docker exec "$pg_container" sh -c 'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner' > "$backup_dir/database.dump"
test -s "$backup_dir/database.dump"
docker exec -i "$pg_container" sh -c 'exec pg_restore --list' < "$backup_dir/database.dump" >/dev/null
docker exec "$app_container" sh -c '
  set -eu
  cd /app/backend/data
  set --
  for entry in oss canvases vendor skills models modelPrompt assets announcements.json reseller.json reseller-agents; do
    if [ -e "$entry" ]; then set -- "$@" "$entry"; fi
  done
  [ "$#" -gt 0 ]
  exec tar czf - "$@"
' > "$backup_dir/application-data.tar.gz"
test -s "$backup_dir/application-data.tar.gz"
tar tzf "$backup_dir/application-data.tar.gz" >/dev/null
docker inspect --format '{{.Image}}' "$app_container" > "$backup_dir/image-id.txt"
(
  cd "$backup_dir"
  if command -v sha256sum >/dev/null; then sha256sum database.dump application-data.tar.gz image-id.txt > SHA256SUMS;
  else shasum -a 256 database.dump application-data.tar.gz image-id.txt > SHA256SUMS; fi
)
echo "备份生成：$backup_dir"
echo "尚未验收恢复；请加密、异地保存并在隔离环境验证，勿覆盖生产数据库。"
