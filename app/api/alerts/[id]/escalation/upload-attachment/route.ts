/**
 * Upload Attachment Endpoint
 * Handles file uploads for escalation attachments
 * POST /api/alerts/{id}/escalation/upload-attachment
 */

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import prisma from "@/lib/prisma"
import fs from "fs"
import path from "path"
import { createHash } from "crypto"
import fetch from "node-fetch"
import FormData from "form-data"

// Configuration
const ALLOWED_EXTENSIONS = [".txt", ".png", ".jpg", ".jpeg", ".gif"]
const ALLOWED_MIMETYPES = [
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/gif"
]
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const UPLOAD_DIR = path.join(process.cwd(), "public", "escalation-attachments")

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

/**
 * Send attachment to Telegram recipient
 */
async function sendAttachmentToTelegram(
  chatId: string,
  filePath: string,
  fileName: string,
  fileType: string,
  sender: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
    if (!TELEGRAM_BOT_TOKEN) {
      return { success: false, error: "Telegram bot token not configured" }
    }

    const fileBuffer = fs.readFileSync(filePath)
    const form = new FormData()
    form.append("chat_id", chatId)
    form.append("caption", `📎 <b>File Attachment</b>\n\nFrom: <b>${sender}</b>\nFile: <code>${fileName}</code>`, {
      headers: { "Content-Type": "text/html" },
    })

    // Use sendDocument for text files, sendPhoto for images
    if (fileType === "text") {
      form.append("document", fileBuffer, { filename: fileName })
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
        method: "POST",
        headers: form.getHeaders(),
        body: form,
      })

      const data = (await response.json()) as any
      if (!data.ok) {
        return { success: false, error: data.description }
      }

      return {
        success: true,
        fileId: data.result.document?.file_id,
      }
    } else {
      form.append("photo", fileBuffer, { filename: fileName })
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        headers: form.getHeaders(),
        body: form,
      })

      const data = (await response.json()) as any
      if (!data.ok) {
        return { success: false, error: data.description }
      }

      return {
        success: true,
        fileId: data.result.photo?.[data.result.photo.length - 1]?.file_id,
      }
    }
  } catch (error) {
    console.error("[Send to Telegram] Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send to Telegram",
    }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only non-read-only users can upload
    if (user.role === "read_only") {
      return NextResponse.json(
        { error: "Read-only users cannot upload attachments" },
        { status: 403 }
      )
    }

    const { id: alertId } = await params
    const formData = await request.formData()
    const file = formData.get("file") as File
    const escalationId = formData.get("escalationId") as string

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    if (!escalationId) {
      return NextResponse.json(
        { error: "escalationId is required" },
        { status: 400 }
      )
    }

    // Verify escalation exists
    const escalation = await prisma.alertEscalation.findUnique({
      where: { id: escalationId },
      include: { alert: true, escalatedTo: true }
    })

    if (!escalation) {
      return NextResponse.json(
        { error: "Escalation not found" },
        { status: 404 }
      )
    }

    // Verify alert matches
    if (escalation.alertId !== alertId) {
      return NextResponse.json(
        { error: "Alert ID mismatch" },
        { status: 400 }
      )
    }

    // Verify user is involved in escalation (L1, L2, or L3)
    const userIsInvolved =
      user.userId === escalation.escalatedByUserId ||
      user.userId === escalation.escalatedToUserId

    if (!userIsInvolved) {
      return NextResponse.json(
        { error: "You are not involved in this escalation" },
        { status: 403 }
      )
    }

    // Validate file extension
    const fileName = file.name
    const fileExt = path.extname(fileName).toLowerCase()
    
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
      return NextResponse.json(
        {
          error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    // Validate MIME type
    if (!ALLOWED_MIMETYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `MIME type not allowed: ${file.type}`,
        },
        { status: 400 }
      )
    }

    // Read file buffer
    const buffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(buffer)

    // Generate unique filename to prevent conflicts
    const fileHash = createHash("sha256")
      .update(fileBuffer)
      .digest("hex")
      .substring(0, 8)
    const timestamp = Date.now()
    const safeFileName = `${timestamp}-${fileHash}${fileExt}`
    const filePath = path.join(UPLOAD_DIR, safeFileName)

    // Save file to disk
    fs.writeFileSync(filePath, fileBuffer)

    // Determine file type
    const fileType = fileExt === ".txt" ? "text" : "image"

    // Create attachment record in database
    const attachment = await prisma.escalationAttachment.create({
      data: {
        escalationId,
        fileName: fileName.substring(0, 255), // Limit filename length
        fileType,
        mimeType: file.type,
        fileSize: file.size,
        fileUrl: `/escalation-attachments/${safeFileName}`,
        uploadedByUserId: user.userId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    // Send file to Telegram if this is not L1's own upload (don't send to self)
    let telegramResult: { success: boolean; fileId?: string; error?: string } = { success: false }
    if (escalation.escalatedTo?.telegramChatId) {
      // Only send if the uploader is not the recipient
      if (user.userId !== escalation.escalatedToUserId) {
        telegramResult = await sendAttachmentToTelegram(
          escalation.escalatedTo.telegramChatId,
          filePath,
          fileName,
          fileType,
          user.name || "Analyst"
        )

        // Update attachment with Telegram file ID if successful
        if (telegramResult.success && telegramResult.fileId) {
          await prisma.escalationAttachment.update({
            where: { id: attachment.id },
            data: {
              sentToTelegram: true,
              telegramFileId: telegramResult.fileId,
            },
          })
        }
      }
    }

    // Create audit log
    await prisma.alertEscalationAudit.create({
      data: {
        escalationId,
        alertId,
        event: "attachment_added",
        details: {
          fileName: attachment.fileName,
          fileType,
          fileSize: attachment.fileSize,
          uploadedBy: user.userId,
          uploadedByName: user.name,
          sentToTelegram: telegramResult.success,
        },
      },
    })

    console.log(
      `[Escalation] Attachment uploaded: ${attachment.id} for escalation ${escalationId}. Telegram: ${telegramResult.success}`
    )

    return NextResponse.json({
      success: true,
      attachment: {
        id: attachment.id,
        fileName: attachment.fileName,
        fileUrl: attachment.fileUrl,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        uploadedBy: attachment.uploadedBy,
        createdAt: attachment.createdAt,
        sentToTelegram: telegramResult.success,
      },
    })
  } catch (error) {
    console.error("[Upload Attachment] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload attachment" },
      { status: 500 }
    )
  }
}
