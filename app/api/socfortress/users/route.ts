import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import { getSocfortressUsers } from "@/lib/api/socfortress"

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get integrationId from query params
    const integrationId = request.nextUrl.searchParams.get("integrationId")
    if (!integrationId) {
      return NextResponse.json({ error: "Missing integrationId" }, { status: 400 })
    }

    console.log(`[API] Fetching Socfortress users for integration ${integrationId}...`)

    const users = await getSocfortressUsers(integrationId)

    console.log(`[API] Found ${users.length} Socfortress users`)

    return NextResponse.json({
      success: true,
      users: users.map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email,
      })),
    })
  } catch (error) {
    console.error("[API] Error fetching Socfortress users:", error)
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    )
  }
}
