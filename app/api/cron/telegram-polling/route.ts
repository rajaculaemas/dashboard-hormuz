/**
 * Telegram Polling Cron Endpoint
 * Triggers polling to fetch updates from Telegram
 * Can be called every 10-30 seconds from a cron service or scheduler
 */

import { NextRequest, NextResponse } from "next/server"
import { TelegramPollingService } from "@/lib/services/telegram-polling"

export async function GET(request: NextRequest) {
  try {
    // Optional: Verify cron secret if configured
    const cronSecret = request.headers.get("authorization")
    if (
      process.env.CRON_SECRET &&
      cronSecret !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      console.warn("[Telegram Cron] Invalid cron secret")
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    console.log("[Telegram Cron] Starting polling cycle...")

    // Get updates from Telegram (with 5 second timeout for long polling)
    const updates = await TelegramPollingService.getUpdates(100, 5)

    if (updates.length === 0) {
      console.log("[Telegram Cron] No new updates")
      return NextResponse.json({
        success: true,
        updatesProcessed: 0,
      })
    }

    console.log(`[Telegram Cron] Received ${updates.length} update(s)`)

    // Process each update
    for (const update of updates) {
      await TelegramPollingService.processUpdate(update)
      TelegramPollingService.setLastUpdateId(update.update_id)
    }

    return NextResponse.json({
      success: true,
      updatesProcessed: updates.length,
    })
  } catch (error) {
    console.error("[Telegram Cron] Error in polling:", error)
    return NextResponse.json(
      {
        error: "Failed to process updates",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  // Forward POST to GET handler (same logic)
  return GET(request)
}
