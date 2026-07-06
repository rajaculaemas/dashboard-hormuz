import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import {
  setStellarApiKeyForIntegration,
  deleteStellarApiKeyForIntegration,
  getUserStellarApiKeysWithIntegrations,
} from "@/lib/api/user-stellar-credentials"

/**
 * GET /api/users/me/stellar-key/integrations
 * Get all Stellar Cyber API keys for current user (per-integration)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const credentials = await getUserStellarApiKeysWithIntegrations(user.userId)

    return NextResponse.json({
      success: true,
      credentials: credentials.map((cred) => ({
        integrationId: cred.integrationId,
        integrationName: cred.integration.name,
        hasKey: !!cred.jwtApiKey,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt,
      })),
    })
  } catch (error) {
    console.error("Error fetching Stellar API keys:", error)
    return NextResponse.json(
      { error: "Failed to fetch Stellar API keys" },
      { status: 500 },
    )
  }
}

/**
 * POST /api/users/me/stellar-key/integrations
 * Save or update per-integration Stellar Cyber API key
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { integrationId, apiKey } = body

    if (!integrationId || typeof integrationId !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing integrationId in request body" },
        { status: 400 },
      )
    }

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing apiKey in request body" },
        { status: 400 },
      )
    }

    // Save the API key for this integration
    await setStellarApiKeyForIntegration(user.userId, integrationId, apiKey)

    return NextResponse.json({
      success: true,
      message: "Stellar Cyber API key saved successfully for this integration",
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
 * DELETE /api/users/me/stellar-key/integrations
 * Delete per-integration Stellar Cyber API key
 * Query param: integrationId
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get("integrationId")

    if (!integrationId) {
      return NextResponse.json(
        { error: "Missing integrationId query parameter" },
        { status: 400 },
      )
    }

    await deleteStellarApiKeyForIntegration(user.userId, integrationId)

    return NextResponse.json({
      success: true,
      message: "Stellar Cyber API key deleted successfully for this integration",
    })
  } catch (error) {
    console.error("Error deleting Stellar API key:", error)
    return NextResponse.json(
      { error: "Failed to delete Stellar API key" },
      { status: 500 },
    )
  }
}
