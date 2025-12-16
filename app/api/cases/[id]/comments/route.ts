import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params

    console.log("Fetching comments for case ID:", id)

    const comments = await prisma.caseComment.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "asc" },
    })

    console.log(`Found ${comments.length} comments for case ${id}`)

    return NextResponse.json({
      success: true,
      data: comments,
    })
  } catch (error) {
    console.error("Error fetching case comments:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch case comments",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { content, author } = body

    if (!content || !content.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Comment content is required",
        },
        { status: 400 },
      )
    }

    console.log("Creating comment for case:", id, { content, author })

    const comment = await prisma.caseComment.create({
      data: {
        content: content.trim(),
        author: author || "system",
        caseId: id,
        createdAt: new Date(),
      },
    })

    console.log("Comment created successfully:", comment.id)

    return NextResponse.json({
      success: true,
      data: comment,
    })
  } catch (error) {
    console.error("Error creating case comment:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create case comment",
      },
      { status: 500 },
    )
  }
}
