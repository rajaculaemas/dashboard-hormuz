#!/usr/bin/env python3
"""
Fetch ALL Wazuh ALERTS from last 2 hours - Windows compatible
"""

import json
import requests
import urllib3
import sys
from datetime import datetime, timezone, timedelta

# Force UTF-8 encoding for Windows
sys.stdout.reconfigure(encoding='utf-8')

urllib3.disable_warnings()

# Config
ES_URL = "https://dc01-cakra-wdl01.pss.net:9200"
ES_AUTH = ("admin", "OAfxU.TU?sMZVCEnYjcqde2Nn.UF+M58")
INDEX = "wazuh-posindonesia_*"

# Time range - 2 hours ago
end_time = datetime.now(timezone.utc)
start_time = end_time - timedelta(hours=2)

# Convert to epoch (using field 'true')
start_epoch = start_time.timestamp()
end_epoch = end_time.timestamp()

# Print to stderr for logs
print(f"{'='*80}", file=sys.stderr)
print("FETCHING ALL WAZUH ALERTS (LAST 2 HOURS)", file=sys.stderr)
print(f"{'='*80}", file=sys.stderr)
print(f"Elasticsearch: {ES_URL}", file=sys.stderr)
print(f"Index: {INDEX}", file=sys.stderr)
print(f"Time range: {start_time} to {end_time}", file=sys.stderr)
print(f"Epoch range: {start_epoch:.2f} to {end_epoch:.2f}", file=sys.stderr)
print(f"{'='*80}", file=sys.stderr)

# Query for ALL alerts with syslog_level: ALERT
query = {
    "size": 10000,  # Get more results
    "query": {
        "bool": {
            "must": [
                {"term": {"syslog_level": "ALERT"}},
                {
                    "range": {
                        "true": {
                            "gte": start_epoch,
                            "lte": end_epoch
                        }
                    }
                }
            ]
        }
    },
    "sort": [{"true": {"order": "desc"}}]  # Newest first
}

print(f"\nExecuting query...", file=sys.stderr)

try:
    response = requests.get(
        f"{ES_URL}/{INDEX}/_search",
        auth=ES_AUTH,
        json=query,
        verify=False,
        timeout=60
    )
    
    if response.status_code == 200:
        data = response.json()
        total_alerts = data['hits']['total']['value']
        hits = data['hits']['hits']
        
        print(f"\n[SUCCESS] Found {total_alerts} total alerts", file=sys.stderr)
        print(f"[INFO] Displaying: {len(hits)} alerts (max 1000)", file=sys.stderr)
        
        if hits:
            # Summary statistics (to stderr)
            agent_unavailable_count = 0
            other_alerts_count = 0
            agents = set()
            
            for hit in hits:
                src = hit['_source']
                rule_desc = src.get('rule_description', '')
                
                # Count Agent Unavailable alerts
                if any(keyword.lower() in rule_desc.lower() for keyword in 
                      ['unavailable', 'disconnected', 'agent unavailable']):
                    agent_unavailable_count += 1
                else:
                    other_alerts_count += 1
                
                # Collect unique agents
                if 'agent_name' in src:
                    agents.add(src['agent_name'])
            
            print(f"\n[SUMMARY]", file=sys.stderr)
            print(f"   - Agent Unavailable alerts: {agent_unavailable_count}", file=sys.stderr)
            print(f"   - Other alerts: {other_alerts_count}", file=sys.stderr)
            print(f"   - Unique agents: {len(agents)}", file=sys.stderr)
            
            # Output ALL alerts as raw JSON to stdout (for file redirect)
            for i, hit in enumerate(hits):
                # Print as clean JSON (no extra formatting)
                print(json.dumps(hit, ensure_ascii=False))
                # Add newline between alerts for readability
                if i < len(hits) - 1:
                    print()
                    
        else:
            print(f"\n[INFO] No alerts found in the last 6 hours.", file=sys.stderr)
            
    else:
        print(f"\n[ERROR] Status {response.status_code}:", file=sys.stderr)
        print(response.text, file=sys.stderr)
        
except requests.exceptions.Timeout:
    print(f"\n[ERROR] Timeout: Request took too long", file=sys.stderr)
except requests.exceptions.ConnectionError:
    print(f"\n[ERROR] Connection Error: Cannot connect to Elasticsearch", file=sys.stderr)
except Exception as e:
    print(f"\n[ERROR] Unexpected error: {e}", file=sys.stderr)

print(f"\n{'='*80}", file=sys.stderr)
print("FETCH COMPLETED", file=sys.stderr)
print(f"{'='*80}", file=sys.stderr)