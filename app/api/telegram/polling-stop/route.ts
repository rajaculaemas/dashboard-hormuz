/**
 * Telegram Polling Stop Endpoint
 * Called on app shutdown to gracefully stop polling service
 */

import { NextRequest, NextResponse } from "next/server"
import { TelegramPollingManager } from "@/lib/services/telegram-polling-manager"

export async function POST(request: NextRequest) {
  try {
    const status = TelegramPollingManager.getStatus()

    if (!status.isPolling) {
      return NextResponse.json({
        success: true,
        message: "Telegram polling not running",
      })
    }

    await TelegramPollingManager.stop()

    return NextResponse.json({
      success: true,
      message: "Telegram polling stopped",
      stats: status,
    })
  } catch (error) {
    console.error("[Polling Stop] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to stop polling",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
