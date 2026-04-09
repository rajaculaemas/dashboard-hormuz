# Timeline Timezone Bug - Testing & Debugging Guide

## What Was Fixed

✅ **Code Changes**: Added consistent UTC timestamp creation with enhanced logging to help diagnose and prevent timezone mismatches in alert status timeline.

## Quick Test

### Before Deploying

1. **Build & verify** (already done):
   ```bash
   npm run build  # ✓ Compiled successfully in 12.5s
   ```

### After Deploying

1. **Reproduce the issue**:
   - Open an alert (preferably a Socfortress alert)
   - Change its status to a different value
   - Note your current local time (e.g., 03:24 AM)

2. **Check the timeline**:
   - Refresh the alert detail panel
   - Look at the "Alert Timeline" section
   - **Timestamp should match your local time**, NOT offset by timezone

3. **Expected behavior**:
   - You change status at: **03:24 UTC+7** ✅
   - Timeline shows: **03:24 UTC+7** ✅
   - NOT: 10:24 UTC+7 ❌

## Debugging If Issue Persists

### Check Server Logs

When you change the status, look for these logs in your server output:

```
[Timestamp] Creating event at UTC: 2025-02-11T20:24:07.000Z (Local: Sun Feb 11 2025 03:24:07 GMT+0700)
[PATCH] Recording status change timeline: "New" → "Closed"  
[PATCH] Timeline timestamp (UTC ISO): 2025-02-11T20:24:07.000Z
```

**What to check**:
- The ISO string (e.g., `20:24:07.000Z`) - this is the UTC time
- The Local time in parentheses - should match your server's actual time
- If UTC time and local time differ by 7 hours, server timezone might be set to UTC+7

### Compare Times

**If user changes status at 03:24 UTC+7:**
- UTC time should be: **20:24 previous day**
- Logs should show: `2025-02-10T20:24:07.000Z`
- Timeline should display: **03:24 UTC+7**

**If timeline shows 10:24 UTC+7:**
- This equals 03:24 UTC
- Logs would show: `2025-02-11T03:24:07.000Z`
- This indicates 7-hour offset (likely timezone configuration issue)

## What the Fix Does

### 1. **Consistent Timestamps**
- Each status update creates ONE timestamp for all related events (status, severity, comments)
- Prevents microsecond differences between events in same transaction

### 2. **Enhanced Logging**
```typescript
// Now logs both UTC and local server time
console.log(`[Timestamp] Creating event at UTC: ${now.toISOString()} (Local: ${now.toString()})`)
console.log(`[PATCH] Timeline timestamp (UTC ISO): ${currentTimestamp.toISOString()}`)
```

### 3. **Applied Everywhere**
- All alert update endpoints
- Case update endpoints
- Bulk operations

## If Issue Persists

The timezone problem likely needs server-level configuration:

### Option 1: Set Server Timezone (Recommended)
```bash
# In your Docker Compose or server environment
TZ=UTC
```

Then redeploy and test.

### Option 2: Check PostgreSQL
```bash
# Connect to your database
psql -U postgres -d soc_dashboard

# Query the timezone storage
SELECT NOW();
SELECT id, timestamp, TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') as formatted FROM alert_timeline LIMIT 1;
```

### Option 3: Advanced - Use Date Library
If the above don't work, next phase would involve using `date-fns-tz` or `dayjs/cli` for explicit timezone handling (requires more code changes).

## Files Changed

✅ `/app/api/alerts/[id]/route.ts` - Added helper + enhanced logging
✅ `/app/api/alerts/bulk-update/route.ts` - Consistent timestamps
✅ `/app/api/alerts/update/route.ts` - Consistent timestamps  
✅ `/app/api/cases/[id]/route.ts` - Consistent timestamps

## Rollback Steps

If needed, these files were only enhanced (no breaking changes):
```bash
git diff app/api/alerts/[id]/route.ts
git diff app/api/alerts/bulk-update/route.ts
git diff app/api/alerts/update/route.ts
git diff app/api/cases/[id]/route.ts
```

Changes are additive and backward compatible - safe to deploy.

## Next Steps

1. Deploy the updated code
2. Test status update as described above
3. Check server logs for timezone diagnostics
4. If still seeing offset, check/set `TZ=UTC` environment variable
5. Report logs and findings if further investigation needed

## Contact Points for Further Help

If issue persists after checking logs:
- Server timezone (`echo $TZ`)
- PostgreSQL timezone (`SHOW timezone;`)
- Exact timestamps from logs vs timeline
- Server location/timezone (where container is running)
