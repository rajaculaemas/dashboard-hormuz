import { type NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'
import prisma from "@/lib/prisma"
import { getCases } from "@/lib/api/stellar-cyber-case"

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("?? Starting automatic case sync...")

    // Get all active Stellar Cyber integrations
    const integrations = await prisma.integration.findMany({
      where: {
        source: "stellar-cyber",
        status: "connected",
      },
    })

    if (integrations.length === 0) {
      console.log("No active Stellar Cyber integrations found")
      return NextResponse.json({
        success: true,
        message: "No active integrations to sync",
      })
    }

    let totalNewCases = 0
    let totalUpdatedCases = 0
    let totalErrors = 0

    for (const integration of integrations) {
      try {
        console.log(`?? Syncing cases for integration: ${integration.name}`)

        // Get cases from Stellar Cyber for last 24 hours
        const stellarCases = await getCases({
          integrationId: integration.id,
          limit: 1000,
        })

        console.log(`Found ${stellarCases.length} cases from Stellar Cyber for ${integration.name}`)

        let newCases = 0
        let updatedCases = 0
        let errorCases = 0

        for (const stellarCase of stellarCases) {
          try {
            // Check if case already exists
            const existingCase = await prisma.case.findFirst({
              where: {
                OR: [{ externalId: stellarCase._id }, { ticketId: stellarCase.ticket_id }],
              },
            })

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
              integrationId: integration.id,
            }

            if (existingCase) {
              // Always update existing case to ensure data consistency
              console.log(`Updating case ${stellarCase._id}: ${existingCase.status} -> ${caseData.status}`)

              await prisma.case.update({
                where: { id: existingCase.id },
                data: {
                  name: caseData.name,
                  status: caseData.status,
                  severity: caseData.severity,
                  assignee: caseData.assignee,
                  assigneeName: caseData.assigneeName,
                  description: caseData.description,
                  modifiedAt: caseData.modifiedAt, // Use modifiedAt instead of updatedAt
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
              updatedCases++
            } else {
              // Create new case
              await prisma.case.create({
                data: caseData,
              })
              newCases++
            }
          } catch (error) {
            console.error(`? Error processing case ${stellarCase._id}:`, error)
            errorCases++
          }
        }

        totalNewCases += newCases
        totalUpdatedCases += updatedCases
        totalErrors += errorCases

        // Update integration last sync time
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            lastSync: new Date(),
          },
        })

        console.log(
          `? Integration ${integration.name}: ${newCases} new, ${updatedCases} updated, ${errorCases} errors`,
        )
      } catch (error) {
        console.error(`? Error syncing integration ${integration.name}:`, error)
        totalErrors++
      }
    }

    console.log(
      `?? Total cron sync completed: ${totalNewCases} new cases, ${totalUpdatedCases} updated cases, ${totalErrors} errors`,
    )

    return NextResponse.json({
      success: true,
      totalNewCases,
      totalUpdatedCases,
      totalErrors,
      integrationsProcessed: integrations.length,
    })
  } catch (error) {
    console.error("? Error in automatic case sync:", error)
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

export async function POST() {
  // Allow manual trigger of sync
  return GET({} as NextRequest)
}
