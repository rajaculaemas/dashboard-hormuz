#!/usr/bin/env python3
"""
Minimal test to debug script hanging
"""
import os
import sys
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "socdashboard")
DB_USER = os.getenv("DB_USER", "soc")
DB_PASSWORD = os.getenv("DB_PASSWORD", "punggawa")

print("📝 Testing database query...")

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    
    cursor = conn.cursor()
    
    # Test 1: Get QRadar integration
    print("1️⃣  Getting QRadar integration...")
    cursor.execute(
        """SELECT id, credentials FROM integrations 
           WHERE source ILIKE '%qradar%' LIMIT 1"""
    )
    result = cursor.fetchone()
    if result:
        integration_id, credentials = result
        print(f"   ✅ Found: {integration_id}")
        creds = json.loads(credentials)
        api_key = creds.get("api_key")
        print(f"   ✅ API Key: {api_key[:20]}...")
    else:
        print("   ❌ No QRadar integration")
    
    # Test 2: Get offenses without events/notes
    print("\n2️⃣  Getting offenses without events/notes...")
    cursor.execute("""
        SELECT 
            qo.id, qo.external_id, qo.start_time,
            (SELECT COUNT(*) FROM qradar_events WHERE qradar_offense_id = qo.id) as event_count
        FROM qradar_offenses qo
        WHERE 
            (SELECT COUNT(*) FROM qradar_events WHERE qradar_offense_id = qo.id) = 0
            OR (qo.metadata->>'notes' IS NULL OR qo.metadata->>'notes' = '')
        ORDER BY qo.start_time DESC
        LIMIT 5
    """)
    
    rows = cursor.fetchall()
    print(f"   ✅ Found {len(rows)} offenses")
    for row in rows[:3]:
        offense_id, external_id, start_time, event_count = row
        print(f"      - Offense #{external_id}: {start_time} (events: {event_count})")
    
    cursor.close()
    conn.close()
    
    print("\n✅ Database test OK")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
