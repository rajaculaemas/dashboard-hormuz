import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { updateAlertStatus as updateStellarCyberAlertStatus } from "@/lib/api/stellar-cyber"
import { updateAlertStatus as updateWazuhAlertStatus } from "@/lib/api/wazuh"
import type { AlertStatus } from "@/lib/config/stellar-cyber"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"

export async function POST(request: NextRequest) {
  try {
    // Check authentication and permission
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    if (!hasPermission(user.role, 'update_alert_status')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to update alert status" }, { status: 403 })
    }
    
    const body = await request.json()
    const { alertId, status, severity, comments, assignee } = body

    if (!alertId || !status) {
      return NextResponse.json({ error: "Missing required fields: alertId or status" }, { status: 400 })
    }

    // Validate status - support both source-specific and generic statuses
    const validStatuses: string[] = [
      "New",
      "In Progress",
      "Ignored",
      "Closed",
      "Open",
      "OPEN",
      "FOLLOW_UP",
      "CLOSED",
    ]
    if (!validStatuses.includes(status as string)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      )
    }

    // Find alert in database
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        integration: true,
      },
    })

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 })
    }

    // Normalize status for generic alert update
    let normalizedStatus = status
    if (status === "OPEN") normalizedStatus = "Open"
    if (status === "FOLLOW_UP") normalizedStatus = "In Progress"
    if (status === "CLOSED") normalizedStatus = "Closed"

    const previousStatus = alert.status
    const previousSeverity = alert.severity

    // Update status in database
    const updatedAlert = await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: normalizedStatus as string,
        ...(severity && { severity: severity }),
        metadata: {
          ...(typeof alert.metadata === "object" && alert.metadata !== null ? alert.metadata : {}),
          assignee,
          statusUpdatedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    })

    // Record timeline events
    const timelineEvents: any[] = []

    if (previousStatus !== normalizedStatus) {
      timelineEvents.push({
        alertId,
        eventType: "status_change",
        description: `Status changed from "${previousStatus}" to "${normalizedStatus}"`,
        oldValue: previousStatus,
        newValue: normalizedStatus,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(),
      })
    }

    if (severity && severity !== previousSeverity) {
      timelineEvents.push({
        alertId,
        eventType: "severity_change",
        description: `Severity changed from "${previousSeverity || "Not Set"}" to "${severity}"`,
        oldValue: previousSeverity || "",
        newValue: severity,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(),
      })
    }

    if (comments) {
      timelineEvents.push({
        alertId,
        eventType: "comment",
        description: comments,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(),
      })
    }

    if (timelineEvents.length > 0) {
      await prisma.alertTimeline.createMany({ data: timelineEvents })
    }

    // Update status in source system
    if (alert.integration.source === "stellar-cyber" && alert.externalId) {
      try {
        await updateStellarCyberAlertStatus({
          index: (alert as any).index || "",
          alertId: alert.externalId,
          status: normalizedStatus as AlertStatus,
          comments,
          integrationId: alert.integrationId,
        })
      } catch (error) {
        console.error("Error updating alert status in Stellar Cyber:", error)
        // Continue even if update fails in source
      }
    } else if (alert.integration.source === "wazuh" && alert.externalId) {
      try {
        await updateWazuhAlertStatus(alert.externalId, normalizedStatus as any, assignee, severity)
      } catch (error) {
        console.error("Error updating alert status in Wazuh:", error)
        // Continue even if update fails in source
      }
    }

    return NextResponse.json({
      success: true,
      message: "Alert status updated successfully",
      alert: updatedAlert,
    })
  } catch (error) {
    console.error("Error in /api/alerts/update:", error)
    return NextResponse.json({ error: "Failed to update alert status" }, { status: 500 })
  }
}
