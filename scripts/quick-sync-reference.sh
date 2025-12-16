#!/bin/bash

# Quick reference commands for Stellar Cyber Alert Sync

# ============================================================
# SYNC ALERTS
# ============================================================

# Sync last 16 days (recommended for catching missing alerts)
node scripts/sync-stellar-cyber-alerts-api.js --days 16

# Sync last 30 days (full month)
node scripts/sync-stellar-cyber-alerts-api.js --days 30

# Sync full range (1-16 Dec example)
node scripts/sync-stellar-cyber-alerts-api.js --days 16

# ============================================================
# VERIFY ALERTS IN DATABASE
# ============================================================

# Check total alerts and MTTD data by date
psql -U soc -d socdashboard << EOF
SELECT 
  DATE(timestamp AT TIME ZONE 'Asia/Jakarta') as date,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed,
  COUNT(CASE WHEN metadata->>'closed_time' IS NOT NULL THEN 1 END) as with_mttd_data
FROM alerts
WHERE "integrationId" = (SELECT id FROM integrations WHERE source = 'stellar-cyber' LIMIT 1)
GROUP BY DATE(timestamp AT TIME ZONE 'Asia/Jakarta')
ORDER BY date DESC
LIMIT 15;
EOF

# ============================================================
# SAMPLE ALERTS WITH MTTD
# ============================================================

# Show 5 recent Closed alerts with MTTD data
psql -U soc -d socdashboard << EOF
SELECT 
  DATE(timestamp AT TIME ZONE 'Asia/Jakarta') as date,
  title,
  status,
  (metadata->>'alert_time')::timestamptz as alert_time,
  (metadata->>'closed_time')::timestamptz as closed_time,
  EXTRACT(EPOCH FROM ((metadata->>'closed_time')::timestamptz - (metadata->>'alert_time')::timestamptz))/60 as mttd_minutes
FROM alerts
WHERE "integrationId" = (SELECT id FROM integrations WHERE source = 'stellar-cyber' LIMIT 1)
AND status = 'Closed'
ORDER BY timestamp DESC
LIMIT 5;
EOF

# ============================================================
# STATS & HEALTH CHECK
# ============================================================

# Total alerts stats
psql -U soc -d socdashboard << EOF
SELECT 
  COUNT(*) as total_alerts,
  COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed_alerts,
  COUNT(CASE WHEN metadata->>'closed_time' IS NOT NULL THEN 1 END) as alerts_with_closed_time,
  COUNT(CASE WHEN metadata->'user_action'->>'alert_to_first' IS NOT NULL THEN 1 END) as alerts_with_alert_to_first
FROM alerts
WHERE "integrationId" = (SELECT id FROM integrations WHERE source = 'stellar-cyber' LIMIT 1);
EOF

# ============================================================
# TROUBLESHOOTING
# ============================================================

# Check if Stellar Cyber integration is connected
psql -U soc -d socdashboard -c "
SELECT 
  id, 
  name, 
  source, 
  status, 
  last_sync 
FROM integrations 
WHERE source = 'stellar-cyber';
"

# Check server status
curl -s http://localhost:3000/api/health

# Check recent sync logs (if logging enabled)
# tail -f /var/log/soc-dashboard/alerts.log

# ============================================================
# QUICK REFERENCE
# ============================================================

# To use in SLA Dashboard:
# 1. Go to Dashboard → SLA
# 2. Set date range: 2025-12-09 to 2025-12-16  
# 3. Click "View Alerts"
# 4. MTTD should show calculated minutes instead of "Pending"
# 5. Filter by status: ALL, PASS, FAIL, PENDING if needed

# ============================================================
