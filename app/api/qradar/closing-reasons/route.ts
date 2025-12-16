import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get("integrationId")

    if (!integrationId) {
      // If no integration ID, try to get default QRadar integration
      const integrations = await prisma.integration.findFirst({
        where: { source: "qradar" },
      })

      if (!integrations) {
        return NextResponse.json(
          { success: false, error: "QRadar integration not found" },
          { status: 404 },
        )
      }

      // Parse credentials - handle both string and object formats
      let creds = integrations.credentials as any
      if (typeof creds === "string") {
        creds = JSON.parse(creds)
      }

      console.log("[ClosingReasons API] Using default QRadar integration")
      const qradarClient = new QRadarClient({
        host: creds.host,
        api_key: creds.api_key,
      })

      const reasons = await qradarClient.getClosingReasons()
      console.log("[ClosingReasons API] Received reasons from QRadar:", reasons)

      return NextResponse.json({
        success: true,
        reasons,
      })
    }

    // Get integration by ID - only reached if integrationId is present
    if (!integrationId) {
      return NextResponse.json(
        { success: false, error: "IntegrationId required" },
        { status: 400 }
      )
    }

    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }

    // Parse credentials - handle both string and object formats
    let creds = integration.credentials as any
    if (typeof creds === "string") {
      creds = JSON.parse(creds)
    }

    console.log("[ClosingReasons API] Fetching from QRadar for integration:", integrationId)
    console.log("[ClosingReasons API] Credentials host:", creds.host)
    
    const qradarClient = new QRadarClient({
      host: creds.host,
      api_key: creds.api_key,
    })

    const reasons = await qradarClient.getClosingReasons()
    console.log("[ClosingReasons API] Received reasons from QRadar:", reasons)

    return NextResponse.json({
      success: true,
      reasons,
    })
  } catch (error) {
    console.error("[v0] Error fetching QRadar closing reasons:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch QRadar closing reasons",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
