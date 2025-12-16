import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"
import { getUserAccessibleIntegrations } from "@/lib/auth/password"

export async function GET() {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const accessibleIds = await getUserAccessibleIntegrations(currentUser.userId)
    const whereClause = currentUser.role === "administrator" ? {} : { id: { in: accessibleIds } }

    const integrations = await prisma.integration.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
    })

    console.log(`Found ${integrations.length} integrations`)

    // Transform data for frontend compatibility
    const transformedIntegrations = integrations.map((integration) => ({
      ...integration,
      type: integration.source, // Use source as type for frontend
      method: "api", // Default method
      description: "", // Default description
      lastSyncAt: integration.lastSync,
    }))

    return NextResponse.json({
      success: true,
      data: transformedIntegrations,
    })
  } catch (error) {
    console.error("Database error in GET /api/integrations:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch integrations",
        data: [], // Return empty array as fallback
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    if (currentUser.role !== "administrator") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { name, source, credentials, description } = body

    console.log("Creating integration with data:", {
      name,
      source,
      credentialsKeys: Object.keys(credentials || {}),
    })

    const integration = await prisma.integration.create({
      data: {
        name,
        source,
        status: "connected", // Set as connected by default
        credentials: credentials || {},
        config: {},
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...integration,
        type: integration.source,
        method: "api",
        description: description || "",
        lastSyncAt: integration.lastSync,
      },
    })
  } catch (error) {
    console.error("Error creating integration:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create integration",
      },
      { status: 500 },
    )
  }
}
