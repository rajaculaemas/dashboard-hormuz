/**
 * Telegram Escalation Service
 * Handles sending escalation notifications and managing Telegram bot interactions
 */

import fetch from "node-fetch"

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

interface TelegramMessage {
  chatId: string
  text: string
  parseMode?: "HTML" | "Markdown" | "MarkdownV2"
  replyMarkup?: any
}

export class TelegramEscalationService {
  /**
   * Send escalation message to L2/L3 analyst
   */
  /**
   * Send escalation message with retry logic
   */
  private static async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 2,
  ): Promise<Response> {
    const delays = [500, 1000, 2000] // 0.5s, 1s, 2s
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options)
        return response
      } catch (error) {
        if (attempt < maxRetries) {
          const delay = delays[attempt]
          console.log(`[Telegram] Fetch attempt ${attempt + 1} failed, retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          throw error
        }
      }
    }
    
    throw new Error("Max retries exceeded")
  }

  static async sendEscalationMessage(
    chatId: string,
    alert: any,
    escalationLevel: number,
    escalationId: string, // Unique escalation ID for callback button
    previousAnalyses: {
      l1?: string
      l2?: string
    } = {},
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!TELEGRAM_BOT_TOKEN) {
        console.error("TELEGRAM_BOT_TOKEN not configured")
        return { success: false, error: "Telegram bot not configured" }
      }

      if (!chatId) {
        return { success: false, error: "Chat ID not provided" }
      }

      // Build message content
      let messageText = this.formatEscalationMessage(alert, escalationLevel, previousAnalyses)

      // Send to Telegram with retry logic
      const response = await this.fetchWithRetry(
        `${TELEGRAM_API_URL}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            parse_mode: "HTML",
            reply_markup: this.getReplyMarkup(escalationLevel, escalationId),
          }),
        },
        2, // max retries
      )

      const data = (await response.json()) as any

      if (!data.ok) {
        console.error(`Telegram API error: ${data.description}`)
        return { success: false, error: data.description }
      }

      return {
        success: true,
        messageId: String(data.result.message_id),
      }
    } catch (error) {
      console.error("Error sending escalation message:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Send timeout notification to next level or admin
   */
  static async sendTimeoutNotification(
    chatId: string,
    alert: any,
    currentLevel: "L2" | "L3",
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!TELEGRAM_BOT_TOKEN) {
        return { success: false, error: "Telegram bot not configured" }
      }

      const nextLevel = currentLevel === "L2" ? "L3" : "Admin (SOC)"
      const messageText = `
<b>⏰ ESCALATION TIMEOUT</b>

<b>Alert:</b> ${alert.title}
<b>Alert ID:</b> <code>${alert.externalId}</code>
<b>Current Level:</b> ${currentLevel}

❌ No response from ${currentLevel} within 30 minutes

<b>Action Required:</b>
Escalation automatically forwarded to ${nextLevel}

<a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/alerts/${alert.id}">→ View Alert in Dashboard</a>
      `.trim()

      const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: "HTML",
        }),
      })

      const data = (await response.json()) as any
      return { success: data.ok, error: data.ok ? undefined : data.description }
    } catch (error) {
      console.error("Error sending timeout notification:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Send admin notification about escalation response
   */
  static async sendAdminNotification(
    chatId: string,
    escalationData: {
      alertId: string
      alertTitle: string
      respondedLevel: "L2" | "L3"
      responderName: string
      action: "reply" | "escalate"
    },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!TELEGRAM_BOT_TOKEN) {
        return { success: false, error: "Telegram bot not configured" }
      }

      const actionText = escalationData.action === "reply" ? "Replied" : "Escalated"
      const messageText = `
<b>✅ ESCALATION RESPONSE</b>

<b>Alert:</b> ${escalationData.alertTitle}
<b>Alert ID:</b> <code>${escalationData.alertId}</code>
<b>From:</b> ${escalationData.respondedLevel} - ${escalationData.responderName}
<b>Action:</b> ${actionText}

<b>Next Steps:</b>
Review the analysis and take appropriate action

<a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/alerts/${escalationData.alertId}">→ Open Alert in Dashboard</a>
      `.trim()

      const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: "HTML",
        }),
      })

      const data = (await response.json()) as any
      return { success: data.ok, error: data.ok ? undefined : data.description }
    } catch (error) {
      console.error("Error sending admin notification:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Format escalation message for Telegram
   */
  private static formatEscalationMessage(
    alert: any,
    escalationLevel: number,
    previousAnalyses: { l1?: string; l2?: string },
  ): string {
    const levelText = escalationLevel === 1 ? "L2" : "L3"
    const fromLevel = escalationLevel === 1 ? "L1" : "L2"

    // Determine source from alert
    let source = "Unknown"
    if (alert.integration?.name) {
      source = alert.integration.name
    } else if (alert.source) {
      source = alert.source
    } else if (alert.metadata?.integration) {
      source = alert.metadata.integration
    }

    let message = `<b>� ALERT ESCALATION</b> <b>${fromLevel}</b> → <b>${levelText}</b>\n\n`
    message += `<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n\n`
    message += `<b>Alert ID:</b>\n<code>${alert.externalId}</code>\n\n`
    message += `<b>Title:</b>\n${alert.title}\n\n`
    message += `<b>Severity:</b> <b>${alert.severity || "Unknown"}</b>\n`
    message += `<b>Source:</b> ${source}\n\n`
    message += `<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n\n`

    // Show analysis from L1 if escalating to L2
    if (escalationLevel === 1 && previousAnalyses.l1) {
      message += `<b>📋 L1 Analysis:</b>\n`
      message += `<i>${this.truncateText(previousAnalyses.l1, 500)}</i>\n\n`
      message += `<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n\n`
    }

    // Show analysis from both L1 and L2 if escalating to L3
    if (escalationLevel === 2) {
      if (previousAnalyses.l1) {
        message += `<b>📋 L1 Analysis:</b>\n`
        message += `<i>${this.truncateText(previousAnalyses.l1, 300)}</i>\n\n`
      }

      if (previousAnalyses.l2) {
        message += `<b>📋 L2 Analysis:</b>\n`
        message += `<i>${this.truncateText(previousAnalyses.l2, 300)}</i>\n\n`
      }
      message += `<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n\n`
    }

    message += `<b>💬 Your Response Required:</b>\n`
    message += `Reply to this message with your analysis in this format:\n\n`
    message += `<code>ANALYSIS: [your detailed findings]</code>\n`
    message += `<code>CONCLUSION: [your verdict/decision]</code>\n\n`

    if (escalationLevel === 2) {
      message += `<i>💡 If you need further escalation to L3, include "ESCALATE_L3" in your response</i>\n\n`
    }

    message += `⏱️ <b>Respond within 30 minutes</b>`

    return message
  }

  /**
   * Get inline keyboard markup for escalation buttons
   */
  private static getReplyMarkup(escalationLevel: number, escalationId: string) {
    // Create inline keyboard with response options
    const buttons = [
      [
        {
          text: "💬 Reply Analysis",
          callback_data: `reply_esc_${escalationId}`,
        },
      ],
    ]

    // Add escalate button for L2 (can escalate to L3)
    if (escalationLevel === 1) {
      buttons.push([
        {
          text: "🚀 Escalate to L3",
          callback_data: "escalate_l3",
        },
      ])
    }

    return {
      inline_keyboard: buttons,
    }
  }

  /**
   * Truncate text to specified length and add ellipsis
   */
  private static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + `...\n\n<i>[text truncated]</i>`
  }

  /**
   * Edit message to disable buttons when timeout occurs
   */
  static async editTimeoutMessage(
    chatId: string,
    messageId: string | number,
    level: "L2" | "L3",
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!TELEGRAM_BOT_TOKEN) {
        return { success: false, error: "Telegram bot not configured" }
      }

      const nextLevel = level === "L2" ? "L3" : "Admin (SOC)"
      const messageText = `⏰ <b>Escalation Timed Out</b>

This escalation has automatically escalated to <b>${nextLevel}</b>.

Your response buttons are now disabled.`

      const response = await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: messageText,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [] }, // Empty buttons
        }),
      })

      const data = (await response.json()) as any

      if (!data.ok) {
        console.warn(`[Telegram] Failed to edit timeout message: ${data.description}`)
        // Not critical if message edit fails
        return { success: false, error: data.description }
      }

      console.log(`[Telegram] ✅ Timeout message edited for chat ${chatId}`)
      return { success: true }
    } catch (error) {
      console.error("[Telegram] Error editing timeout message:", error)
      // Not critical, escalation continues even if message edit fails
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }

  /**
   * Parse response from analyst
   * Expected format:
   * ANALYSIS: [analysis text]
   * CONCLUSION: [verdict] (TRUE POSITIVE | BENIGN TRUE POSITIVE | FALSE_POSITIVE | ESCALATE_L3)
   */
  static parseAnalystResponse(message: string): {
    analysis?: string
    conclusion?: string
    shouldEscalate?: boolean
    error?: string
  } {
    try {
      // Valid verdicts for old format
      const validVerdicts = [
        "TRUE POSITIVE",
        "BENIGN TRUE POSITIVE",
        "FALSE_POSITIVE",
        "ESCALATE_L3",
      ]

      const trimmedMessage = message.trim()
      let analysis = ""
      let conclusion = ""
      let shouldEscalate = false

      // Check for old format with ANALYSIS: and CONCLUSION:
      const hasOldFormat = /ANALYSIS:|CONCLUSION:/i.test(trimmedMessage)

      if (hasOldFormat) {
        // Try to extract old format
        const analysisMatch = trimmedMessage.match(/ANALYSIS:\s*([\s\S]*?)(?=CONCLUSION:|$)/i)
        if (!analysisMatch) {
          return {
            error: "Missing ANALYSIS section. Please provide format:\nANALYSIS: [your text]\nCONCLUSION: [verdict]",
          }
        }

        analysis = analysisMatch[1].trim().replace(/^\[/, "").replace(/\]$/, "").trim()

        const conclusionMatch = trimmedMessage.match(/CONCLUSION:\s*\[?(.*?)\]?\s*(?:\n|$)/i)
        if (!conclusionMatch) {
          return {
            error: "Missing CONCLUSION section. Please provide format:\nANALYSIS: [your text]\nCONCLUSION: [verdict]\n\nValid verdicts: TRUE POSITIVE, BENIGN TRUE POSITIVE, FALSE_POSITIVE, ESCALATE_L3",
          }
        }

        conclusion = conclusionMatch[1]
          .trim()
          .replace(/[\[\]]/g, "")
          .toUpperCase()

        // Validate verdict
        if (!validVerdicts.includes(conclusion)) {
          return {
            error: `Invalid verdict: "${conclusion}"\n\nValid options:\n• TRUE POSITIVE\n• BENIGN TRUE POSITIVE\n• FALSE_POSITIVE\n• ESCALATE_L3`,
          }
        }

        shouldEscalate = conclusion === "ESCALATE_L3"
      } else {
        // NEW FORMAT: Accept any text as analysis (simple reply)
        // Check for escalation keywords
        const escalationKeywords = ["escalate", "l3", "escalate to l3", "needs l3"]
        shouldEscalate = escalationKeywords.some(keyword =>
          trimmedMessage.toLowerCase().includes(keyword)
        )

        // Use the entire message as analysis if no escalation keywords
        // Or extract the actual analysis from the message
        if (shouldEscalate) {
          // Remove escalation keywords from analysis
          analysis = trimmedMessage
            .replace(/escalate.*l3/gi, "")
            .replace(/needs.*l3/gi, "")
            .trim()
          
          // If only escalation keyword was said, provide a default message
          if (!analysis || analysis.length < 3) {
            analysis = "Escalating to L3 for further investigation"
          }
        } else {
          // Just use the message as analysis
          analysis = trimmedMessage
        }

        // Don't require verdict in new format
        conclusion = shouldEscalate ? "ESCALATE_L3" : ""
      }

      if (!analysis || analysis.length < 3) {
        return {
          error: "Analysis must be at least 3 characters long",
        }
      }

      return {
        analysis,
        conclusion: conclusion || undefined,
        shouldEscalate,
      }
    } catch (error) {
      return {
        error: "Error parsing response. Please provide your analysis as simple text or use format:\nANALYSIS: [your analysis]\nCONCLUSION: [verdict]",
      }
    }
  }

  /**
   * Send a general notification (not escalation related)
   * Used for shift recaps, alerts, etc.
   */
  static async sendNotification(
    chatId: string,
    message: string,
    parseMode: "HTML" | "Markdown" | "MarkdownV2" = "Markdown",
  ): Promise<string> {
    try {
      if (!TELEGRAM_BOT_TOKEN) {
        throw new Error("Telegram bot not configured")
      }

      if (!chatId) {
        throw new Error("Chat ID not provided")
      }

      const response = await this.fetchWithRetry(
        `${TELEGRAM_API_URL}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: parseMode,
          }),
        },
        2, // max retries
      )

      const data = (await response.json()) as any

      if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description}`)
      }

      // Return message ID for tracking
      return data.result.message_id.toString()
    } catch (error) {
      console.error("[Telegram] Failed to send notification:", error)
      throw error
    }
  }
}
