import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import { setStellarApiKey, deleteStellarApiKey, getUserStellarApiKey } from "@/lib/api/user-stellar-credentials"
import { hasPermission } from "@/lib/auth/password"
import prisma from "@/lib/prisma"

/**
 * GET /api/users/[userId]/stellar-key
 * Check if user has Stellar Cyber API key configured (checks both global and per-host)
 * User can check their own key, admin can check any user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { userId } = await params

    console.log(`[Stellar Key Check] Checking API key for user: ${userId}`)

    // Allow user to check their own key, or admin to check others
    if (currentUser.id !== userId && !hasPermission(currentUser.role, "update_user")) {
      console.log(`[Stellar Key Check] Permission denied: currentUser=${currentUser.id}, requestedUser=${userId}`)
      return NextResponse.json(
        { error: "Forbidden: You don't have permission to view user credentials" },
        { status: 403 },
      )
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, stellar_cyber_api_key: true },
    })

    if (!user) {
      console.log(`[Stellar Key Check] User not found: ${userId}`)
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check global API key (legacy)
    const hasGlobalKey = !!(user.stellar_cyber_api_key && user.stellar_cyber_api_key.trim() !== "")

    // Check per-host API keys (new approach)
    const hostCredentials = await prisma.userStellarCyberHostCredential.findMany({
      where: { userId },
      select: { host: true, apiKey: true },
    })

    const hasHostKeys = hostCredentials.length > 0 && hostCredentials.some(c => c.apiKey && c.apiKey.trim() !== "")
    const hasKey = hasGlobalKey || hasHostKeys

    console.log(`[Stellar Key Check] Result for user ${userId}:`, {
      hasKey,
      hasGlobalKey,
      hasHostKeys,
      hostCount: hostCredentials.length,
    })

    return NextResponse.json({
      success: true,
      userId,
      userEmail: user.email,
      userName: user.name,
      hasKey,
      hasGlobalKey,
      hasHostKeys,
      hostCount: hostCredentials.length,
      message: hasKey ? "User has Stellar API key configured" : "User does not have Stellar API key",
    })
  } catch (error) {
    console.error("[Stellar Key Check] Error fetching user Stellar API key status:", error)
    return NextResponse.json(
      { error: "Failed to fetch user Stellar API key status" },
      { status: 500 },
    )
  }
}

/**
 * POST /api/users/[userId]/stellar-key
 * Admin: Save or update user's Stellar Cyber API key
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only administrators can set other users' Stellar credentials
    if (!hasPermission(currentUser.role, "update_user")) {
      return NextResponse.json(
        { error: "Forbidden: You don't have permission to manage user credentials" },
        { status: 403 },
      )
    }

    const { userId } = await params

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
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
    await setStellarApiKey(userId, apiKey)

    return NextResponse.json({
      success: true,
      message: `Stellar Cyber API key saved for user ${user.email}`,
      userId,
    })
  } catch (error) {
    console.error("Error saving user Stellar API key:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save Stellar API key",
      },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/users/[userId]/stellar-key
 * Admin: Delete user's Stellar Cyber API key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only administrators can delete other users' Stellar credentials
    if (!hasPermission(currentUser.role, "update_user")) {
      return NextResponse.json(
        { error: "Forbidden: You don't have permission to manage user credentials" },
        { status: 403 },
      )
    }

    const { userId } = await params

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    await deleteStellarApiKey(userId)

    return NextResponse.json({
      success: true,
      message: `Stellar Cyber API key deleted for user ${user.email}`,
      userId,
    })
  } catch (error) {
    console.error("Error deleting user Stellar API key:", error)
    return NextResponse.json(
      { error: "Failed to delete Stellar API key" },
      { status: 500 },
    )
  }
}

/**
 * PUT /api/users/[userId]/stellar-key
 * Admin: Update user's Stellar Cyber API key (same as POST)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  return POST(request, { params })
}
