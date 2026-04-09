# Socfortress/Copilot MTTD & MTTR Implementation - Checklist

## ✅ Completed Implementations

### 1️⃣ MTTD Calculation Core Functions
- ✅ `toMs()` - Convert various timestamp formats to milliseconds
- ✅ `computeMetricMs()` - Calculate time difference in milliseconds
- ✅ `calculateMttdForSocfortress()` - 3-tier fallback MTTD calculation
  - Tier 1: `alert_history` → first ASSIGNMENT_CHANGE
  - Tier 2: `alert.updatedAt` fallback
  - Tier 3: `alert.time_closed` final fallback

**Location:** [lib/api/socfortress.ts](lib/api/socfortress.ts) - Lines 7-99

---

### 2️⃣ Alert Transformation & MTTD Storage
- ✅ Updated `transformAlert()` function
- ✅ Calculate MTTD for each alert using `calculateMttdForSocfortress()`
- ✅ Store MTTD in `metadata.socfortress_alert_to_first` (milliseconds)
- ✅ Log MTTD calculation progress

**Location:** [lib/api/socfortress.ts](lib/api/socfortress.ts) - Lines 199-247

**Field Pattern:**
```json
{
  "metadata": {
    "socfortress_alert_to_first": 1560000,  // MTTD in ms (26 minutes)
    "socfortress": {
      "alert_creation_time": "2026-02-04T11:05:03Z",
      "time_closed": "2026-02-04T11:07:17Z"
    }
  }
}
```

---

### 3️⃣ MTTR Calculation for Cases
- ✅ Calculate MTTR in `getSocfortressCases()` function
- ✅ Find latest alert time from case alerts
- ✅ Calculate: `case.createdAt - latest_alert_time`
- ✅ Store in `metadata.mttrMinutes` (already in minutes)
- ✅ Also store at top-level `mttrMinutes` field for easy access
- ✅ Log MTTR calculation progress

**Location:** [lib/api/socfortress.ts](lib/api/socfortress.ts) - Lines 770-815

**Field Pattern:**
```json
{
  "metadata": {
    "mttrMinutes": 120,  // MTTR in minutes
    "socfortress": {
      "case_creation_time": "2026-02-05 10:00:00"
    }
  },
  "mttrMinutes": 120  // Top-level field for API response
}
```

---

### 4️⃣ Export & Display Formatting
- ✅ Updated `formatMTTD()` in export route
- ✅ Check for `metadata.socfortress_alert_to_first` (Socfortress MTTD)
- ✅ Check for `metadata.user_action_alert_to_first` (Stellar MTTD)
- ✅ Format MTTD as: "45s", "26m", "2h", "1d"
- ✅ Fallback to `timestamp - updatedAt` if no calculated MTTD

**Location:** [app/api/alerts/export/route.ts](app/api/alerts/export/route.ts) - Lines 136-176

**Example Output:**
```
Alert MTTD: "26m"
Alert MTTD: "2h"
Alert MTTD: "1d"
```

---

### 5️⃣ Tickets Page Integration
- ✅ Add `isSocfortress` integration detection
- ✅ Fetch mttrMinutes from API response
- ✅ Calculate SLA breach status (threshold-based)
- ✅ Display MTTR with color coding (red if breached)
- ✅ Support "all integrations" view
- ✅ Log MTTR data for debugging

**Location:** [app/dashboard/tickets/page.tsx](app/dashboard/tickets/page.tsx)
- Lines 562-635: Single Socfortress integration handling
- Lines 408-453: "All integrations" handling
- Lines 289-310: SLA threshold definitions

**SLA Thresholds:**
| Severity | Threshold |
|----------|-----------|
| Critical | 15m       |
| High     | 30m       |
| Medium   | 60m       |
| Low      | 120m      |

---

### 6️⃣ Testing & Verification
- ✅ Created test script: [test-socfortress-mttd-mttr.js](test-socfortress-mttd-mttr.js)
- ✅ Test MTTD calculation for alerts
- ✅ Test MTTR calculation for cases
- ✅ Verify SLA compliance
- ✅ Show calculation coverage percentage

**Run Test:**
```bash
node test-socfortress-mttd-mttr.js
```

---

### 7️⃣ Documentation
- ✅ Updated [MTTR_MTTD_CALCULATION.md](MTTR_MTTD_CALCULATION.md)
- ✅ Added Socfortress implementation section
- ✅ Documented 3-tier fallback strategy
- ✅ Provided code examples
- ✅ Listed all related files
- ✅ Included troubleshooting guide

---

## 📋 Data Flow Summary

### Alert MTTD Calculation Flow
```
Database (incident_management_alert + incident_management_alert_history)
    ↓
getSocfortressAlerts() OR fetchUnlinkedAlerts()
    ↓
transformAlert()
    ↓
calculateMttdForSocfortress() 🔄 3-Tier Fallback
    ├─ Tier 1: alert_history → first ASSIGNMENT_CHANGE
    ├─ Tier 2: alert.updatedAt
    └─ Tier 3: time_closed
    ↓
Store: metadata.socfortress_alert_to_first (ms)
    ↓
API Response → Frontend
    ↓
formatMTTD() → "26m" / "2h" / "1d" (Export)
```

### Case MTTR Calculation Flow
```
Database (incident_management_case + case alerts)
    ↓
getSocfortressCases()
    ↓
For each case:
  1. Fetch linked alerts
  2. Transform alerts (includes MTTD calc)
  3. Find latest alert time
  4. Calculate: case.createdAt - latest_alert_time
    ↓
Store: metadata.mttrMinutes (minutes)
Store: mttrMinutes (top-level, minutes)
    ↓
API Response → Frontend Tickets Page
    ↓
Display: "120m" with SLA color coding
```

---

## 🔍 Field Mappings

### Source to Database
| Source Field | Socfortress DB | Purpose |
|------|---------|---------|
| Alert creation | `incident_management_alert.alert_creation_time` | MTTD start |
| First action | `incident_management_alert_history.changed_at` (ASSIGNMENT_CHANGE) | MTTD Tier 1 |
| Alert update | `incident_management_alert.updatedAt` | MTTD Tier 2 |
| Alert closure | `incident_management_alert.time_closed` | MTTD Tier 3 |
| Case creation | `incident_management_case.case_creation_time` | MTTR end |
| Latest alert | Derived from case alerts | MTTR start |

### Database to Frontend
| DB Field | Stored In | Frontend Use |
|---------|-----------|-------------|
| MTTD (ms) | `alert.metadata.socfortress_alert_to_first` | Export, Display |
| MTTR (min) | `case.metadata.mttrMinutes` | Tickets Page |
| MTTR (min) | `case.mttrMinutes` | Quick Access |

---

## 🚀 How to Verify Implementation

### 1. Check Database
```sql
-- Check MTTD for Socfortress alerts
SELECT 
  id, 
  title, 
  status,
  metadata->>'socfortress_alert_to_first' as mttd_ms
FROM alert 
WHERE integration_id IN (SELECT id FROM integration WHERE source = 'socfortress')
LIMIT 5;

-- Check MTTR for Socfortress cases
SELECT 
  id, 
  name, 
  status,
  metadata->>'mttrMinutes' as mttr_minutes
FROM case 
WHERE integration_id IN (SELECT id FROM integration WHERE source = 'socfortress')
LIMIT 5;
```

### 2. Test with Node Script
```bash
node test-socfortress-mttd-mttr.js
```

✅ Expected Output:
- Alerts with MTTD calculated
- MTTR values showing for cases
- SLA status (PASS/FAIL) displayed
- Coverage percentage > 0%

### 3. Manual UI Testing
1. Navigate to Tickets page
2. Select Socfortress/Copilot integration
3. Verify MTTR column displays values (not "N/A")
4. Check SLA breach (red text if MTTR > threshold)
5. Export to CSV and verify MTTD formatting (e.g., "26m")

### 4. Debug Logging
All MTTD & MTTR calculations log to console:
```
[MTTD] Alert 1675: Tier 1 (history) = 26m
[MTTR] Case 100: 120 minutes (from 2026-02-04T11:07:17 to 2026-02-05T10:00:00)
```

---

## ⚠️ Known Limitations & Future Improvements

### Current Limitations
1. **Tier 1 MTTD requires ASSIGNMENT_CHANGE in history** - If only STATUS_CHANGE exists, falls back to Tier 2/3
2. **MTTR only calculated if alerts are linked** - Orphaned cases show N/A
3. **Timestamp conversion assumes ISO 8601 or epoch milliseconds** - Other formats may fail

### Future Improvements
1. Add support for other action types in MTTD calculation (e.g., COMMENT_ADDED)
2. Implement automatic MTTD backfill script for existing alerts
3. Add MTTD/MTTR trend analysis and reporting
4. Cache MTTD calculation results for performance
5. Add bulk MTTD recalculation endpoint

---

## 📞 Support & Troubleshooting

### Common Issues

**Q: Case shows MTTR as "N/A"**
- Check if alerts are linked to case in `incident_management_casealertlink`
- Verify alert `alert_creation_time` is valid timestamp
- Check logs for calculation errors

**Q: Alert shows MTTD as empty/null**
- Verify alert has `alert_history` entries or `time_closed` value
- Check if `alert_creation_time` is populated
- Review console logs for calculation details

**Q: MTTR not matching expected value**
- Verify latest alert timestamp is correct
- Check case creation time is reasonable
- Ensure timestamps are in same timezone

### Debug Commands
```bash
# Test MTTD calculation
node test-socfortress-mttd-mttr.js

# Check database alerts
psql -U user -d database -c "SELECT id, title, metadata FROM alert WHERE integration_id='...' LIMIT 1"

# View logs
docker logs soc-dashboard-app | grep MTTD
```

---

## 📝 Changelog

### 2026-02-11 - Implementation Complete
- ✅ Added MTTD calculation functions to socfortress.ts
- ✅ Integrated MTTD calculation into transformAlert()
- ✅ Added MTTR calculation into getSocfortressCases()
- ✅ Updated export formatMTTD() for Socfortress
- ✅ Updated tickets/page.tsx to display Socfortress MTTR
- ✅ Created test script for verification
- ✅ Updated documentation

---

## 📚 Related Documentation

- [MTTR_MTTD_CALCULATION.md](MTTR_MTTD_CALCULATION.md) - Full technical documentation
- [lib/api/socfortress.ts](lib/api/socfortress.ts) - Implementation source
- [app/dashboard/tickets/page.tsx](app/dashboard/tickets/page.tsx) - UI integration
- [test-socfortress-mttd-mttr.js](test-socfortress-mttd-mttr.js) - Test script

---

✅ **Implementation Status: COMPLETE**

All MTTD and MTTR calculation features for Socfortress/Copilot integration are implemented and ready for testing.
