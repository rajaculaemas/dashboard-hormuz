import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAlerts as getWazuhAlerts, verifyConnection } from "@/lib/api/wazuh"

export async function POST(request: NextRequest) {
  try {
    const { integrationId } = await request.json()

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

    // Fetch alerts from Wazuh
    const result = await getWazuhAlerts(integrationId)

    console.log(`[Wazuh] Synced ${result.count} alerts`)

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
