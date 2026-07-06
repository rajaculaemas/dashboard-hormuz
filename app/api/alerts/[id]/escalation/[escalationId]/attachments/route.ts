import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import prisma from "@/lib/prisma"

/**
 * GET /api/alerts/[id]/escalation/[escalationId]/attachments
 * Fetch all attachments for an escalation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; escalationId: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: alertId, escalationId } = await params

    // Verify escalation exists and user has access
    const escalation = await prisma.alertEscalation.findUnique({
      where: { id: escalationId },
      include: {
        alert: true,
        escalatedBy: true,
        escalatedTo: true,
      },
    })

    if (!escalation) {
      return NextResponse.json({ error: "Escalation not found" }, { status: 404 })
    }

    // Check authorization (must be L1, L2, or L3 involved in escalation)
    const isAuthorized =
      user.userId === escalation.escalatedBy?.id ||
      user.userId === escalation.escalatedTo?.id ||
      user.role === "admin"

    if (!isAuthorized) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Fetch attachments grouped by uploader level
    const attachments = await prisma.escalationAttachment.findMany({
      where: { escalationId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // Group attachments by level (L1 = escalatedBy, L2 = escalatedTo, L3 = last responder)
    const grouped: Record<string, any[]> = {
      l1: [],
      l2: [],
      l3: [],
    }

    attachments.forEach((attachment) => {
      const level =
        attachment.uploadedBy.id === escalation.escalatedBy?.id
          ? "l1"
          : attachment.uploadedBy.id === escalation.escalatedTo?.id
            ? "l2"
            : "l3"

      grouped[level].push({
        id: attachment.id,
        fileName: attachment.fileName,
        fileUrl: attachment.fileUrl,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        uploadedBy: attachment.uploadedBy,
        createdAt: attachment.createdAt,
        sentToTelegram: attachment.sentToTelegram,
      })
    })

    return NextResponse.json({
      success: true,
      escalationId,
      attachments: grouped,
      total: attachments.length,
    })
  } catch (error: any) {
    console.error("Error fetching attachments:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch attachments" },
      { status: 500 }
    )
  }
}
