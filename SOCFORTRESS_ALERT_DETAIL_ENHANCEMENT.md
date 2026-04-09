# SOCFortress Alert Detail Panel - Enhancement Complete ✅

## Overview
The Copilot/SOCFortress alert detail panel has been significantly enhanced to display comprehensive alert information with complete raw Wazuh event data across three organized tabs.

## File Locations
- **Component:** [components/alert/socfortress-alert-detail-dialog.tsx](components/alert/socfortress-alert-detail-dialog.tsx) (330 lines)
- **Backend Handler:** [lib/api/socfortress.ts](lib/api/socfortress.ts) (495 lines)
- **Sync Script:** [scripts/sync-socfortress-enriched.ts](scripts/sync-socfortress-enriched.ts)

## Enhanced Features

### 1. Details Tab - Organized Information Cards
The Details tab displays alert information in organized cards:

#### Alert Identification Card
- **Copilot Alert ID (MySQL)** - `externalId` with copy button
- **Dashboard Alert ID (PostgreSQL)** - `id` with copy button
- **Integration ID** - `integrationId` with copy button

#### Alert Details Card
- **Status** - Alert status (New, Open, Closed, etc.)
- **Severity** - Alert severity level
- **Source System** - From metadata.socfortress.source
- **Customer Code** - From metadata.socfortress.customer_code

#### Timeline Card
- **Created** - createdAt timestamp
- **Updated** - updatedAt timestamp (if available)
- **Closed** - time_closed from SOCFortress metadata

#### Assignment & Organization Card
- **Assigned To** - assigned_to from metadata
- **Customer Code** - customer_code from metadata

#### Description Card
- Scrollable area with full alert description

### 2. Metadata Tab - Complete Metadata Display
Two separate sections:
- **SOCFortress Metadata** - Copilot database-specific fields
- **Complete Metadata** - All metadata fields from alert object

Both displayed as formatted JSON with syntax highlighting.

### 3. Raw Data Tab - Complete Wazuh Event Data
The raw data tab now shows comprehensive information:

#### Incident Event Data (Wazuh)
- **Source Data from MySQL** - Complete parsed Wazuh event JSON
- Contains **68+ fields** including:
  - `rule_id`, `rule_description`, `rule_level`, `rule_mitre_id/tactic/technique`
  - `agent_id`, `agent_ip`, `agent_name`, `agent_labels`
  - `process_id`, `process_image`, `process_cmd_line`
  - `data_columns_*` - Process execution details (cwd, uid, gid, pid, parent, etc.)
  - `timestamp_utc`, `ingest_timestamp_utc`
  - All Wazuh event metadata

#### Complete Alert Data
- Full PostgreSQL alert object as formatted JSON
- Includes all synced fields and metadata

## Enhanced Backend Handler

### New Functionality in `lib/api/socfortress.ts`

**fetchUnlinkedAlerts()** - Now enriches alerts with incident event data:
- Fetches all alerts from MySQL (ordered by creation time DESC)
- For each alert, fetches the associated incident event
- Parses source_data JSON containing complete Wazuh event information
- Returns enriched alert objects with incident_event metadata

**getSocfortressAlerts()** - Updated to include incident event data:
- Calls enriched fetchUnlinkedAlerts()
- Includes incident_event in metadata:
  ```json
  {
    "incident_event": {
      "id": 501693,
      "asset_name": "WAF-AWS-EKS-JKT",
      "created_at": "2026-02-04 11:05:03",
      "source_data": { /* Complete Wazuh event with 68+ fields */ }
    }
  }
  ```

### Data Enrichment Process
1. **Fetch Phase**: Query all alerts from `incident_management_alert`
2. **Enrich Phase**: For each alert, fetch its `incident_management_alertevent` record
3. **Parse Phase**: Parse stringified JSON in `source_data` field
4. **Transform Phase**: Map to PostgreSQL format with complete metadata

## Helper Components

### CopyableField
```tsx
<CopyableField 
  label="Copilot Alert ID (MySQL)" 
  value={alertId} 
  id="mysql-id" 
/>
```
- Displays label and value
- Provides copy-to-clipboard button
- Shows feedback (checkmark) on successful copy

### InfoRow
```tsx
<InfoRow 
  label="Status" 
  value={status}
  isMono={false}
/>
```
- Clean label-value display
- Optional monospace font
- Shows "—" for missing values

## Data Structure After Enrichment

Complete alert structure with incident event data:

```json
{
  "id": "cml9563u200b5jwfehgg5jphd",
  "externalId": "1687",
  "title": "Adversaries may use binary padding...",
  "description": "...",
  "status": "New",
  "severity": "Low",
  "timestamp": "2026-02-05T07:35:17.739Z",
  "createdAt": "2026-02-05T07:35:17.739Z",
  "integrationId": "integration-id",
  "metadata": {
    "socfortress": {
      "id": 1687,
      "source": "wazuh",
      "assigned_to": "sultan",
      "time_closed": "2026-01-31T17:37:21.000Z",
      "customer_code": "posindonesia"
    },
    "incident_event": {
      "id": 501693,
      "asset_name": "WAF-AWS-EKS-JKT",
      "created_at": "2026-02-04 11:05:03",
      "source_data": {
        "id": "1770202913.3209487940",
        "rule_id": "200284",
        "rule_description": "Detects System Information Discovery commands.",
        "rule_level": 12,
        "rule_mitre_id": ["T1082"],
        "rule_mitre_tactic": ["Discovery"],
        "rule_mitre_technique": ["System Information Discovery"],
        "agent_id": "104",
        "agent_name": "WAF-AWS-EKS-JKT",
        "agent_ip": "192.169.64.12",
        "agent_labels_customer": "posindonesia",
        "process_id": "204899",
        "process_image": "/bin/bash",
        "process_cmd_line": "bash -c 'while true; do sleep 1;...'",
        "data_columns_pid": "204899",
        "data_columns_uid": "1009",
        "data_columns_gid": "1009",
        "data_columns_cwd": "/home/ridhi",
        "data_columns_parent": "202452",
        "timestamp_utc": "2026-02-04T11:01:53.000Z",
        // ... 50+ additional fields
      }
    }
  }
}
```

## Integration Points

### Dashboard Page
- **File:** [app/dashboard/page.tsx](app/dashboard/page.tsx#L43)
- **Import:** Line 43
- **Usage:** Lines 2053+ in alert dialog routing

### SLA Dashboard Page
- **File:** [app/dashboard/sla/page.tsx](app/dashboard/sla/page.tsx#L19)
- **Import:** Line 19
- **Usage:** Lines 1155+ in alert dialog routing

### Routing Logic
Both pages detect SOCFortress alerts:
```tsx
const isSocfortress = selectedAlert?.integration?.source?.includes("socfortress") 
  || selectedAlert?.integration?.source?.includes("copilot")

if (isSocfortress) {
  <SocfortressAlertDetailDialog 
    open={alertDialogOpen} 
    onOpenChange={setAlertDialogOpen} 
    alert={selectedAlert} 
  />
}
```

## Syncing Enriched Data

### Manual Sync
To resync alerts with enriched incident event data:

```bash
npx tsx scripts/sync-socfortress-enriched.ts
```

### API Endpoint Sync
Existing API endpoints automatically use the enriched handler:
```
POST /api/alerts/sync?source=socfortress
```

### Sync Output
```
✅ Sync complete:
   - Updated: 500 (alerts with enriched incident event data)
   - Created: 0
   - Source Data Fields: 68+ per alert
```

## Testing

Sample enriched alert verification:
```
✅ Sample Copilot Alert Found:
- Alert ID: 1687
- incident_event present: true
- source_data present: true
- source_data fields (68 total):
  Sample: id, rule_id, agent_id, process_id, process_image, etc.
```

## Known Limitations & Future Enhancements

Current version focuses on **displaying** complete information. Future enhancements could include:
- ⏳ Status update capability
- ⏳ "Add to Case" button
- ⏳ Bulk operations
- ⏳ Export/share functionality
- ⏳ Timeline/history viewer for multiple incidents
- ⏳ Alert assignment UI

## Changelog

### Version 2.0 (Current) - Complete Wazuh Event Data
- ✅ Incident event enrichment in backend handler
- ✅ Parse and display source_data JSON (68+ fields)
- ✅ Sequential enrichment to prevent connection issues
- ✅ Wazuh event data in Raw Data tab
- ✅ Support for all Wazuh event fields
- ✅ Manual sync script for data enrichment
- ✅ Enhanced Details tab with organized cards
- ✅ Complete metadata display
- ✅ Copy-to-clipboard buttons

### Version 1.0 - Basic Information Display
- Basic alert display (3 tabs)
- Simple metadata display
- Basic raw data (PostgreSQL only)
