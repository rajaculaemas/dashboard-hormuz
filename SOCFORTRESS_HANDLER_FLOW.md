# SOCFortress Integration - Handler Flow Diagram

## 1. ALERT SYNC FLOW

```
┌──────────────────────────────────────────────────────────────┐
│ User klik "Sync Alerts" pada integrasi SOCFortress          │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────┐
    │  POST /api/alerts/sync             │
    │  { integrationId: "socf-001" }     │
    └────────────────┬────────────────────┘
                     │
         ┌───────────┴───────────┐
         │ Check Source Type:    │
         │ source === "socfortress" OR "copilot"? ✅
         │ (juga support stellar-cyber, wazuh, qradar)
         └───────────┬───────────┘
                     │
                     ▼
    ┌──────────────────────────────────────────┐
    │ lib/api/socfortress.ts                   │
    │ getSocfortressAlerts(integrationId)      │
    └────────────────┬─────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │ 1. Get credentials dari integrations.credentials
        │ 2. Connect ke MySQL: 100.100.12.41:3306
        │ 3. Query: SELECT * FROM incident_management_alert
        │    WHERE NOT IN (incident_management_casealertlink)
        │    LIMIT 50
        │ 4. Parse & transform to dashboard format
        │ 5. Return { count, alerts[] }
        └────────────┬────────────┘
                     │
                     ▼
    ┌──────────────────────────────────────────┐
    │ Loop setiap alert:                       │
    │ - Upsert ke alerts table (Prisma)        │
    │ - Update integration.lastSync = NOW()    │
    └────────────┬───────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ Return Response:                         │
    │ {                                        │
    │   success: true,                         │
    │   synced: 50,                            │
    │   total: 50,                             │
    │   errors: 0                              │
    │ }                                        │
    └──────────────────────────────────────────┘
```

## 2. ALERT UPDATE FLOW

```
┌──────────────────────────────────────────────────────────────┐
│ User klik "Update Status" pada Alert → pilih Closed          │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────────┐
    │  POST /api/alerts/update                   │
    │  {                                         │
    │    alertId: "alert-123",                   │
    │    status: "Closed",                       │
    │    severity: "High",                       │
    │    comments: "sudah di-patch"              │
    │  }                                         │
    └────────────────┬─────────────────────────┘
                     │
         ┌───────────┴────────────────────┐
         │ Check authentication & permission
         │ Find alert di database
         └───────────┬────────────────────┘
                     │
         ┌───────────┴──────────────┐
         │ Check alert.integration.source:
         │ source === "socfortress"? ✅
         │ (juga support stellar-cyber, wazuh)
         └───────────┬──────────────┘
                     │
                     ▼
    ┌────────────────────────────────────────────────┐
    │ 1. Update database (PostgreSQL):              │
    │    UPDATE alerts                              │
    │    SET status='Closed', updated_at=NOW()      │
    │    WHERE id='alert-123'                       │
    │                                               │
    │ 2. Catat di alert_timeline (audit log):       │
    │    INSERT status_change event                 │
    │                                               │
    │ 3. Call lib/api/socfortress.ts:               │
    │    updateSocfortressAlertStatus(              │
    │      integrationId,                           │
    │      alertId,                                 │
    │      "Closed",                                │
    │      { comments, assignedTo }                 │
    │    )                                          │
    └────────────┬───────────────────────────────┘
                 │
        ┌────────┴────────┐
        │ Connect to MySQL: 100.100.12.41:3306
        │ 1. UPDATE incident_management_alert
        │    SET status='CLOSED', assigned_to=NULL
        │    WHERE id=1675
        │
        │ 2. INSERT incident_management_comment
        │    (alert_id, comment, user_name, created_at)
        │    VALUES (1675, "sudah di-patch", "system", NOW())
        │
        │ 3. INSERT incident_management_alert_history
        │    (alert_id, change_type, field_name, new_value)
        │    VALUES (1675, 'STATUS_CHANGE', 'status', 'CLOSED')
        └────────┬────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ Return Response:                         │
    │ {                                        │
    │   success: true,                         │
    │   alert: { updated alert data }          │
    │ }                                        │
    └──────────────────────────────────────────┘
```

## 3. CASE SYNC FLOW

```
┌──────────────────────────────────────────────────────────────┐
│ User klik "Sync Cases" pada integrasi SOCFortress           │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────┐
    │  POST /api/cases/sync              │
    │  { integrationId: "socf-001" }     │
    └────────────────┬────────────────────┘
                     │
         ┌───────────┴───────────┐
         │ Check Source Type:    │
         │ source === "socfortress"? ✅
         │ (juga support stellar-cyber, qradar)
         └───────────┬───────────┘
                     │
                     ▼
    ┌──────────────────────────────────────────┐
    │ lib/api/socfortress.ts                   │
    │ getSocfortressCases(integrationId)       │
    └────────────────┬─────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │ 1. Get credentials dari integrations.credentials
        │ 2. Connect ke MySQL: 100.100.12.41:3306
        │ 3. Query: SELECT * FROM incident_management_case
        │    ORDER BY case_creation_time DESC
        │    LIMIT 100
        │ 4. Parse & transform to dashboard format
        │ 5. Return { count, cases[] }
        └────────────┬────────────┘
                     │
                     ▼
    ┌──────────────────────────────────────────┐
    │ Loop setiap case:                        │
    │ - Map MySQL case to dashboard schema     │
    │ - Upsert ke cases table (Prisma)         │
    │ - Link related alerts (via casealertlink)
    │ - Update integration.lastSync = NOW()    │
    └────────────┬───────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ Return Response:                         │
    │ {                                        │
    │   success: true,                         │
    │   synced: 15,                            │
    │   total: 15,                             │
    │   errors: 0                              │
    │ }                                        │
    └──────────────────────────────────────────┘
```

## 4. CASE UPDATE FLOW

```
┌──────────────────────────────────────────────────────────────┐
│ User view Case detail → ubah Status ke "Resolved"           │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────────┐
    │  PUT /api/cases/case-123                   │
    │  {                                         │
    │    status: "Resolved",                     │
    │    assignee: "john@company.com",           │
    │    integrationSource: "socfortress"        │
    │  }                                         │
    └────────────────┬─────────────────────────┘
                     │
         ┌───────────┴──────────────┐
         │ Check integrationSource
         │ === "socfortress"? ✅
         │ (juga support wazuh, stellar-cyber)
         └───────────┬──────────────┘
                     │
                     ▼
    ┌────────────────────────────────────────────────┐
    │ 1. Update database (PostgreSQL):              │
    │    UPDATE cases                              │
    │    SET status='Resolved',                     │
    │        assignee='john@...',                   │
    │        modified_at=NOW()                      │
    │    WHERE id='case-123'                        │
    │                                               │
    │ 2. Call lib/api/socfortress.ts:               │
    │    updateSocfortressCaseStatus(               │
    │      integrationId,                           │
    │      externalId,                              │
    │      "Resolved",                              │
    │      { assignedTo: "john@..." }               │
    │    )                                          │
    └────────────┬───────────────────────────────┘
                 │
        ┌────────┴────────┐
        │ Connect to MySQL: 100.100.12.41:3306
        │ UPDATE incident_management_case
        │ SET case_status='CLOSED',
        │     assigned_to='john@...'
        │ WHERE id=69
        └────────┬────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ Return Response:                         │
    │ {                                        │
    │   success: true,                         │
    │   data: { updated case data }            │
    │ }                                        │
    └──────────────────────────────────────────┘
```

## Status Mapping Reference

### Alert Status

| MySQL Status | Dashboard UI | Description |
|--------------|-------------|-------------|
| OPEN | Open | Alert baru / belum ditangani |
| IN_PROGRESS | In Progress | Alert sedang ditangani |
| CLOSED | Closed | Alert sudah ditutup |

### Case Status

| MySQL Status | Dashboard UI | Description |
|--------------|-------------|-------------|
| OPEN | Open | Case terbuka |
| IN_PROGRESS | In Progress | Case sedang dikerjakan |
| CLOSED | Closed/Resolved | Case sudah selesai |

## Database Transaction Flow

### Sync Alert
```
┌─────────────────────────────┐
│ MySQL: incident_management_alert
│ SELECT * WHERE NOT IN (...)
│ LIMIT 50
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ PostgreSQL: alerts
│ UPSERT via Prisma
│ (externalId = unique key)
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ PostgreSQL: integrations
│ UPDATE lastSync = NOW()
└─────────────────────────────┘
```

### Update Alert
```
┌─────────────────────────────┐
│ PostgreSQL: alerts
│ UPDATE status, metadata
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ PostgreSQL: alert_timeline
│ INSERT status_change event
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ MySQL: incident_management_alert
│ UPDATE status, assigned_to
│ INSERT comment
│ INSERT history
└─────────────────────────────┘
```

## Handler Files Modified

```
✅ CREATED:
  └── lib/api/socfortress.ts (NEW - 400 lines)

✅ UPDATED:
  ├── app/api/alerts/sync/route.ts (+ import + handler)
  ├── app/api/alerts/update/route.ts (+ import + handler)
  ├── app/api/cases/sync/route.ts (+ import + handler)
  └── app/api/cases/[id]/route.ts (+ import + handler)
```

## Testing Checklist

- [ ] Create integration dengan source="socfortress"
- [ ] Verify MySQL credentials di integration.credentials
- [ ] Sync alerts → check alerts table punya data
- [ ] Update alert status → check MySQL alert_history
- [ ] Sync cases → check cases table punya data
- [ ] Update case status → check MySQL case_status updated
- [ ] Check logs: [SOCFortress] messages appear
- [ ] Verify integration.lastSync updated after sync
