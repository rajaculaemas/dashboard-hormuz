# SOCFortress Case Pulling - Panduan Lengkap

## 📋 Ringkasan

Cases/tickets di SOCFortress (Copilot) disimpan di database MySQL `copilot`. Script Python `copilot_pull_cases_CaseID.py` digunakan untuk menarik data case beserta semua alert yang terkait.

## 🔗 Cara Kerja

Script melakukan query ke tabel-tabel berikut:

```
incident_management_case
├── case data (ID, nama, deskripsi, status, severity, dll)
├── case_history (perubahan status, severity, assignment)
└── incident_management_casealertlink
    └── Links ke alerts dan asset IDs yang dipilih
        └── Per alert, fetch:
            ├── incident_management_alert (root alert data)
            ├── incident_management_alert_history (status changes)
            ├── incident_management_alertevent (raw events)
            ├── incident_management_comment (comments)
            ├── incident_management_alert_to_tag (tags mapping)
            ├── incident_management_alerttag (tag details)
            ├── incident_management_alert_to_ioc (IOC mapping)
            ├── incident_management_ioc (IOC details)
            └── incident_management_asset (assets & contexts)
```

## 🗂️ Struktur JSON Output

```json
{
  "db": "copilot",
  "generated_at": "ISO-8601 UTC timestamp",
  "mode": "case_by_id",
  "limits": {
    "case_limit": 1,
    "child_limit": 200,        // per table
    "asset_limit": 200,        // assets per alert
    "asset_context_limit": 200 // context per asset
  },
  "count": 1,  // number of cases fetched
  "cases": [
    {
      "case_id": <integer>,
      "case": {
        "id": <integer>,
        "case_name": <string>,
        "case_description": <string>,
        "case_creation_time": <datetime>,
        "case_status": "OPEN|CLOSED",
        "assigned_to": <string>, // username
        "customer_code": <string>,
        "notification_invoked_number": <integer>,
        "severity": "Low|Medium|High|Critical"
      },
      "case_history": [
        {
          "id": <integer>,
          "case_id": <integer>,
          "change_type": "STATUS_CHANGE|SEVERITY_CHANGE|ASSIGNMENT_CHANGE",
          "field_name": "case_status|severity|assigned_to",
          "old_value": <any>,
          "new_value": <any>,
          "changed_by": <string|null>,
          "changed_at": <datetime>,
          "description": <string>
        }
      ],
      "case_alert_links": [
        {
          "case_id": <integer>,
          "alert_id": <integer>,
          "selected_asset_ids": <string>  // JSON array as string
        }
      ],
      "alerts": [
        {
          "alert_id": <integer>,
          "root": {
            "id": <integer>,
            "alert_name": <string>,
            "alert_description": <string>,
            "status": "OPEN|IN_PROGRESS|CLOSED",
            "alert_creation_time": <datetime>,
            "customer_code": <string>,
            "time_closed": <datetime|null>,
            "source": "wazuh|other",
            "assigned_to": <string>,
            "severity": "Low|Medium|High|Critical"
          },
          "children": {
            "incident_management_alert_history": [
              {
                "id": <integer>,
                "alert_id": <integer>,
                "change_type": "STATUS_CHANGE|SEVERITY_CHANGE|ASSIGNMENT_CHANGE|COMMENT_ADDED",
                "field_name": <string>,
                "old_value": <any>,
                "new_value": <any>,
                "changed_by": <string|null>,
                "changed_at": <datetime>,
                "description": <string>
              }
            ],
            "incident_management_alertevent": [
              {
                "source_data": <JSON string>,  // Raw alert event data
                "id": <integer>,
                "alert_id": <integer>,
                "asset_name": <string>,
                "created_at": <datetime>
              }
            ],
            "incident_management_comment": [
              {
                "id": <integer>,
                "alert_id": <integer>,
                "comment": <string>,
                "user_name": <string>,
                "created_at": <datetime>
              }
            ],
            "tags": {
              "mapping": [
                {
                  "alert_id": <integer>,
                  "tag_id": <integer>
                }
              ],
              "tags": [
                {
                  "id": <integer>,
                  "tag": <string>
                }
              ]
            },
            "iocs": {
              "mapping": [
                {
                  "alert_id": <integer>,
                  "ioc_id": <integer>
                }
              ],
              "iocs": [
                {
                  "id": <integer>,
                  "ioc_value": <string>,
                  "ioc_type": <string>
                }
              ]
            }
          },
          "assets": [
            {
              "id": <integer>,
              "alert_linked": <integer>,
              "asset_name": <string>,
              "alert_context_id": <integer>,
              "agent_id": <string>,
              "velociraptor_id": <string|null>,
              "customer_code": <string>,
              "index_name": <string>,  // Elasticsearch index
              "index_id": <string>
            }
          ],
          "asset_contexts": [
            {
              "context": <JSON string>,  // Alert context/metadata
              "id": <integer>,
              "source": "wazuh|other"
            }
          ],
          "notes": [<string>]
        }
      ]
    }
  ]
}
```

## 🚀 Cara Menggunakan Script

### 1. Setup MySQL Connection
Script membutuhkan environment variables atau default connections:
```bash
export MYSQL_HOST="100.100.12.41"
export MYSQL_PORT="3306"
export MYSQL_USER="copilot"
export MYSQL_PASSWORD="POUTHBLJvhvcasgFDS98"  # Default di script
```

### 2. Pull Single Case
```bash
python3 copilot_pull_cases_CaseID.py 77
```

Atau dengan input interaktif:
```bash
python3 copilot_pull_cases_CaseID.py
# Masukkan Case ID: 77
```

### 3. Save Output
```bash
python3 copilot_pull_cases_CaseID.py 77 > case_77.json
```

### 4. Query Multiple Cases
Lihat script `copilot_pull_alerts_alertID.py` untuk pattern - untuk multiple cases, perlu modify script.

## ⚙️ Tuning Parameters

Di dalam script, edit variabel ini:
```python
CASE_LIMIT = 1           # Berapa case terbaru yang ditarik
CHILD_LIMIT = 200        # Limit per tabel child (history/event/comment)
ASSET_LIMIT = 200        # Limit asset per alert
ASSET_CONTEXT_LIMIT = 200 # Limit context per asset
```

## 📊 Data Flow Diagram

```
User Input (Case ID)
    ↓
Connect to MySQL (copilot DB)
    ↓
Fetch incident_management_case record
    ↓
Fetch case_history (changes to case)
    ↓
Fetch incident_management_casealertlink (alert links)
    ↓
For each alert_id in links:
    ├→ Fetch alert root record
    ├→ Fetch alert_history (status changes)
    ├→ Fetch alertevent (raw events)
    ├→ Fetch comments
    ├→ Fetch tags mapping + tag details
    ├→ Fetch IOCs mapping + IOC details
    └→ Fetch assets + contexts
    ↓
Compile JSON payload
    ↓
Output to stdout or redirect to file
```

## 🔍 Example Case 77 Structure

Case 77 contains:
- **Case Data**: 
  - Status: CLOSED
  - Severity: Low
  - Assigned to: ambarfitri
  - Created: 2026-01-27

- **Case History**: 2 entries
  - STATUS_CHANGE: OPEN → CLOSED (2026-02-02)
  - SEVERITY_CHANGE: null → Low (2026-01-29)

- **Alert Links**: 2 alerts
  - Alert 1275 (asset 2482)
  - Alert 1327 (no specific assets)

- **Alert Details**: 
  - Full history of changes
  - Events from Wazuh with raw log data
  - Comments dari investigator
  - Tags dan IOCs (jika ada)
  - Assets involved (DNS servers)

## 🛠️ Troubleshooting

### "MySQL error: ...connection refused"
- Check MySQL host/port/credentials
- Check firewall connection to database

### "ERROR: Case ID tidak ditemukan"
- Verify case ID exists in database
- Check customer code permissions

### "skip *** table not found"
- Some tables might not exist in your schema
- Script gracefully handles missing tables

### Large JSON output
- Use jq untuk filtering:
  ```bash
  python3 copilot_pull_cases_CaseID.py 77 | jq '.cases[0].case'
  jq '.cases[0].alerts[0].children.incident_management_comment' case_77.json
  ```

## 📝 Related Scripts
- `copilot_pull_alerts_alertID.py` - Pull unlinked alerts
- `sync-copilot-alerts.js` - Sync alerts to SOClaro
- `test-copilot-connection.js` - Test DB connection
