#!/bin/bash

# Script to trigger SOCFortress alert resync
# Usage: ./resync-socfortress-alerts.sh [INTEGRATION_ID]

INTEGRATION_ID="${1}"
API_BASE="http://localhost:3000"

if [ -z "$INTEGRATION_ID" ]; then
  echo "Error: INTEGRATION_ID is required"
  echo "Usage: $0 <integration_id>"
  exit 1
fi

echo "Triggering SOCFortress alert resync for integration: $INTEGRATION_ID"
echo "Request: POST $API_BASE/api/alerts/sync"
echo ""

response=$(curl -s -X POST "$API_BASE/api/alerts/sync" \
  -H "Content-Type: application/json" \
  -d "{\"integrationId\": \"$INTEGRATION_ID\", \"resetCursor\": true}")

echo "Response:"
echo "$response" | jq '.' 2>/dev/null || echo "$response"

echo ""
echo "Done! Check dashboard for updated alert statuses."
