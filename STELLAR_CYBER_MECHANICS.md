# Mekanisme Penarikan & Update Stellar Cyber

## 🎯 Ringkasan Umum

Sistem memiliki 4 operasi utama dengan Stellar Cyber:
1. **Pull Alerts** - Menarik alert dari Stellar Cyber
2. **Pull Cases** - Menarik case dari Stellar Cyber  
3. **Update Alerts** - Mengubah status alert di Stellar Cyber & database lokal
4. **Update Cases** - Mengubah status case di Stellar Cyber & database lokal

---

## 1. 📥 PULL ALERTS DARI STELLAR CYBER

### File Utama
- **[lib/api/stellar-cyber.ts](lib/api/stellar-cyber.ts)** - Logika fetch alerts
- **[app/api/alerts/sync/route.ts](app/api/alerts/sync/route.ts)** - API endpoint untuk trigger sync
- **[app/api/cron/sync-alerts/route.ts](app/api/cron/sync-alerts/route.ts)** - Cron job untuk auto-sync
- **[app/api/alerts/auto-sync/route.ts](app/api/alerts/auto-sync/route.ts)** - Auto-sync integration

### Alur Kerja
```
1. Trigger Sync (manual/cron)
   ↓
2. GET /api/alerts/sync (POST request)
   ↓
3. Call getAlerts() di stellar-cyber.ts
   ↓
4. getAccessToken() - Dapatkan bearer token
   ↓
5. Fetch dari /connect/api/data/aella-ser-*/_search
   ↓
6. Parse & store ke Prisma database
   ↓
7. Hapus duplikat, update lastSync timestamp
```

### Fungsi: `getAlerts()` di stellar-cyber.ts

**Lokasi**: [lib/api/stellar-cyber.ts](lib/api/stellar-cyber.ts#L280-L630)

```typescript
export async function getAlerts(params: {
  minScore?: number        // Filter by minimum score
  status?: AlertStatus     // Filter by status (New, Closed, dll)
  sort?: string           // Sort field (default: timestamp)
  order?: "asc" | "desc"  // Sort order (default: desc)
  limit?: number          // Max results per page (default: 100)
  page?: number           // Page number (default: 1)
  integrationId?: string  // Which integration to use
  daysBack?: number       // How many days back (default: 7)
  startTime?: string      // ISO string (optional, overrides daysBack)
  endTime?: string        // ISO string (optional, overrides daysBack)
}): Promise<StellarCyberAlert[]>
```

**Logika Internal**:
1. Get credentials dari database (HOST, TENANT_ID)
2. Get access token via `getAccessToken()`
3. Build query dengan filter:
   - `tenantid:{TENANT_ID}`
   - `event_status:{status}` (if provided)
   - `score:>={minScore}` (if minScore > 0)
   - `timestamp:[startDate TO endDate]` (mandatory)
4. Call `/connect/api/data/aella-ser-*/_search`
5. Parse response dan extract fields:
   - Basic: title, description, severity, status, timestamp
   - Metadata: alert_id, alert_time, closed_time
   - User Action: history, alert_to_first (MTTD), assignees
   - Network: srcip, dstip, ports, protocol
   - Scoring: event_score, threat_score, fidelity

### Endpoint: POST `/api/alerts/sync`

**Lokasi**: [app/api/alerts/sync/route.ts](app/api/alerts/sync/route.ts#L1-L150)

**Request Body**:
```json
{
  "integrationId": "string (required)",
  "resetCursor": "boolean (optional)",
  "hoursBack": "number (optional)",
  "since": "ISO string (optional)"
}
```

**Logika**:
1. Validate integration exists
2. Get source type (stellar-cyber, wazuh, qradar)
3. **Untuk Stellar Cyber**:
   - Call `getAlerts(integrationId, daysBack=7)`
   - Loop setiap alert & upsert ke Prisma Alert table
   - Handle metadata parsing untuk user_action, timestamps
   - Update integration.lastSync
4. Return response:
```json
{
  "success": true,
  "synced": 324,
  "total": 324,
  "errors": 0
}
```

### Endpoint: POST `/api/alerts/auto-sync`

**Lokasi**: [app/api/alerts/auto-sync/route.ts](app/api/alerts/auto-sync/route.ts)

Dipanggil oleh cron job. Iterasi semua integrations dengan `source: "stellar-cyber"` dan call `getAlerts()` untuk masing-masing.

### Cron Job: GET `/api/cron/sync-alerts`

**Lokasi**: [app/api/cron/sync-alerts/route.ts](app/api/cron/sync-alerts/route.ts#L1-L80)

Dijalankan otomatis (biasanya setiap jam):
- Verify Bearer token dengan `CRON_SECRET`
- Call `/api/alerts/auto-sync`
- Return stats tentang berapa alert yg disync

---

## 2. 📥 PULL CASES DARI STELLAR CYBER

### File Utama
- **[lib/api/stellar-cyber-case.ts](lib/api/stellar-cyber-case.ts)** - Logika fetch cases (class-based)
- **[app/api/cron/sync-cases/route.ts](app/api/cron/sync-cases/route.ts)** - Cron job untuk sync cases
- **[app/api/cases/route.ts](app/api/cases/route.ts)** - GET cases dari database

### Alur Kerja
```
1. Trigger Sync (cron job / manual)
   ↓
2. GET /api/cron/sync-cases
   ↓
3. getCases() di stellar-cyber-case.ts
   ↓
4. getAccessToken() - Dapatkan bearer token
   ↓
5. Fetch dari /connect/api/v1/cases
   ↓
6. Parse & store ke Prisma Case table
   ↓
7. Link alert-case relationships
```

### Class: `StellarCyberCaseClient`

**Lokasi**: [lib/api/stellar-cyber-case.ts](lib/api/stellar-cyber-case.ts#L12-L400)

```typescript
class StellarCyberCaseClient {
  constructor(host: string, userId: string, tenantId: string, refreshToken: string)
  
  // Methods:
  async getCases(params: {
    from: number      // Start timestamp (ms)
    to: number        // End timestamp (ms)
    limit: number     // Max results
  }): Promise<{ data: { cases: any[] } }>
  
  async getCaseAlerts(caseId: string): Promise<{ data: { docs: any[] } }>
  
  async updateCase(caseId: string, updates: {...}): Promise<{ success: boolean }>
  
  async getCase(caseId: string): Promise<{ success: boolean }>
  
  async createCase(caseData: {...}): Promise<{ success: boolean }>
}
```

### Fungsi: `getCases()` Export Function

**Lokasi**: [lib/api/stellar-cyber-case.ts](lib/api/stellar-cyber-case.ts#L650-L700)

```typescript
export async function getCases(params: {
  limit?: number
  integrationId?: string
}): Promise<any[]>
```

**Logika**:
1. Get credentials dari database
2. Create StellarCyberCaseClient instance
3. Call `client.getCases({ from, to, limit })`
   - `from`: 30 hari lalu
   - `to`: sekarang
4. Return array of cases

### Endpoint: GET `/api/cron/sync-cases`

**Lokasi**: [app/api/cron/sync-cases/route.ts](app/api/cron/sync-cases/route.ts#L1-L150)

**Logika**:
1. Verify cron secret
2. Get semua active Stellar Cyber integrations (status: "connected")
3. Untuk setiap integration:
   - Call `getCases({ integrationId })`
   - Loop setiap case dari Stellar Cyber
   - Check apakah sudah exist di database (by externalId atau ticketId)
   - **Jika exist**: UPDATE case fields (name, status, severity, dates, etc.)
   - **Jika tidak exist**: CREATE case baru
4. Update integration.lastSync

---

## 3. 🔄 UPDATE ALERTS

### File Utama
- **[lib/api/stellar-cyber.ts](lib/api/stellar-cyber.ts#L620-L700)** - updateAlertStatus()
- **[app/api/alerts/update/route.ts](app/api/alerts/update/route.ts)** - API endpoint
- **[app/api/alerts/[id]/route.ts](app/api/alerts/[id]/route.ts)** - GET single alert

### Alur Kerja
```
1. User klik "Update Status" di UI
   ↓
2. POST /api/alerts/update
   {
     alertId: "...",
     status: "Closed",  // atau "Open", "In Progress", etc.
     comments?: "...",
     assignee?: "...",
     severity?: "High"
   }
   ↓
3. Update status di database lokal (Prisma)
   ↓
4. Record timeline event (status_change, severity_change, comment)
   ↓
5. If Stellar Cyber: Call updateAlertStatus()
   ↓
6. POST /connect/api/update_ser di Stellar Cyber
```

### Endpoint: POST `/api/alerts/update`

**Lokasi**: [app/api/alerts/update/route.ts](app/api/alerts/update/route.ts#L1-L172)

**Request Body**:
```json
{
  "alertId": "string (required)",
  "status": "Closed|Open|In Progress|New|FOLLOW_UP|CLOSED",
  "severity": "Critical|High|Medium|Low (optional)",
  "comments": "string (optional)",
  "assignee": "string (optional)",
  "severityBasedOnAnalysis": "string (optional)",
  "analysisNotes": "string (optional)"
}
```

**Logika**:
1. Check permission (user harus punya role 'update_alert_status')
2. Validate status value
3. Normalize status (CLOSED → Closed, OPEN → Open, etc.)
4. Find alert di database with integration info
5. **Update di Database**:
   ```
   prisma.alert.update({
     status: normalizedStatus,
     severity: severity,
     metadata: { assignee, severityBasedOnAnalysis, analysisNotes, statusUpdatedAt },
     updatedAt: new Date()
   })
   ```
6. **Record Timeline Events** untuk status_change, severity_change, comments, analysis_notes
7. **If Stellar Cyber** (integration.source === "stellar-cyber"):
   - Call `updateAlertStatus()` untuk sync ke Stellar Cyber

### Fungsi: `updateAlertStatus()` di stellar-cyber.ts

**Lokasi**: [lib/api/stellar-cyber.ts](lib/api/stellar-cyber.ts#L620-L700)

```typescript
export async function updateAlertStatus(params: {
  index: string           // Alert index (required for Stellar API)
  alertId: string         // External alert ID
  status: AlertStatus     // Status enum
  comments?: string       // Optional comments
  assignee?: string       // Optional assignee
  integrationId?: string
}): Promise<any>
```

**Logika**:
1. Get credentials (prefer API_KEY untuk auth)
2. POST ke `/connect/api/update_ser` dengan payload:
   ```json
   {
     "index": "...",
     "_id": "alertId",
     "status": "Closed",
     "comments": "...",
     "assignee": "..."
   }
   ```
3. Return success/error response

---

## 4. 🔄 UPDATE CASES

### File Utama
- **[lib/api/stellar-cyber-case.ts](lib/api/stellar-cyber-case.ts#L200-L300)** - updateCase() method & export
- **[app/api/cases/[id]/route.ts](app/api/cases/[id]/route.ts)** - Case detail & update endpoint

### Alur Kerja
```
1. User klik "Update Case" di UI
   ↓
2. PUT /api/cases/{caseId}
   {
     status: "Closed",
     assignee: "user@example.com",
     severity: "High",
     tags: { add: ["tag1"], delete: ["tag2"] }
   }
   ↓
3. Update case di database lokal
   ↓
4. Call updateCaseInStellarCyber()
   ↓
5. PUT /connect/api/v1/cases/{caseId} di Stellar Cyber
   ↓
6. Return updated case
```

### Class Method: `updateCase()`

**Lokasi**: [lib/api/stellar-cyber-case.ts](lib/api/stellar-cyber-case.ts#L208-L260)

```typescript
async updateCase(
  caseId: string,
  updates: {
    status?: string
    assignee?: string
    severity?: string
    name?: string
    tags?: { delete?: string[], add?: string[] }
  }
): Promise<{ success: boolean, data: any, message: string }>
```

**Logika**:
1. Get fresh access token
2. PUT ke `/connect/api/v1/cases/{caseId}`
3. Send update payload sebagai JSON
4. Return success/error

### Export Function: `updateCaseInStellarCyber()`

**Lokasi**: [lib/api/stellar-cyber-case.ts](lib/api/stellar-cyber-case.ts#L682-L685)

```typescript
export async function updateCaseInStellarCyber(params: {
  caseId: string
  integrationId?: string
  updates: {
    status?: string
    assignee?: string
    severity?: string
  }
}): Promise<{ success: boolean }>
```

Wrapper yang handles credential lookup & client creation.

### Endpoint: PUT `/api/cases/{caseId}`

**Lokasi**: [app/api/cases/[id]/route.ts](app/api/cases/[id]/route.ts)

**Request Body**:
```json
{
  "status": "Closed|New|In Progress",
  "assignee": "user@example.com",
  "severity": "Critical|High|Medium|Low",
  "name": "string",
  "tags": {
    "add": ["tag1", "tag2"],
    "delete": ["old_tag"]
  }
}
```

**Logika**:
1. Check permission (user harus punya akses ke integration)
2. Find case di database
3. Update Prisma case record
4. **If Stellar Cyber**: Call `updateCaseInStellarCyber()`
5. Return updated case data

---

## 5. 🔐 AUTHENTICATION & CREDENTIALS

### Credential Storage
Semua credentials disimpan di `prisma.integration.credentials` sebagai JSON:

```typescript
{
  host: "stellar-cyber.example.com",
  user_id: "user@example.com",
  refresh_token: "XXXXXXXXXXXXXX",
  tenant_id: "tenant-xxxxx",
  api_key: "YYYYYYYYYYYYYY"  // Optional, untuk update_ser endpoint
}
```

### Token Flow
```
1. getStellarCyberCredentials(integrationId?)
   ↓ (Get from database)
   
2. getAccessToken(integrationId?)
   ↓ (Call Stellar Cyber /connect/api/v1/access_token)
   
3. POST with Basic Auth header:
   Authorization: Basic base64(user_id:refresh_token:tenant_id)
   ↓
   
4. Response: { access_token: "Bearer XXXXX" }
   ↓
   
5. Use untuk semua subsequent requests:
   Authorization: Bearer {access_token}
```

### Helper: `getStellarCyberCredentials()`

**Lokasi**: [lib/api/stellar-cyber.ts](lib/api/stellar-cyber.ts#L11-L100)

```typescript
async function getStellarCyberCredentials(integrationId?: string)
  → { HOST, USER_ID, REFRESH_TOKEN, TENANT_ID, API_KEY }
```

Logic:
1. Jika `integrationId` provided: Fetch dari database
2. Jika tidak: Find first integration dengan `source: "stellar-cyber"` & `status: "connected"`
3. Parse credentials (handle both array & object formats)
4. Use fallback keys (multiple variations) untuk compatibility

---

## 6. 📊 DATA FLOW SUMMARY

```
┌─────────────────────────────────────────────────────────────┐
│                    STELLAR CYBER SYSTEM                     │
└─────────────────────────────────────────────────────────────┘

PULL ALERTS:
  stellar-cyber.ts:getAlerts()
      ↓
  POST /connect/api/data/aella-ser-*/_search
      ↓
  app/api/alerts/sync/route.ts
      ↓
  Prisma Alert.upsert() + AlertTimeline
      ↓
  Update integration.lastSync

PULL CASES:
  stellar-cyber-case.ts:StellarCyberCaseClient.getCases()
      ↓
  GET /connect/api/v1/cases
      ↓
  app/api/cron/sync-cases/route.ts
      ↓
  Prisma Case.upsert()
      ↓
  Update integration.lastSync

UPDATE ALERT:
  stellar-cyber.ts:updateAlertStatus()
      ↓
  POST /connect/api/update_ser
      ↓
  app/api/alerts/update/route.ts
      ↓
  Prisma Alert.update() + AlertTimeline.create()

UPDATE CASE:
  stellar-cyber-case.ts:StellarCyberCaseClient.updateCase()
      ↓
  PUT /connect/api/v1/cases/{caseId}
      ↓
  app/api/cases/[id]/route.ts
      ↓
  Prisma Case.update()
```

---

## 7. 📋 KEY METADATA FIELDS

### Alert Metadata yang Diperlukan
```typescript
{
  // MTTD Data (penting untuk SLA Dashboard)
  user_action: {
    history: Array<{action, timestamp, user}>,
    alert_to_first: number,        // ms dari alert creation ke first assignee
    alert_to_last: number,         // ms dari alert creation ke last action
    first_to_last: number,         // ms dari first ke last action
    first_timestamp: number,
    last_timestamp: number
  },
  
  // Status & Timestamps
  event_status: "New|Closed|...",
  alert_time: number|string,
  closed_time: number|string,
  timestamp: number|string,
  
  // Scoring
  event_score: number,
  threat_score: number,
  fidelity: number,
  
  // Index (untuk update_ser endpoint)
  index: string  // "aella-ser-XXXXX" format
}
```

---

## 8. 🔗 RELATED FILES & UTILITIES

- **[lib/config/stellar-cyber.ts](lib/config/stellar-cyber.ts)** - Type definitions (AlertStatus, StellarCyberAlert)
- **[lib/api/stellar-cyber-validator.ts](lib/api/stellar-cyber-validator.ts)** - Validation utilities
- **[lib/api/stellar-cyber-client.ts](lib/api/stellar-cyber-client.ts)** - Low-level HTTP client
- **[scripts/sync-stellar-cyber-alerts-api.js](scripts/sync-stellar-cyber-alerts-api.js)** - Manual sync script
- **[scripts/backfill-stellar-user_action_alert_to_first.js](scripts/backfill-stellar-user_action_alert_to_first.js)** - MTTD backfill utility

---

## 9. ⚙️ ENVIRONMENT VARIABLES

```bash
# Stellar Cyber
STELLAR_CYBER_HOST=stellar-cyber.example.com
STELLAR_CYBER_USER_ID=user@example.com
STELLAR_CYBER_REFRESH_TOKEN=XXXXXX
STELLAR_CYBER_TENANT_ID=tenant-xxxxx
STELLAR_CYBER_API_KEY=YYYYYY

# Cron jobs
CRON_SECRET=your-cron-secret-token

# Database
DATABASE_URL=postgresql://...
```

---

## 10. 🧪 TESTING COMMANDS

```bash
# Manual alert sync (last 16 days)
node scripts/sync-stellar-cyber-alerts-api.js --days 16

# Manual alert sync (custom range)
node scripts/sync-stellar-cyber-alerts-api.js --days 30 --integration {integrationId}

# Check Stellar Cyber alerts
node check-stellar.js

# Inspect single alert
node inspect-stellar.js

# Backfill MTTD data
node scripts/backfill-stellar-user_action_alert_to_first.js
```

---

Semua logika di-trace, credential-aware, dan terintegrasi dengan Prisma database untuk persistence dan audit trail lengkap.
