#!/bin/bash

# QRadar Events & Notes Fetcher - Bash Wrapper
# This script fetches related events and notes for QRadar alerts that don't have them yet

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment from .env.local
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    export $(cat "$PROJECT_ROOT/.env.local" | grep -v '^#' | xargs)
fi

# Set database defaults from env
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-5432}"
export DB_NAME="${DB_NAME:-socdashboard}"
export DB_USER="${DB_USER:-soc}"
export DB_PASSWORD="${DB_PASSWORD:-punggawa}"

# Parse command line arguments
VERBOSE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            echo "Usage: $(basename "$0") [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -v, --verbose   Show verbose output"
            echo "  --dry-run       Show what would be done without making changes"
            echo "  -h, --help      Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=========================================="
echo "QRadar Events & Notes Fetcher"
echo "=========================================="
echo ""
echo "Database: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""

# Check Python installation
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    exit 1
fi

# Check required Python packages
echo "📦 Checking dependencies..."
python3 -c "import psycopg2" 2>/dev/null || {
    echo "❌ Missing psycopg2. Installing..."
    pip3 install psycopg2-binary requests python-dotenv
}

# Run the script
echo ""
python3 "$SCRIPT_DIR/fetch_qradar_events_notes.py"
