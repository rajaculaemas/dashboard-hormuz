/**
 * Telegram Polling Manager
 * Auto-starts polling when app loads, auto-stops when app shuts down
 * Manages polling lifecycle within the main Next.js app
 */

import { TelegramPollingService } from "./telegram-polling"

let pollingInterval: NodeJS.Timeout | null = null
let isPolling = false
let isPollingActive = false // Prevent concurrent polling cycles
let lastUpdateId = 0
let updateCount = 0
let errorCount = 0
const POLLING_INTERVAL_MS = 2000 // 2 seconds

export class TelegramPollingManager {
  /**
   * Start polling service
   */
  static async start(): Promise<void> {
    if (isPolling) {
      console.log("[Telegram Polling Manager] Already polling, ignoring duplicate start")
      return
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.warn(
        "[Telegram Polling Manager] TELEGRAM_BOT_TOKEN not configured, polling disabled",
      )
      return
    }

    console.log(
      `[Telegram Polling Manager] Starting polling service (interval: ${POLLING_INTERVAL_MS}ms)`,
    )
    isPolling = true

    // Initialize polling (load persisted lastUpdateId)
    TelegramPollingService.initializePolling()

    // On first run (lastUpdateId = 0), skip to latest updates
    await TelegramPollingService.skipToLatest()

    // Poll immediately on start
    await this.pollOnce()

    // Then set up interval for continuous polling
    pollingInterval = setInterval(async () => {
      await this.pollOnce().catch((error) => {
        console.error("[Telegram Polling Manager] Error in polling cycle:", error)
      })
    }, POLLING_INTERVAL_MS)

    console.log("[Telegram Polling Manager] Polling service started successfully")
  }

  /**
   * Stop polling service
   */
  static async stop(): Promise<void> {
    if (!isPolling) {
      console.log("[Telegram Polling Manager] Not polling, ignoring stop")
      return
    }

    console.log("[Telegram Polling Manager] Stopping polling service...")

    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
    }

    isPolling = false

    console.log(
      `[Telegram Polling Manager] Polling stopped. Stats - Updates: ${updateCount}, Errors: ${errorCount}`,
    )
  }

  /**
   * Execute one polling cycle
   */
  private static async pollOnce(): Promise<void> {
    // Prevent concurrent polling cycles
    if (isPollingActive) {
      return
    }

    isPollingActive = true
    try {
      // Get updates from Telegram
      const updates = await TelegramPollingService.getUpdates(100, 1)

      if (updates.length === 0) {
        return
      }

      console.log(`[Telegram Polling Manager] Processing ${updates.length} update(s), lastUpdateId: ${lastUpdateId}`)

      // Process each update
      for (const update of updates) {
        try {
          await TelegramPollingService.processUpdate(update)
          lastUpdateId = update.update_id
          // Sync the lastUpdateId back to polling service
          TelegramPollingService.setLastUpdateId(lastUpdateId)
          updateCount++
        } catch (error) {
          console.error(
            `[Telegram Polling] Error processing update ${update.update_id}:`,
            error,
          )
          errorCount++
        }
      }
    } catch (error) {
      console.error("[Telegram Polling] Error in polling cycle:", error)
      errorCount++
    } finally {
      isPollingActive = false
    }
  }

  /**
   * Get polling status
   */
  static getStatus(): {
    isPolling: boolean
    updateCount: number
    errorCount: number
    errorRate: string
  } {
    const errorRate =
      updateCount === 0
        ? "0%"
        : `${((errorCount / (updateCount + errorCount)) * 100).toFixed(2)}%`

    return {
      isPolling,
      updateCount,
      errorCount,
      errorRate,
    }
  }

  /**
   * Reset stats
   */
  static resetStats(): void {
    updateCount = 0
    errorCount = 0
  }
}
