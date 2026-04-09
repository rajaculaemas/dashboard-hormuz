/**
 * Telegram Polling Init Endpoint
 * Called on app startup to initialize polling service
 */

import { NextRequest, NextResponse } from "next/server"
import { TelegramPollingManager } from "@/lib/services/telegram-polling-manager"

export async function POST(request: NextRequest) {
  try {
    const status = TelegramPollingManager.getStatus()

    if (status.isPolling) {
      return NextResponse.json({
        success: true,
        message: "Telegram polling already running",
      })
    }

    await TelegramPollingManager.start()
    const newStatus = TelegramPollingManager.getStatus()

    return NextResponse.json({
      success: true,
      message: "Telegram polling started",
      polling: newStatus,
    })
  } catch (error) {
    console.error("[Polling Init] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to initialize polling",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
