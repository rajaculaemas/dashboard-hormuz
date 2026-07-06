import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import {
  setStellarApiKeyForHost,
  deleteStellarApiKeyForHost,
  getUserStellarApiKeysByHost,
} from "@/lib/api/user-stellar-credentials"
import { hasPermission } from "@/lib/auth/password"
import prisma from "@/lib/prisma"

/**
 * GET /api/users/[userId]/stellar-key/hosts
 * Admin only: Get all Stellar Cyber API keys for a specific user (grouped by host)
 * Includes fallback to global key for backward compatibility
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  try {
    const currentUser = await getCurrentUser()
    console.log(`[GET /stellar-key/hosts] Current user:`, { userId: currentUser?.userId, role: currentUser?.role })
    
    if (!currentUser) {
      console.log(`[GET /stellar-key/hosts] Unauthorized - no current user`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only administrators can view other users' Stellar credentials
    console.log(`[GET /stellar-key/hosts] Checking permission - role: ${currentUser.role}`)
    if (!hasPermission(currentUser.role, "update_user")) {
      console.log(`[GET /stellar-key/hosts] Permission denied - role ${currentUser.role} cannot update_user`)
      return NextResponse.json(
        { error: "Forbidden: You don't have permission to view user credentials" },
        { status: 403 },
      )
    }

    const { userId } = await params
    console.log(`[GET /stellar-key/hosts] Fetching credentials for userId: ${userId}`)

    // Verify user exists and get their data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        name: true,
        stellar_cyber_api_key: true,
      },
    })

    if (!user) {
      console.log(`[GET /stellar-key/hosts] User not found: ${userId}`)
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get all host-based credentials for this user
    const hostCredentials = await getUserStellarApiKeysByHost(userId)
    console.log(`[GET /stellar-key/hosts] Found ${hostCredentials.length} host credentials for user ${userId}:`, 
      hostCredentials.map(c => ({ host: c.host, hasKey: !!c.apiKey })))

    // Check if there's a global key and no host-based key for primary host
    const globalKey = user.stellar_cyber_api_key
    const primaryHost = "100.100.11.61" // Stellar Cyber 1 (MSIG + TVRI)
    const hasHostCredentialForPrimary = hostCredentials.some((c) => c.host === primaryHost)

    let credentials = hostCredentials.map((cred) => ({
      host: cred.host,
      hasKey: !!cred.apiKey,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
      isMigratedFromGlobal: false,
    }))

    // If there's a global key but no credential for primary host, show it as migrated
    if (globalKey && !hasHostCredentialForPrimary) {
      credentials = [
        {
          host: primaryHost,
          hasKey: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMigratedFromGlobal: true, // This indicates it came from the global key
        },
        ...credentials,
      ]
      console.log(`[GET /stellar-key/hosts] Added global key as migration for primary host`)
    }

    const response = {
      success: true,
      userId,
      userName: user.name,
      userEmail: user.email,
      credentials,
    };
    
    console.log(`[GET /stellar-key/hosts] Returning response:`, response)
    return NextResponse.json(response)
  } catch (error) {
    console.error("[Admin] Error fetching user Stellar API keys by host:", error)
    return NextResponse.json(
      { error: "Failed to fetch user Stellar API keys" },
      { status: 500 },
    )
  }
}

/**
 * POST /api/users/[userId]/stellar-key/hosts
 * Admin only: Save or update per-host Stellar Cyber API key for a user
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

    // Only administrators can set user credentials
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
    const { host, apiKey } = body

    if (!host || typeof host !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing host in request body" },
        { status: 400 },
      )
    }

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing apiKey in request body" },
        { status: 400 },
      )
    }

    // Save the API key
    await setStellarApiKeyForHost(userId, host, apiKey)

    return NextResponse.json({
      success: true,
      message: `Stellar Cyber API key saved for host ${host}`,
      userId,
      host,
    })
  } catch (error) {
    console.error("[Admin] Error saving user Stellar API key:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save Stellar API key",
      },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/users/[userId]/stellar-key/hosts
 * Admin only: Delete per-host Stellar Cyber API key for a user
 * Query param: host
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

    // Only administrators can delete user credentials
    if (!hasPermission(currentUser.role, "update_user")) {
      return NextResponse.json(
        { error: "Forbidden: You don't have permission to manage user credentials" },
        { status: 403 },
      )
    }

    const { userId } = await params
    const { searchParams } = new URL(request.url)
    const host = searchParams.get("host")

    if (!host) {
      return NextResponse.json(
        { error: "Missing host query parameter" },
        { status: 400 },
      )
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    await deleteStellarApiKeyForHost(userId, host)

    return NextResponse.json({
      success: true,
      message: `Stellar Cyber API key deleted for host ${host}`,
      userId,
      host,
    })
  } catch (error) {
    console.error("[Admin] Error deleting user Stellar API key:", error)
    return NextResponse.json(
      { error: "Failed to delete Stellar API key" },
      { status: 500 },
    )
  }
}

/**
 * PUT /api/users/[userId]/stellar-key/hosts
 * Admin only: Update per-host Stellar Cyber API key for a user (same as POST)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  return POST(request, { params })
}
