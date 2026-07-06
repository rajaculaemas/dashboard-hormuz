#!/usr/bin/env python3
"""
Simple test to verify QRadar connectivity and basic query response.
"""

import os
import sys
import json
import psycopg2
import requests
import time
from urllib3.exceptions import InsecureRequestWarning
from dotenv import load_dotenv

# Suppress SSL warnings
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

# Load environment
load_dotenv(".env.local")

# Database configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "socdashboard")
DB_USER = os.getenv("DB_USER", "soc")
DB_PASSWORD = os.getenv("DB_PASSWORD", "punggawa")

print("🔍 Getting QRadar credentials from database...")

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    
    cursor = conn.cursor()
    cursor.execute(
        """SELECT id, credentials FROM integrations 
           WHERE source ILIKE '%qradar%' LIMIT 1"""
    )
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not result:
        print("❌ No QRadar integration found")
        sys.exit(1)
    
    integration_id, credentials = result
    creds = json.loads(credentials) if isinstance(credentials, str) else credentials
    
    QRADAR_HOST = creds.get("host")
    QRADAR_API_KEY = creds.get("api_key")
    
except Exception as e:
    print(f"❌ Database error: {e}")
    sys.exit(1)

print(f"✅ Got QRadar Host: {QRADAR_HOST}")
print(f"✅ Got API Key: {QRADAR_API_KEY[:20]}...")

# Test 1: Simple GET request
print("\n📝 Test 1: Simple GET /ariel/databases")
try:
    headers = {
        "Accept": "application/json",
        "SEC": QRADAR_API_KEY,
        "Version": "15.0"
    }
    
    response = requests.get(
        f"https://{QRADAR_HOST}/api/ariel/databases",
        headers=headers,
        verify=False,
        timeout=10
    )
    
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Response OK: {len(data) if isinstance(data, list) else 'dict'} items")
    else:
        print(f"   ❌ Response: {response.text[:200]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 2: Submit a very simple AQL query
print("\n📝 Test 2: Submit simple AQL query")
try:
    # Try different queries
    queries = [
        "SELECT sourceip FROM events LAST 1 HOURS",
        "SELECT * FROM events LAST 1 HOURS LIMIT 5",
        "SELECT sourceip FROM events",
    ]
    
    search_id = None
    for query in queries:
        print(f"   Trying query: {query[:60]}...")
        try:
            response = requests.post(
                f"https://{QRADAR_HOST}/api/ariel/searches",
                params={"query_expression": query},
                headers=headers,
                verify=False,
                timeout=10
            )
            
            print(f"   Status: {response.status_code}")
            
            if response.status_code in [201, 202]:
                data = response.json()
                search_id = data.get("search_id")
                print(f"   ✅ Query submitted: {search_id}")
                break
            else:
                error_text = response.text[:150]
                print(f"   Response: {error_text}")
                if "semantic" in response.text.lower() or "syntax" in response.text.lower():
                    print(f"   (Query syntax error - trying next...)")
        except requests.exceptions.Timeout:
            print(f"   Timeout (trying next...)")
        except Exception as e:
            print(f"   Error: {e}")
    
    if not search_id:
        print("   ❌ Failed to submit query with any method")
    else:
        # Test 3: Poll status
        print("\n📝 Test 3: Poll query status (max 12 attempts)")
        for attempt in range(12):
            time.sleep(2)
            status_response = requests.get(
                f"https://{QRADAR_HOST}/api/ariel/searches/{search_id}",
                headers=headers,
                verify=False,
                timeout=10
            )
            
            status_data = status_response.json()
            status = status_data.get("status")
            progress = status_data.get("progress", 0)
            
            print(f"   Attempt {attempt+1}: {status} ({progress}%)")
            
            if status == "COMPLETED":
                print(f"   ✅ Query completed!")
                
                # Get results
                print("\n📝 Test 4: Get query results")
                results_response = requests.get(
                    f"https://{QRADAR_HOST}/api/ariel/searches/{search_id}/results",
                    headers=headers,
                    verify=False,
                    timeout=10
                )
                
                results_data = results_response.json()
                events = results_data.get("events", [])
                print(f"   ✅ Got {len(events)} events")
                if events:
                    print(f"   First event: {json.dumps(events[0], indent=2)[:200]}")
                break
            elif status in ["ERROR", "CANCELED"]:
                print(f"   ❌ Query failed: {status}")
                if "error" in status_data:
                    print(f"   Error: {status_data['error']}")
                break
except Exception as e:
    print(f"   ❌ Error: {e}")




print("\n✅ All tests completed!")
