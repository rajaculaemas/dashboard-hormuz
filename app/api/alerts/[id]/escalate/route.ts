/**
 * Escalate Alert by ID
 * Dynamic route for escalating an alert to L2
 * Maps component format to escalation service format
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"
import { createEscalation } from "@/lib/services/alert-escalation"
import prisma from "@/lib/prisma"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Check authentication
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check permission
    if (!hasPermission(user.role, "escalate_alert")) {
      return NextResponse.json(
        { error: "You don't have permission to escalate alerts" },
        { status: 403 },
      )
    }

    const alertId = (await params).id
    if (!alertId) {
      return NextResponse.json({ error: "Alert ID is required" }, { status: 400 })
    }

    // Parse request body
    const body = await request.json()
    const { escalationLevel, assignedToId, notes } = body

    // Validate required fields
    if (!assignedToId) {
      return NextResponse.json(
        { error: "Missing required field: assignedToId (L2 analyst)" },
        { status: 400 },
      )
    }

    if (!notes || notes.trim().length < 20) {
      return NextResponse.json(
        { error: "Analysis/notes must be at least 20 characters" },
        { status: 400 },
      )
    }

    // Verify alert exists
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: { integration: true },
    })

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 })
    }

    // Create escalation
    const result = await createEscalation({
      alertId,
      escalateToUserId: assignedToId,
      l1Analysis: notes,
      escalatedByUserId: user.userId,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to escalate alert" },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        success: true,
        escalationId: result.escalationId,
        message: "Alert escalated successfully",
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[Alert Escalate] Error escalating alert:", error)
    return NextResponse.json(
      { error: "Failed to escalate alert" },
      { status: 500 },
    )
  }
}
