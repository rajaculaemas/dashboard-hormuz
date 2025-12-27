import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!hasPermission(user.role, 'delete_alert')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { alertIds } = body
    if (!Array.isArray(alertIds) || alertIds.length === 0) return NextResponse.json({ error: 'Missing alertIds' }, { status: 400 })

    // Delete timelines and alerts in a transaction
    await prisma.$transaction([
      prisma.alertTimeline.deleteMany({ where: { alertId: { in: alertIds } } }),
      prisma.alert.deleteMany({ where: { id: { in: alertIds } } }),
    ])

    console.log(`[BULK DELETE] User ${user.id} deleted ${alertIds.length} alerts`)

    return NextResponse.json({ success: true, message: `Deleted ${alertIds.length} alerts` })
  } catch (error) {
    console.error('Error in /api/alerts/bulk-delete:', error)
    return NextResponse.json({ error: 'Failed to bulk delete alerts' }, { status: 500 })
  }
}
