/**
 * Telegram Webhook Endpoint
 * Receives messages from Telegram bot and processes escalation responses
 */

import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { TelegramEscalationService } from "@/lib/services/telegram-escalation"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Verify Telegram secret token (if configured)
    const telegramToken = request.headers.get("X-Telegram-Bot-API-Secret-Token")
    if (
      process.env.TELEGRAM_WEBHOOK_SECRET &&
      telegramToken !== process.env.TELEGRAM_WEBHOOK_SECRET
    ) {
      console.warn("Invalid Telegram webhook secret token")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Handle ping/test from Telegram
    if (!body.message && !body.callback_query) {
      return NextResponse.json({ ok: true })
    }

    // Process callback query (button clicks)
    if (body.callback_query) {
      return handleCallbackQuery(body.callback_query)
    }

    // Process text message
    if (body.message?.text) {
      return handleTextMessage(body.message)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error in Telegram webhook:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Handle text messages from users (escalation responses and /start)
 */
async function handleTextMessage(message: any) {
  try {
    const chatId = String(message.chat.id)
    const text = message.text || ""
    const messageId = message.message_id
    const replyToMessageId = message.reply_to_message?.message_id
    const username = message.from?.username
    const firstName = message.from?.first_name || ""

    console.log(`[Telegram] Received message from chat ${chatId}: ${text.substring(0, 50)}...`)

    // Handle /start command
    if (text.toLowerCase() === "/start") {
      return handleStartCommand(chatId, username, firstName)
    }

    // User must reply to an escalation message (reply_to_message indicates this)
    if (!replyToMessageId) {
      return NextResponse.json({ ok: true })
    }

    // Find the escalation by telegram message ID
    const escalation = await prisma.alertEscalation.findFirst({
      where: {
        status: "pending",
        telegramChatId: chatId,
        telegramMessageId: String(replyToMessageId),
      },
      include: {
        alert: true,
        escalatedTo: true,
      },
    })

    if (!escalation) {
      console.warn(`[Telegram] No escalation found for message ${replyToMessageId}`)
      return NextResponse.json({ ok: true })
    }

    // Parse the response
    const parsed = TelegramEscalationService.parseAnalystResponse(text)

    if (parsed.error) {
      // Send error message back
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `❌ ${parsed.error}`,
          reply_to_message_id: messageId,
        }),
      })
      return NextResponse.json({ ok: true })
    }

    // Save response
    const response = await prisma.alertEscalationResponse.create({
      data: {
        escalationId: escalation.id,
        responderId: escalation.escalatedToUserId,
        analysis: parsed.analysis || "",
        conclusion: parsed.conclusion || "",
        action: parsed.shouldEscalate ? "escalate" : "reply",
        telegramMessageId: String(messageId),
      },
      include: {
        responder: true,
      },
    })

    // Update escalation status
    await prisma.alertEscalation.update({
      where: { id: escalation.id },
      data: {
        status: parsed.shouldEscalate ? "escalated" : "replied",
        repliedAt: new Date(),
        l2Analysis: escalation.escalationLevel === 1 ? parsed.analysis : undefined,
        l3Analysis: escalation.escalationLevel === 2 ? parsed.analysis : undefined,
      },
    })

    // Send confirmation message with next steps
    let confirmMessage = `✅ <b>Analysis Received</b>\n\n`
    confirmMessage += `Your analysis has been saved:\n`
    confirmMessage += `• <b>Verdict:</b> ${parsed.conclusion}\n\n`

    if (escalation.escalationLevel === 1) {
      // L2 response
      confirmMessage += `<b>Next Steps:</b>\n`
      confirmMessage += `• Click the <b>"🚀 Escalate to L3"</b> button below if you need further help\n`
      confirmMessage += `• Or your analysis will be reviewed by L1\n\n`
      confirmMessage += `<i>You have 30 minutes to respond</i>`
    } else {
      // L3 response
      confirmMessage += `<b>Next Steps:</b>\n`
      confirmMessage += `• Your analysis is being escalated to Management\n`
      confirmMessage += `• The incident will be ready for action\n\n`
      confirmMessage += `<i>Thank you for your quick response!</i>`
    }

    const confirmResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: confirmMessage,
        parse_mode: "HTML",
        reply_to_message_id: messageId,
      }),
    })

    const confirmData = (await confirmResponse.json()) as any
    if (!confirmData.ok) {
      console.error(
        `[Telegram] Failed to send confirmation: ${confirmData.description}`,
      )
    }

    // If escalating to L3, find L3 and send escalation
    if (parsed.shouldEscalate && escalation.escalationLevel === 1) {
      await escalateToL3(escalation, response)
    } else {
      // Notify admin
      await notifyAdminOfResponse(escalation, response)
    }

    // Create audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId: escalation.id,
        alertId: escalation.alertId,
        event: response.action === "escalate" ? "re_escalated" : "replied",
        details: {
          responderId: response.responderId,
          responderName: response.responder.name,
          analysis: response.analysis.substring(0, 200),
        },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error handling text message:", error)
    return NextResponse.json({ ok: true }) // Still return ok to prevent Telegram retry
  }
}

/**
 * Handle /start command - Register user with Telegram chat ID
 */
async function handleStartCommand(chatId: string, username?: string, firstName?: string) {
  try {
    console.log(`[Telegram] /start command from chat ${chatId}, username: ${username}`)

    // Try to find user by Telegram username
    let user = null
    if (username) {
      // First try to find by email pattern with username
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { name: { contains: username, mode: "insensitive" } },
            { email: { contains: username, mode: "insensitive" } },
          ],
        },
      })
    }

    // If not found and we have a first name, try searching for it
    if (!user && firstName) {
      user = await prisma.user.findFirst({
        where: {
          name: { contains: firstName, mode: "insensitive" },
        },
      })
    }

    if (!user) {
      // Send message asking user to contact admin
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Hi ${firstName || "there"}! 👋\n\nI couldn't find your account in the SOC Dashboard. Please contact your administrator to link your account to this Telegram ID.`,
        }),
      })
      return NextResponse.json({ ok: true })
    }

    // Update user's chat ID
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId },
    })

    // Send success message
    const message = `✅ <b>Connected Successfully!</b>

Your Telegram account is now linked to the SOC Dashboard.

<b>Your Info:</b>
• Name: ${updatedUser.name}
• Position: ${updatedUser.position || "Not set"}
• Email: ${updatedUser.email}

You will now receive escalation notifications here. Just reply to alerts when they're escalated to you!`

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    })

    console.log(`[Telegram] User ${updatedUser.email} linked to chat ${chatId}`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error handling /start command:", error)
    return NextResponse.json({ ok: true })
  }
}

/**
 * Handle callback queries (button clicks)
 */
async function handleCallbackQuery(callbackQuery: any) {
  try {
    const callbackId = callbackQuery.id
    const chatId = String(callbackQuery.message?.chat?.id)
    const messageId = callbackQuery.message?.message_id
    const data = callbackQuery.data
    const username = callbackQuery.from?.username
    const firstName = callbackQuery.from?.first_name

    console.log(`[Telegram] Callback query: ${data} from chat ${chatId}`)

    // Handle "Escalate to L3" button
    if (data === "escalate_l3") {
      // Find escalation by message ID
      const escalation = await prisma.alertEscalation.findFirst({
        where: {
          status: "pending",
          telegramChatId: chatId,
          telegramMessageId: String(messageId),
        },
        include: {
          alert: true,
          escalatedTo: true,
        },
      })

      if (!escalation) {
        // Answer callback query with error
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: callbackId,
            text: "❌ Escalation not found",
            show_alert: true,
          }),
        })
        return NextResponse.json({ ok: true })
      }

      // Require analysis before escalation
      if (!escalation.l2Analysis) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: callbackId,
            text: "⚠️ Please provide your analysis first before escalating",
            show_alert: true,
          }),
        })
        return NextResponse.json({ ok: true })
      }

      // Escalate to L3
      await escalateToL3(escalation, {
        analysis: escalation.l2Analysis,
        responder: escalation.escalatedTo,
      })

      // Answer callback query with success
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackId,
          text: "✅ Alert escalated to L3",
        }),
      })

      // Edit message to show escalated status
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: escalation.alert?.title + "\n\n✅ <b>Escalated to L3</b>",
          parse_mode: "HTML",
        }),
      })

      return NextResponse.json({ ok: true })
    }

    // Handle "Reply with Analysis" button
    if (data.startsWith("reply_esc_")) {
      // Send prompt for analysis
      const messageText = `📋 <b>Provide Your Analysis</b>

Please reply with your analysis in this format:

<code>ANALYSIS: [your detailed analysis]
CONCLUSION: [verdict]</code>

<b>Valid verdicts:</b>
• PATCH_IMMEDIATELY - Apply patch immediately
• REQUIRES_INVESTIGATION - Needs further investigation
• FALSE_POSITIVE - Not a real threat
• DISMISS - Dismiss the alert
• ESCALATE_L3 - Escalate to L3 (only for L2)`

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: "HTML",
          reply_to_message_id: messageId,
        }),
      })

      // Answer callback query
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackId,
          text: "✍️ Please provide your analysis in the message above",
        }),
      })

      return NextResponse.json({ ok: true })
    }

    // Unknown callback
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error handling callback query:", error)
    return NextResponse.json({ ok: true })
  }
}

/**
 * Escalate to L3 after L2 responds with ESCALATE_L3
 */
async function escalateToL3(parentEscalation: any, l2Response: any) {
  try {
    // Find L3 user (for now, just get first user with L3 position)
    // In production, you might want to implement load balancing or specific assignment rules
    const l3User = await prisma.user.findFirst({
      where: {
        position: "Analyst L3",
        status: "active",
        telegramChatId: { not: null },
      },
    })

    if (!l3User || !l3User.telegramChatId) {
      console.error("No available L3 analyst found")
      // Notify admin instead
      await notifyAdminOfTimeout(parentEscalation, "L3_NOT_AVAILABLE")
      return
    }

    // Create new escalation record for L3
    const l3Escalation = await prisma.alertEscalation.create({
      data: {
        alertId: parentEscalation.alertId,
        escalationLevel: 2,
        escalatedByUserId: parentEscalation.escalatedToUserId, // L2 escalates
        escalatedToUserId: l3User.id,
        l1Analysis: parentEscalation.l1Analysis,
        l2Analysis: l2Response.analysis,
        status: "pending",
        telegramChatId: l3User.telegramChatId,
        timeoutAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      },
    })

    // Send escalation message to L3
    const result = await TelegramEscalationService.sendEscalationMessage(
      l3User.telegramChatId,
      parentEscalation.alert,
      2, // escalationLevel = 2 for L3
      {
        l1: parentEscalation.l1Analysis,
        l2: l2Response.analysis,
      },
    )

    if (result.success && result.messageId) {
      await prisma.alertEscalation.update({
        where: { id: l3Escalation.id },
        data: { telegramMessageId: result.messageId },
      })

      console.log(`[Escalation] Alert ${parentEscalation.alertId} escalated to L3 (${l3User.name})`)
    } else {
      console.error(`Failed to send L3 message: ${result.error}`)
    }

    // Create audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId: l3Escalation.id,
        alertId: parentEscalation.alertId,
        event: "re_escalated",
        details: {
          fromLevel: "L2",
          toLevel: "L3",
          l3UserId: l3User.id,
          l3UserName: l3User.name,
        },
      },
    })
  } catch (error) {
    console.error("Error escalating to L3:", error)
  }
}

/**
 * Notify admin of escalation response
 */
async function notifyAdminOfResponse(escalation: any, response: any) {
  try {
    const adminUser = await prisma.user.findFirst({
      where: {
        email: "admin@soc-dashboard.local",
        telegramChatId: { not: null },
      },
    })

    if (!adminUser || !adminUser.telegramChatId) {
      console.warn("Admin user not found or Telegram not linked")
      return
    }

    await TelegramEscalationService.sendAdminNotification(adminUser.telegramChatId, {
      alertId: escalation.alertId,
      alertTitle: escalation.alert.title,
      respondedLevel: escalation.escalationLevel === 1 ? "L2" : "L3",
      responderName: response.responder.name || "Unknown",
      action: response.action as "reply" | "escalate",
    })

    // Create audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId: escalation.id,
        alertId: escalation.alertId,
        event: "admin_notified",
        details: {
          reason: "escalation_resolved",
          adminId: adminUser.id,
        },
      },
    })
  } catch (error) {
    console.error("Error notifying admin:", error)
  }
}

/**
 * Notify admin of timeout
 */
async function notifyAdminOfTimeout(escalation: any, reason: string) {
  try {
    const adminUser = await prisma.user.findFirst({
      where: {
        email: "admin@soc-dashboard.local",
        telegramChatId: { not: null },
      },
    })

    if (!adminUser || !adminUser.telegramChatId) {
      console.warn("Admin user not found or Telegram not linked")
      return
    }

    const levelText = escalation.escalationLevel === 1 ? "L2" : "L3"
    const nextAction =
      escalation.escalationLevel === 1 ? "Escalating to L3" : "Manual escalation required to Manager/GM"

    const messageText = `
<b>⏰ ESCALATION TIMEOUT</b>

<b>Alert:</b> ${escalation.alert?.title}
<b>Level:</b> ${levelText}

❌ No response from ${levelText} within 30 minutes

<b>Action:</b> ${nextAction}

<a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/alerts/${escalation.alertId}">→ View Alert</a>
    `.trim()

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminUser.telegramChatId,
        text: messageText,
        parse_mode: "HTML",
      }),
    })

    // Create audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId: escalation.id,
        alertId: escalation.alertId,
        event: "timeout",
        details: {
          level: levelText,
          reason,
        },
      },
    })
  } catch (error) {
    console.error("Error notifying admin of timeout:", error)
  }
}
