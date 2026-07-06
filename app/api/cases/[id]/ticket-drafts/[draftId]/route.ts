import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; draftId: string } }
) {
  try {
    const { id, draftId } = await params
    const body = await request.json()
    const { content } = body

    if (!content?.trim()) {
      return NextResponse.json({ success: false, error: "content is required" }, { status: 400 })
    }

    const draft = await prisma.caseTicketDraft.update({
      where: { id: draftId, caseId: id },
      data: { content: content.trim() },
    })

    return NextResponse.json({ success: true, data: draft })
  } catch (error) {
    console.error("[TicketDraft] PATCH error:", error)
    return NextResponse.json({ success: false, error: "Failed to update ticket draft" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; draftId: string } }
) {
  try {
    const { id, draftId } = await params

    await prisma.caseTicketDraft.delete({
      where: { id: draftId, caseId: id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[TicketDraft] DELETE error:", error)
    return NextResponse.json({ success: false, error: "Failed to delete ticket draft" }, { status: 500 })
  }
}
