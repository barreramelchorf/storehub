#!/bin/sh
# Replace build-time placeholder with runtime env var in all JS files
PLACEHOLDER="__NEXT_PUBLIC_API_URL_PLACEHOLDER__"
ACTUAL="${NEXT_PUBLIC_API_URL:-}"

# Always replace - even if ACTUAL is empty (removes the placeholder)
find /app/apps/web/.next -name "*.js" -exec sed -i "s|$PLACEHOLDER|$ACTUAL|g" {} +

exec node apps/web/server.js
