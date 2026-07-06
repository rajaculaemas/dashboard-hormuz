/**
 * Close/Reopen Escalation Endpoint
 * Allows L1 to close or reopen an escalation
 * POST /api/alerts/{id}/escalation/{escalationId}/close-reopen
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import prisma from "@/lib/prisma"

interface CloseReopenRequest {
  action: "close" | "reopen" // close or reopen
  reason?: string // Optional reason for closing
}

/**
 * Send message to Telegram chat
 */
async function sendTelegramMessage(chatId: string, message: string): Promise<{ success: boolean; error?: string }> {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
    if (!TELEGRAM_BOT_TOKEN) {
      return { success: false, error: "Telegram bot token not configured" }
    }

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    })

    const data = (await response.json()) as any
    if (!data.ok) {
      return { success: false, error: data.description }
    }

    return { success: true }
  } catch (error) {
    console.error("[Close Escalation] Error sending Telegram message:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
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
    const body: CloseReopenRequest = await request.json()
    const { action, reason } = body

    // Validate action
    if (!action || !["close", "reopen"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'close' or 'reopen'" },
        { status: 400 }
      )
    }

    // Verify escalation exists
    const escalation = await prisma.alertEscalation.findUnique({
      where: { id: escalationId },
      include: {
        alert: true,
        escalatedTo: true,
        escalatedBy: { select: { telegramChatId: true } },
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

    // Only L1 (escalated by user) can close/reopen escalations
    if (user.userId !== escalation.escalatedByUserId) {
      return NextResponse.json(
        { error: "Only the initiating analyst can close/reopen escalations" },
        { status: 403 }
      )
    }

    if (action === "close") {
      // Can only close if currently open
      if (escalation.closedAt !== null) {
        return NextResponse.json(
          { error: "Escalation is already closed" },
          { status: 400 }
        )
      }

      // Close the escalation
      const closedEscalation = await prisma.alertEscalation.update({
        where: { id: escalationId },
        data: {
          status: "closed",
          closedAt: new Date(),
          closedByUserId: user.userId,
        },
        include: {
          escalatedTo: true,
          responses: { include: { responder: true } },
        },
      })

      // Send notification to L2/L3 via Telegram
      const telegramResult = await sendTelegramMessage(
        escalation.escalatedTo.telegramChatId,
        `🔒 <b>Escalation Closed</b>\n\n` +
        `Alert ID: <code>${escalation.alert?.externalId || alertId}</code>\n` +
        `Closed by: <b>${user.name}</b>\n` +
        `${reason ? `Reason: ${reason}\n\n` : ""}` +
        `The discussion on this escalation has been concluded. ` +
        `You can still view the conversation history in the dashboard.`
      )

      if (!telegramResult.success) {
        console.warn(`[Escalation] Failed to send Telegram notification to L2: ${telegramResult.error}`)
        // Don't fail the request if Telegram fails
      }

      // Create audit log
      await prisma.alertEscalationAudit.create({
        data: {
          escalationId,
          alertId,
          event: "closed",
          details: {
            closedBy: user.userId,
            closedByName: user.name,
            reason: reason || "No reason provided",
          },
        },
      })

      console.log(`[Escalation] Escalation closed: ${escalationId} by ${user.name}`)

      return NextResponse.json({
        success: true,
        message: "Escalation closed successfully",
        escalation: {
          id: closedEscalation.id,
          status: closedEscalation.status,
          closedAt: closedEscalation.closedAt,
        },
      })
    } else if (action === "reopen") {
      // Can only reopen if currently closed
      if (escalation.closedAt === null) {
        return NextResponse.json(
          { error: "Escalation is not closed" },
          { status: 400 }
        )
      }

      // Reopen the escalation
      const reopenedEscalation = await prisma.alertEscalation.update({
        where: { id: escalationId },
        data: {
          status: "replied",
          closedAt: null,
          closedByUserId: null,
        },
        include: {
          escalatedTo: true,
          responses: { include: { responder: true } },
        },
      })

      // Send notification to L2/L3 via Telegram
      const telegramResult = await sendTelegramMessage(
        escalation.escalatedTo.telegramChatId,
        `🔓 <b>Escalation Reopened</b>\n\n` +
        `Alert ID: <code>${escalation.alert?.externalId || alertId}</code>\n` +
        `Reopened by: <b>${user.name}</b>\n\n` +
        `The discussion on this escalation has been reopened. ` +
        `You can continue the conversation in the dashboard.`
      )

      if (!telegramResult.success) {
        console.warn(`[Escalation] Failed to send Telegram notification to L2: ${telegramResult.error}`)
      }

      // Create audit log
      await prisma.alertEscalationAudit.create({
        data: {
          escalationId,
          alertId,
          event: "reopened",
          details: {
            reopenedBy: user.userId,
            reopenedByName: user.name,
          },
        },
      })

      console.log(`[Escalation] Escalation reopened: ${escalationId} by ${user.name}`)

      return NextResponse.json({
        success: true,
        message: "Escalation reopened successfully",
        escalation: {
          id: reopenedEscalation.id,
          status: reopenedEscalation.status,
          closedAt: reopenedEscalation.closedAt,
        },
      })
    }
  } catch (error) {
    console.error("[Close/Reopen Escalation] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update escalation" },
      { status: 500 }
    )
  }
}
