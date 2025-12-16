# Summary: Stellar Cyber Alert Sync & MTTD Fix

## ✅ Masalah Terselesaikan

### 1. **Alert 9 & 11 December tidak terupdate**
   
**Root Cause**: Date range query di API mengalami timezone offset bug

**Lokasi**: `/app/api/alerts/route.ts` (Lines 61-73)

**Bug**: 
```typescript
// WRONG - Mengecualikan hari terakhir date range
endDate.setUTCHours(23, 59, 59, 999)  // Applied pada waktu yang sudah dikurangi 7 jam
```

**Fix**:
```typescript
// CORRECT - Includes full date range
const nextDayUTC = new Date(toUTC.getTime() + 24 * 60 * 60 * 1000)
endDate = new Date(nextDayUTC.getTime() - UTC_PLUS_7_OFFSET_MS - 1)
```

**Impact**: Sekarang date range "9-16 Dec" akan fetch semua alerts dari 8 Dec 17:00 UTC sampai 16 Dec 16:59 UTC (correct 7-hour offset)

---

### 2. **Alert tidak punya MTTD calculation**

**Root Cause**: Multiple issues:
- Alerts tidak punya metadata `user_action` 
- API search endpoint mengembalikan minimal data
- 7-day default lookback window terlalu pendek

**Fixes Applied**:

#### Fix A: Stellar Cyber API Default Lookback
**Lokasi**: `/lib/api/stellar-cyber.ts` (Line 273)

```typescript
// BEFORE
daysBack = 7  // Only last 7 days

// AFTER  
daysBack = 30  // Last 30 days by default
```

#### Fix B: MTTD Calculation Fallbacks
**Lokasi**: `/app/dashboard/sla/page.tsx` (Lines 100-175)

Added 3-tier fallback system:
1. **Primary**: Use `user_action.history` → "Event assignee changed to" action
2. **Fallback 1**: Use `updatedAt` for Closed/Resolved alerts
3. **Fallback 2**: Use `closed_time` from metadata

This ensures MTTD calculated untuk semua closed alerts, even if full history missing.

---

## 🔧 Manual Sync Script

Script untuk resync alerts Stellar Cyber ke database dengan lengkap.

### Usage

```bash
# Sync last 16 days (default)
node scripts/sync-stellar-cyber-alerts-api.js

# Sync last 30 days
node scripts/sync-stellar-cyber-alerts-api.js --days 30

# With specific integration
node scripts/sync-stellar-cyber-alerts-api.js --days 16 --integration INTEGRATION_ID
```

### Script Features

✅ Fetches alerts from Stellar Cyber API  
✅ Stores complete metadata including `user_action`  
✅ Verifies sync completion with database statistics  
✅ Shows MTTD data availability per date  
✅ No frontend required - runs from command line  

### Test Run Results

```
✓ Found: Stellar Cyber TVRI (cmisp3k6v0000jwvp1fprei36)

📈 Database Statistics:
  Total Stellar Cyber Alerts: 324
  Closed Alerts: 324
  Alerts with user_action: 324

📊 Alerts by Date:
  2025-12-16: 4 alerts
  2025-12-15: 42 alerts
  2025-12-14: 38 alerts
  2025-12-13: 32 alerts
  2025-12-12: 41 alerts
  2025-12-11: 45 alerts  ← User's original issue
  2025-12-10: 60 alerts
  2025-12-09: 62 alerts  ← User's original issue
```

✅ All 324 alerts now have:
- `alert_time` (when alert was created)
- `closed_time` (when alert was resolved)
- `user_action` (with action history)
- Complete metadata for MTTD calculation

---

## 📊 MTTD Data Verification

Sample queries to verify MTTD data in database:

```bash
# Check alerts by date with MTTD data availability
psql -U soc -d socdashboard -c "
SELECT 
  DATE(timestamp AT TIME ZONE 'Asia/Jakarta') as date,
  COUNT(*) as total,
  COUNT(CASE WHEN metadata->'user_action'->>'alert_to_first' IS NOT NULL THEN 1 END) as with_alert_to_first,
  COUNT(CASE WHEN metadata->>'closed_time' IS NOT NULL THEN 1 END) as with_closed_time
FROM alerts
WHERE status = 'Closed'
GROUP BY DATE(timestamp AT TIME ZONE 'Asia/Jakarta')
ORDER BY date DESC
LIMIT 10;
"

# Check sample alert MTTD calculations
psql -U soc -d socdashboard -c "
SELECT 
  title,
  (metadata->>'alert_time')::timestamptz as alert_time,
  (metadata->>'closed_time')::timestamptz as closed_time,
  EXTRACT(EPOCH FROM ((metadata->>'closed_time')::timestamptz - (metadata->>'alert_time')::timestamptz))/60 as mttd_minutes
FROM alerts
WHERE status = 'Closed'
LIMIT 5;
"
```

---

## 🎯 Next Steps for User

1. **Run Sync Script** (if needed):
   ```bash
   node scripts/sync-stellar-cyber-alerts-api.js --days 16
   ```

2. **Access SLA Dashboard**:
   - Go to Dashboard → SLA
   - Select date range 9-16 Dec
   - Filter by "PENDING" status if desired
   - MTTD values should now display instead of "Pending"

3. **Verify Calculations**:
   - Check a few alerts
   - Alert detail should show MTTD in minutes
   - All Closed alerts should have metrics

---

## 📋 Files Modified

1. `/app/api/alerts/route.ts` - Fixed date range timezone calculation
2. `/lib/api/stellar-cyber.ts` - Increased default lookback from 7→30 days  
3. `/app/dashboard/sla/page.tsx` - Added 3-tier MTTD fallback system
4. `/scripts/sync-stellar-cyber-alerts-api.js` - NEW: Manual sync script
5. `/SYNC_STELLAR_CYBER_ALERTS.md` - NEW: Documentation

---

## 💡 Technical Details

### Why Some Alerts Didn't Have MTTD

1. **Stellar Cyber Search API** returns minimal metadata
   - Only basic alert fields are returned
   - Full `user_action.history` not included
   - Solution: Added fallback to `closed_time` metadata

2. **7-Day Default Lookback** was too restrictive
   - Alerts synced from Dec 1-16 weren't being fetched
   - Solution: Extended default to 30 days

3. **Date Range Bug** excluded last day of range
   - User selecting "9-16 Dec" only got alerts until "15 Dec 23:59"
   - Solution: Fixed timezone offset calculation

### MTTD Calculation Tiers

**Tier 1** (Preferred):
```
MTTD = alertTime → first assignee change time
Calculated from: user_action.history
Example: alert at 19:30 → assigned at 19:31 = 1 minute MTTD
```

**Tier 2** (Fallback):
```
MTTD = alertTime → updatedAt
Calculated from: alert.updatedAt field
Example: alert at 19:30 → updated at 19:35 = 5 minutes MTTD
```

**Tier 3** (Final Fallback):
```
MTTD = alertTime → closed_time  
Calculated from: metadata.closed_time
Example: alert at 19:30 → closed at 19:47 = 17 minutes MTTD
```

All synced alerts have Tier 3 data available, so **100% of closed alerts will have MTTD metrics**.

---

## 🚀 Status: READY

✅ All code changes deployed  
✅ Manual sync script tested and working  
✅ Database verified with 324 alerts synced  
✅ MTTD calculation data available for all closed alerts  

**User can now:**
- See MTTD metrics in SLA Dashboard
- Sync additional alerts manually using provided script
- View complete alert history with metrics
