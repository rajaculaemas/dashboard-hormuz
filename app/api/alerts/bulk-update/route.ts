import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { updateAlertStatus as updateStellarCyberAlertStatus } from "@/lib/api/stellar-cyber"
import { updateAlertStatus as updateWazuhAlertStatus } from "@/lib/api/wazuh"
import { updateSocfortressAlertStatus } from "@/lib/api/socfortress"
import { QRadarClient } from "@/lib/api/qradar"
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
    const { alertIds, status, severity, comments, assignee, tags, stellarTagsToAdd, stellarTagsToDelete, severityBasedOnAnalysis, analysisNotes, closingReasonId } = body

    console.log(`[BulkUpdate] Starting bulk update for ${alertIds?.length || 0} alerts:`, {
      status, assignee, closingReasonId, hasComments: !!comments, hasAnalysisNotes: !!analysisNotes
    })

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

    const updateResults = {
      successful: 0,
      failed: 0,
      errors: [] as string[]
    }

    // Process each alert
    for (const alertId of alertIds) {
      const alert = await prisma.alert.findUnique({ where: { id: alertId }, include: { integration: true } })
      if (!alert) {
        console.warn(`[BulkUpdate] Alert ${alertId} not found`)
        continue
      }
      
      console.log(`[BulkUpdate] Processing alert ${alertId} (integration: ${alert.integration?.source})`)

      const previousStatus = alert.status
      const previousSeverity = alert.severity

      // Update database
      try {
        await prisma.alert.update({
          where: { id: alertId },
          data: {
            status: normalizedStatus || alert.status,
            ...(severity && { severity }),
            metadata: {
              ...(typeof alert.metadata === 'object' && alert.metadata !== null ? alert.metadata : {}),
              assignee,
              ...(tags && tags.length > 0 ? { tags } : {}),
              ...(stellarTagsToAdd && stellarTagsToAdd.length > 0 ? { stellarTagsToAdd } : {}),
              ...(stellarTagsToDelete && stellarTagsToDelete.length > 0 ? { stellarTagsToDelete } : {}),
              ...(severityBasedOnAnalysis ? { severityBasedOnAnalysis } : {}),
              ...(analysisNotes ? { analysisNotes } : {}),
              statusUpdatedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          },
        })
        
        updateResults.successful++
        console.log(`[BulkUpdate] ✓ Alert ${alertId} updated in database`)
      } catch (dbErr) {
        console.error(`[BulkUpdate] ✗ Failed to update database for alert ${alertId}:`, dbErr)
        updateResults.failed++
        updateResults.errors.push(`Alert ${alertId}: Failed to update database`)
        continue
      }

      // Use consistent timestamp for all events in this alert update
      const eventTimestamp = new Date()
      const alertTimelineEvents: any[] = []

      if (previousStatus !== normalizedStatus) {
        alertTimelineEvents.push({
          alertId,
          eventType: 'status_change',
          description: `Status changed from "${previousStatus}" to "${normalizedStatus}"`,
          oldValue: previousStatus,
          newValue: normalizedStatus,
          changedBy: user.name || user.email || 'System',
          changedByUserId: user.id,
          timestamp: eventTimestamp,
        })
      }

      if (severity && severity !== previousSeverity) {
        alertTimelineEvents.push({
          alertId,
          eventType: 'severity_change',
          description: `Severity changed from "${previousSeverity || 'Not Set'}" to "${severity}"`,
          oldValue: previousSeverity || '',
          newValue: severity,
          changedBy: user.name || user.email || 'System',
          changedByUserId: user.id,
          timestamp: eventTimestamp,
        })
      }

      if (comments) {
        alertTimelineEvents.push({
          alertId,
          eventType: 'comment',
          description: comments,
          changedBy: user.name || user.email || 'System',
          changedByUserId: user.id,
          timestamp: eventTimestamp,
        })
      }

      if (analysisNotes) {
        alertTimelineEvents.push({
          alertId,
          eventType: 'analysis_note',
          description: analysisNotes,
          changedBy: user.name || user.email || 'System',
          changedByUserId: user.id,
          timestamp: eventTimestamp,
        })
      }

      // Update source systems where applicable
      try {
        if (alert.integration?.source === 'wazuh' && alert.externalId) {
          await updateWazuhAlertStatus(alert.externalId, normalizedStatus || alert.status, assignee, severity)
        } else if (alert.integration?.source === 'qradar' && alert.externalId) {
          // QRadar bulk update
          try {
            // Parse credentials (safeguard if stored as JSON string, same as single update route)
            let creds = alert.integration.credentials as any
            if (typeof creds === "string") {
              creds = JSON.parse(creds)
            }

            const qradarMeta = (alert.metadata as any)?.qradar || {}

            // Use qradarMeta.id (same as single update) - alert.externalId has format
            // "qradar-{integrationId}-{offenseId}" so parseInt would return NaN
            const offenseId = qradarMeta.id
            if (!offenseId) {
              console.warn(`[BulkUpdate] QRadar: Cannot determine offenseId for alert ${alertId}, skipping QRadar update`)
              throw new Error(`Missing QRadar offense ID in metadata for alert ${alertId}`)
            }

            const qHost = creds.host
            const apiKey = creds.api_key
            if (!qHost || !apiKey) {
              throw new Error(`QRadar credentials missing (host or api_key) for alert ${alertId}`)
            }

            // Get domain_id from metadata (most reliable source) or credentials
            const domainId = qradarMeta.domain_id || (creds.domain_id ? Number(creds.domain_id) : undefined)
            
            console.log(`[BulkUpdate] QRadar: Updating offense ${offenseId} (domain_id: ${domainId}) to status: ${normalizedStatus}`)
            
            const qradarClient = new QRadarClient({
              host: qHost,
              api_key: apiKey,
              domain_id: domainId,
            })

            // Match status mapping from single update route
            const qradarStatusMap: Record<string, string> = {
              'New': 'OPEN',
              'Open': 'OPEN',
              'In Progress': 'FOLLOW_UP',
              'Closed': 'CLOSED',
              'Ignored': 'CLOSED',
            }
            const qradarStatus = (qradarStatusMap[normalizedStatus] || 'OPEN') as "OPEN" | "FOLLOW_UP" | "CLOSED"
            
            const updateResult = await qradarClient.updateOffenseStatus(
              offenseId,
              qradarStatus as "OPEN" | "FOLLOW_UP" | "CLOSED",
              assignee,
              closingReasonId,
            )
            
            console.log(`[BulkUpdate] QRadar: Successfully updated offense ${offenseId} to ${qradarStatus}`)
            
            // Add comment/note to QRadar if provided
            if (comments && comments.trim()) {
              try {
                const noteText = `[${user.name || user.email || 'Bulk Update'}] ${comments}`
                console.log(`[BulkUpdate] QRadar: Adding note to offense ${offenseId}`)
                const noteResponse = await qradarClient.createNote(offenseId, noteText)
                console.log(`[BulkUpdate] QRadar: Created note ${noteResponse.id} on offense ${offenseId}`)
              } catch (noteError) {
                console.warn(`[BulkUpdate] QRadar: Failed to create note on offense ${offenseId}:`, noteError)
                // Don't fail the whole update if note creation fails
              }
            }
          } catch (qradarErr) {
            console.error(`[BulkUpdate] Error updating QRadar offense ${parseInt(alert.externalId)}:`, qradarErr)
            // Log but don't fail - local database is already updated
          }
        } else if (alert.integration?.source === 'stellar-cyber' && alert.externalId) {
          // Stellar Cyber bulk update with tags support
          let tagsToAdd: string[] | undefined
          let tagsToDelete: string[] | undefined
          
          if (tags && Array.isArray(tags)) {
            const originalTags = (alert.metadata as any)?.tags || []
            tagsToAdd = tags.filter((tag: string) => !originalTags.includes(tag))
            tagsToDelete = originalTags.filter((tag: string) => !tags.includes(tag))
          }
          
          try {
            const updateResult = await updateStellarCyberAlertStatus({ 
              index: (alert as any).index || alert.metadata?.index || '', 
              alertId: alert.externalId, 
              status: normalizedStatus as any, 
              comments,
              tagsToAdd,
              tagsToDelete,
              integrationId: alert.integrationId,
              userId: user.id  // CRITICAL - needed for JWT API key
            })
            
            if (!updateResult.success) {
              console.warn(`[BulkUpdate] Stellar Cyber update failed for alert ${alert.externalId}:`, updateResult.message)
            }
          } catch (stellarErr) {
            console.error(`[BulkUpdate] Error updating Stellar Cyber alert ${alert.externalId}:`, stellarErr)
          }
        } else if ((alert.integration?.source === 'socfortress' || alert.integration?.source === 'copilot') && alert.externalId) {
          // Calculate tag changes for Socfortress
          let tagsToAdd: string[] | undefined
          let tagsToDelete: string[] | undefined
          
          if (tags && Array.isArray(tags)) {
            const originalTags = (alert.metadata as any)?.tags || []
            tagsToAdd = tags.filter((tag: string) => !originalTags.includes(tag))
            tagsToDelete = originalTags.filter((tag: string) => !tags.includes(tag))
          }
          
          await updateSocfortressAlertStatus(alert.integrationId, alert.externalId, normalizedStatus || alert.status, {
            comments,
            assignedTo: assignee,
            severity,
            tagsToAdd,
            tagsToDelete,
          })
        }
      } catch (err) {
        console.error(`[BulkUpdate] Error updating source system for alert ${alertId}:`, err)
        updateResults.errors.push(`Alert ${alertId}: Source system update failed - ${err instanceof Error ? err.message : String(err)}`)
      }

      // Save timeline events for this alert immediately (per-alert, not batched)
      if (alertTimelineEvents.length > 0) {
        try {
          await prisma.alertTimeline.createMany({ data: alertTimelineEvents })
          console.log(`[BulkUpdate] Created ${alertTimelineEvents.length} timeline events for alert ${alertId}`)
        } catch (err) {
          console.error(`[BulkUpdate] Failed to write timeline events for alert ${alertId}:`, err)
        }
      }
    }

    // Refresh and return
    console.log(`[BulkUpdate] Completed - Successful: ${updateResults.successful}, Failed: ${updateResults.failed}`)
    if (updateResults.errors.length > 0) {
      console.log(`[BulkUpdate] Errors:`, updateResults.errors)
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Bulk update completed. Updated ${updateResults.successful} alerts${updateResults.failed > 0 ? ` (${updateResults.failed} had errors)` : ''}`,
      summary: {
        total: alertIds.length,
        successful: updateResults.successful,
        failed: updateResults.failed,
        errors: updateResults.errors
      }
    })
  } catch (error) {
    console.error('Error in /api/alerts/bulk-update:', error)
    return NextResponse.json({ error: 'Failed to perform bulk update' }, { status: 500 })
  }
}
