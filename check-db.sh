#!/bin/bash

# Database Connection Checker
# Membantu mendiagnosis masalah koneksi database

echo "🔍 Checking SOC Dashboard Database Setup..."
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL client not found"
    echo "   Install: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
    exit 1
fi
echo "✅ PostgreSQL client found"

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found"
    exit 1
fi
echo "✅ .env.local found"

# Extract DATABASE_URL
DATABASE_URL=$(grep DATABASE_URL .env.local | cut -d'=' -f2 | tr -d '"' | tr -d "'")

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not found in .env.local"
    exit 1
fi
echo "✅ DATABASE_URL found"

# Parse connection string
# postgresql://user:pass@host:port/database
DB_USER=$(echo $DATABASE_URL | sed -E 's/postgresql:\/\/([^:]+).*/\1/')
DB_PASS=$(echo $DATABASE_URL | sed -E 's/.*:([^@]+)@.*/\1/')
DB_HOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:]+).*/\1/')
DB_PORT=$(echo $DATABASE_URL | sed -E 's/.*:([0-9]+)\/.*/\1/')
DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]+).*/\1/')

echo ""
echo "📋 Connection Details:"
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   User: $DB_USER"
echo "   Database: $DB_NAME"
echo ""

# Test connection
echo "🔌 Testing connection..."
PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Database connection successful!"
    echo ""
    
    # Check tables
    echo "📊 Checking tables..."
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
    "
else
    echo "❌ Database connection failed!"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check if PostgreSQL is running:"
    echo "   - macOS: brew services list | grep postgres"
    echo "   - Linux: sudo systemctl status postgresql"
    echo "   - Docker: docker ps | grep postgres"
    echo ""
    echo "2. Verify credentials in .env.local"
    echo ""
    echo "3. If using Docker:"
    echo "   docker run --name soc-postgres -e POSTGRES_USER=soc -e POSTGRES_PASSWORD=punggawa -e POSTGRES_DB=socdashboard -p 5432:5432 -d postgres:15"
    exit 1
fi
