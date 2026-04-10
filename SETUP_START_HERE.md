# IMMEDIATE SETUP INSTRUCTIONS

**What:** Complete Phase 3A Telegram Bot Setup  
**Time Required:** ~15 minutes  
**Prerequisites:** Bot token (provided ✅), webhookK URL (you provide)

---

## Step 1: Update Webhook URL (5 min)

Edit `.env.local` file:

```bash
# Find this section (around line 25-27):
# Telegram Bot Configuration (Phase 3)
TELEGRAM_BOT_TOKEN=<get_new_token_from_BotFather>
TELEGRAM_WEBHOOK_SECRET=escalation_webhook_secret_soc_dashboard_2026
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/telegram/webhook

# Replace the WEBHOOK_URL with YOUR actual domain:
# Examples:
# TELEGRAM_WEBHOOK_URL=https://soc-dashboard.example.com/api/telegram/webhook
# TELEGRAM_WEBHOOK_URL=https://soc.mycompany.io/api/telegram/webhook
# TELEGRAM_WEBHOOK_URL=https://192.168.1.100/api/telegram/webhook  (if public IP)
```

**Note:** Must be HTTPS (not HTTP), must be publicly accessible (not localhost)

---

## Step 2: Restart Application (2 min)

```bash
# Kill the current application
pkill -f "node"

# Or if using npm:
# Ctrl+C in the terminal running npm run dev

# Start fresh:
cd /home/soc/soc-dashboard
npm run dev
# OR for production:
npm run build && npm start
```

---

## Step 3: Configure Webhook in Admin Panel (3 min)

1. **Open SOC Dashboard:**
   - URL: `http://localhost:3000` (or your domain)
   - Login as: `admin@soc-dashboard.local`

2. **Go to Admin:**
   - Click menu → Admin
   - Or direct: `/dashboard/admin`

3. **Find "Telegram Bot Integration" section** at bottom

4. **Click "Configure Webhook"**
   - Watch for success message
   - Should see:
     - ✅ Bot verified (@bot_name, ID: 7873272862)
     - ✅ Webhook URL registered
     - ✅ Status: "Connected"

---

## Step 4: Test Bot Connection (3 min)

1. **Click "Test Connection" button**

2. **Get your Telegram Chat ID:**
   ```bash
   # Find the bot on Telegram: @any_username_bot
   # (or use the @username shown in bot info)
   
   # Send bot any message (e.g., "hi")
   
   # In terminal, check updates:
   curl 'https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates'
   
   # Look for the "id" field in response:
   # "chat":{"id":YOUR_CHAT_ID,...}
   ```

3. **Enter Chat ID in test form:**
   - Paste your chat ID (just numbers)
   - Click "Send Test Message"

4. **Check Telegram:**
   - You should get: `✅ SOC Dashboard Telegram Bot Connected!`
   - If you got it, ✅ Webhook is working!

---

## Step 5: Verify User Configuration (2 min)

Make sure L2 and L3 analysts have Telegram Chat IDs set:

### Via Database (Quick):
```bash
# Log into PostgreSQL:
psql -U soc -d socdashboard

# Check L2/L3 users:
SELECT id, email, position, "telegramChatId", name 
FROM "User" 
WHERE position LIKE '%L2%' OR position LIKE '%L3%';

# Quit:
\q
```

If `telegramChatId` is NULL for any L2/L3 user, they need to add it:

### User Self-Service Setup (if Chat ID missing):
1. Each user goes to `/dashboard/profile`
2. Finds "Telegram Settings" section
3. Clicks "Link Telegram Account"
4. Gets sent a 4-digit PIN
5. Goes to bot on Telegram, sends `/code 1234`
6. System validates and stores Chat ID

---

## Step 6: Test Escalation (5 min)

### Create Test Escalation:

1. **Go to any alert** in the alerts list
2. **Click "Update Alert"** button
3. **Select "Escalate to L2"** radio option (orange section appears)
4. **Choose an L2 analyst** from dropdown
   - Only shows analysts with Telegram Chat ID configured
5. **Add analysis** (must be 20+ characters):
   ```
   This is a suspicious login from unknown IP. 
   Requires L2 investigation to confirm if legitimate.
   ```
6. **Click "Escalate to L2"**
7. **Success message appears**

### L2 Gets Notification:

1. **L2 Analyst checks Telegram** 
   - Should receive message with:
     - Alert details
     - Your analysis
     - Alert summary

2. **L2 Replies with analysis:**
   ```
   ANALYSIS: Checked source IP against threat intel. 
   IP is in OSINT database as known scanner. 
   Firewall already blocking connections.
   CONCLUSION: RESOLVE
   ```

### Check Escalation Timeline:

1. **Go back to the alert**
2. **Click alert details button**
3. **Click "Escalation" tab** (4th tab)
4. **Should show:**
   - Active escalation card (orange)
   - Your L1 analysis
   - Response timeline
   - L2 response when they reply

---

## Troubleshooting

### "Can't find webhook configuration button"
- Make sure you're logged in as `admin@soc-dashboard.local`
- Check you're in `/dashboard/admin` (not `/dashboard/profile`)
- Scroll down past User Management section

### "Webhook configuration failed"
- Check `.env.local` has valid HTTPS URL
- Verify domain is publicly accessible: `curl https://yourdomain.com`
- Make sure URL is reachable from internet (not localhost)
- Check logs: `tail -f .next/server/logs/*`

### "No L2 analysts in dropdown"
- Check admin panel: Users table
- Make sure position field has "L2" in it
- Make sure telegramChatId is filled in (not empty)
- Reload page if just added

### "L2 not receiving messages"
- Check telegramChatId is correct (from `/getUpdates` endpoint)
- Verify bot info shows: `"ok": true`
- Send manual test from admin panel
- Check if L2 blocked the bot on Telegram

### "Test message not received"
- Verify webhook URL is correct in .env
- Check webhook shows "Connected" status
- Verify you got your correct Chat ID
- Retry "Test Connection" button

---

## Verification Checklist

After completing all steps, verify:

- [ ] `.env.local` has actual HTTPS domain (not placeholder)
- [ ] Application restarted
- [ ] Admin can see "Configure Webhook" button
- [ ] Webhook shows "Connected" status
- [ ] Test message sent and received
- [ ] L2/L3 users have Chat IDs in database
- [ ] Can escalate an alert to L2
- [ ] L2 receives Telegram message
- [ ] Escalation timeline shows in alert details
- [ ] L2 can reply via Telegram

---

## Commands Reference

```bash
# Check webhook status
curl -X POST http://localhost:3000/api/admin/telegram/setup \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=YOUR_TOKEN" \
  -d '{"action":"status"}'

# Get Telegram updates (to find chat ID)
curl 'https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates'

# Send test message manually
curl -X POST http://localhost:3000/api/admin/telegram/setup \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=YOUR_TOKEN" \
  -d '{"action":"test","chatId":"YOUR_CHAT_ID"}'

# Check database for chat IDs
psql -U soc -d socdashboard -c \
  'SELECT email, "telegramChatId" FROM "User" WHERE position LIKE "%L2%"'
```

---

## Expected Results

When everything works:

1. **Webhook Configuration:** ✅ Shows green "Connected" badge
2. **Test Message:** ✅ Bot sends `✅ SOC Dashboard Telegram Bot Connected!`
3. **Escalation Message:** ✅ L2 gets detailed alert info on Telegram
4. **Escalation Timeline:** ✅ Shows active escalation with countdown
5. **L2 Response:** ✅ When L2 replies, appears in escalation history
6. **Auto-escalation:** ✅ After 30 min, auto-escalates to L3 (if configured)

---

## Timeline

- **Step 1:** 5 min (env file update)
- **Step 2:** 2 min (restart)
- **Step 3:** 3 min (admin panel setup)
- **Step 4:** 3 min (test connection)
- **Step 5:** 2 min (verify config)
- **Step 6:** 5 min (end-to-end test)

**Total: ~20 minutes to fully operational**

---

## Next Steps After This Setup

1. **Production Deployment:** Update domain to production server
2. **Cron Job Setup:** Enable auto-escalation timeout checking
3. **Pin-based User Setup:** Let users link their Telegram accounts via `/profile`
4. **Monitoring:** Watch logs for any errors
5. **Team Training:** Show team how to escalate alerts

---

**Ready? Start with Step 1 above! 🚀**
