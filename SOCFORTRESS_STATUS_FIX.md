# SOCFortress Alert Status Sync Fix

## Problem
Alert status ditampilkan berbeda antara detail panel dan tabel alert:
- **Detail Panel**: Menampilkan status yang benar dari database (misal: "CLOSED")
- **Alert Table**: Selalu menampilkan "New" terlepas dari status asli di database

## Root Cause
Fungsi `mapStatusFromMySQL()` di `/home/soc/soc-dashboard/lib/api/socfortress.ts` (baris 305-313) hardcoded untuk selalu mengembalikan `"New"`:

```typescript
function mapStatusFromMySQL(status: string): string {
  return "New"  // Map all Copilot alerts to New for visibility
}
```

Ini menyebabkan semua alert dari SOCFortress ditampilkan sebagai "New" di tabel alert, meskipun status di database adalah "CLOSED", "IN_PROGRESS", dll.

## Solution
Update fungsi `mapStatusFromMySQL()` untuk melakukan mapping yang benar:

```typescript
function mapStatusFromMySQL(status: string): string {
  const statusMap: Record<string, string> = {
    OPEN: "New",
    IN_PROGRESS: "In Progress",
    CLOSED: "Closed",
  }

  // If status exists in map, use mapped value; otherwise return "New" as default
  return statusMap[status?.toUpperCase()] || "New"
}
```

## Changes Made
- **File**: `lib/api/socfortress.ts`
- **Function**: `mapStatusFromMySQL()` (lines 307-317)
- **Change**: Replaced hardcoded return with proper status mapping

## Status Mapping
- Database `OPEN` → Display "New" (unassigned/new alerts)
- Database `IN_PROGRESS` → Display "In Progress" (assigned and being worked)
- Database `CLOSED` → Display "Closed" (resolved/closed alerts)

## Testing
After deploying this change:
1. Force resync SOCFortress alerts: `POST /api/alerts/sync` with SOCFortress integration ID
2. Check alert table - status should now match the detail panel
3. Verify that closed alerts show "Closed" status in both table and detail panel

## Related Files
- `lib/api/socfortress.ts` - Status mapping functions
- `components/alert/socfortress-alert-detail-dialog.tsx` - Detail panel display
- `components/alert/alert-table.tsx` - Alert table display
- `app/api/alerts/sync/route.ts` - Alert sync endpoint
