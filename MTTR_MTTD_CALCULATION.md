# MTTR & MTTD Calculation untuk Integrasi Wazuh & Socfortress/Copilot

## 📊 Definisi Metrik

### **MTTD (Mean Time To Detect)**
Waktu dari alert pertama kali muncul hingga **user pertama kali melakukan action** pada alert.

### **MTTR (Mean Time To Resolution)** 
Waktu dari **latest alert** dalam case hingga **case dibuat/follow-up** (ketika incident diketahui).

---

## 🔄 MTTD Calculation untuk Wazuh & Socfortress (3-Tier Fallback)

### **Tier 1 (Preferred) - User Action History**
```
MTTD = alert_creation_time → first_user_action_time
Source: metadata.user_action.history (Stellar/Wazuh) atau alert_history (Socfortress)
Mencari: action pertama dengan action_time (preferably assignee change)
```

**Contoh Alert 1675 (Wazuh):**
- Alert created: `2026-02-04 11:05:03`
- User actions dalam history:
  - Assignment change (11:05:29) → ambarfitri
  - Status change to IN_PROGRESS (11:05:32)
  - Comment added (11:07:12)
  - Assignment change (11:09:12) → sultan
  - Comment added (11:09:37)
  - Status change to CLOSED (11:09:40)

**Hasil:** MTTD ≈ 26 menit (dari 11:05:03 → 11:05:29 assignment pertama)

---

### **Tier 2 (Fallback 1) - Alert Updated Time**
Jika Tier 1 tidak tersedia atau history kosong:
```
MTTD = alert_creation_time → alert.updatedAt
Source: alert.updatedAt field
Used when: history belum tersinkronisasi dari source
```

---

### **Tier 3 (Final Fallback) - Closed Time**
Jika Tier 1 & 2 tidak tersedia:
```
MTTD = alert_creation_time → time_closed
Source: metadata.time_closed (Socfortress) atau time_closed (Wazuh)
Used when: alert sudah di-close tapi action history tidak ada
```

**Untuk Alert 1675:**
- Alert created: `2026-02-04 11:05:03`
- Alert closed: `2026-02-04 11:07:17`
- **MTTD fallback ≈ 2 menit 14 detik**

---

## 🎯 MTTR Calculation untuk Wazuh & Socfortress

### **Formula:**
```
MTTR = case.createdAt - latest_alert_time_in_case
```

Dimana:
- `case.createdAt` = waktu case dibuat/follow-up
- `latest_alert_time_in_case` = timestamp alert terbaru yang linked ke case

### **Contoh:**
Jika case dibuat pada `2026-02-05 10:00:00` dan alert terbaru dalam case pada `2026-02-04 11:07:17`:
```
MTTR = 22 jam 52 menit 43 detik
```

---

## 📝 Implementasi dalam Kode

### **1. Wazuh - calculateMttdForSocfortress() [Digunakan untuk Socfortress juga]**
```typescript
// File: /home/soc/soc-dashboard/lib/api/socfortress.ts

function toMs(v: any): number | null {
  if (!v && v !== 0) return null
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000
  if (typeof v === 'string') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n > 1e12 ? n : n * 1000
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.getTime()
  }
  if (v instanceof Date) return v.getTime()
  return null
}

function computeMetricMs(startMs: number | null, endMs: number | null): number | null {
  if (!startMs || !endMs || startMs >= endMs) return null
  const diff = endMs - startMs
  return diff > 0 ? diff : null
}

function calculateMttdForSocfortress(alert: any): number | null {
  const alertCreationMs = toMs(alert.alert_creation_time)
  if (!alertCreationMs) return null

  // Tier 1: Find first ASSIGNMENT_CHANGE in alert_history
  if (alert.alert_history && Array.isArray(alert.alert_history) && alert.alert_history.length > 0) {
    const sortedHistory = [...alert.alert_history].reverse()
    
    // Prefer assignment change
    const assignmentChange = sortedHistory.find((h: any) => h.change_type === "ASSIGNMENT_CHANGE")
    if (assignmentChange && assignmentChange.changed_at) {
      const actionMs = toMs(assignmentChange.changed_at)
      const mttdMs = computeMetricMs(alertCreationMs, actionMs)
      if (mttdMs !== null) return mttdMs
    }

    // Fallback to first action with any timestamp
    const firstAction = sortedHistory.find((h: any) => h.changed_at)
    if (firstAction && firstAction.changed_at) {
      const actionMs = toMs(firstAction.changed_at)
      const mttdMs = computeMetricMs(alertCreationMs, actionMs)
      if (mttdMs !== null) return mttdMs
    }
  }

  // Tier 2: Use updatedAt if available
  if (alert.updatedAt || alert.updated_at) {
    const updateMs = toMs(alert.updatedAt || alert.updated_at)
    const mttdMs = computeMetricMs(alertCreationMs, updateMs)
    if (mttdMs !== null) return mttdMs
  }

  // Tier 3: Use time_closed if available
  if (alert.time_closed) {
    const closedMs = toMs(alert.time_closed)
    const mttdMs = computeMetricMs(alertCreationMs, closedMs)
    if (mttdMs !== null) return mttdMs
  }

  return null
}
```

### **2. MTTD Storage untuk Socfortress**
Field: `metadata.socfortress_alert_to_first` (dalam milliseconds)

```json
{
  "metadata": {
    "socfortress_alert_to_first": 1560000,  // 26 menit dalam ms
    "socfortress": {
      "alert_creation_time": "2026-02-04T11:05:03Z",
      "time_closed": "2026-02-04T11:07:17Z"
    },
    "alert_history": [
      {
        "change_type": "ASSIGNMENT_CHANGE",
        "field_name": "assigned_to",
        "changed_at": "2026-02-04 11:05:29",
        "description": "Assignment changed from (unassigned) to ambarfitri"
      }
    ]
  }
}
```

### **3. MTTR Calculation - Socfortress Cases**
```typescript
// File: /home/soc/soc-dashboard/lib/api/socfortress.ts

// Dalam getSocfortressCases function:
let mttrMinutes: number | null = null
if (caseAlerts && caseAlerts.length > 0) {
  const caseCreatedMs = toMs(caseData.case_creation_time)
  
  // Find latest alert timestamp
  const alertTimestamps = caseAlerts
    .map((alert: any) => alert.timestamp || alert.metadata?.socfortress?.alert_creation_time)
    .map((ts: any) => toMs(ts))
    .filter((ts: number | null) => ts !== null && ts > 0)
  
  if (alertTimestamps.length > 0 && caseCreatedMs) {
    const latestAlertMs = Math.max(...alertTimestamps)
    const mttrMs = computeMetricMs(latestAlertMs, caseCreatedMs)
    if (mttrMs !== null) {
      mttrMinutes = Math.round(mttrMs / 60000)
    }
  }
}

// Store in metadata
metadata.mttrMinutes = mttrMinutes
```

### **4. MTTD Display Export - Socfortress**
```typescript
// File: /home/soc/soc-dashboard/app/api/alerts/export/route.ts

function formatMTTD(alert: any) {
  const md = alert.metadata || {}
  
  // Try Stellar Cyber first
  let mttdMs = md.user_action_alert_to_first || (md.user_action && md.user_action.alert_to_first)
  
  // Try Socfortress/Copilot
  if (!mttdMs) {
    mttdMs = md.socfortress_alert_to_first
  }
  
  if (mttdMs !== null && mttdMs !== undefined) {
    const mttdMinutes = Math.round(mttdMs / (60 * 1000))
    if (mttdMinutes < 1) {
      const mttdSeconds = Math.round(mttdMs / 1000)
      return mttdSeconds >= 0 ? `${mttdSeconds}s` : ''
    }
    if (mttdMinutes < 60) return `${mttdMinutes}m`
    const mttdHours = Math.floor(mttdMinutes / 60)
    if (mttdHours < 24) return `${mttdHours}h`
    const mttdDays = Math.floor(mttdHours / 24)
    return `${mttdDays}d`
  }
  
  // Fallback to timestamp - updatedAt
  const eventTime = new Date(alert.timestamp || alert.created_at)
  const actionTime = new Date(alert.updatedAt || alert.updated_at)
  if (!eventTime.getTime() || !actionTime.getTime()) return ''
  const diffMs = actionTime.getTime() - eventTime.getTime()
  if (diffMs < 0) return ''
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return '<1m'
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}
```

---

## 🔗 Format Output

### **Export Format (CSV)**
```
MTTD dipresentasikan sebagai: "1m", "26m", "2h", "1d"
- < 1 menit: detik (e.g., "45s")
- < 60 menit: menit (e.g., "26m")
- < 24 jam: jam (e.g., "2h")
- ≥ 24 jam: hari (e.g., "1d")

MTTR dipresentasikan dalam menit di Tickets page: "120m", "0m", dll
```

### **UI Display - Tickets Page**
```typescript
const renderMttr = (caseItem: Case) => {
  if (caseItem.mttrMinutes === null || caseItem.mttrMinutes === undefined) {
    return <div className="text-sm text-muted-foreground">N/A</div>
  }

  const threshold = getMttrThresholdMinutes(caseItem.severity)
  const breached = threshold !== null && caseItem.mttrMinutes > threshold

  return (
    <div className={`text-sm ${breached ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
      {caseItem.mttrMinutes}m
    </div>
  )
}
```

---

## 🎯 SLA Thresholds

Metrik MTTR dibandingkan dengan threshold berdasarkan severity:

| Severity | MTTR Threshold |
|----------|----------------|
| Critical | 15 menit       |
| High     | 30 menit       |
| Medium   | 60 menit       |
| Low      | 120 menit      |

**Status:** 
- ✅ PASS jika `mttrMinutes ≤ threshold`
- ❌ FAIL jika `mttrMinutes > threshold` (breached)

---

## 🛠️ Implementation Checklist

### **Socfortress/Copilot Alerts**
- ✅ `calculateMttdForSocfortress()` function di socfortress.ts
- ✅ MTTD di-calculate saat `transformAlert()` untuk setiap alert
- ✅ MTTD di-store di `metadata.socfortress_alert_to_first`
- ✅ MTTD di-format di export route dengan `formatMTTD()`

### **Socfortress/Copilot Cases**
- ✅ MTTR di-calculate di `getSocfortressCases()` function
- ✅ MTTR di-store di `metadata.mttrMinutes`
- ✅ MTTR di-return di top-level `mttrMinutes` field
- ✅ MTTR di-display di Tickets page dengan SLA comparison

### **Tickets Page Integration**
- ✅ `isSocfortress` condition detection
- ✅ MTTR dari API response digunakan (sudah di-calculate)
- ✅ MTTR stats calculation (average, sum)
- ✅ MTTR breached status display (red if > threshold)
- ✅ Support untuk "all integrations" view

---

## ✅ Coverage & Status

### **Database Tables - Socfortress**
- `incident_management_alert` - Alert root data
- `incident_management_alert_history` - Alert change history (untuk MTTD Tier 1)
- `incident_management_alertevent` - Alert events
- `incident_management_case` - Case root data
- `incident_management_casealertlink` - Case ↔ Alert relationship

### **Fields Digunakan**
- Alert:
  - `alert_creation_time` - Kapan alert dibuat
  - `time_closed` - Kapan alert ditutup
  - `alert_history[]` - History perubahan status/assignment
  - `updatedAt` - Terakhir di-update
  
- Case:
  - `case_creation_time` - Kapan case dibuat
  - Related alerts untuk latest alert time calculation

---

## 📄 File-File Terkait

- [lib/api/socfortress.ts](lib/api/socfortress.ts) - MTTD & MTTR calculation & storage
- [app/api/alerts/export/route.ts](app/api/alerts/export/route.ts) - MTTD formatting
- [app/dashboard/tickets/page.tsx](app/dashboard/tickets/page.tsx) - MTTR display & averaging
- [prisma/schema.prisma](prisma/schema.prisma) - Database models

