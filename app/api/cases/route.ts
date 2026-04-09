import { type NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"
import { getUserAccessibleIntegrations } from "@/lib/auth/password"
import { getSocfortressCases } from "@/lib/api/socfortress"

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

      console.log(`[API] Looking up integration: ${integrationId}`)
      console.log(`[API] Integration found:`, integration ? { id: integration.id, name: integration.name, source: integration.source } : "NOT FOUND")

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
      } else if (integration?.source === "socfortress" || integration?.source === "copilot" || integration?.name?.toLowerCase().includes("socfortress")) {
        // Fetch SOCFortress/Copilot cases directly from MySQL
        console.log(`[API] ✓ SOCFortress integration detected: ${integration.name}`)
        console.log(`[API] Fetching SOCFortress cases for integration: ${integration.name}`)
        try {
          const result = await getSocfortressCases(integrationId, { limit: 500 })
          console.log(`[API] getSocfortressCases returned ${result.cases.length} cases with alerts`)
          
          cases = result.cases.map((caseData: any) => {
            console.log(`[API] Mapping case ${caseData.externalId}: ${caseData.alerts?.length || 0} alerts, MTTR: ${caseData.mttrMinutes || 'N/A'}`)
            console.log(`[API] Case ${caseData.externalId} metadata:`, caseData.metadata)
            console.log(`[API] Case ${caseData.externalId} has case_history:`, caseData.metadata?.case_history?.length || 0)
            return {
              id: caseData.externalId,
              externalId: caseData.externalId,
              ticketId: parseInt(caseData.externalId),
              name: caseData.name,
              description: caseData.description,
              status: caseData.status,
              severity: caseData.severity,
              assignee: caseData.metadata?.socfortress?.assigned_to || null,
              assigneeName: caseData.metadata?.socfortress?.assigned_to || null,
              createdAt: new Date(caseData.timestamp),
              updatedAt: new Date(caseData.timestamp),
              acknowledgedAt: null,
              integrationId: caseData.integrationId,
              integration: {
                id: caseData.integrationId,
                name: integration.name,
                source: integration.source,
              },
              metadata: caseData.metadata || {},
              mttrMinutes: caseData.mttrMinutes || null,
              alerts: caseData.alerts || [],
            }
          })
          
          console.log(`Found ${cases.length} SOCFortress cases with total alerts: ${cases.reduce((sum: number, c: any) => sum + (c.alerts?.length || 0), 0)}`)
        } catch (error) {
          console.error("Error fetching SOCFortress cases:", error)
          cases = []
        }
      } else {
        // Fetch Stellar Cyber cases from Case table
        console.log(`[API] Using Stellar Cyber path for integration: ${integration?.name} (source: ${integration?.source})`)
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
        console.log(`    Metadata keys: ${Object.keys((c as any).metadata || {}).join(", ")}`)
      })
    }

    // Transform cases to include computed fields and flatten alerts
    const transformedCases = cases.map((caseItem) => {
      const transformed = {
        ...caseItem,
        // For Wazuh: flatten relatedAlerts to alerts array
        // For SOCFortress: preserve the alerts array as-is
        alerts: (caseItem as any).relatedAlerts && (caseItem as any).relatedAlerts.length > 0
          ? (caseItem as any).relatedAlerts.map((ra: any) => ({
              id: ra.alert?.id,
              timestamp: ra.alert?.timestamp,
              metadata: ra.alert?.metadata,
            }))
          : ((caseItem as any).alerts || []), // Keep existing alerts if relatedAlerts not present
        mttd:
          caseItem.createdAt && caseItem.acknowledgedAt
            ? Math.round((caseItem.acknowledgedAt.getTime() - caseItem.createdAt.getTime()) / (1000 * 60)) // minutes
            : null,
        // Explicitly preserve metadata to ensure it's not dropped by spread operator
        metadata: (caseItem as any).metadata || {},
      }
      
      // Debug logging for case 77
      if (transformed.id === '77') {
        console.log(`[API Transform] Case 77 before spread metadata:`, (caseItem as any).metadata)
        console.log(`[API Transform] Case 77 after spread metadata:`, transformed.metadata)
      }
      
      return transformed
    })

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
    console.log("[API] Final transformedCases:", {
      count: transformedCases.length,
      firstCase: transformedCases[0] ? {
        id: transformedCases[0].id,
        name: transformedCases[0].name,
        alerts: transformedCases[0].alerts?.length || 0
      } : null
    })
    // Log sample response structure
    if (transformedCases.length > 0) {
      const sampleCase = transformedCases[0]
      console.log(`[API RESPONSE] Sample case 0:`)
      console.log(`  id: ${sampleCase.id}`)
      console.log(`  metadata exists: ${!!sampleCase.metadata}`)
      console.log(`  metadata keys: ${Object.keys((sampleCase as any).metadata || {}).join(", ")}`)
      if ((sampleCase as any).metadata?.case_history) {
        console.log(`  case_history entries in response: ${(sampleCase as any).metadata.case_history.length}`)
      }
    }
    
    // CRITICAL: Log case 77 specifically before JSON serialization
    const case77 = transformedCases.find((c: any) => c.id === '77')
    if (case77) {
      console.log(`\n[API RESPONSE] Case 77 FINAL before JSON.stringify:`)
      console.log(`  Full case 77: ${JSON.stringify(case77, null, 2).substring(0, 1000)}`)
      console.log(`  Case 77 metadata: ${JSON.stringify((case77 as any).metadata, null, 2).substring(0, 500)}`)
    } else {
      console.log(`[API RESPONSE] Case 77 NOT FOUND in transformedCases!`)
      console.log(`  Available IDs: ${transformedCases.slice(0, 5).map((c: any) => c.id).join(", ")}`)
    }
    
    const responseData = {
      success: true,
      data: transformedCases,
      stats,
    }
    
    console.log(`[API RESPONSE] Final response data.length: ${responseData.data.length}`)
    
    return NextResponse.json(responseData)
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

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { caseName, caseDescription, customerCode, assignedTo, severity, alertIds, integrationSource } = body

    console.log("Creating case:", { caseName, customerCode, integrationSource, alertIds })

    if (!caseName || !caseDescription || !customerCode) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: caseName, caseDescription, customerCode",
        },
        { status: 400 },
      )
    }

    if (!alertIds || alertIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "At least one alert must be selected",
        },
        { status: 400 },
      )
    }

    // Handle SOCFortress case creation
    if (integrationSource === "socfortress" || integrationSource === "copilot") {
      // Import createSocfortressCase function
      const { createSocfortressCase } = await import("@/lib/api/socfortress")

      // Get the integration
      let integration = await prisma.integration.findFirst({
        where: {
          source: {
            in: ["socfortress", "copilot"],
          },
        },
      })

      if (!integration) {
        return NextResponse.json(
          {
            success: false,
            error: "SOCFortress integration not found",
          },
          { status: 404 },
        )
      }

      // Convert alert IDs to numbers
      const alertIdNumbers = alertIds.map((id: string | number) => {
        const parsed = parseInt(String(id), 10)
        if (isNaN(parsed)) {
          throw new Error(`Invalid alert ID: ${id}`)
        }
        return parsed
      })

      try {
        // Create case in SOCFortress MySQL
        const { caseId, caseExternalId } = await createSocfortressCase(integration.id, {
          caseName,
          caseDescription,
          customerCode,
          assignedTo,
          severity: severity || "Low",
          alertIds: alertIdNumbers,
        })

        console.log("Successfully created SOCFortress case:", caseId)

        // Also create local cache entry
        try {
          const newCase = await prisma.case.create({
            data: {
              id: caseExternalId,
              externalId: caseExternalId,
              ticketId: caseId,
              name: caseName,
              description: caseDescription,
              status: "New",
              severity: severity || "Low",
              assignee: assignedTo || null,
              createdAt: new Date(),
              modifiedAt: new Date(),
              integrationId: integration.id,
              metadata: {
                socfortress: {
                  case_id: caseId,
                  customer_code: customerCode,
                  created_by: currentUser.name || "system",
                },
              },
            },
            include: {
              integration: {
                select: {
                  id: true,
                  name: true,
                  source: true,
                },
              },
            },
          })

          console.log("Created local cache entry for case", caseId)

          return NextResponse.json({
            success: true,
            data: newCase,
            message: `Case "${caseName}" created successfully with ${alertIdNumbers.length} alert(s)`,
          })
        } catch (cacheError) {
          console.warn("Could not create local cache entry, but case created in SOCFortress:", cacheError)
          // Still return success since the case was created in SOCFortress
          return NextResponse.json({
            success: true,
            data: {
              id: caseExternalId,
              externalId: caseExternalId,
              ticketId: caseId,
              name: caseName,
              caseId,
            },
            message: `Case "${caseName}" created successfully`,
          })
        }
      } catch (error) {
        console.error("Error creating case in SOCFortress:", error)
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create case: " + (error instanceof Error ? error.message : String(error)),
          },
          { status: 500 },
        )
      }
    }

    // Default: unsupported integration source
    return NextResponse.json(
      {
        success: false,
        error: "Unsupported integration source",
      },
      { status: 400 },
    )
  } catch (error) {
    console.error("Error in POST /api/cases:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error: " + (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 },
    )
  }
}
