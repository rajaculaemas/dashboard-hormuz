import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { updateAlertStatus as updateStellarCyberAlertStatus } from "@/lib/api/stellar-cyber"
import { updateAlertStatus as updateWazuhAlertStatus } from "@/lib/api/wazuh"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!hasPermission(user.role, 'update_alert_status')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { alertIds, status, severity, comments, assignee, severityBasedOnAnalysis, analysisNotes } = body

    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return NextResponse.json({ error: "Missing alertIds" }, { status: 400 })
    }

    const validStatuses = ["New","In Progress","Ignored","Closed","Open","OPEN","FOLLOW_UP","CLOSED"]
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
    }

    const normalized = (s: any) => {
      if (!s) return s
      if (s === 'OPEN') return 'Open'
      if (s === 'FOLLOW_UP') return 'In Progress'
      if (s === 'CLOSED') return 'Closed'
      return s
    }
    const normalizedStatus = normalized(status)

    const timelineEvents: any[] = []

    // Process each alert
    for (const alertId of alertIds) {
      const alert = await prisma.alert.findUnique({ where: { id: alertId }, include: { integration: true } })
      if (!alert) continue

      const previousStatus = alert.status
      const previousSeverity = alert.severity

      // Update database
      await prisma.alert.update({
        where: { id: alertId },
        data: {
          status: normalizedStatus || alert.status,
          ...(severity && { severity }),
          metadata: {
            ...(typeof alert.metadata === 'object' && alert.metadata !== null ? alert.metadata : {}),
            assignee,
            ...(severityBasedOnAnalysis ? { severityBasedOnAnalysis } : {}),
            ...(analysisNotes ? { analysisNotes } : {}),
            statusUpdatedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      })

      if (previousStatus !== normalizedStatus) {
        timelineEvents.push({
          alertId,
          eventType: 'status_change',
          description: `Status changed from "${previousStatus}" to "${normalizedStatus}"`,
          oldValue: previousStatus,
          newValue: normalizedStatus,
          changedBy: user.name || user.email || 'System',
          changedByUserId: user.id,
          timestamp: new Date(),
        })
      }

      if (severity && severity !== previousSeverity) {
        timelineEvents.push({
          alertId,
          eventType: 'severity_change',
          description: `Severity changed from "${previousSeverity || 'Not Set'}" to "${severity}"`,
          oldValue: previousSeverity || '',
          newValue: severity,
          changedBy: user.name || user.email || 'System',
          changedByUserId: user.id,
          timestamp: new Date(),
        })
      }

      if (comments) {
        timelineEvents.push({
          alertId,
          eventType: 'comment',
          description: comments,
          changedBy: user.name || user.email || 'System',
          changedByUserId: user.id,
          timestamp: new Date(),
        })
      }

      if (analysisNotes) {
        timelineEvents.push({
          alertId,
          eventType: 'analysis_note',
          description: analysisNotes,
          changedBy: user.name || user.email || 'System',
          changedByUserId: user.id,
          timestamp: new Date(),
        })
      }

      // Update source systems where applicable
      try {
        if (alert.integration?.source === 'wazuh' && alert.externalId) {
          await updateWazuhAlertStatus(alert.externalId, normalizedStatus || alert.status, assignee, severity)
        } else if (alert.integration?.source === 'stellar-cyber' && alert.externalId) {
          await updateStellarCyberAlertStatus({ index: (alert as any).index || '', alertId: alert.externalId, status: normalizedStatus as any, comments, integrationId: alert.integrationId })
        }
      } catch (err) {
        console.error('Error updating source for alert', alertId, err)
      }
    }

    if (timelineEvents.length > 0) {
      try {
        await prisma.alertTimeline.createMany({ data: timelineEvents })
      } catch (err) {
        console.error('Failed to write timeline events for bulk update', err)
      }
    }

    // Refresh and return
    return NextResponse.json({ success: true, message: 'Bulk update completed' })
  } catch (error) {
    console.error('Error in /api/alerts/bulk-update:', error)
    return NextResponse.json({ error: 'Failed to perform bulk update' }, { status: 500 })
  }
}
