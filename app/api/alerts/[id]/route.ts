import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { updateAlertStatus as updateStellarCyberAlertStatus } from "@/lib/api/stellar-cyber"
import { QRadarClient } from "@/lib/api/qradar"
import type { AlertStatus } from "@/lib/config/stellar-cyber"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Check authentication and permission
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    if (!hasPermission(user.role, 'update_alert_status')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to update alert status" }, { status: 403 })
    }
    
    const alertId = (await params).id
    const body = await request.json()
    const { status, comments, isQRadar, closingReasonId, shouldCreateTicket, assignedTo, severity, severityBasedOnAnalysis, analysisNotes } = body

    if (!alertId || !status) {
      return NextResponse.json({ error: "Missing required fields: id or status" }, { status: 400 })
    }

    // Validasi status
    const validStatuses: AlertStatus[] = ["New", "In Progress", "Ignored", "Closed"]
    if (!validStatuses.includes(status as AlertStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      )
    }

    // Cari alert di database
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        integration: true,
      },
    })

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 })
    }

    // Update status di database
    const metadata = (alert.metadata as any) || {}

    // For QRadar follow-up, mark follow_up flag in metadata so ticketing view picks it up even if status cache lags
    const updatedMetadata = {
      ...metadata,
      ...(assignedTo && { assignee: assignedTo }),
      ...(comments && {
        comment: [
          {
            comment_user: user.name || user.email || "system",
            comment_time: new Date().toISOString(),
            comment: comments,
          },
        ],
      }),
    }

    if (isQRadar && status === "In Progress") {
      updatedMetadata.qradar = {
        ...(metadata.qradar || {}),
        follow_up: true,
        assigned_to: assignedTo || metadata.qradar?.assigned_to,
      }
    }

    const previousStatus = alert.status
    const previousSeverity = alert.severity

    console.log(`[PATCH] Alert ${alertId}: Previous status="${previousStatus}", New status="${status}"`)

    const updatedAlert = await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: status as AlertStatus,
        ...(severity && { severity }),
        ...(severityBasedOnAnalysis && { severityBasedOnAnalysis }),
        ...(analysisNotes && { analysisNotes }),
        updatedAt: new Date(),
        metadata: updatedMetadata,
      },
    })

    // Record timeline events
    const timelineEvents: any[] = []

    // Only record status change if it actually changed
    if (previousStatus !== status) {
      console.log(`[PATCH] Recording status change timeline: "${previousStatus}" → "${status}"`)
      timelineEvents.push({
        alertId,
        eventType: "status_change",
        description: `Status changed from "${previousStatus}" to "${status}"`,
        oldValue: previousStatus,
        newValue: status,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(),
      })
    } else {
      console.log(`[PATCH] Status unchanged (${status}), skipping timeline entry`)
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

    // If Wazuh alert with severity, update related case
    if (severity && alert.integration.source === "wazuh") {
      try {
        // Find case associated with this alert
        const caseAlert = await prisma.wazuhCaseAlert.findFirst({
          where: { alertId: alertId },
          include: { case: true },
        })

        if (caseAlert && caseAlert.case) {
          // Update case severity if it's null
          if (!caseAlert.case.severity) {
            await prisma.wazuhCase.update({
              where: { id: caseAlert.case.id },
              data: { severity },
            })
            console.log(`[v0] Updated WazuhCase ${caseAlert.case.id} severity to ${severity}`)
          }
        }
      } catch (error) {
        console.error("Error updating related case severity:", error)
        // Continue even if update fails
      }
    }

    // Jika alert berasal dari QRadar
    if (isQRadar && alert.integration.source === "qradar" && (alert.metadata as any)?.qradar?.id) {
      try {
        const creds = alert.integration.credentials as any
        const qradarClient = new QRadarClient({
          host: creds.host,
          api_key: creds.api_key,
        })

        // Fetch current offense status from QRadar to check if already closed
        const currentOffense = await qradarClient.getOffenseDetails((alert.metadata as any).qradar.id)
        console.log(`[v0] Current QRadar offense status: ${currentOffense.status}`)

        // Only update if offense is not already closed
        if (currentOffense.status === "CLOSED") {
          console.log(`[v0] Offense ${(alert.metadata as any).qradar.id} is already closed in QRadar, skipping update`)
        } else {
          // Map status ke QRadar status
          let qradarStatus: "OPEN" | "FOLLOW_UP" | "CLOSED" = "OPEN"
          if (status === "In Progress") {
            qradarStatus = "FOLLOW_UP"
          } else if (status === "Closed") {
            qradarStatus = "CLOSED"
          }

          const offenseId = (alert.metadata as any).qradar.id
          const primaryAssignee = assignedTo || creds.username

          const attemptUpdate = async (assignee?: string) => {
            return qradarClient.updateOffenseStatus(offenseId, qradarStatus, assignee, closingReasonId)
          }

          try {
            await attemptUpdate(primaryAssignee)
          } catch (err: any) {
            const message = err?.message || ""
            const isAccessError = message.includes("does not have access") || message.includes("409")

            if (isAccessError) {
              console.warn(`[v0] QRadar offense ${offenseId} update failed for assignee '${primaryAssignee}', retrying without assignee`)
              try {
                await attemptUpdate(undefined)
              } catch (err2) {
                console.error("Error updating alert status in QRadar (fallback):", err2)
              }
            } else {
              console.error("Error updating alert status in QRadar:", err)
            }
          }

          console.log(`[v0] Updated QRadar offense ${offenseId} to status ${qradarStatus}`)
        }

        // When status changes to FOLLOW_UP, upsert QRadarOffense record so it shows in ticketing menu
        if (status === "In Progress") {
          try {
            const upsertedOffense = await prisma.qRadarOffense.upsert({
              where: { externalId: (alert.metadata as any).qradar.id },
              update: {
                status: "FOLLOW_UP",
                lastUpdatedTime: new Date(),
              },
              create: {
                externalId: (alert.metadata as any).qradar.id,
                title: alert.title || "QRadar Offense",
                description: alert.description,
                severity: alert.severity || "Medium",
                status: "FOLLOW_UP",
                integrationId: alert.integrationId,
                startTime: new Date(),
                metadata: alert.metadata || {},
              },
            })

            console.log(`[v0] Upserted QRadar offense ${(alert.metadata as any).qradar.id} to FOLLOW_UP status in database`)

            // Also upsert QRadarTicket so it appears in the ticketing menu
            try {
              const ticketNumber = `QRADAR-${(alert.metadata as any).qradar.id}`
              await prisma.qRadarTicket.upsert({
                where: { qradarOffenseId: upsertedOffense.id },
                update: {
                  status: "OPEN",
                  description: alert.description || alert.title,
                  updatedAt: new Date(),
                },
                create: {
                  ticketNumber: ticketNumber,
                  offenseId: (alert.metadata as any).qradar.id,
                  description: alert.description || alert.title,
                  status: "OPEN",
                  qradarOffenseId: upsertedOffense.id,
                },
              })
              console.log(`[v0] Upserted QRadar ticket for offense ${(alert.metadata as any).qradar.id}`)
            } catch (ticketError) {
              console.error("Error upserting QRadar ticket:", ticketError)
              // Continue even if ticket upsert fails
            }
          } catch (dbError) {
            console.error("Error upserting QRadar offense:", dbError)
            // Continue even if database update fails
          }
        }
      } catch (error) {
        console.error("Error updating alert status in QRadar:", error)
        // Lanjutkan meskipun gagal update di QRadar
      }

      // When status changes to FOLLOW_UP, the offense is already updated in QRadar above.
      // No separate ticket creation needed — offense with FOLLOW_UP status is shown in ticketing menu.
    } else if (!isQRadar && alert.integration.source === "stellar-cyber" && alert.externalId) {
      // Jika alert berasal dari Stellar Cyber, update juga di sana
      try {
        const meta = (alert.metadata as any) || {}
        const computedIndex =
          (alert as any).index ||
          meta.index ||
          meta.alert_index ||
          meta._index ||
          meta.stellar_index ||
          meta.stellar?.index ||
          meta.orig_index ||
          meta.source_index ||
          ""

        const eventId = meta._id || meta.alert_id || meta.stellar_uuid || meta.stellar?.uuid || meta.event_id || alert.externalId

        if (!computedIndex) {
          console.warn("[StellarCyber] Missing index for alert", { alertId, externalId: alert.externalId, metaKeys: Object.keys(meta || {}) })
        }

        await updateStellarCyberAlertStatus({
          index: computedIndex,
          alertId: eventId,
          status: status as AlertStatus,
          comments,
          assignee: assignedTo,
          integrationId: alert.integrationId,
        })
      } catch (error) {
        console.error("Error updating alert status in Stellar Cyber:", error)
        // Lanjutkan meskipun gagal update di Stellar Cyber
      }
    }

    return NextResponse.json({
      success: true,
      message: "Alert status updated successfully",
      alert: updatedAlert,
    })
  } catch (error) {
    console.error("Error in PATCH /api/alerts/[id]:", error)
    return NextResponse.json({ error: "Failed to update alert status" }, { status: 500 })
  }
}
