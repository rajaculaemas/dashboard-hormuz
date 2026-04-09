/**
 * Alert Escalation Service
 * Handles escalation logic when L1 escalates an alert
 */

import prisma from "@/lib/prisma"
import { TelegramEscalationService } from "@/lib/services/telegram-escalation"

export interface EscalationRequest {
  alertId: string
  escalateToUserId: string // L2 user ID
  l1Analysis: string
  escalatedByUserId: string // L1 user ID (should be admin@soc-dashboard.local)
}

export interface EscalationResponse {
  success: boolean
  escalationId?: string
  error?: string
}

/**
 * Create escalation and send Telegram notification to L2
 */
export async function createEscalation(request: EscalationRequest): Promise<EscalationResponse> {
  try {
    // Verify alert exists
    const alert = await prisma.alert.findUnique({
      where: { id: request.alertId },
      include: { integration: true },
    })

    if (!alert) {
      return { success: false, error: "Alert not found" }
    }

    // Verify escalated by user exists (L1)
    const l1User = await prisma.user.findUnique({
      where: { id: request.escalatedByUserId },
    })

    if (!l1User) {
      return { success: false, error: "L1 user not found" }
    }

    // Verify escalation target is a valid user with L2 position and Telegram
    const l2User = await prisma.user.findUnique({
      where: { id: request.escalateToUserId },
    })

    if (!l2User) {
      return { success: false, error: "L2 user not found" }
    }

    if (!l2User.telegramChatId) {
      return {
        success: false,
        error: `User ${l2User.name} does not have Telegram chat ID linked`,
      }
    }

    // Create escalation record
    const escalation = await prisma.alertEscalation.create({
      data: {
        alertId: request.alertId,
        escalationLevel: 1, // L1 -> L2
        escalatedByUserId: request.escalatedByUserId,
        escalatedToUserId: request.escalateToUserId,
        l1Analysis: request.l1Analysis,
        status: "pending",
        telegramChatId: l2User.telegramChatId,
        timeoutAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      },
    })

    // Send Telegram message to L2
    const telegramResult = await TelegramEscalationService.sendEscalationMessage(
      l2User.telegramChatId,
      alert,
      1, // escalationLevel for L2
      { l1: request.l1Analysis },
    )

    if (!telegramResult.success) {
      // Delete escalation if telegram send fails
      await prisma.alertEscalation.delete({ where: { id: escalation.id } })
      return {
        success: false,
        error: `Failed to send Telegram notification: ${telegramResult.error}`,
      }
    }

    // Update escalation with telegram message ID
    await prisma.alertEscalation.update({
      where: { id: escalation.id },
      data: { telegramMessageId: telegramResult.messageId },
    })

    // Create audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId: escalation.id,
        alertId: request.alertId,
        event: "escalated",
        details: {
          fromLevel: "L1",
          toLevel: "L2",
          l2UserId: l2User.id,
          l2UserName: l2User.name,
          l1UserId: request.escalatedByUserId,
          analysis: request.l1Analysis.substring(0, 200),
        },
      },
    })

    console.log(
      `[Escalation] Alert ${request.alertId} escalated to L2 (${l2User.name}) - Escalation ID: ${escalation.id}`,
    )

    return {
      success: true,
      escalationId: escalation.id,
    }
  } catch (error) {
    console.error("Error creating escalation:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Get active escalation for an alert
 */
export async function getActiveEscalation(alertId: string) {
  try {
    return await prisma.alertEscalation.findFirst({
      where: {
        alertId,
        status: { in: ["pending", "escalated"] },
      },
      include: {
        escalatedBy: true,
        escalatedTo: true,
        responses: {
          include: { responder: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })
  } catch (error) {
    console.error("Error fetching active escalation:", error)
    return null
  }
}

/**
 * Get escalation history for an alert
 */
export async function getEscalationHistory(alertId: string) {
  try {
    return await prisma.alertEscalation.findMany({
      where: { alertId },
      include: {
        escalatedBy: true,
        escalatedTo: true,
        responses: {
          include: { responder: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })
  } catch (error) {
    console.error("Error fetching escalation history:", error)
    return []
  }
}

/**
 * Check and handle timeout escalations
 * This should be called periodically (e.g., every 5 minutes)
 */
export async function checkAndHandleTimeouts() {
  try {
    const now = new Date()

    // Find all pending escalations that have timed out
    const timedOutEscalations = await prisma.alertEscalation.findMany({
      where: {
        status: "pending",
        timeoutAt: { lte: now },
      },
      include: {
        alert: true,
        escalatedTo: true,
      },
    })

    console.log(`[Timeout Check] Found ${timedOutEscalations.length} timed out escalations`)

    for (const escalation of timedOutEscalations) {
      await handleEscalationTimeout(escalation)
    }

    return timedOutEscalations.length
  } catch (error) {
    console.error("Error checking timeouts:", error)
    return 0
  }
}

/**
 * Handle a single escalation timeout
 */
async function handleEscalationTimeout(escalation: any) {
  try {
    console.log(
      `[Timeout] Handling timeout for escalation ${escalation.id} (Level ${escalation.escalationLevel})`,
    )

    if (escalation.escalationLevel === 1) {
      // L2 timeout - auto-escalate to L3
      handleL2Timeout(escalation)
    } else if (escalation.escalationLevel === 2) {
      // L3 timeout - notify admin
      handleL3Timeout(escalation)
    }

    // Update escalation status to timeout
    await prisma.alertEscalation.update({
      where: { id: escalation.id },
      data: { status: "timeout" },
    })

    // Create audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId: escalation.id,
        alertId: escalation.alertId,
        event: "timeout",
        details: {
          level: escalation.escalationLevel === 1 ? "L2" : "L3",
          action:
            escalation.escalationLevel === 1 ? "auto_escalate_to_L3" : "notify_admin_manual",
        },
      },
    })
  } catch (error) {
    console.error("Error handling escalation timeout:", error)
  }
}

/**
 * Handle L2 timeout - auto-escalate to L3
 */
async function handleL2Timeout(parentEscalation: any) {
  try {
    console.log(`[Timeout] Starting L2 timeout handling for escalation ${parentEscalation.id}`)

    // Edit the original message to disable buttons
    if (parentEscalation.telegramMessageId && parentEscalation.telegramChatId) {
      console.log(`[Timeout] Editing timeout message for L2 (chat: ${parentEscalation.telegramChatId}, message: ${parentEscalation.telegramMessageId})`)
      await TelegramEscalationService.editTimeoutMessage(
        parentEscalation.telegramChatId,
        parentEscalation.telegramMessageId,
        "L2",
      )
    }

    // Find available L3 analyst
    const l3Users = await prisma.user.findMany({
      where: {
        position: "Analyst L3",
        status: "active",
        telegramChatId: { not: null },
      },
      orderBy: { createdAt: "asc" },
    })

    if (l3Users.length === 0) {
      console.warn(
        `[Timeout] No available L3 analysts for alert ${parentEscalation.alertId}, notifying admin`,
      )
      await notifyAdminOfTimeoutNoLevel3(parentEscalation)
      return
    }

    // Pick first available L3 (in production, use load balancing)
    const l3User = l3Users[0]

    // Notify L2 about timeout
    await TelegramEscalationService.sendTimeoutNotification(
      parentEscalation.escalatedTo.telegramChatId,
      parentEscalation.alert,
      "L2",
    )

    // Create escalation to L3
    const l3Escalation = await prisma.alertEscalation.create({
      data: {
        alertId: parentEscalation.alertId,
        escalationLevel: 2,
        escalatedByUserId: parentEscalation.escalatedByUserId, // Keep original L1 as initiator
        escalatedToUserId: l3User.id,
        l1Analysis: parentEscalation.l1Analysis,
        status: "pending",
        telegramChatId: l3User.telegramChatId,
        timeoutAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })

    // Send escalation message to L3
    const result = await TelegramEscalationService.sendEscalationMessage(
      l3User.telegramChatId,
      parentEscalation.alert,
      2,
      { l1: parentEscalation.l1Analysis },
    )

    if (result.success && result.messageId) {
      await prisma.alertEscalation.update({
        where: { id: l3Escalation.id },
        data: { telegramMessageId: result.messageId },
      })
    }

    console.log(
      `[Timeout] Auto-escalated to L3 (${l3User.name}) due to L2 timeout - Escalation ID: ${l3Escalation.id}`,
    )

    // Create audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId: l3Escalation.id,
        alertId: parentEscalation.alertId,
        event: "timeout",
        details: {
          level: "L2",
          action: "auto_escalate_to_L3",
          l3UserId: l3User.id,
          l3UserName: l3User.name,
        },
      },
    })
  } catch (error) {
    console.error("Error handling L2 timeout:", error)
  }
}

/**
 * Handle L3 timeout - notify admin for manual escalation
 */
async function handleL3Timeout(escalation: any) {
  try {
    console.log(`[Timeout] Starting L3 timeout handling for escalation ${escalation.id}`)

    // Edit the original message to disable buttons
    if (escalation.telegramMessageId && escalation.telegramChatId) {
      console.log(`[Timeout] Editing timeout message for L3 (chat: ${escalation.telegramChatId}, message: ${escalation.telegramMessageId})`)
      await TelegramEscalationService.editTimeoutMessage(
        escalation.telegramChatId,
        escalation.telegramMessageId,
        "L3",
      )
    }

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

    // Notify L3 about timeout
    await TelegramEscalationService.sendTimeoutNotification(
      escalation.escalatedTo.telegramChatId,
      escalation.alert,
      "L3",
    )

    // Notify admin
    const messageText = `
<b>⏰ ESCALATION TIMEOUT - L3</b>

<b>Alert:</b> ${escalation.alert.title}
<b>Alert ID:</b> <code>${escalation.alert.externalId}</code>

❌ No response from L3 within 30 minutes

<b>Action Required:</b>
Please escalate manually to Manager or General Manager

<a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/alerts/${escalation.alertId}">→ View Alert in Dashboard</a>
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

    console.log(
      `[Timeout] Admin notified of L3 timeout for alert ${escalation.alertId} - Manual escalation required`,
    )
  } catch (error) {
    console.error("Error handling L3 timeout:", error)
  }
}

/**
 * Notify admin when no L3 is available for timeout
 */
async function notifyAdminOfTimeoutNoLevel3(escalation: any) {
  try {
    const adminUser = await prisma.user.findFirst({
      where: {
        email: "admin@soc-dashboard.local",
        telegramChatId: { not: null },
      },
    })

    if (!adminUser || !adminUser.telegramChatId) {
      return
    }

    const messageText = `
<b>⚠️ L2 TIMEOUT - NO L3 AVAILABLE</b>

<b>Alert:</b> ${escalation.alert.title}
<b>Alert ID:</b> <code>${escalation.alert.externalId}</code>

⏰ L2 did not respond within 30 minutes
❌ No available L3 analysts

<b>Action Required:</b>
Please manually escalate to Manager or General Manager

<a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/alerts/${escalation.alertId}">→ View Alert in Dashboard</a>
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
  } catch (error) {
    console.error("Error notifying admin of no L3 available:", error)
  }
}
