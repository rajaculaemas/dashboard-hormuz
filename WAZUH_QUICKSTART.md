# Wazuh Integration - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Prepare Your Wazuh Credentials

You'll need:
- **Elasticsearch URL**: `https://your-elasticsearch-host:9200`
- **Username**: (usually `admin`)
- **Password**: Your Elasticsearch password
- **Index Pattern**: `wazuh-*` or `wazuh-punggawa*` (depending on your setup)

**Note**: Test your credentials with:
```bash
curl -k -u admin:YOUR_PASSWORD https://your-elasticsearch-host:9200/_cluster/health
```

### Step 2: Verify Installation

Run the verification script to ensure all integration files are in place:

```bash
bash scripts/verify-wazuh-setup.sh
```

Expected output:
```
✓ Wazuh Elasticsearch Client
✓ Wazuh Application Integration
✓ Wazuh Sync Endpoint
✓ Integration Form (modified)
✓ Wazuh option in form
... (all checks pass)
✓ All checks passed!
```

### Step 3: Start the Application

```bash
npm run dev
```

The dashboard should be available at `http://localhost:3000`

### Step 4: Create Wazuh Integration

1. Click **Integrations** in the sidebar
2. Click **Add Integration**
3. Fill in the form:
   - **Integration Name**: "Wazuh Punggawa" (or your name)
   - **Type**: "Alert Integration"
   - **Source**: "Wazuh SIEM"
   - **Method**: "API"

4. **Add Credentials** (these fields should appear automatically):
   - `elasticsearch_url`: `https://dc01-cakra-wdl01.pss.net:9200`
   - `elasticsearch_username`: `admin`
   - `elasticsearch_password`: (your password)
   - `elasticsearch_index`: `wazuh-punggawa*`

5. Click **Add Integration**

### Step 5: Verify Connection

1. Go to **Dashboard** → **Alert Panel**
2. Look for your Wazuh integration in the **Integration Status** section
3. Click the refresh button to manually sync
4. Wait for sync to complete
5. You should see alerts appear in the panel

### Step 6: View Alerts

1. In **Alert Panel**, select your Wazuh integration from the dropdown
2. Alerts will display below
3. You can:
   - **Filter** by status, severity, time range
   - **Search** by alert title, description, IP, etc.
   - **Update Status** - click alert → change status
   - **Assign** alerts to team members
   - **Add to Case** - select multiple → "Add to Case"

## ✅ Testing Checklist

- [ ] Integration created successfully
- [ ] "Integration Status" shows Wazuh as "connected"
- [ ] Manual sync button refreshes alerts
- [ ] Alerts appear in the alert panel
- [ ] Can filter by status and severity
- [ ] Can search for specific alerts
- [ ] Can update alert status
- [ ] Can assign alerts to team members
- [ ] Auto-sync runs every 3 minutes

## 🔍 Troubleshooting

### No alerts appearing?

1. **Check connection**:
   ```bash
   curl -k -u admin:PASSWORD https://elasticsearch:9200/wazuh-*/_count?q=syslog_level:ALERT
   ```
   Should return a count > 0

2. **Check integration status**:
   - Go to Integrations → check "connected" status
   - Look for error messages

3. **Check browser console**:
   - Open DevTools (F12)
   - Check Console tab for errors
   - Check Network tab for failed requests

4. **Check server logs**:
   - Look at `npm run dev` output
   - Check for "[Wazuh]" error messages

### "Connection failed" error?

1. Verify credentials are correct
2. Verify Elasticsearch URL is accessible
3. Check firewall rules
4. Verify SSL certificate (can be self-signed)
5. Try with curl first to isolate the issue

### Alerts not updating?

1. Check auto-sync status in sidebar
2. Manually click refresh button
3. Check database for stored alerts:
   ```bash
   # In Prisma Studio or database client
   SELECT COUNT(*) FROM alerts WHERE external_id LIKE '%wazuh%';
   ```

## 📊 Dashboard Features

### Alert Panel

- **Integration Dropdown**: Select Wazuh integration
- **Status Filter**: New, In Progress, Closed
- **Severity Filter**: Critical, High, Medium, Low
- **Time Range**: 1h, 12h, 24h, 7d, 30d, 90d, all
- **Search**: Real-time search
- **Chart**: Severity distribution

### Per-Alert Actions

- **View Details**: Click alert row
- **Update Status**: Change from Open → In Progress → Closed
- **Assign**: Assign to team member
- **View Metadata**: Agent info, rule info, network data, MITRE ATT&CK

### Batch Actions

- **Select Multiple**: Checkboxes in alert list
- **Add to Case**: Create or link to existing case
- **Update Status**: Change status for all selected

## 🔄 Synchronization

### Auto-Sync (Automatic)

- Runs every 3 minutes
- Fetches new alerts since last sync
- Updates database

### Manual Sync (On-Demand)

- Click refresh icon in Integration Status
- Or click "Sync All" button
- Returns immediately with count

### Manual Endpoint

```bash
curl -X POST http://localhost:3000/api/alerts/wazuh/sync \
  -H "Content-Type: application/json" \
  -d '{"integrationId": "YOUR_INTEGRATION_ID"}'
```

## 📖 For More Information

- **Setup Details**: See `WAZUH_INTEGRATION.md`
- **Implementation Details**: See `WAZUH_IMPLEMENTATION.md`
- **API Reference**: See API endpoints in `WAZUH_INTEGRATION.md`
- **Run Tests**: `npx ts-node scripts/test-wazuh-integration.ts`

## 💡 Tips

1. **First Time Setup**: May take a minute to fetch and store alerts
2. **Elasticsearch Query**: Modified in `lib/api/wazuh-client.ts` if needed
3. **Custom Index Pattern**: Update in integration settings
4. **Performance**: 100 alerts per sync for balance
5. **Status Management**: Managed by dashboard (not Wazuh)

## 🆘 Quick Support

### Check Integration Status

```bash
# In browser console
fetch('/api/integrations')
  .then(r => r.json())
  .then(d => console.log(d.data.filter(i => i.source === 'wazuh')))
```

### View Recent Alerts

```bash
# In browser console
fetch('/api/alerts?integrationId=YOUR_ID&limit=10')
  .then(r => r.json())
  .then(d => console.log(d.alerts))
```

### Check Database Alerts

```bash
# Via Prisma Studio
npx prisma studio

# Query alerts where integrationId matches Wazuh
SELECT * FROM alerts 
WHERE integrationId = 'YOUR_WAZUH_INTEGRATION_ID' 
ORDER BY timestamp DESC 
LIMIT 10;
```

## 🎯 Next Steps

1. **Integration Complete?**
   - Verify all features work
   - Test with real Wazuh data

2. **Custom Filters?**
   - Modify Elasticsearch query in `lib/api/wazuh-client.ts`
   - Filter by customer, agent labels, rule groups

3. **Webhook Integration?**
   - Consider setting up webhook receiver
   - Reduce polling frequency
   - Real-time alert processing

4. **Additional Features?**
   - Correlation rules
   - Threat scoring
   - Multi-Wazuh support

## ✨ Success Indicators

✅ Wazuh integration appears in integrations list
✅ Integration status shows "connected"
✅ Alerts appear in alert panel
✅ Can filter and search alerts
✅ Can update alert status
✅ Auto-sync runs regularly
✅ No console errors

---

**Need Help?** Check `WAZUH_INTEGRATION.md` for detailed troubleshooting or contact your system administrator.
