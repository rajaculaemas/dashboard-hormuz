/**
 * Reply to Escalation Endpoint
 * Allows L1 to reply to L2 response
 * POST /api/alerts/{id}/escalation/{escalationId}/reply
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import prisma from "@/lib/prisma"
import fetch from "node-fetch"

/**
 * Send reply message to Telegram recipient - AS REPLY to maintain thread
 * Includes "Reply Analysis" button so L2 can easily respond
 */
async function sendReplyToTelegram(
  chatId: string,
  escalationId: string,
  senderName: string,
  replyText: string,
  replyToMessageId?: string // ← Last message to reply to, maintains conversation thread
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
    if (!TELEGRAM_BOT_TOKEN) {
      return { success: false, error: "Telegram bot token not configured" }
    }

    const message = `📝 <b>L1 Reply</b>

<b>From:</b> ${senderName}
<b>Escalation ID:</b> <code>${escalationId}</code>

<b>Reply:</b>
${replyText}`

    const messageBody: any = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    }

    // Include reply_to_message_id if provided to maintain conversation thread
    if (replyToMessageId) {
      messageBody.reply_to_message_id = parseInt(replyToMessageId)
    }

    // Add inline keyboard with "Reply Analysis" button
    // This button embeds the escalationId so L2 knows which escalation to reply to
    messageBody.reply_markup = {
      inline_keyboard: [
        [
          {
            text: "💬 Reply Analysis",
            callback_data: `reply_esc_${escalationId}`,
          },
        ],
      ],
    }

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messageBody),
    })

    const data = (await response.json()) as any
    if (!data.ok) {
      return { success: false, error: data.description }
    }

    return { success: true, messageId: String(data.result.message_id) }
  } catch (error) {
    console.error("[Send Reply to Telegram] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send reply to Telegram",
    }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; escalationId: string }> }
) {
  try {
    // Check authentication
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: alertId, escalationId } = await params
    const body = await request.json()
    const { reply, fileIds = [] } = body

    // Validate required fields
    if (!reply || reply.trim().length === 0) {
      return NextResponse.json(
        { error: "Reply text is required" },
        { status: 400 }
      )
    }

    if (reply.length < 10) {
      return NextResponse.json(
        { error: "Reply must be at least 10 characters" },
        { status: 400 }
      )
    }

    // Fetch escalation with all responses (sorted by creation time)
    const escalation = await prisma.alertEscalation.findUnique({
      where: { id: escalationId },
      include: {
        alert: true,
        escalatedBy: true,
        escalatedTo: true,
        responses: {
          orderBy: { createdAt: "desc" }, // Most recent first
        },
      },
    })

    if (!escalation) {
      return NextResponse.json(
        { error: "Escalation not found" },
        { status: 404 }
      )
    }

    // Verify alert matches
    if (escalation.alertId !== alertId) {
      return NextResponse.json(
        { error: "Alert ID mismatch" },
        { status: 400 }
      )
    }

    // Verify user is L1 who created the escalation
    if (user.userId !== escalation.escalatedByUserId) {
      return NextResponse.json(
        { error: "Only the L1 who created this escalation can reply" },
        { status: 403 }
      )
    }

    // Verify there's a response to reply to (from L2)
    if (!escalation.responses || escalation.responses.length === 0) {
      return NextResponse.json(
        { error: "No L2 response to reply to" },
        { status: 400 }
      )
    }

    // Find the last response from L2 to reply to (for maintaining thread in Telegram)
    const lastL2Response = escalation.responses[0] // First item is most recent (sorted by default)
    const replyToMessageId = lastL2Response?.telegramMessageId

    // Send reply to L2 analyst via Telegram as a reply to maintain conversation thread
    let telegramMessageId: string | undefined
    if (escalation.escalatedTo?.telegramChatId) {
      const telegramResult = await sendReplyToTelegram(
        escalation.escalatedTo.telegramChatId,
        escalationId,
        user.name || "L1 Analyst",
        reply,
        replyToMessageId // Pass L2's last message ID so L1's reply is threaded
      )

      if (telegramResult.success) {
        telegramMessageId = telegramResult.messageId
      } else {
        console.warn(`[Reply] Failed to send to Telegram: ${telegramResult.error}`)
        // Don't fail the request, just log warning
      }
    }

    // Create reply response record with messageId
    const responseRecord = await prisma.alertEscalationResponse.create({
      data: {
        escalationId,
        responderId: user.userId,
        analysis: reply,
        conclusion: "L1_REPLY",
        action: "replied",
        telegramMessageId,
      },
      include: {
        responder: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    // Update escalation status to "replied" if it's still pending
    // This marks that someone has replied to the initial escalation
    if (escalation.status === "pending") {
      await prisma.alertEscalation.update({
        where: { id: escalationId },
        data: {
          status: "replied",
          repliedAt: new Date(),
        },
      })
    }

    return NextResponse.json(
      {
        success: true,
        message: "Reply sent successfully",
        response: responseRecord,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[Reply to Escalation] Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create reply",
      },
      { status: 500 }
    )
  }
}
