/**
 * Manual Escalate to L3 Endpoint
 * Called when L2 analyst has responded but user wants to escalate further to L3
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import prisma from "@/lib/prisma"
import { TelegramEscalationService } from "@/lib/services/telegram-escalation"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Check authentication
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { escalationId, selectedL3UserId } = body

    if (!escalationId) {
      return NextResponse.json(
        { error: "Missing escalationId" },
        { status: 400 },
      )
    }

    if (!selectedL3UserId) {
      return NextResponse.json(
        { error: "Missing selectedL3UserId - please select an L3 analyst" },
        { status: 400 },
      )
    }

    // Get the escalation
    const escalation = await prisma.alertEscalation.findUnique({
      where: { id: escalationId },
      include: {
        alert: true,
        escalatedBy: true,
        escalatedTo: true,
        responses: { include: { responder: true } },
      },
    })

    if (!escalation) {
      return NextResponse.json(
        { error: "Escalation not found" },
        { status: 404 },
      )
    }

    // Can only escalate L2 responses to L3 (status can be "replied" or "escalated" if retrying)
    if (escalation.escalationLevel !== 1 || !["replied", "escalated"].includes(escalation.status)) {
      return NextResponse.json(
        {
          error: "Can only escalate L2 responses to L3. Status must be 'replied' or 'escalated'.",
        },
        { status: 400 },
      )
    }

    // Find L3 analysts (position like "Manager" or "L3 Analyst" or similar)
    const l3Analysts = await prisma.user.findMany({
      where: {
        OR: [
          { position: { contains: "Manager", mode: "insensitive" } },
          { position: { contains: "L3", mode: "insensitive" } },
          { position: { contains: "Lead", mode: "insensitive" } },
          { role: "administrator" },
        ],
        id: { not: escalation.escalatedToUserId }, // Exclude current L2
      },
    })

    console.log(`[Escalate L3] Found ${l3Analysts.length} potential L3 analysts`)

    // Get the selected L3 analyst
    const l3Analyst = l3Analysts.find(a => a.id === selectedL3UserId)

    if (!l3Analyst) {
      console.error(`[Escalate L3] Selected L3 analyst (${selectedL3UserId}) not found`)
      return NextResponse.json(
        { error: "Selected L3 analyst not found or not available" },
        { status: 400 },
      )
    }

    console.log(`[Escalate L3] Selected L3 analyst: ${l3Analyst.name} (ID: ${l3Analyst.id})`)

    // Validate telegram chat id
    if (!l3Analyst.telegramChatId) {
      console.error(`[Escalate L3] L3 analyst ${l3Analyst.name} has no valid telegramChatId`)
      return NextResponse.json(
        {
          error: `Selected L3 analyst (${l3Analyst.name}) does not have a valid Telegram chat ID. Please select another analyst.`,
        },
        { status: 400 },
      )
    }

    // Create new escalation for L3
    const l3Escalation = await prisma.alertEscalation.create({
      data: {
        alertId: escalation.alertId,
        escalationLevel: 2, // L2 -> L3
        escalatedByUserId: escalation.escalatedToUserId, // L2 escalates to L3
        escalatedToUserId: l3Analyst.id,
        l1Analysis: escalation.l1Analysis,
        l2Analysis: escalation.l2Analysis,
        status: "pending",
        telegramChatId: l3Analyst.telegramChatId!,
        timeoutAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      },
    })

    console.log(
      `[Escalate L3] Created L3 escalation record (ID: ${l3Escalation.id}) for alert ${escalation.alertId}`,
    )
    console.log(
      `[Escalate L3] Sending Telegram message to L3 analyst ${l3Analyst.name} (ChatID: ${l3Analyst.telegramChatId})`,
    )

    // Send Telegram message to L3
    const telegramResult = await TelegramEscalationService.sendEscalationMessage(
      l3Analyst.telegramChatId!,
      escalation.alert,
      2, // escalationLevel for L3
      l3Escalation.id, // Pass escalationId so button contains it
      {
        l1: escalation.l1Analysis || undefined,
        l2: escalation.l2Analysis || undefined,
      },
    )

    console.log(`[Escalate L3] Telegram send result:`, {
      success: telegramResult.success,
      error: telegramResult.error,
      messageId: telegramResult.messageId,
    })

    if (!telegramResult.success) {
      console.error(
        `[Escalate L3] Failed to send Telegram message to L3: ${telegramResult.error}`,
      )
      // Delete escalation if telegram send fails
      await prisma.alertEscalation.delete({ where: { id: l3Escalation.id } })
      return NextResponse.json(
        {
          error: `Failed to send Telegram notification to ${l3Analyst.name}: ${telegramResult.error}`,
        },
        { status: 400 },
      )
    }

    console.log(
      `[Escalate L3] ✓ Successfully sent to L3 analyst ${l3Analyst.name} (MessageID: ${telegramResult.messageId})`,
    )

    // Update escalation with telegram message ID
    await prisma.alertEscalation.update({
      where: { id: l3Escalation.id },
      data: { telegramMessageId: telegramResult.messageId },
    })

    // Mark previous escalation as escalated
    await prisma.alertEscalation.update({
      where: { id: escalationId },
      data: { status: "escalated" },
    })

    // Create audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId: l3Escalation.id,
        alertId: escalation.alertId,
        event: "escalated",
        details: {
          fromLevel: "L2",
          toLevel: "L3",
          l3UserId: l3Analyst.id,
          l3UserName: l3Analyst.name,
          l2UserId: escalation.escalatedToUserId,
          l2Analysis: escalation.l2Analysis?.substring(0, 200),
        },
      },
    })

    console.log(
      `[Manual Escalation] Alert ${escalation.alertId} escalated from L2 to L3 (${l3Analyst.name}) - Escalation ID: ${l3Escalation.id}`,
    )

    return NextResponse.json({
      success: true,
      escalationId: l3Escalation.id,
      message: `Alert escalated to L3 successfully (${l3Analyst.name})`,
    })
  } catch (error) {
    console.error("Error in escalate-l3 endpoint:", error)
    return NextResponse.json(
      { error: "Failed to escalate to L3" },
      { status: 500 },
    )
  }
}
