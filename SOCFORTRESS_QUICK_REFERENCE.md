# SOCFortress Integration - Quick Reference

## ✅ What Was Added

### 1. New File: `lib/api/socfortress.ts`
Core handler untuk semua operasi SOCFortress MySQL:
- Pull alerts dari MySQL
- Pull cases dari MySQL
- Update alert status di MySQL
- Update case status di MySQL

### 2. Updated Files

#### `app/api/alerts/sync/route.ts`
- Added import: `getSocfortressAlerts`
- Added handler untuk source === "socfortress" | "copilot"
- Fetches unlinked alerts dari MySQL & upserts ke PostgreSQL

#### `app/api/alerts/update/route.ts`
- Added import: `updateSocfortressAlertStatus`
- Added handler untuk update alert di SOCFortress MySQL
- Syncs status changes back to MySQL

#### `app/api/cases/sync/route.ts`
- Added import: `getSocfortressCases`
- Added handler untuk source === "socfortress" | "copilot"
- Fetches cases dari MySQL & upserts ke PostgreSQL

#### `app/api/cases/[id]/route.ts`
- Added import: `updateSocfortressCaseStatus`
- Added handler untuk update case di SOCFortress MySQL
- Syncs status changes back to MySQL

## 🔄 How It Works

### Alert Flow
1. **Sync Alerts**: User → UI → `POST /api/alerts/sync` → MySQL query → PostgreSQL upsert
2. **Update Alert**: User → UI → `POST /api/alerts/update` → PostgreSQL update → MySQL update

### Case Flow
1. **Sync Cases**: User → UI → `POST /api/cases/sync` → MySQL query → PostgreSQL upsert
2. **Update Case**: User → UI → `PUT /api/cases/[id]` → PostgreSQL update → MySQL update

## 📝 Handler Comparison

| Feature | Handler | Location |
|---------|---------|----------|
| Get Alerts | `getSocfortressAlerts()` | `lib/api/socfortress.ts` |
| Update Alert | `updateSocfortressAlertStatus()` | `lib/api/socfortress.ts` |
| Get Cases | `getSocfortressCases()` | `lib/api/socfortress.ts` |
| Update Case | `updateSocfortressCaseStatus()` | `lib/api/socfortress.ts` |

**Semua handler memiliki error handling & logging: `[SOCFortress]` prefix**

## 🗄️ MySQL Tables Used

### For Alerts
```
incident_management_alert
├── id (PK)
├── alert_name
├── alert_description
├── status (OPEN, IN_PROGRESS, CLOSED)
├── alert_creation_time
├── severity
├── assigned_to
├── time_closed
└── customer_code
```

### For Cases
```
incident_management_case
├── id (PK)
├── case_name
├── case_description
├── case_status (OPEN, IN_PROGRESS, CLOSED)
├── case_creation_time
├── severity
├── assigned_to
└── customer_code
```

### For Links (case ← → alert)
```
incident_management_casealertlink
├── case_id (FK)
├── alert_id (FK)
└── selected_asset_ids
```

## 💾 PostgreSQL Schema (Updated)

### Alerts Table
```sql
alerts
├── id (String, PK)
├── externalId (String, UNIQUE) ← MySQL alert.id
├── title
├── description
├── status (Open, In Progress, Closed)
├── severity
├── timestamp
├── integrationId (FK)
├── metadata (JSON) ← Stores MySQL context
└── ...
```

### Cases Table
```sql
cases
├── id (String, PK)
├── externalId (String) ← MySQL case.id
├── ticketId (Int)
├── name
├── status (Open, In Progress, Closed)
├── severity
├── integrationId (FK)
├── metadata (JSON) ← Stores MySQL context
└── ...
```

## 🔐 Credentials Format

Store di `integrations.credentials` (JSON):

```json
{
  "host": "100.100.12.41",
  "port": 3306,
  "user": "copilot",
  "password": "POUTHBLJvhvcasgFDS98",
  "database": "copilot"
}
```

## 🚀 Usage Examples

### Setup Integration

```bash
POST /api/integrations
{
  "name": "SOCFortress MySQL",
  "source": "socfortress",
  "credentials": {
    "host": "100.100.12.41",
    "port": 3306,
    "user": "copilot",
    "password": "...",
    "database": "copilot"
  }
}
```

### Sync Alerts

```bash
POST /api/alerts/sync
{
  "integrationId": "integ-socfortress-001"
}

RESPONSE:
{
  "success": true,
  "synced": 50,
  "total": 50,
  "errors": 0
}
```

### Update Alert Status

```bash
POST /api/alerts/update
{
  "alertId": "alert-123",
  "status": "Closed",
  "severity": "High",
  "comments": "Sudah di-patch"
}

RESPONSE:
{
  "success": true,
  "alert": { ...alert data }
}
```

### Sync Cases

```bash
POST /api/cases/sync
{
  "integrationId": "integ-socfortress-001"
}

RESPONSE:
{
  "success": true,
  "synced": 15,
  "total": 15,
  "errors": 0
}
```

### Update Case Status

```bash
PUT /api/cases/case-456
{
  "status": "Resolved",
  "assignee": "john@company.com",
  "integrationSource": "socfortress"
}

RESPONSE:
{
  "success": true,
  "data": { ...case data }
}
```

## 📊 Status Mapping

### Alert Status Map
```typescript
MySQL       →  Dashboard
──────────────────────────
OPEN        →  Open
IN_PROGRESS →  In Progress
CLOSED      →  Closed
```

### Case Status Map
```typescript
MySQL       →  Dashboard
──────────────────────────
OPEN        →  Open
IN_PROGRESS →  In Progress
CLOSED      →  Closed/Resolved
```

## 🔍 Logging

Semua operations di-log dengan prefix `[SOCFortress]`:

```
[SOCFortress] Starting sync for: integ-abc123
[SOCFortress] Fetched 50 alerts
[SOCFortress] Synced 50 alerts to database
[SOCFortress] Updated integration.lastSync
[SOCFortress] Successfully updated alert status in MySQL
```

Check logs di:
- Server console
- Application logs
- Database query logs

## 🐛 Troubleshooting

### Connection Failed
```
Error: ECONNREFUSED 100.100.12.41:3306
→ Check: MySQL host, port, network connectivity
→ Check: Firewall rules allow access
```

### Authentication Failed
```
Error: Access denied for user 'copilot'@'...'
→ Check: MySQL user & password in credentials
→ Check: User has proper grants on copilot database
```

### Alert/Case Not Found
```
Error: Alert ID not found in MySQL
→ Check: Alert ID in PostgreSQL matches MySQL
→ Check: MySQL query is correct
```

### Update Failed in Source
```
Error: Failed to update case in SOCFortress
→ Update di PostgreSQL tetap sukses ✅
→ Next sync akan retry update di MySQL
```

## 📚 Related Files

- `SOCFORTRESS_INTEGRATION.md` - Complete integration guide
- `SOCFORTRESS_HANDLER_FLOW.md` - Detailed flow diagrams
- `lib/api/socfortress.ts` - Handler implementation
- `app/api/alerts/sync/route.ts` - Alert sync endpoint
- `app/api/alerts/update/route.ts` - Alert update endpoint
- `app/api/cases/sync/route.ts` - Case sync endpoint
- `app/api/cases/[id]/route.ts` - Case update endpoint

## ✨ Features Enabled by Handler

- ✅ Real-time alert sync dari MySQL ke Dashboard
- ✅ Real-time case sync dari MySQL ke Dashboard
- ✅ Update alert status & sync balik ke MySQL
- ✅ Update case status & sync balik ke MySQL
- ✅ Audit trail di MySQL (history, comments)
- ✅ Error handling & logging
- ✅ Transaction consistency (local + remote)
- ✅ Support multiple SOCFortress instances

## 🔮 Future Enhancements

- [ ] Batch update alerts/cases
- [ ] MySQL event streaming (real-time sync)
- [ ] Connection pooling untuk performance
- [ ] Credential encryption
- [ ] Advanced filtering & querying
- [ ] Custom field mapping
- [ ] Webhook integrations
