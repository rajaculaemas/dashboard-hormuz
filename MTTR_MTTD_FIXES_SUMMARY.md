# Socfortress MTTR/MTTD Fixes - Summary

## Issues Fixed

### 1. ✅ Case Detail Dialog JavaScript Error
**Problem**: `TypeError: _caseDetail_integration1.includes is not a function`

**Root Cause**: `caseDetail.integration` is an object with properties `{ id, name, source }`, not a string. Trying to call `.includes()` on an object causes the error.

**Location**: `components/case/case-detail-dialog.tsx` line 1259

**Fix Applied**:
```diff
- {caseDetail.integration?.includes("socfortress") && ...}
+ {(caseDetail.integration?.source === "socfortress" || caseDetail.integration?.name?.toLowerCase().includes("socfortress")) && ...}
```

Now it properly checks:
- Integration source is "socfortress" OR
- Integration name contains "socfortress"

**Status**: ✅ Fixed & Tested

---

### 2. 🔧 MTTR Values Seem Too High (In Progress)

**Observation**: Tickets table shows values like 325m, 440m, 417m, 502m (5-8+ hours), which seem incorrect.

**Possible Causes**:
1. **Alert timestamps wrong**: If alerts are much older than case creation
2. **Timezone mismatch**: Alert times in UTC, case times in local time (or vice versa)
3. **Data quality**: Cases created long after alerts were linked
4. **Logic issue**: Calculation direction or timestamp source mismatched

**Debugging Steps**:

#### Step 1: Check Server Console Logs
When you fetch cases, check the server console for logs like:
```
[MTTR-DEBUG] Case 78: case_creation_time="2026-02-03 08:45:02" → 1738569902000ms
[MTTR-DEBUG] Case 78 - Alert 1675: "2026-02-04 11:05:03" → 1738647903000ms
[MTTR] Case 78: 325 minutes (from 2026-02-04T11:05:03.000Z to 2026-02-03T08:45:02.000Z)
```

Look for:
- If alert timestamp is AFTER case creation time (which would be invalid)
- If timestamps are using different timezones

#### Step 2: Run Debug Script
Execute the debug script to inspect actual database values:
```bash
node debug-socfortress-mttr.js
```

This will show:
- Actual case_creation_time from database
- All linked alert timestamps
- Calculated MTTR with detailed breakdown
- Whether alert times are valid (before case creation)

#### Step 3: Check Database Directly
```sql
SELECT 
  imc.id as case_id,
  imc.case_name,
  imc.case_creation_time,
  ima.id as alert_id,
  ima.alert_creation_time
FROM incident_management_case imc
LEFT JOIN incident_management_casealertlink imcal ON imc.id = imcal.case_id
LEFT JOIN incident_management_alert ima ON imcal.alert_id = ima.id
ORDER BY imc.case_creation_time DESC
LIMIT 10;
```

---

## Implementation Details

### MTTR Calculation Flow

```
Database → getSocfortressCases() → /api/cases API → Tickets Page
                    ↓
          Calculate MTTR:
          1. Get case_creation_time (MySQL DATETIME)
          2. Find latest alert from linked alerts
          3. Calculate: case_creation_time - latest_alert_time
          4. Convert to minutes
          5. Return in response
```

### Key Functions

**File**: `lib/api/socfortress.ts`

- `toMs(value)` (lines 7-27): Converts timestamps to milliseconds
  - Handles: Numbers, Strings, Dates
  - Numbers > 1e12: Treated as milliseconds
  - Numbers ≤ 1e12: Multiplied by 1000 (seconds)
  - Strings: Parsed as Date, then to ms
  - Dates: Call `.getTime()`

- `computeMetricMs(startMs, endMs)` (lines 30-39): Calculate time difference
  - Validates: startMs < endMs
  - Returns: endMs - startMs (positive milliseconds)
  - Returns: null if invalid

- `getSocfortressCases()` (lines 717-835): Main case fetching function
  - Lines 747-774: Calculate MTTR with enhanced logging
  - Returns: `mttrMinutes` in case object

### Display Components

**Alert Detail Panel**: `components/alert/socfortress-alert-detail-dialog.tsx`
- Displays MTTD using `alert.metadata.socfortress_alert_to_first` ✅

**Case Detail Panel**: `components/case/case-detail-dialog.tsx`
- Displays MTTR for Socfortress cases ✅ (fixed error)
- Checks: `caseDetail.integration?.source === "socfortress"`

**Tickets Table**: `app/dashboard/tickets/page.tsx`
- Displays MTTR column using `mttrMinutes` from API ✅

---

## Testing Checklist

Before deployment:

- [ ] Case detail dialog opens without errors
- [ ] MTTR badge shows correct value
- [ ] SLA breach coloring is correct (red if exceeded)
- [ ] Check server logs for MTTR calculation details
- [ ] Run `debug-socfortress-mttr.js` and verify values match table
- [ ] Test with specific case known to have reliable timestamps

---

## Timestamp Conversion Rules

The `toMs()` function handles multiple formats:

| Input | Expected | Result |
|-------|----------|--------|
| `1738569902000` | Milliseconds | `1738569902000` |
| `1738569902` | Seconds | `1738569902000` |
| `"2026-02-03 08:45:02"` | MySQL DATETIME | `1738569902000` |
| `"2026-02-03T08:45:02Z"` | ISO String | `1738569902000` |
| `new Date(...)` | JavaScript Date | `1738569902000` |

---

## If MTTR Still Shows Wrong Values

### Possible Fix 1: Timezone Adjustment
If every MTTR is off by a consistent amount (e.g., always 8 hours too high), it's a timezone issue.

**Check**: Are alert timestamps stored in UTC while case times are local?

**Solution**: Normalize all timestamps to UTC before calculation.

### Possible Fix 2: Alert Selection
If oldest alert is being used instead of latest (values too high):

**Check**: Verify `Math.max(...alertTimestamps)` is finding the latest

**Solution**: Add explicit timestamp validation and sorting.

### Possible Fix 3: Case Timestamps
If case creation times are incorrectly stored:

**Check**: Manually verify a case timestamp in database matches what's displayed

**Solution**: May need to fix data import or add timestamp normalization.

### Possible Fix 4: MTTR Direction
If calculation is backwards (alert - case instead of case - alert):

**Check**: Verify formula in `getSocfortressCases()` at line 752:
```typescript
const mttrMs = computeMetricMs(latestAlertMs, caseCreatedMs)
// This should be: caseCreatedMs - latestAlertMs
```

---

## Files Modified

| File | Change |
|------|--------|
| `components/case/case-detail-dialog.tsx` | Fixed integration check from `.includes()` to `.source ===` |
| `lib/api/socfortress.ts` | Added detailed MTTR calculation logging |
| `debug-socfortress-mttr.js` | New debugging utility |

---

## Next Steps

1. ✅ **Error Fixed**: Test case detail dialog - should open without errors
2. 🔍 **Investigate**: Check server logs for MTTR calculation values  
3. 🧹 **Debug**: Run `debug-socfortress-mttr.js` to inspect database values
4. 🔧 **Validate**: Compare script output with displayed MTTR values
5. 📊 **Solution**: Based on debug results, implement appropriate fix

**Expected Workflow**:
```
User opens case detail → Dialog renders without error ✓
User views MTTR value → Check server console logs
Run debug script → Shows actual timestamps from database
Compare × debug values with × displayed values → Identify issue
Apply fix if needed → Retest
```

---

**Status**: 
- ✅ JavaScript error fixed
- 🔧 MTTR debugging in progress (user to investigate with logs)
- ⏳ Awaiting feedback on MTTR values from debug script
