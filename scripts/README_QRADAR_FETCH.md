# QRadar Related Events & Notes Fetcher

Script untuk menarik **related events** dan **notes** dari QRadar untuk alerts yang belum memiliki data tersebut, dengan menggunakan **timeframe dinamis** berdasarkan waktu alert muncul.

## 🎯 Tujuan

- Mengambil related events dari QRadar untuk offenses yang belum punya data
- Mengambil notes dari QRadar untuk offenses
- Menyimpan data ke database PostgreSQL
- Menggunakan timeframe yang dinamis berdasarkan umur alert (jangan hardcoded 12 jam)

## 🔧 Fitur

✅ **Timeframe Dinamis** - Calculates hours from offense start time + 2 hour buffer  
✅ **Batch Processing** - Process multiple offenses sequentially  
✅ **Error Handling** - Graceful error handling dengan retry logic  
✅ **Database Integration** - Direct PostgreSQL connection  
✅ **QRadar API Integration** - Uses Ariel Query Language (AQL) untuk fetch events  

## 📋 Requirement

### Python Packages
```bash
pip3 install psycopg2-binary requests python-dotenv
```

### Database
- PostgreSQL database dengan tables: `qradar_offenses`, `qradar_events`
- PostgreSQL running pada: `localhost:5432`
- Credentials: `soc:punggawa@localhost`

### QRadar
- QRadar host dengan API access
- API key yang valid

## 📁 Files

```
scripts/
├── fetch_qradar_events_notes.py    # Main Python script
├── fetch-qradar-events.sh          # Bash wrapper
└── README_QRADAR_FETCH.md         # This file
```

## 🚀 Quick Start

### Option 1: Menggunakan Bash Wrapper
```bash
# Dari project root
./scripts/fetch-qradar-events.sh
```

### Option 2: Langsung Python
```bash
cd /home/soc/soc-dashboard

# Install dependencies jika belum
pip3 install psycopg2-binary requests python-dotenv

# Run script
python3 scripts/fetch_qradar_events_notes.py
```

### Option 3: Dengan Environment Variables Custom
```bash
DB_HOST=localhost DB_PORT=5432 DB_NAME=socdashboard \
DB_USER=soc DB_PASSWORD=punggawa \
python3 scripts/fetch_qradar_events_notes.py
```

## 🔄 Proses Kerja

```
START
  ↓
Connect ke PostgreSQL
  ↓
Get QRadar integration dari database
  ↓
Find all offenses yang belum punya events/notes
  ↓
For each offense:
  ├─ Calculate dynamic timeframe
  │  └─ hours = min(12, max(1, offense_age_hours + 2))
  ├─ Query QRadar AQL untuk related events
  │  └─ WHERE INOFFENSE(id) LAST ${hours} HOURS
  ├─ Save events ke qradar_events table
  ├─ Query QRadar untuk offense notes
  ├─ Save notes ke qradar_offenses.metadata.notes
  └─ Wait 2 detik before next offense
  ↓
Print summary (total events, offenses processed)
  ↓
Close database connection
  ↓
EXIT
```

## 📊 Timeframe Logic

### Dynamic Calculation
```python
def calculate_dynamic_timeframe(start_time):
    now = datetime.now()
    offense_age = now - start_time
    hours_since_start = offense_age.total_seconds() / 3600
    
    # Gunakan offense age + 2 hour buffer, max 12 hours
    dynamic_hours = min(12, max(1, int(hours_since_start + 2)))
    
    return dynamic_hours
```

### Contoh
- Alert dibuat 24 jam lalu → `min(12, 24+2) = 12 jam` ✅
- Alert dibuat 5 jam lalu → `min(12, 5+2) = 7 jam` ✅
- Alert dibuat 1 jam lalu → `min(12, 1+2) = 3 jam` ✅
- Alert dibuat 0.5 jam lalu → `min(12, 0.5+2) = 1 jam` (minimum) ✅

## 📝 Filtering

Script hanya akan process offenses yang:
1. **Tidak punya related events** (`WHERE qradar_events.count = 0`)
   OR
2. **Tidak punya notes** (`WHERE metadata.notes IS NULL or empty`)

Max 100 offenses per run untuk avoid API rate limiting.

## 🔐 Credentials

Credentials diambil dari:
1. `.env.local` file (environment variables)
2. Database integration config

```env
# .env.local
DATABASE_URL="postgresql://soc:punggawa@localhost:5432/socdashboard"
QRADAR_HOST=https://100.100.11.101
QRADAR_USERNAME=soc_pci
QRADAR_PASSWORD=j8i>pSt,wQ98
```

## 📈 Output Example

```
============================================================
🚀 QRadar Related Events & Notes Fetcher
============================================================
✅ Connected to database: socdashboard
✅ Found QRadar integration: clxxx...
🔗 QRadar Host: 100.100.11.101

📊 Found 25 offenses without events/notes

============================================================
[1/25] Processing Offense #15624
============================================================
⏰ Offense age: 24.5h → Dynamic timeframe: 12h
📡 Fetching related events for offense 15624 (last 12h)...
🔍 Submitting AQL query (max 8 min wait)...
📋 Search submitted: search-1234567890
⏳ Status: QUEUED, Progress: 0%
⏳ Status: COMPLETED, Progress: 100%
✅ AQL returned 8 events
💾 Saved 8 events

📥 Fetching notes...
📝 Fetching notes for offense 15624...
✅ Found 3 notes
💾 Saved 3 notes to metadata

============================================================
✅ COMPLETED
============================================================
📊 Total events saved: 127
📊 Total offenses processed: 25
```

## 🐛 Troubleshooting

### PostgreSQL Connection Error
```
❌ Database connection failed: could not connect to server
```
**Solution**: Check database host, port, credentials
```bash
psql -h localhost -U soc -d socdashboard -c "SELECT 1"
```

### QRadar API Error
```
❌ QRadar API error: 401 Unauthorized
```
**Solution**: Check API key in integration credentials
```bash
# Verify connection
curl -k -H "SEC: your_api_key" https://100.100.11.101/api/siem/offenses
```

### Missing Python Packages
```
ModuleNotFoundError: No module named 'psycopg2'
```
**Solution**: Install dependencies
```bash
pip3 install psycopg2-binary requests python-dotenv
```

### AQL Timeout
```
⏱️  AQL search timeout after 8 minutes
```
**Solution**: QRadar overloaded. Try again later atau reduce max_wait_minutes

## ⏱️ Scheduling

### Cron Job (Daily at 2 AM)
```bash
# Edit crontab
crontab -e

# Add this line:
0 2 * * * /home/soc/soc-dashboard/scripts/fetch-qradar-events.sh >> /var/log/qradar-fetch.log 2>&1
```

### Systemd Timer

Create `/etc/systemd/system/qradar-fetch.service`:
```ini
[Unit]
Description=QRadar Events Fetcher
After=network.target

[Service]
Type=oneshot
User=soc
WorkingDirectory=/home/soc/soc-dashboard
ExecStart=/home/soc/soc-dashboard/scripts/fetch-qradar-events.sh
StandardOutput=journal
StandardError=journal
```

Create `/etc/systemd/system/qradar-fetch.timer`:
```ini
[Unit]
Description=Run QRadar Events Fetcher Daily
Requires=qradar-fetch.service

[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable dan start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable qradar-fetch.timer
sudo systemctl start qradar-fetch.timer

# Check status
sudo systemctl status qradar-fetch.timer
sudo journalctl -u qradar-fetch.service -f
```

## 🔧 Configuration

Edit script untuk customize:
- `max_results` di `execute_aql()` - default 15 events
- `max_wait_minutes` di AQL polling - default 8 menit
- `LIMIT 100` di SQL query - max offenses per run

## 📊 Database Schema Reference

### qradar_offenses
```sql
CREATE TABLE qradar_offenses (
    id SERIAL PRIMARY KEY,
    external_id INTEGER UNIQUE,
    title VARCHAR,
    severity VARCHAR,
    status VARCHAR DEFAULT 'OPEN',
    start_time TIMESTAMP,
    metadata JSONB,  -- Notes stored here: metadata->>'notes'
    integration_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);
```

### qradar_events
```sql
CREATE TABLE qradar_events (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR UNIQUE,
    offense_id INTEGER,
    source_ip VARCHAR,
    destination_ip VARCHAR,
    event_timestamp TIMESTAMP,
    payload JSONB,
    qradar_offense_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 📚 References

- [QRadar Ariel Query Language](https://www.ibm.com/docs/en/qradar/7.4?topic=aql-ariel-query-language)
- [QRadar API Documentation](https://www.ibm.com/docs/en/qradar/7.4?topic=reference-rest-api)

## 📝 License & Author

Created for SOC Dashboard QRadar Integration
Password: punggawa

---

**Last Updated**: 2026-06-22
