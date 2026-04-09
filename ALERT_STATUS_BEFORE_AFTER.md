# Alert Status Fix - Before & After Comparison

## Visual Comparison

### BEFORE (Broken)
```
┌─────────────────────────────────────────────────────────────┐
│ Alert Feed Table                                            │
├────┬──────────────────────┬──────────┬──────────┬──────────┤
│ ID │ Alert Name           │ Status   │ Severity │ Source   │
├────┼──────────────────────┼──────────┼──────────┼──────────┤
│ 1686│ System Info Discovery│ ❌ New   │ Low      │SOCFort..│  
│ 1687│ URL too long         │ ❌ New   │ High     │SOCFort..│
│ 1688│ Wazuh Agent Unavail..│ ❌ New   │ Medium   │SOCFort..│
└────┴──────────────────────┴──────────┴──────────┴──────────┘

Detail Panel (Alert #1686):
┌──────────────────────────────────────┐
│ Detects System Information Discovery │
│                                      │
│ ✅ Status: CLOSED   <-- CORRECT     │
│ Severity: Low                        │
│ Source: wazuh                        │
│ Timeline: [Status changed to CLOSED] │
└──────────────────────────────────────┘

⚠️ INCONSISTENCY: Table shows "New" but Detail shows "CLOSED"
```

### AFTER (Fixed)
```
┌─────────────────────────────────────────────────────────────┐
│ Alert Feed Table                                            │
├────┬──────────────────────┬──────────┬──────────┬──────────┤
│ ID │ Alert Name           │ Status   │ Severity │ Source   │
├────┼──────────────────────┼──────────┼──────────┼──────────┤
│ 1686│ System Info Discovery│ ✅ Closed│ Low      │SOCFort..│  
│ 1687│ URL too long         │ ✅ New   │ High     │SOCFort..│
│ 1688│ Wazuh Agent Unavail..│ ✅ In Pr │ Medium   │SOCFort..│
└────┴──────────────────────┴──────────┴──────────┴──────────┘

Detail Panel (Alert #1686):
┌──────────────────────────────────────┐
│ Detects System Information Discovery │
│                                      │
│ ✅ Status: CLOSED   <-- CORRECT     │
│ Severity: Low                        │
│ Source: wazuh                        │
│ Timeline: [Status changed to CLOSED] │
└──────────────────────────────────────┘

✅ CONSISTENT: Table shows "Closed" and Detail shows "CLOSED"
```

## Code Change

### File: `lib/api/socfortress.ts`

```diff
/**
 * Map MySQL status to generic status
 * Copilot uses simple OPEN/IN_PROGRESS/CLOSED status
- * Map all alerts to "New" initially to show them in dashboard
- * (Closed incidents from Copilot should still be visible for analyst review)
+ * Map to the actual status from database to maintain consistency
 */
 function mapStatusFromMySQL(status: string): string {
-  // All Copilot alerts are mapped to "New" to ensure they appear in dashboard
-  // Users can see, review, and update status to In Progress or Closed as needed
-  // This ensures no alerts are hidden due to status filtering
-  return "New"  // Map all Copilot alerts to New for visibility
+  const statusMap: Record<string, string> = {
+    OPEN: "New",
+    IN_PROGRESS: "In Progress",
+    CLOSED: "Closed",
+    // Fallback for any other status
+  }
+
+  // If status exists in map, use mapped value; otherwise return "New" as default
+  return statusMap[status?.toUpperCase()] || "New"
 }
```

## Status Mapping Logic

### Database Status → UI Display

| Database Status | UI Display | Meaning |
|---|---|---|
| `OPEN` | "New" | Alert baru belum ditindaklanjuti |
| `IN_PROGRESS` | "In Progress" | Alert sedang dikerjakan / dianalisis |
| `CLOSED` | "Closed" | Alert sudah selesai / ditutup |

## User Impact

### Before Fix (Problematic)
- All alerts appear as "New" regardless of actual status
- Users can't distinguish between new and closed alerts in the table
- Have to click each alert to see real status in detail panel
- Confusing workflow and poor UX

### After Fix (Improved)
- Alert status in table matches detail panel
- Users can quickly identify alert status at a glance
- Better workflow efficiency and clarity
- Consistent status representation across all views

## How to Verify

1. **Check Table Column**: Alert status should now reflect actual database status
2. **Compare with Detail Panel**: Status in table should match status in detail modal
3. **Closed Alerts**: Should show "Closed" status instead of "New"
4. **In Progress Alerts**: Should show "In Progress" status
5. **New Alerts**: Should show "New" status (only for truly new/unhandled alerts)
