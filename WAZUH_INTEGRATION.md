# Wazuh SIEM Integration Guide

## Overview

This guide explains how to integrate Wazuh SIEM (Security Information and Event Management) with the SOC Dashboard. The integration allows you to:

- Fetch security alerts from Wazuh Elasticsearch
- Unified alert viewing with other integrations (Stellar Cyber, QRadar)
- Alert status management (Open, In Progress, Closed)
- Alert assignment to team members
- Add alerts to cases in the dashboard
- Automatic and manual synchronization

## Prerequisites

1. **Wazuh Manager Setup**: You need an active Wazuh deployment with Elasticsearch backend
2. **Elasticsearch Access**: Direct access to Wazuh's Elasticsearch instance with credentials
3. **Index Access**: Read permissions to Wazuh alert indices (typically `wazuh-*`)

### Required Credentials

To set up Wazuh integration, you'll need:

- **Elasticsearch URL**: `https://elasticsearch.example.com:9200`
- **Elasticsearch Username**: Usually `admin` or your configured user
- **Elasticsearch Password**: Your Elasticsearch password
- **Elasticsearch Index**: Pattern for Wazuh indices (default: `wazuh-*`)

## Setup Instructions

### Step 1: Access Integration Menu

1. Open your SOC Dashboard
2. Navigate to **Integrations** in the dashboard menu
3. Click **Add Integration** or **New Integration**

### Step 2: Configure Wazuh Integration

1. **Fill in Integration Details**:
   - **Name**: Give your integration a name (e.g., "Wazuh Punggawa")
   - **Type**: Select "Alert Integration"

2. **Select Source**:
   - **Alert Source**: Choose "Wazuh SIEM" from the dropdown

3. **Select Method**:
   - **Integration Method**: Select "API"

4. **Add Credentials**:
   - Click "Add Credential" or use the pre-populated fields:

   | Key | Value | Example |
   |-----|-------|---------|
   | `elasticsearch_url` | Your Elasticsearch URL | `https://dc01-cakra-wdl01.pss.net:9200` |
   | `elasticsearch_username` | Elasticsearch username | `admin` |
   | `elasticsearch_password` | Elasticsearch password | (marked as secret) |
   | `elasticsearch_index` | Wazuh index pattern | `wazuh-punggawa*` |

5. **Save Integration**:
   - Click "Add Integration" to save

### Step 3: Verify Connection

1. After saving, go to **Dashboard** > **Alert Panel**
2. The integration should appear in the "Integration Status" section
3. Click the refresh icon to manually sync alerts
4. Monitor the sync status for any errors

## Alert Flow

### Alert Discovery

Wazuh alerts are discovered through the following flow:

```
Wazuh Manager
    ↓
Elasticsearch (wazuh-* indices)
    ↓
SOC Dashboard (via Elasticsearch Query)
    ↓
Database (stored as normalized alerts)
    ↓
Alert Panel (displayed with filters & search)
```

### Alert Structure

Each Wazuh alert in the dashboard includes:

- **Alert ID**: Unique identifier from Wazuh
- **Title**: Rule description or event type
- **Severity**: Mapped from Wazuh rule level:
  - Rule level ≤ 2 → "Low"
  - Rule level ≤ 4 → "Low"
  - Rule level ≤ 7 → "Medium"
  - Rule level ≤ 10 → "High"
  - Rule level > 10 → "Critical"

- **Status**: Application-managed status (not from Wazuh):
  - "Open" - New alert
  - "In Progress" - Under investigation
  - "Closed" - Resolved

- **Agent Info**: Wazuh agent name and IP
- **Rule Info**: Rule ID, description, and associated groups
- **Network Data**: Source/destination IPs and ports (if available)
- **MITRE ATT&CK**: Mapped techniques and tactics

### Metadata Fields

Each alert stores rich metadata including:

```json
{
  "agent": {
    "id": "048",
    "name": "dc01-rnd-w10client10",
    "ip": "100.100.25.170",
    "labels": {
      "customer": "punggawa"
    }
  },
  "rule": {
    "level": 3,
    "description": "Sysmon - Event 3: Network connection...",
    "id": "102138",
    "groups": ["windows", "sysmon", "sysmon_event3"],
    "mitre": {
      "id": ["T1036"],
      "tactic": ["Defense Evasion"],
      "technique": ["Masquerading"]
    }
  },
  "srcIp": "100.100.25.170",
  "dstIp": "52.123.129.14",
  "srcPort": 59800,
  "dstPort": 443,
  "protocol": "tcp"
}
```

## Alert Management

### Filtering & Searching

In the **Alert Panel**, you can:

1. **Filter by Integration**: Select "Wazuh SIEM" to view only Wazuh alerts
2. **Filter by Status**: Open, In Progress, Closed, or All
3. **Filter by Severity**: Critical, High, Medium, Low, or All
4. **Search**: Real-time search across:
   - Alert title
   - Description
   - Agent name
   - Source IP
   - Alert ID
   - Rule groups

### Status Management

To update an alert's status:

1. Click on an alert in the Alert Feed
2. Change status in the Alert Detail Dialog:
   - "Open" - New alert
   - "In Progress" - Being investigated
   - "Closed" - Resolved

3. (Optional) Assign to team member using the assignee dropdown
4. (Optional) Add comments
5. Click "Update Status" to save

**Note**: Wazuh alerts' status is managed entirely by the SOC Dashboard application. Original Wazuh alerts are not modified.

### Add to Case

To add Wazuh alerts to a case:

1. **Method 1 - Single Alert**: Click alert → "Add to Case" button
2. **Method 2 - Batch**: Select multiple alerts with checkboxes → "Add to Case" button appears
3. Choose existing case or create new case
4. Alerts will be associated with the case

## Synchronization

### Auto-Sync

Auto-sync runs automatically every 3 minutes when enabled:

1. Fetches new alerts since last sync
2. Stores alerts in database
3. Updates integration's "Last Sync" timestamp

### Manual Sync

To manually sync Wazuh alerts:

1. Go to **Dashboard** > **Alert Panel**
2. Find "Wazuh SIEM" in **Integration Status** section
3. Click the refresh icon next to the integration name
4. Wait for sync to complete

### Sync Endpoint

You can also trigger sync via API:

```bash
curl -X POST http://localhost:3000/api/alerts/wazuh/sync \
  -H "Content-Type: application/json" \
  -d '{"integrationId": "your-integration-id"}'
```

## API Endpoints

### Manual Sync

- **Endpoint**: `POST /api/alerts/wazuh/sync`
- **Body**: `{ "integrationId": "integration-id" }`
- **Response**: 
  ```json
  {
    "success": true,
    "message": "Synced 25 alerts from Wazuh",
    "count": 25,
    "integration": {
      "id": "...",
      "name": "Wazuh SIEM",
      "source": "wazuh"
    }
  }
  ```

### Generic Alert Sync

- **Endpoint**: `POST /api/alerts/sync`
- **Body**: `{ "integrationId": "integration-id" }`
- **Description**: Works for any integration (Stellar Cyber, QRadar, Wazuh)

### Auto-Sync All

- **Endpoint**: `POST /api/alerts/auto-sync`
- **Response**: Syncs all active integrations (Stellar Cyber, QRadar, Wazuh)

### Get Alerts

- **Endpoint**: `GET /api/alerts`
- **Query Parameters**:
  - `integrationId`: Filter by integration
  - `status`: Filter by status
  - `severity`: Filter by severity
  - `time_range`: 1h, 12h, 24h, 7d, 30d, 90d, all
  - `page`: Page number (default: 1)
  - `limit`: Results per page (default: 50)

### Update Alert Status

- **Endpoint**: `POST /api/alerts/update`
- **Body**: 
  ```json
  {
    "alertId": "alert-id",
    "status": "In Progress",
    "assignee": "user-email",
    "comments": "Investigating..."
  }
  ```

## Elasticsearch Query

The integration uses the following Elasticsearch query to fetch Wazuh alerts:

```json
{
  "size": 100,
  "sort": [{ "timestamp_utc": { "order": "asc" } }],
  "query": {
    "bool": {
      "must": [
        { "match": { "syslog_level": "ALERT" } },
        { "range": { "timestamp_utc": { "gt": "2025-12-03T02:39:12Z" } } }
      ]
    }
  }
}
```

## Troubleshooting

### Connection Failed

**Error**: "Failed to connect to Wazuh Elasticsearch"

**Solutions**:
1. Verify Elasticsearch URL is accessible
2. Check username and password are correct
3. Ensure SSL certificate is valid (or disable verification for testing)
4. Verify index name pattern (`wazuh-*`)

### No Alerts Appearing

**Possible Causes**:
1. No alerts in Elasticsearch matching the `syslog_level: ALERT` condition
2. Last sync time is too recent (no new alerts since)
3. Index pattern doesn't match your Wazuh setup

**Solutions**:
1. Check Wazuh Manager is collecting events
2. Verify Elasticsearch has data: 
   ```bash
   curl -X GET "localhost:9200/wazuh-*/_count?q=syslog_level:ALERT"
   ```
3. Adjust `elasticsearch_index` credential if using custom naming

### Sync Errors

**Error**: "SyntaxError: Unexpected token"

**Solution**: Clear browser cache and restart dev server

**Error**: "Authentication failed"

**Solution**: Verify Elasticsearch credentials have read access to wazuh-* indices

## Advanced Configuration

### Custom Index Pattern

If your Wazuh indices use a custom pattern (not `wazuh-*`):

1. Edit the integration
2. Update `elasticsearch_index` to your pattern (e.g., `wazuh-punggawa*`)
3. Save changes

### Filtering by Customer/Labels

Wazuh agent labels can be used for filtering. Modify the Elasticsearch query in `lib/api/wazuh-client.ts` to add:

```typescript
{ "match": { "agent.labels.customer": "punggawa" } }
```

## Performance Considerations

- **Fetch Size**: Limited to 100 alerts per query for performance
- **Auto-Sync Interval**: 3 minutes to balance freshness and load
- **Time Window**: Default 5 minutes lookback for new alerts
- **Index Size**: Older indices are queried but not synced if outside retention window

## Support

For issues or questions:

1. Check Wazuh documentation: https://documentation.wazuh.com/
2. Review SOC Dashboard logs: `npm run dev` output
3. Check browser console for client-side errors
4. Verify Elasticsearch connectivity:
   ```bash
   curl -k -u admin:password https://elasticsearch:9200/_cluster/health
   ```

## Security Notes

- ✅ Credentials are stored encrypted in database
- ✅ Passwords transmitted over HTTPS
- ✅ SSL certificate validation enabled (can be disabled for self-signed certs)
- ✅ Original Wazuh alerts not modified
- ✅ Alert status managed only by SOC Dashboard
- ⚠️ Ensure Elasticsearch restricted to authorized networks
- ⚠️ Use strong passwords for Elasticsearch accounts
