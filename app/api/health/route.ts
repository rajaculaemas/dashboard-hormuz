import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    // Check database connection
    const dbCheck = await prisma.$queryRaw`SELECT 1 as health`

    // Check integrations
    const integrationCount = await prisma.integration.count()
    const activeIntegrations = await prisma.integration.count({
      where: { status: "connected" },
    })

    // Check recent alerts
    const recentAlerts = await prisma.alert.count({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    })

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbCheck ? "connected" : "disconnected",
        integrations: {
          total: integrationCount,
          active: activeIntegrations,
        },
        alerts: {
          last24h: recentAlerts,
        },
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasOpenRouterConfig: !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL),
        hasCronSecret: !!process.env.CRON_SECRET,
      },
    })
  } catch (error) {
    console.error("Health check failed:", error)
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
