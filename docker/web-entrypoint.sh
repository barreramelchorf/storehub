#!/bin/sh
PLACEHOLDER="__NEXT_PUBLIC_API_URL_PLACEHOLDER__"
ACTUAL="${NEXT_PUBLIC_API_URL:-}"

find /app/apps/web/.next -name "*.js" -exec sed -i "s|$PLACEHOLDER|$ACTUAL|g" {} +

exec node apps/web/server.js
