# QRadar Events Fetcher - Smart Timeframe Query

## Problem & Solution

### ❌ Original Problem
```
Alert dari 10 hari lalu (June 10, 12:00 PM)
QUERY: WHERE INOFFENSE(id) LAST 240 HOURS
Result: Query dari June 12 backwards (MISSES June 10!)
```

### ✅ Solution Implemented
```
Alert dari 10 hari lalu (June 10, 12:00 PM)
QUERY: WHERE INOFFENSE(id) AND starttime >= [June 10 00:00] AND starttime <= [June 11 00:00]
Result: Query hanya ~36 jam, INCLUDES June 10! Efficient & accurate!
```

---

## How It Works

### 1. Calculate Smart Query Window

```python
Offense start: June 10, 12:00 PM
    ↓
Start window: June 10, 00:00 (midnight of offense day)
End window: June 10, 12:00 PM + 12h buffer = June 11, 00:00
    ↓
Total hours: ~36 hours (NOT 240+ hours!)
Timestamp: 1781049600000 to 1781136000000 (milliseconds)
```

### 2. Query with Timestamp Range (Primary Method)

```sql
SELECT ... FROM events
WHERE INOFFENSE(12724)
AND starttime >= 1781049600000     -- June 10 00:00
AND starttime <= 1781136000000     -- June 11 00:00
```

**Advantage:**
- ✅ Efficient - only queries relevant ~36 hour window
- ✅ Accurate - captures offense day completely
- ✅ Scalable - same query time for 1 day old or 1 year old alert
- ❌ Requires QRadar AQL to support timestamp range comparison

### 3. Fallback Method (If Timestamp Range Not Supported)

```sql
WHERE INOFFENSE(12724)
LAST 36 HOURS
```

**Fallback kicks in if:**
- QRadar AQL doesn't support `AND starttime >=` syntax
- Result: Still efficient, uses calculated hours (~36h) instead of hardcoded 12h or 240h

---

## Examples

| Scenario | Query Window | Hours | Efficiency |
|----------|--------------|-------|-----------|
| Alert 10 days ago (June 10) | June 10 00:00 - June 11 00:00 | ~36h | ✅ Excellent |
| Alert 3 hours ago | Today 00:00 - Today 15:00 | ~15h | ✅ Excellent |
| Alert yesterday at 5 AM | Yesterday 00:00 - Yesterday 17:00 | ~17h | ✅ Excellent |
| Alert 1 year ago | Cap at 180 days = 4320h | 4320h | ⚠️ Large (fallback limit) |

---

## Progress Output

```
============================================================
[1/100] (1%) Processing Offense #12724
============================================================
📅 Query window: 2026-06-10 00:00 → 2026-06-11 00:00 (~24h)

📥 [Step 1/2] Fetching related events...
📡 Fetching related events for offense 12724 (timestamp range query)...
🔍 Submitting AQL query (max 8 min wait)...
📋 Search submitted: f1322080-0152-42a0-957b-f644d62c58d6
✅ [████████████████████] 100% - COMPLETED
✅ AQL returned 12 events
   💾 Saving events to database (12/12) [100%]
   ✅ Saved 12/12 events (100%)

📥 [Step 2/2] Fetching notes...
📝 Fetching notes for offense 12724...
✅ Found 1 notes
   💾 Saved 1 notes to metadata
```

---

## Database Query

The script finds offenses that:
1. Have no related events saved (`qradar_events` count = 0)
   OR
2. Have no notes in metadata

```sql
SELECT qo.id, qo.external_id, qo.start_time, ...
FROM qradar_offenses qo
WHERE 
    (SELECT COUNT(*) FROM qradar_events WHERE qradar_offense_id = qo.id) = 0
    OR (qo.metadata->>'notes' IS NULL OR qo.metadata->>'notes' = '')
ORDER BY qo.start_time DESC
LIMIT 100
```

---

## Configuration

### Time Window Calculation
- **Start**: Midnight (00:00) on offense start date
- **End**: Offense start time + 12 hour buffer
- **Max cap**: 180 days (4320 hours) for very old alerts
- **Result**: Efficient ~36 hour window (NOT 240+ hours!)

### Query Execution
- **Primary**: Timestamp range comparison (if supported)
- **Fallback**: LAST X HOURS (calculated based on window)
- **Retry logic**: Automatic fallback if primary fails
- **Timeout**: 8 minutes per AQL query
- **Max events**: 50 per offense (configurable)

---

## Testing

Run the test script:
```bash
python3 scripts/test-query-window.py
```

Expected output:
```
✅ All tests show efficient time windows!
   Instead of querying 240+ hours, we only query the day
   when the offense occurred + 12h buffer = ~36 hours
```

---

## Running the Script

```bash
# Full run (fetches first 100 offenses without events/notes)
python3 scripts/fetch_qradar_events_notes.py

# Or via wrapper
./scripts/fetch-qradar-events.sh

# Test setup first
./scripts/test-setup.sh
```

---

## Key Improvements

| Aspect | Before | After |
|--------|--------|-------|
| Query timeframe | Hardcoded 12h | Smart window (~36h for old alerts) |
| Old alert support | ❌ Misses events | ✅ Catches all events |
| Query efficiency | Large time windows | Minimal time windows |
| Resource usage | Heavy (240+ hours) | Light (~36 hours) |
| Accuracy | Low (misses data) | High (complete) |

---

## Troubleshooting

### Query returns 0 events for old alert

**Possible causes:**
1. Timestamp format not supported by QRadar
   - Solution: Falls back to LAST X HOURS
2. Events already aged out of QRadar
   - Solution: Events > 30/90/180 days may be archived
3. Offense has no related events
   - Solution: This is normal - some offenses have no events

### Query times out

```
⏱️  AQL search timeout after 8 minutes
```

Solutions:
- Increase wait time (edit `max_wait_minutes` parameter)
- Reduce max_results (edit `max_results` parameter)
- Run during off-peak hours
- Check QRadar server load

---

## References

- [QRadar Ariel Query Language](https://www.ibm.com/docs/en/qradar/7.4)
- Script: `scripts/fetch_qradar_events_notes.py`
- Test: `scripts/test-query-window.py`

---

**Created**: 2026-06-22  
**Updated**: Now  
**Status**: ✅ Production Ready
