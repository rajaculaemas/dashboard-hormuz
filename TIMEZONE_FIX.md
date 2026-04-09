# Timezone Fix for Alert Status Timeline - Technical Documentation

## Issue Summary

**Problem**: When users update alert status at a specific local time (e.g., 03:24 UTC+7), the timeline records a different timestamp that is offset by the timezone difference (showing 10:24 UTC+7 instead).

**Impact**: Alert activity timeline shows incorrect timestamps, making it difficult to track when changes were actually made.

**Root Cause**: Potential timezone mismatch between:
- Browser client timezone (UTC+7)
- Server timezone setting
- PostgreSQL database timezone
- Prisma DateTime handling

## Changes Made

### 1. **Consistent Timestamp Creation** (`app/api/alerts/[id]/route.ts`)

Added `createUTCTimestamp()` helper function to ensure timestamps are created consistently and with proper logging:

```typescript
function createUTCTimestamp(): Date {
  const now = new Date()
  console.log(`[Timestamp] Creating event at UTC: ${now.toISOString()} (Local: ${now.toString()})`)
  return now
}
```

**Benefits**:
- Single timestamp per update operation (all events get same timestamp)
- Logs both UTC ISO format and local server time for comparison
- Helps diagnose timezone configuration issues

### 2. **Applied Consistent Timestamp Pattern to All Alert Routes**

Updated timestamp creation in:
- `/app/api/alerts/[id]/route.ts` - Main alert update endpoint
- `/app/api/alerts/bulk-update/route.ts` - Bulk update operations
- `/app/api/alerts/update/route.ts` - Legacy update endpoint
- `/app/api/cases/[id]/route.ts` - Case timeline updates

**Pattern**:
```typescript
const eventTimestamp = createUTCTimestamp()
// Use eventTimestamp for all events in this update
```

### 3. **Enhanced Logging**

Added diagnostic logging to help identify timezone issues:
```
[Timestamp] Creating event at UTC: 2025-02-11T20:24:07.000Z (Local: Sun Feb 11 2025 03:24:07 GMT+0700)
[PATCH] Timeline timestamp (UTC ISO): 2025-02-11T20:24:07.000Z
```

## Debugging Steps for Users

If the timezone issue persists after these changes, follow these steps:

### Step 1: Check Server Timezone
```bash
# On the server where Node.js is running
date
echo $TZ
timedatectl status  # On Linux/systemd
```

**Expected**: Server should be in UTC or the timezone should be explicitly set

### Step 2: Reproduce Issue and Check Logs

1. Change alert status at a known local time
2. Check Docker/server logs for `[Timestamp]` entries:
```bash
docker logs <container_id> | grep "\[Timestamp\]"
docker logs <container_id> | grep "\[PATCH\].*timestamp"
```

3. Compare:
   - User's local time when making change
   - `[Timestamp]` log showing UTC time
   - Final timeline entry in UI

### Step 3: Check PostgreSQL Timezone Setting

```bash
# Connect to PostgreSQL
psql -U <user> -d <database>

# Check timezone setting
SHOW timezone;
SHOW TimeZone;

# View a sample timeline entry
SELECT id, timestamp, created_at FROM alert_timeline LIMIT 1;
```

**Expected**: Timestamps should be stored as UTC (e.g., `2025-02-11 20:24:07+00`)

### Step 4: Check Browser DevTools

1. Open DevTools → Network
2. Attempt status update
3. Check the API response under `/api/alerts/[id]`:
   - Look for the returned `alert.updatedAt` timestamp
   - Compare with the response headers `date` field

## Potential Solutions

### If Issue Persists

1. **Set Server Timezone to UTC**:
   ```bash
   # In Docker Compose or .env
   TZ=UTC
   ```

2. **Set PostgreSQL Timezone**:
   ```sql
   ALTER DATABASE your_database SET timezone = 'UTC';
   ```

3. **Consider Using a Timezone Library**:
   ```typescript
   import { formatInTimeZone } from 'date-fns-tz'
   const timestamp = formatInTimeZone(new Date(), 'UTC', 'yyyy-MM-dd HH:mm:ss')
   ```

4. **Force UTC in Prisma**:
   Update schema to ensure timezone handling:
   ```prisma
   timestamp DateTime @default(now()) @db.Timestamp(0)
   ```

## Verification

After deployment, verify the fix by:

1. Change an alert status at a specific time you know
2. Check the timeline in the alert detail panel
3. Verify timestamp matches your local time (not UTC time)
4. Check server logs show correct UTC timestamp

## Related Files

- Frontend display: `components/alert/alert-detail-dialog.tsx` (line ~885)
- API routes: `app/api/alerts/[id]/route.ts`, `app/api/alerts/bulk-update/route.ts`
- Database schema: `prisma/schema.prisma` (AlertTimeline model)
- Timeline retrieval: `app/api/alerts/[id]/timeline/route.ts`

## Notes

- The `createUTCTimestamp()` helper ensures all events in a single status update get the exact same timestamp
- Logging shows both UTC (ISO string) and local server time format for easy comparison
- Frontend uses `.toLocaleString()` which converts UTC to browser's local timezone
- If the 7-hour offset persists, it indicates the server is likely in UTC+7 but Prisma/PostgreSQL is treating times as if they're in a different timezone
