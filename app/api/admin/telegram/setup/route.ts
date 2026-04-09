/**
 * API Endpoint: POST /api/admin/telegram/setup
 * Allows admin to configure telegram webhook
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import {
  setWebhook,
  deleteWebhook,
  getBotInfo,
  getWebhookInfo,
  sendTestMessage,
} from "@/lib/services/telegram-setup"

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check admin role (only admin@soc-dashboard.local can set up telegram)
    if (user.email !== "admin@soc-dashboard.local") {
      return NextResponse.json(
        { error: "Only admins can configure Telegram" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { action, chatId } = body

    // Get bot info and verify
    const botInfo = await getBotInfo()
    if (!botInfo.ok) {
      return NextResponse.json(
        {
          error: "Bot verification failed",
          details: botInfo.description,
        },
        { status: 400 }
      )
    }

    let result: any

    switch (action) {
      case "setup":
        // Set webhook
        result = await setWebhook()
        if (result.success) {
          // Also get webhook info to confirm
          const webhookInfo = await getWebhookInfo()
          return NextResponse.json({
            success: true,
            message: "Telegram webhook configured successfully",
            botInfo: {
              id: botInfo.result?.id,
              username: botInfo.result?.username,
              name: botInfo.result?.first_name,
            },
            webhookInfo: webhookInfo.result,
          })
        }
        return NextResponse.json(result, { status: 400 })

      case "delete":
        // Delete webhook (for cleanup or switching to polling)
        result = await deleteWebhook()
        if (result.success) {
          return NextResponse.json({
            success: true,
            message: "Telegram webhook removed",
          })
        }
        return NextResponse.json(result, { status: 400 })

      case "status":
        // Get current status
        const webhookInfo = await getWebhookInfo()
        return NextResponse.json({
          botInfo: {
            id: botInfo.result?.id,
            username: botInfo.result?.username,
            name: botInfo.result?.first_name,
          },
          webhookInfo: webhookInfo.result,
          configured: webhookInfo.result?.url ? true : false,
        })

      case "test":
        // Send test message to verify bot works
        if (!chatId) {
          return NextResponse.json(
            { error: "chatId required for test" },
            { status: 400 }
          )
        }
        result = await sendTestMessage(chatId)
        return NextResponse.json(result)

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error("Error in Telegram setup endpoint:", error)
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
