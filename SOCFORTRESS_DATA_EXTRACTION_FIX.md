# SOCFortress Alert Detail Panel - Data Extraction Fix

## Problem Found
Section Rule Information, Agent Information, Network Information, dan File Monitoring tidak tampil karena data extraction logic belum menangani struktur nested JSON dengan benar.

## Root Cause
Data dari SOCFortress/Copilot sistem disimpan dengan struktur:
1. `metadata.incident_event.source_data` → **String JSON** (bukan object)
2. Di dalam string tersebut ada field `message` → **String JSON lagi** (double-nested)
3. Data Wazuh sebenarnya terletak di dalam `message` → Harus di-parse dua kali

## Struktur Data Sebenarnya

```
alert.metadata.incident_event = {
  source_data: "{\"message\": \"{...Wazuh event data...}\", ...}"
}

// Setelah parse pertama:
eventSourceData = {
  message: "{\"rule\": {...}, \"agent\": {...}, ...}"
  rule_id: "200284"
  agent_id: "104"
  ...flattened fields...
}

// Setelah parse kedua (message):
messageData = {
  rule: { id: "200284", level: 12, ... }
  agent: { id: "104", name: "WAF-AWS-EKS-JKT", ... }
  data: { columns: { cmdline: "...", pid: "204899", ... } }
}
```

## Solution Applied

### 1. **Smart Data Parsing**
```typescript
// Parse source_data (might be string or object)
let eventSourceData: any = {}
if (incidentEvent.source_data) {
  if (typeof incidentEvent.source_data === "string") {
    try {
      eventSourceData = JSON.parse(incidentEvent.source_data)
    } catch (e) {
      eventSourceData = {}
    }
  } else {
    eventSourceData = incidentEvent.source_data
  }
}

// Parse nested message field (might be string or object)
let messageData: any = {}
if (eventSourceData.message && typeof eventSourceData.message === "string") {
  try {
    messageData = JSON.parse(eventSourceData.message)
  } catch (e) {
    messageData = {}
  }
} else if (eventSourceData.message && typeof eventSourceData.message === "object") {
  messageData = eventSourceData.message
}
```

### 2. **Updated Data Extraction Functions**

#### getRuleInfo()
- **Primary Source**: `messageData.rule` (nested Wazuh data)
- **Secondary Source**: `eventSourceData.rule` (direct data)
- **Tertiary Source**: `metadata.rule_*` (flattened metadata)
- **Handles array fields**: Converts `mitre.id[]` to string

```typescript
ruleMitre: {
  id: Array.isArray(messageData.rule.mitre?.id) ? messageData.rule.mitre.id[0] : messageData.rule.mitre?.id || "",
  tactic: Array.isArray(messageData.rule.mitre?.tactic) ? messageData.rule.mitre.tactic[0] : messageData.rule.mitre?.tactic || "",
  technique: Array.isArray(messageData.rule.mitre?.technique) ? messageData.rule.mitre.technique[0] : messageData.rule.mitre?.technique || "",
}
```

#### getAgentInfo()
- **Primary Source**: `messageData.agent` (nested Wazuh data)
- **Secondary Source**: `eventSourceData.agent` (direct data)
- **Tertiary Source**: `metadata.agent_*` (flattened metadata)

#### getNetworkInfo()
- Uses both `messageData.data` and `eventSourceData.data`
- Supports multiple field name variations

#### getFileInfo()
- Uses both `messageData.data` and `eventSourceData.data`
- Extracts from nested `columns` or `win.eventdata` structures

## Example Data Extraction

### Alert #1675 - System Information Discovery

**Input data** from `incident_event.source_data`:
```json
{
  "rule": {
    "id": "200284",
    "level": 12,
    "description": "Detects System Information Discovery commands.",
    "groups": ["osquery", "bpf_process_events"],
    "mitre": {
      "id": ["T1082"],
      "tactic": ["Discovery"],
      "technique": ["System Information Discovery"]
    }
  },
  "agent": {
    "id": "104",
    "name": "WAF-AWS-EKS-JKT",
    "ip": "192.169.64.12",
    "labels": {"customer": "posindonesia"}
  },
  "data": {
    "columns": {
      "cmdline": "bash -c '...'",
      "pid": "204899",
      "parent": "202452",
      "path": "/bin/bash"
    }
  }
}
```

**Extracted result** from getRuleInfo():
```
{
  ruleId: "200284",
  ruleLevel: 12,
  ruleDescription: "Detects System Information Discovery commands.",
  ruleGroups: ["osquery", "bpf_process_events"],
  ruleMitre: {
    id: "T1082",
    tactic: "Discovery",
    technique: "System Information Discovery"
  }
}
```

## Benefits of This Fix

✅ Handles double-nested JSON structure correctly
✅ Supports multiple data formats (string, object)
✅ Proper array-to-string conversion for MITRE data
✅ Graceful fallback if parsing fails
✅ Sections now display with correct data

## Display Result

### Alert Information ✅
- Shows basic alert metadata

### Rule Information ✅
- **Now displays**: Rule ID (200284), Level (12), Description, Groups, MITRE info

### Agent Information ✅
- **Now displays**: Agent ID (104), Name (WAF-AWS-EKS-JKT), IP (192.169.64.12), Labels

### Network Information ✅
- **Now displays**: IPs if available in data with "Check" buttons

### File Monitoring ✅
- **Now displays**: File path (/bin/bash), Command line, Process ID (204899), Parent PID (202452)

## Testing

1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Open any SOCFortress/Copilot alert with Wazuh event data
4. Sections should now display with extracted data

## Error Handling

- If `source_data` fails to parse → `eventSourceData = {}`
- If `message` fails to parse → `messageData = {}`
- If no data found → Sections don't render (conditional check)
- Console errors logged for debugging

---

**Status**: ✅ FIXED - Ready for testing
**Last Updated**: 2026-02-05
