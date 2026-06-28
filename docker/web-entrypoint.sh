#!/bin/sh
# Replace build-time placeholder with runtime env var in all JS files
# This allows NEXT_PUBLIC_* vars to be set at deploy time, not build time

PLACEHOLDER="__NEXT_PUBLIC_API_URL_PLACEHOLDER__"
ACTUAL="${NEXT_PUBLIC_API_URL:-}"

if [ -n "$ACTUAL" ]; then
  find /app/apps/web/.next -name "*.js" -exec sed -i "s|$PLACEHOLDER|$ACTUAL|g" {} +
fi

exec node apps/web/server.js
