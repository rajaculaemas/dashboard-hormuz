#!/bin/bash

# Check recent alerts in Elasticsearch
curl -k -u "admin:p0nd0kj@y@" -X POST \
  "https://dc01-cakra-wdl01.pss.net:9200/wazuh-posindonesia_*/_search" \
  -H "Content-Type: application/json" \
  -d '{
  "size": 10,
  "query": {
    "bool": {
      "must": [
        { "term": { "syslog_level": "ALERT" } }
      ]
    }
  },
  "sort": [{ "@timestamp": "desc" }],
  "_source": ["rule.description", "@timestamp", "timestamp_utc", "timestamp", "agent.name", "true"]
}' | python3 -m json.tool
