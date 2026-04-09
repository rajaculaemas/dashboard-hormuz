/**
 * Escalate Alert Endpoint
 * Called when L1 wants to escalate an alert to L2
 * Optionally updates alert status if provided
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"
import { createEscalation } from "@/lib/services/alert-escalation"
import prisma from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    // Check authentication and permission
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only allow admin@soc-dashboard.local to escalate
    if (user.email !== "admin@soc-dashboard.local") {
      return NextResponse.json(
        { error: "Only admin@soc-dashboard.local can escalate alerts" },
        { status: 403 },
      )
    }

    const body = await request.json()
    const { alertId, escalateToUserId, analysis, status } = body

    if (!alertId || !escalateToUserId || !analysis?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: alertId, escalateToUserId, analysis" },
        { status: 400 },
      )
    }

    // If status is provided, validate it
    if (status) {
      const validStatuses = ["New", "In Progress", "Closed"]
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 },
        )
      }
    }

    // Create escalation
    const result = await createEscalation({
      alertId,
      escalateToUserId,
      l1Analysis: analysis,
      escalatedByUserId: user.userId,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // If status is provided, update alert status
    if (status) {
      // Map UI status to DB format
      const statusMap: Record<string, string> = {
        "New": "OPEN",
        "In Progress": "IN_PROGRESS",
        "Closed": "CLOSED",
      }

      const dbStatus = statusMap[status]
      if (!dbStatus) {
        console.error(`Unknown status mapping for: ${status}`)
      } else {
        try {
          await prisma.alert.update({
            where: { id: alertId },
            data: {
              status: dbStatus,
              metadata: {
                ...((await prisma.alert.findUnique({ where: { id: alertId } }))?.metadata || {}),
                socfortress: {
                  ...((await prisma.alert.findUnique({ where: { id: alertId } }))?.metadata?.socfortress || {}),
                  status: dbStatus,
                },
              },
            },
          })
          console.log(`[Escalate] Updated alert ${alertId} status to ${dbStatus}`)
        } catch (error) {
          console.error(`Failed to update alert status:`, error)
          // Don't fail the escalation if status update fails
        }
      }
    }

    return NextResponse.json({
      success: true,
      escalationId: result.escalationId,
      message: "Alert escalated successfully",
    })
  } catch (error) {
    console.error("Error in escalate endpoint:", error)
    return NextResponse.json({ error: "Failed to escalate alert" }, { status: 500 })
  }
}
