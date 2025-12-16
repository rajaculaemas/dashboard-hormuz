#!/usr/bin/env bash

# Wazuh Integration Setup Verification Script
# This script checks if all Wazuh integration files have been created correctly

echo "════════════════════════════════════════════════════════"
echo "  Wazuh Integration Setup Verification"
echo "════════════════════════════════════════════════════════"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0

# Function to check file existence
check_file() {
  local file=$1
  local description=$2
  
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $description"
    echo "  └─ $file"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $description"
    echo "  └─ $file (NOT FOUND)"
    ((FAIL++))
  fi
}

# Function to check directory existence
check_dir() {
  local dir=$1
  local description=$2
  
  if [ -d "$dir" ]; then
    echo -e "${GREEN}✓${NC} $description"
    echo "  └─ $dir"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $description"
    echo "  └─ $dir (NOT FOUND)"
    ((FAIL++))
  fi
}

# Function to check if string exists in file
check_content() {
  local file=$1
  local pattern=$2
  local description=$3
  
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $description"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $description (pattern not found)"
    ((FAIL++))
  fi
}

echo ""
echo "📁 Checking Core API Files..."
echo "─────────────────────────────────────────────────────"
check_file "lib/api/wazuh-client.ts" "Wazuh Elasticsearch Client"
check_file "lib/api/wazuh.ts" "Wazuh Application Integration"

echo ""
echo "🛣️  Checking API Routes..."
echo "─────────────────────────────────────────────────────"
check_dir "app/api/alerts/wazuh" "Wazuh Alerts API Directory"
check_file "app/api/alerts/wazuh/sync/route.ts" "Wazuh Sync Endpoint"
check_file "app/api/alerts/auto-sync/route.ts" "Auto-Sync Endpoint (modified)"

echo ""
echo "🎨 Checking Frontend Components..."
echo "─────────────────────────────────────────────────────"
check_file "components/integration/integration-form.tsx" "Integration Form (modified)"
check_content "components/integration/integration-form.tsx" "wazuh" "  └─ Wazuh option in form"
check_file "components/alert/sync-status.tsx" "Sync Status Component (modified)"
check_content "components/alert/sync-status.tsx" "wazuh" "  └─ Wazuh sync support"

echo ""
echo "📝 Checking Configuration..."
echo "─────────────────────────────────────────────────────"
check_file "lib/types/integration.ts" "Integration Types (modified)"
check_content "lib/types/integration.ts" "wazuh" "  └─ Wazuh type definition"

echo ""
echo "📚 Checking Documentation..."
echo "─────────────────────────────────────────────────────"
check_file "WAZUH_INTEGRATION.md" "Wazuh Integration Guide"
check_file "WAZUH_IMPLEMENTATION.md" "Implementation Summary"

echo ""
echo "🧪 Checking Test Files..."
echo "─────────────────────────────────────────────────────"
check_file "scripts/test-wazuh-integration.ts" "Wazuh Integration Test Suite"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Verification Results"
echo "════════════════════════════════════════════════════════"
echo ""

TOTAL=$((PASS + FAIL))

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed! ($PASS/$TOTAL)${NC}"
  echo ""
  echo "✅ Wazuh integration is properly installed."
  echo ""
  echo "Next steps:"
  echo "1. Restart your development server: npm run dev"
  echo "2. Navigate to Dashboard → Integrations"
  echo "3. Click 'Add Integration' and select 'Wazuh SIEM'"
  echo "4. Enter your Elasticsearch credentials"
  echo "5. Save and test the sync"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Some checks failed! ($PASS passed, $FAIL failed)${NC}"
  echo ""
  echo "⚠️  Wazuh integration may not be complete."
  echo ""
  echo "Please verify:"
  echo "1. All files were created successfully"
  echo "2. No files were accidentally deleted"
  echo "3. File paths match your project structure"
  echo ""
  exit 1
fi
