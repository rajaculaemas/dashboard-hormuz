import { type NextRequest, NextResponse } from "next/server"
import { getStellarCyberUsers } from "@/lib/api/stellar-cyber"
import { getCurrentUser } from "@/lib/auth/session"

/**
 * GET /api/stellar-cyber/users
 * Fetch list of users from Stellar Cyber API
 * Used for populating assign-to dropdowns in alerts and cases
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get integration ID from query params
    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get("integrationId") || undefined

    console.log(`[API] Fetching Stellar Cyber users for integration: ${integrationId || "default"}`)

    // Fetch users from Stellar Cyber
    const users = await getStellarCyberUsers(integrationId)

    return NextResponse.json({
      success: true,
      count: users.length,
      users,
    })
  } catch (error) {
    console.error("[API] Error fetching Stellar Cyber users:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch users",
        users: [],
      },
      { status: 500 },
    )
  }
}
