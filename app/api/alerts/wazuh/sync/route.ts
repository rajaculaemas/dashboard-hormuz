import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAlerts as getWazuhAlerts, verifyConnection } from "@/lib/api/wazuh"

export async function POST(request: NextRequest) {
  try {
    const { integrationId, resetCursor, hoursBack, since, indexPattern, filters } = await request.json()

    if (!integrationId) {
      return NextResponse.json({ success: false, error: "Integration ID is required" }, { status: 400 })
    }

    console.log("Starting Wazuh alert sync for integration:", integrationId)

    // Get integration details
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration || integration.source !== "wazuh") {
      return NextResponse.json(
        { success: false, error: "Wazuh integration not found" },
        { status: 404 },
      )
    }

    // Verify connection
    const isConnected = await verifyConnection(integrationId)
    if (!isConnected) {
      return NextResponse.json(
        { success: false, error: "Failed to connect to Wazuh Elasticsearch" },
        { status: 500 },
      )
    }

    // Ambil opsi sync dari body
    console.log(`[Wazuh Sync Route] Received body options: resetCursor=${resetCursor}, hoursBack=${hoursBack}, since=${since}`)
    console.log(`[Wazuh Sync Route] Request headers:`, Object.fromEntries(request.headers.entries()))

    const syncOptions = {
      resetCursor: !!resetCursor,
      hoursBack,
      since,
      indexPattern,
      filters,
    }

    console.log(`[Wazuh Sync Route] Calling getWazuhAlerts with options:`, syncOptions)

    const result = await getWazuhAlerts(integrationId, syncOptions)

    console.log(`[Wazuh Sync Route] getWazuhAlerts result: ${result?.count} alerts`)

    console.log(`[Wazuh] Synced ${result.count} alerts`)

    // Update lastSync in DB only if we actually stored alerts (avoid advancing cursor when nothing saved)
    try {
      if (result && result.count && result.count > 0) {
        await prisma.integration.update({ where: { id: integrationId }, data: { lastSync: new Date() } })
        console.log(`[Wazuh Sync Route] integration.lastSync updated for ${integrationId}`)
      } else {
        console.log(`[Wazuh Sync Route] No alerts stored; skipping integration.lastSync update for ${integrationId}`)
      }
    } catch (e) {
      console.error('[Wazuh Sync Route] Failed to update integration.lastSync:', e)
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${result.count} alerts from Wazuh`,
      count: result.count,
      integration: {
        id: integration.id,
        name: integration.name,
        source: integration.source,
      },
    })
  } catch (error) {
    console.error("[Wazuh Sync Error]", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to sync Wazuh alerts"

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
