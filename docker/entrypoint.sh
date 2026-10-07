#!/bin/sh
# Applies pending migrations, then starts the server. Waits for the database.
set -e

tries=0
until node /opt/prisma/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma; do
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "migrate deploy failed $tries times, giving up" >&2
    exit 1
  fi
  echo "database not ready, retry $tries/30" >&2
  sleep 2
done

exec node server.js
