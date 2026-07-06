import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import { setStellarApiKey, deleteStellarApiKey, getUserStellarApiKey } from "@/lib/api/user-stellar-credentials"
import prisma from "@/lib/prisma"

/**
 * GET /api/users/me/stellar-key
 * Get current user's Stellar Cyber API key status (checks both global and per-host)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check global API key (legacy)
    const globalKey = await getUserStellarApiKey(user.userId)
    const hasGlobalKey = !!globalKey

    // Check per-host API keys (new approach)
    const hostCredentials = await prisma.userStellarCyberHostCredential.findMany({
      where: { userId: user.userId },
      select: { host: true, apiKey: true },
    })

    const hasHostKeys = hostCredentials.length > 0 && hostCredentials.some(c => c.apiKey && c.apiKey.trim() !== "")
    const hasApiKey = hasGlobalKey || hasHostKeys

    return NextResponse.json({
      success: true,
      hasApiKey,
      hasGlobalKey,
      hasHostKeys,
      hostCount: hostCredentials.length,
      message: hasApiKey ? "Stellar API key is configured" : "Stellar API key is not configured",
    })
  } catch (error) {
    console.error("Error fetching Stellar API key status:", error)
    return NextResponse.json(
      { error: "Failed to fetch Stellar API key status" },
      { status: 500 },
    )
  }
}

/**
 * POST /api/users/me/stellar-key
 * Save or update current user's Stellar Cyber API key
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { apiKey } = body

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing apiKey in request body" },
        { status: 400 },
      )
    }

    // Save the API key
    await setStellarApiKey(user.userId, apiKey)

    return NextResponse.json({
      success: true,
      message: "Stellar Cyber API key saved successfully",
    })
  } catch (error) {
    console.error("Error saving Stellar API key:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save Stellar API key",
      },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/users/me/stellar-key
 * Delete current user's Stellar Cyber API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await deleteStellarApiKey(user.userId)

    return NextResponse.json({
      success: true,
      message: "Stellar Cyber API key deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting Stellar API key:", error)
    return NextResponse.json(
      { error: "Failed to delete Stellar API key" },
      { status: 500 },
    )
  }
}

/**
 * PUT /api/users/me/stellar-key
 * Update current user's Stellar Cyber API key (same as POST)
 */
export async function PUT(request: NextRequest) {
  return POST(request)
}
