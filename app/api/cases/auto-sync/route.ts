import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCases } from "@/lib/api/stellar-cyber-case"

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

    console.log("=== AUTO SYNCING CASES ===")
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

    // Fetch cases from Stellar Cyber (last 7 days for auto-sync)
    console.log("Fetching cases from Stellar Cyber...")
    const stellarCases = await getCases({
      integrationId,
      limit: 500, // Smaller limit for auto-sync
    })

    console.log(`Retrieved ${stellarCases.length} cases from Stellar Cyber`)

    let syncedCount = 0
    let updatedCount = 0
    let errorCount = 0

    // Process each case
    for (const stellarCase of stellarCases) {
      try {
        console.log(`Auto-processing case: ${stellarCase._id}`)

        // Check if case already exists
        const existingCase = await prisma.case.findFirst({
          where: {
            OR: [{ externalId: stellarCase._id }, { ticketId: stellarCase.ticket_id }],
          },
        })

        // Prepare case data
        const caseData = {
          externalId: stellarCase._id,
          ticketId: stellarCase.ticket_id || 0,
          name: stellarCase.name || "Unnamed Case",
          status: stellarCase.status || "New",
          severity: stellarCase.severity || "Medium",
          assignee: stellarCase.assignee || null,
          assigneeName: stellarCase.assignee_name || null,
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

        if (existingCase) {
          // Check if case has been modified since last sync
          const lastModified = new Date(stellarCase.modified_at || stellarCase.created_at)
          const lastSynced = existingCase.modifiedAt

          if (lastModified > lastSynced) {
            console.log(`Case ${stellarCase._id} has been modified, updating...`)
            console.log(`Last modified: ${lastModified}, Last synced: ${lastSynced}`)

            await prisma.case.update({
              where: { id: existingCase.id },
              data: {
                name: caseData.name,
                status: caseData.status,
                severity: caseData.severity,
                assignee: caseData.assignee,
                assigneeName: caseData.assigneeName,
                description: caseData.description,
                modifiedAt: caseData.modifiedAt, // Fixed: use modifiedAt instead of updatedAt
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
            console.log(`? Auto-updated case: ${stellarCase._id}`)
          } else {
            console.log(`Case ${stellarCase._id} is up to date, skipping...`)
          }
        } else {
          // Create new case
          await prisma.case.create({
            data: caseData,
          })
          syncedCount++
          console.log(`? Auto-created new case: ${stellarCase._id}`)
        }
      } catch (caseError) {
        console.error(`? Error auto-processing case ${stellarCase._id}:`, caseError)
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

    console.log(`?? Auto-sync completed: ${syncedCount} new, ${updatedCount} updated, ${errorCount} errors`)

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
      },
    })
  } catch (error) {
    console.error("Error auto-syncing cases:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to auto-sync cases",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST method to auto-sync cases",
    endpoint: "/api/cases/auto-sync",
    method: "POST",
    body: {
      integrationId: "string",
    },
  })
}
