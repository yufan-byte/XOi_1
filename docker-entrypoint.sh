#!/bin/sh
# Only seed missing editable resources. Program/web/fonts live in the immutable image.
set -e

SEED_DIR="${XOI_ASSET_SEED_DIR:-/app/assets-seed}"
DATA_DIR="${XOI_RUNTIME_DATA_DIR:-/app/backend/data}"
RELEASE_DIR="${XOI_RELEASE_DIR:-/app/release}"
# Test overrides and deployment paths must never select broad directories.
case "$DATA_DIR" in ""|/|/app|/app/backend) echo "Unsafe data directory" >&2; exit 1;; esac
[ "$DATA_DIR" != "$SEED_DIR" ] || { echo "Seed/data directories must differ" >&2; exit 1; }
case "$DATA_DIR" in */data) ;; *) echo "Runtime directory must be an explicit data directory" >&2; exit 1;; esac
[ ! -L "$DATA_DIR" ] || { echo "Symlink data directories are not allowed" >&2; exit 1; }
for asset in serve/app.js web/index.html web/console/index.html web/atelier-canvas/index.html web/one-stop/index.html fonts/Comismsh.ttf; do
  [ -s "${RELEASE_DIR}/${asset}" ] || { echo "Incomplete XOi release: ${asset}" >&2; exit 1; }
done

mkdir -p "${DATA_DIR}"

# Legacy data/serve and data/web remain untouched for rollback/data recovery.
# The new image never executes or serves those stale program directories.

# Editable resources belong to the operator, not the image. Seed missing files only.
# Publish updated built-ins separately; never replace an existing custom script on restart.
for d in skills models modelPrompt assets vendor; do
  if [ -d "${SEED_DIR}/${d}" ]; then
    [ ! -L "${DATA_DIR}/${d}" ] || { echo "Symlink resource directories are not allowed" >&2; exit 1; }
    mkdir -p "${DATA_DIR}/${d}"
    find "${SEED_DIR}/${d}" -type f -print | while IFS= read -r source_file; do
      relative_file="${source_file#"${SEED_DIR}/"}"
      target_file="${DATA_DIR}/${relative_file}"
      parent_dir="$(dirname "$target_file")"
      while [ "$parent_dir" != "$DATA_DIR" ]; do
        [ ! -L "$parent_dir" ] || { echo "Symlink resource parents are not allowed" >&2; exit 1; }
        parent_dir="$(dirname "$parent_dir")"
      done
      if [ ! -e "$target_file" ] && [ ! -L "$target_file" ]; then
        mkdir -p "$(dirname "$target_file")"
        cp -p "$source_file" "$target_file"
      fi
    done
  fi
done

echo "[entrypoint] 资产就绪，启动服务…"
if [ "$(id -u)" = "0" ] && [ "$DATA_DIR" = "/app/backend/data" ]; then
  # Existing volumes from the preceding release already belong to node.
  # Avoid scanning every uploaded video on every restart. Permission repair is
  # an explicit operator step, not an unbounded startup operation.
  chown node:node "${DATA_DIR}"
  for d in skills models modelPrompt assets vendor; do
    [ ! -d "${DATA_DIR}/${d}" ] || chown -R node:node "${DATA_DIR}/${d}"
  done
  exec gosu node "$@"
fi
exec "$@"
