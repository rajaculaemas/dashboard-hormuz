#!/bin/bash

# Manual Shift Recap Notification Trigger Script
# Usage: ./trigger-shift-recap.sh [CRON_SECRET]

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <CRON_SECRET>"
    exit 1
fi

CRON_SECRET=$1
DOMAIN="${DOMAIN:-http://localhost:3000}"

echo "🔔 Triggering Shift Recap Notifications..."
echo "Domain: $DOMAIN"
echo "Time: $(date)"

# Call the endpoint
response=$(curl -s -w "\n%{http_code}" \
  -H "x-cron-secret: $CRON_SECRET" \
  "$DOMAIN/api/cron/shift-recap")

# Extract response body and HTTP code
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo ""
echo "📊 Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""
echo "HTTP Code: $http_code"

if [ "$http_code" = "200" ]; then
    echo "✅ Success!"
    exit 0
else
    echo "❌ Failed!"
    exit 1
fi
