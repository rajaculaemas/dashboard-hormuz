# Context Menu Filtering Feature

## Overview
Fitur context menu filtering memungkinkan pengguna untuk memfilter data alert dengan cara klik kanan pada nilai cell di tabel alert. Fitur ini terinspirasi dari filter Kibana dengan opsi "Add as Including Filter" dan "Add as Excluding Filter".

## Cara Penggunaan

### Menambahkan Filter
1. **Klik kanan** pada nilai cell di tabel alert
2. Pilih salah satu opsi:
   - **Add as Including Filter** (ikon +) - Menampilkan hanya alert yang memiliki nilai yang sama
   - **Add as Excluding Filter** (ikon −) - Menyembunyikan alert yang memiliki nilai yang sama

### Menghapus Filter
1. **Hapus filter individual** - Klik tombol X pada chip filter di atas tabel
2. **Hapus semua filter** - Klik tombol "Clear All" yang muncul ketika ada filter aktif

### Contoh Penggunaan

**Scenario 1: Filter by IP Address**
- Klik kanan pada IP address "192.168.1.100"
- Pilih "Add as Including Filter"
- Tabel hanya menampilkan alert dengan source IP "192.168.1.100"

**Scenario 2: Exclude Low Severity**
- Klik kanan pada severity "Low"
- Pilih "Add as Excluding Filter"
- Tabel menyembunyikan semua alert dengan severity "Low"

**Scenario 3: Multiple Filters**
- Include filter: status = "New"
- Include filter: severity = "Critical"
- Exclude filter: source = "wazuh"
- Hasil: Hanya menampilkan alert baru dengan severity critical, tetapi bukan dari wazuh

## Filter Logic

### Include Filters (AND Logic)
- Semua include filter harus cocok (ALL must match)
- Jika ada 2 include filter, alert harus memenuhi kedua kondisi

### Exclude Filters (NOT Logic)
- Tidak boleh ada exclude filter yang cocok (NONE must match)
- Jika ada exclude filter yang cocok, alert akan disembunyikan

### Combined Logic
```
Show alert IF:
  (ALL include filters match OR no include filters exist)
  AND
  (NO exclude filters match)
```

## Kolom yang Didukung

Filter dapat diterapkan pada kolom berikut:
- **Timestamp** - Waktu alert
- **ID** - Alert ID
- **Name** - Nama alert
- **Severity** - Critical, High, Medium, Low
- **Status** - New, In Progress, Ignored, Closed
- **Source** - wazuh, qradar, stellar-cyber
- **Integration** - Nama integration
- **Source IP** - IP address sumber
- **Destination IP** - IP address tujuan
- **Protocol** - HTTP, SSH, FTP, etc.
- **Response Code** - HTTP status code
- **HTTP Method** - GET, POST, PUT, DELETE

## Implementasi Teknis

### File yang Dimodifikasi
1. **components/alert/alert-context-menu.tsx** (NEW)
   - AlertContextMenu component - UI menu klik kanan
   - ActiveFilters component - Display chip filter aktif
   - AlertFilter interface - Type definition

2. **components/alert/alert-table.tsx**
   - Menambahkan context menu handler
   - Integrasi dengan filter props
   - Text extraction dari React elements (Badge)

3. **app/dashboard/page.tsx**
   - State management untuk alertFilters
   - Filter logic implementation (applyFilters)
   - Helper function getAlertColumnValue
   - Pass props ke AlertTable

### Type Definitions
```typescript
interface AlertFilter {
  id: string              // Unique identifier
  column: string          // Column ID (e.g., "srcIp")
  value: string           // Filter value
  type: "include" | "exclude"
}
```

## UI/UX Details

### Context Menu
- Posisi: Fixed positioning mengikuti mouse cursor
- Auto-close: Klik di luar menu atau tekan Escape
- Validasi: Menu tidak muncul untuk nilai kosong atau "-"
- Icon: + untuk include, − untuk exclude

### Active Filters Display
- Lokasi: Di atas tabel alert
- Warna:
  - Include filter: Green background (`bg-green-500/10 text-green-500`)
  - Exclude filter: Red background (`bg-red-500/10 text-red-500`)
- Format: `{column}: {value}` dengan X button
- Clear All button: Muncul ketika ada filter aktif

### Dark Mode Support
- Semua komponen mendukung dark mode
- Konsisten dengan theme aplikasi
- Hover states yang jelas

## Performance Considerations

1. **Filter di Client-Side**
   - Filter diterapkan setelah data dimuat dari API
   - Tidak mengirim request baru ke server
   - Cocok untuk dataset yang sudah di-load

2. **Memory Efficient**
   - Filter hanya menyimpan column ID dan value
   - Tidak menyimpan referensi ke alert objects

3. **Responsive**
   - Filter instantly tanpa lag
   - No debouncing needed (triggered by click)

## Future Enhancements (Optional)

1. **Save Filters**
   - Simpan filter combinations ke localStorage
   - Quick access ke filter yang sering digunakan

2. **Filter Presets**
   - "Critical Alerts Only"
   - "Exclude False Positives"
   - Custom preset names

3. **Advanced Operators**
   - Contains / Not Contains
   - Regex support
   - Greater than / Less than untuk numbers

4. **Server-Side Filtering**
   - Push filters ke API untuk dataset besar
   - Pagination dengan filter active

## Troubleshooting

### Filter Tidak Bekerja
- Cek console untuk debug logs
- Pastikan column ID sesuai dengan data structure
- Verify getAlertColumnValue mapping

### Context Menu Tidak Muncul
- Pastikan klik kanan pada cell yang memiliki nilai
- Menu tidak muncul untuk empty cells atau "-"
- Cek browser context menu tidak override

### Filter Count Tidak Sesuai
- Include filters adalah AND logic (semua harus match)
- Bukan OR logic (salah satu match)
- Exclude filters akan hide ANY matching values

## Related Files
- `components/alert/alert-context-menu.tsx` - Context menu UI
- `components/alert/alert-table.tsx` - Table integration
- `app/dashboard/page.tsx` - State management
- `components/ui/badge.tsx` - Badge component used for filter chips
- `components/ui/button.tsx` - Button components
