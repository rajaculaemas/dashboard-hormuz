import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCases, getCaseAlerts } from "@/lib/api/stellar-cyber-case"
import { getAssigneeName } from "@/lib/utils"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { integrationId } = body

    if (!integrationId) {
      return NextResponse.json(
        {
          success: false,
          error: "Integration ID is required",
        },
        { status: 400 },
      )
    }

    console.log("=== SYNCING CASES ===")
    console.log("Integration ID:", integrationId)

    // Get integration details
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration) {
      return NextResponse.json(
        {
          success: false,
          error: "Integration not found",
        },
        { status: 404 },
      )
    }

    console.log("Found integration:", integration.name)

    let stellarCases: any[] = []

    if (integration.source === "stellar-cyber") {
      // Fetch cases from Stellar Cyber
      console.log("Fetching cases from Stellar Cyber...")
      const casesResponse = await getCases({
        integrationId,
        limit: 1000,
      })
      stellarCases = casesResponse.data?.cases || casesResponse || []
    } else if (integration.source === "qradar") {
      // For QRadar, pull local QRadar tickets stored in DB (created via Follow Up)
      console.log("Fetching cases from QRadar tickets stored in DB...")
      const tickets = await prisma.qRadarTicket.findMany({
        include: { qradarOffense: true },
      })
      // Filter tickets to this integration and only include offenses in FOLLOW_UP status
      const filtered = tickets.filter(
        (t) => t.qradarOffense?.integrationId === integrationId && t.qradarOffense?.status === "FOLLOW_UP",
      )

      // Map to a case-like structure used by the sync logic
      stellarCases = filtered.map((t) => ({
        // Use the offense external id as the primary external identifier (string)
        _id: String(t.qradarOffense?.externalId || t.offenseId || t.id),
        // Keep ticket_id empty to avoid large numeric conversions
        ticket_id: null,
        // Use the original offense title as the case name
        name: t.qradarOffense?.title || `Offense ${t.qradarOffense?.externalId || t.offenseId}`,
        // Mirror the offense status/severity
        status: t.qradarOffense?.status || "OPEN",
        severity: String(t.qradarOffense?.severity || "Medium"),
        assignee: null,
        assignee_name: null,
        created_at: t.qradarOffense?.startTime ? new Date(t.qradarOffense.startTime).toISOString() : t.createdAt?.toISOString(),
        modified_at: t.qradarOffense?.lastUpdatedTime
          ? new Date(t.qradarOffense.lastUpdatedTime).toISOString()
          : t.updatedAt?.toISOString(),
        description: t.qradarOffense?.description || t.description || "",
        version: 1,
        // preserve original ticket object for metadata
        _raw: t,
      }))
    } else {
      // Unsupported integration for case sync; return empty list
      console.log(`Integration source ${integration.source} not supported for case sync`)
      stellarCases = []
    }

    console.log(`Retrieved ${stellarCases.length} cases from Stellar Cyber`)

    // Filter out "Empty Case" cases
    const filteredCases = stellarCases.filter((c) => {
      const isEmptyCase = c.name && c.name.includes("Empty Case (All Alerts Ignored or Closed)")
      if (isEmptyCase) {
        console.log(`Filtering out case: ${c._id} - ${c.name}`)
      }
      return !isEmptyCase
    })

    console.log(`After filtering: ${filteredCases.length} cases remaining`)

    // Log some sample cases to see their status
    if (filteredCases.length > 0) {
      console.log("Sample cases from Stellar Cyber:")
      filteredCases.slice(0, 3).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c._id} - ${c.name} - Status: ${c.status} - Modified: ${c.modified_at}`)
      })
    }

    let syncedCount = 0
    let updatedCount = 0
    let errorCount = 0
    const skippedCount = 0

    // Helper function to link alerts to a case by searching for alerts that reference this case externalId
    async function linkAlertsToCase(caseDbId: string, caseExternalId: string, integrationId: string) {
      try {
        // Find all alerts from this integration that mention this case in their metadata or description
        const relatedAlerts = await prisma.alert.findMany({
          where: {
            integrationId: integrationId,
            OR: [
              // Match case external ID in metadata
              { metadata: { path: ["stellar_cyber", "case_id"], equals: caseExternalId } },
              { metadata: { path: ["caseId"], equals: caseExternalId } },
              // Match in description or title
              { description: { contains: caseExternalId } },
              { title: { contains: caseExternalId } },
            ],
          },
          select: { id: true },
        })

        if (relatedAlerts.length > 0) {
          // Create relationships between case and alerts
          for (const alert of relatedAlerts) {
            try {
              await prisma.caseAlert.upsert({
                where: {
                  caseId_alertId: {
                    caseId: caseDbId,
                    alertId: alert.id,
                  },
                },
                update: {},
                create: {
                  caseId: caseDbId,
                  alertId: alert.id,
                },
              })
            } catch (linkErr) {
              console.log(`Could not link alert ${alert.id} to case ${caseDbId}:`, linkErr instanceof Error ? linkErr.message : "Unknown error")
            }
          }
          console.log(`Linked ${relatedAlerts.length} alerts to case ${caseExternalId}`)
        }
      } catch (err) {
        console.log(`Error linking alerts to case ${caseExternalId}:`, err instanceof Error ? err.message : "Unknown error")
      }
    }

    // Process each case
    for (const stellarCase of filteredCases) {
      try {
        console.log(`\n--- Processing case: ${stellarCase._id} ---`)
        console.log(`Name: ${stellarCase.name}`)
        console.log(`Status from Stellar: ${stellarCase.status}`)
        console.log(`Assignee from Stellar: ${stellarCase.assignee} (${stellarCase.assignee_name})`)
        console.log(`Modified at: ${stellarCase.modified_at}`)

        // Normalize ticket id: Prisma expects an integer for ticketId.
        let ticketNumeric: number | null = null
        if (stellarCase.ticket_id !== undefined && stellarCase.ticket_id !== null) {
          const extracted = String(stellarCase.ticket_id).replace(/\D/g, "")
          const parsed = extracted ? Number(extracted) : NaN
          // Prisma Int is 32-bit signed. If the parsed number is too large, ignore it to avoid connector errors.
          const INT32_MAX = 2147483647
          if (!isNaN(parsed) && parsed <= INT32_MAX) {
            ticketNumeric = parsed
          } else if (!isNaN(parsed) && parsed > INT32_MAX) {
            console.log(`Ticket id numeric value ${parsed} exceeds INT32_MAX, will not use ticketId filter`) 
          }
        }

        // Check if case already exists
        const whereClause: any = ticketNumeric
          ? { OR: [{ externalId: stellarCase._id }, { ticketId: ticketNumeric }] }
          : { externalId: stellarCase._id }

        const existingCase = await prisma.case.findFirst({ where: whereClause })

        if (existingCase) {
          console.log(`Found existing case in DB:`)
          console.log(`  DB Status: ${existingCase.status}`)
          console.log(`  DB Assignee: ${existingCase.assignee} (${existingCase.assigneeName})`)
          console.log(`  DB Modified: ${existingCase.modifiedAt}`)
        }

        // Prepare case data with all fields that might change
        const caseData = {
          externalId: stellarCase._id,
          ticketId: ticketNumeric || 0,
          name: stellarCase.name || "Unnamed Case",
          status: stellarCase.status || (integration.source === "qradar" ? "OPEN" : "New"),
          severity: stellarCase.severity || "Medium",
          assignee: stellarCase.assignee || null,
          // Use assignee_name from Stellar Cyber if available and valid
          assigneeName:
            stellarCase.assignee_name && stellarCase.assignee_name && stellarCase.assignee_name.trim() && stellarCase.assignee_name !== "Unassigned"
              ? stellarCase.assignee_name
              : null,
          description: stellarCase.description || stellarCase.name || "No description",
          createdAt: stellarCase.created_at ? new Date(stellarCase.created_at) : new Date(),
          modifiedAt: stellarCase.modified_at ? new Date(stellarCase.modified_at) : new Date(),
          acknowledgedAt: stellarCase.acknowledged ? new Date(stellarCase.acknowledged) : null,
          closedAt: stellarCase.closed ? new Date(stellarCase.closed) : null,
          startTimestamp: stellarCase.start_timestamp ? new Date(stellarCase.start_timestamp) : null,
          endTimestamp: stellarCase.end_timestamp ? new Date(stellarCase.end_timestamp) : null,
          score: stellarCase.score || 0,
          size: stellarCase.size || 1,
          tags: stellarCase.tags || [],
          version: stellarCase.version || 1,
          createdBy: stellarCase.created_by || null,
          createdByName: stellarCase.created_by_name || null,
          modifiedBy: stellarCase.modified_by || null,
          modifiedByName: stellarCase.modified_by_name || null,
          custId: stellarCase.cust_id || null,
          tenantName: stellarCase.tenant_name || null,
          metadata: stellarCase,
          integrationId: integrationId,
        }

        // For Stellar Cyber cases, fetch alerts to get latest alert_time for MTTR calculation
        if (integration.source === "stellar-cyber") {
          try {
            const alerts = await getCaseAlerts({
              caseId: stellarCase._id,
              integrationId,
            })

            if (alerts && alerts.length > 0) {
              console.log(`Fetched ${alerts.length} alerts for case ${stellarCase._id}`)
              
              // Find the latest alert_time (timestamp)
              const alertTimes = alerts
                .map((alert: any, idx: number) => {
                  const time = alert.alert_time
                  console.log(`Alert ${idx} alert_time:`, time, typeof time)
                  
                  // Handle different formats: milliseconds (number), ISO string, etc
                  let ms = 0
                  if (typeof time === "number") {
                    // Assume it's already in milliseconds if > 1000000000000 (year 2001 in ms)
                    // Otherwise assume it's in seconds
                    ms = time > 1000000000000 ? time : time * 1000
                  } else if (typeof time === "string") {
                    ms = new Date(time).getTime()
                  }
                  
                  console.log(`Alert ${idx} converted to ms:`, ms)
                  return ms
                })
                .filter((t: number) => t > 0 && !isNaN(t))

              if (alertTimes.length > 0) {
                const latestAlertTime = Math.max(...alertTimes)
                console.log(`Latest alert time from ${alertTimes.length} alerts:`, latestAlertTime, new Date(latestAlertTime))
                
                // Store latest alert time in metadata for MTTR calculation
                caseData.metadata = {
                  ...caseData.metadata,
                  latest_alert_time: latestAlertTime,
                  alerts_count: alerts.length,
                  alert_times_debug: alertTimes.slice(0, 3), // Store first 3 for debugging
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching alerts for case ${stellarCase._id}:`, error)
            // Continue with case sync even if alert fetch fails
          }
        }

        if (existingCase) {
          // Check if there are any changes
          const hasChanges =
            existingCase.status !== caseData.status ||
            existingCase.severity !== caseData.severity ||
            existingCase.assignee !== caseData.assignee ||
            existingCase.assigneeName !== caseData.assigneeName ||
            existingCase.name !== caseData.name ||
            existingCase.version !== caseData.version

          console.log(`Changes detected: ${hasChanges}`)
          if (hasChanges) {
            console.log(`  Status: ${existingCase.status} -> ${caseData.status}`)
            console.log(`  Severity: ${existingCase.severity} -> ${caseData.severity}`)
            console.log(`  Assignee: ${existingCase.assignee} -> ${caseData.assignee}`)
            console.log(`  AssigneeName: ${existingCase.assigneeName} -> ${caseData.assigneeName}`)
            console.log(`  Version: ${existingCase.version} -> ${caseData.version}`)
          }

          // Always update existing case with latest data from Stellar Cyber
          console.log(`Updating existing case: ${stellarCase._id}`)

          const updatedCase = await prisma.case.update({
            where: { id: existingCase.id },
            data: {
              // Update all fields that might change
              name: caseData.name,
              status: caseData.status,
              severity: caseData.severity,
              assignee: caseData.assignee,
              assigneeName: caseData.assigneeName,
              description: caseData.description,
              modifiedAt: caseData.modifiedAt,
              acknowledgedAt: caseData.acknowledgedAt,
              closedAt: caseData.closedAt,
              startTimestamp: caseData.startTimestamp,
              endTimestamp: caseData.endTimestamp,
              score: caseData.score,
              size: caseData.size,
              tags: caseData.tags,
              version: caseData.version,
              modifiedBy: caseData.modifiedBy,
              modifiedByName: caseData.modifiedByName,
              custId: caseData.custId,
              tenantName: caseData.tenantName,
              metadata: caseData.metadata,
            },
          })

          updatedCount++
          console.log(`? Updated case: ${stellarCase._id}`)
          console.log(`  New status in DB: ${updatedCase.status}`)
          console.log(`  New assignee in DB: ${updatedCase.assignee}`)

          // Link related alerts to this case (for Stellar Cyber cases)
          if (integration.source === "stellar-cyber") {
            await linkAlertsToCase(existingCase.id, stellarCase._id, integrationId)
          }
        } else {
          // Create new case
          console.log(`Creating new case: ${stellarCase._id}`)
          const newCase = await prisma.case.create({
            data: caseData,
          })
          syncedCount++
          console.log(`? Created new case: ${stellarCase._id} with status: ${newCase.status}`)

          // Link related alerts to this case (for Stellar Cyber cases)
          if (integration.source === "stellar-cyber") {
            await linkAlertsToCase(newCase.id, stellarCase._id, integrationId)
          }
        }
      } catch (caseError) {
        console.error(`? Error processing case ${stellarCase._id}:`, caseError)
        errorCount++
      }
    }

    // Update integration last sync time
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        lastSync: new Date(),
      },
    })

    console.log(`\n?? Sync completed:`)
    console.log(`  - ${syncedCount} new cases created`)
    console.log(`  - ${updatedCount} existing cases updated`)
    console.log(`  - ${errorCount} errors encountered`)
    console.log(`  - ${skippedCount} cases skipped`)

    // Verify the sync by checking some cases in the database
    console.log(`\n--- Verification: Checking database after sync ---`)
    const dbCases = await prisma.case.findMany({
      where: { integrationId },
      take: 5,
      orderBy: { modifiedAt: "desc" },
    })

    console.log(`Found ${dbCases.length} cases in database:`)
    dbCases.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.externalId} - ${c.name} - Status: ${c.status} - Modified: ${c.modifiedAt}`)
    })

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      updated: updatedCount,
      errors: errorCount,
      total: stellarCases.length,
      stats: {
        synced: syncedCount,
        updated: updatedCount,
        errors: errorCount,
        skipped: skippedCount,
      },
    })
  } catch (error) {
    console.error("Error syncing cases:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to sync cases",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  // Allow GET method for testing
  return NextResponse.json({
    message: "Use POST method to sync cases",
    endpoint: "/api/cases/sync",
    method: "POST",
    body: {
      integrationId: "string",
    },
  })
}
