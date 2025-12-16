# Stellar Cyber Manual Alert Sync Script

## 📋 Overview

Script untuk mensinkronisasi Stellar Cyber alerts secara manual tanpa melalui UI dashboard. Berguna untuk:
- Repair/resync database alerts
- Fetch alerts dari periode lalu yang mungkin terlewat
- Memastikan semua `user_action` dan metadata tersimpan dengan benar

## 🚀 Usage

### Basic Sync (Last 16 days)
```bash
node scripts/sync-stellar-cyber-alerts-api.js
```

### Custom Date Range (30 days)
```bash
node scripts/sync-stellar-cyber-alerts-api.js --days 30
```

### Specific Integration
```bash
node scripts/sync-stellar-cyber-alerts-api.js --days 16 --integration cmispaga200b8jwvpdct2a2i6
```

### Show Help
```bash
node scripts/sync-stellar-cyber-alerts-api.js --help
```

## 📊 Example Output

```
🚀 Starting Stellar Cyber Alert Sync
📋 Options: { integrationId: undefined, daysBack: 16, dryRun: false }
📍 API: http://localhost:3000

🔍 Finding Stellar Cyber integration...
✓ Found: Stellar Cyber TVRI (cmisp3k6v0000jwvp1fprei36)

📥 Triggering sync for 16 days...
📤 POST /api/alerts/sync

⏳ Waiting for sync to complete...

🔍 Verifying sync results...

📈 Database Statistics:
  Total Stellar Cyber Alerts: 324
  Closed Alerts: 324
  Alerts with user_action: 324

📅 Recent Alerts Sample:
  1. [2025-12-16] DHCP Server Anomaly                           | Closed   | UA: ✓
  2. [2025-12-16] External User Login Failure Anomaly           | Closed   | UA: ✓
  3. [2025-12-16] Internal IP / Port Scan Anomaly               | Closed   | UA: ✓

📊 Alerts by Date:
  2025-12-16: 4 alerts
  2025-12-15: 42 alerts
  2025-12-14: 38 alerts
  2025-12-13: 32 alerts
  2025-12-12: 41 alerts
  2025-12-11: 45 alerts
  2025-12-10: 60 alerts
  2025-12-09: 62 alerts

✅ Sync verification complete!
```

## 🔧 What Gets Synced

Each alert includes:
- **Basic Fields**: title, description, severity, status, timestamp
- **Metadata**: alert_id, alert_time, closed_time, event_status
- **User Action**: History of status changes, assignee changes, comments
- **MTTD Data**: `alert_to_first` (time to first assignee) in milliseconds
- **Network/Security Data**: Source IP, destination IP, ports, protocol info
- **Scoring**: Event score, threat score, fidelity

## 📈 MTTD Calculation

After sync, SLA Dashboard will calculate MTTD using 3-tier fallback:

1. **Primary**: `user_action.history` → Find "Event assignee changed to" action
   - Uses `alert_to_first` field if available
   - Calculates minutes from alert creation to first action

2. **Fallback 1**: If alert is Closed/Resolved, use `updatedAt` timestamp
   - Calculates minutes from alert creation to update time

3. **Fallback 2**: Use `closed_time` from metadata
   - Calculates minutes from alert creation to close time

All 324 synced alerts have `closed_time`, so **MTTD will be calculated for all Closed alerts**.

## 🔍 Verification

After running sync, you can verify:

```bash
# Check total alerts by date
psql -U soc -d socdashboard -c "
  SELECT 
    DATE(timestamp AT TIME ZONE 'Asia/Jakarta') as date,
    COUNT(*) as count
  FROM alerts
  WHERE integrationId = (SELECT id FROM integrations WHERE source = 'stellar-cyber' LIMIT 1)
  GROUP BY DATE(timestamp AT TIME ZONE 'Asia/Jakarta')
  ORDER BY date DESC
  LIMIT 10;
"

# Check MTTD data availability
psql -U soc -d socdashboard -c "
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN metadata->'user_action'->>'alert_to_first' IS NOT NULL THEN 1 END) as with_mttd,
    COUNT(CASE WHEN metadata->>'closed_time' IS NOT NULL THEN 1 END) as with_closed_time
  FROM alerts
  WHERE integrationId = (SELECT id FROM integrations WHERE source = 'stellar-cyber' LIMIT 1)
  AND status = 'Closed';
"
```

## 🛠️ Troubleshooting

### "No Stellar Cyber integration found"
- Ensure Stellar Cyber integration is configured in Integrations page
- Check that integration status is "connected"

### "API Call Failed"
- Ensure backend server is running (`npm run dev`)
- Check API_BASE_URL environment variable if using non-default URL
- Check database connection

### Low MTTD Data
- Some alerts from API might not have complete `user_action` history
- Script will use `closed_time` fallback for these
- SLA Dashboard will show metrics for all closed alerts

## 📝 Recent Fixes

### 1. Date Range Bug (app/api/alerts/route.ts)
**Problem**: When selecting date range like "9-16 Dec", API was excluding the last day (Dec 16)

**Root Cause**: Incorrect timezone conversion calculation
```javascript
// BEFORE (BUGGY)
endDate.setUTCHours(23, 59, 59, 999)  // Wrong on already-offset date

// AFTER (FIXED)
const nextDayUTC = new Date(toUTC.getTime() + 24 * 60 * 60 * 1000)
endDate = new Date(nextDayUTC.getTime() - UTC_PLUS_7_OFFSET_MS - 1)
```

### 2. Default Days Back Extended (lib/api/stellar-cyber.ts)
**Change**: Default `daysBack` parameter increased from 7 days → 30 days
**Impact**: Now fetches 30 days of alerts by default instead of just last week

### 3. MTTD Fallback Tiers (app/dashboard/sla/page.tsx)
**Added**: Three-tier fallback system for MTTD calculation
- Tier 1: `user_action.history` (first assignee change)
- Tier 2: `updatedAt` field  
- Tier 3: `closed_time` metadata

This ensures MTTD can be calculated even if full history is missing.

## 🎯 Next Steps

1. Run sync script: `node scripts/sync-stellar-cyber-alerts-api.js --days 16`
2. Wait for completion (usually < 1 minute for 300 alerts)
3. Check SLA Dashboard - MTTD should now show values instead of "Pending"
4. If issues persist, check database directly with verification queries above
