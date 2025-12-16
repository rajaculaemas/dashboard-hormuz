import { type NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'
import prisma from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Starting scheduled sync for alerts and cases...")

    // Get all active integrations
    const integrations = await prisma.integration.findMany({
      where: { status: "active" },
    })

    if (integrations.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active integrations found",
      })
    }

    let totalAlertsSynced = 0
    let totalCasesSynced = 0
    let totalErrors = 0

    for (const integration of integrations) {
      try {
        console.log(`Syncing integration: ${integration.name} (${integration.source})`)

        // Sync alerts
        try {
          const alertResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/alerts/sync`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ integrationId: integration.id }),
            },
          )

          if (alertResponse.ok) {
            const alertData = await alertResponse.json()
            totalAlertsSynced += alertData.synced || 0
            console.log(`Synced ${alertData.synced || 0} alerts for ${integration.name}`)
          }
        } catch (alertError) {
          console.error(`Error syncing alerts for ${integration.name}:`, alertError)
          totalErrors++
        }

        // Sync cases (only for Stellar Cyber integrations)
        if (integration.source === "stellar_cyber") {
          try {
            const caseResponse = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/cases/sync`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ integrationId: integration.id }),
              },
            )

            if (caseResponse.ok) {
              const caseData = await caseResponse.json()
              totalCasesSynced += caseData.synced || 0
              console.log(`Synced ${caseData.synced || 0} cases for ${integration.name}`)
            }
          } catch (caseError) {
            console.error(`Error syncing cases for ${integration.name}:`, caseError)
            totalErrors++
          }
        }

        // Update last sync time
        await prisma.integration.update({
          where: { id: integration.id },
          data: { lastSync: new Date() },
        })
      } catch (integrationError) {
        console.error(`Error processing integration ${integration.name}:`, integrationError)
        totalErrors++
      }
    }

    console.log(
      `Scheduled sync completed. Alerts: ${totalAlertsSynced}, Cases: ${totalCasesSynced}, Errors: ${totalErrors}`,
    )

    return NextResponse.json({
      success: true,
      message: `Synced ${totalAlertsSynced} alerts and ${totalCasesSynced} cases with ${totalErrors} errors`,
      alertsSynced: totalAlertsSynced,
      casesSynced: totalCasesSynced,
      errors: totalErrors,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error in scheduled sync:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to run scheduled sync",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
