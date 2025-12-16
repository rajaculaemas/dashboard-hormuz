import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function POST() {
  try {
    console.log("Starting auto-sync for all active integrations (Stellar Cyber, QRadar, and Wazuh)")

    // Get all active integrations (Stellar Cyber, QRadar, and Wazuh)
    const integrations = await prisma.integration.findMany({
      where: {
        source: {
          in: ["stellar-cyber", "qradar", "wazuh"],
        },
        status: "connected",
      },
    })

    if (integrations.length === 0) {
      return NextResponse.json({
        message: "No active integrations found",
        synced: 0,
      })
    }

    const syncResults = []

    // Sync each integration
    for (const integration of integrations) {
      try {
        console.log(`Auto-syncing integration: ${integration.name} (${integration.id})`)

        // Call the sync endpoint for this integration
        // Note: NEXT_PUBLIC_API_URL already includes /api, so we just add the endpoint path
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"
        
        // Use specific endpoint for Wazuh
        const syncPath = integration.source === "wazuh" ? "/alerts/wazuh/sync" : "/alerts/sync"
        const syncUrl = `${apiUrl}${syncPath}`
        
        console.log(`Syncing from URL: ${syncUrl}`)

        const syncResponse = await fetch(syncUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            integrationId: integration.id,
          }),
        })

        // Check response status and content type
        const contentType = syncResponse.headers.get("content-type")
        let syncResult: any = {}
        
        if (contentType && contentType.includes("application/json")) {
          syncResult = await syncResponse.json()
        } else {
          // Response is not JSON (likely HTML error page)
          const text = await syncResponse.text()
          console.error(`Invalid response from sync endpoint: ${text.substring(0, 200)}`)
          syncResult = {
            error: `Invalid response from sync endpoint (Status: ${syncResponse.status})`,
          }
        }

        // Extract stats from response (could be in different formats)
        const stats = syncResult.stats || {
          total: syncResult.total || syncResult.count || 0,
          synced: syncResult.synced || syncResult.count || 0,
          updated: syncResult.updated || 0,
          errors: syncResult.errors || 0,
        }

        syncResults.push({
          integrationId: integration.id,
          integrationName: integration.name,
          source: integration.source,
          success: syncResponse.ok && contentType?.includes("application/json"),
          stats: syncResponse.ok ? stats : null,
          error: syncResponse.ok ? null : syncResult.error || "Sync failed",
        })
      } catch (error) {
        console.error(`Error auto-syncing integration ${integration.id}:`, error)
        syncResults.push({
          integrationId: integration.id,
          integrationName: integration.name,
          source: integration.source,
          success: false,
          stats: null,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    const successCount = syncResults.filter((r) => r.success).length
    const totalStats = syncResults.reduce(
      (acc, result) => {
        if (result.stats) {
          acc.total += result.stats.total || 0
          acc.synced += result.stats.synced || 0
          acc.updated += result.stats.updated || 0
          acc.errors += result.stats.errors || 0
        }
        return acc
      },
      { total: 0, synced: 0, updated: 0, errors: 0 },
    )

    console.log(`Auto-sync completed: ${successCount}/${integrations.length} integrations synced`)

    return NextResponse.json({
      message: `Auto-sync completed for ${successCount}/${integrations.length} integrations`,
      totalStats,
      results: syncResults,
    })
  } catch (error) {
    console.error("Error in auto-sync:", error)
    return NextResponse.json(
      {
        error: "Auto-sync failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
