#!/usr/bin/env python3
"""
Test script untuk verify statistik offense
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "socdashboard")
DB_USER = os.getenv("DB_USER", "soc")
DB_PASSWORD = os.getenv("DB_PASSWORD", "punggawa")

print("📊 Testing Offense Statistics Query")
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
    
    # Total offenses
    cursor.execute("SELECT COUNT(*) FROM qradar_offenses")
    total_offenses = cursor.fetchone()[0]
    
    # Offenses without events
    cursor.execute("""
        SELECT COUNT(DISTINCT qo.id)
        FROM qradar_offenses qo
        LEFT JOIN qradar_events qe ON qo.id = qe.qradar_offense_id
        WHERE qe.id IS NULL
    """)
    offenses_no_events = cursor.fetchone()[0]
    
    # Offenses without notes
    cursor.execute("""
        SELECT COUNT(*)
        FROM qradar_offenses
        WHERE metadata->>'notes' IS NULL OR metadata->>'notes' = ''
    """)
    offenses_no_notes = cursor.fetchone()[0]
    
    # Offenses without both
    cursor.execute("""
        SELECT COUNT(DISTINCT qo.id)
        FROM qradar_offenses qo
        LEFT JOIN qradar_events qe ON qo.id = qe.qradar_offense_id
        WHERE qe.id IS NULL
        AND (qo.metadata->>'notes' IS NULL OR qo.metadata->>'notes' = '')
    """)
    offenses_no_both = cursor.fetchone()[0]
    
    cursor.close()
    conn.close()
    
    print(f"  Total offenses:           {total_offenses}")
    print(f"  Without events:           {offenses_no_events}")
    print(f"  Without notes:            {offenses_no_notes}")
    print(f"  Without both:             {offenses_no_both}")
    print(f"  With at least one item:   {total_offenses - offenses_no_both}")
    print("=" * 60)
    print("✅ Statistics query successful!")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
