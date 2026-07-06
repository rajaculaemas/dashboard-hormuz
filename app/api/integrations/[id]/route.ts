import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"
import { getUserAccessibleIntegrations } from "@/lib/auth/password"

function toCredentialsObject(raw: any): Record<string, any> {
  if (!raw) return {}
  if (Array.isArray(raw)) {
    const out: Record<string, any> = {}
    for (const item of raw) {
      if (item && typeof item === "object" && "key" in item && "value" in item) {
        out[String((item as any).key)] = (item as any).value
      }
    }
    return out
  }
  if (typeof raw === "object") return raw
  return {}
}

function isUnknownSoarColumnError(error: unknown): boolean {
  const message = String((error as any)?.message || "")
  return (
    message.includes("Unknown argument `soarHost`") ||
    message.includes("Unknown argument `soarOrgId`") ||
    message.includes("Unknown argument `soarKeyId`") ||
    message.includes("Unknown argument `soarKeySecret`")
  )
}

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
    
    const { name, source, credentials, status, config } = body
    const creds = toCredentialsObject(credentials)

    const soarHost = String(body?.soarHost || creds.soar_host || "").trim() || null
    const soarOrgId = String(body?.soarOrgId || creds.soar_org_id || "").trim() || null
    const soarKeyId = String(body?.soarKeyId || creds.soar_key_id || "").trim() || null
    const soarKeySecret = String(body?.soarKeySecret || creds.soar_key_secret || "").trim() || null

    console.log("Updating integration:", id)
    console.log("Update data:", { name, source, credentialsKeys: Object.keys(credentials || {}) })

    let integration
    try {
      integration = await prisma.integration.update({
        where: { id },
        data: {
          name,
          source,
          credentials: credentials || {},
          config: config || {},
          soarHost,
          soarOrgId,
          soarKeyId,
          soarKeySecret,
          status: status || "connected",
        },
      })
    } catch (error) {
      // Backward compatibility when Prisma Client is not regenerated yet.
      if (!isUnknownSoarColumnError(error)) throw error

      console.warn("[integrations][PUT] SOAR columns not recognized by Prisma Client, falling back to credentials-only save")
      integration = await prisma.integration.update({
        where: { id },
        data: {
          name,
          source,
          credentials: credentials || {},
          config: config || {},
          status: status || "connected",
        },
      })
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
