#!/usr/bin/env python3
import psycopg2
import json

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="socdashboard",
    user="soc",
    password="punggawa"
)

cursor = conn.cursor()

# Get QRadar integrations
cursor.execute("""
SELECT id, name, credentials 
FROM integrations 
WHERE name ILIKE '%qradar%'
LIMIT 3
""")

integrations = cursor.fetchall()

for row in integrations:
    id, name, credentials = row
    print(f"\n🔧 Integration: {name} (ID: {id})")
    if credentials:
        creds = json.loads(credentials) if isinstance(credentials, str) else credentials
        print(f"   Credentials: {json.dumps(creds, indent=6)[:300]}")
    else:
        print("   Credentials: NULL")

cursor.close()
conn.close()
