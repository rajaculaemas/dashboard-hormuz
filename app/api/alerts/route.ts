import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"
import { getUserAccessibleIntegrations } from "@/lib/auth/password"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get("integrationId")
    const integrationIds = searchParams.get("integrationIds") // comma-separated
    const timeRange = searchParams.get("time_range") || "7d"
    const fromDate = searchParams.get("from_date")
    const toDate = searchParams.get("to_date")
    const status = searchParams.get("status")
    const severity = searchParams.get("severity")
    const search = searchParams.get("search")?.toLowerCase().trim() || ""
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1") || 1)
    const limit = Math.max(1, Number.parseInt(searchParams.get("limit") || "50") || 50)
    const offset = (page - 1) * limit

    console.log("=== FETCHING ALERTS ===")
    console.log("User ID:", currentUser.userId)
    console.log("Integration ID (single):", integrationId)
    console.log("Integration IDs (multiple):", integrationIds)
    console.log("Time Range:", timeRange)
    console.log("Date Range Received:", { fromDate, toDate })

    // Get user's accessible integrations
    const accessibleIntegrations = await getUserAccessibleIntegrations(currentUser.userId)
    console.log("Accessible integrations for user:", accessibleIntegrations)

    // Build integration filter
    let integrationFilter: any
    // Handle multiple integration IDs (comma-separated)
    if (integrationIds && integrationIds !== "all") {
      const requestedIds = integrationIds.split(',').map((id: string) => id.trim())
      // Check that user has access to all requested integrations
      const unauthorized = requestedIds.filter((id: string) => !accessibleIntegrations.includes(id))
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { error: `You do not have access to these integrations: ${unauthorized.join(', ')}` },
          { status: 403 }
        )
      }
      integrationFilter = { in: requestedIds }
    } else if (integrationId && integrationId !== "all") {
      // Backward compatibility: single integration ID
      // User requested specific integration - check if they have access
      if (!accessibleIntegrations.includes(integrationId)) {
        return NextResponse.json(
          { error: 'You do not have access to this integration' },
          { status: 403 }
        )
      }
      integrationFilter = integrationId
    } else {
      // No specific integration selected - filter by accessible ones
      integrationFilter = { in: accessibleIntegrations }
    }

    console.log("Integration filter:", integrationFilter)

    // Calculate time range
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    // If absolute date range provided, use it
    if (fromDate && toDate) {
      // If client sent full ISO datetimes (contains 'T'), parse them directly
      // so hour/minute precision is preserved. Otherwise fall back to the
      // existing date-only handling (assumes YYYY-MM-DD in user's local TZ).
      if (fromDate.includes("T") || toDate.includes("T")) {
        startDate = new Date(fromDate)
        endDate = new Date(toDate)
        console.log("Using absolute datetime range (ISO):", {
          rawFromDate: fromDate,
          rawToDate: toDate,
          startDateUTC: startDate.toISOString(),
          endDateUTC: endDate.toISOString(),
        })
      } else {
        // fromDate and toDate are user's local dates (YYYY-MM-DD) in UTC+7 timezone
        // We need to convert these to UTC for database query
        const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000

        // Create UTC midnight times first
        const fromUTC = new Date(fromDate + 'T00:00:00Z')
        const toUTC = new Date(toDate + 'T00:00:00Z')

        // Subtract 7 hours to get the actual UTC time when that local date starts
        // Example: "2025-12-09" in UTC+7 starts at "2025-12-08T17:00:00Z"
        startDate = new Date(fromUTC.getTime() - UTC_PLUS_7_OFFSET_MS)

        // For end date, we want the last second of that date in UTC+7
        // Which is 7 hours before the start of the next day in UTC+7
        // Example: "2025-12-16" in UTC+7 ends at "2025-12-16T16:59:59Z"
        const nextDayUTC = new Date(toUTC.getTime() + 24 * 60 * 60 * 1000)
        endDate = new Date(nextDayUTC.getTime() - UTC_PLUS_7_OFFSET_MS - 1)

        console.log("Using absolute date range (UTC+7):", {
          rawFromDate: fromDate,
          rawToDate: toDate,
          startDateUTC: startDate.toISOString(),
          endDateUTC: endDate.toISOString(),
        })
      }
    } else {
      // Otherwise use relative time range
      switch (timeRange) {
        case "1h":
          startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000)
          break
        case "2h":
          startDate = new Date(now.getTime() - 2 * 60 * 60 * 1000)
          break
        case "3h":
          startDate = new Date(now.getTime() - 3 * 60 * 60 * 1000)
          break
        case "6h":
          startDate = new Date(now.getTime() - 6 * 60 * 60 * 1000)
          break
        case "12h":
          startDate = new Date(now.getTime() - 12 * 60 * 60 * 1000)
          break
        case "24h":
        case "1d":
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        case "all":
          startDate = new Date("2000-01-01")
          break
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      }
      console.log("Using relative time range:", startDate)
    }

    // Build where clause
    const whereClause: any = {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      integrationId: integrationFilter,
    }

    if (status && status !== "all") {
      whereClause.status = status
    }

    if (severity && severity !== "all") {
      whereClause.severity = severity
    }

    // Add search filter if search query is provided
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { id: { contains: search, mode: "insensitive" } },
      ]
    }

    console.log("Where clause:", JSON.stringify(whereClause, null, 2))

    // Fetch alerts with pagination
    const [alerts, totalCount] = await Promise.all([
      prisma.alert.findMany({
        where: whereClause,
        include: {
          integration: {
            select: {
              id: true,
              name: true,
              source: true,
            },
          },
        },
        orderBy: {
          timestamp: "desc",
        },
        skip: offset,
        take: limit,
      }),
      prisma.alert.count({
        where: whereClause,
      }),
    ])

    console.log("Found", alerts.length, "alerts out of", totalCount, "total")
    
    // Debug: Check what's in metadata
    if (alerts.length > 0) {
      console.log("[MTTD Debug] First alert user_action:", alerts[0].metadata?.user_action ? "EXISTS" : "MISSING")
      if (alerts[0].metadata?.user_action) {
        console.log("[MTTD Debug] User action history length:", alerts[0].metadata.user_action.history?.length || 0)
      }
    }

    // Calculate statistics
    const stats = await prisma.alert.aggregate({
      where: whereClause,
      _count: {
        id: true,
      },
    })

    const statusStats = await prisma.alert.groupBy({
      by: ["status"],
      where: whereClause,
      _count: {
        id: true,
      },
    })

    const severityStats = await prisma.alert.groupBy({
      by: ["severity"],
      where: whereClause,
      _count: {
        id: true,
      },
    })

    // Format statistics
    const formattedStats = {
      total: stats._count.id,
      open: statusStats.find((s) => s.status === "Open")?._count.id || 0,
      inProgress: statusStats.find((s) => s.status === "In Progress")?._count.id || 0,
      resolved: statusStats.find((s) => s.status === "Resolved")?._count.id || 0,
      closed: statusStats.find((s) => s.status === "Closed")?._count.id || 0,
      critical: severityStats.find((s) => s.severity === "Critical")?._count.id || 0,
      high: severityStats.find((s) => s.severity === "High")?._count.id || 0,
      medium: severityStats.find((s) => s.severity === "Medium")?._count.id || 0,
      low: severityStats.find((s) => s.severity === "Low")?._count.id || 0,
    }

    console.log("Stats:", formattedStats)
    
    // Debug: Log first alert's metadata structure and tag sources
    if (alerts.length > 0) {
      const firstAlert = alerts[0] as any
      console.log("[DEBUG] First alert metadata keys:", Object.keys(firstAlert.metadata || {}).sort())
      console.log("[DEBUG] First alert has user_action:", !!(firstAlert.metadata?.user_action))
      console.log("[DEBUG] First alert user_action keys:", Object.keys(firstAlert.metadata?.user_action || {}).sort())
      
      // Check all possible tag locations
      const meta = firstAlert.metadata || {}
      console.log("[DEBUG TAGS] Checking tag sources for first alert:")
      console.log("  - metadata.event_tags (Stellar):", Array.isArray(meta.event_tags) ? `array with ${meta.event_tags.length} items` : (meta.event_tags ? `${typeof meta.event_tags}` : 'NOT FOUND'))
      if (Array.isArray(meta.event_tags) && meta.event_tags.length > 0) {
        console.log("    First event_tag:", meta.event_tags[0])
      }
      console.log("  - metadata.tags (SOCFortress):", Array.isArray(meta.tags) ? `array with ${meta.tags.length} items: ${JSON.stringify(meta.tags)}` : (meta.tags ? `${typeof meta.tags}` : 'NOT FOUND'))
      console.log("  - metadata.closing_reason (QRadar):", meta.closing_reason ? `"${meta.closing_reason}"` : 'NOT FOUND')
      console.log("  - metadata.copilot_tags:", meta.copilot_tags ? `EXISTS (${Array.isArray(meta.copilot_tags) ? 'array' : typeof meta.copilot_tags})` : 'NOT FOUND')
      
      // Check assignee fields
      console.log("[DEBUG ASSIGNEE] Checking assignee sources for first alert:")
      console.log("  - metadata.assignee:", meta.assignee ? `"${meta.assignee}"` : 'NOT FOUND')
      console.log("  - metadata.socfortress.assigned_to:", meta.socfortress?.assigned_to ? `"${meta.socfortress.assigned_to}"` : 'NOT FOUND')
      console.log("  - metadata.qradar.assigned_to:", meta.qradar?.assigned_to ? `"${meta.qradar.assigned_to}"` : 'NOT FOUND')
      
      // Log integration info
      console.log("[DEBUG] First alert integration:", firstAlert.integration?.name || firstAlert.integrationId)
    }
    
    // Also check alert counts by integration for tag patterns
    const integrationBreakdown = await prisma.alert.groupBy({
      by: ["integrationId"],
      where: whereClause,
      _count: { id: true },
    })
    console.log("[DEBUG] Alert count by integration:")
    integrationBreakdown.forEach(ig => {
      const intName = alerts.find(a => a.integrationId === ig.integrationId)?.integration?.name || ig.integrationId
      console.log(`  - ${intName}: ${ig._count.id} alerts`)
    })

    // Merge QRadarOffense notes and IPs into Alert metadata for QRadar alerts
    // IMPORTANT: Also persist merged data to database so shift-notification & other services can rely on it
    const alertsWithQRadarNotes = await Promise.all(
      alerts.map(async (alert: any) => {
        const integration = alert.integration || {}
        const isQRadar = integration.source?.toLowerCase().includes("qradar")
        
        if (!isQRadar) return alert
        
        try {
          // Extract offense ID from externalId format: "qradar-{integrationId}-{offenseId}"
          const externalIdMatch = alert.externalId?.match(/qradar-[^-]+-(\d+)$/)
          if (!externalIdMatch) return alert
          
          const offenseId = Number(externalIdMatch[1])
          if (isNaN(offenseId)) return alert
          
          // Fetch QRadarOffense metadata which contains notes
          const qradarOffense = await prisma.qRadarOffense.findFirst({
            where: { externalId: offenseId, integrationId: alert.integrationId },
            select: { id: true, metadata: true },
          })
          
          const alertMeta = (alert.metadata as any) || {}
          const qradarMeta = alertMeta.qradar || {}
          let needsPersist = false
          
          // Merge notes if available - ALWAYS merge from QRadarOffense (single source of truth)
          if (qradarOffense?.metadata) {
            const metadata = (qradarOffense.metadata as any) || {}
            // Always use QRadarOffense notes - it's the primary cache from QRadar API
            if (metadata.notes && Array.isArray(metadata.notes) && metadata.notes.length > 0) {
              // Check if Alert already has these notes in database
              const existingNotes = qradarMeta.notes
              const hasNotesDiff =
                !Array.isArray(existingNotes) ||
                existingNotes.length !== metadata.notes.length ||
                JSON.stringify(existingNotes) !== JSON.stringify(metadata.notes)
              
              if (hasNotesDiff) {
                qradarMeta.notes = metadata.notes
                if (metadata.notesLastSyncedAt) {
                  qradarMeta.notesLastSyncedAt = metadata.notesLastSyncedAt
                }
                needsPersist = true
              }
            }
          }
          
          // Fetch and merge related events IPs if any are missing
          // Check all 4 IP fields: sourceip, destinationip, public_remote_ip, assigned_local_ip
          if (!qradarMeta.sourceip || !qradarMeta.destinationip || !qradarMeta.public_remote_ip || !qradarMeta.assigned_local_ip) {
            const relatedEvent = await prisma.qRadarEvent.findFirst({
              where: { offenseId },
              select: { sourceIp: true, destinationIp: true, metadata: true },
              orderBy: { eventTimestamp: 'desc' },
            })
            
            if (relatedEvent) {
              if (!qradarMeta.sourceip && relatedEvent.sourceIp) {
                qradarMeta.sourceip = relatedEvent.sourceIp
                needsPersist = true
              }
              if (!qradarMeta.destinationip && relatedEvent.destinationIp) {
                qradarMeta.destinationip = relatedEvent.destinationIp
                needsPersist = true
              }
              
              // Also merge public_remote_ip and assigned_local_ip if available
              const eventMeta = (relatedEvent.metadata as any) || {}
              if (!qradarMeta.public_remote_ip && eventMeta.public_remote_ip) {
                qradarMeta.public_remote_ip = eventMeta.public_remote_ip
                needsPersist = true
              }
              if (!qradarMeta.assigned_local_ip && eventMeta.assigned_local_ip) {
                qradarMeta.assigned_local_ip = eventMeta.assigned_local_ip
                needsPersist = true
              }
            }
          }
          
          if (Object.keys(qradarMeta).length > 0) {
            alertMeta.qradar = qradarMeta
            alert.metadata = alertMeta
            
            // IMPORTANT: Persist merged metadata back to database so it's available for:
            // - Shift notification service (for comment detection)
            // - Future fetches (don't need to re-merge)
            // - Audit and troubleshooting
            if (needsPersist) {
              try {
                await prisma.alert.update({
                  where: { id: alert.id },
                  data: { metadata: alertMeta },
                })
              } catch (persistErr: any) {
                console.warn(
                  `[QRadar Merge] Failed to persist merged metadata for alert ${alert.id}: ${persistErr.message}`
                )
                // Don't throw - still return the merged data to client even if persist failed
              }
            }
            
            // OPTIMIZATION: If alert doesn't have cached notes, trigger background sync
            // to fetch from QRadar API immediately (fire-and-forget, non-blocking)
            const alertHasNotes = Array.isArray(qradarMeta.notes) && qradarMeta.notes.length > 0
            if (!alertHasNotes && qradarOffense?.id) {
              // Trigger background sync via internal endpoint
              // This is async and won't block the response
              (async () => {
                try {
                  // Fetch from notes endpoint with forceRefresh to trigger API fetch
                  const notesRes = await fetch(
                    `http://localhost:3000/api/qradar/offenses/${offenseId}/notes?integrationId=${alert.integrationId}&forceRefresh=true`,
                    {
                      method: "GET",
                      headers: {
                        "x-internal-sync": "true",
                      },
                    }
                  ).catch(() => null)
                  
                  if (notesRes?.ok) {
                    console.log(
                      `[QRadar Sync] Background sync triggered for alert ${alert.id} (Offense ${offenseId})`
                    )
                  }
                } catch (err) {
                  // Silently fail - this is background optimization
                  console.debug(`[QRadar Sync] Background sync failed for offense ${offenseId}:`, err)
                }
              })()
            }
          }
        } catch (err) {
          console.error(`[QRadar Merge] Error enriching QRadar alert ${alert.id}:`, err)
        }
        
        return alert
      })
    )

    return NextResponse.json({
      success: true,
      data: alertsWithQRadarNotes,
      stats: formattedStats,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching alerts:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch alerts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, severity, status, integrationId, metadata } = body

    console.log("Creating new alert:", { name, severity, status, integrationId })

    // Validate required fields
    if (!name || !integrationId) {
      return NextResponse.json({ success: false, error: "Name and integration ID are required" }, { status: 400 })
    }

    // Check if integration exists
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }

    // Create alert
    const alert = await prisma.alert.create({
      data: {
        externalId: (body.externalId as string) || "",
        title: name,
        description: description || "",
        severity: severity || "Medium",
        status: status || "Open",
        timestamp: new Date(),
        integrationId,
        metadata: metadata || {},
      },
      include: {
        integration: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    console.log("Created alert:", alert.id)

    return NextResponse.json({
      success: true,
      data: alert,
      message: "Alert created successfully",
    })
  } catch (error) {
    console.error("Error creating alert:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create alert",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
