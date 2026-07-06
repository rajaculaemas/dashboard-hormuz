import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params

    const drafts = await prisma.caseTicketDraft.findMany({
      where: { caseId: id },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({ success: true, data: drafts })
  } catch (error) {
    console.error("[TicketDraft] GET error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch ticket drafts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { content, integrationSource, createdBy } = body

    if (!content?.trim()) {
      return NextResponse.json({ success: false, error: "content is required" }, { status: 400 })
    }

    const draft = await prisma.caseTicketDraft.create({
      data: {
        caseId: id,
        content: content.trim(),
        integrationSource: integrationSource || null,
        createdBy: createdBy || null,
      },
    })

    return NextResponse.json({ success: true, data: draft })
  } catch (error) {
    console.error("[TicketDraft] POST error:", error)
    return NextResponse.json({ success: false, error: "Failed to save ticket draft" }, { status: 500 })
  }
}
