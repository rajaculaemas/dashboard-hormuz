/**
 * Escalation Timeout Checker Cron
 * Runs every 5 minutes to check for timed-out escalations
 * and handle automatic escalation or admin notification
 */

import { NextRequest, NextResponse } from "next/server"
import { checkAndHandleTimeouts } from "@/lib/services/alert-escalation"

// Verify cron secret
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = request.headers.get("x-cron-secret")
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    console.warn("CRON_SECRET not configured in environment")
    return false
  }

  return cronSecret === expectedSecret
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    if (!verifyCronSecret(request)) {
      console.warn("Unauthorized cron request")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[CRON] Running escalation timeout checker")

    // Check and handle timeouts
    const count = await checkAndHandleTimeouts()

    console.log(`[CRON] Escalation timeout checker completed - ${count} escalations handled`)

    return NextResponse.json({
      success: true,
      message: `Checked escalation timeouts - ${count} handled`,
    })
  } catch (error) {
    console.error("[CRON] Error in timeout checker:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    )
  }
}
