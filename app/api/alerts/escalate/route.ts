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

    // Deny escalation for read-only users only
    if (user.role === "read_only") {
      return NextResponse.json(
        { error: "Read-only users cannot escalate alerts" },
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

    // Get alert to check integration
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: { integration: true },
    })

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 })
    }

    const integrationName = alert.integration?.name?.toLowerCase() || ""

    // Support SOCFortress, Stellar Cyber, and QRadar integrations for escalation
    if (!integrationName.includes("socfortress") && !integrationName.includes("stellar") && !integrationName.includes("qradar")) {
      return NextResponse.json(
        { error: `Escalation not supported for ${alert.integration?.name || "this"} integration` },
        { status: 400 },
      )
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
          const currentAlert = await prisma.alert.findUnique({
            where: { id: alertId },
          })

          const updateData: any = {
            status: dbStatus,
          }

          // Update integration-specific status fields if needed
          if (integrationName.includes("socfortress")) {
            const currentMetadata = (currentAlert?.metadata as any) || {}
            updateData.metadata = {
              ...currentMetadata,
              socfortress: {
                ...(currentMetadata?.socfortress || {}),
                status: dbStatus,
              },
            }
          } else if (integrationName.includes("stellar")) {
            // Stellar Cyber stores status in metadata - keep existing metadata
            const currentMetadata = (currentAlert?.metadata as any) || {}
            updateData.metadata = currentMetadata
          }

          await prisma.alert.update({
            where: { id: alertId },
            data: updateData,
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
