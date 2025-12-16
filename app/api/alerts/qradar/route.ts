import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

// DB client will be retrieved inside the handler via getSql()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get("integrationId")
    const timeRange = searchParams.get("time_range") || "7d"
    const status = searchParams.get("status")
    const severity = searchParams.get("severity")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = (page - 1) * limit

    console.log("[v0] Fetching QRadar alerts")

    if (!integrationId) {
      return NextResponse.json({ success: false, error: "Integration ID required" }, { status: 400 })
    }

    // Calculate time range
    const now = new Date()
    let startDate: Date

    switch (timeRange) {
      case "1h":
        startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000)
        break
      case "12h":
        startDate = new Date(now.getTime() - 12 * 60 * 60 * 1000)
        break
      case "24h":
      case "1d":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case "all":
        startDate = new Date("2000-01-01")
        break
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    }

    // Build where clause for Prisma
    const whereClause: any = {
      integrationId: integrationId,
      startTime: {
        gte: Math.floor(startDate.getTime()),
      },
    }

    if (status && status !== "all") {
      whereClause.status = status
    }

    if (severity && severity !== "all") {
      whereClause.severity = Number.parseInt(severity)
    }

    // Fetch offenses using Prisma
    const [offenses, totalCount] = await Promise.all([
      prisma.qradarOffense.findMany({
        where: whereClause,
        orderBy: { startTime: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.qradarOffense.count({
        where: whereClause,
      }),
    ])

    // Transform offenses to alert format
    const alerts = offenses.map((offense: any) => ({
      id: offense.id,
      externalId: offense.externalId,
      title: offense.description,
      description: `Offense Source: ${offense.offenseSource}`,
      severity: mapQRadarSeverity(offense.severity),
      status: mapQRadarStatus(offense.status),
      timestamp: new Date(offense.startTime),
      integrationId: offense.integrationId,
      source: "qradar",
      eventCount: offense.eventCount,
      deviceCount: offense.deviceCount,
      metadata: {
        externalId: offense.externalId,
        offenseSource: offense.offenseSource,
        categories: offense.categories,
        rules: offense.rules,
        assignedTo: offense.assignedTo,
        followUp: offense.followUp,
      },
    }))

    // Calculate stats
    const stats = {
      total: totalCount,
      open: 0,
      inProgress: 0,
      closed: 0,
    }

    const statusCounts = await prisma.qradarOffense.groupBy({
      by: ["status"],
      where: whereClause,
      _count: {
        status: true,
      },
    })

    statusCounts.forEach((sc: any) => {
      if (sc.status === "OPEN") stats.open += sc._count.status
      else if (sc.status === "FOLLOW_UP") stats.inProgress += sc._count.status
      else if (sc.status === "CLOSED") stats.closed += sc._count.status
    })

    return NextResponse.json({
      success: true,
      data: alerts,
      stats,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Error fetching QRadar alerts:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch QRadar alerts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

function mapQRadarSeverity(severity: number): string {
  if (severity >= 7) return "Critical"
  if (severity >= 5) return "High"
  if (severity >= 3) return "Medium"
  return "Low"
}

function mapQRadarStatus(status: string): string {
  switch (status) {
    case "OPEN":
      return "Open"
    case "FOLLOW_UP":
      return "In Progress"
    case "CLOSED":
      return "Closed"
    default:
      return status
  }
}
