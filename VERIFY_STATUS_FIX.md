# Verifikasi Fix Status Alert SOCFortress

## Masalah yang Diperbaiki
Alert status ditampilkan berbeda antara:
- **Detail Panel Alert** (benar): Menampilkan status dari database
- **Tabel Alert** (salah): Selalu menampilkan "New"

Contoh alert #1686:
- Detail Panel: Status = "CLOSED" ✅
- Tabel Alert: Status = "New" ❌

## Penyebab
Fungsi `mapStatusFromMySQL()` di `lib/api/socfortress.ts` hardcoded mengembalikan `"New"` untuk semua alert.

## Solusi yang Diterapkan
✅ Update fungsi `mapStatusFromMySQL()` untuk melakukan mapping status yang benar:
- Database `OPEN` → Display "New"
- Database `IN_PROGRESS` → Display "In Progress"  
- Database `CLOSED` → Display "Closed"

## Cara Verifikasi Fix

### Opsi 1: Via Dashboard UI (Recommended)
1. Buka halaman Alerts di dashboard
2. Cari salah satu alert yang statusnya CLOSED (misal Alert #1686)
3. Lihat status di tabel - harus sama dengan status di detail panel

### Opsi 2: Via API (Manual Test)
```bash
# 1. Trigger resync SOCFortress alerts
curl -X POST http://localhost:3000/api/alerts/sync \
  -H "Content-Type: application/json" \
  -d '{"integrationId": "YOUR_SOCFORTRESS_INTEGRATION_ID"}'

# 2. Check response - harusnya synced count > 0
# 3. Buka dashboard dan verifikasi status alert sudah benar
```

### Opsi 3: Via Script
```bash
chmod +x resync-socfortress-alerts.sh
./resync-socfortress-alerts.sh YOUR_SOCFORTRESS_INTEGRATION_ID
```

## Expected Behavior Setelah Fix

### Alert Table
| Alert ID | Title | Status | Severity |
|----------|-------|--------|----------|
| 1686 | Detects System Information Discovery | **Closed** | Low |
| 1687 | URL too long | **New** | High |
| 1688 | Wazuh Agent Unavailable | **In Progress** | Medium |

### Detail Panel (saat klik View)
- Status badge dan detail info menampilkan status yang sama dengan tabel
- Status history (Timeline tab) menampilkan semua perubahan status

## Debugging Jika Masih Ada Masalah

### Check Server Logs
```bash
# Check if sync is working
tail -f /var/log/app/socfortress-sync.log

# Check node server logs for [SOCFortress] messages
journalctl -u socfortress-dashboard -f | grep SOCFortress
```

### Check Database Status
```bash
# Query alert status di MySQL
mysql -h copilot_db -u user -p -e "
SELECT id, alert_name, status FROM incident_management_alert 
WHERE id = 1686 LIMIT 1;
"
```

### Check Alert Object in Browser
1. Open DevTools (F12)
2. Go to Network tab
3. Refresh alerts / trigger resync
4. Check the alert sync response in Network tab
5. Look for `status` field in response - should show correct status (not always "New")

## Files Modified
- `lib/api/socfortress.ts` - Fixed `mapStatusFromMySQL()` function

## Timeline
- **Issue Found**: Alert status mismatch between detail panel and table
- **Root Cause**: Hardcoded status mapping in `mapStatusFromMySQL()`
- **Fix Applied**: Proper status mapping implementation
- **Status**: ✅ FIXED - Awaiting deployment and verification
