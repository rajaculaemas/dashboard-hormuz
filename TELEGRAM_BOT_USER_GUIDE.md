# Telegram Bot Escalation - L2 Analyst Guide

## How the Telegram Bot Works (No Public IP Needed!)

The SOC Dashboard now uses **Telegram polling mode** instead of webhooks. This means:
- ✅ No need for public IP or domain
- ✅ No ngrok or tunneling required  
- ✅ Messages are fetched automatically every 2 seconds
- ✅ Works on localhost or any network

## Step 1: Start the Bot

First, L2 analysts must open Telegram and start the bot by sending `/start`:

1. **Find the bot:** Search for `soc247` in Telegram
   - Bot username: `@soc247_bot`
   - Or use link: `https://t.me/soc247_bot`

2. **Send /start command:**
   - Tap the `START` button or type `/start` and send
   - Bot will confirm: "✅ Connected Successfully!"
   - Your account is now linked to receive escalations

## Step 2: Receive Escalation Alerts

When L1 escalates an alert to you, you'll receive:

```
🚀 ALERT ESCALATION - L1 → L2

Alert ID: 2735
Title: ⚠️ Wazuh Agent Unavailable — Disconnected or Stopped
Severity: Low
Source: Socfortress

─────────────────────────────
📋 L1 ANALYSIS:
testing escalate alert

─────────────────────────────
💬 How to respond:
1. Analyze the alert
2. Reply to this message with your analysis
3. Use format:
   ANALYSIS: [your detailed analysis]
   CONCLUSION: [verdict]

⏱️ Response required within 30 minutes
```

Two buttons will appear:
- **📝 Reply with Analysis** - Click to provide your analysis
- **🚀 Escalate to L3** - Click to escalate to L3 (after you provide analysis)

## Step 3: Provide Your Analysis

### Option A: Using the "Reply with Analysis" Button

1. **Click the button:** "📝 Reply with Analysis"
2. **Bot will prompt you:** Shows the required format
3. **Reply to the escalation message** with your analysis:

```
ANALYSIS: The agent has not reported any metrics for 15 minutes. 
Checked the agent logs and found a network connectivity issue. 
Need to restart network interface.

CONCLUSION: PATCH_IMMEDIATELY
```

### Option B: Direct Reply (Without Button)

You can **reply directly** to the escalation message with the same format:

```
ANALYSIS: Detailed analysis of what you found
CONCLUSION: [your verdict]
```

## Valid Verdicts

Choose ONE of these conclusions:

| Verdict | Meaning |
|---------|---------|
| **PATCH_IMMEDIATELY** | Apply fix immediately, this is urgent |
| **REQUIRES_INVESTIGATION** | Need further investigation, not immediately clear |
| **FALSE_POSITIVE** | This is not a real security threat |
| **DISMISS** | Can be safely ignored |
| **ESCALATE_L3** | (L2 only) Escalate to L3 for further analysis |

## Example: Complete Flow

```
📝 You receive escalation message

🔔 ALERT: Shellshock vulnerability detected on web server

Click: "📝 Reply with Analysis"
↓
✍️ Bot prompts for analysis format
↓
You reply:
ANALYSIS: Checked web server logs. Vulnerable version of bash is running.
Attempted exploit in logs from suspicious IP 192.168.1.100. 
Need to patch immediately.

CONCLUSION: PATCH_IMMEDIATELY
↓
✅ Bot confirms: "Analysis Received. Verdict: PATCH_IMMEDIATELY"
↓
Your analysis appears in SOC Dashboard under Escalation tab
↓
L1/Admin can now see your assessment and take action
```

## Step 4: Escalate to L3 (Optional)

If you need further help:

1. **Provide your analysis first** (required - see Step 3)
2. **Click the "🚀 Escalate to L3" button**
3. Bot will send your analysis to L3 analyst
4. L3 will receive the alert with your L1 and L2 analysis

## Troubleshooting

### "Bot is not responding to my message"
- ✅ Make sure you **REPLY** to the escalation message (not just send a new message)
- ✅ Use the exact format: `ANALYSIS: ...\nCONCLUSION: ...`
- ✅ Don't use extra spaces or different formatting

### "I clicked the button but nothing happened"
- ✅ Wait a few seconds (bot polls every 2 seconds)
- ✅ Make sure you're in the chat with the bot
- ✅ Try again or refresh your phone

### "My analysis is not appearing in the dashboard"
- ✅ Wait 5-10 seconds for the system to process
- ✅ In the alert's "Escalation" tab, click the **"Refresh"** button to reload
- ✅ Check that your reply format was correct

### "I didn't receive the escalation alert"
- ✅ Did you send `/start` to the bot initially?
- ✅ Make sure you're added as L2 analyst in the system
- ✅ Check your Telegram notification settings

## Tips

- 📱 **Keep Telegram open** - Bot sends messages in real-time
- ⏰ **30-minute timeout** - If you don't respond within 30 minutes, it auto-escalates to L3
- 📝 **Be detailed** - Provide thorough analysis for L1/L3 to understand your thoughts
- 🔔 **Enable notifications** - So you get instant alerts when escalations arrive

## Getting Help

If you encounter issues, contact the SOC admin at `admin@soc-dashboard.local`
