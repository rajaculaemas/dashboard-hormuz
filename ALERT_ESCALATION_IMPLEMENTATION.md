# Alert Escalation System - Implementation Guide

## Overview

Alert Escalation system for Socfortress alerts enabling L1 analysts to escalate to L2/L3 via Telegram bot with automatic timeout handling and admin notifications.

**Status:** ✅ Phase 1A Backend Complete (Ready for UI Integration)

---

## Architecture Components

### 1. Database Schema (Completed ✅)

Three new tables created:

```
AlertEscalation
├─ id (PK)
├─ alertId (FK)
├─ escalationLevel (1=L1→L2, 2=L2→L3)
├─ escalatedBy (User FK)
├─ escalatedTo (User FK)
├─ l1Analysis, l2Analysis, l3Analysis
├─ status (pending|replied|escalated|resolved|timeout)
├─ telegramMessageId / telegramChatId
├─ escalatedAt / repliedAt / resolvedAt / timeoutAt
└─ [Indexes] on alertId, escalatedToUserId, status, timeoutAt

AlertEscalationResponse
├─ id (PK)
├─ escalationId (FK)
├─ responderId (User FK)
├─ analysis / conclusion
├─ action (reply|escalate)
├─ escalatedToId (FK for L3 user if action==escalate)
├─ telegramMessageId
└─ createdAt

AlertEscalationAudit
├─ id (PK)
├─ escalationId (FK)
├─ alertId (FK)
├─ event (escalated|replied|re_escalated|timeout|admin_notified)
├─ details (JSON)
└─ createdAt
```

**Migration Status:** ✅ Applied successfully

---

## Services & Endpoints

### 2. Telegram Integration Services (Completed ✅)

**File:** `lib/services/telegram-escalation.ts`

Functions:
- `sendEscalationMessage()` - Send escalation to L2/L3
- `sendTimeoutNotification()` - Notify on 30-min timeout
- `sendAdminNotification()` - Notify admin when response received
- `parseAnalystResponse()` - Parse L2/L3 reply format

**Message Format Expected:**
```
ANALYSIS: [detailed technical analysis]
CONCLUSION: [verdict - PATCH_IMMEDIATELY|REQUIRES_INVESTIGATION|FALSE_POSITIVE|DISMISS|ESCALATE_L3]
```

---

### 3. Escalation Business Logic (Completed ✅)

**File:** `lib/services/alert-escalation.ts`

Functions:
- `createEscalation()` - Create escalation + send Telegram
- `getActiveEscalation()` - Fetch current escalation
- `getEscalationHistory()` - Fetch all escalations for alert
- `checkAndHandleTimeouts()` - Handle 30-min timeout logic

**Timeout Behavior:**
- **L2 timeout (30 min):** Auto-escalate to L3, notify L2
- **L3 timeout (30 min):** Notify admin for manual escalation to Manager/GM
- **No L3 available:** Notify admin immediately

---

### 4. API Endpoints (Completed ✅)

#### POST `/api/alerts/escalate`
Create new escalation from L1

**Requirements:**
- User must be `admin@soc-dashboard.local`
- User must have Telegram Chat ID linked

**Request Body:**
```json
{
  "alertId": "string",
  "escalateToUserId": "string (L2 user ID)",
  "analysis": "string (L1 analysis text)"
}
```

**Response:**
```json
{
  "success": true,
  "escalationId": "string",
  "message": "Alert escalated successfully"
}
```

---

#### GET `/api/alerts/[id]/escalation`
Get escalation status and history

**Response:**
```json
{
  "success": true,
  "active": {
    // Current escalation if pending/escalated
  },
  "history": [
    // All escalations for this alert
  ]
}
```

---

#### POST `/api/telegram/webhook`
Telegram bot webhook (receives L2/L3 replies)

**Telegram Setup Required:**
1. Create bot via @BotFather on Telegram
2. Get bot token
3. Set webhook: `https://your-domain.com/api/telegram/webhook`
   - Optional: Set secret token via `/setWebhookInfo`

---

#### GET `/api/cron/escalation-timeout-check`
Timeout checker (run every 5 minutes)

**Headers Required:**
```
X-Cron-Secret: [CRON_SECRET from env]
```

---

## Environment Variables Required

Add to `.env`:

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=<bot_token_from_BotFather>
TELEGRAM_WEBHOOK_SECRET=<optional_security_token>

# Cron
CRON_SECRET=<random_string_for_cron_verification>

# App URL (for links in Telegram messages)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

## Setup Instructions

### Step 1: Create Telegram Bot

1. Open Telegram → Search `@BotFather`
2. `/newbot` → Enter name (e.g., "SOC Dashboard Bot")
3. Copy **Bot Token** (looks like: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
4. Add to `.env` as `TELEGRAM_BOT_TOKEN`

### Step 2: Setup Webhook

```bash
# Replace with your bot token and public URL
curl -X POST https://api.telegram.org/bot<BOT_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/api/telegram/webhook"}'
```

### Step 3: Link User Telegram Accounts

For each L1/L2/L3 analyst:
1. They start chat with your bot: `@YourBotName`
2. They send: `/start`
3. Bot will provide their Chat ID (stored automatically)
4. Admin links Chat ID to user account in dashboard

*(UI for this linking to be implemented in Phase 2)*

### Step 4: Configure Cron Job

Setup external cron service (Vercel, EasyCron, etc.) to call:

```
GET https://your-domain.com/api/cron/escalation-timeout-check

Headers:
X-Cron-Secret: <CRON_SECRET from env>
```

Run every 5 minutes.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ L1 (admin@soc-dashboard.local) updates alert status         │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Provide analysis text │
        │ Select L2 analyst     │
        │ Click "Escalate"      │
        └───────┬───────────────┘
                │
                ▼
    ┌───────────────────────────────────┐
    │ POST /api/alerts/escalate         │
    │ - Verify admin@soc-dashboard.local│
    │ - Create AlertEscalation record   │
    │ - Send Telegram to L2             │
    └───────┬───────────────────────────┘
            │ 30-minute timeout starts
            │
            ▼
    ┌─────────────────────────────┐
    │ L2 receives Telegram message│
    │ and analysis notification   │
    └──────────┬──────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
    ┌─────────────┐ ┌──────────────────┐
    │ Reply with  │ │ Escalate to L3   │
    │ conclusion  │ │ (add ESCALATE_L3)│
    └──────┬──────┘ └────────┬─────────┘
           │                 │
           ▼                 ▼
    ┌────────────────────────────┐
    │ POST /api/telegram/webhook │
    │ - Parse response           │
    │ - Save to DB               │
    │ - Send confirmation       │
    └──────┬─────────────────────┘
           │
           ├─ If Reply:
           │  └─ Notify Admin
           │
           └─ If Escalate:
              └─ Create L3 escalation
                 └─ Send to L3 (30-min timeout)
                    │
                    ├─ L3 replies:
                    │  └─ Same as L2
                    │
                    └─ L3 timeout:
                       └─ Notify admin for manual escalation
```

---

## Message Templates

### L1 → L2 Escalation
```
📌 ALERT ESCALATION - L1 → L2

Alert ID: 12345
Title: XSS in Login Form
Severity: HIGH
Source: Socfortress

─────────────────────────
📋 L1 ANALYSIS:
Potential XSS vulnerability detected in login form.
User input not properly sanitized. Risk: Account takeover.

─────────────────────────
💬 How to respond:
1. Analyze the alert
2. Reply to this message with your analysis
3. Use format:
   ANALYSIS: [your detailed analysis]
   CONCLUSION: [verdict]

⏱️ Response required within 30 minutes
```

### L2 → L3 Escalation (if L2 escalates)
```
📌 ALERT ESCALATION - L2 → L3

Alert ID: 12345
Title: XSS in Login Form
Severity: HIGH

─────────────────────────
📋 L1 ANALYSIS:
Potential XSS vulnerability detected...

─────────────────────────
📋 L2 ANALYSIS:
Confirmed XSS via manual testing. Payload "alert(1)" executes.
Affects all user sessions. CRITICAL.

─────────────────────────
💬 L3 Action needed - Please analyze & conclude
```

---

## Testing Checklist

### Unit Tests Needed:
- [ ] `parseAnalystResponse()` - various format combinations
- [ ] `createEscalation()` - permission checks, cascade
- [ ] `checkAndHandleTimeouts()` - L2 timeout → L3 auto-escalate
- [ ] Telegram message parsing - with/without ESCALATE_L3

### Integration Tests Needed:
- [ ] E2E L1 → L2 → Reply
- [ ] E2E L1 → L2 → L3 → Reply
- [ ] L2 timeout auto-escalate to L3
- [ ] L3 timeout notification to admin
- [ ] Admin notification on response received
- [ ] No L3 available → admin notification

### Manual Testing (in browser):
- [ ] L1 can only escalate if logged as admin@soc-dashboard.local
- [ ] L2 user without Telegram Chat ID → error message
- [ ] Telegram message format validation
- [ ] Escalation history displays correctly
- [ ] Timeout countdown visible to L2/L3

---

## Phase 2: UI Integration (Not Yet Started)

### Need to Implement:

1. **Update Status Dialog Enhancement**
   - Add "Escalate to L2" radio button option
   - Show L2 user picker (filter by position)
   - Analysis field validation (required if escalating)
   - Call `POST /api/alerts/escalate`

2. **Escalation History Tab**
   - Timeline view of all escalations
   - L1 analysis → L2 reply → (if escalate) L3 reply
   - Timestamps and analyst names
   - **Fetch from:** `GET /api/alerts/[id]/escalation`

3. **Real-time Status Updates**
   - Poll or websocket for escalation status changes
   - Show "Waiting for L2 response..." with countdown
   - Auto-refresh when L2 replies

4. **User Telegram Linking**
   - Settings page → Link Telegram Account
   - Instructions to start bot chat
   - Validate Chat ID is correct

---

## Security Considerations

✅ **Implemented:**
- Only `admin@soc-dashboard.local` can escalate
- Telegram webhook secret verification
- User must have Telegram Chat ID linked
- Full audit trail in database
- No sensitive data in Telegram messages

⚠️ **To Review:**
- Telegram message encryption (end-to-end if needed)
- Auto-delete old messages from Telegram
- Rate limiting on webhook endpoint
- Cron job timeout handling

---

## Known Limitations

1. **No message editing** - If analyst makes typo, must reply again
2. **No media support** - Only text analysis accepted
3. **No escalation reversal** - Once escalated, cannot cancel
4. **Telegram-only** - Cannot reply via web interface (yet)
5. **Single L3 pool** - No role-based routing to specific L3s

---

## Troubleshooting

### Telegram messages not being sent:
- Check `TELEGRAM_BOT_TOKEN` in `.env`
- Verify webhook is set correctly: `GET https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Check bot has permissions to send messages

### Escalation creates but admin notification fails:
- Check if admin user has Telegram Chat ID linked
- Verify admin user exists with email `admin@soc-dashboard.local`

### Timeout handler not running:
- Check CRON_SECRET is set in `.env`
- Verify cron job is hitting endpoint every 5 minutes
- Check logs for errors in `/api/cron/escalation-timeout-check`

---

## Files Created/Modified

### New Files:
```
lib/services/telegram-escalation.ts          (Telegram bot integration)
lib/services/alert-escalation.ts            (Escalation business logic)
app/api/alerts/escalate/route.ts            (Escalation creation endpoint)
app/api/alerts/[id]/escalation/route.ts     (Get escalation status)
app/api/telegram/webhook/route.ts           (Telegram webhook receiver)
app/api/cron/escalation-timeout-check/route.ts (Timeout checker)
prisma/schema.prisma                         (Updated with 3 new models)
prisma/migrations/20260302050048_...        (Migration for tables)
```

### Modified Files:
```
prisma/schema.prisma                         (Added AlertEscalation models + User relations)
```

---

## Build Status

✅ **Current:** Compiled successfully in 16.1s  
✅ **Database:** Migrated successfully  
✅ **Services:** All services implemented  
✅ **Endpoints:** All endpoints implemented  

---

## Next Steps

1. ✅ Backend complete
2. ⏭️ Implement UI in SocfortressAlertUpdateDialog
3. ⏭️ Add Escalation History tab to alert detail panel
4. ⏭️ Create Telegram user linking UI
5. ⏭️ Setup Telegram bot & webhook
6. ⏭️ Configure cron job for timeout checking
7. ⏭️ E2E testing with real alerts

---

**Ready to proceed with Phase 2: UI Integration?** 🚀
