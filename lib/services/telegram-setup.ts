/**
 * Telegram Bot Setup Utility
 * Handles webhook registration and bot configuration
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "escalation_webhook_secret_soc_dashboard_2026"
const TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

export interface TelegramBotInfo {
  ok: boolean
  result?: {
    id: number
    is_bot: boolean
    first_name: string
    username?: string
  }
  error_code?: number
  description?: string
}

export interface TelegramWebhookInfo {
  ok: boolean
  result?: {
    url: string
    has_custom_certificate: boolean
    pending_update_count: number
    ip_address?: string
    last_error_date?: number
    last_error_message?: string
    last_synchronization_error_date?: number
  }
  error_code?: number
  description?: string
}

/**
 * Get bot info to verify token and bot setup
 */
export async function getBotInfo(): Promise<TelegramBotInfo> {
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/getMe`)
    const data = await response.json()
    return data
  } catch (error) {
    console.error("Error getting bot info:", error)
    return {
      ok: false,
      error_code: 500,
      description: "Failed to get bot info",
    }
  }
}

/**
 * Get current webhook info
 */
export async function getWebhookInfo(): Promise<TelegramWebhookInfo> {
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/getWebhookInfo`)
    const data = await response.json()
    return data
  } catch (error) {
    console.error("Error getting webhook info:", error)
    return {
      ok: false,
      error_code: 500,
      description: "Failed to get webhook info",
    }
  }
}

/**
 * Set webhook for the bot
 */
export async function setWebhook(): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      return {
        success: false,
        error: "TELEGRAM_BOT_TOKEN not configured",
      }
    }

    if (!TELEGRAM_WEBHOOK_URL) {
      return {
        success: false,
        error: "TELEGRAM_WEBHOOK_URL not configured",
      }
    }

    // First get bot info to verify token
    const botInfo = await getBotInfo()
    if (!botInfo.ok) {
      return {
        success: false,
        error: `Failed to verify bot: ${botInfo.description}`,
      }
    }

    console.log(`[Telegram] Bot verified: @${botInfo.result?.username} (ID: ${botInfo.result?.id})`)

    // Set webhook with secret token for validation
    const response = await fetch(`${TELEGRAM_API_URL}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: TELEGRAM_WEBHOOK_URL,
        secret_token: TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
      }),
    })

    const result = await response.json()

    if (result.ok) {
      console.log(`[Telegram] Webhook set successfully to: ${TELEGRAM_WEBHOOK_URL}`)
      return {
        success: true,
        message: `Webhook set successfully: ${TELEGRAM_WEBHOOK_URL}`,
      }
    } else {
      console.error(`[Telegram] Failed to set webhook:`, result.description)
      return {
        success: false,
        error: result.description || "Unknown error",
      }
    }
  } catch (error) {
    console.error("Error setting webhook:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Delete webhook (useful for testing or cleanup)
 */
export async function deleteWebhook(): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      return {
        success: false,
        error: "TELEGRAM_BOT_TOKEN not configured",
      }
    }

    const response = await fetch(`${TELEGRAM_API_URL}/deleteWebhook`)
    const result = await response.json()

    if (result.ok) {
      console.log("[Telegram] Webhook deleted successfully")
      return {
        success: true,
        message: "Webhook deleted successfully",
      }
    } else {
      return {
        success: false,
        error: result.description || "Unknown error",
      }
    }
  } catch (error) {
    console.error("Error deleting webhook:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Send test message to verify bot is working
 */
export async function sendTestMessage(chatId: string): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "✅ SOC Dashboard Telegram Bot Connected!\n\nYour account has been successfully linked for alert escalation notifications.",
        parse_mode: "Markdown",
      }),
    })

    const result = await response.json()

    if (result.ok) {
      console.log(`[Telegram] Test message sent to ${chatId}`)
      return {
        success: true,
        message: `Test message sent to chat ${chatId}`,
      }
    } else {
      return {
        success: false,
        error: result.description || "Failed to send message",
      }
    }
  } catch (error) {
    console.error("Error sending test message:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
