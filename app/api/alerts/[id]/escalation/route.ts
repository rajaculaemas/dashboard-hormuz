/**
 * Get Alert Escalation Status
 * Returns current escalation status and history for an alert
 */

import { NextRequest, NextResponse } from "next/server"
import { getActiveEscalation, getEscalationHistory } from "@/lib/services/alert-escalation"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const alertId = (await params).id

    if (!alertId) {
      return NextResponse.json({ error: "Alert ID required" }, { status: 400 })
    }

    // Get active escalation
    const activeEscalation = await getActiveEscalation(alertId)

    // Get all escalation history
    const history = await getEscalationHistory(alertId)

    return NextResponse.json({
      success: true,
      active: activeEscalation,
      history,
    })
  } catch (error) {
    console.error("Error fetching escalation status:", error)
    return NextResponse.json(
      { error: "Failed to fetch escalation status" },
      { status: 500 },
    )
  }
}
