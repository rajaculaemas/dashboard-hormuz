# ⚙️ INSTALLATION & SETUP - SOCFortress Integration

## 🚀 Installation Steps

### 1. Install Dependencies

**mysql2** telah ditambahkan ke `package.json`. Jalankan command berikut:

```bash
# Using npm
npm install

# OR using pnpm
pnpm install

# OR using yarn
yarn install
```

### 2. Verify Installation

```bash
# Check mysql2 sudah terinstall
npm list mysql2
# Should show: mysql2@3.6.5
```

### 3. Create Integration di Dashboard

Admin harus membuat integration baru dengan:
- **Name**: "SOCFortress Production" (atau nama lain)
- **Type/Source**: `socfortress` atau `copilot`
- **Credentials** (dalam JSON):
  ```json
  {
    "host": "100.100.12.41",
    "port": 3306,
    "user": "copilot",
    "password": "POUTHBLJvhvcasgFDS98",
    "database": "copilot"
  }
  ```

## ✅ What Was Done

### Files Created
- ✅ `lib/api/socfortress.ts` - Core handler (450+ lines)

### Files Updated
- ✅ `app/api/alerts/sync/route.ts` - Added SOCFortress sync handler
- ✅ `app/api/alerts/update/route.ts` - Added SOCFortress update handler  
- ✅ `app/api/cases/sync/route.ts` - Added SOCFortress sync handler
- ✅ `app/api/cases/[id]/route.ts` - Added SOCFortress update handler
- ✅ `package.json` - Added `mysql2` dependency

### Documentation Created
- ✅ `SOCFORTRESS_INTEGRATION.md` - Complete integration guide
- ✅ `SOCFORTRESS_HANDLER_FLOW.md` - Detailed flow diagrams
- ✅ `SOCFORTRESS_QUICK_REFERENCE.md` - Quick reference guide
- ✅ `INSTALLATION_SOCFORTRESS.md` - This file

## 📋 Handler Summary

### 4 Main Handlers Added

#### 1. Alert Sync
**Function**: `getSocfortressAlerts(integrationId, options)`
**Location**: `lib/api/socfortress.ts`
**Endpoint**: `POST /api/alerts/sync`
**What it does**: 
- Query MySQL: `SELECT * FROM incident_management_alert WHERE NOT IN (casealertlink) LIMIT 50`
- Transform data to dashboard schema
- Upsert to PostgreSQL `alerts` table
- Update `integrations.lastSync`

#### 2. Alert Update
**Function**: `updateSocfortressAlertStatus(integrationId, alertId, status, options)`
**Location**: `lib/api/socfortress.ts`
**Endpoint**: `POST /api/alerts/update`
**What it does**:
- Update PostgreSQL `alerts` table
- Insert into `alert_timeline` (audit log)
- UPDATE MySQL `incident_management_alert` status
- INSERT MySQL `incident_management_comment`
- INSERT MySQL `incident_management_alert_history`

#### 3. Case Sync
**Function**: `getSocfortressCases(integrationId, options)`
**Location**: `lib/api/socfortress.ts`
**Endpoint**: `POST /api/cases/sync`
**What it does**:
- Query MySQL: `SELECT * FROM incident_management_case ORDER BY case_creation_time DESC LIMIT 100`
- Transform data to dashboard schema
- Upsert to PostgreSQL `cases` table
- Link related alerts via `casealertlink`

#### 4. Case Update
**Function**: `updateSocfortressCaseStatus(integrationId, caseId, status, options)`
**Location**: `lib/api/socfortress.ts`
**Endpoint**: `PUT /api/cases/[id]`
**What it does**:
- Update PostgreSQL `cases` table
- UPDATE MySQL `incident_management_case` status & assignee
- Handle relationship with linked alerts

## 🔄 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SOC Dashboard                            │
│  (Next.js Frontend + API)                                   │
└──────────────────────────┬────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼────┐         ┌───▼────┐       ┌───▼────┐
    │ /alerts/│         │ /cases/│       │ /integ-│
    │  sync   │         │  sync  │       │rations │
    └───┬────┘         └───┬────┘       └────────┘
        │                  │
        │  getSocfortress  │  getSocfortress
        │  Alerts()        │  Cases()
        │                  │
        └──────────┬───────┘
                   │
        ┌──────────▼──────────────────┐
        │  lib/api/socfortress.ts     │
        │  - Get credentials          │
        │  - Create MySQL connection  │
        │  - Query tables             │
        │  - Transform data           │
        │  - Handle errors            │
        └──────────┬──────────────────┘
                   │
        ┌──────────▼──────────────────┐
        │  MySQL Copilot Database     │
        │  100.100.12.41:3306         │
        │  ├─ incident_management...  │
        │  │  - alert (50 tables)     │
        │  │  - case (10 tables)      │
        │  └─ ...                     │
        └─────────────────────────────┘
```

## 📊 Supported Operations

| Operation | Source | Destination | Handler |
|-----------|--------|-------------|---------|
| Pull alerts | MySQL | PostgreSQL | `getSocfortressAlerts()` |
| Update alert | PostgreSQL + MySQL | Both | `updateSocfortressAlertStatus()` |
| Pull cases | MySQL | PostgreSQL | `getSocfortressCases()` |
| Update case | PostgreSQL + MySQL | Both | `updateSocfortressCaseStatus()` |

## 🧪 Testing

### 1. Setup Test Integration

```bash
curl -X POST http://localhost:3000/api/integrations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SOCFortress Test",
    "source": "socfortress",
    "credentials": {
      "host": "100.100.12.41",
      "port": 3306,
      "user": "copilot",
      "password": "POUTHBLJvhvcasgFDS98",
      "database": "copilot"
    }
  }'
```

### 2. Test Alert Sync

```bash
curl -X POST http://localhost:3000/api/alerts/sync \
  -H "Content-Type: application/json" \
  -d '{
    "integrationId": "integ-from-step-1"
  }'
```

### 3. Test Alert Update

```bash
curl -X POST http://localhost:3000/api/alerts/update \
  -H "Content-Type: application/json" \
  -d '{
    "alertId": "alert-from-sync",
    "status": "Closed",
    "comments": "Test update"
  }'
```

### 4. Test Case Sync

```bash
curl -X POST http://localhost:3000/api/cases/sync \
  -H "Content-Type: application/json" \
  -d '{
    "integrationId": "integ-from-step-1"
  }'
```

### 5. Test Case Update

```bash
curl -X PUT http://localhost:3000/api/cases/case-from-sync \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Resolved",
    "assignee": "john@company.com",
    "integrationSource": "socfortress"
  }'
```

## 🔍 Verification Checklist

After installation:

- [ ] Run `npm install` / `pnpm install` successfully
- [ ] No TypeScript compilation errors
- [ ] Created SOCFortress integration in dashboard
- [ ] Verified MySQL credentials are correct
- [ ] Tested alert sync (check PostgreSQL alerts table)
- [ ] Tested alert update (check MySQL alert_history)
- [ ] Tested case sync (check PostgreSQL cases table)
- [ ] Tested case update (check MySQL case_status)
- [ ] Check logs for `[SOCFortress]` messages
- [ ] Verify `integration.lastSync` is updated

## 📝 Important Notes

### Credentials
- Credentials disimpan di `integrations.credentials` (JSON)
- Tidak di-encrypt (consider adding encryption layer)
- Support multiple SOCFortress instances dengan integration berbeda

### Error Handling
- Database errors di-log tapi tidak halt operasi
- Jika MySQL update gagal, PostgreSQL update tetap berhasil
- Next sync akan retry failed updates

### Performance
- Alert sync: Fetch ~50 unlinked alerts per sync
- Case sync: Fetch ~100 cases per sync
- Timezone: Uses database default timezone
- Connection: Auto-closed setelah setiap operasi

### Status Mapping
```
OPEN        ←→ Open
IN_PROGRESS ←→ In Progress  
CLOSED      ←→ Closed
```

### Metadata Storage
All MySQL context stored in PostgreSQL `metadata` field (JSON) for reference:
- `metadata.socfortress.id` - Original MySQL ID
- `metadata.socfortress.customer_code` - Customer
- `metadata.socfortress.assigned_to` - Assignee name
- `metadata.socfortress.time_closed` - Close timestamp

## 🚨 Troubleshooting

### MySQL Connection Failed
```
Error: ECONNREFUSED 100.100.12.41:3306
Solution:
  1. Verify MySQL server is running
  2. Check host/port in credentials
  3. Check firewall rules
  4. Test: mysql -h 100.100.12.41 -u copilot -p
```

### MySQL Auth Failed
```
Error: Access denied for user 'copilot'@...
Solution:
  1. Verify username & password
  2. Check user grants: GRANT ALL ON copilot.* TO 'copilot'@'%';
  3. Verify MySQL user exists
```

### Alert/Case Not Found
```
Error: Alert not found in MySQL
Solution:
  1. Check alert exists in incident_management_alert
  2. Verify externalId matches MySQL id
  3. Check customer_code matches
```

### Compilation Error: Cannot find mysql2
```
Error: Cannot find module 'mysql2/promise'
Solution:
  1. Run: npm install mysql2
  2. Run: npm install (reinstall all)
  3. Clear node_modules: rm -rf node_modules && npm install
  4. Check package.json has mysql2 listed
```

## 📚 Related Documentation

- `README.md` - General project overview
- `ARCHITECTURE_DIAGRAM.md` - System architecture
- `SOCFORTRESS_INTEGRATION.md` - Complete integration guide
- `SOCFORTRESS_HANDLER_FLOW.md` - Detailed handler flows
- `SOCFORTRESS_QUICK_REFERENCE.md` - Quick reference

## ✨ Summary

Anda sekarang memiliki handler lengkap untuk SOCFortress MySQL integration:
- ✅ Pull alerts dari MySQL
- ✅ Update alert status di MySQL  
- ✅ Pull cases dari MySQL
- ✅ Update case status di MySQL
- ✅ Error handling & logging
- ✅ Complete documentation

Selanjutnya, install dependencies dan mulai menggunakan!
