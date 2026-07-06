import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getIncidentComments } from "@/lib/api/socfortress"
import { getCurrentUser } from "@/lib/auth/session"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    if (!id) {
      return NextResponse.json({ success: false, error: "Alert id is required" }, { status: 400 })
    }

    const alert = await prisma.alert.findUnique({
      where: { id },
      include: { integration: true },
    })

    if (!alert) {
      return NextResponse.json({ success: false, error: "Alert not found" }, { status: 404 })
    }

    const source = alert.integration?.source
    if (source !== "socfortress" && source !== "copilot") {
      return NextResponse.json({ success: false, error: "Not a SOCFortress alert" }, { status: 400 })
    }

    if (!alert.externalId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const comments = await getIncidentComments(alert.integrationId, alert.externalId)

    return NextResponse.json({ success: true, data: comments })
  } catch (error) {
    console.error("[socfortress-comments] Error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch comments" }, { status: 500 })
  }
}
