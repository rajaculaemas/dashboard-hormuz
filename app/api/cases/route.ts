import { type NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'
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
    const timeRange = searchParams.get("time_range") || "7d"
    const fromDate = searchParams.get("from_date")
    const toDate = searchParams.get("to_date")
    const status = searchParams.get("status")
    const severity = searchParams.get("severity")

    console.log("=== FETCHING CASES ===")
    console.log("User ID:", currentUser.userId)
    console.log("Integration ID:", integrationId)
    console.log("Time Range:", timeRange)

    // Get user's accessible integrations
    const accessibleIntegrations = await getUserAccessibleIntegrations(currentUser.userId)
    console.log("Accessible integrations for user:", accessibleIntegrations)

    // Build integration filter
    let integrationFilter: any
    if (integrationId) {
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

    // Build where clause
    const where: any = {
      integrationId: integrationFilter,
    }

    if (status && status !== "all") {
      where.status = status
    }

    if (severity && severity !== "all") {
      where.severity = severity
    }

    // Add time range filter
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    // If absolute date range provided, use it
    if (fromDate && toDate) {
      // Parse YYYY-MM-DD format as UTC+7 local date
      // fromDate is like "2025-12-10" which should be Dec 10 00:00 UTC+7
      // We need to convert this to UTC for database query
      
      // Parse as UTC first
      const fromUTC = new Date(fromDate + 'T00:00:00Z')
      const toUTC = new Date(toDate + 'T00:00:00Z')
      
      // Adjust by UTC+7 offset (subtract 7 hours to get back to UTC)
      // UTC+7 means local time is 7 hours ahead, so to convert local to UTC we subtract 7 hours
      const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000
      startDate = new Date(fromUTC.getTime() - UTC_PLUS_7_OFFSET_MS)
      endDate = new Date(toUTC.getTime() - UTC_PLUS_7_OFFSET_MS)
      
      // Set end date to end of day (23:59:59.999) in UTC to include all cases on that calendar day
      endDate.setUTCHours(23, 59, 59, 999)
      
      console.log("Using absolute date range (UTC+7):", {
        rawFromDate: fromDate,
        rawToDate: toDate,
        startDateUTC: startDate.toISOString(),
        endDateUTC: endDate.toISOString(),
      })
    } else if (timeRange !== "all") {
      // Otherwise use relative time range
      switch (timeRange) {
        case "1h":
          startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000) // 1 hour ago
          break
        case "12h":
          startDate = new Date(now.getTime() - 12 * 60 * 60 * 1000) // 12 hours ago
          break
        case "24h":
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago
          break
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
          break
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
          break
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) // 90 days ago
          break
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // Default 7 days
      }
    } else {
      // "all" time range
      startDate = new Date("2000-01-01")
    }

    if (timeRange !== "all" || (fromDate && toDate)) {
      where.createdAt = {
        gte: startDate,
        lte: endDate,
      }

      console.log("Time filter applied:", {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })
    }

    console.log("Where clause:", JSON.stringify(where, null, 2))

    // For QRadar integrations, fetch QRadarOffenses with status FOLLOW_UP instead of Case table
    let cases: any[] = []

    if (integrationId) {
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      })

      if (integration?.source === "qradar") {
        // Return alerts (from the alerts table) that represent QRadar follow-up.
        // We treat alerts with status "In Progress", "Closed", OR metadata.qradar.follow_up === true as QRadar cases.
        const alertWhere: any = {
          integrationId,
          OR: [
            { status: "In Progress" },
            { status: "Closed" },
            { metadata: { path: ["qradar", "follow_up"], equals: true } },
          ],
        }

        // Apply time filter if present (where.createdAt was built earlier)
        if (where.createdAt) {
          alertWhere.timestamp = where.createdAt
        }

        if (severity && severity !== "all") {
          alertWhere.severity = severity
        }

        const alerts = await prisma.alert.findMany({
          where: alertWhere,
          include: {
            integration: {
              select: { id: true, name: true, source: true },
            },
          },
          orderBy: { timestamp: "desc" },
        })

        // Map alerts to case-like structure
        cases = alerts.map((a) => ({
          id: a.id,
          externalId: a.externalId || a.id,
          ticketId: null,
          name: a.title,
          description: a.description,
          status: a.status,
          severity: a.severity,
          assignee: a.metadata?.assignee || a.metadata?.qradar?.assigned_to || null,
          assigneeName: a.metadata?.assignee || a.metadata?.qradar?.assigned_to || null,
          createdAt: a.timestamp || new Date(),
          updatedAt: a.updatedAt || a.timestamp || new Date(),
          acknowledgedAt: null,
          integrationId: a.integrationId,
          integration: a.integration,
          metadata: a.metadata,
        }))

        console.log(`Found ${cases.length} QRadar alerts with status In Progress`)
      } else {
        // Fetch Stellar Cyber cases from Case table
        cases = await prisma.case.findMany({
          where,
          include: {
            integration: {
              select: {
                id: true,
                name: true,
                source: true,
              },
            },
            relatedAlerts: {
              include: {
                alert: {
                  select: {
                    id: true,
                    timestamp: true,
                    metadata: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        })

        console.log(`Found ${cases.length} Stellar Cyber cases in database`)
      }
    } else {
      // No integration selected, fetch from Case table
      cases = await prisma.case.findMany({
        where,
        include: {
          integration: {
            select: {
              id: true,
              name: true,
              source: true,
            },
          },
          relatedAlerts: {
            include: {
              alert: {
                select: {
                  id: true,
                  timestamp: true,
                  metadata: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      console.log(`Found ${cases.length} cases in database`)
    }

    // Log some sample cases for debugging
    if (cases.length > 0) {
      console.log("Sample cases with dates:")
      cases.slice(0, 3).forEach((c, i) => {
        console.log(`  Case ${i + 1}: ${c.name}`)
        console.log(`    Created: ${c.createdAt.toISOString()}`)
        console.log(`    Status: ${c.status}`)
        console.log(`    Severity: ${c.severity}`)
      })
    }

    // Transform cases to include computed fields and flatten alerts
    const transformedCases = cases.map((caseItem) => ({
      ...caseItem,
      // Flatten relatedAlerts to alerts array for frontend compatibility
      alerts: (caseItem as any).relatedAlerts
        ? (caseItem as any).relatedAlerts.map((ra: any) => ({
            id: ra.alert?.id,
            timestamp: ra.alert?.timestamp,
            metadata: ra.alert?.metadata,
          }))
        : [],
      mttd:
        caseItem.createdAt && caseItem.acknowledgedAt
          ? Math.round((caseItem.acknowledgedAt.getTime() - caseItem.createdAt.getTime()) / (1000 * 60)) // minutes
          : null,
    }))

    // Calculate stats
    const stats = {
      total: cases.length,
      open: cases.filter((c) => c.status?.toLowerCase() === "open" || c.status?.toLowerCase() === "new").length,
      inProgress: cases.filter((c) => c.status?.toLowerCase() === "in progress").length,
      resolved: cases.filter((c) => c.status?.toLowerCase() === "resolved").length,
      critical: cases.filter((c) => c.severity?.toLowerCase() === "critical").length,
      avgMttd:
        transformedCases.length > 0
          ? Math.round(transformedCases.reduce((sum, c) => sum + (c.mttd || 0), 0) / transformedCases.length)
          : 0,
    }

    console.log("Stats:", stats)

    return NextResponse.json({
      success: true,
      data: transformedCases,
      stats,
    })
  } catch (error) {
    console.error("Error in GET /api/cases:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch cases",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
