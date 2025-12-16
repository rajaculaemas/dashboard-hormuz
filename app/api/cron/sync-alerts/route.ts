import { type NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

// Rename this file to: app/api/cron/sync-all/route.ts

export async function GET(request: NextRequest) {
  try {
    // Verify the request is from a cron service
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.log("Unauthorized cron request")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Cron job: Starting scheduled sync for alerts and cases")

    // Get the base URL for internal API calls
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"

    // Sync alerts
    const alertsResponse = await fetch(`${baseUrl}/api/alerts/auto-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })

    const alertsResult = await alertsResponse.json()

    // Sync cases
    const casesResponse = await fetch(`${baseUrl}/api/cases/auto-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })

    const casesResult = await casesResponse.json()

    console.log("Cron job: Sync completed successfully", { alertsResult, casesResult })

    return NextResponse.json({
      success: true,
      message: "Scheduled sync completed",
      timestamp: new Date().toISOString(),
      results: {
        alerts: alertsResult,
        cases: casesResult,
      },
    })
  } catch (error) {
    console.error("Cron job: Error in scheduled sync:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
