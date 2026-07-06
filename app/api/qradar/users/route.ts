import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get("integrationId")

    if (!integrationId) {
      return NextResponse.json(
        { success: false, error: "Integration ID is required" },
        { status: 400 }
      )
    }

    // Fetch integration from database
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration) {
      return NextResponse.json(
        { success: false, error: "Integration not found" },
        { status: 404 }
      )
    }

    // Build credentials object (handle both array and object shapes)
    let credentials: Record<string, any> = {}
    if (Array.isArray(integration.credentials)) {
      const credentialsArray = integration.credentials as any[]
      credentialsArray.forEach((cred) => {
        if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
          credentials[cred.key] = cred.value
        }
      })
    } else {
      credentials = (integration.credentials as Record<string, any>) || {}
    }

    const qHost = credentials.host || credentials.QRADAR_HOST || ""
    const apiKey = credentials.api_key || credentials.QRADAR_API_KEY || credentials.apiKey || ""
    const domain = credentials.domain_id || credentials.domain || credentials.QRADAR_DOMAIN || undefined

    if (!qHost || !apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing QRadar credentials in integration configuration",
        },
        { status: 400 }
      )
    }

    // Instantiate QRadarClient and fetch users
    const domainId = domain ? Number(domain) : undefined
    const qradarClient = new QRadarClient({ host: qHost, api_key: apiKey, domain_id: domainId })
    const users = await qradarClient.getUsers()

    console.log(`[QRadar Users] Fetched ${users.length} users from domain: ${domain || "default"}`)

    return NextResponse.json({
      success: true,
      users: users,
    })
  } catch (error) {
    console.error("[QRadar Users] Error fetching users:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch QRadar users",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
