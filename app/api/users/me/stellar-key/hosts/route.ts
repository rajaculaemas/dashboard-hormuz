import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import prisma from "@/lib/prisma"
import {
  setStellarApiKeyForHost,
  deleteStellarApiKeyForHost,
  getUserStellarApiKeysByHost,
  getUserStellarApiKey,
} from "@/lib/api/user-stellar-credentials"

/**
 * GET /api/users/me/stellar-key/hosts
 * Get all Stellar Cyber API keys for current user (grouped by host)
 * INCLUDES: fallback to global key for backward compatibility
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all host-based credentials
    const hostCredentials = await getUserStellarApiKeysByHost(user.userId)

    // Check if there's a global key and no host-based key for primary host
    const globalKey = await getUserStellarApiKey(user.userId)
    const primaryHost = "100.100.11.61" // Stellar Cyber 1 (MSIG + TVRI)
    const hasHostCredentialForPrimary = hostCredentials.some((c) => c.host === primaryHost)

    let allCredentials = hostCredentials.map((cred) => ({
      host: cred.host,
      hasKey: !!cred.apiKey,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
      isMigratedFromGlobal: false,
    }))

    // If there's a global key but no credential for primary host, show it as migrated
    if (globalKey && !hasHostCredentialForPrimary) {
      allCredentials = [
        {
          host: primaryHost,
          hasKey: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMigratedFromGlobal: true, // This indicates it came from the global key
        },
        ...allCredentials,
      ]
    }

    return NextResponse.json({
      success: true,
      credentials: allCredentials,
    })
  } catch (error) {
    console.error("Error fetching Stellar API keys by host:", error)
    return NextResponse.json(
      { error: "Failed to fetch Stellar API keys" },
      { status: 500 },
    )
  }
}

/**
 * POST /api/users/me/stellar-key/hosts
 * Save or update per-host Stellar Cyber API key
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

    // Save the API key for this host
    await setStellarApiKeyForHost(user.userId, host, apiKey)

    return NextResponse.json({
      success: true,
      message: "Stellar Cyber API key saved successfully for this host",
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
 * DELETE /api/users/me/stellar-key/hosts
 * Delete per-host Stellar Cyber API key
 * Query param: host
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const host = searchParams.get("host")

    if (!host) {
      return NextResponse.json(
        { error: "Missing host query parameter" },
        { status: 400 },
      )
    }

    await deleteStellarApiKeyForHost(user.userId, host)

    return NextResponse.json({
      success: true,
      message: "Stellar Cyber API key deleted successfully for this host",
    })
  } catch (error) {
    console.error("Error deleting Stellar API key:", error)
    return NextResponse.json(
      { error: "Failed to delete Stellar API key" },
      { status: 500 },
    )
  }
}
