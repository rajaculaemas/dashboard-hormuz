#!/usr/bin/env python3
"""
Debug script to check timestamp calculation from database
"""

import psycopg2
from datetime import datetime, timedelta
import json
import os
from dotenv import load_dotenv

# Load env
load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "socdashboard")
DB_USER = os.getenv("DB_USER", "soc")
DB_PASSWORD = os.getenv("DB_PASSWORD", "punggawa")

print("=" * 60)
print("🧪 Debug: Timestamp from Database")
print("=" * 60)

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            id, external_id, start_time, created_at
        FROM qradar_offenses
        WHERE start_time IS NOT NULL
        ORDER BY start_time DESC
        LIMIT 3
    """)
    
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    
    print(f"\n✅ Found {len(results)} offenses\n")
    
    for row in results:
        offense_id, external_id, start_time, created_at = row
        
        print(f"Offense #{external_id}")
        print(f"  ID: {offense_id}")
        print(f"  start_time: {start_time}")
        print(f"  start_time type: {type(start_time)}")
        print(f"  start_time tzinfo: {start_time.tzinfo if hasattr(start_time, 'tzinfo') else 'N/A'}")
        print(f"  created_at: {created_at}")
        
        # Simulate calculation
        if hasattr(start_time, 'tzinfo'):
            start_of_day = start_time.replace(hour=0, minute=0, second=0, microsecond=0)
            end_time = start_time + timedelta(hours=12)
            
            start_ms = int(start_of_day.timestamp() * 1000)
            end_ms = int(end_time.timestamp() * 1000)
            
            print(f"  Calculated window:")
            print(f"    Start: {start_of_day.strftime('%Y-%m-%d %H:%M')} → {start_ms} ms")
            print(f"    End:   {end_time.strftime('%Y-%m-%d %H:%M')} → {end_ms} ms")
            print(f"    Hours: {(end_time - start_of_day).total_seconds() / 3600:.1f}h")
        
        print()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
