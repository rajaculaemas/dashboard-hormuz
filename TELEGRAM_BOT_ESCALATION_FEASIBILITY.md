# Telegram Bot Alert Escalation System - Feasibility Assessment

**Date:** February 13, 2026  
**Project:** SOC Dashboard  
**Assessment Focus:** Telegram Bot-based Alert Escalation Flow for L1→L2→L3 Analysts

---

## EXECUTIVE SUMMARY

### Overall Feasibility Rating: **HIGH** ✅

**Status:** Production-ready implementation is feasible with medium complexity  
**Estimated Timeline:** 4-6 weeks (MVP) | 8-10 weeks (Full production-grade)  
**Complexity:** Medium (moderate technical challenges, no fundamental blockers)

---

## 1. TELEGRAM BOT SESSION MANAGEMENT

### 1.1 Session State Maintenance

**Question:** Can Telegram bot maintain session state for multiple alerts?  
**Answer:** ✅ **YES** - Multiple approaches available

#### Technical Approaches:

**Option A: Callback Query + Database (RECOMMENDED)**
```
Flow: Alert Notification → User clicks button → Bot updates DB entry
- Telegram callback queries are stateless from bot perspective
- Bot stores conversation state in PostgreSQL (already available)
- Each alert escalation has unique ID to track state

Pros:
✓ Persistent state survives bot restart
✓ Handles multiple concurrent escalations
✓ Audit trail built-in
✓ Can implement timeout handling

Cons:
✗ Requires database query on every interaction
✗ Slight latency (100-300ms typical)
```

**Option B: In-Memory Store (Cache)**
```
Flow: Redis/Node cache stores conversation state
- Fast lookups (1-10ms)
- Useful for real-time interactions
- Lost on server restart unless persisted

Pros:
✓ High performance
✓ Good for typing indicators

Cons:
✗ State loss on crashes
✗ Additional infrastructure (Redis)
```

**Option C: Hybrid (Database + Redis) (BEST FOR SCALE)**
```
- Redis for hot conversation state (< 5 min inactivity)
- Database persists for audit & recovery
- Auto-sync on 5 min inactivity
```

### 1.2 Webhook vs Polling

**Question:** What's the best approach: webhook vs polling?  
**Answer:** ✅ **WEBHOOK RECOMMENDED** (but consider hybrid)

#### Technical Comparison:

| Aspect | Webhook | Polling | Hybrid |
|--------|---------|----------|---------|
| **Latency** | 50-200ms (best) | 1-3s (poor) | 50-200ms (best) |
| **Server Load** | Low (event-driven) | High (continuous) | Medium |
| **Failure Handling** | Requires retry logic | Built-in reconnect | Both |
| **Scalability** | Excellent (100k+ users) | Poor (>1k) | Very Good |
| **Setup Complexity** | Medium (TLS cert needed) | Low | High |
| **Infrastructure Cost** | Low | High | Medium |

#### Recommended Approach: **Webhook with Polling Fallback**
```typescript
// Webhook for normal operation (fast)
POST /api/telegram/webhook → Instant message receipt

// Polling fallback if webhook fails for 5 min (reliability)
Every 30s: getUpdates() → catch missed messages
```

### 1.3 Alert Context Tracking

**Question:** How to track which alert a user is replying to?

**Answer:** ✅ **Using Telegram Message Thread IDs + Custom Message IDs**

#### Implementation Strategy:

```typescript
// Message identifies alert + escalation context
{
  alertId: "alert-1675",
  escalationId: "esc-e82f-92j2",
  fromLevel: "L1",
  toLevel: "L2", 
  messageId: "12345", // Telegram message ID
  timestamp: 1739447392,
  status: "pending", // pending|acknowledged|replied|escalated
}

// Store in AlertEscalation table with telegram_thread_id
```

#### Conversation Threading:

**Telegram Message Linking:**
```
1. Send initial escalation notification to L2 (gets message_id: 12345)
2. When L2 replies, Telegram sends update with reply_to_message_id
3. Bot queries DB using reply_to_message_id to find escalation
4. All messages in thread linked to original escalation

Storage in DB:
- telegram_message_id (links to thread)
- telegram_thread_id (for grouping in Telegram)
- conversation_state (pending/active/closed)
```

### 1.4 Context Persistence Across Messages

**Question:** Can bot handle context persistence across messages?

**Answer:** ✅ **YES** - Multiple patterns work:

#### Pattern 1: Command-Based (Simplest)
```
L2 Receives: "Alert #1675 escalated by Alice - Click to review"
            [Review] [Escalate to L3] [Dismiss]

L2 Clicks: [Review] 
→ Bot sends full alert details + "Reply with: ESCALATE" or click button

L2 Sends: ESCALATE
→ Bot recognizes command in context, escalates to L3
```

**Advantages:**
- Simple to implement
- Works with text-only clients
- Clear command structure

#### Pattern 2: Inline Keyboard (Better UX)
```typescript
// Initial message with inline buttons
{
  text: "Alert #1675 - Malware Detection",
  reply_markup: {
    inline_keyboard: [
      [{ text: "Review", callback_data: "review_1675" }],
      [{ text: "Escalate to L3", callback_data: "escalate_1675_L3" }],
      [{ text: "Close", callback_data: "close_1675" }]
    ]
  }
}

// Each button press = callback query
// Store state: escalationId → messageId → callback_data
```

#### Pattern 3: Conversation Flows (Advanced)
```
Implement telegram-specific conversation states:
state.current_alert = "1675"
state.current_step = "awaiting_analysis"
state.escalation_chain = ["L1→L2", "L2→L3"]

Next message from user processed in context of state
```

### 1.5 Rate Limiting Considerations

**Telegram API Limits:**
```
Messages to single chat: 30 messages/second
Messages to different chats: 300 messages/second
Callback queries: No hard limit but ~1000 updates/second practical

Impact on your system:
- With 100 analysts, 30 concurrent escalations per sec = NO PROBLEM
- Safe margin even for 500+ analysts
```

**Implementation Strategy:**
```typescript
// Add rate limiter per user (Telegram Chat ID)
const RATE_LIMITS = {
  messages_per_minute: 60,
  callbacks_per_minute: 120,
  escalations_per_hour: 500,
}

// Use Redis or in-memory counter
```

---

## 2. MESSAGE FLOW & INTERACTION ARCHITECTURE

### 2.1 End-to-End Alert Escalation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    L1 ANALYST DASHBOARD                         │
│  [Alert] → [Action: Escalate to L2] → API /escalate endpoint   │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ↓
        ┌────────────────────────────────────────┐
        │  Save to DB:                           │
        │  AlertEscalation table:                │
        │  - alertId, fromLevel, toLevel         │
        │  - assignedUserId (L2 person)          │
        │  - status: 'pending'                   │
        │  - created_at, expires_at             │
        └────────────────────────────────────────┘
                             │
                             ↓
        ┌────────────────────────────────────────┐
        │  Query User table:                     │
        │  SELECT telegram_chat_id               │
        │  WHERE id = L2_user_id                 │
        └────────────────────────────────────────┘
                             │
                             ↓
  ┌──────────────────────────────────────────────────────┐
  │  Send Telegram Message to L2:                       │
  │  Text: "New escalation: Alert #1675 - [Title]      │
  │         Severity: HIGH                             │
  │         From: Alice (L1)                           │
  │         [Review] [Escalate to L3] [Dismiss]"       │
  │                                                     │
  │  Store: telegram_message_id, timestamp              │
  └──────────────────────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                ↓                         ↓
         L2 Clicks [Review]        Timeout (30 min)
                │                         │
                ↓                         ↓
  ┌──────────────────────────────┐  ┌─────────────────┐
  │ Bot sends alert details       │  │ Send reminder   │
  │ + buttons for next action     │  │ notification   │
  │                               │  └─────────────────┘
  │ L2 can reply with analysis:   │         │
  │ "Text of analysis..."         │         ↓
  │                               │  ┌─────────────────┐
  │ OR click [Escalate to L3]     │  │ If 2hrs no reply│
  │                               │  │ escalate to L3  │
  └──────────────────────────────┘  │ automatically   │
         │          │                └─────────────────┘
    Analysis    Escalate to L3
    received    click
         │          │
         ↓          ↓
   ┌──────────────────────────────────┐
   │ Update DB & trigger next level   │
   │ escalation (repeat flow for L3)  │
   └──────────────────────────────────┘

```

### 2.2 Reply Parsing & Analysis Text Capture

**Question:** How to handle complex multi-line analysis text?

**Answer:** ✅ **Multiple Receipt Patterns**

#### Pattern 1: Direct Text Reply (RECOMMENDED for simplicity)
```
L2 sends text message to bot: "Analyzed the alert. Behavior matches 
malware signature X from our threat library. False positive rate: 15%.
Recommend watching for similar patterns on this subnet."

Bot captures:
- Full message text (up to 4096 chars)
- Message ID
- Sender (from Telegram user_id → mapped to User table)
- Reply context (replies_to: original escalation message_id)

Store in DB:
- AlertEscalationResponse table
- analysis_text: <full text>
- responded_at: <timestamp>
- respondent_id: <User ID>
```

#### Pattern 2: Semi-Structured Format
```
Bot sends prompt: "Please reply with:
ANALYSIS: <your analysis>
RECOMMENDATION: <escalate/close/monitor>
TTL: <time to live in days>"

L2 sends:
ANALYSIS: This is likely a false positive based on system configuration
RECOMMENDATION: close
TTL: 7

Bot parses using regex/split
```

#### Pattern 3: Edit Message Format
```
Bot maintains editable message with analysis form:

"📋 Alert #1675 Analysis Form

Your Analysis:
[L2 can edit original message with edit buttons]

Or click: [Add Analysis] → Opens form
```

#### Handling Long Text (>4096 chars)

Telegram has 4096 character limit per message:

```typescript
// Solution: Split response + chain messages
const analysis = "...very long analysis...";
const chunks = analysis.match(/[\s\S]{1,4000}/g) || [];

// Send as thread
await sendMessage(chatId, "Part 1 of " + chunks.length);
chunks.forEach((chunk, idx) => {
  sendMessage(chatId, chunk);
});
```

### 2.3 Message Flow Diagram - Interactive Sequence

```typescript
// App sends escalation request
POST /api/escalations
{
  alertId: "1675",
  currentLevel: "L1",
  targetLevel: "L2",
  escalatedBy: "alice@company.com",
  reason: "Needs senior review"
}

// Returns escalation ID
Response: { escalationId: "esc-e82f" }

// Trigger Telegram notification
async function notifyTelegram(escalationId) {
  const escalation = await db.alertEscalation.findUnique({ 
    where: { id: escalationId },
    include: { toUser: true, alert: true }
  });

  const chatId = escalation.toUser.telegramChatId;
  const messageId = await bot.sendMessage(chatId, {
    text: formatAlertMessage(escalation),
    reply_markup: getEscalationButtons(escalationId)
  });

  // Store for threading
  await db.alertEscalation.update({
    where: { id: escalationId },
    data: { telegram_message_id: messageId.message_id }
  });
}

// L2 replies
bot.on('message', async (msg) => {
  const msgText = msg.text;
  const repliesTo = msg.reply_to_message?.message_id;

  // Find escalation by telegram message ID
  const escalation = await db.alertEscalation.findUnique({
    where: { telegram_message_id: repliesTo }
  });

  // Store response
  await db.alertEscalationResponse.create({
    data: {
      escalationId: escalation.id,
      response_text: msgText,
      respondent_id: getUserIdFromTelegramId(msg.from.id),
      responded_at: new Date()
    }
  });

  // Notify app (optional webhook back to dashboard)
  await notifyDashboard(escalation.id, msgText);
});
```

---

## 3. DATABASE SCHEMA DESIGN

### 3.1 Recommended Schema

Your `User` table **already has** `telegramChatId` field ✅

**Required new tables:**

#### Table 1: AlertEscalation (Core escalation tracking)

```sql
CREATE TABLE alert_escalation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Alert & User reference
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  from_level VARCHAR(10), -- "L1", "L2", "L3"
  to_level VARCHAR(10),   -- "L1", "L2", "L3"
  
  -- Users involved
  escalated_by_id UUID NOT NULL REFERENCES users(id),
  assigned_to_id UUID NOT NULL REFERENCES users(id),
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending|acknowledged|in_review|responded|escalated|closed
  escalation_reason TEXT,
  
  -- Telegram integration
  telegram_message_id BIGINT, -- Telegram message ID for threading
  telegram_chat_id BIGINT, -- Telegram chat ID of recipient
  
  -- Timing
  created_at TIMESTAMP DEFAULT now(),
  acknowledged_at TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (now() + interval '30 minutes'),
  escalated_at TIMESTAMP, -- When escalated to next level
  closed_at TIMESTAMP,
  
  -- Escalation chain tracking
  response_id UUID REFERENCES alert_escalation_response(id) ON DELETE SET NULL,
  next_escalation_id UUID REFERENCES alert_escalation(id) ON DELETE SET NULL,
  
  INDEX (assigned_to_id, status),
  INDEX (alert_id),
  INDEX (telegram_message_id),
  INDEX (created_at DESC)
);
```

#### Table 2: AlertEscalationResponse (User responses)

```sql
CREATE TABLE alert_escalation_response (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID NOT NULL REFERENCES alert_escalation(id) ON DELETE CASCADE,
  
  -- Response content
  response_type VARCHAR(50), -- "text"|"command"|"action"
  response_text TEXT, -- The analysis/reply
  
  -- Respondent
  respondent_id UUID NOT NULL REFERENCES users(id),
  
  -- Telegram context
  telegram_message_id BIGINT,
  telegram_user_id BIGINT,
  
  -- Metadata
  response_time_minutes INT, -- How long to respond
  created_at TIMESTAMP DEFAULT now(),
  
  INDEX (escalation_id),
  INDEX (respondent_id)
);
```

#### Table 3: AlertEscalationSession (Session state - optional but recommended)

```sql
CREATE TABLE alert_escalation_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  escalation_id UUID NOT NULL UNIQUE REFERENCES alert_escalation(id),
  
  -- Conversation state
  conversation_state JSONB DEFAULT '{}', -- Current step, context
  last_interaction TIMESTAMP DEFAULT now(),
  
  -- Telegram state
  pending_callback_query_id VARCHAR(255), -- For acknowledging callbacks
  message_thread_id INT, -- For threading multiple messages
  
  -- Timeouts
  timeout_action VARCHAR(50), -- "auto_escalate" | "close" | "notify"
  timeout_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

#### Table 4: AlertEscalationAudit (Comprehensive audit trail)

```sql
CREATE TABLE alert_escalation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  escalation_id UUID NOT NULL REFERENCES alert_escalation(id),
  
  event_type VARCHAR(50), -- "created"|"sent"|"acknowledged"|"responded"|"escalated"|"expired"
  event_data JSONB, -- Flexible storage for event-specific data
  
  actor_id UUID REFERENCES users(id), -- Who triggered this
  
  created_at TIMESTAMP DEFAULT now(),
  
  INDEX (escalation_id),
  INDEX (created_at DESC)
);
```

### 3.2 Prisma Schema Definition

```prisma
model AlertEscalation {
  id String @id @default(cuid()) @map("id")
  
  alert Alert @relation(fields: [alertId], references: [id], onDelete: Cascade)
  alertId String @map("alert_id")
  
  fromLevel String @map("from_level") // "L1", "L2", "L3"
  toLevel String @map("to_level")
  
  escalatedBy User @relation("escalated_by", fields: [escalatedById], references: [id])
  escalatedById String @map("escalated_by_id")
  
  assignedTo User @relation("assigned_to", fields: [assignedToId], references: [id])
  assignedToId String @map("assigned_to_id")
  
  status String @default("pending") // pending|acknowledged|in_review|responded|escalated|closed
  escalationReason String? @map("escalation_reason")
  
  telegramMessageId BigInt? @map("telegram_message_id")
  telegramChatId BigInt? @map("telegram_chat_id")
  
  responses AlertEscalationResponse[] @relation("escalation_responses")
  nextEscalation AlertEscalation? @relation("next_escalation", fields: [nextEscalationId], references: [id])
  nextEscalationId String? @map("next_escalation_id")
  
  createdAt DateTime @default(now()) @map("created_at")
  acknowledgedAt DateTime? @map("acknowledged_at")
  expiresAt DateTime @default(dbgenerated("now() + interval '30 minutes'")) @map("expires_at")
  escalatedAt DateTime? @map("escalated_at")
  closedAt DateTime? @map("closed_at")
  
  auditLog AlertEscalationAudit[]
  
  @@map("alert_escalation")
  @@index([assignedToId, status])
  @@index([alertId])
  @@index([telegramMessageId])
}

model AlertEscalationResponse {
  id String @id @default(cuid())
  
  escalation AlertEscalation @relation("escalation_responses", fields: [escalationId], references: [id], onDelete: Cascade)
  escalationId String @map("escalation_id")
  
  responseType String @map("response_type") // "text"|"command"|"action"
  responseText String? @map("response_text")
  
  respondent User @relation(fields: [respondentId], references: [id])
  respondentId String @map("respondent_id")
  
  telegramMessageId BigInt? @map("telegram_message_id")
  telegramUserId BigInt? @map("telegram_user_id")
  responseTimeMinutes Int? @map("response_time_minutes")
  
  createdAt DateTime @default(now()) @map("created_at")
  
  @@map("alert_escalation_response")
  @@index([escalationId])
  @@index([respondentId])
}

// Extend User model
model User {
  // ... existing fields ...
  
  escalationsCreated AlertEscalation[] @relation("escalated_by")
  escalationsAssigned AlertEscalation[] @relation("assigned_to")
  escalationResponses AlertEscalationResponse[]
  escalationAuditLog AlertEscalationAudit[]
  
  @@map("users")
}
```

### 3.3 Schema Explanation

| Table | Purpose | Key Features |
|-------|---------|--------------|
| **alert_escalation** | Tracks each escalation event | Status machine, timeouts, telegram linking |
| **alert_escalation_response** | Stores analyst replies | Captures analysis text, timing metrics |
| **alert_escalation_audit** | Complete audit trail | Security compliance, debugging |
| **alert_escalation_session** | Runtime conversation state | Optional, improves UX |

---

## 4. INTEGRATION ARCHITECTURE

### 4.1 Where to Host the Bot

#### Option A: Next.js Webhook Endpoint (RECOMMENDED) ✅

**Advantages:**
- Single codebase
- Shared database connection
- Easier authentication
- No additional infrastructure
- Built-in error handling

**Disadvantages:**
- Next.js not optimized for long-running processes
- Cold starts if serverless

**Implementation:**
```typescript
// /app/api/telegram/webhook/route.ts
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

export async function POST(request: Request) {
  const update = await request.json();
  
  try {
    await bot.handleUpdate(update);
  } catch (error) {
    console.error('Webhook error:', error);
  }
  
  return new Response('OK', { status: 200 });
}
```

Register webhook with Telegram on app startup:
```bash
curl -X POST \
  https://api.telegram.org/bot<TOKEN>/setWebhook \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://yourdomain.com/api/telegram/webhook"}'
```

#### Option B: Separate Node.js Service

**Advantages:**
- Can run bot listener 24/7
- Better for complex logic
- Isolated from main app

**Disadvantages:**
- Additional infrastructure
- Separate error handling
- Deployment complexity

**Setup:**
```bash
# Dockerfile for bot service
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]

# docker-compose.yml
services:
  bot:
    build: ./bot-service
    environment:
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      DATABASE_URL: postgres://...
      WEBHOOK_URL: https://yourdomain.com/api/telegram/webhook
```

#### Option C: AWS Lambda (Serverless)

**Advantages:**
- Cost-effective
- Auto-scaling
- No server management

**Disadvantages:**
- 15 min cold start limits
- Polling based (not webhook)
- Higher latency

**Recommendation:** **Use Option A (Next.js Webhook) for 80% of use cases**

### 4.2 Telegram API Authentication & Security

#### Webhook Security: Signature Verification

Telegram signs updates with HMAC-SHA256:

```typescript
import crypto from 'crypto';

interface TelegramUpdate {
  update_id: number;
  [key: string]: any;
}

function verifyTelegramWebhook(
  update: TelegramUpdate,
  telegramBotToken: string,
  headers: Record<string, string>
): boolean {
  // Note: Telegram doesn't sign updates to webhooks
  // BUT you can verify the webhook URL when setting it
  // For webhook security, use HTTPS + secret path
  
  // Example with secret path:
  // https://example.com/api/telegram/webhook/<SECRET_TOKEN>
  
  return true; // Telegram webhook doesn't include signature
}

// Better: Verify update_id is reasonable
function validateUpdate(update: TelegramUpdate): boolean {
  // Check update_id is in expected range
  // Rate limit by user_id
  // Verify message content is not spam
  return true;
}
```

#### Document Verification (Optional)

For file transfers, verify file_id:
```typescript
async function verifyTelegramFile(fileId: string, botToken: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
  );
  const data = await response.json();
  return data.ok ? data.result : null;
}
```

### 4.3 Calling Telegram API from Next.js

```typescript
// /lib/telegram/client.ts
export class TelegramClient {
  private botToken: string;
  private baseUrl = 'https://api.telegram.org';

  constructor(token: string) {
    this.botToken = token;
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    options?: any
  ) {
    const response = await fetch(
      `${this.baseUrl}/bot${this.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          ...options,
        }),
      }
    );
    
    const data = await response.json();
    if (!data.ok) throw new Error(data.description);
    return data.result;
  }

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options?: any
  ) {
    const response = await fetch(
      `${this.baseUrl}/bot${this.botToken}/editMessageText`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: 'HTML',
          ...options,
        }),
      }
    );
    
    const data = await response.json();
    if (!data.ok) throw new Error(data.description);
    return data.result;
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    options?: any
  ) {
    const response = await fetch(
      `${this.baseUrl}/bot${this.botToken}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          ...options,
        }),
      }
    );
    
    const data = await response.json();
    if (!data.ok) throw new Error(data.description);
    return data.result;
  }
}
```

### 4.4 Message From App to Telegram Flow

```typescript
// /app/api/alerts/[id]/escalate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TelegramClient } from '@/lib/telegram/client';
import { formatEscalationMessage } from '@/lib/telegram/formatters';

const telegramClient = new TelegramClient(
  process.env.TELEGRAM_BOT_TOKEN!
);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { targetLevel, reason } = await request.json();
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch alert details
    const alert = await prisma.alert.findUnique({
      where: { id: params.id },
      include: { integration: true }
    });

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    // 2. Find target analyst for this level
    const targetAnalyst = await prisma.user.findFirst({
      where: {
        position: `Analyst ${targetLevel}`,
        status: 'active',
        telegramChatId: { not: null }
      }
    });

    if (!targetAnalyst?.telegramChatId) {
      return NextResponse.json(
        { error: `No ${targetLevel} analyst available via Telegram` },
        { status: 400 }
      );
    }

    // 3. Create escalation record
    const escalation = await prisma.alertEscalation.create({
      data: {
        alertId: alert.id,
        fromLevel: currentUser.position?.split(' ')[1] || 'L1',
        toLevel: targetLevel,
        escalatedById: currentUser.userId,
        assignedToId: targetAnalyst.id,
        escalationReason: reason,
        telegramChatId: BigInt(targetAnalyst.telegramChatId as string),
      }
    });

    // 4. Send Telegram message
    const messageText = formatEscalationMessage(alert, escalation);
    const telegramMessage = await telegramClient.sendMessage(
      targetAnalyst.telegramChatId as string,
      messageText,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📋 Review',
                callback_data: `alert_${alert.id}_review`
              },
              {
                text: '🔼 Escalate',
                callback_data: `esc_${escalation.id}__escalate`
              }
            ],
            [
              {
                text: '❌ Dismiss',
                callback_data: `esc_${escalation.id}_dismiss`
              }
            ]
          ]
        }
      }
    );

    // 5. Store telegram message ID for threading
    await prisma.alertEscalation.update({
      where: { id: escalation.id },
      data: {
        telegramMessageId: BigInt(telegramMessage.message_id)
      }
    });

    // 6. Audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId: escalation.id,
        eventType: 'sent',
        eventData: {
          telegramMessageId: telegramMessage.message_id,
          telegramChatId: targetAnalyst.telegramChatId,
          timestamp: new Date().toISOString()
        },
        actorId: currentUser.userId
      }
    });

    return NextResponse.json({
      success: true,
      escalationId: escalation.id,
      messageId: telegramMessage.message_id
    });

  } catch (error) {
    console.error('Escalation error:', error);
    return NextResponse.json(
      { error: 'Failed to escalate alert' },
      { status: 500 }
    );
  }
}
```

---

## 5. USER EXPERIENCE DESIGN

### 5.1 How Analysts Interact via Telegram

#### Flow Option 1: Guided Buttons (RECOMMENDED for L1→L2)

```
Message from Bot:
┌─────────────────────────────────────┐
│ 🚨 ALERT ESCALATION                 │
│                                     │
│ Alert: #1675                        │
│ Title: Malware Detection            │
│ Severity: HIGH 🔴                   │
│ Escalated by: Alice (L1)            │
│ Reason: Anomaly signature match     │
│                                     │
│ [📋 Review Details] [🔼 Escalate]   │
│ [❌ Dismiss]                        │
└─────────────────────────────────────┘

L2 clicks → [📋 Review Details]

Bot responds:
┌─────────────────────────────────────┐
│ ALERT FULL DETAILS                  │
│                                     │
│ Full description here...            │
│ Affected systems: 3                 │
│ First seen: 2 hours ago             │
│ Last activity: 20 minutes ago       │
│                                     │
│ [Provide Analysis] [Escalate to L3] │
│ [False Positive] [Monitor]          │
└─────────────────────────────────────┘

L2 clicks → [Provide Analysis]

Bot prompts:
┌─────────────────────────────────────┐
│ Reply with your analysis of this     │
│ alert. Include:                     │
│ - What you found                    │
│ - Confidence level                  │
│ - Recommended action                │
└─────────────────────────────────────┘

L2 sends text message:
"Analyzed using threat intel database.
Matches known C2 signature from group_X.
Confidence: 95%
Recommend: Contain and investigate."

Bot stores analysis, notifies L3 if escalating
```

#### Flow Option 2: Command-Based (For power users)

```
L2 sends: /analyze 1675
Bot: [Shows alert details form]

L2 sends: /escalate 1675 L3 "Needs senior review"
Bot: [Escalated, notifies L3]

L2 sends: /respond 1675 "Analyzed signal..."
Bot: [Stores response, thanks user]
```

### 5.2 Known Alert Context

Bot should remember which alert in conversation:

```typescript
interface ConversationState {
  currentAlertId: string;
  currentEscalationId: string;
  step: 'awaiting_action' | 'awaiting_analysis' | 'awaiting_confirmation';
  messageThread: number[]; // Telegram message IDs in conversation
  timeout: number; // ms until escalates to next level
}

// When L2 sends message:
const state = await getConversationState(userId, chatId);
// Bot knows: "This is about alert 1675, step is 'awaiting_analysis'"
// So reply "Thanks for your analysis" not "What alert?"
```

### 5.3 No-Reply Handling

Implement timeouts for stalled escalations:

```typescript
// Escalation timeout jobs (using pg-boss or similar)
async function handleEscalationTimeouts() {
  const staleEscalations = await prisma.alertEscalation.findMany({
    where: {
      status: 'pending',
      expiresAt: { lte: new Date() }
    }
  });

  for (const esc of staleEscalations) {
    switch (esc.toLevel) {
      case 'L2':
        // Send reminder first
        await sendReminderMessage(esc.telegramChatId);
        esc.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Snooze 15 min
        break;
      case 'L3':
        // Auto-escalate or notify manager
        await escalateToManager(esc);
        break;
    }
    
    await prisma.alertEscalation.update({
      where: { id: esc.id },
      data: {
        status: esc.toLevel === 'L3' ? 'escalated' : 'pending',
        expiresAt: esc.expiresAt,
        escalatedAt: esc.toLevel === 'L3' ? new Date() : undefined
      }
    });
  }
}

// Run every 5 minutes
setInterval(handleEscalationTimeouts, 5 * 60 * 1000);
```

### 5.4 Read Status Tracking

```typescript
// Limited by Telegram API (doesn't expose read receipts)
// Alternative: Track engagement metrics

interface EngagementMetrics {
  messageReceivedTime: number;
  firstInteractionTime: number;
  timeToAcknowledge: number;
  timeToRespond: number;
  totalTimeInConversation: number;
}

// Store when:
// 1. Message sent (timestamps.created_at)
// 2. User clicks button (callback_query)
// 3. User sends text (message event)

// Calculate SLAs:
// L1→L2: Should respond within 15 min
// L2→L3: Should respond within 10 min
```

---

## 6. LIMITATIONS & CONSTRAINTS

### 6.1 Telegram API Limits

| Limit | Value | Impact on your system |
|-------|-------|----------------------|
| **Message size** | 4,096 chars | Split long analyses |
| **Messages/sec to chat** | 30 msg/sec | Per-user rate limit |
| **Messages/sec overall** | 300 msg/sec | Reasonable for most orgs |
| **Inline buttons per row** | 8 buttons | Design compact UIs |
| **Callback query timeout** | 30 seconds | Keep responses quick |
| **Update timeout in webhook** | 25 seconds | Must return 200 OK fast |

### 6.2 Free vs Premium Features

**Telegram Bot API Features (all free):**
- ✅ Text messages
- ✅ Inline keyboards/buttons
- ✅ Callbacks
- ✅ Message editing
- ✅ Media (photos, files)
- ✅ Webhooks

**Limitations in free tier:**
- Maximum file size: 20 MB
- No bot profile pictures (unchanged)
- Basic command set only

**Premium Telegram (User feature, not bot):**
- No impact on bot functionality
- Some UI enhancements only

**Verdict:** Telegram Bot API is completely free, no tier limitations ✅

### 6.3 Message Size & Media Support

```typescript
// Handle message size limits
const MAX_MESSAGE_SIZE = 4096;

export function splitMessage(text: string): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  const lines = text.split('\n');
  for (const line of lines) {
    if ((currentChunk + line).length > MAX_MESSAGE_SIZE) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

// Send analysis files
export async function sendAnalysisFile(
  chatId: string,
  fileName: string,
  content: string
) {
  // Convert to PDF/Excel if needed
  const buffer = Buffer.from(content, 'utf-8');
  
  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error('File too large (>20MB)');
  }

  return telegramClient.sendDocument(chatId, buffer, {
    filename: fileName,
    caption: 'Analysis attachment'
  });
}
```

### 6.4 Concurrent Escalations

Your system can handle this:

```
Telegram limits: 300 msg/sec globally
Your system: ~1000 concurrent escalations = 1000 escalations
If each sends 2 messages = 2000 messages in 5-10 sec

Potential bottleneck: Database transactions
Solution: Use async job queue (pg-boss, Bull)

async function sendEscalationAsync(escalationId) {
  // Queued job sends after 1 sec delay
  // Prevents thundering herd
  await queue.add({
    type: 'send_escalation',
    escalationId,
    delayMs: Math.random() * 1000 // Stagger sends
  });
}
```

### 6.5 Message Editing & Deletion

```typescript
// Edit escalation status in Telegram
async function updateEscalationStatus(
  chatId: string,
  messageId: number,
  newStatus: string
) {
  const text = await generateEscalationMessage(newStatus);
  
  try {
    await telegramClient.editMessageText(
      chatId,
      messageId,
      text,
      { reply_markup: getNewButtons(newStatus) }
    );
  } catch (error) {
    if (error.message.includes('message not modified')) {
      // Status hasn't actually changed, ignore
      return;
    }
    throw error;
  }
}

// Delete escalation (after 7 days)
async function archiveOldEscalations() {
  const oldEscalations = await prisma.alertEscalation.findMany({
    where: {
      createdAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }
  });

  for (const esc of oldEscalations) {
    try {
      // Delete Telegram message (optional, useful for privacy)
      await telegramClient.deleteMessage(
        esc.telegramChatId.toString(),
        Number(esc.telegramMessageId)
      );
    } catch {
      // Already deleted or user blocked bot
    }

    // Keep database record for audit trail
    await prisma.alertEscalation.update({
      where: { id: esc.id },
      data: { archivedAt: new Date() }
    });
  }
}
```

---

## 7. SECURITY & COMPLIANCE

### 7.1 Authorization & Authentication

#### Verify Chat ID Matches Database

```typescript
async function validateTelegramUser(
  telegramUserId: number,
  telegramChatId: number
): Promise<User | null> {
  // Step 1: Find user by telegram_chat_id
  const user = await prisma.user.findFirst({
    where: { telegramChatId: telegramChatId.toString() }
  });

  if (!user) {
    throw new Error('Telegram chat ID not found in database');
  }

  // Step 2: Verify user is still active
  if (user.status !== 'active') {
    throw new Error('User account is inactive');
  }

  // Step 3: Verify user has proper role
  if (!['analyst', 'administrator'].includes(user.role)) {
    throw new Error('User does not have escalation permissions');
  }

  return user;
}

// Use in message handler
bot.on('message', async (ctx) => {
  try {
    const user = await validateTelegramUser(
      ctx.from.id,
      ctx.chat.id
    );
    
    // Process message only if validation passes
    await handleAnalystMessage(user, ctx.message);
  } catch (error) {
    ctx.reply('Unauthorized: ' + error.message);
  }
});
```

#### OAuth-style Setup for Telegram Connection

```typescript
// 1. App generates secure linking code
async function generateTelegramLinkingCode(userId: string) {
  const code = generateRandomCode(8); // e.g., "ABC1X2Y3"
  
  await prisma.user.update({
    where: { id: userId },
    data: {
      telegramLinkingCode: code,
      telegramLinkingCodeExpiresAt: 
        new Date(Date.now() + 10 * 60 * 1000) // 10 min
    }
  });

  return code;
}

// 2. User sends code to bot: /link ABC1X2Y3
bot.hears(/\/link (.{8})/i, async (ctx) => {
  const code = ctx.match[1];
  
  // Find user by code
  const user = await prisma.user.findFirst({
    where: {
      telegramLinkingCode: code,
      telegramLinkingCodeExpiresAt: { gt: new Date() }
    }
  });

  if (!user) {
    ctx.reply('Invalid or expired code');
    return;
  }

  // Link telegram to user
  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramChatId: ctx.chat.id.toString(),
      telegramLinkingCode: null,
      telegramLinkingCodeExpiresAt: null
    }
  });

  ctx.reply('✅ Telegram linked to your SOC Dashboard account!');
});
```

### 7.2 Sensitive Data Handling

**Alert content contains sensitive data:**
- IP addresses
- System names
- Vulnerability details
- Configuration info

**Mitigation strategies:**

```typescript
// 1. Redact sensitive fields in Telegram
function formatAlertForTelegram(alert: Alert): string {
  return `
Alert #${alert.id.slice(0, 8)}
Title: ${alert.title}
Severity: ${alert.severity}

Full details available in dashboard.
Do not share this message outside team.
  `.trim();
}

// 2. Require dashboard login for full details
// Send minimal info to Telegram, link to dashboard

// 3. Remove alert details after 24 hours
async function deleteOldAlertMessages() {
  const oldMessages = await prisma.alertEscalation.findMany({
    where: {
      telegramMessageId: { not: null },
      createdAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });

  for (const msg of oldMessages) {
    try {
      await telegramClient.deleteMessage(
        msg.telegramChatId.toString(),
        Number(msg.telegramMessageId)
      );
    } catch (error) {
      console.log('Could not delete message:', error);
    }
  }
}

// 4. DLP: Don't allow copy-paste of sensitive data
// (Telegram user side, not bot controllable)
```

### 7.3 Audit Trail & Compliance

```typescript
// Complete audit trail for all escalations
const auditLog = {
  escalationId: 'esc-123',
  events: [
    {
      timestamp: '2026-02-13T10:30:00Z',
      event: 'created',
      actor: 'alice@company.com',
      details: { level: 'L2', reason: 'Initial triage' }
    },
    {
      timestamp: '2026-02-13T10:31:15Z',
      event: 'telegram_message_sent',
      actor: 'system',
      details: { messageId: 12345, chatId: 98765 }
    },
    {
      timestamp: '2026-02-13T10:45:30Z',
      event: 'responded',
      actor: 'bob@company.com',
      details: {
        responseTime: '15m',
        responseText: '[stored safely]',
        telegramMessageId: 12346
      }
    },
    {
      timestamp: '2026-02-13T10:46:00Z',
      event: 'escalated',
      actor: 'bob',
      details: { toLevel: 'L3', reason: 'Needs expertise' }
    }
  ]
};

// Logs comply with:
// ✓ SOC 2 (audit trails)
// ✓ ISO 27001 (access tracking)
// ✓ GDPR (data retention)
```

### 7.4 Incident Response if Bot Compromised

```typescript
// Kill-switch: Disable bot
async function disableBotEscalations() {
  // Update feature flag
  await redis.set('TELEGRAM_ESCALATIONS_ENABLED', 'false');

  // Notify all users
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null } }
  });

  for (const user of users) {
    await telegramClient.sendMessage(
      user.telegramChatId,
      '⚠️ Telegram escalations temporarily disabled. Use dashboard.'
    );
  }

  // Escalations continue in app only
}

// Revoke all telegram connections
async function revokeTelegramAccess() {
  await prisma.user.updateMany({
    data: { telegramChatId: null }
  });
}
```

---

## 8. COMPARISON WITH ALTERNATIVES

### 8.1 Alternative 1: In-App Notifications

| Aspect | Telegram Bot | In-App Notif |
|--------|--------------|-------------|
| **Reach** | 24/7 on mobile | Only when app open |
| **Latency** | 50-200ms | 0-5s (depends on polling) |
| **Cost** | Free | Included |
| **Setup** | Medium | Easy |
| **External dependency** | Telegram infra | None |
| **Works offline** | Sort of (buffered) | No |
| **User adoption** | Higher (push mobile) | Variable |

**When to use In-App:**
- Small teams (<20 people)
- Always monitoring dashboard
- On local network

### 8.2 Alternative 2: Email-Based Escalation

| Aspect | Telegram Bot | Email |
|--------|------------|-------|
| **Delivery time** | Instant | 1-5 min |
| **Reply parsing** | Bot-native | Complex (email parsing) |
| **Context tracking** | Native threads | Reply-To headers |
| **UI for actions** | Buttons | Links only |
| **Adoption** | Very high | Moderate |
| **Compliance** | Easier | Email regulations |

**When to use Email:**
- Regulatory requirement
- Need formal record
- Require attestation (signature)

### 8.3 Alternative 3: Slack Bot

| Aspect | Telegram Bot | Slack Bot |
|--------|------------|-----------|
| **Setup** | Free account | Free account |
| **Escalation** | Direct messaging | Channel-based |
| **Threading** | Native | Yes |
| **UI** | Buttons, forms | Blocks API |
| **Adoption** | Very high | If already using Slack |
| **Cost** | Free | Free tier available |
| **Enterprise integrations** | Limited | Excellent |

**When to use Slack:**
- Organization already uses Slack
- Multi-team collaboration
- Integration with other tools

### 8.4 Hybrid Recommendation

**For maximum coverage:**

```
Priority 1: Telegram (L1→L2→L3 direct messages)
Priority 2: Email (formal audit trail)
Priority 3: In-app (secondary, when logged in)

Flow:
1. L1 escalates in app
2. Send Telegram push to L2 (50ms)
3. Send email to L2 (30s fallback)
4. If no response in 15 min, send in-app alert
5. If no response in 30 min, escalate to L3
```

---

## 9. IMPLEMENTATION ROADMAP

### Phase 1: MVP (Week 1-2) - 2 weeks

**Deliverables:**
- ✅ Telegram bot setup with webhook
- ✅ Database schema (AlertEscalation table)
- ✅ API endpoint: POST /api/alerts/{id}/escalate
- ✅ Basic Telegram message formatting
- ✅ Button-based interactions
- ✅ L1→L2 escalation working

**Code to write:**
```
- /lib/telegram/client.ts (TelegramClient class)
- /app/api/telegram/webhook/route.ts (webhook handler)
- /app/api/alerts/[id]/escalate/route.ts (escalation endpoint)
- Prisma migration (create AlertEscalation table)
- /components/AlertEscalateButton.tsx
```

**Estimated hours:** 40-50 hours

### Phase 2: L2→L3 + Response Handling (Week 3) - 1 week

**Deliverables:**
- ✅ L2→L3 escalation chain
- ✅ Response text capture
- ✅ Message threading
- ✅ Timeout handling

**Code to write:**
```
- AlertEscalationResponse table schema
- Message parsing logic
- /lib/telegram/handlers.ts (callback handlers)
- Response storage pipeline
- Timeout job scheduler
```

**Estimated hours:** 30-40 hours

### Phase 3: UI & Dashboard Integration (Week 4) - 1 week

**Deliverables:**
- ✅ Escalation history UI
- ✅ Status badges
- ✅ Response timeline view
- ✅ Telegram linking UI

**Code to write:**
```
- /components/EscalationHistory.tsx
- /components/TelegramSetup.tsx
- /app/api/users/telegram-link/route.ts
- Dashboard stats & metrics
```

**Estimated hours:** 25-30 hours

### Phase 4: Security & Hardening (Week 5-6) - 2 weeks

**Deliverables:**
- ✅ Audit logging
- ✅ Authorization verification
- ✅ Sensitive data redaction
- ✅ Rate limiting
- ✅ Webhook signature validation

**Code to write:**
```
- Audit middleware
- Rate limiter
- SecurityValidation class
- Encryption for sensitive fields
- Incident response procedures
```

**Estimated hours:** 40-50 hours

### Phase 5: Monitoring & Observability (Week 7-8) - 2 weeks

**Deliverables:**
- ✅ Bot health checks
- ✅ Performance monitoring
- ✅ Error alerting
- ✅ Dashboard metrics
- ✅ Log aggregation

**Code to write:**
```
- Health check endpoint
- Prometheus metrics export
- Error tracking (Sentry)
- Grafana dashboards
- Alert thresholds
```

**Estimated hours:** 30-40 hours

### Timeline Summary

| Phase | Duration | Cumulative | Focus |
|-------|----------|-----------|-------|
| MVP | 2 weeks | 2 weeks | Basic escalation |
| Response | 1 week | 3 weeks | Multi-level chain |
| UI | 1 week | 4 weeks | User interface |
| Security | 2 weeks | 6 weeks | Production-ready |
| Monitoring | 2 weeks | 8 weeks | Operational |

**Total MVP (Phase 1-2): 3 weeks**  
**Total Production-Grade: 8 weeks**

---

## 10. RISK ANALYSIS & MITIGATION

### Risk 1: Message Delivery Failures

**Probability:** Medium | **Impact:** High

**Scenario:** Telegram down, bot offline, network issues

**Mitigation:**
```typescript
// 1. Retry logic with exponential backoff
async function sendWithRetry(
  messageFunc: () => Promise<any>,
  maxRetries = 3
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await messageFunc();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}

// 2. Queue undelivered messages
await queue.add({
  type: 'send_escalation',
  escalationId,
  retryCount: 0
});

// 3. Fallback to email if Telegram fails after 3 retries
if (i === maxRetries) {
  await sendEmailFallback(escalation);
}
```

### Risk 2: Bot Token Leak

**Probability:** Low | **Impact:** Critical

**Mitigation:**
```
- Store token in .env (never in code)
- Rotate token if leak suspected
- Use GitHub secrets for CI/CD
- Monitor bot for suspicious activity
- Kill-switch to disable escalations
```

### Risk 3: User Privacy / Data Leakage

**Probability:** Medium | **Impact:** High

**Mitigation:**
- Redact sensitive data in Telegram messages
- Auto-delete old messages (24 hours)
- Require Telegram authentication
- Log all message sending
- Encrypt responses in database

### Risk 4: Scalability Issues

**Probability:** Low (until 1000+ analysts) | **Impact:** High

**Mitigation:**
```
- Message queuing (pg-boss)
- Database connection pooling
- Caching layer (Redis)
- Monitor response times
- Load testing before scale
```

### Risk 5: Analyst Overwhelm

**Probability:** High | **Impact:** Medium

**Mitigation:**
```typescript
// Auto-batch escalations during busy periods
const escalationRate = await getEscalationRate(); // per minute
if (escalationRate > 10) {
  // Send batched summary instead of individual messages
  await sendBatchedEscalationSummary();
} else {
  // Send individual messages
  await sendIndividualEscalation();
}
```

---

## 11. COST ANALYSIS

### Infrastructure Costs

| Component | Cost | Notes |
|-----------|------|-------|
| **Telegram API** | $0/mo | 100% free |
| **Next.js hosting** | Already budgeted | No new cost |
| **Database (Postgres)** | Already budgeted | Minimal additional usage |
| **Message queuing** | $0/mo | Built into Postgres with pg-boss |
| **Monitoring** | $0-50/mo | Optional (Sentry free tier available) |
| **Domain/SSL** | Already budgeted | Webhook needs HTTPS |

**Total Additional Cost:** $0-50/mo ✅

### Development Costs

| Phase | Effort | Cost @ $100/hr |
|-------|--------|-----------------|
| MVP | 80 hrs | $8,000 |
| Production-Grade | 200 hrs | $20,000 |

---

## 12. RECOMMENDED ARCHITECTURE

### Optimal Setup for Your System

```
┌─────────────────────────────────────────────────────┐
│  SOC Dashboard (Next.js)                             │
│                                                      │
│  POST /api/alerts/{id}/escalate                     │
│  ↓                                                   │
│  [Create Escalation Record in DB]                   │
│  ↓                                                   │
│  [Add to pg-boss queue]                             │
│  ↓                                                   │
│  [Job processes in background]                      │
│  ├→ Fetch alert details                             │
│  ├→ Fetch target analyst telegram ID                │
│  ├→ Call Telegram API (20-300ms latency)           │
│  ├→ Store message ID in DB                          │
│  └→ Audit log entry                                │
│                                                     │
│  POST /api/telegram/webhook (TLS required)         │
│  ↓                                                  │
│  [Receive callback_query or message]               │
│  ↓                                                  │
│  [Verify Chat ID against DB]                       │
│  ↓                                                  │
│  [Parse action, update DB]                         │
│  ↓                                                  │
│  [Return 200 OK immediately]                       │
│  ↓                                                  │
│  [Send response message async]                     │
│  ↓                                                  │
│  [Optional: Webhook back to dashboard]             │
│                                                     │
└─────────────────────────────────────────────────────┘

Database (PostgreSQL):
- alertEscalation
- alertEscalationResponse  
- alertEscalationAudit
- alertEscalationSession (optional)

Message Flow:
1. Synchronous: Store in DB (fast)
2. Asynchronous: Send to Telegram (via queue)
3. Event-driven: Webhook callback handling
```

### Required Configuration

```bash
# .env
TELEGRAM_BOT_TOKEN=1234567890:ABCDEFGHIJklmnopqrstuvwxyz
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=your-secret-path-token

# Database
DATABASE_URL=postgresql://user:pass@localhost/soc_dashboard

# Job queue
PG_BOSS_CONNECTION=postgresql://user:pass@localhost/soc_dashboard
```

---

## 13. SUCCESS METRICS

### KPIs to Track

```
1. Escalation Latency
   - Target: <2 second message delivery
   - Measure: Message sent - Escalation created
   
2. Response Rate
   - Target: >90% respond within 15 min
   - Measure: Responses / Total escalations
   
3. System Reliability
   - Target: 99.9% uptime
   - Measure: Failed messages / Total escalations
   
4. Analyst Adoption
   - Target: >80% use Telegram
   - Measure: Active Telegram users / Total analysts
   
5. Throughput
   - Target: Support 500+ concurrent escalations
   - Measure: Messages/sec, queries/sec
```

---

## 14. CONCLUSION & RECOMMENDATION

### Overall Assessment

| Category | Rating | Comment |
|----------|--------|---------|
| **Feasibility** | ⭐⭐⭐⭐⭐ | Proven technology, no blockers |
| **Complexity** | ⭐⭐⭐ Medium | Moderate effort, well-documented |
| **ROI** | ⭐⭐⭐⭐⭐ | Low cost, high impact |
| **Risk** | ⭐⭐ Low | No critical dependencies |
| **Adoption** | ⭐⭐⭐⭐⭐ | Very high (mobile notifications) |
| **Scalability** | ⭐⭐⭐⭐ | Support 1000+ analysts easily |

### **✅ RECOMMENDATION: PROCEED WITH IMPLEMENTATION**

**Next Steps:**
1. ✅ Approve Telegram bot architecture
2. ✅ Create bot on Telegram BotFather
3. ✅ Design UI for "Escalate" buttons in dashboard
4. ✅ Create migration files for new tables
5. ✅ Assign development team (Phase 1: 1 dev)
6. ✅ Set up CI/CD for webhook deployment
7. ✅ Establish monitoring/alerting

### Expected Outcomes

**After 8 weeks of implementation:**
- ✅ Automated alert escalation via Telegram
- ✅ <2 second notification delivery
- ✅ Complete audit trail for compliance
- ✅ 90%+ analyst adoption
- ✅ Reduced mean-time-to-response (MTTR)
- ✅ Better escalation transparency
- ✅ Zero additional infrastructure cost

**ROI:** High adoption + Low cost = Strong business case ✅

---

## 15. APPENDIX: CODE TEMPLATES

### A.1 Telegram Client Library

See section 4.3 for full implementation.

### A.2 Alert Escalation Endpoint

See section 4.4 for full implementation.

### A.3 Webhook Handler Template

```typescript
// /app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const update = await request.json() as any;
    
    // Validate webhook path has secret
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const pathSecret = request.nextUrl.pathname.split('/').pop();
    
    if (pathSecret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Handle callback query (button clicks)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    // Handle text messages
    if (update.message?.text) {
      await handleMessage(update.message);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleCallbackQuery(query: any) {
  // E.g., callback_data = "esc_abc123_escalate"
  const [prefix, escalationId, action] = query.data.split('_');
  
  // Find escalation
  const escalation = await prisma.alertEscalation.findUnique({
    where: { id: escalationId }
  });

  if (!escalation) {
    // Answer error callback
    return; // Handle gracefully
  }

  // Update status based on action
  if (action === 'escalate') {
    await prisma.alertEscalation.update({
      where: { id: escalationId },
      data: { status: 'escalated' }
    });
  } else if (action === 'dismiss') {
    await prisma.alertEscalation.update({
      where: { id: escalationId },
      data: { status: 'closed', closedAt: new Date() }
    });
  }
}

async function handleMessage(message: any) {
  // Find escalation by reply_to_message_id
  const repliesTo = message.reply_to_message?.message_id;
  
  if (!repliesTo) return; // Not replying to an escalation

  const escalation = await prisma.alertEscalation.findUnique({
    where: { telegramMessageId: BigInt(repliesTo) }
  });

  if (!escalation) return;

  // Save response
  await prisma.alertEscalationResponse.create({
    data: {
      escalationId: escalation.id,
      responseText: message.text,
      telegramMessageId: BigInt(message.message_id),
      telegramUserId: BigInt(message.from.id)
    }
  });
}
```

### A.4 Message Formatter

```typescript
// /lib/telegram/formatters.ts
export function formatEscalationMessage(alert: any, escalation: any): string {
  return `
🚨 <b>ALERT ESCALATION</b>

<b>Alert ID:</b> ${alert.id.slice(0, 8)}
<b>Title:</b> ${escapeHtml(alert.title)}
<b>Severity:</b> ${getSeverityEmoji(alert.severity)} ${alert.severity}
<b>Escalated by:</b> ${escalation.escalatedBy.name}
<b>Reason:</b> ${escapeHtml(escalation.escalationReason)}

<b>Timestamp:</b> ${new Date(alert.createdAt).toLocaleString()}

<i>Reply with your analysis or use buttons below.</i>
  `.trim();
}

function getSeverityEmoji(severity: string): string {
  const emojis: Record<string, string> = {
    Critical: '🔴',
    High: '🟠',
    Medium: '🟡',
    Low: '🟢'
  };
  return emojis[severity] || '⚪';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-13  
**Status:** Ready for Implementation ✅
