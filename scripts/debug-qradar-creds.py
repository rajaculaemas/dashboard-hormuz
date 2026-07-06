#!/usr/bin/env python3
"""
Debug script to verify QRadar connection and API key retrieval.
"""

import os
import sys
import json
import psycopg2
from dotenv import load_dotenv

# Load environment
load_dotenv(".env.local")

# Database configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "socdashboard")
DB_USER = os.getenv("DB_USER", "soc")
DB_PASSWORD = os.getenv("DB_PASSWORD", "punggawa")

print("🔍 Checking QRadar integration credentials...")

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    
    cursor = conn.cursor()
    
    # Query like the main script does
    cursor.execute(
        """SELECT id, credentials, config FROM integrations 
           WHERE source ILIKE '%qradar%' LIMIT 1"""
    )
    result = cursor.fetchone()
    
    if result:
        integration_id, credentials, config = result
        print(f"✅ Found QRadar integration: {integration_id}")
        
        creds = json.loads(credentials) if isinstance(credentials, str) else credentials
        print(f"✅ Credentials: {json.dumps(creds, indent=2)}")
        
        api_key = creds.get("api_key") or creds.get("apiKey")
        host = creds.get("host")
        
        if api_key:
            print(f"\n✅ API Key found: {api_key[:20]}...")
            print(f"✅ QRadar Host: {host}")
        else:
            print(f"❌ No API key in credentials")
    else:
        print("❌ No QRadar integration found")
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
