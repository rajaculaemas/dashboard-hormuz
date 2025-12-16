import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ success: false, error: "Alert id is required" }, { status: 400 })
    }

    const alert = await prisma.alert.findUnique({ where: { id } })
    if (!alert) {
      return NextResponse.json({ success: false, error: "Alert not found" }, { status: 404 })
    }

    const events = await prisma.alertTimeline.findMany({
      where: { alertId: id },
      include: {
        changedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { timestamp: "asc" },
    })

    // Seed a created event if none exist
    const timeline = events.length > 0
      ? events
      : [
          {
            id: "seed-created",
            alertId: id,
            eventType: "created",
            description: "Alert created",
            oldValue: null,
            newValue: null,
            changedBy: alert.metadata?.assignee || "System",
            changedByUser: null,
            changedByUserId: null,
            timestamp: alert.timestamp,
          },
        ]

    return NextResponse.json({ success: true, data: timeline })
  } catch (error) {
    console.error("Error fetching alert timeline:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch alert timeline" }, { status: 500 })
  }
}
