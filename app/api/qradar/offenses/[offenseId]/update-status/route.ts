import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"
import crypto from "crypto"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"

export async function POST(request: NextRequest, { params }: { params: { offenseId: string } }) {
  try {
    // Check authentication and permission
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    if (!hasPermission(user.role, 'update_alert_status')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to update offense status" }, { status: 403 })
    }
    
    const { offenseId } = params
    const body = await request.json()
    const { status, assignedTo, closingReasonId } = body

    if (!status) {
      return NextResponse.json({ success: false, error: "Status is required" }, { status: 400 })
    }

    console.log("[v0] Updating offense", offenseId, "to status:", status)

    // Get offense from database
    const offense = await prisma.qradarOffense.findUnique({
      where: { id: offenseId },
    })

    if (!offense) {
      return NextResponse.json({ success: false, error: "Offense not found" }, { status: 404 })
    }

    // Get integration credentials
    const integration = await prisma.integration.findUnique({
      where: { id: offense.integrationId },
    })

    if (!integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }

    const creds = integration.credentials as any
    const qradarClient = new QRadarClient({
      host: creds.host,
      api_key: creds.api_key,
    })

    // Update offense status in QRadar
    await qradarClient.updateOffenseStatus(
      offenseData.external_id,
      status as "OPEN" | "FOLLOW_UP" | "CLOSED",
      assignedTo || "soc-dashboard",
      closingReasonId,
    )

    console.log("[v0] Updated offense in QRadar")

    // Update local database
    if (status === "FOLLOW_UP") {
      // Create ticket for FOLLOW_UP
      const ticketId = crypto.randomUUID()

      await sql`
        INSERT INTO qradar_tickets (
          id, offense_id, title, description, severity, status,
          assigned_to, integration_id, created_at, updated_at
        ) VALUES (
          ${ticketId}, ${offenseId}, ${offenseData.description},
          ${offenseData.description}, ${offenseData.severity},
          'OPEN', ${assignedTo || "unassigned"}, ${offenseData.integration_id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `

      console.log("[v0] Created ticket from offense:", ticketId)
    } else if (status === "CLOSED") {
      // Update closing reason if exists
      if (closingReasonId) {
        await sql`
          UPDATE qradar_offenses
          SET status = 'CLOSED', closing_reason_id = ${closingReasonId}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${offenseId}
        `
      }
    } else {
      await sql`
        UPDATE qradar_offenses
        SET status = ${status}, assigned_to = ${assignedTo || null}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${offenseId}
      `
    }

    return NextResponse.json({
      success: true,
      message: `Offense updated to ${status}`,
      ticketCreated: status === "FOLLOW_UP",
    })
  } catch (error) {
    console.error("[v0] Error updating offense status:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update offense status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
