#!/bin/sh
# Container start: run the site with uvicorn, under Litestream when it is configured.
set -eu

serve="uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"

if [ ! -w /data ]; then
  echo "entrypoint: /data is not writable by uid $(id -u). Mount a Docker volume there (DEPLOYMENT.md)." >&2
  exit 1
fi

if [ -z "${LITESTREAM_BUCKET:-}" ]; then
  echo "entrypoint: LITESTREAM_BUCKET is not set; the database is not copied off the server." >&2
  exec $serve
fi

for name in LITESTREAM_PATH LITESTREAM_ENDPOINT LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "entrypoint: LITESTREAM_BUCKET is set but $name is not." >&2
    exit 1
  fi
done

# Only one container may run Litestream on this volume: two Litestream processes
# writing to one replica can corrupt it. Coolify's rolling updates start the new
# container before they stop the old one. The lock is on file descriptor 9, which
# litestream and uvicorn inherit through exec, so it lasts until they exit.
exec 9>/data/.litestream.lock
if ! flock -n 9; then
  echo "entrypoint: another container is running Litestream on this /data volume. In Coolify, set Container naming to \"Consistent name (no rolling updates)\" (DEPLOYMENT.md)." >&2
  exit 1
fi

# A new or lost volume has no database: bring back the latest copy from R2, if there is one.
litestream restore -if-db-not-exists -if-replica-exists /data/site.db

# Litestream runs uvicorn as its child and stops when uvicorn stops.
exec litestream replicate -exec "$serve"
