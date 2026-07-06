import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"

async function handleBulkEscalations(alertIds: string[]) {
  if (!alertIds || alertIds.length === 0) {
    return {
      escalations: [],
      count: 0
    }
  }

  console.log(`[Escalations Bulk API] Fetching escalations for ${alertIds.length} alerts`)

  // Fetch ALL active escalations (not closed) for the given alert IDs
  // Active means status is NOT "closed"
  const escalations = await prisma.alertEscalation.findMany({
    where: {
      alertId: {
        in: alertIds
      },
      status: {
        not: "closed" // Only non-closed escalations are "active"
      }
    },
    select: {
      id: true,
      alertId: true,
      escalationLevel: true,
      status: true,
      escalatedAt: true,
      escalatedBy: {
        select: {
          name: true,
          email: true
        }
      },
      escalatedTo: {
        select: {
          name: true,
          email: true
        }
      }
    }
  })

  console.log(`[Escalations Bulk API] Found ${escalations.length} active escalations`)

  return {
    escalations,
    count: escalations.length
  }
}

// GET - support query params for small requests
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const alertIds = searchParams.getAll('alertIds')

    const result = await handleBulkEscalations(alertIds)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Escalations Bulk API] Error (GET):", error)
    return NextResponse.json(
      { error: "Failed to fetch escalations" },
      { status: 500 }
    )
  }
}

// POST - support body for large requests (avoid URL length limits)
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const alertIds = body.alertIds || []

    const result = await handleBulkEscalations(alertIds)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Escalations Bulk API] Error (POST):", error)
    return NextResponse.json(
      { error: "Failed to fetch escalations" },
      { status: 500 }
    )
  }
}
