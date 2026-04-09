/**
 * Telegram Polling Status Endpoint
 * Returns current polling service status
 */

import { NextRequest, NextResponse } from "next/server"
import { TelegramPollingManager } from "@/lib/services/telegram-polling-manager"

export async function GET(request: NextRequest) {
  try {
    const status = TelegramPollingManager.getStatus()

    return NextResponse.json({
      success: true,
      telegram_polling: {
        status: status.isPolling ? "active" : "inactive",
        is_polling: status.isPolling,
        updates_processed: status.updateCount,
        errors: status.errorCount,
        error_rate: status.errorRate,
      },
      message: status.isPolling
        ? "Telegram polling service is active and running"
        : "Telegram polling service is not running",
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get polling status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
