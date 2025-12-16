import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const integrations = await prisma.integration.findMany({
      orderBy: {
        updatedAt: "desc",
      },
    })

    const statusData = integrations.map((integration) => ({
      id: integration.id,
      status: integration.status,
      lastSyncAt: integration.lastSync,
      name: integration.name,
      source: integration.source,
    }))

    return NextResponse.json(statusData)
  } catch (error) {
    console.error("Error fetching integrations status:", error)
    return NextResponse.json([], { status: 200 })
  }
}
