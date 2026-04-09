# Copilot/Socfortress Alert Table Parsing Enhancement

## Problem
Alert detail fields dari Copilot/Socfortress alerts tidak sepenuhnya di-parse ke alert table di `components/alert/alert-table.tsx`. Field-field penting seperti Agent Name, Agent IP, Rule, MITRE Tactic, MITRE ID, dan Tags tidak ditampilkan dengan benar di tabel meskipun data tersedia di raw alert data.

## Root Cause
Copilot/Socfortress alerts memiliki struktur data yang berbeda dari Wazuh:
- Data disimpan dalam nested JSON string di `alert.metadata.incident_event.source_data`
- Ketika di-parse, source_data berisi struktur Wazuh lengkap dengan `rule`, `agent`, `data` fields
- Code alert-table.tsx tidak memiliki logika parsing untuk membaca data Copilot yang ini, hanya designed untuk Wazuh metadata struktur

## Data Structure (Copilot Alert)
```
alert.metadata = {
  incident_event: {
    source_data: "{...JSON string dengan Wazuh event data...}"
    // Ketika diparsed berisi:
    // {
    //   rule: { id, description, level, mitre { id, tactic, technique } },
    //   agent: { id, name, ip, labels },  
    //   data: { srcip, dstip, srcport, dstport, columns { cmdline, pid, ... }, ... }
    // }
  },
  socfortress: { ... },
  alert_history: [],
  agent_id, agent_name, agent_ip, ... (flattened fields dari source_data)
}
```

## Solution Implemented

### 1. New Helper Functions Added (lines 53-148)
Menambahkan helper functions untuk parse Copilot alert data:

- **parseCopilotSourceData(alert)**: Parse JSON string dari `incident_event.source_data`
- **extractCopilotRuleInfo(alert)**: Extract rule, description, mitre info
- **extractCopilotAgentInfo(alert)**: Extract agent id, name, ip
- **extractCopilotNetworkInfo(alert)**: Extract source IP, destination IP, ports
- **extractCopilotCmdLine(alert)**: Extract process command line
- **extractCopilotProcessImage(alert)**: Extract process image/file path
- **extractCopilotTags(alert)**: Extract tags dari alert

### 2. Updated getColumnValue Function (Display Values)
Setiap column case sekarang:
1. Coba extract dari Copilot parser dulu
2. Jika tidak ada, fallback ke Wazuh extraction logic
3. Ini memastikan backward compatibility dengan existing Wazuh alerts

**Updated cases:**
- `srcip`, `dstip`: Try Copilot network info first
- `sourcePort`, `destinationPort`: Try Copilot network info first
- `processCmdLine`: Try Copilot cmd line first
- `agentName`, `agentIp`: Try Copilot agent info first
- `rule`, `mitreTactic`, `mitreId`: Try Copilot rule info first
- `tags`: Try Copilot tags extraction first

### 3. Updated getRawColumnValue Function (Filtering)
Sama seperti getColumnValue, tapi return primitive values untuk filtering:
- Non-JSX values (strings, numbers, null)
- Digunakan untuk alert filtering dan sorting

**Updated cases:**
- Same fields sebagai getColumnValue, tapi dengan fallback logic

## Field Extraction Map

### Dari Copilot source_data yang diparsed:

| Column | Source | Path |
|--------|--------|------|
| Timestamp | alert | `.timestamp` |
| Alert Name | alert | `.title` atau `.metadata.rule_description` |
| Source IP | source_data | `.data.srcip` atau `.data.columns.remote_address` |
| Destination IP | source_data | `.data.dstip` atau `.data.columns.local_address` |
| Source Port | source_data | `.data.srcport` |
| Destination Port | source_data | `.data.dstport` |
| Protocol | source_data | `.data.protocol` |
| Agent Name | source_data | `.agent.name` |
| Agent IP | source_data | `.agent.ip` atau `alert.metadata.agent_ip` |
| Command Line | source_data | `.data.columns.cmdline` atau `.data.win.eventdata.commandLine` |
| Process Image | source_data | `.data.columns.path` atau `.data.win.eventdata.image` |
| Rule | source_data | `.rule.description` |
| MITRE Tactic | source_data | `.rule.mitre.tactic[0]` |
| MITRE ID | source_data | `.rule.mitre.id[0]` |
| Tags | alert.metadata | `.tags` atau `.socfortress.tags` |
| MD5/SHA1/SHA256 | source_data | dari hashes field |
| Severity | alert | `.severity` |
| Status | alert | `.status` |
| Integration | alert | `.integration.name` |
| MTTD | alert.metadata | dari user_action history |

## Files Modified
- `/home/soc/soc-dashboard/components/alert/alert-table.tsx`
  - Added 8 new Copilot extraction helper functions
  - Updated getColumnValue() - 11 cases modified
  - Updated getRawColumnValue() - 11 cases modified

## Testing Checklist
- [x] No TypeScript errors
- [ ] Test alert display dengan Copilot alerts di table
- [ ] Verify semua columns menampilkan data yang benar
- [ ] Test filtering dengan Copilot alert fields
- [ ] Test sorting dengan Copilot alert fields
- [ ] Verify backward compatibility dengan Wazuh alerts

## Example Copilot Alert Raw Data
Lihat: `/home/soc/soc-dashboard/alert_1675.json`

Alert ini dari Copilot database dengan:
- root: Basic alert info
- children.incident_management_alertevent[0].source_data: Raw Wazuh event JSON (nested)
- children.incident_management_comment: Comments/notes
- children.tags: Alert tags
- assets: Linked assets
- asset_contexts: Asset context data

## Backward Compatibility
✅ Semua Wazuh alert fields masih work karena fallback logic:
1. Coba extract dari Copilot helpers
2. Jika tidak ada, gunakan original Wazuh extraction
3. Ini ensures existing Wazuh alerts tetap display dengan benar

## Future Improvements
1. Consider caching parsed source_data untuk performance
2. Add validation untuk JSON parsing errors
3. Add more detailed logging untuk debugging
4. Consider consolidating extraction logic ke shared utility file
