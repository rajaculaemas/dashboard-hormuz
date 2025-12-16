import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"
import { getUserAccessibleIntegrations } from "@/lib/auth/password"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const accessibleIds = await getUserAccessibleIntegrations(currentUser.userId)
    const canAccess = currentUser.role === "administrator" || accessibleIds.includes(id)
    if (!canAccess) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }
    const integration = await prisma.integration.findUnique({
      where: { id },
    })

    if (!integration) {
      return NextResponse.json(
        {
          success: false,
          error: "Integration not found",
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        ...integration,
        type: integration.source,
        method: "api",
        description: "",
        lastSyncAt: integration.lastSync,
      },
    })
  } catch (error) {
    console.error("Error fetching integration:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch integration",
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    if (currentUser.role !== "administrator") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("JSON parse error:", parseError)
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON in request body",
        },
        { status: 400 },
      )
    }
    
    const { name, source, credentials, status } = body

    console.log("Updating integration:", id)
    console.log("Update data:", { name, source, credentialsKeys: Object.keys(credentials || {}) })

    const integration = await prisma.integration.update({
      where: { id },
      data: {
        name,
        source,
        credentials: credentials || {},
        status: status || "connected",
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...integration,
        type: integration.source,
        method: "api",
        description: "",
        lastSyncAt: integration.lastSync,
      },
    })
  } catch (error) {
    console.error("Error updating integration:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update integration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// PATCH is an alias for PUT
export const PATCH = PUT

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    if (currentUser.role !== "administrator") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }
    await prisma.integration.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: "Integration deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting integration:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete integration",
      },
      { status: 500 },
    )
  }
}
