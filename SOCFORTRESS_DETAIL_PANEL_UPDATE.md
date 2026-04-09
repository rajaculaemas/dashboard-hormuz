# SOCFortress Alert Detail Panel Enhancement

## Overview
Updated the SOCFortress alert detail panel to match the structure and functionality of the Wazuh alert detail dialog, providing better organization and more comprehensive information display.

## Changes Made

### File Modified
- `components/alert/socfortress-alert-detail-dialog.tsx`

### New Sections Added

#### 1. **Alert Information**
Displays basic alert details in a structured grid:
- Alert ID
- Timestamp
- Severity (with color badge)
- Status (with color badge)
- Source System
- Customer Code

#### 2. **Rule Information** (Conditional - only shows if Wazuh rule data exists)
Displays Wazuh rule details extracted from incident event:
- Rule ID
- Rule Level
- Description
- Groups (as badges)
- MITRE ATT&CK information (ID, Tactic, Technique)

#### 3. **Agent Information** (Conditional - only shows if agent data exists)
Displays source agent/host details:
- Agent ID
- Agent Name
- Agent IP
- Labels (key-value pairs)

#### 4. **Network Information** (Conditional - only shows if network data exists)
Displays network-related data with reputation checking:
- **Source IP** - with "Check" button to verify IP reputation (VirusTotal)
- **Destination IP** - with "Check" button to verify IP reputation
- Source Port
- Destination Port

#### 5. **File Monitoring** (Conditional - only shows if file/process data exists)
Displays file and process information with hash verification:
- File Path
- Command Line (full command with arguments)
- Process Name
- Process ID & Parent Process ID
- **MD5 Hash** - with "Check MD5" button to verify against VirusTotal
- **SHA1 Hash** - with "Check SHA1" button to verify against VirusTotal
- **SHA256 Hash** - with "Check SHA256" button to verify against VirusTotal

#### 6. **Organization & Assignment**
Displays metadata about alert management:
- Assigned To
- Customer Code
- Created timestamp
- Updated timestamp
- Closed timestamp

#### 7. **Alert Description**
Scrollable area with full alert description text.

## Data Extraction Logic

The detail panel intelligently extracts data from the incident event source data (which contains Wazuh alert data):

```typescript
// Rule data from: eventSourceData.rule.*
getRuleInfo() -> ruleId, ruleLevel, ruleDescription, ruleGroups, ruleMitre

// Agent data from: eventSourceData.agent.*
getAgentInfo() -> agentId, agentName, agentIp, agentLabels

// Network data from: eventSourceData.data.* (supports multiple formats)
getNetworkInfo() -> srcIp, dstIp, srcPort, dstPort

// File/Process data from: eventSourceData.data.* (supports multiple formats)
getFileInfo() -> filePath, cmdLine, md5, sha1, sha256, processName, processId, parentProcessId
```

## Features

### 1. **IP Reputation Checking**
- Click "Check" button next to Source IP or Destination IP
- Opens IpReputationDialog to query VirusTotal
- Helps identify malicious IP addresses

### 2. **Hash Reputation Checking**
- Click "Check" buttons next to file hashes (MD5, SHA1, SHA256)
- Opens HashReputationDialog to query VirusTotal
- Helps identify malicious files and malware

### 3. **Conditional Rendering**
- Sections only appear if relevant data exists
- Prevents empty cards and keeps UI clean
- Example: Rule Information only shows if alert comes from Wazuh

### 4. **Structured Layout**
- Grid-based layout for organized information
- Consistent spacing and typography
- Icon indicators for each section
- Badges for status, severity, and groups

## UI Components Used

- **Card**: Container for each information section
- **Badge**: Status, severity, and group indicators
- **Button**: IP and hash reputation checking
- **Separator**: Visual separation between subsections
- **Icons**: Shield, Network, HardDrive for section identification

## Integration with Reputation Dialogs

```typescript
// IP Reputation Dialog
<IpReputationDialog
  open={ipDialogOpen}
  onOpenChange={setIpDialogOpen}
  ip={selectedIp}
/>

// Hash Reputation Dialog
<HashReputationDialog
  open={hashDialogOpen}
  onOpenChange={setHashDialogOpen}
  hash={selectedHash.value}
  type={selectedHash.type}
/>
```

## Example Alert Display

### Alert #1686 - Detects System Information Discovery commands

**Alert Information**
- Alert ID: 1686
- Timestamp: 2026-02-04 11:01:53
- Severity: Low
- Status: Closed
- Source System: wazuh
- Customer Code: posindonesia

**Rule Information**
- Rule ID: 200284
- Level: 12
- Description: Detects System Information Discovery commands.
- Groups: osquery, bpf_process_events
- MITRE ATT&CK: T1082 - System Information Discovery (Discovery)

**Agent Information**
- Agent ID: 104
- Agent Name: WAF-AWS-EKS-JKT
- Agent IP: 192.169.64.12
- Labels: customer: posindonesia

**File Monitoring**
- File Path: /bin/bash
- Command Line: bash -c 'while true; do sleep 1;head -v -n 8 /proc/meminfo; ...'
- Process Name: bash
- Process ID: 204899
- Parent Process ID: 202452

## Benefits

1. **Better Information Organization** - Related information grouped into logical sections
2. **Improved UX** - Consistent with Wazuh alert detail panel
3. **Enhanced Security Investigation** - Quick IP and hash reputation checks
4. **Flexible Display** - Sections appear only when relevant data exists
5. **Detailed Context** - Complete alert information in one place for analysis

## Backward Compatibility

- Changes are fully backward compatible
- Legacy alert detail display still works
- New sections appear dynamically based on available data
- No breaking changes to API or data structure

## Future Enhancements

Potential improvements:
- Domain/URL reputation checking
- Process tree visualization
- Timeline view of related events
- Case/ticket integration
- Custom field mapping for different alert sources
