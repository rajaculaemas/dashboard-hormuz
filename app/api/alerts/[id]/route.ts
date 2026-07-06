import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { updateAlertStatus as updateStellarCyberAlertStatus } from "@/lib/api/stellar-cyber"
import { updateSocfortressAlertStatus } from "@/lib/api/socfortress"
import { QRadarClient } from "@/lib/api/qradar"
import type { AlertStatus } from "@/lib/config/stellar-cyber"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const alertId = (await params).id

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        integration: true,
      },
    })

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: alert,
    })
  } catch (error) {
    console.error("[GET /api/alerts/[id]] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch alert" },
      { status: 500 },
    )
  }
}

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
    const { status, title, comments, isQRadar, closingReasonId, shouldCreateTicket, assignedTo, severity, severityBasedOnAnalysis, analysisNotes, userId, tagsToAdd, tagsToDelete } = body

    console.log(`[PATCH] Received request for alert ${alertId}:`, {
      status,
      title: title ? `"${title}"` : "NO TITLE CHANGE",
      comments: comments ? `"${comments}"` : "NO COMMENT",
      isQRadar,
      assignedTo,
      assignedToType: typeof assignedTo,
      closingReasonId,
      userId: user.id,
      userName: user.name
    })

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

    // Handle assignee based on integration type
    const integrationSource = alert.integration?.source || ""
    const integrationName = alert.integration?.name || ""

    if (integrationSource === "qradar" || integrationName.includes("QRadar") || isQRadar) {
      // QRadar: preserve assigned_to from QRadar API, only update on "In Progress" status
      const qradarMeta = metadata.qradar || {}
      
      // Always preserve the existing assigned_to from QRadar
      updatedMetadata.qradar = {
        ...qradarMeta,
      }
      
      // Only update assigned_to when transitioning to "In Progress" (FOLLOW_UP status)
      if (status === "In Progress" && assignedTo) {
        // Use assignedTo as the new assigned_to value
        updatedMetadata.qradar.assigned_to = assignedTo
        updatedMetadata.qradar.follow_up = true
      }
    } else if (integrationSource === "stellar-cyber" || integrationName.includes("Stellar")) {
      // Stellar Cyber: store assignee in metadata.assignee (local only, not sent to API)
      if (assignedTo?.trim()) {
        updatedMetadata.assignee = assignedTo
        console.log(`[PATCH] Stellar Cyber assignee update:`, {
          assignedTo,
          assignedToType: typeof assignedTo,
          storedAsAssignee: updatedMetadata.assignee
        })
      }
    } else if (integrationSource === "socfortress" || integrationName.includes("SOCFortress") || integrationName.includes("Copilot")) {
      // Socfortress/Copilot: store assignee in metadata.socfortress or metadata.assigned_to
      if (assignedTo?.trim()) {
        updatedMetadata.socfortress = updatedMetadata.socfortress || {}
        updatedMetadata.socfortress.assigned_to = assignedTo
      }
    } else {
      // Fallback for unknown integrations: store in metadata.assignee
      if (assignedTo?.trim()) {
        updatedMetadata.assignee = assignedTo
      }
    }

    const previousStatus = alert.status
    const previousSeverity = alert.severity

    console.log(`[PATCH] Alert ${alertId}: Previous status="${previousStatus}", New status="${status}"`)

    const updatedAlert = await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: status as AlertStatus,
        ...(title?.trim() && { title: title.trim() }),
        ...(severity && { severity }),
        ...(severityBasedOnAnalysis && { severityBasedOnAnalysis }),
        ...(analysisNotes && { analysisNotes }),
        updatedAt: new Date(),
        metadata: updatedMetadata,
      },
    })

    // Record timeline events
    // Use UTC ISO string for consistent timezone handling
    const currentTimestampIso = new Date().toISOString()
    const timelineEvents: any[] = []

    // Only record status change if it actually changed
    if (previousStatus !== status) {
      console.log(`[PATCH] Recording status change timeline: "${previousStatus}" → "${status}"`)
      console.log(`[PATCH] Timeline timestamp (UTC ISO): ${currentTimestampIso}`)
      timelineEvents.push({
        alertId,
        eventType: "status_change",
        description: `Status changed from "${previousStatus}" to "${status}"`,
        oldValue: previousStatus,
        newValue: status,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(currentTimestampIso),
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
        timestamp: new Date(currentTimestampIso),
      })
    }

    if (comments) {
      timelineEvents.push({
        alertId,
        eventType: "comment",
        description: comments,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(currentTimestampIso),
      })
    }

    if (title?.trim() && title.trim() !== alert.title) {
      timelineEvents.push({
        alertId,
        eventType: "title_change",
        description: `Alert title updated`,
        oldValue: alert.title || "",
        newValue: title.trim(),
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(currentTimestampIso),
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

    // QRadar alert status update - UPDATE QRADAR OFFENSE
    if (isQRadar && alert.integration.source === "qradar" && (alert.metadata as any)?.qradar?.id) {
      try {
        const qradarMeta = (alert.metadata as any)?.qradar || {}
        const offenseId = qradarMeta.id
        const domainId = qradarMeta.domain_id

        // Parse credentials from integration
        let qradarCreds = alert.integration.credentials as any
        if (typeof qradarCreds === "string") {
          qradarCreds = JSON.parse(qradarCreds)
        }

        const qHost = qradarCreds.host
        const apiKey = qradarCreds.api_key

        if (!qHost || !apiKey) {
          throw new Error("QRadar credentials missing (host or api_key)")
        }

        // Map app status to QRadar status
        const statusMap: Record<string, string> = {
          "New": "OPEN",
          "In Progress": "FOLLOW_UP",
          "Closed": "CLOSED",
          "Ignored": "CLOSED",
        }

        const qradarStatus = statusMap[status] || "OPEN"

        console.log(`[v0] QRadar: Updating offense ${offenseId} (domain ${domainId}) to status: ${qradarStatus}`)

        const qradarClient = new QRadarClient({ host: qHost, api_key: apiKey, domain_id: domainId })
        await qradarClient.updateOffenseStatus(offenseId, qradarStatus as "OPEN" | "FOLLOW_UP" | "CLOSED", assignedTo, closingReasonId)

        console.log(`[v0] QRadar: Successfully updated offense ${offenseId} to ${qradarStatus}`)

        // Add comment/note to QRadar if provided
        if (comments && comments.trim()) {
          try {
            const noteText = `[${user.name || user.email || "System"}] ${comments}`
            console.log(`[v0] QRadar: Adding note to offense ${offenseId}:`, noteText)
            
            const noteResponse = await qradarClient.createNote(offenseId, noteText)
            console.log(`[v0] QRadar: Created note ${noteResponse.id} on offense ${offenseId}`)

            const localNote = {
              id: noteResponse.id,
              create_time: noteResponse.create_time,
              username: noteResponse.username || user.name || user.email || "System",
              note_text: noteResponse.note_text || noteText,
            }

            // Persist QRadar notes locally on alert metadata for quick UI access.
            const latestAlert = await prisma.alert.findUnique({
              where: { id: alertId },
              select: { metadata: true },
            })

            const latestAlertMeta = (latestAlert?.metadata as any) || {}
            const existingAlertNotes = Array.isArray(latestAlertMeta?.qradar?.notes)
              ? latestAlertMeta.qradar.notes
              : []

            await prisma.alert.update({
              where: { id: alertId },
              data: {
                metadata: {
                  ...latestAlertMeta,
                  qradar: {
                    ...(latestAlertMeta.qradar || {}),
                    notes: [...existingAlertNotes, localNote],
                    notesLastSyncedAt: new Date().toISOString(),
                  },
                },
              },
            })

            // Persist QRadar notes locally on offense metadata as source-of-truth cache.
            const existingOffense = await prisma.qRadarOffense.findFirst({
              where: { externalId: Number(offenseId), integrationId: alert.integrationId },
              select: { id: true, metadata: true },
            })

            if (existingOffense) {
              const offenseMeta = (existingOffense.metadata as any) || {}
              const existingOffenseNotes = Array.isArray(offenseMeta.notes) ? offenseMeta.notes : []

              await prisma.qRadarOffense.update({
                where: { id: existingOffense.id },
                data: {
                  metadata: {
                    ...offenseMeta,
                    notes: [...existingOffenseNotes, localNote],
                    notesLastSyncedAt: new Date().toISOString(),
                  },
                },
              })
            }
          } catch (noteError) {
            console.warn(`[v0] QRadar: Failed to create note on offense ${offenseId}:`, noteError)
            // Don't fail the whole update if note creation fails
          }
        }

        if (closingReasonId) {
          console.log(`[v0] QRadar: Offense ${offenseId} closed with reason ID: ${closingReasonId}`)
        }
      } catch (error) {
        console.error("[v0] Error updating QRadar offense:", error)
        // Don't fail the whole request if QRadar update fails - local database is already updated
      }
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

        // Parse tagsToAdd and tagsToDelete if provided as strings
        let tagsToAdd: string[] | undefined
        let tagsToDelete: string[] | undefined

        if (body.tagsToAdd) {
          tagsToAdd = Array.isArray(body.tagsToAdd) ? body.tagsToAdd : [body.tagsToAdd]
        }

        if (body.tagsToDelete) {
          tagsToDelete = Array.isArray(body.tagsToDelete) ? body.tagsToDelete : [body.tagsToDelete]
        }

        await updateStellarCyberAlertStatus({
          index: computedIndex,
          alertId: eventId,
          status: status as AlertStatus,
          comments,
          assignee: assignedTo,
          tagsToAdd,
          tagsToDelete,
          integrationId: alert.integrationId,
          userId: userId || user.id,
        })
      } catch (error) {
        console.error("Error updating alert status in Stellar Cyber:", error)
        // Lanjutkan meskipun gagal update di Stellar Cyber
      }
    } else if (alert.integration.source === "socfortress" || alert.integration.source === "copilot") {
      // If alert is from SOCFortress, update there as well
      try {
        console.log(`[SOCFortress] Updating alert ${alert.externalId}...`)
        
        // Map UI status to SOCFortress status format
        const statusMap: Record<string, string> = {
          "New": "OPEN",
          "In Progress": "IN_PROGRESS",
          "Closed": "CLOSED",
          "Ignored": "CLOSED",
        }
        
        const socfortressStatus = statusMap[status as string] || (status as string)
        
        // Update in SOCFortress MySQL
        await updateSocfortressAlertStatus(
          alert.integrationId,
          alert.externalId,
          socfortressStatus,
          {
            comments: comments,
            assignedTo: assignedTo,
            severity: severity,
            tagsToAdd: tagsToAdd,
            tagsToDelete: tagsToDelete,
          }
        )
        
        console.log(`[SOCFortress] Updated alert ${alert.externalId} in MySQL`)
      } catch (error) {
        console.error("Error updating alert status in SOCFortress:", error)
        // Continue even if update in SOCFortress fails
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

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasPermission(user.role, 'delete_alert')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to delete alerts" }, { status: 403 })
    }

    const alertId = (await params).id
    if (!alertId) return NextResponse.json({ error: 'Missing alert id' }, { status: 400 })

    // Find alert first
    const alert = await prisma.alert.findUnique({ where: { id: alertId } })
    if (!alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 })

    // Delete alert and related timeline entries
    await prisma.$transaction([
      prisma.alertTimeline.deleteMany({ where: { alertId } }),
      prisma.alert.delete({ where: { id: alertId } }),
    ])

    console.log(`[DELETE] Alert ${alertId} deleted by user ${user.id}`)

    return NextResponse.json({ success: true, message: 'Alert deleted' })
  } catch (error) {
    console.error('Error in DELETE /api/alerts/[id]:', error)
    return NextResponse.json({ error: 'Failed to delete alert' }, { status: 500 })
  }
}
