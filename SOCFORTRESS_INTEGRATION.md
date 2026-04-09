# SOCFortress (Copilot) MySQL Integration

## Overview

Integrasi SOCFortress memungkinkan aplikasi untuk menarik dan mengelola alerts dan cases dari database MySQL Copilot secara real-time.

## Architecture

Setiap integrasi memiliki handler terpisah:

```
Integration Type: "socfortress" atau "copilot"
├── Pull Alerts (Sync)
│   └── lib/api/socfortress.ts → getSocfortressAlerts()
│       └── app/api/alerts/sync/route.ts → POST /api/alerts/sync
│
├── Update Alert Status
│   └── lib/api/socfortress.ts → updateSocfortressAlertStatus()
│       └── app/api/alerts/update/route.ts → POST /api/alerts/update
│
├── Pull Cases (Sync)
│   └── lib/api/socfortress.ts → getSocfortressCases()
│       └── app/api/cases/sync/route.ts → POST /api/cases/sync
│
└── Update Case Status
    └── lib/api/socfortress.ts → updateSocfortressCaseStatus()
        └── app/api/cases/[id]/route.ts → PUT /api/cases/[id]
```

## File Structure

### 1. **lib/api/socfortress.ts** (BARU)
Handler utama untuk semua operasi SOCFortress

**Functions:**
- `getSocfortressCredentials(integrationId)` - Ambil MySQL credentials dari integration config
- `getConnection(credentials)` - Create MySQL connection
- `fetchUnlinkedAlerts(conn, limit)` - Query alerts yang tidak linked ke case
- `fetchRecentCases(conn, limit)` - Query cases terbaru
- `getSocfortressAlerts(integrationId, options)` - Sync alerts dari MySQL ke database
- `getSocfortressCases(integrationId, options)` - Sync cases dari MySQL ke database
- `updateSocfortressAlertStatus(integrationId, alertId, status, options)` - Update alert status di MySQL
- `updateSocfortressCaseStatus(integrationId, caseId, status, options)` - Update case status di MySQL

**Status Mapping:**
```
MySQL Status       →  Dashboard Status
─────────────────────────────────────
OPEN              →  Open
IN_PROGRESS       →  In Progress
CLOSED            →  Closed
```

### 2. **app/api/alerts/sync/route.ts** (UPDATED)
Endpoint untuk sync alerts dari berbagai sumber

**New Handler:**
```typescript
if (source === "socfortress" || source === "copilot") {
  const result = await getSocfortressAlerts(integrationId, { limit: 100 })
  // Upsert alerts ke database
  // Update integration.lastSync
}
```

### 3. **app/api/alerts/update/route.ts** (UPDATED)
Endpoint untuk update alert status

**New Handler:**
```typescript
if (alert.integration.source === "socfortress" || source === "copilot") {
  await updateSocfortressAlertStatus(
    alert.integrationId,
    alert.externalId,
    normalizedStatus,
    { comments, assignedTo: assignee }
  )
}
```

### 4. **app/api/cases/sync/route.ts** (UPDATED)
Endpoint untuk sync cases

**New Handler:**
```typescript
if (source === "socfortress" || source === "copilot") {
  const casesResponse = await getSocfortressCases(integrationId, { limit: 100 })
  stellarCases = casesResponse.cases || []
}
```

### 5. **app/api/cases/[id]/route.ts** (UPDATED)
Endpoint untuk update case status

**New Handler:**
```typescript
if (integrationSource === "socfortress" || "copilot") {
  // Update database
  const updatedCase = await prisma.case.update(...)
  
  // Sync to MySQL
  await updateSocfortressCaseStatus(
    integrationId,
    externalId,
    status,
    { assignedTo: assignee }
  )
}
```

## Database Schema

### Integration Credentials
Simpan di `integrations.credentials` (JSON):

```json
{
  "host": "100.100.12.41",
  "port": 3306,
  "user": "copilot",
  "password": "...",
  "database": "copilot"
}
```

### Alert Metadata (MySQL → Dashboard)
Stored di `alerts.metadata`:

```json
{
  "socfortress": {
    "id": 1675,
    "customer_code": "posindonesia",
    "source": "wazuh",
    "assigned_to": "sultan",
    "time_closed": "2026-02-04 11:07:17"
  }
}
```

### Case Metadata (MySQL → Dashboard)
Stored di `cases.metadata`:

```json
{
  "socfortress": {
    "id": 69,
    "customer_code": "posindonesia",
    "assigned_to": "soc247"
  }
}
```

## MySQL Copilot Tables Used

### Alerts
- `incident_management_alert` (main table)
  - Columns: `id`, `alert_name`, `alert_description`, `status`, `alert_creation_time`, `severity`, `assigned_to`, `time_closed`
- `incident_management_alert_history` (changelog)
- `incident_management_comment` (comments)
- `incident_management_casealertlink` (link to cases)

### Cases
- `incident_management_case` (main table)
  - Columns: `id`, `case_name`, `case_description`, `case_status`, `case_creation_time`, `severity`, `assigned_to`
- `incident_management_casealertlink` (link to alerts)

## Setup Instructions

### 1. Create Integration

```bash
# Admin akses: Integrations → Add Integration
# Isi form:
- Name: "SOCFortress Production"
- Type/Source: "socfortress"
- Host: "100.100.12.41"
- Port: 3306
- User: "copilot"
- Password: "..."
- Database: "copilot"
```

### 2. Sync Alerts

```bash
POST /api/alerts/sync
{
  "integrationId": "integ-xxx"
}
```

### 3. Update Alert

```bash
POST /api/alerts/update
{
  "alertId": "alert-xxx",
  "status": "Closed",
  "comments": "sudah diatasi"
}
```

### 4. Sync Cases

```bash
POST /api/cases/sync
{
  "integrationId": "integ-xxx"
}
```

### 5. Update Case

```bash
PUT /api/cases/case-xxx
{
  "status": "Resolved",
  "assignee": "john@company.com"
}
```

## Comparison: Handler per Integration

| Feature | Stellar Cyber | Wazuh | QRadar | SOCFortress |
|---------|---------------|-------|--------|-------------|
| Sync Alerts | ✅ | ✅ | ✅ | ✅ |
| Update Alert Status | ✅ | ✅ | ❌ | ✅ |
| Sync Cases | ✅ | ❌ | ❌ (via Tickets) | ✅ |
| Update Case Status | ✅ | ❌ | ❌ | ✅ |
| Credentials Location | Integration + User | Integration | Integration | Integration |
| Data Source | SIEM API | Elasticsearch | QRadar API | MySQL Database |

## Error Handling

Semua handler memiliki try-catch:
- Database errors di-log tapi tidak halt sync
- External API errors di-log tapi sync tetap lanjut (data lokal tetap updated)
- Jika update di source system gagal, data lokal tetap berhasil di-update

## Logging

Format: `[SOCFortress] message` untuk mudah di-identify di logs:

```
[SOCFortress] Starting sync for: integ-abc123
[SOCFortress] Fetched 50 alerts
[SOCFortress] Error getting alerts: connection timeout
[SOCFortress] Successfully updated case in SOCFortress
```

## Future Enhancements

1. **Batch Operations** - Update multiple alerts/cases sekaligus
2. **Webhooks** - Real-time sync dari MySQL menggunakan MySQL triggers
3. **Caching** - Cache connection pool untuk performance
4. **Audit Trail** - Track semua changes dari user
5. **Delta Sync** - Only sync yang berubah (gunakan `last_sync` timestamp)
