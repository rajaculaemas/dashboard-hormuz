/**
 * Telegram Polling Service
 * Fetches updates from Telegram using getUpdates (long polling)
 * No need for public IP/domain or webhook setup
 * Persists lastUpdateId to avoid reprocessing messages on restart
 */

import prisma from "@/lib/prisma"
import { TelegramEscalationService } from "./telegram-escalation"
import * as fs from "fs"
import * as path from "path"

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

// File to persist lastUpdateId across restarts
const UPDATE_ID_STATE_FILE = path.join(process.cwd(), ".telegram-update-id")

// Store the last update ID to avoid processing same messages twice
let lastUpdateId = 0

// Load lastUpdateId from file on startup
function loadLastUpdateId(): number {
  try {
    if (fs.existsSync(UPDATE_ID_STATE_FILE)) {
      const data = fs.readFileSync(UPDATE_ID_STATE_FILE, "utf-8")
      const parsed = JSON.parse(data)
      lastUpdateId = parsed.lastUpdateId || 0
      console.log(`[Telegram Polling] Loaded lastUpdateId from file: ${lastUpdateId}`)
      return lastUpdateId
    }
  } catch (error) {
    console.warn(`[Telegram Polling] Failed to load lastUpdateId from file:`, error)
  }
  return 0
}

// Save lastUpdateId to file for persistence
function saveLastUpdateId(updateId: number): void {
  try {
    fs.writeFileSync(UPDATE_ID_STATE_FILE, JSON.stringify({ lastUpdateId: updateId }, null, 2))
  } catch (error) {
    console.warn(`[Telegram Polling] Failed to save lastUpdateId to file:`, error)
  }
}

// Helper: Fetch with retry logic and longer timeout
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  timeoutMs: number = 30000,
): Promise<Response> {
  let lastError: any = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return response
    } catch (error) {
      lastError = error
      console.warn(
        `[Telegram] Fetch attempt ${attempt + 1}/${maxRetries} failed:`,
        error instanceof Error ? error.message : String(error),
      )

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 1000
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }
  }

  throw lastError || new Error("Fetch failed after all retries")
}

export class TelegramPollingService {
  /**
   * Process a single update from Telegram
   */
  static async processUpdate(update: any): Promise<void> {
    try {
      console.log(`[Telegram Polling] Processing update ${update.update_id}`)

      // Handle text messages
      if (update.message?.text) {
        const message = update.message
        const chatId = String(message.chat.id)
        const text = message.text || ""
        const messageId = message.message_id
        const replyToMessageId = message.reply_to_message?.message_id
        const username = message.from?.username
        const firstName = message.from?.first_name || ""

        console.log(`[Telegram] Message from ${chatId}: ${text.substring(0, 50)}...`)
        console.log(`[Telegram]   - Message ID: ${messageId}`)
        console.log(`[Telegram]   - Is Reply: ${replyToMessageId ? "YES (replyToMessageId=" + replyToMessageId + ")" : "NO"}`)
        console.log(`[Telegram]   - Has reply_to_message field: ${message.reply_to_message ? "YES" : "NO"}`)

        // Handle /start command
        if (text.toLowerCase() === "/start") {
          await this.handleStartCommand(chatId, username, firstName)
          return
        }

        // Handle escalation responses (replies to escalation messages)
        if (replyToMessageId) {
          console.log(`[Telegram] ✅ This is a reply, processing as escalation response...`)
          await this.handleEscalationResponse(
            chatId,
            text,
            messageId,
            replyToMessageId,
          )
          return
        }

        // If message contains ANALYSIS keyword but is not a reply, prompt user to reply properly
        if (text.includes("ANALYSIS") && text.includes("CONCLUSION")) {
          console.log(`[Telegram] ⚠️ Message contains analysis format but is NOT a reply`)
          await this.sendMessage(
            chatId,
            `⚠️ <b>Please Reply Properly</b>\n\nYour message contains analysis, but it's not a reply to any message.\n\n<b>Steps:</b>\n1. Go back to the <b>prompt message</b> I sent\n2. Tap the <b>reply arrow icon</b>\n3. Paste your analysis there\n4. Send\n\nYour analysis should be a REPLY to my message, not a standalone message.`,
            "HTML",
          )
          return
        }
      }

      // Handle button clicks (callback queries)
      if (update.callback_query) {
        const callbackQuery = update.callback_query
        const chatId = String(callbackQuery.message?.chat?.id)
        const messageId = callbackQuery.message?.message_id
        const data = callbackQuery.data
        const callbackId = callbackQuery.id

        console.log(`[Telegram] Callback from ${chatId}: ${data}`)

        // Handle "Escalate to L3" button - show confirmation or list of L3 analysts
        if (data === "escalate_l3") {
          await this.handleEscalateL3Button(chatId, messageId, callbackId)
          return
        }

        // Handle "Escalate without analysis" confirmation
        if (data.startsWith("escalate_l3_confirm_")) {
          const escalationId = data.replace("escalate_l3_confirm_", "")
          await this.handleEscalateWithoutAnalysis(chatId, callbackId, escalationId)
          return
        }

        // Handle "Select L3" button - user selected a specific L3 analyst
        if (data.startsWith("select_l3_")) {
          const l3UserId = data.replace("select_l3_", "")
          await this.handleSelectL3Button(chatId, messageId, callbackId, l3UserId)
          return
        }

        // Handle "Reply with Analysis" button
        if (data.startsWith("reply_esc_")) {
          await this.handleReplyAnalysisButton(chatId, messageId, callbackId)
          return
        }
      }
    } catch (error) {
      console.error(`[Telegram Polling] Error processing update ${update.update_id}:`, error)
    }
  }

  /**
   * Fetch updates from Telegram using long polling
   */
  static async getUpdates(limit: number = 100, timeout: number = 30): Promise<any[]> {
    try {
      if (!TELEGRAM_BOT_TOKEN) {
        console.error("[Telegram Polling] TELEGRAM_BOT_TOKEN not configured")
        return []
      }

      const offset = lastUpdateId + 1
      console.log(`[Telegram Polling] Fetching updates from offset ${offset}`)

      const response = await fetchWithRetry(
        `${TELEGRAM_API_URL}/getUpdates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offset: offset,
            limit: limit,
            timeout: timeout,
            allowed_updates: ["message", "callback_query"],
          }),
        },
        2, // 2 retries for long polling
        40000, // 40 second timeout (30s long polling + buffer)
      )

      const data = (await response.json()) as any

      if (!data.ok) {
        console.error(`[Telegram Polling] ❌ getUpdates failed: ${data.description}`)
        return []
      }

      const updates = data.result || []
      
      // Update lastUpdateId if we got any updates
      if (updates.length > 0) {
        lastUpdateId = updates[updates.length - 1].update_id
        saveLastUpdateId(lastUpdateId)
        console.log(`[Telegram Polling] ✅ Fetched ${updates.length} update(s), last update ID: ${lastUpdateId}`)
      }

      return updates
    } catch (error) {
      console.error("[Telegram Polling] Error fetching updates:", error)
      return []
    }
  }

  /**
   * Initialize polling service - load lastUpdateId from persistent storage
   */
  static initializePolling(): void {
    loadLastUpdateId()
    
    // If lastUpdateId is still 0, this is first run
    // We'll skip to latest updates to avoid reprocessing all old messages
    if (lastUpdateId === 0) {
      console.log(
        `[Telegram Polling] First run detected (lastUpdateId = 0), will fetch latest updates on first poll`,
      )
    } else {
      console.log(`[Telegram Polling] Initialized with lastUpdateId: ${lastUpdateId}`)
    }
  }

  /**
   * Fetch latest update ID without processing messages
   * Used on first run to position at latest updates
   */
  static async skipToLatest(): Promise<void> {
    try {
      if (!TELEGRAM_BOT_TOKEN || lastUpdateId !== 0) {
        return // Only run on first initialization
      }

      console.log(`[Telegram Polling] Skipping to latest updates...`)

      const response = await fetchWithRetry(
        `${TELEGRAM_API_URL}/getUpdates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offset: -1, // Get only the most recent update
            limit: 1,
            timeout: 1,
            allowed_updates: ["message", "callback_query"],
          }),
        },
        2, // 2 retries
        10000, // 10 second timeout
      )

      const data = (await response.json()) as any

      if (data.ok && data.result && data.result.length > 0) {
        lastUpdateId = data.result[0].update_id
        saveLastUpdateId(lastUpdateId)
        console.log(
          `[Telegram Polling] Positioned at latest update: ${lastUpdateId}`,
        )
      } else {
        // No updates yet, set to 0 so next fetch will get updates from beginning
        lastUpdateId = 0
        saveLastUpdateId(0)
        console.log(`[Telegram Polling] No updates found, starting from beginning`)
      }
    } catch (error) {
      console.warn(`[Telegram Polling] Error skipping to latest:`, error)
    }
  }

  /**
   * Handle /start command - Register user
   */
  private static async handleStartCommand(
    chatId: string,
    username?: string,
    firstName?: string,
  ): Promise<void> {
    try {
      console.log(`[Telegram] /start from chat ${chatId}, username: ${username}, firstName: ${firstName}`)

      // FIRST: Check if chat ID already linked to a user
      let user = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
      })

      if (user) {
        const message = `✅ <b>Already Connected!</b>\n\nYour account is already linked to SOC Dashboard.\n\n<b>Your Profile:</b>\n• Name: ${user.name}\n• Position: ${user.position || "Not set"}\n• Email: ${user.email}\n\n🎯 <b>Ready to receive escalations!</b>`
        await this.sendMessage(chatId, message, "HTML")
        console.log(`[Telegram] ℹ️ User ${user.email} already linked to chat ${chatId}`)
        return
      }

      // SECOND: If chat ID not linked, try to find by username
      if (username) {
        console.log(`[Telegram] Chat ID not yet linked. Searching by username: ${username}`)
        
        // First try email extraction from username (e.g., farahaff -> any email containing farah)
        if (username.includes('.') || username.includes('@')) {
          const emailParts = username.split('@')
          const emailPart = emailParts[0]
          console.log(`[Telegram] Step 1: Trying email match with: ${emailPart}`)
          user = await prisma.user.findFirst({
            where: {
              email: { contains: emailPart, mode: "insensitive" },
            },
          })
          if (user) {
            console.log(`[Telegram] ✅ Found user by email containing: ${user.email}`)
          }
        }
        
        // Try exact username match on name
        if (!user) {
          console.log(`[Telegram] Step 2: Trying exact username match on name`)
          user = await prisma.user.findFirst({
            where: {
              name: { equals: username, mode: "insensitive" },
            },
          })
          if (user) {
            console.log(`[Telegram] ✅ Found user by exact name match: ${user.email}`)
          }
        }
        
        // Try username startsWith on name (e.g., "farah" matches "fazzahrah")
        if (!user) {
          console.log(`[Telegram] Step 3: Trying username startsWith on name`)
          const allUsers = await prisma.user.findMany()
          user = allUsers.find(u =>
            u.name.toLowerCase().startsWith(username.toLowerCase()) ||
            u.email.toLowerCase().includes(username.toLowerCase())
          )
          if (user) {
            console.log(`[Telegram] ✅ Found user by startsWith: ${user.email}`)
          }
        }

        // Fallback: try firstName match
        if (!user && firstName && firstName.length > 2) {
          console.log(`[Telegram] Step 4: Fallback - Trying firstName "${firstName}" match`)
          const allUsers = await prisma.user.findMany()
          user = allUsers.find(u =>
            u.name.toLowerCase().startsWith(firstName.toLowerCase()) ||
            u.name.toLowerCase().includes(firstName.toLowerCase())
          )
          if (user) {
            console.log(`[Telegram] ✅ Found user by firstName match: ${user.email}`)
          }
        }
      }

      if (!user) {
        console.warn(`[Telegram] ❌ User not found for /start from chat ${chatId}. Username: ${username}, FirstName: ${firstName}`)
        
        const helpText = `🤔 <b>Account Not Found</b>\n\nI couldn't automatically find your account.\n\n<b>Solution: Contact Your Administrator</b>\n\nAsk your admin to link your Telegram account manually. Provide them this info:\n• Chat ID: <code>${chatId}</code>\n• Telegram Username: <code>${username || "none"}</code>\n• First Name: <code>${firstName || "none"}</code>\n\nOr ask admin to set your "Telegram Chat ID" field in the User Profile to: <code>${chatId}</code>`
        
        await this.sendMessage(chatId, helpText, "HTML")
        return
      }

      // Link chat ID to user
      await prisma.user.update({
        where: { id: user.id },
        data: { telegramChatId: chatId },
      })

      const message = `✅ <b>Connected Successfully!</b>\n\nYour Telegram is now linked to SOC Dashboard.\n\n<b>Your Profile:</b>\n• Name: ${user.name}\n• Position: ${user.position || "Not set"}\n• Email: ${user.email}\n\n🎯 <b>Ready to receive escalations!</b>\n\nYou'll receive notifications when alerts are escalated to you.`

      await this.sendMessage(chatId, message, "HTML")
      console.log(`[Telegram] ✅✅ User ${user.email} successfully linked to chat ${chatId}`)
    } catch (error) {
      console.error("[Telegram Polling] Error in /start:", error)
      // Send error message to user
      await this.sendMessage(
        chatId,
        "⚠️ Sorry, there was an error processing your request. Please try again later.",
      ).catch(() => {})
    }
  }

  /**
   * Handle escalation response (L2/L3 analysis)
   */
  private static async handleEscalationResponse(
    chatId: string,
    text: string,
    messageId: number,
    replyToMessageId: number,
  ): Promise<void> {
    try {
      console.log(`[Telegram] ═══════════════════════════════════`)
      console.log(`[Telegram] Received REPLY from chat ${chatId}`)
      console.log(`[Telegram] Message ID: ${messageId}`)
      console.log(`[Telegram] Reply To Message ID: ${replyToMessageId}`)
      console.log(`[Telegram] Text length: ${text.length}`)
      console.log(`[Telegram] Text preview: ${text.substring(0, 100)}...`)
      console.log(`[Telegram] ═══════════════════════════════════`)

      // Try to find escalation by matching the replied-to message
      console.log(`[Telegram] 🔍 Step 1: Searching by replyToMessageId=${replyToMessageId}...`)
      let escalation = await prisma.alertEscalation.findFirst({
        where: {
          status: "pending",
          telegramChatId: chatId,
          telegramMessageId: String(replyToMessageId),
        },
        include: {
          alert: true,
          escalatedTo: true,
        },
      })

      if (escalation) {
        console.log(`[Telegram] ✅ Found escalation by message ID: ${escalation.id}`)
      }

      // If not found, try finding the most recent pending escalation for this chat
      // (in case user replied to prompt message instead of escalation message)
      if (!escalation) {
        console.log(`[Telegram] 🔍 Step 2: Searching most recent pending escalation for chat ${chatId}...`)
        escalation = await prisma.alertEscalation.findFirst({
          where: {
            status: "pending",
            telegramChatId: chatId,
          },
          include: {
            alert: true,
            escalatedTo: true,
          },
          orderBy: { createdAt: "desc" },
        })

        if (escalation) {
          console.log(`[Telegram] ✅ Found most recent escalation: ${escalation.id}`)
          console.log(`[Telegram]    - AlertID: ${escalation.alertId}`)
          console.log(`[Telegram]    - EscalationLevel: ${escalation.escalationLevel}`)
          console.log(`[Telegram]    - EscalatedTo: ${escalation.escalatedTo?.name}`)
        }
      }

      if (!escalation) {
        console.warn(`[Telegram] ❌ No pending escalation found for chat ${chatId}`)
        await this.sendMessage(
          chatId,
          `❌ <b>No Active Escalation Found</b>\n\nSeems like you're not currently handling an escalation.\n\nWait for an alert to be escalated to you.`,
          "HTML",
        )
        return
      }

      console.log(`[Telegram] 📝 Parsing analysis from text...`)

      // Parse analysis
      const parsed = TelegramEscalationService.parseAnalystResponse(text)

      console.log(`[Telegram] Parse result:`)
      console.log(`[Telegram]   - Error: ${parsed.error}`)
      console.log(`[Telegram]   - Analysis length: ${(parsed.analysis || "").length}`)
      console.log(`[Telegram]   - Conclusion: ${parsed.conclusion}`)
      console.log(`[Telegram]   - ShouldEscalate: ${parsed.shouldEscalate}`)

      if (parsed.error) {
        console.error(`[Telegram] Parse error: ${parsed.error}`)
        await this.sendMessage(chatId, `❌ <b>Invalid Format</b>\n\n${parsed.error}`, "HTML")
        return
      }

      console.log(`[Telegram] 💾 Saving response to database...`)

      // Save response
      const response = await prisma.alertEscalationResponse.create({
        data: {
          escalationId: escalation.id,
          responderId: escalation.escalatedToUserId,
          analysis: parsed.analysis || "",
          conclusion: parsed.conclusion || "",
          action: parsed.shouldEscalate ? "escalate" : "reply",
          telegramMessageId: String(messageId),
        },
        include: {
          responder: true,
        },
      })

      console.log(`[Telegram] ✅ Response saved: ${response.id}`)

      // Update escalation with analysis
      console.log(`[Telegram] 🔄 Updating escalation status...`)
      const updateData: any = {
        status: parsed.shouldEscalate ? "escalated" : "replied",
        repliedAt: new Date(),
      }

      // Only set the analysis field for the appropriate level
      if (escalation.escalationLevel === 1) {
        updateData.l2Analysis = parsed.analysis
      } else if (escalation.escalationLevel === 2) {
        updateData.l3Analysis = parsed.analysis
      }

      const updatedEscalation = await prisma.alertEscalation.update({
        where: { id: escalation.id },
        data: updateData,
      })

      console.log(`[Telegram] ✅ Escalation updated: status=${updatedEscalation.status}`)

      // Send confirmation
      let confirmMessage = `✅ <b>Analysis Received</b>\n\n`
      confirmMessage += `Your analysis has been saved:\n`
      confirmMessage += `• <b>Verdict:</b> ${parsed.conclusion}\n\n`

      if (escalation.escalationLevel === 1) {
        confirmMessage += `<b>Next Steps:</b>\n`
        confirmMessage += `• Click the <b>"🚀 Escalate to L3"</b> button below if you need further help\n`
        confirmMessage += `• Or your analysis will be reviewed\n\n`
        confirmMessage += `<i>You have 30 minutes to respond</i>`
      } else {
        confirmMessage += `<b>Next Steps:</b>\n`
        confirmMessage += `• Your analysis is being escalated to Management\n\n`
        confirmMessage += `<i>Thank you for your quick response!</i>`
      }

      await this.sendMessage(chatId, confirmMessage, "HTML")
      console.log(`[Telegram] ✅ Confirmation message sent`)

      // If escalating, escalate to L3
      if (parsed.shouldEscalate && escalation.escalationLevel === 1) {
        await this.escalateToL3(escalation, response)
      }

      // Create audit
      await prisma.alertEscalationAudit.create({
        data: {
          escalationId: escalation.id,
          alertId: escalation.alertId,
          event: response.action === "escalate" ? "re_escalated" : "replied",
          details: {
            responderId: response.responderId,
            responderName: response.responder.name,
            analysis: response.analysis.substring(0, 200),
          },
        },
      })

      console.log(`[Telegram] ✅✅ Analysis saved for escalation ${escalation.id}`)
    } catch (error) {
      console.error("[Telegram] ❌ Error handling escalation response:")
      console.error("[Telegram] Error details:", error instanceof Error ? error.message : String(error))
      if (error instanceof Error) {
        console.error("[Telegram] Stack:", error.stack)
      }
      try {
        await this.sendMessage(
          chatId,
          `⚠️ <b>Error Processing Analysis</b>\n\nThere was an error saving your analysis. Please contact your administrator.`,
          "HTML",
        )
      } catch (msgError) {
        console.error("[Telegram] Failed to send error message:", msgError)
      }
    }
  }
  /**
   * Escalate to L3 after L2 provides analysis
   * Automatically shows L3 analyst selection menu
   */
  private static async escalateToL3(
    escalation: any,
    response: any,
  ): Promise<void> {
    try {
      if (!escalation.telegramChatId) {
        console.error("[Telegram] ❌ No telegram chat ID for escalation")
        return
      }

      console.log(`[Telegram] 🚀 Escalating to L3 from ${escalation.escalatedTo?.name}`)

      // Show L3 analyst selection menu
      await this.showL3AnalystSelection(
        escalation.telegramChatId,
        "", // No callback ID since this is not a button callback
        escalation,
      )

      console.log(`[Telegram] ✅ L3 analyst selection menu sent`)
    } catch (error) {
      console.error("[Telegram Polling] Error escalating to L3:", error)
    }
  }

  /**
   * Handle "Escalate to L3" button click - Show list of available L3 analysts
   */
  private static async handleEscalateL3Button(
    chatId: string,
    messageId: number | undefined,
    callbackId: string,
  ): Promise<void> {
    try {
      console.log(`[Telegram] Button click: escalate_l3 from ${chatId}, message: ${messageId}, callback: ${callbackId}`)

      // Find escalation
      const escalation = await prisma.alertEscalation.findFirst({
        where: {
          status: "pending",
          telegramChatId: chatId,
          telegramMessageId: String(messageId),
        },
        include: {
          alert: true,
          escalatedTo: true,
        },
      })

      if (!escalation) {
        console.warn(`[Telegram] ❌ Escalation not found for chat ${chatId}, message ${messageId}`)
        const callbackResult = await this.answerCallback(
          callbackId,
          "❌ Escalation not found or already handled",
          true,
        )
        return
      }

      // Check if analysis was provided
      if (!escalation.l2Analysis || escalation.l2Analysis.includes("No analysis provided")) {
        console.log(`[Telegram] No analysis provided yet for escalation ${escalation.id}`)
        
        // Show confirmation with options
        const buttons = [
          [
            {
              text: "📝 Provide Analysis First",
              callback_data: `reply_esc_${escalation.escalationLevel}`,
            },
          ],
          [
            {
              text: "🚀 Escalate Without Analysis",
              callback_data: `escalate_l3_confirm_${escalation.id}`,
            },
          ],
        ]

        const messageText = `⚠️ <b>No Analysis Provided Yet</b>\n\nYou haven't provided any analysis before escalating.\n\n<b>What would you like to do?</b>\n\n1️⃣ Provide analysis first - Click "📝 Provide Analysis First"\n2️⃣ Escalate to L3 anyway - Click "🚀 Escalate Without Analysis"`

        await this.sendMessageWithKeyboard(chatId, messageText, buttons, "HTML")
        await this.answerCallback(callbackId, "Please confirm escalation first")
        return
      }

      // Analysis was provided, proceed to show L3 analyst list
      await this.showL3AnalystSelection(chatId, callbackId, escalation)
    } catch (error) {
      console.error("[Telegram Polling] Error in escalate L3 button:", error)
      const errorResult = await this.answerCallback(
        callbackId,
        "❌ Error processing request",
        true,
      ).catch((err) => {
        console.error("[Telegram] Failed to send error callback:", err)
      })
    }
  }

  /**
   * Show list of L3 analysts to select from
   */
  private static async showL3AnalystSelection(
    chatId: string,
    callbackId: string,
    escalation: any,
  ): Promise<void> {
    try {
      // Get list of available L3 analysts
      const l3Users = await prisma.user.findMany({
        where: {
          position: "Analyst L3",
          status: "active",
          telegramChatId: { not: null },
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      })

      if (l3Users.length === 0) {
        console.warn(`[Telegram] No L3 analysts available`)
        await this.answerCallback(callbackId, "No L3 analysts available", true)
        await this.sendMessage(chatId, "❌ No L3 analysts are currently available. Please try again later.", "HTML")
        return
      }

      // Create inline keyboard with L3 analyst options
      const buttons = l3Users.map((user) => [
        {
          text: `${user.name}`,
          callback_data: `select_l3_${user.id}`,
        },
      ])

      const messageText = `🚀 <b>Select L3 Analyst</b>\n\nChoose which L3 analyst should handle this escalation:\n`

      const response = await this.sendMessageWithKeyboard(chatId, messageText, buttons, "HTML")
      console.log(`[Telegram] L3 analyst selection menu sent`)

      // Answer callback
      await this.answerCallback(callbackId, `${l3Users.length} analyst(s) available`)
    } catch (error) {
      console.error("[Telegram Polling] Error showing L3 analyst selection:", error)
      await this.answerCallback(callbackId, "❌ Error processing request", true).catch(() => {})
    }
  }

  /**
   * Handle confirmation to escalate without analysis
   */
  private static async handleEscalateWithoutAnalysis(
    chatId: string,
    callbackId: string,
    escalationId: string,
  ): Promise<void> {
    try {
      console.log(`[Telegram] User confirmed escalation without analysis for escalation ${escalationId}`)

      // Find the escalation
      const escalation = await prisma.alertEscalation.findUnique({
        where: { id: escalationId },
        include: {
          alert: true,
          escalatedTo: true,
        },
      })

      if (!escalation) {
        console.warn(`[Telegram] Escalation not found: ${escalationId}`)
        await this.answerCallback(callbackId, "Escalation not found", true)
        return
      }

      await this.answerCallback(callbackId, "Proceeding to escalate...")

      // Show L3 analyst selection
      await this.showL3AnalystSelection(chatId, callbackId, escalation)
    } catch (error) {
      console.error("[Telegram Polling] Error in escalate without analysis:", error)
      await this.answerCallback(callbackId, "❌ Error processing request", true).catch(() => {})
    }
  }

  /**
   * Handle L3 analyst selection
   */
  private static async handleSelectL3Button(
    chatId: string,
    messageId: number | undefined,
    callbackId: string,
    l3UserId: string,
  ): Promise<void> {
    try {
      console.log(`[Telegram] Button click: select_l3_${l3UserId} from ${chatId}, message: ${messageId}, callback: ${callbackId}`)

      // Find escalation (can be pending or escalated when showing L3 selection)
      const escalation = await prisma.alertEscalation.findFirst({
        where: {
          status: { in: ["pending", "escalated"] },
          telegramChatId: chatId,
        },
        include: {
          alert: true,
          escalatedTo: true,
        },
        orderBy: { createdAt: "desc" },
      })

      if (!escalation) {
        console.warn(`[Telegram] ❌ Escalation not found`)
        await this.answerCallback(callbackId, "Escalation not found", true)
        return
      }

      // Get selected L3 user
      const selectedL3 = await prisma.user.findUnique({
        where: { id: l3UserId },
      })

      if (!selectedL3 || !selectedL3.telegramChatId) {
        console.warn(`[Telegram] ❌ Selected L3 user not found or no Telegram chat ID`)
        await this.answerCallback(callbackId, "Selected user not available", true)
        return
      }

      console.log(`[Telegram] Escalating to L3: ${selectedL3.name} (${selectedL3.email})`)

      // Create L3 escalation
      const l3Escalation = await prisma.alertEscalation.create({
        data: {
          alertId: escalation.alertId,
          escalationLevel: 2,
          escalatedByUserId: escalation.escalatedToUserId,
          escalatedToUserId: selectedL3.id,
          l1Analysis: escalation.l1Analysis,
          l2Analysis: escalation.l2Analysis || "No analysis provided - direct escalation to L3",
          status: "pending",
          telegramChatId: selectedL3.telegramChatId,
          timeoutAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      })

      // Send escalation message to L3
      const result = await TelegramEscalationService.sendEscalationMessage(
        selectedL3.telegramChatId,
        escalation.alert,
        2,
        {
          l1: escalation.l1Analysis,
          l2: escalation.l2Analysis || "No analysis provided",
        },
      )

      if (result.success && result.messageId) {
        await prisma.alertEscalation.update({
          where: { id: l3Escalation.id },
          data: { telegramMessageId: result.messageId },
        })
        console.log(`[Telegram] ✅ Escalation message sent to L3: ${selectedL3.name}`)
      } else {
        console.error(`[Telegram] ⚠️ Failed to send escalation message to L3: ${result.error}`)
        // Still complete the escalation, but log the failure
        console.log(`[Telegram] ⚠️ Escalation record created but message delivery failed for ${selectedL3.name}`)
      }

      // Update L2 escalation status
      await prisma.alertEscalation.update({
        where: { id: escalation.id },
        data: { status: "escalated" },
      })

      console.log(`[Telegram] ✅ Alert escalated to L3: ${selectedL3.name}`)

      // Success callback and message
      await this.answerCallback(callbackId, `✅ Escalated to ${selectedL3.name}`)
      await this.sendMessage(
        chatId,
        `✅ <b>Alert Escalated</b>\n\nSuccessfully escalated to <b>${selectedL3.name}</b>\n\nThe L3 analyst will review this alert shortly.`,
        "HTML",
      )
    } catch (error) {
      console.error("[Telegram Polling] Error selecting L3:", error)
      await this.answerCallback(callbackId, "❌ Error escalating", true).catch((err) => {
        console.error("[Telegram] Failed to send error callback:", err)
      })
    }
  }

  /**
   * Handle "Reply with Analysis" button click
   */
  private static async handleReplyAnalysisButton(
    chatId: string,
    messageId: number | undefined,
    callbackId: string,
  ): Promise<void> {
    try {
      console.log(`[Telegram] Button click: reply_analysis from ${chatId}, message: ${messageId}, callback: ${callbackId}`)

      const messageText = `📋 <b>Provide Your Analysis</b>\n\n<b>Step 1:</b> Copy the format below\n<b>Step 2:</b> Reply to THIS message (tap reply icon)\n<b>Step 3:</b> Paste and fill in your analysis\n\n<code>ANALYSIS: [your detailed analysis]\nCONCLUSION: [verdict]</code>\n\n<b>Valid verdicts:</b>\n• TRUE POSITIVE\n• BENIGN TRUE POSITIVE  \n• FALSE_POSITIVE\n• ESCALATE_L3 (for L2 only)\n\n⚠️ <i>You MUST reply directly to this message!</i>`

      console.log(`[Telegram] Sending analysis prompt message...`)
      // Send as standalone message (not a reply to escalation message)
      const sendResult = await this.sendMessage(chatId, messageText, "HTML")
      console.log(`[Telegram] Message sent, result:`, sendResult?.result?.message_id)
      
      const callbackResult = await this.answerCallback(
        callbackId,
        "✍️ Click 'Reply' and provide your analysis",
      )
      console.log(`[Telegram] ✅ Prompted user for analysis, callback sent`)
    } catch (error) {
      console.error("[Telegram Polling] Error in reply button:", error)
      const errorResult = await this.answerCallback(
        callbackId,
        "❌ Error processing request",
        true,
      ).catch((err) => {
        console.error("[Telegram] Failed to send error callback:", err)
      })
      console.log("[Telegram] Error callback sent")
    }
  }

  /**
   * Send a Telegram message
   */
  static async sendMessage(
    chatId: string,
    text: string,
    parseMode?: "HTML" | "Markdown",
    replyToMessageId?: number,
  ): Promise<any> {
    try {
      const response = await fetchWithRetry(
        `${TELEGRAM_API_URL}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: parseMode,
            reply_to_message_id: replyToMessageId,
          }),
        },
        3, // max retries
        10000, // 10 second timeout
      )

      const data = (await response.json()) as any
      if (!data.ok) {
        console.error(`[Telegram] ❌ Failed to send message to ${chatId}: ${data.description}`)
        return data
      }
      
      console.log(`[Telegram] ✅ Message sent successfully to ${chatId}, message_id: ${data.result?.message_id}`)
      return data
    } catch (error) {
      console.error("[Telegram] Error sending message:", error)
    }
  }

  /**
   * Send message with inline keyboard buttons
   */
  private static async sendMessageWithKeyboard(
    chatId: string,
    text: string,
    buttons: any[][],
    parseMode?: "HTML" | "Markdown",
  ): Promise<any> {
    try {
      const response = await fetchWithRetry(
        `${TELEGRAM_API_URL}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: parseMode,
            reply_markup: {
              inline_keyboard: buttons,
            },
          }),
        },
        3, // max retries
        10000, // 10 second timeout
      )

      const data = (await response.json()) as any
      if (!data.ok) {
        console.error(`[Telegram] ❌ Failed to send message with keyboard to ${chatId}: ${data.description}`)
        return data
      }
      
      console.log(`[Telegram] ✅ Message with keyboard sent to ${chatId}, message_id: ${data.result?.message_id}`)
      return data
    } catch (error) {
      console.error("[Telegram] Error sending message with keyboard:", error)
    }
  }

  /**
   * Answer callback query
   */
  private static async answerCallback(
    callbackId: string,
    text?: string,
    showAlert?: boolean,
  ): Promise<any> {
    try {
      const response = await fetchWithRetry(
        `${TELEGRAM_API_URL}/answerCallbackQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: callbackId,
            text: text,
            show_alert: showAlert,
          }),
        },
        3, // max retries
        10000, // 10 second timeout
      )

      const data = (await response.json()) as any
      if (!data.ok) {
        console.error(`[Telegram] ❌ Failed to answer callback: ${data.description}`)
        return data
      }

      console.log(`[Telegram] ✅ Callback answer sent: "${text}"`, showAlert ? "(as alert)" : "")
      return data
    } catch (error) {
      console.error("[Telegram] Error answering callback:", error)
      throw error
    }
  }

  /**
   * Edit message
   */
  private static async editMessage(
    chatId: string,
    messageId: number | undefined,
    text: string,
    parseMode?: string,
  ): Promise<void> {
    try {
      await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: text,
          parse_mode: parseMode,
        }),
      })
    } catch (error) {
      console.error("[Telegram] Error editing message:", error)
    }
  }

  /**
   * Update last processed update ID
   */
  static setLastUpdateId(updateId: number): void {
    lastUpdateId = updateId
  }
}
