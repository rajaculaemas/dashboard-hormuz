# Phase 3 - Telegram Bot Setup & Testing Guide

**Date:** March 2, 2026  
**Status:** Phase 2 Complete, Phase 3A (Setup) Ready  
**Build Status:** ✓ Compiled successfully in 14.4s

---

## Overview

You've provided the Telegram bot token. Now we need to:
1. ✅ **Token Stored** - Added to `.env.local`
2. ⏳ **Webhook Configuration** (This Step) - Set up webhook URL
3. ⏳ **Testing** - Verify escalation flow end-to-end

---

## Step 1: Configure Webhook URL in Environment

The webhook URL needs to be accessible from the internet (not localhost). Update `.env.local`:

```bash
# Current (localhost only - won't work for Telegram):
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/telegram/webhook

# Replace with your actual production/staging domain:
# Example for production:
TELEGRAM_WEBHOOK_URL=https://soc-dashboard.example.com/api/telegram/webhook
```

**Where to find this:**
- If you have a public domain pointing to your server → use that
- If you're on a local network, you'll need to set up a reverse proxy or use ngrok for testing
- CloudFlare tunnels also work as alternative

---

## Step 2: Set Up Webhook Via Admin Panel

### Method A: Web UI (Recommended)

1. **Log in to SOC Dashboard**
   - Go to `/dashboard/admin`
   - You'll see "Telegram Bot Integration" section at the bottom

2. **Configure Webhook**
   - Click "Configure Webhook" button
   - The button will:
     - Verify the bot token is valid
     - Register the webhook URL with Telegram
     - Enable message receiving

3. **Check Status**
   - You should see:
     - ✅ Bot username and ID
     - ✅ Webhook URL confirmed
     - ✅ "Connected" status badge

### Method B: API Endpoint (Advanced)

```bash
# First check status
curl -X POST http://localhost:3000/api/admin/telegram/setup \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=YOUR_JWT_TOKEN" \
  -d '{"action":"status"}'

# Then set up webhook
curl -X POST http://localhost:3000/api/admin/telegram/setup \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=YOUR_JWT_TOKEN" \
  -d '{"action":"setup"}'
```

---

## Step 3: Test Bot Connection

### Via Admin Panel

1. Click "Test Connection" button
2. Enter your personal Telegram chat ID (you'll get this after talking to the bot)
3. Click "Send Test Message"
4. Check Telegram - you should get: `✅ SOC Dashboard Telegram Bot Connected!`

**How to find your Telegram Chat ID:**
```
1. Start the bot: Find @YOUR_BOT_USERNAME on Telegram
2. Send it any message
3. Go to: https://api.telegram.org/botTOKEN/getUpdates
4. Look for "chat": { "id": YOUR_CHAT_ID } in the response
```

### Verify Webhook is Working

The webhook will be called whenever a message is sent to the bot. You can verify by:
1. Sending a message to the bot on Telegram
2. Check server logs for: `[Telegram] Received message from chat`

---

## Step 4: Link User Telegram Accounts

Since you mentioned you've already added Telegram chat IDs to user attributes, verify they're set:

### Check User Configuration

**Via Admin Panel:**
1. Go to `/dashboard/admin`
2. Edit each L2/L3 user
3. Verify "Telegram Chat ID" field is populated

**Via Database:**
```sql
SELECT id, email, name, position, telegramChatId 
FROM "User" 
WHERE position LIKE '%L2%' OR position LIKE '%L3%'
  AND "telegramChatId" IS NOT NULL;
```

### Get Telegram Chat ID for Users

Each user needs to:
1. Start a conversation with the bot on Telegram
2. Send any message (e.g., "hi")
3. The bot will respond with a PIN code
4. They go to `/dashboard/profile` → Telegram Settings
5. Enter their Telegram Chat ID and PIN code
6. System validates and stores the ID

---

## Step 5: Test Escalation Flow

### Test Alert Escalation

1. **Create or Find a Test Alert**
   - Go to Alerts dashboard
   - Find any alert to test with

2. **Click "Update Alert"**
   - Select "Escalate to L2" radio option
   - Choose an L2 analyst that has Telegram configured
   - Enter test analysis (min 20 chars)
   - Click "Escalate to L2"

3. **Watch for Telegram Message**
   - The L2 analyst should receive a Telegram message with:
     - Alert name and ID
     - Alert details (source, severity, status)
     - L1 analysis you provided
     - Instructions to reply

### L2 Responds

**Message Format:**
```
ANALYSIS: Brief summary of investigation and findings
CONCLUSION: [RESOLVE|ESCALATE_L3|MONITOR]
```

**Example Response:**
```
ANALYSIS: Checked source IP against threat intel. IP is in OSINT database as known scanner. 
Firewall already blocking outbound connections. Activity appears contained.
CONCLUSION: RESOLVE
```

### Monitor Escalation Timeline

1. **While escalated, go back to alert**
   - Click details button
   - See "Escalation" tab
   - Shows:
     - Current escalation status
     - 30-minute timeout countdown
     - L1 analysis provided
     - L2 response (once received)

2. **If L2 Times Out (30 min)**
   - Alert auto-escalates to L3
   - L3 analyst receives Telegram message
   - Timeline updates automatically

3. **If L3 Times Out**
   - Admin (admin@soc-dashboard.local) receives notification
   - Timeline shows timeout occurred
   - Admin must manually intervene

---

## Database Records

Each escalation creates audit trail:

**Alert Escalation Record:**
```json
{
  "id": "uuid",
  "alertId": "uuid",
  "escalationLevel": 1,
  "escalatedBy": { "id": "...", "name": "L1 Analyst" },
  "escalatedTo": { "id": "...", "name": "L2 Analyst" },
  "l1Analysis": "Initial assessment",
  "l2Analysis": null, // Filled when L2 responds
  "status": "pending",
  "timeoutAt": "2026-03-02T10:02:00Z",
  "createdAt": "2026-03-02T09:32:00Z"
}
```

**Response Records:**
Each analyst response creates:
```json
{
  "escalationId": "uuid",
  "responderId": "uuid",
  "analysis": "My analysis text",
  "conclusion": "RESOLVE",
  "action": "reply",
  "createdAt": "2026-03-02T09:45:00Z"
}
```

**Audit Trail:**
```json
{
  "escalationId": "uuid",
  "event": "escalated_l2_to_l3",
  "details": { "reason": "timeout", "timestamp": "2026-03-02T10:02:00Z" },
  "createdAt": "2026-03-02T10:02:00Z"
}
```

---

## Troubleshooting

### Bot Token Invalid
**Error:** "Bot verification failed"
- ✓ Verify token format: `NUMBER:LETTER_SEQUENCE`
- ✓ Token is correct (copy-paste carefully)
- ✓ Token hasn't been regenerated

### Webhook Not Setting
**Error:** "Failed to set webhook"
- ✓ Webhook URL must be HTTPS (not HTTP)
- ✓ Domain must resolve and be accessible from internet
- ✓ Port 443 (HTTPS) must be open
- Try test: `curl https://your-domain.com/api/telegram/webhook` should return 200

### Messages Not Received
**Problem:** L2 doesn't get escalation message
- ✓ User has `telegramChatId` set in database
- ✓ User hasn't blocked the bot on Telegram
- ✓ Check logs: `grep -i "telegram" /var/log/app.log`

### Timeout Not Working
**Problem:** Alert doesn't auto-escalate at 30 min
- ✓ Cron job configured: `/api/cron/escalation-timeout-check`
- ✓ Run manually: `curl -H "X-Cron-Secret: your-secret" http://localhost:3000/api/cron/escalation-timeout-check`

---

## Configuration Checklist

Before testing, verify:

- [ ] Bot token set in `.env.local`
- [ ] Webhook URL configured (not localhost)
- [ ] Webhook registered with Telegram (status shows "Connected")
- [ ] Test message received successfully
- [ ] L2 analysts have Telegram Chat IDs configured
- [ ] L3 analysts have Telegram Chat IDs configured
- [ ] Admin email is `admin@soc-dashboard.local`
- [ ] Build compiles successfully (`npm run build`)

---

## API Endpoints Reference

### Admin Telegram Setup
```
POST /api/admin/telegram/setup

Body: { "action": "setup|delete|status|test", "chatId": "optional" }
```

### Get Escalation Status
```
GET /api/alerts/{id}/escalation

Returns: { "active": AlertEscalation|null, "history": AlertEscalation[] }
```

### Escalate Alert
```
POST /api/alerts/escalate

Body: {
  "alertId": "uuid",
  "escalateToUserId": "uuid",
  "analysis": "string"
}
```

### Telegram Webhook (Receives Messages)
```
POST /api/telegram/webhook

Header: X-Telegram-Bot-API-Secret-Token: {value from .env}
Body: Telegram Update JSON
```

---

## Next Steps

1. **Update Webhook URL** in `.env.local` with your actual domain
2. **Click "Configure Webhook"** in Admin panel
3. **Test the connection** with a test message
4. **Verify users have Chat IDs** linked
5. **Test escalation flow** with a real alert
6. **Monitor logs** for any errors

---

## Timeline Summary

**Phase 1A (Jan-Feb):** Backend infrastructure ✅  
**Phase 2 (Mar 2):** UI implementation ✅  
**Phase 3A (Mar 2 - Now):** Bot setup & testing ⏳  
**Phase 3B:** Production deployment → Full escalation system active

---

**Questions or Issues?**
- Check logs: `tail -f /var/log/app.log | grep -i telegram`
- Verify database: `SELECT * FROM "AlertEscalation" LIMIT 5;`
- Test webhook manually with curl (examples above)
