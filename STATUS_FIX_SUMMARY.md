# Summary: SOCFortress Alert Status Fix

## Issue
Alert status ditampilkan berbeda antara detail panel dan tabel alert untuk SOCFortress integration:
- ✅ Detail Panel: Menampilkan status yang benar dari database ("CLOSED")
- ❌ Alert Table: Selalu menampilkan "New" terlepas dari status asli

## Root Cause Analysis
File: `lib/api/socfortress.ts`, fungsi `mapStatusFromMySQL()` (lines 305-313)

Fungsi ini hardcoded mengembalikan `"New"` untuk **semua alert** tanpa mempertimbangkan status asli di database:

```typescript
// BEFORE (Incorrect)
function mapStatusFromMySQL(status: string): string {
  return "New"  // Always returns "New" - ignores actual database status!
}
```

Ini menyebabkan:
- Alert dengan status `CLOSED` di database ditampilkan sebagai `New` di tabel
- Alert dengan status `IN_PROGRESS` ditampilkan sebagai `New`
- Semua alert menjadi terlihat sebagai "unread/unreviewed" meski sudah ditutup

## Solution Applied
Ganti fungsi `mapStatusFromMySQL()` dengan mapping yang tepat:

```typescript
// AFTER (Correct)
function mapStatusFromMySQL(status: string): string {
  const statusMap: Record<string, string> = {
    OPEN: "New",
    IN_PROGRESS: "In Progress",
    CLOSED: "Closed",
  }
  return statusMap[status?.toUpperCase()] || "New"
}
```

Mapping logic:
- Database `OPEN` → UI "New" (alert yang baru masuk belum ditindaklanjuti)
- Database `IN_PROGRESS` → UI "In Progress" (alert sedang dikerjakan)
- Database `CLOSED` → UI "Closed" (alert sudah selesai/ditutup)

## Files Changed
**Modified**: `lib/api/socfortress.ts`
- Function: `mapStatusFromMySQL()` 
- Lines: 305-317
- Change Type: Bug fix - logic correction

## Testing Checklist
- [ ] Restart application server to load new code
- [ ] Trigger resync SOCFortress alerts via dashboard
- [ ] Verify alert status in table matches detail panel
- [ ] Check that closed alerts show "Closed" in both views
- [ ] Verify "In Progress" and "New" statuses also display correctly
- [ ] Confirm no regression in other integrations (Wazuh, QRadar, Stellar Cyber)

## Deployment Notes
1. No database migrations required
2. No configuration changes needed
3. Fix is backward compatible - only affects how status is displayed
4. After deployment, users should trigger a resync to see updated statuses for existing alerts

## Related Files
- `components/alert/alert-table.tsx` - Displays status in table using `alert.status`
- `components/alert/socfortress-alert-detail-dialog.tsx` - Displays status in detail panel
- `app/api/alerts/sync/route.ts` - Triggers the sync that calls `getSocfortressAlerts()`

## Impact Assessment
**Severity**: Medium - Visual mismatch between UI components
**User Impact**: Clear status representation, better alert management workflow
**Risk Level**: Low - Only changes status mapping, no data loss or system changes
